import hashlib
import hmac
import json

import httpx
import pytest

from app.modules.colleges.models import CollegeSlot
from app.modules.orders.enums import OrderStatus
from app.modules.orders.models import Order
from app.modules.payments.models import Payment, Refund
from tests.conftest import future_slot_date, make_pdf

API = "/api/v1"


def sign(secret: str, msg: bytes) -> str:
    return hmac.new(secret.encode(), msg, hashlib.sha256).hexdigest()


def build_order(client, h, seeded, db, pages=4, with_delivery=True):
    """Draft order with one PDF, a page-level rule, binding and a delivery slot."""
    oid = client.post(f"{API}/orders", headers=h).json()["id"]
    r = client.post(f"{API}/orders/{oid}/documents", headers=h, files={"file": ("notes.pdf", make_pdf(pages), "application/pdf")})
    assert r.status_code == 201, r.text
    doc = r.json()
    assert doc["page_count"] == pages and doc["rules"][0]["page_to"] == pages  # default rule
    r = client.put(f"{API}/orders/{oid}/documents/{doc['id']}/config", headers=h, json={
        "copies": 2, "paper_size": "A4",
        "rules": [{"page_from": 1, "page_to": 1, "color": "color", "gsm": 100, "sided": "single"},
                  {"page_from": 2, "page_to": pages, "color": "bw", "gsm": 80, "sided": "single"}]})
    assert r.status_code == 200, r.text
    r = client.put(f"{API}/orders/{oid}/binding", headers=h, json={
        "binding": "spiral", "cover_page": True, "subject_name": "Data Structures", "subject_code": "CS3301"})
    assert r.status_code == 200, r.text
    if with_delivery:
        slot = db.query(CollegeSlot).order_by(CollegeSlot.delivery_time).first()
        r = client.put(f"{API}/orders/{oid}/delivery", headers=h,
                       json={"slot_id": str(slot.id), "slot_date": future_slot_date()})
        assert r.status_code == 200, r.text
    return oid, doc


def pay(client, h, oid, secret="test_secret", good=True):
    co = client.post(f"{API}/orders/{oid}/checkout", headers=h)
    assert co.status_code == 200, co.text
    gw = co.json()["razorpay_order_id"]
    pid = "pay_123"
    sig = sign(secret, f"{gw}|{pid}".encode()) if good else "0" * 64
    return gw, client.post(f"{API}/payments/verify", headers=h, json={
        "razorpay_order_id": gw, "razorpay_payment_id": pid, "razorpay_signature": sig})


def test_profile_required_and_one_time(client, login, seeded):
    h = {"Authorization": f"Bearer {login()['access_token']}"}
    assert client.post(f"{API}/orders", headers=h).status_code == 409  # no profile yet
    body = {"full_name": "Asha", "college_id": str(seeded.id), "department": "CSE", "year": 3, "register_number": "21CS001"}
    r = client.post(f"{API}/students/me/profile", headers=h, json=body)
    assert r.status_code == 201 and len(r.json()["referral_code"]) == 8
    assert client.post(f"{API}/students/me/profile", headers=h, json=body).status_code == 409
    assert client.patch(f"{API}/students/me/profile", headers=h, json={"full_name": "Asha R"}).json()["full_name"] == "Asha R"


def test_quotation_is_computed_server_side(client, student, seeded, db_session):
    oid, _ = build_order(client, student, seeded, db_session)
    q = client.get(f"{API}/orders/{oid}/quotation", headers=student).json()
    # 2 copies x (1 colour 100gsm page @5.50 + 3 bw 80gsm pages @1.10) = 17.60; spiral 2x30; cover 2x5; delivery 15
    assert q["printing_amount"] == "17.60" and q["binding_amount"] == "60.00"
    assert q["cover_amount"] == "10.00" and q["total"] == "102.60"


def test_upload_validation_and_limits(client, student, seeded, db_session):
    oid = client.post(f"{API}/orders", headers=student).json()["id"]
    bad = client.post(f"{API}/orders/{oid}/documents", headers=student, files={"file": ("x.exe", b"MZ", "application/octet-stream")})
    assert bad.status_code == 415
    from app.modules.finance.models import PlatformConfig
    db_session.get(PlatformConfig, 1).max_upload_mb = 1  # the database forbids 0 (ck_platform_config_limits)
    db_session.commit()
    big = client.post(f"{API}/orders/{oid}/documents", headers=student,
                      files={"file": ("a.pdf", make_pdf(1) + b"\0" * (1024 * 1024), "application/pdf")})
    assert big.status_code == 413


