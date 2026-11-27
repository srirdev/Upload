"""Live operations and order search for admins."""
import uuid
from datetime import UTC, datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core import storage
from app.db.session import get_db
from app.modules.admin.common import admin_only
from app.modules.auth.models import User
from app.modules.colleges.models import College, CollegeSlot
from app.modules.delivery.models import (
    ACTIVE_BATCH, BatchOrder, BatchOrderStatus, BatchStatus, CustodyEvent, DeliveryBatch, ShelfPhoto,
)
from app.modules.finance.models import LedgerEntry, LedgerType
from app.modules.orders import service as orders
from app.modules.orders import slots as slot_utils
from app.modules.orders.enums import OrderStatus
from app.modules.orders.pricing import money
from app.modules.orders.models import Order, OrderEvent
from app.modules.payments.models import Payment, Refund
from app.modules.riders.models import RiderProfile
from app.modules.shops.models import ShopProfile
from app.modules.students.models import Complaint, StudentProfile

router = APIRouter(prefix="/admin", tags=["admin"])

LIVE = (OrderStatus.placed, OrderStatus.printing, OrderStatus.packing, OrderStatus.handover_verified,
        OrderStatus.out_for_delivery, OrderStatus.delivered)
COSTS = (LedgerType.shop_entitlement, LedgerType.rider_payout, LedgerType.gateway_fee, LedgerType.refund)


def ledger_totals(db: Session, since: datetime | None = None, until: datetime | None = None) -> dict[str, Decimal]:
    q = select(LedgerEntry.type, func.coalesce(func.sum(LedgerEntry.amount), 0)).group_by(LedgerEntry.type)
    if since:
        q = q.where(LedgerEntry.created_at >= since)
    if until:
        q = q.where(LedgerEntry.created_at < until)
    totals = {t.value: money(Decimal(0)) for t in LedgerType}
    for t, amount in db.execute(q).all():
        totals[t.value] = money(Decimal(str(amount)))
    totals["net_platform_margin"] = money(
        totals["gross_revenue"] - totals["shop_entitlement"] - totals["rider_payout"] - totals["gateway_fee"]
        - totals["refund"] + totals["shop_refund_recovery"]
    )
    return totals


def today_start() -> datetime:
    return datetime.now(UTC).astimezone(slot_utils.IST).replace(hour=0, minute=0, second=0, microsecond=0)


@router.get("/ops/summary")
def summary(_: User = Depends(admin_only), db: Session = Depends(get_db)):
    start = today_start()
    events_today = lambda t: db.scalar(select(func.count()).select_from(OrderEvent).where(  # noqa: E731
        OrderEvent.type == t, OrderEvent.created_at >= start))
    return {
        "orders_today": events_today("placed"),
        "active_batches": db.scalar(select(func.count()).select_from(DeliveryBatch).where(
            DeliveryBatch.status.in_((BatchStatus.unassigned, *ACTIVE_BATCH)))),
        "pending_pickups": db.scalar(select(func.count()).select_from(BatchOrder).join(
            DeliveryBatch, DeliveryBatch.id == BatchOrder.batch_id).where(
            BatchOrder.status == BatchOrderStatus.pending, DeliveryBatch.status.in_((BatchStatus.offered, BatchStatus.accepted)))),
        "completed_deliveries": events_today("delivered"),
        "net_margin_today": ledger_totals(db, since=start)["net_platform_margin"],
        "net_margin_total": ledger_totals(db)["net_platform_margin"],
        # things that need a human
        "unassigned_orders": db.scalar(select(func.count()).select_from(Order).where(
            Order.status == OrderStatus.placed, Order.shop_id.is_(None))),
        "unassigned_batches": db.scalar(select(func.count()).select_from(DeliveryBatch).where(
            DeliveryBatch.status == BatchStatus.unassigned)),
        "open_complaints": db.scalar(select(func.count()).select_from(Complaint).where(Complaint.status.in_(("open", "in_review")))),
        "refunds_to_review": db.scalar(select(func.count()).select_from(Refund).where(Refund.status == "requested")),
    }


