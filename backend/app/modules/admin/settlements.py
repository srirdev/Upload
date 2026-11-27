"""Weekly shop settlements and twice-weekly rider settlements, with payout CSV export."""
import csv
import io
import uuid
from datetime import date, datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.modules.admin.common import admin_only
from app.modules.auth.models import User
from app.modules.delivery.models import DeliveryBatch
from app.modules.finance.ledger import audit
from app.modules.orders import slots as slot_utils
from app.modules.orders.enums import OrderStatus
from app.modules.orders.models import Order, OrderEvent
from app.modules.payments.models import Refund, RefundStatus
from app.modules.riders.models import RiderProfile, RiderSettlement, RiderSettlementStatus
from app.modules.shops.models import Settlement, SettlementStatus, ShopProfile
from app.modules.shops.service import EARNING

router = APIRouter(prefix="/admin/settlements", tags=["admin"])


class PeriodIn(BaseModel):
    period_start: date
    period_end: date

    @model_validator(mode="after")
    def ordered(self):
        if self.period_end < self.period_start:
            raise ValueError("period_end must not be before period_start")
        return self


class PayIn(BaseModel):
    upi_reference: str = Field(min_length=4, max_length=80)


def _end_of_day(d: date) -> datetime:
    from datetime import time, timedelta

    return datetime.combine(d + timedelta(days=1), time.min, tzinfo=slot_utils.IST)


def _csv_safe(v: object) -> str:
    """Neutralise spreadsheet formula injection in user-supplied text."""
    s = "" if v is None else str(v)
    return "'" + s if s[:1] in ("=", "+", "-", "@", "\t", "\r") else s


def _csv(rows: list[list], header: list[str], filename: str) -> Response:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(header)
    for r in rows:
        w.writerow([_csv_safe(c) for c in r])
    return Response(buf.getvalue(), media_type="text/csv",
                    headers={"Content-Disposition": f'attachment; filename="{filename}"'})


# ---- shops ------------------------------------------------------------------------------------


@router.post("/shops/generate", status_code=201)
def generate_shop_settlements(body: PeriodIn, admin: User = Depends(admin_only), db: Session = Depends(get_db)):
    return generate_shop(db, body.period_start, body.period_end, admin.id)


def generate_shop(db: Session, period_start: date, period_end: date, actor_id: uuid.UUID | None) -> dict:
    """Settle every completed, not-yet-settled order handed over before the end of the period.

    Each order can only ever be in one settlement (`settlement_id`), and (shop, period) is unique,
    so running this twice never produces a duplicate payout. actor_id None = the scheduled job."""
    cutoff = _end_of_day(period_end)
    handed = (select(OrderEvent.order_id).where(OrderEvent.type == OrderStatus.handover_verified.value,
                                                OrderEvent.created_at < cutoff))
    unsettled = db.scalars(select(Order).where(Order.shop_id.is_not(None), Order.status.in_(EARNING),
                                               Order.settlement_id.is_(None), Order.id.in_(handed))).all()
    by_shop: dict[uuid.UUID, list[Order]] = {}
    for o in unsettled:
        by_shop.setdefault(o.shop_id, []).append(o)
    created, skipped = [], []
    for shop_id, orders in by_shop.items():
        if db.scalar(select(Settlement.id).where(Settlement.shop_id == shop_id, Settlement.period_start == period_start,
                                                 Settlement.period_end == period_end)):
            skipped.append(str(shop_id))
            continue
        gross = sum((o.shop_entitlement for o in orders), Decimal(0))
        s = Settlement(shop_id=shop_id, period_start=period_start, period_end=period_end, order_count=len(orders),
                       gross_amount=gross, refund_deductions=Decimal(0), net_amount=gross)
        db.add(s)
        db.flush()
        for o in orders:
            o.settlement_id = s.id
        # deductions for validated defects, never taking the payout below zero (remainder carries forward)
        pending = db.scalars(select(Refund).join(Order, Order.id == Refund.order_id).where(
            Order.shop_id == shop_id, Refund.shop_deduction > 0, Refund.shop_settlement_id.is_(None),
            Refund.status.in_((RefundStatus.approved, RefundStatus.processed))).order_by(Refund.created_at)).all()
        deducted = Decimal(0)
        for r in pending:
            if deducted + r.shop_deduction <= gross:
                deducted += r.shop_deduction
                r.shop_settlement_id = s.id
        s.refund_deductions, s.net_amount = deducted, gross - deducted
        audit(db, actor_id, "settlement.generate", "shop_settlement", s.id, {"net": str(s.net_amount), "orders": len(orders)})
        created.append(str(s.id))
    db.commit()
    return {"created": created, "skipped_existing": skipped}


def _shop_row(db: Session, s: Settlement) -> dict:
    shop = db.get(ShopProfile, s.shop_id)
    return {"id": s.id, "shop_id": s.shop_id, "shop_name": shop.shop_name, "period_start": s.period_start,
            "period_end": s.period_end, "order_count": s.order_count, "gross_amount": s.gross_amount,
            "refund_deductions": s.refund_deductions, "net_amount": s.net_amount, "status": s.status,
            "upi_reference": s.upi_reference, "payout_to": shop.upi_id or f"{shop.bank_account_number} / {shop.bank_ifsc}"}


@router.get("/shops")
def list_shop_settlements(status: SettlementStatus | None = None, _: User = Depends(admin_only), db: Session = Depends(get_db)):
    q = select(Settlement).order_by(Settlement.period_start.desc(), Settlement.created_at.desc()).limit(200)
    if status:
        q = q.where(Settlement.status == status)
    return [_shop_row(db, s) for s in db.scalars(q).all()]