def test_invalid_page_rules_are_rejected(client, student, seeded, db_session):
    oid, doc = build_order(client, student, seeded, db_session, with_delivery=False)
    r = client.put(f"{API}/orders/{oid}/documents/{doc['id']}/config", headers=student, json={
        "copies": 1, "paper_size": "A4",
        "rules": [{"page_from": 1, "page_to": 3, "color": "bw", "gsm": 80, "sided": "double"},
                  {"page_from": 4, "page_to": 4, "color": "bw", "gsm": 100, "sided": "double"}]})
    assert r.status_code == 422 and "share one sheet" in r.json()["detail"]


def test_checkout_unavailable_without_razorpay_keys(client, student, seeded, db_session):
    oid, _ = build_order(client, student, seeded, db_session)
    r = client.post(f"{API}/orders/{oid}/checkout", headers=student)
    assert r.status_code == 503  # never pretends payment works


def test_checkout_needs_a_slot(client, student, seeded, db_session, razorpay):
    oid, _ = build_order(client, student, seeded, db_session, with_delivery=False)
    assert client.post(f"{API}/orders/{oid}/checkout", headers=student).status_code == 422


class _FakeResponse:
    def __init__(self, status_code, body=None):
        self.status_code, self._body = status_code, body or {}

    def raise_for_status(self):
        if self.status_code >= 400:
            raise httpx.HTTPStatusError("error", request=httpx.Request("POST", "https://x"),
                                        response=httpx.Response(self.status_code))

    def json(self):
        return self._body


@pytest.mark.parametrize("status, expected", [(401, 503), (500, 502)])
def test_gateway_order_errors_are_not_leaked_as_auth_failures(monkeypatch, status, expected):
    from fastapi import HTTPException

    from app.modules.payments import service
    s = service.get_settings()
    monkeypatch.setattr(s, "razorpay_key_id", "rzp_test_key")
    monkeypatch.setattr(s, "razorpay_key_secret", "test_secret")
    monkeypatch.setattr(service.httpx, "post", lambda *a, **kw: _FakeResponse(status))
    with pytest.raises(HTTPException) as e:
        service.create_gateway_order(10000, "R1")
    assert e.value.status_code == expected  # never 401: the client would treat it as an expired session


def test_gateway_order_sends_amount_in_paise(monkeypatch):
    from app.modules.payments import service
    s = service.get_settings()
    monkeypatch.setattr(s, "razorpay_key_id", "rzp_test_key")
    monkeypatch.setattr(s, "razorpay_key_secret", "test_secret")
    sent = {}
    monkeypatch.setattr(service.httpx, "post",
                        lambda url, **kw: sent.update(kw) or _FakeResponse(200, {"id": "order_X"}))
    assert service.create_gateway_order(10260, "R1") == "order_X"
    assert sent["json"]["amount"] == 10260 and sent["json"]["currency"] == "INR"
    assert sent["auth"] == ("rzp_test_key", "test_secret")


def test_full_payment_flow(client, student, seeded, db_session, razorpay):
    oid, _ = build_order(client, student, seeded, db_session)
    co = client.post(f"{API}/orders/{oid}/checkout", headers=student).json()
    assert co["amount_paise"] == 10260 and co["razorpay_key_id"] == "rzp_test_key"
    assert db_session.get(Order, __import__("uuid").UUID(oid)).status == OrderStatus.awaiting_payment

    # forged signature is rejected and the order stays unpaid
    bad = client.post(f"{API}/payments/verify", headers=student, json={
        "razorpay_order_id": co["razorpay_order_id"], "razorpay_payment_id": "pay_1", "razorpay_signature": "x" * 64})
    assert bad.status_code == 400
    assert client.get(f"{API}/orders/{oid}", headers=student).json()["status"] == "awaiting_payment"

    good = client.post(f"{API}/payments/verify", headers=student, json={
        "razorpay_order_id": co["razorpay_order_id"], "razorpay_payment_id": "pay_1",
        "razorpay_signature": sign("test_secret", f"{co['razorpay_order_id']}|pay_1".encode())})
    assert good.status_code == 200
    d = good.json()
    assert d["status"] == "placed" and d["payment_status"] == "paid" and d["quotation"]["total"] == "102.60"
    assert [s["done"] for s in d["timeline"]] == [True, False, False, False, False, False]
    # idempotent: verifying again does not duplicate anything
    again = client.post(f"{API}/payments/verify", headers=student, json={
        "razorpay_order_id": co["razorpay_order_id"], "razorpay_payment_id": "pay_1",
        "razorpay_signature": sign("test_secret", f"{co['razorpay_order_id']}|pay_1".encode())})
    assert again.status_code == 200 and db_session.query(Refund).count() == 0
    notes = client.get(f"{API}/notifications", headers=student).json()
    assert notes["unread_count"] == 1 and notes["items"][0]["kind"] == "order_placed"
    client.post(f"{API}/notifications/read-all", headers=student)
    assert client.get(f"{API}/notifications", headers=student).json()["unread_count"] == 0
    assert len(client.get(f"{API}/orders", headers=student).json()) == 1