def _stage(order: Order, has_rider: bool) -> str:
    return {
        OrderStatus.placed: "awaiting_shop", OrderStatus.printing: "production", OrderStatus.packing: "production",
        OrderStatus.handover_verified: "pickup", OrderStatus.out_for_delivery: "in_transit",
        OrderStatus.delivered: "at_cabin",
    }.get(order.status, order.status.value)


@router.get("/ops/custody")
def custody(_: User = Depends(admin_only), db: Session = Depends(get_db)):
    """Every in-flight order with who currently holds it."""
    now = datetime.now(UTC)
    rows = db.scalars(select(Order).where(Order.status.in_(LIVE)).order_by(Order.slot_date, Order.created_at).limit(300)).all()
    out = []
    for o in rows:
        shop = db.get(ShopProfile, o.shop_id) if o.shop_id else None
        bo = db.scalar(select(BatchOrder).where(BatchOrder.order_id == o.id, BatchOrder.status.in_(
            (BatchOrderStatus.pending, BatchOrderStatus.picked_up))).order_by(BatchOrder.id.desc()))
        batch = db.get(DeliveryBatch, bo.batch_id) if bo else None
        rider = db.get(RiderProfile, batch.rider_id) if batch and batch.rider_id else None
        slot = db.get(CollegeSlot, o.slot_id) if o.slot_id else None
        delivery_at = slot_utils.slot_view(db, slot, o.slot_date, now)["delivery_at"] if slot else None
        out.append({
            "order_id": o.id, "code": o.code, "status": o.status, "stage": _stage(o, bool(rider)),
            "college": db.get(College, o.college_id).name, "shop": shop.shop_name if shop else None,
            "rider": rider.full_name if rider else None, "batch_id": batch.id if batch else None,
            "batch_code": batch.code if batch else None, "batch_mode": batch.mode if batch else None,
            "batch_status": batch.status if batch else None, "delivery_at": delivery_at, "packed": o.packed_at is not None,
            "needs_attention": bool((o.status == OrderStatus.placed and o.shop_id is None)
                                    or (delivery_at and delivery_at < now and o.status != OrderStatus.delivered)),
            "shelf_photo_url": orders.shelf_photo_url(db, o),
        })
    return out


@router.get("/orders")
def search_orders(q: str | None = None, college_id: uuid.UUID | None = None, shop_id: uuid.UUID | None = None,
                  slot_id: uuid.UUID | None = None, status: OrderStatus | None = None,
                  limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0),
                  _: User = Depends(admin_only), db: Session = Depends(get_db)):
    query = (select(Order, StudentProfile.full_name, User.mobile)
             .join(User, User.id == Order.student_id).outerjoin(StudentProfile, StudentProfile.user_id == Order.student_id)
             .where(Order.status != OrderStatus.draft).order_by(Order.created_at.desc()))
    if q and q.strip():
        like = f"%{q.strip()}%"
        query = query.where(or_(Order.code.ilike(like), User.mobile.like(like), StudentProfile.full_name.ilike(like),
                                StudentProfile.register_number.ilike(like)))
    for col, val in ((Order.college_id, college_id), (Order.shop_id, shop_id), (Order.slot_id, slot_id), (Order.status, status)):
        if val is not None:
            query = query.where(col == val)
    out = []
    for o, name, mobile in db.execute(query.limit(limit).offset(offset)).all():
        shop = db.get(ShopProfile, o.shop_id) if o.shop_id else None
        out.append({"id": o.id, "code": o.code, "status": o.status, "payment_status": o.payment_status,
                    "student_name": name, "student_mobile": mobile, "college": db.get(College, o.college_id).name,
                    "shop": shop.shop_name if shop else None, "slot_date": o.slot_date, "created_at": o.created_at,
                    "total": o.quotation.total if o.quotation else None})
    return out


