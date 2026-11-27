"""Scheduled jobs (app/workers/jobs.py): effects and idempotency (running twice never duplicates work)."""
import io
import uuid
import zipfile
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import select

from app.modules.delivery.models import CustodyEvent
from app.modules.notifications.models import Notification
from app.modules.orders import conversion
from app.modules.orders.enums import ConversionStatus, OrderStatus, PaymentStatus
from app.modules.orders.models import Order, OrderEvent
from app.modules.riders.models import RiderSettlement
from app.modules.shops.models import Settlement
from app.workers import jobs
from tests.helpers import API, build_order, pay, placed_order
from tests.test_admin import deliver_fully
from tests.test_orders import make_pdf, sign

NOW = datetime.now(UTC)


def order(db, oid):
    o = db.get(Order, uuid.UUID(oid))
    db.refresh(o)
    return o


def test_expired_checkout_goes_back_to_draft_and_a_late_payment_is_refunded(client, student, seeded, db_session, razorpay):
    oid, _ = build_order(client, student, seeded, db_session)
    gw = client.post(f"{API}/orders/{oid}/checkout", headers=student).json()["razorpay_order_id"]
    assert jobs.release_expired_checkouts(db_session) == 0  # still inside the hold window
    o = order(db_session, oid)
    o.checkout_at = NOW - timedelta(minutes=60)
    db_session.commit()
    assert jobs.release_expired_checkouts(db_session) == 1
    o = order(db_session, oid)
    assert o.status == OrderStatus.draft and o.quotation is None and o.payment_status == PaymentStatus.unpaid
    assert jobs.release_expired_checkouts(db_session) == 0

    late = client.post(f"{API}/payments/verify", headers=student, json={
        "razorpay_order_id": gw, "razorpay_payment_id": "pay_late",
        "razorpay_signature": sign("test_secret", f"{gw}|pay_late".encode())})
    assert late.status_code in (200, 409)
    assert order(db_session, oid).payment_status == PaymentStatus.refund_pending  # money never silently kept


def test_unassigned_paid_order_alerts_admins_once(client, student, seeded, db_session, razorpay, admin):
    oid, _ = placed_order(client, student, seeded, db_session, razorpay)  # no shop exists
    assert jobs.process_slot_cutoffs(db_session)["alerts"] == 0  # too recent
    placed = db_session.scalar(select(OrderEvent).where(OrderEvent.order_id == uuid.UUID(oid),
                                                       OrderEvent.to_status == OrderStatus.placed))
    placed.created_at = NOW - timedelta(minutes=30)
    db_session.commit()
    assert jobs.process_slot_cutoffs(db_session)["alerts"] == 1
    assert jobs.process_slot_cutoffs(db_session)["alerts"] == 0
    kinds = [n["kind"] for n in client.get(f"{API}/notifications", headers=admin).json()["items"]]
    assert kinds.count("unassigned_order") == 1


def test_collection_reminder_is_sent_once(client, student, seeded, db_session, razorpay, make_shop, make_rider):
    shop, _ = make_shop()
    rider, _ = make_rider()
    oid, _ = deliver_fully(client, student, seeded, db_session, razorpay, shop, rider)
    assert jobs.collection_reminders(db_session) == 0
    for e in db_session.scalars(select(CustodyEvent).where(CustodyEvent.order_id == uuid.UUID(oid))):
        e.created_at = NOW - timedelta(hours=5)
    db_session.commit()
    assert jobs.collection_reminders(db_session) == 1
    assert jobs.collection_reminders(db_session) == 0
    assert db_session.query(Notification).filter_by(kind="collection_reminder").count() == 1


def test_old_unpaid_drafts_are_cancelled_and_their_files_deleted(client, student, seeded, db_session, razorpay, fake_storage):
    old, _ = build_order(client, student, seeded, db_session)
    recent, _ = build_order(client, student, seeded, db_session)
    paid, _ = placed_order(client, student, seeded, db_session, razorpay)
    for oid in (old, paid):
        o = order(db_session, oid)
        o.created_at = NOW - timedelta(days=60)
    db_session.commit()
    old_keys = [d.storage_key for d in order(db_session, old).documents]
    assert all(k in fake_storage for k in old_keys)

    assert jobs.cleanup_abandoned_drafts(db_session) == 1
    o = order(db_session, old)
    assert o.status == OrderStatus.cancelled and o.documents == []
    assert not any(k in fake_storage for k in old_keys)
    assert order(db_session, recent).status == OrderStatus.draft
    assert order(db_session, paid).status == OrderStatus.placed  # paid orders are never cleaned up
    assert jobs.cleanup_abandoned_drafts(db_session) == 0


