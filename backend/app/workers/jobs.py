"""Scheduled and background jobs. Plain functions on a DB session so they are testable and runnable without Redis.

Run by the ARQ worker on a schedule (app/workers/settings.py), or once by hand:
    python -m app.workers.run <job name>
Every job is idempotent: running it twice (or catching up after downtime) never duplicates work.
"""
import logging
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import storage
from app.core.config import get_settings
from app.core.security import aware
from app.modules.admin import settlements
from app.modules.auth.models import Role, User
from app.modules.colleges.models import CollegeSlot
from app.modules.delivery import service as delivery
from app.modules.delivery.models import BatchStatus, CustodyEvent, DeliveryBatch
from app.modules.finance.models import PlatformConfig
from app.modules.notifications.models import Notification, notify
from app.modules.orders import conversion
from app.modules.orders import slots as slot_utils
from app.modules.orders.enums import ConversionStatus, OrderStatus, PaymentStatus
from app.modules.orders.models import Order, OrderDocument, PrintRule
from app.modules.orders.service import set_status
from app.modules.orders.enums import ColorMode, Sided

log = logging.getLogger(__name__)
UNASSIGNED_ALERT_MINUTES = 15


def _admins(db: Session) -> list[User]:
    return list(db.scalars(select(User).where(User.role == Role.admin, User.is_active.is_(True))).all())


def _notified(db: Session, kind: str, order_id=None, title: str | None = None) -> bool:
    q = select(Notification.id).where(Notification.kind == kind)
    q = q.where(Notification.order_id == order_id) if order_id else q.where(Notification.title == title)
    return db.scalar(q.limit(1)) is not None


# ---- checkout & slots -------------------------------------------------------------------------


def release_expired_checkouts(db: Session, now: datetime | None = None) -> int:
    """Unpaid checkouts past the slot-hold window go back to draft, releasing the slot. A payment that still
    arrives later is refunded automatically (payments.mark_paid)."""
    now = now or datetime.now(UTC)
    hold = timedelta(minutes=db.get(PlatformConfig, 1).slot_hold_minutes)
    expired = [o for o in db.scalars(select(Order).where(Order.status == OrderStatus.awaiting_payment)).all()
               if o.checkout_at and aware(o.checkout_at) < now - hold]
    for o in expired:
        if o.quotation:
            db.delete(o.quotation)
            o.quotation = None
        o.payment_status, o.checkout_at = PaymentStatus.unpaid, None
        set_status(db, o, OrderStatus.draft, note="checkout expired; slot released")
    db.commit()
    return len(expired)


def process_slot_cutoffs(db: Session, now: datetime | None = None) -> dict:
    """After a slot's cut-off: retry rider offers for batches nobody took (riders may have come online) and alert
    admins about anything still unassigned. Also alerts on paid orders no shop has taken."""
    now = now or datetime.now(UTC)
    today = now.astimezone(slot_utils.IST).date()
    reoffered = alerts = 0
    for b in db.scalars(select(DeliveryBatch).where(DeliveryBatch.status == BatchStatus.unassigned,
                                                    DeliveryBatch.slot_date <= today)).all():
        slot = db.get(CollegeSlot, b.slot_id)
        cutoff = slot_utils.slot_view(db, slot, b.slot_date, now)["cutoff_at"]
        if now < cutoff:
            continue
        if delivery.offer_batch(db, b):
            reoffered += 1
            continue
        title = f"No rider for run {b.code}"
        if not _notified(db, "unassigned_batch", title=title):
            for a in _admins(db):
                notify(db, a.id, "unassigned_batch", title, "Assign a backup rider in Live Operations.")
            alerts += 1
    stale = now - timedelta(minutes=UNASSIGNED_ALERT_MINUTES)
    for o in db.scalars(select(Order).where(Order.status == OrderStatus.placed, Order.shop_id.is_(None))).all():
        placed_at = next((aware(e.created_at) for e in o.events if e.to_status == OrderStatus.placed), None)
        if placed_at and placed_at < stale and not _notified(db, "unassigned_order", order_id=o.id):
            for a in _admins(db):
                notify(db, a.id, "unassigned_order", f"No shop has taken {o.code}",
                       "Assign a shop in Orders & Complaints.", o.id)
            alerts += 1
    db.commit()
    return {"reoffered": reoffered, "alerts": alerts}


# ---- students ---------------------------------------------------------------------------------


def collection_reminders(db: Session, now: datetime | None = None) -> int:
    """One reminder per packet left at the security cabin and not collected after a few hours."""
    now = now or datetime.now(UTC)
    after = timedelta(hours=get_settings().collection_reminder_hours)
    sent = 0
    for o in db.scalars(select(Order).where(Order.status == OrderStatus.delivered)).all():
        delivered_at = db.scalar(select(CustodyEvent.created_at).where(CustodyEvent.order_id == o.id,
                                                                     CustodyEvent.type == "delivered")
                                 .order_by(CustodyEvent.created_at.desc()).limit(1))
        if delivered_at and aware(delivered_at) < now - after and not _notified(db, "collection_reminder", order_id=o.id):
            notify(db, o.student_id, "collection_reminder", f"{o.code} is waiting at the security cabin",
                   "Collect your packet and tap “I have collected it”.", o.id)
            sent += 1
    db.commit()
    return sent


