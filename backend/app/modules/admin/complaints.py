"""Complaints and refunds. Refunds are decided by admins and recorded against the payment provider's reference."""
import uuid
from datetime import UTC, datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core import storage
from app.db.session import get_db
from app.modules.admin.common import admin_only
from app.modules.auth.models import User
from app.modules.delivery.models import BatchOrder, BatchOrderStatus, CustodyEvent, ShelfPhoto
from app.modules.finance import ledger
from app.modules.finance.models import LedgerType, PlatformConfig
from app.modules.notifications.models import notify
from app.modules.orders.enums import PaymentStatus
from app.modules.orders.models import Order
from app.modules.orders.pricing import money
from app.modules.payments.models import GatewayStatus, Payment, Refund, RefundStatus
from app.modules.students.models import Complaint, ComplaintStatus, StudentProfile

router = APIRouter(prefix="/admin", tags=["admin"])


def _set_status(c: Complaint, status: ComplaintStatus, admin: User) -> None:
    """Resolved/rejected complaints record who closed them and when; reopening clears that."""
    c.status = status
    closed = status in (ComplaintStatus.resolved, ComplaintStatus.rejected)
    c.resolved_by, c.resolved_at = (admin.id, datetime.now(UTC)) if closed else (None, None)


class ComplaintUpdate(BaseModel):
    status: ComplaintStatus
    admin_response: str | None = Field(default=None, max_length=2000)


class ComplaintRefundIn(BaseModel):
    amount: Decimal = Field(gt=0)
    deduct_from_shop: Decimal = Field(default=Decimal(0), ge=0)  # recovered from the shop's next payout
    note: str | None = Field(default=None, max_length=500)


class ApproveIn(BaseModel):
    amount: Decimal | None = Field(default=None, gt=0)
    deduct_from_shop: Decimal = Field(default=Decimal(0), ge=0)
    note: str | None = Field(default=None, max_length=500)


class RejectRefundIn(BaseModel):
    reason: str = Field(min_length=3, max_length=500)


class RecordIn(BaseModel):
    provider_ref: str = Field(min_length=3, max_length=80)


def _complaint(db: Session, cid: uuid.UUID) -> Complaint:
    c = db.get(Complaint, cid)
    if not c:
        raise HTTPException(404, "Complaint not found")
    return c


@router.get("/complaints")
def list_complaints(status: ComplaintStatus | None = None, _: User = Depends(admin_only), db: Session = Depends(get_db)):
    q = select(Complaint).order_by(Complaint.created_at.desc()).limit(200)
    if status:
        q = q.where(Complaint.status == status)
    out = []
    for c in db.scalars(q).all():
        o = db.get(Order, c.order_id)
        sp = db.scalar(select(StudentProfile).where(StudentProfile.user_id == c.student_id))
        out.append({"id": c.id, "order_id": o.id, "order_code": o.code, "student_name": sp.full_name if sp else None,
                    "category": c.category, "status": c.status, "created_at": c.created_at})
    return out


@router.get("/complaints/{complaint_id}")
def complaint_detail(complaint_id: uuid.UUID, _: User = Depends(admin_only), db: Session = Depends(get_db)):
    """Everything needed to compare the student's evidence with the rider's shelf photo."""
    c = _complaint(db, complaint_id)
    o = db.get(Order, c.order_id)
    sp = db.scalar(select(StudentProfile).where(StudentProfile.user_id == c.student_id))
    batch_ids = db.scalars(select(BatchOrder.batch_id).where(BatchOrder.order_id == o.id, BatchOrder.status == BatchOrderStatus.picked_up)).all()
    shelf = db.scalars(select(ShelfPhoto).where(ShelfPhoto.batch_id.in_(batch_ids)).order_by(ShelfPhoto.created_at)).all() if batch_ids else []
    refunds = db.scalars(select(Refund).where(Refund.order_id == o.id).order_by(Refund.created_at)).all()
    cfg = db.get(PlatformConfig, 1)
    return {
        "id": c.id, "category": c.category, "description": c.description, "status": c.status,
        "admin_response": c.admin_response, "created_at": c.created_at,
        "evidence_photo_urls": [storage.presign_get(a.storage_key) for a in c.attachments],
        "resolved_at": c.resolved_at,
        "shelf_photo_urls": [storage.presign_get(p.storage_key) for p in shelf],
        "order": {"id": o.id, "code": o.code, "status": o.status, "payment_status": o.payment_status,
                  "total": o.quotation.total if o.quotation else None},
        "student": {"name": sp.full_name if sp else None},
        "custody": [{"type": e.type, "at": e.created_at, "note": e.note} for e in
                    db.scalars(select(CustodyEvent).where(CustodyEvent.order_id == o.id).order_by(CustodyEvent.created_at)).all()],
        "refunds": [{"id": r.id, "amount": r.amount, "status": r.status, "reason": r.reason, "provider_ref": r.provider_ref} for r in refunds],
        "late_refund_percent": cfg.late_refund_percent,
    }


