"""Delivery-slot availability. Slots are recurring daily; an order books a (slot, date)."""
import uuid
from datetime import UTC, date, datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.modules.colleges.models import CollegeSlot
from app.modules.finance.models import PlatformConfig
from app.modules.orders.enums import OrderStatus
from app.modules.orders.models import Order

IST = timezone(timedelta(hours=5, minutes=30))  # India has no DST
NOT_COUNTED = (OrderStatus.draft, OrderStatus.cancelled, OrderStatus.rejected)


def booked_count(db: Session, slot_id: uuid.UUID, d: date, now: datetime) -> int:
    hold = db.get(PlatformConfig, 1).slot_hold_minutes
    q = select(func.count()).select_from(Order).where(
        Order.slot_id == slot_id, Order.slot_date == d, Order.status.not_in(NOT_COUNTED)
    )
    # unpaid checkouts only hold the slot for a limited time
    q = q.where(
        (Order.status != OrderStatus.awaiting_payment) | (Order.checkout_at > now - timedelta(minutes=hold))
    )
    return db.scalar(q)


def slot_view(db: Session, slot: CollegeSlot, d: date, now: datetime) -> dict:
    delivery_at = datetime.combine(d, slot.delivery_time, tzinfo=IST)
    cutoff_at = delivery_at - timedelta(minutes=slot.cutoff_minutes)
    remaining = max(slot.capacity - booked_count(db, slot.id, d, now), 0)
    return {
        "slot_id": slot.id,
        "label": slot.label,
        "date": d,
        "delivery_at": delivery_at,
        "cutoff_at": cutoff_at,
        "remaining": remaining,
        "is_open": now < cutoff_at and remaining > 0,
    }


def list_slots(db: Session, college_id: uuid.UUID, days: int = 3) -> list[dict]:
    now = datetime.now(UTC)
    today = now.astimezone(IST).date()
    slots = db.scalars(
        select(CollegeSlot).where(CollegeSlot.college_id == college_id, CollegeSlot.active.is_(True))
        .order_by(CollegeSlot.delivery_time)
    ).all()
    views = [slot_view(db, s, today + timedelta(days=i), now) for i in range(days) for s in slots]
    return sorted(views, key=lambda v: v["delivery_at"])


def require_open_slot(db: Session, college_id: uuid.UUID, slot_id: uuid.UUID, d: date) -> CollegeSlot:
    slot = db.get(CollegeSlot, slot_id)
    if not slot or slot.college_id != college_id or not slot.active:
        raise HTTPException(422, "Choose a delivery slot for your college")
    view = slot_view(db, slot, d, datetime.now(UTC))
    if not view["is_open"]:
        raise HTTPException(409, "This delivery slot is no longer available. Pick another slot.")
    return slot