def cleanup_abandoned_drafts(db: Session, now: datetime | None = None) -> int:
    """Never-paid drafts older than DRAFT_RETENTION_DAYS are cancelled and their uploaded files deleted
    (students' documents are not kept longer than needed). Paid orders are never touched."""
    now = now or datetime.now(UTC)
    cutoff = now - timedelta(days=get_settings().draft_retention_days)
    drafts = [o for o in db.scalars(select(Order).where(Order.status == OrderStatus.draft,
                                                        Order.payment_status == PaymentStatus.unpaid)).all()
              if aware(o.created_at) < cutoff]
    keys = []
    for o in drafts:
        for d in list(o.documents):
            keys += [k for k in (d.storage_key, d.preview_key) if k]
            o.documents.remove(d)
        set_status(db, o, OrderStatus.cancelled, note=f"draft unused for {get_settings().draft_retention_days} days")
    db.commit()
    for key in keys:  # after commit: a failed delete leaves a harmless orphan, never a dangling row
        try:
            storage.delete_object(key)
        except Exception:
            log.warning("could not delete %s", key)
    return len(drafts)


# ---- settlements ------------------------------------------------------------------------------


def settlement_periods(today: date) -> tuple[tuple[date, date], list[tuple[date, date]]]:
    """Most recent completed periods: shops weekly (Mon–Sun); riders twice weekly (Mon–Wed, Thu–Sun)."""
    monday = today - timedelta(days=today.weekday())
    shop = (monday - timedelta(days=7), monday - timedelta(days=1))
    riders = [(monday - timedelta(days=7), monday - timedelta(days=5)), (monday - timedelta(days=4), monday - timedelta(days=1))]
    if today.weekday() >= 3:  # this week's Mon–Wed is complete from Thursday
        riders.append((monday, monday + timedelta(days=2)))
    return shop, riders


def prepare_settlements(db: Session, today: date | None = None) -> dict:
    """Creates pending payout records for completed periods so admins only review and pay them.
    Generation is idempotent (unique per party + period; orders/batches settle once)."""
    today = today or datetime.now(UTC).astimezone(slot_utils.IST).date()
    shop_period, rider_periods = settlement_periods(today)
    shops = settlements.generate_shop(db, *shop_period, None)
    riders = [settlements.generate_riders(db, start, end, None) for start, end in rider_periods]
    return {"shop_settlements": len(shops["created"]), "rider_settlements": sum(len(r["created"]) for r in riders)}


# ---- documents --------------------------------------------------------------------------------


def convert_pending_documents(db: Session, limit: int = 20) -> dict:
    """DOCX/PPTX -> PDF preview + exact page count. While the order is still a draft the exact count replaces the
    estimate (resetting print rules only if they no longer fit); once checkout has started nothing priced changes."""
    try:
        conversion.soffice()
    except conversion.ConversionUnavailable as e:
        log.info("skipping conversions: %s", e)
        return {"converted": 0, "failed": 0, "skipped": "LibreOffice not available"}
    done = failed = 0
    for d in db.scalars(select(OrderDocument).where(OrderDocument.conversion_status == ConversionStatus.pending)
                        .limit(limit)).all():
        try:
            pdf, pages = conversion.to_pdf(d.filename, storage.get_object(d.storage_key))
        except Exception as e:  # corrupt or unsupported content: the student confirms pages manually
            log.warning("conversion of %s failed: %s", d.id, e)
            d.conversion_status = ConversionStatus.failed
            failed += 1
            db.commit()
            continue
        key = f"previews/{d.id}.pdf"
        storage.put_object(key, pdf, "application/pdf")
        d.preview_key, d.conversion_status = key, ConversionStatus.done
        order = db.get(Order, d.order_id)
        if order.status == OrderStatus.draft and d.page_count != pages:
            d.page_count, d.page_count_auto = pages, True
            if not d.rules or max(r.page_to for r in d.rules) != pages:
                d.rules.clear()
                d.rules.append(PrintRule(page_from=1, page_to=pages, color=ColorMode.bw, gsm=80, sided=Sided.single))
        db.commit()
        done += 1
    return {"converted": done, "failed": failed}


JOBS = {
    "release_expired_checkouts": release_expired_checkouts,
    "process_slot_cutoffs": process_slot_cutoffs,
    "collection_reminders": collection_reminders,
    "cleanup_abandoned_drafts": cleanup_abandoned_drafts,
    "prepare_settlements": prepare_settlements,
    "convert_pending_documents": convert_pending_documents,
}