@router.patch("/complaints/{complaint_id}")
def update_complaint(complaint_id: uuid.UUID, body: ComplaintUpdate, admin: User = Depends(admin_only),
                     db: Session = Depends(get_db)):
    c = _complaint(db, complaint_id)
    if body.status == ComplaintStatus.rejected and not (body.admin_response and body.admin_response.strip()):
        raise HTTPException(422, "Explain why the complaint is rejected")
    _set_status(c, body.status, admin)
    if body.admin_response is not None:
        c.admin_response = body.admin_response.strip() or None
    o = db.get(Order, c.order_id)
    ledger.audit(db, admin.id, "complaint.update", "complaint", c.id, {"status": body.status.value})
    notify(db, c.student_id, "complaint_update", "Complaint update",
           c.admin_response or f"Your complaint about {o.code} is now {body.status.value.replace('_', ' ')}.", o.id)
    db.commit()
    return {"id": c.id, "status": c.status}


# ---- refunds ----------------------------------------------------------------------------------


def _captured_payment(db: Session, order: Order) -> Payment:
    p = db.scalar(select(Payment).where(Payment.order_id == order.id, Payment.status == GatewayStatus.captured))
    if not p:
        raise HTTPException(409, "No captured payment for this order")
    return p


def _committed(db: Session, payment: Payment, exclude: uuid.UUID | None = None) -> Decimal:
    q = select(func.coalesce(func.sum(Refund.amount), 0)).where(
        Refund.payment_id == payment.id, Refund.status.in_((RefundStatus.requested, RefundStatus.approved, RefundStatus.processed)))
    if exclude:
        q = q.where(Refund.id != exclude)
    return Decimal(db.scalar(q))


def _check_amount(db: Session, payment: Payment, amount: Decimal, deduct: Decimal, exclude: uuid.UUID | None = None) -> None:
    if money(amount) != amount:
        raise HTTPException(422, "Amount can have at most 2 decimal places")
    if _committed(db, payment, exclude) + amount > payment.amount:
        raise HTTPException(422, "Refunds cannot exceed the amount paid")
    if deduct > amount:
        raise HTTPException(422, "The shop deduction cannot exceed the refund")


@router.post("/complaints/{complaint_id}/refund", status_code=201)
def refund_from_complaint(complaint_id: uuid.UUID, body: ComplaintRefundIn, admin: User = Depends(admin_only),
                          db: Session = Depends(get_db)):
    """Approve a refund for a validated complaint (full or partial)."""
    c = _complaint(db, complaint_id)
    order = db.get(Order, c.order_id)
    payment = _captured_payment(db, order)
    _check_amount(db, payment, body.amount, body.deduct_from_shop)
    body.amount, body.deduct_from_shop = money(body.amount), money(body.deduct_from_shop)
    if body.deduct_from_shop and not order.shop_id:
        raise HTTPException(422, "This order has no shop to deduct from")
    refund = Refund(order_id=order.id, payment_id=payment.id, amount=body.amount, status=RefundStatus.approved,
                    reason=f"Complaint: {c.category.value}", complaint_id=c.id, shop_deduction=body.deduct_from_shop,
                    decided_by=admin.id, decision_note=body.note)
    db.add(refund)
    db.flush()
    _set_status(c, ComplaintStatus.resolved, admin)
    ledger.audit(db, admin.id, "refund.approve", "refund", refund.id,
                 {"amount": str(body.amount), "deduct_from_shop": str(body.deduct_from_shop), "complaint": str(c.id)})
    notify(db, order.student_id, "refund_update", "Refund approved",
           f"₹{body.amount} will be refunded for {order.code}.", order.id)
    db.commit()
    return {"id": refund.id, "status": refund.status}