def test_other_students_cannot_see_or_pay_my_order(client, student, seeded, db_session, razorpay, login):
    oid, _ = build_order(client, student, seeded, db_session)
    gw, _r = pay(client, student, oid, good=False)
    other = {"Authorization": f"Bearer {login('9123456780')['access_token']}"}
    assert client.get(f"{API}/orders/{oid}", headers=other).status_code == 404
    assert client.get(f"{API}/orders", headers=other).json() == []
    r = client.post(f"{API}/payments/verify", headers=other, json={
        "razorpay_order_id": gw, "razorpay_payment_id": "p", "razorpay_signature": sign("test_secret", f"{gw}|p".encode())})
    assert r.status_code == 404


def test_rider_role_cannot_use_student_endpoints(client, login):
    rider = {"Authorization": f"Bearer {login('9000000002', 'rider')['access_token']}"}
    assert client.get(f"{API}/orders", headers=rider).status_code == 403
    assert client.post(f"{API}/orders", headers=rider).status_code == 403


def test_editing_after_checkout_resets_and_old_payment_is_refunded(client, student, seeded, db_session, razorpay):
    oid, doc = build_order(client, student, seeded, db_session)
    old_gw = client.post(f"{API}/orders/{oid}/checkout", headers=student).json()["razorpay_order_id"]
    client.put(f"{API}/orders/{oid}/binding", headers=student, json={"binding": "none", "cover_page": False})
    d = client.get(f"{API}/orders/{oid}", headers=student).json()
    assert d["status"] == "draft" and d["quotation"] is None
    new_gw = client.post(f"{API}/orders/{oid}/checkout", headers=student).json()["razorpay_order_id"]
    assert new_gw != old_gw

    # money for the superseded checkout arrives late -> must not place the order; refund is requested
    r = client.post(f"{API}/payments/verify", headers=student, json={
        "razorpay_order_id": old_gw, "razorpay_payment_id": "p_old", "razorpay_signature": sign("test_secret", f"{old_gw}|p_old".encode())})
    assert r.status_code == 200 and r.json()["status"] == "awaiting_payment"
    assert db_session.query(Refund).count() == 1


def test_cancel_before_printing_creates_refund_request(client, student, seeded, db_session, razorpay):
    oid, _ = build_order(client, student, seeded, db_session)
    pay(client, student, oid)
    d = client.post(f"{API}/orders/{oid}/cancel", headers=student).json()
    assert d["status"] == "cancelled" and d["payment_status"] == "refund_pending"
    refund = db_session.query(Refund).one()
    assert str(refund.amount) == "102.60" and refund.status.value == "requested"


def test_cannot_cancel_once_printing_started_and_collect_rules(client, student, seeded, db_session, razorpay):
    oid, _ = build_order(client, student, seeded, db_session)
    pay(client, student, oid)
    order = db_session.get(Order, __import__("uuid").UUID(oid))
    assert client.post(f"{API}/orders/{oid}/collect", headers=student).status_code == 409
    order.status = OrderStatus.printing
    db_session.commit()
    assert client.post(f"{API}/orders/{oid}/cancel", headers=student).status_code == 409
    order.status = OrderStatus.delivered
    db_session.commit()
    d = client.post(f"{API}/orders/{oid}/collect", headers=student).json()
    assert d["status"] == "collected" and d["timeline"][-1]["done"]


def test_slot_capacity_and_cutoff(client, student, seeded, db_session, razorpay):
    slot = db_session.query(CollegeSlot).order_by(CollegeSlot.delivery_time).first()
    slot.capacity = 1
    db_session.commit()
    first, _ = build_order(client, student, seeded, db_session)
    pay(client, student, first)  # takes the only place
    oid = client.post(f"{API}/orders", headers=student).json()["id"]
    r = client.put(f"{API}/orders/{oid}/delivery", headers=student,
                   json={"slot_id": str(slot.id), "slot_date": future_slot_date()})
    assert r.status_code == 409
    slots = client.get(f"{API}/colleges/{seeded.id}/slots", headers=student).json()
    assert any(s["slot_id"] == str(slot.id) and s["remaining"] == 0 and not s["is_open"] for s in slots)
    # past dates are rejected
    r = client.put(f"{API}/orders/{oid}/delivery", headers=student,
                   json={"slot_id": str(slot.id), "slot_date": future_slot_date(-1)})
    assert r.status_code == 422