@router.get("/orders/{order_id}")
def order_detail(order_id: uuid.UUID, _: User = Depends(admin_only), db: Session = Depends(get_db)):
    o = db.get(Order, order_id)
    if not o:
        raise HTTPException(404, "Order not found")
    student = db.scalar(select(StudentProfile).where(StudentProfile.user_id == o.student_id))
    user = db.get(User, o.student_id)
    shop = db.get(ShopProfile, o.shop_id) if o.shop_id else None
    d = orders.detail(db, o)
    return {
        **{k: d[k] for k in ("id", "code", "status", "payment_status", "created_at", "binding", "cover_page",
                             "subject_name", "subject_code", "cover_template", "cover_color", "cover_title",
                             "coupon_code", "quotation", "shelf_photo_url")},
        "college": d["college"].name,
        "slot": d["slot"], "student": {"name": student.full_name if student else None, "mobile": user.mobile,
                                       "register_number": student.register_number if student else None,
                                       "department": student.department if student else None},
        "shop": {"id": shop.id, "name": shop.shop_name} if shop else None,
        "commission_amount": o.commission_amount, "shop_entitlement": o.shop_entitlement,
        "documents": [{"filename": x.filename, "page_count": x.page_count, "copies": x.copies, "paper_size": x.paper_size,
                       "orientation": x.orientation,
                       "rules": [{"page_from": r.page_from, "page_to": r.page_to, "color": r.color, "gsm": r.gsm, "sided": r.sided}
                                 for r in x.rules]} for x in o.documents],
        "payments": [{"id": p.id, "provider_order_id": p.provider_order_id, "provider_payment_id": p.provider_payment_id,
                      "amount": p.amount, "status": p.status, "is_current": p.is_current}
                     for p in db.scalars(select(Payment).where(Payment.order_id == o.id).order_by(Payment.created_at)).all()],
        "refunds": [{"id": r.id, "amount": r.amount, "status": r.status, "reason": r.reason, "provider_ref": r.provider_ref}
                    for r in db.scalars(select(Refund).where(Refund.order_id == o.id)).all()],
        "complaints": [{"id": c.id, "category": c.category, "status": c.status} for c in
                       db.scalars(select(Complaint).where(Complaint.order_id == o.id)).all()],
        "events": [{"type": e.type, "note": e.note, "at": e.created_at} for e in o.events],
        "custody": [{"type": c.type, "note": c.note, "at": c.created_at, "batch_id": c.batch_id} for c in
                    db.scalars(select(CustodyEvent).where(CustodyEvent.order_id == o.id).order_by(CustodyEvent.created_at)).all()],
    }


@router.get("/batches")
def list_batches(status: BatchStatus | None = None, _: User = Depends(admin_only), db: Session = Depends(get_db)):
    q = select(DeliveryBatch).order_by(DeliveryBatch.created_at.desc()).limit(100)
    if status:
        q = q.where(DeliveryBatch.status == status)
    out = []
    for b in db.scalars(q).all():
        rider = db.get(RiderProfile, b.rider_id) if b.rider_id else None
        n = db.scalar(select(func.count()).select_from(BatchOrder).where(BatchOrder.batch_id == b.id, BatchOrder.status != BatchOrderStatus.removed))
        photo = db.scalar(select(ShelfPhoto).where(ShelfPhoto.batch_id == b.id).order_by(ShelfPhoto.created_at.desc()))
        out.append({"id": b.id, "code": b.code, "mode": b.mode, "status": b.status, "college": db.get(College, b.college_id).name,
                    "slot_date": b.slot_date, "rider": rider.full_name if rider else None, "rider_id": b.rider_id,
                    "packets": n, "payout_total": b.payout_total,
                    "shelf_photo_url": storage.presign_get(photo.storage_key) if photo else None})
    return out