@router.get("/refunds")
def list_refunds(status: RefundStatus | None = None, _: User = Depends(admin_only), db: Session = Depends(get_db)):
    q = select(Refund).order_by(Refund.created_at.desc()).limit(200)
    if status:
        q = q.where(Refund.status == status)
    out = []
    for r in db.scalars(q).all():
        o = db.get(Order, r.order_id)
        out.append({"id": r.id, "order_id": o.id, "order_code": o.code, "amount": r.amount, "status": r.status,
                    "reason": r.reason, "shop_deduction": r.shop_deduction, "provider_ref": r.provider_ref,
                    "decision_note": r.decision_note, "created_at": r.created_at})
    return out


def _refund(db: Session, rid: uuid.UUID) -> Refund:
    r = db.get(Refund, rid)
    if not r:
        raise HTTPException(404, "Refund not found")
    return r


@router.post("/refunds/{refund_id}/approve")
def approve_refund(refund_id: uuid.UUID, body: ApproveIn, admin: User = Depends(admin_only), db: Session = Depends(get_db)):
    r = _refund(db, refund_id)
    if r.status != RefundStatus.requested:
        raise HTTPException(409, f"This refund is already {r.status.value}")
    order, payment = db.get(Order, r.order_id), db.get(Payment, r.payment_id)
    amount = body.amount or r.amount
    _check_amount(db, payment, amount, body.deduct_from_shop, exclude=r.id)
    amount, body.deduct_from_shop = money(amount), money(body.deduct_from_shop)
    r.amount, r.shop_deduction, r.status, r.decided_by, r.decision_note = amount, body.deduct_from_shop, RefundStatus.approved, admin.id, body.note
    ledger.audit(db, admin.id, "refund.approve", "refund", r.id, {"amount": str(amount)})
    notify(db, order.student_id, "refund_update", "Refund approved", f"₹{amount} will be refunded for {order.code}.", order.id)
    db.commit()
    return {"id": r.id, "status": r.status}


@router.post("/refunds/{refund_id}/reject")
def reject_refund(refund_id: uuid.UUID, body: RejectRefundIn, admin: User = Depends(admin_only), db: Session = Depends(get_db)):
    r = _refund(db, refund_id)
    if r.status != RefundStatus.requested:
        raise HTTPException(409, f"This refund is already {r.status.value}")
    order = db.get(Order, r.order_id)
    r.status, r.decided_by, r.decision_note = RefundStatus.rejected, admin.id, body.reason
    others = db.scalar(select(func.count()).select_from(Refund).where(
        Refund.order_id == order.id, Refund.id != r.id, Refund.status.in_((RefundStatus.requested, RefundStatus.approved))))
    if order.payment_status == PaymentStatus.refund_pending and not others:
        order.payment_status = PaymentStatus.paid
    ledger.audit(db, admin.id, "refund.reject", "refund", r.id, {"reason": body.reason})
    notify(db, order.student_id, "refund_update", "Refund not approved", body.reason, order.id)
    db.commit()
    return {"id": r.id, "status": r.status}


@router.post("/refunds/{refund_id}/record")
def record_refund(refund_id: uuid.UUID, body: RecordIn, admin: User = Depends(admin_only), db: Session = Depends(get_db)):
    """Record the payment provider's reference once the money has actually been sent back."""
    r = _refund(db, refund_id)
    if r.status != RefundStatus.approved:
        raise HTTPException(409, "Only approved refunds can be marked as paid")
    order, payment = db.get(Order, r.order_id), db.get(Payment, r.payment_id)
    r.status, r.provider_ref = RefundStatus.processed, body.provider_ref.strip()
    ledger.post(db, LedgerType.refund, r.amount, f"refund:{r.id}", order.id)
    if r.shop_deduction:
        ledger.post(db, LedgerType.shop_refund_recovery, r.shop_deduction, f"recovery:{r.id}", order.id)
    processed = db.scalar(select(func.coalesce(func.sum(Refund.amount), 0)).where(
        Refund.payment_id == payment.id, Refund.status == RefundStatus.processed))
    if processed >= payment.amount:
        order.payment_status = PaymentStatus.refunded
    elif order.payment_status == PaymentStatus.refund_pending:
        order.payment_status = PaymentStatus.paid
    ledger.audit(db, admin.id, "refund.record", "refund", r.id, {"provider_ref": r.provider_ref})
    notify(db, order.student_id, "refund_update", "Refund sent", f"₹{r.amount} for {order.code} has been refunded (ref {r.provider_ref}).", order.id)
    db.commit()
    return {"id": r.id, "status": r.status, "provider_ref": r.provider_ref}