def test_coupon_applies_and_invalid_coupon_is_rejected(client, student, seeded, db_session):
    from app.modules.finance.models import Coupon
    db_session.add(Coupon(code="SAVE10", percent_off=10))
    db_session.commit()
    oid, _ = build_order(client, student, seeded, db_session)
    slot = db_session.query(CollegeSlot).first()
    body = {"slot_id": str(slot.id), "slot_date": future_slot_date()}
    assert client.put(f"{API}/orders/{oid}/delivery", headers=student, json={**body, "coupon_code": "nope"}).status_code == 422
    assert client.put(f"{API}/orders/{oid}/delivery", headers=student, json={**body, "coupon_code": "save10"}).status_code == 200
    q = client.get(f"{API}/orders/{oid}/quotation", headers=student).json()
    assert q["discount"] == "1.76" and q["total"] == "100.84"  # 10% of printing only


def webhook_body(gw, amount, event="payment.captured"):
    return json.dumps({"event": event, "payload": {"payment": {"entity": {"id": "pay_w", "order_id": gw, "amount": amount}}}}).encode()


def test_webhook_signature_idempotency_and_amount_check(client, student, seeded, db_session, razorpay):
    oid, _ = build_order(client, student, seeded, db_session)
    gw = client.post(f"{API}/orders/{oid}/checkout", headers=student).json()["razorpay_order_id"]

    def post(body, secret="whsec_test", event_id="evt_1"):
        return client.post(f"{API}/payments/webhook", content=body,
                           headers={"X-Razorpay-Signature": sign(secret, body), "X-Razorpay-Event-Id": event_id})

    assert post(webhook_body(gw, 10260), secret="wrong").status_code == 400
    assert client.post(f"{API}/payments/webhook", content=b"{}").status_code == 400
    assert post(webhook_body(gw, 5), event_id="evt_0").json()["status"] == "ok"  # wrong amount: acknowledged, ignored
    assert client.get(f"{API}/orders/{oid}", headers=student).json()["status"] == "awaiting_payment"

    assert post(webhook_body(gw, 10260)).json()["status"] == "ok"
    assert client.get(f"{API}/orders/{oid}", headers=student).json()["status"] == "placed"
    assert post(webhook_body(gw, 10260)).json()["status"] == "duplicate"
    assert db_session.query(Payment).one().provider_payment_id == "pay_w"
    # the browser verify arriving after the webhook is harmless
    assert db_session.query(Refund).count() == 0


def test_complaints_need_a_placed_order_and_accept_photo(client, student, seeded, db_session, razorpay):
    oid, _ = build_order(client, student, seeded, db_session)
    form = {"order_id": oid, "category": "missing_pages", "description": "Pages 3-4 are missing"}
    assert client.post(f"{API}/students/complaints", headers=student, data=form).status_code == 409
    pay(client, student, oid)
    jpg, png = ("a.jpg", b"\xff\xd8\xff\xe0data", "image/jpeg"), ("b.png", b"\x89PNG\r\n\x1a\ndata", "image/png")
    r = client.post(f"{API}/students/complaints", headers=student, data=form, files=[("photos", jpg), ("photos", png)])
    assert r.status_code == 201, r.text
    urls = r.json()["photo_urls"]
    assert len(urls) == 2 and all(u.startswith("https://files.test/complaints/") for u in urls)
    # A bad file anywhere rejects the whole complaint (nothing is stored), and at most 3 photos are accepted.
    assert client.post(f"{API}/students/complaints", headers=student, data=form,
                       files=[("photos", jpg), ("photos", ("p.jpg", b"not an image", "image/jpeg"))]).status_code == 415
    assert client.post(f"{API}/students/complaints", headers=student, data=form,
                       files=[("photos", jpg)] * 4).status_code == 422
    assert len(client.get(f"{API}/students/complaints", headers=student).json()) == 1
    from app.modules.students.models import ComplaintAttachment
    assert db_session.query(ComplaintAttachment).count() == 2


def test_document_url_is_signed_and_owner_only(client, student, seeded, db_session, login):
    oid, doc = build_order(client, student, seeded, db_session, with_delivery=False)
    url = client.get(f"{API}/orders/{oid}/documents/{doc['id']}/url", headers=student).json()["url"]
    assert url.startswith("https://files.test/orders/")
    other = {"Authorization": f"Bearer {login('9123456780')['access_token']}"}
    assert client.get(f"{API}/orders/{oid}/documents/{doc['id']}/url", headers=other).status_code == 404