@router.post("/shops/{settlement_id}/pay")
def pay_shop_settlement(settlement_id: uuid.UUID, body: PayIn, admin: User = Depends(admin_only), db: Session = Depends(get_db)):
    s = db.get(Settlement, settlement_id)
    if not s:
        raise HTTPException(404, "Settlement not found")
    if s.status == SettlementStatus.paid:
        raise HTTPException(409, "This settlement has already been paid")
    s.status, s.upi_reference, s.paid_at = SettlementStatus.paid, body.upi_reference.strip(), datetime.now(slot_utils.IST)
    audit(db, admin.id, "settlement.pay", "shop_settlement", s.id, {"reference": s.upi_reference, "net": str(s.net_amount)})
    db.commit()
    return _shop_row(db, s)


@router.get("/shops/export.csv")
def export_shop_payouts(status: SettlementStatus = Query(SettlementStatus.pending), _: User = Depends(admin_only),
                        db: Session = Depends(get_db)):
    rows = [_shop_row(db, s) for s in db.scalars(select(Settlement).where(Settlement.status == status)
                                                 .order_by(Settlement.period_start)).all()]
    return _csv([[r["id"], r["shop_name"], r["payout_to"], r["period_start"], r["period_end"], r["order_count"],
                  r["gross_amount"], r["refund_deductions"], r["net_amount"]] for r in rows],
                ["settlement_id", "shop", "payout_to", "period_start", "period_end", "orders", "entitlement",
                 "refund_deductions", "net_payable"], f"shop-payouts-{status.value}.csv")


# ---- riders -----------------------------------------------------------------------------------


@router.post("/riders/generate", status_code=201)
def generate_rider_settlements(body: PeriodIn, admin: User = Depends(admin_only), db: Session = Depends(get_db)):
    return generate_riders(db, body.period_start, body.period_end, admin.id)


def generate_riders(db: Session, period_start: date, period_end: date, actor_id: uuid.UUID | None) -> dict:
    """Twice-weekly rider payouts; same never-twice guarantees as shops. actor_id None = the scheduled job."""
    cutoff = _end_of_day(period_end)
    batches = db.scalars(select(DeliveryBatch).where(
        DeliveryBatch.rider_id.is_not(None), DeliveryBatch.payout_total.is_not(None),
        DeliveryBatch.settlement_id.is_(None), DeliveryBatch.completed_at < cutoff)).all()
    by_rider: dict[uuid.UUID, list[DeliveryBatch]] = {}
    for b in batches:
        by_rider.setdefault(b.rider_id, []).append(b)
    created, skipped = [], []
    for rider_id, rows in by_rider.items():
        if db.scalar(select(RiderSettlement.id).where(
                RiderSettlement.rider_id == rider_id, RiderSettlement.period_start == period_start,
                RiderSettlement.period_end == period_end)):
            skipped.append(str(rider_id))
            continue
        s = RiderSettlement(rider_id=rider_id, period_start=period_start, period_end=period_end,
                            batch_count=len(rows), amount=sum((b.payout_total for b in rows), Decimal(0)))
        db.add(s)
        db.flush()
        for b in rows:
            b.settlement_id = s.id
        audit(db, actor_id, "settlement.generate", "rider_settlement", s.id, {"amount": str(s.amount), "runs": len(rows)})
        created.append(str(s.id))
    db.commit()
    return {"created": created, "skipped_existing": skipped}


def _rider_row(db: Session, s: RiderSettlement) -> dict:
    r = db.get(RiderProfile, s.rider_id)
    return {"id": s.id, "rider_id": s.rider_id, "rider_name": r.full_name, "period_start": s.period_start,
            "period_end": s.period_end, "batch_count": s.batch_count, "amount": s.amount, "status": s.status,
            "upi_reference": s.upi_reference, "payout_to": r.upi_id}


@router.get("/riders")
def list_rider_settlements(status: RiderSettlementStatus | None = None, _: User = Depends(admin_only), db: Session = Depends(get_db)):
    q = select(RiderSettlement).order_by(RiderSettlement.period_start.desc(), RiderSettlement.created_at.desc()).limit(200)
    if status:
        q = q.where(RiderSettlement.status == status)
    return [_rider_row(db, s) for s in db.scalars(q).all()]


@router.post("/riders/{settlement_id}/pay")
def pay_rider_settlement(settlement_id: uuid.UUID, body: PayIn, admin: User = Depends(admin_only), db: Session = Depends(get_db)):
    s = db.get(RiderSettlement, settlement_id)
    if not s:
        raise HTTPException(404, "Settlement not found")
    if s.status == RiderSettlementStatus.paid:
        raise HTTPException(409, "This settlement has already been paid")
    s.status, s.upi_reference, s.paid_at = RiderSettlementStatus.paid, body.upi_reference.strip(), datetime.now(slot_utils.IST)
    audit(db, admin.id, "settlement.pay", "rider_settlement", s.id, {"reference": s.upi_reference, "amount": str(s.amount)})
    db.commit()
    return _rider_row(db, s)


@router.get("/riders/export.csv")
def export_rider_payouts(status: RiderSettlementStatus = Query(RiderSettlementStatus.pending), _: User = Depends(admin_only),
                         db: Session = Depends(get_db)):
    rows = [_rider_row(db, s) for s in db.scalars(select(RiderSettlement).where(RiderSettlement.status == status)
                                                  .order_by(RiderSettlement.period_start)).all()]
    return _csv([[r["id"], r["rider_name"], r["payout_to"], r["period_start"], r["period_end"], r["batch_count"], r["amount"]]
                 for r in rows],
                ["settlement_id", "rider", "payout_to", "period_start", "period_end", "runs", "amount"],
                f"rider-payouts-{status.value}.csv")
