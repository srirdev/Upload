"""Append-only ledger postings. Every posting has a unique `ref`, so repeating an event never double-counts."""
import uuid
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.modules.finance.models import AuditLog, LedgerEntry, LedgerType, PlatformConfig
from app.modules.orders.models import Order
from app.modules.orders.pricing import money


def post(db: Session, type_: LedgerType, amount: Decimal, ref: str, order_id: uuid.UUID | None = None,
         batch_id: uuid.UUID | None = None, note: str | None = None) -> None:
    if db.scalar(select(LedgerEntry.id).where(LedgerEntry.ref == ref)):
        return
    db.add(LedgerEntry(ref=ref, type=type_, amount=money(Decimal(amount)), order_id=order_id, batch_id=batch_id, note=note))
    db.flush()


def record_payment(db: Session, order: Order, paid: Decimal, payment_ref: str, applied: bool) -> None:
    """Money received. `applied` is False when the payment couldn't be used (it will be refunded instead)."""
    cfg = db.get(PlatformConfig, 1)
    post(db, LedgerType.gross_revenue, paid, f"gross:{payment_ref}", order.id)
    post(db, LedgerType.gateway_fee, paid * cfg.gateway_fee_percent / 100, f"gateway:{payment_ref}", order.id,
         note="estimated from gateway_fee_percent")
    if applied and order.quotation:
        q = order.quotation
        post(db, LedgerType.printing_charges, q.printing_amount + q.binding_amount + q.cover_amount, f"printing:{order.id}", order.id)
        post(db, LedgerType.delivery_fee, q.delivery_fee, f"delivery:{order.id}", order.id)
        post(db, LedgerType.discount, q.discount, f"discount:{order.id}", order.id)


def record_shop_earning(db: Session, order: Order) -> None:
    """Recognised when the packet is handed over."""
    if order.shop_entitlement is not None:
        post(db, LedgerType.shop_entitlement, order.shop_entitlement, f"shop:{order.id}", order.id)
        post(db, LedgerType.platform_commission, order.commission_amount or 0, f"commission:{order.id}", order.id)


def audit(db: Session, actor_id: uuid.UUID | None, action: str, entity: str, entity_id: object = None,
          data: dict | None = None) -> None:
    db.add(AuditLog(actor_id=actor_id, action=action, entity=entity,
                    entity_id=str(entity_id) if entity_id is not None else None, data=data))