def test_settlement_periods():
    shop, riders = jobs.settlement_periods(date(2026, 11, 26))  # a Thursday
    assert shop == (date(2026, 11, 16), date(2026, 11, 22))
    assert riders == [(date(2026, 11, 16), date(2026, 11, 18)), (date(2026, 11, 19), date(2026, 11, 22)),
                      (date(2026, 11, 23), date(2026, 11, 25))]
    _, monday_riders = jobs.settlement_periods(date(2026, 11, 23))
    assert len(monday_riders) == 2  # this week's Mon–Wed isn't complete yet


def test_prepare_settlements_creates_pending_payouts_once(client, student, seeded, db_session, razorpay, make_shop, make_rider):
    shop, _ = make_shop()
    rider, _ = make_rider()
    deliver_fully(client, student, seeded, db_session, razorpay, shop, rider)
    next_week = datetime.now(UTC).date() + timedelta(days=7)  # "last week" then includes today's work
    first = jobs.prepare_settlements(db_session, next_week)
    assert first == {"shop_settlements": 1, "rider_settlements": 1}
    assert jobs.prepare_settlements(db_session, next_week) == {"shop_settlements": 0, "rider_settlements": 0}
    assert db_session.query(Settlement).count() == 1 and db_session.query(RiderSettlement).count() == 1


def docx(pages_hint: int) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("word/document.xml", "<w:document/>")
        z.writestr("docProps/app.xml", f"<Properties><Pages>{pages_hint}</Pages></Properties>")
    return buf.getvalue()


def test_office_documents_are_converted_when_libreoffice_is_available(client, student, seeded, db_session, fake_storage, monkeypatch):
    oid = client.post(f"{API}/orders", headers=student).json()["id"]
    up = client.post(f"{API}/orders/{oid}/documents", headers=student,
                     files={"file": ("essay.docx", docx(2), "application/octet-stream")}).json()
    assert up["conversion_status"] == "pending" and up["page_count"] == 2 and up["has_preview"] is False
    assert client.get(f"{API}/orders/{oid}/documents/{up['id']}/url?preview=true", headers=student).status_code == 404

    def missing():
        raise conversion.ConversionUnavailable("not installed")
    monkeypatch.setattr(conversion, "soffice", missing)
    assert jobs.convert_pending_documents(db_session)["converted"] == 0  # stays pending, nothing faked

    monkeypatch.setattr(conversion, "soffice", lambda: "soffice")
    monkeypatch.setattr(conversion, "to_pdf", lambda name, data: (make_pdf(5), 5))
    assert jobs.convert_pending_documents(db_session) == {"converted": 1, "failed": 0}
    doc = client.get(f"{API}/orders/{oid}", headers=student).json()["documents"][0]
    assert doc["conversion_status"] == ConversionStatus.done.value and doc["has_preview"] is True
    assert doc["page_count"] == 5 and doc["rules"] == [{**doc["rules"][0], "page_from": 1, "page_to": 5}]
    url = client.get(f"{API}/orders/{oid}/documents/{doc['id']}/url?preview=true", headers=student).json()["url"]
    assert url.startswith("https://files.test/previews/")
    assert jobs.convert_pending_documents(db_session) == {"converted": 0, "failed": 0}


def test_unreadable_office_document_is_marked_failed(client, student, seeded, db_session, monkeypatch):
    oid = client.post(f"{API}/orders", headers=student).json()["id"]
    client.post(f"{API}/orders/{oid}/documents", headers=student, files={"file": ("deck.docx", docx(1), "application/octet-stream")})
    monkeypatch.setattr(conversion, "soffice", lambda: "soffice")

    def broken(name, data):
        raise RuntimeError("corrupt")
    monkeypatch.setattr(conversion, "to_pdf", broken)
    assert jobs.convert_pending_documents(db_session) == {"converted": 0, "failed": 1}
    doc = client.get(f"{API}/orders/{oid}", headers=student).json()["documents"][0]
    assert doc["conversion_status"] == "failed" and doc["page_count"] == 1  # the estimate stays; student can correct it
