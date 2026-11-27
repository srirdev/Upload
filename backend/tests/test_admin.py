import uuid
from datetime import date, timedelta
from decimal import Decimal

import pytest

from app.modules.finance.models import AuditLog, LedgerEntry, LedgerType
from app.modules.orders import slots as slot_utils
from app.modules.orders.models import Order
from app.modules.payments.models import Refund
from app.modules.shops.models import ShopProfile
from tests.conftest import future_slot_date
from tests.helpers import API, JPG, build_order, hdr, pay, placed_order
from tests.test_delivery import accept_and_pack, photo, run
from tests.test_orders import sign


def D(x):
    return Decimal(x)


def deliver_fully(client, student, seeded, db, razorpay, shop, rider):
    """Student order -> shop -> rider -> delivered. Returns (order id, batch id)."""
    oid, doc = placed_order(client, student, seeded, db, razorpay)
    code = accept_and_pack(client, shop, oid)
    r = run(client, rider)
    d = f"{API}/delivery/batches/{r['id']}"
    client.post(f"{d}/accept", headers=rider)
    assert client.post(f"{d}/pickup", headers=rider, json={"order_id": oid, "code": code}).status_code == 200
    client.post(f"{d}/depart", headers=rider)
    photo(client, rider, r["id"])
    assert client.post(f"{d}/complete", headers=rider).status_code == 200
    return oid, r["id"]


def totals(client, admin):
    return {k: D(v) for k, v in client.get(f"{API}/admin/finance/summary", headers=admin).json().items()}


# ---- access control ---------------------------------------------------------------------------


@pytest.mark.parametrize("method, path", [
    ("get", "/admin/ops/summary"), ("get", "/admin/ops/custody"), ("get", "/admin/orders"), ("get", "/admin/complaints"),
    ("get", "/admin/refunds"), ("get", "/admin/shops"), ("get", "/admin/riders"), ("get", "/admin/batches"),
    ("get", "/admin/colleges"), ("get", "/admin/config"), ("get", "/admin/finance/summary"), ("get", "/admin/finance/ledger"),
    ("get", "/admin/audit"), ("get", "/admin/settlements/shops"), ("get", "/admin/settlements/riders"),
    ("get", "/admin/settlements/shops/export.csv"), ("post", "/admin/settlements/shops/generate"),
])
def test_every_admin_endpoint_rejects_other_roles(client, student, make_shop, make_rider, admin, method, path):
    shop, _ = make_shop()
    rider, _ = make_rider()
    body = {"json": {"period_start": "2026-01-01", "period_end": "2026-01-07"}} if method == "post" else {}
    assert getattr(client, method)(f"{API}{path}", **body).status_code == 401
    for who in (student, shop, rider):
        assert getattr(client, method)(f"{API}{path}", headers=who, **body).status_code == 403
    assert getattr(client, method)(f"{API}{path}", headers=admin, **body).status_code in (200, 201)


# ---- live operations & ledger -----------------------------------------------------------------


def test_ledger_reconciles_across_the_whole_lifecycle(client, student, seeded, db_session, razorpay, make_shop, make_rider, admin):
    shop, _ = make_shop()
    rider, _ = make_rider()
    oid, _ = placed_order(client, student, seeded, db_session, razorpay)
    t = totals(client, admin)
    assert t["gross_revenue"] == D("102.60") and t["gateway_fee"] == D("2.05")  # 2% estimate, rounded half-up
    assert t["printing_charges"] == D("87.60") and t["delivery_fee"] == D("15.00") and t["discount"] == 0
    assert t["shop_entitlement"] == 0 and t["rider_payout"] == 0  # not earned until handover / delivery

    code = accept_and_pack(client, shop, oid)
    r = run(client, rider)
    d = f"{API}/delivery/batches/{r['id']}"
    client.post(f"{d}/accept", headers=rider)
    client.post(f"{d}/pickup", headers=rider, json={"order_id": oid, "code": code})
    t = totals(client, admin)
    assert t["shop_entitlement"] == D("78.84") and t["platform_commission"] == D("8.76")
    client.post(f"{d}/depart", headers=rider)
    photo(client, rider, r["id"])
    client.post(f"{d}/complete", headers=rider)
    t = totals(client, admin)
    assert t["rider_payout"] == D("60.00")
    # commission + delivery fee - rider - gateway: the platform's net position on this order
    assert t["net_platform_margin"] == D("102.60") - D("78.84") - D("60.00") - D("2.05")
    assert t["platform_commission"] + t["delivery_fee"] - t["rider_payout"] - t["gateway_fee"] == t["net_platform_margin"]

    summary = client.get(f"{API}/admin/ops/summary", headers=admin).json()
    assert summary["orders_today"] == 1 and summary["completed_deliveries"] == 1
    assert D(summary["net_margin_total"]) == t["net_platform_margin"]

    entries = client.get(f"{API}/admin/finance/ledger", headers=admin, params={"order_id": oid}).json()
    assert {e["type"] for e in entries} >= {"gross_revenue", "shop_entitlement", "platform_commission", "gateway_fee"}


def test_postings_are_idempotent(client, student, seeded, db_session, razorpay, make_shop, admin):
    make_shop()
    oid, _ = build_order(client, student, seeded, db_session)
    gw, r = pay(client, student, oid)
    before = db_session.query(LedgerEntry).count()
    for _ in range(3):  # browser retries and a webhook for the same payment
        client.post(f"{API}/payments/verify", headers=student, json={
            "razorpay_order_id": gw, "razorpay_payment_id": "pay_123", "razorpay_signature": sign("test_secret", f"{gw}|pay_123".encode())})
    assert db_session.query(LedgerEntry).count() == before
    assert totals(client, admin)["gross_revenue"] == D("102.60")


def test_custody_board_and_attention_flags(client, student, seeded, db_session, razorpay, make_shop, admin):
    oid, _ = placed_order(client, student, seeded, db_session, razorpay)  # no shop is open
    row = client.get(f"{API}/admin/ops/custody", headers=admin).json()[0]
    assert row["code"] and row["stage"] == "awaiting_shop" and row["needs_attention"] is True and row["shop"] is None
    assert client.get(f"{API}/admin/ops/summary", headers=admin).json()["unassigned_orders"] == 1
    shop, sid = make_shop()  # opening assigns the waiting order
    row = client.get(f"{API}/admin/ops/custody", headers=admin).json()[0]
    assert row["shop"] == "Quick Prints" and row["needs_attention"] is False


def test_order_search_and_detail(client, student, seeded, db_session, razorpay, make_shop, admin):
    shop, sid = make_shop()
    oid, _ = placed_order(client, student, seeded, db_session, razorpay)
    order = db_session.get(Order, uuid.UUID(oid))
    S = lambda **p: client.get(f"{API}/admin/orders", headers=admin, params=p).json()  # noqa: E731
    assert [o["id"] for o in S(q=order.code[-4:].lower())] == [oid]
    assert S(q="9876543210")[0]["student_name"] == "Asha Raman"
    assert S(q="asha")[0]["id"] == oid and S(q="21CS001")[0]["id"] == oid
    assert S(q="nobody") == []
    assert S(shop_id=sid)[0]["id"] == oid and S(college_id=str(seeded.id))[0]["id"] == oid
    assert S(status="printing") == [] and S(status="placed")[0]["id"] == oid
    assert S(slot_id=str(order.slot_id))[0]["id"] == oid
    d = client.get(f"{API}/admin/orders/{oid}", headers=admin).json()
    assert d["student"]["mobile"] == "9876543210" and d["shop"]["name"] == "Quick Prints"
    assert d["quotation"]["total"] == "102.60" and d["payments"][0]["status"] == "captured"
    assert d["documents"][0]["rules"][0]["page_from"] == 1 and any(e["type"] == "placed" for e in d["events"])
    assert client.get(f"{API}/admin/orders/{uuid.uuid4()}", headers=admin).status_code == 404


def test_admin_can_reassign_a_placed_order_but_not_after_accept(client, student, seeded, db_session, razorpay, make_shop, admin):
    a, _ = make_shop("9111111111")
    b, sid_b = make_shop("9222222222")
    oid, _ = placed_order(client, student, seeded, db_session, razorpay)
    holder = a if any(x["id"] == oid for x in client.get(f"{API}/shops/me/orders", headers=a).json()) else b
    other_sid = sid_b if holder is a else _
    other_sid = str(db_session.query(ShopProfile).filter(ShopProfile.id != db_session.get(Order, uuid.UUID(oid)).shop_id).one().id)
    assert client.post(f"{API}/admin/orders/{oid}/assign-shop", headers=admin, json={"shop_id": other_sid}).status_code == 204
    assert str(db_session.get(Order, uuid.UUID(oid)).shop_id) == other_sid
    new_holder = b if holder is a else a
    client.post(f"{API}/shops/me/orders/{oid}/accept", headers=new_holder)
    assert client.post(f"{API}/admin/orders/{oid}/assign-shop", headers=admin, json={"shop_id": other_sid}).status_code == 409


def test_admin_assigns_backup_rider_to_a_run(client, student, seeded, db_session, razorpay, make_shop, make_rider, admin):
    shop, _ = make_shop()
    primary, _ = make_rider("9333333331")
    backup, backup_id = make_rider("9333333332", backup=True)
    oid, _ = placed_order(client, student, seeded, db_session, razorpay)
    accept_and_pack(client, shop, oid)
    bid = run(client, primary)["id"]
    assert client.post(f"{API}/admin/batches/{bid}/assign-rider", headers=admin, json={"rider_id": backup_id}).status_code == 204
    assert run(client, primary) is None and run(client, backup)["status"] == "offered"
    batches = client.get(f"{API}/admin/batches", headers=admin).json()
    assert batches[0]["rider"] == "Kumar" and batches[0]["packets"] == 1


# ---- complaints & refunds ---------------------------------------------------------------------


def complain(client, student, oid, category="missing_pages"):
    r = client.post(f"{API}/students/complaints", headers=student, data={"order_id": oid, "category": category, "description": "Pages 3-4 are missing"},
                    files=[("photos", ("p.jpg", JPG, "image/jpeg"))])
    assert r.status_code == 201, r.text
    return r.json()["id"]


def test_complaint_review_compares_student_and_rider_photos(client, student, seeded, db_session, razorpay, make_shop, make_rider, admin):
    shop, _ = make_shop()
    rider, _ = make_rider()
    oid, _ = deliver_fully(client, student, seeded, db_session, razorpay, shop, rider)
    cid = complain(client, student, oid, "not_on_shelf")
    assert client.get(f"{API}/admin/complaints", headers=admin).json()[0]["student_name"] == "Asha Raman"
    d = client.get(f"{API}/admin/complaints/{cid}", headers=admin).json()
    assert len(d["evidence_photo_urls"]) == 1 and d["evidence_photo_urls"][0].startswith("https://files.test/complaints/")
    assert d["resolved_at"] is None
    assert len(d["shelf_photo_urls"]) == 1 and d["shelf_photo_urls"][0].startswith("https://files.test/shelf/")
    assert [c["type"] for c in d["custody"]][-1] == "delivered" and D(d["late_refund_percent"]) == 50

    assert client.patch(f"{API}/admin/complaints/{cid}", headers=admin, json={"status": "rejected"}).status_code == 422
    ok = client.patch(f"{API}/admin/complaints/{cid}", headers=admin, json={"status": "rejected", "admin_response": "The shelf photo shows your packet on the shelf."})
    assert ok.status_code == 200
    mine = client.get(f"{API}/students/complaints", headers=student).json()[0]
    assert mine["status"] == "rejected" and "shelf photo" in mine["admin_response"]
    from app.modules.students.models import Complaint
    closed = db_session.get(Complaint, uuid.UUID(cid))
    assert closed.resolved_by is not None and closed.resolved_at is not None
    assert client.get(f"{API}/admin/complaints/{cid}", headers=admin).json()["resolved_at"] is not None
    assert "complaint_update" in [n["kind"] for n in client.get(f"{API}/notifications", headers=student).json()["items"]]


def test_partial_refund_from_complaint_with_shop_deduction(client, student, seeded, db_session, razorpay, make_shop, make_rider, admin):
    shop, _ = make_shop()
    rider, _ = make_rider()
    oid, _ = deliver_fully(client, student, seeded, db_session, razorpay, shop, rider)
    cid = complain(client, student, oid, "damaged_binding")
    url = f"{API}/admin/complaints/{cid}/refund"
    assert client.post(url, headers=admin, json={"amount": "500"}).status_code == 422  # more than was paid
    assert client.post(url, headers=admin, json={"amount": "30", "deduct_from_shop": "40"}).status_code == 422
    assert client.post(url, headers=admin, json={"amount": "30.005"}).status_code == 422
    rid = client.post(url, headers=admin, json={"amount": "30", "deduct_from_shop": "30"}).json()["id"]
    assert client.get(f"{API}/students/complaints", headers=student).json()[0]["refund_status"] == "approved"
    assert client.get(f"{API}/students/complaints", headers=student).json()[0]["status"] == "resolved"
    # cannot refund more than the remaining balance
    assert client.post(url, headers=admin, json={"amount": "80"}).status_code == 422  # 30 + 80 > 102.60? (112.60)

    rec = f"{API}/admin/refunds/{rid}/record"
    before = totals(client, admin)["net_platform_margin"]
    assert client.post(rec, headers=admin, json={"provider_ref": "rfnd_ABC123"}).json()["status"] == "processed"
    assert client.post(rec, headers=admin, json={"provider_ref": "rfnd_ABC123"}).status_code == 409  # not twice
    t = totals(client, admin)
    assert t["refund"] == D("30.00") and t["shop_refund_recovery"] == D("30.00")
    assert t["net_platform_margin"] == before  # refund fully recovered from the shop
    assert client.get(f"{API}/admin/orders/{oid}", headers=admin).json()["payment_status"] == "paid"  # partial


def test_cancelled_order_refund_lifecycle_approve_and_reject(client, student, seeded, db_session, razorpay, make_shop, admin):
    # reject path: order goes back to "paid"
    oid, _ = build_order(client, student, seeded, db_session)
    pay(client, student, oid)
    client.post(f"{API}/orders/{oid}/cancel", headers=student)
    refund = client.get(f"{API}/admin/refunds", headers=admin, params={"status": "requested"}).json()[0]
    assert refund["amount"] == "102.60" and refund["order_code"]
    assert client.post(f"{API}/admin/refunds/{refund['id']}/reject", headers=admin, json={"reason": "no"}).status_code == 422
    assert client.post(f"{API}/admin/refunds/{refund['id']}/reject", headers=admin, json={"reason": "Policy violation"}).status_code == 200
    assert client.get(f"{API}/orders/{oid}", headers=student).json()["payment_status"] == "paid"
    assert client.post(f"{API}/admin/refunds/{refund['id']}/approve", headers=admin, json={}).status_code == 409  # already decided

    # approve path: record the provider reference -> refunded
    oid2, _ = build_order(client, student, seeded, db_session)
    pay(client, student, oid2)
    client.post(f"{API}/orders/{oid2}/cancel", headers=student)
    r2 = client.get(f"{API}/admin/refunds", headers=admin, params={"status": "requested"}).json()[0]
    assert client.post(f"{API}/admin/refunds/{r2['id']}/record", headers=admin, json={"provider_ref": "rfnd_1"}).status_code == 409  # must approve first
    assert client.post(f"{API}/admin/refunds/{r2['id']}/approve", headers=admin, json={}).status_code == 200
    assert client.post(f"{API}/admin/refunds/{r2['id']}/record", headers=admin, json={"provider_ref": "rfnd_1"}).status_code == 200
    assert client.get(f"{API}/orders/{oid2}", headers=student).json()["payment_status"] == "refunded"
    assert totals(client, admin)["refund"] == D("102.60")
    kinds = [n["kind"] for n in client.get(f"{API}/notifications", headers=student).json()["items"]]
    assert kinds.count("refund_update") >= 3
    assert db_session.query(AuditLog).filter(AuditLog.action.like("refund.%")).count() == 3


# ---- settlements ------------------------------------------------------------------------------


def week():
    today = date.today()
    return {"period_start": str(today - timedelta(days=7)), "period_end": str(today + timedelta(days=1))}


def test_shop_and_rider_settlements_never_pay_twice(client, student, seeded, db_session, razorpay, make_shop, make_rider, admin):
    shop, sid = make_shop()
    rider, _ = make_rider()
    oid, _ = deliver_fully(client, student, seeded, db_session, razorpay, shop, rider)
    pending_before = client.get(f"{API}/shops/me/accounting", headers=shop).json()
    assert pending_before["unsettled_amount"] == "78.84"

    g = client.post(f"{API}/admin/settlements/shops/generate", headers=admin, json=week())
    assert g.status_code == 201 and len(g.json()["created"]) == 1
    again = client.post(f"{API}/admin/settlements/shops/generate", headers=admin, json=week())
    assert again.json() == {"created": [], "skipped_existing": []}  # nothing unsettled left
    assert client.post(f"{API}/admin/settlements/shops/generate", headers=admin, json={"period_start": "2026-02-02", "period_end": "2026-02-01"}).status_code == 422

    sets = client.get(f"{API}/admin/settlements/shops", headers=admin, params={"status": "pending"}).json()
    assert len(sets) == 1 and sets[0]["net_amount"] == "78.84" and sets[0]["payout_to"] == "ravi@okbank"
    csv_text = client.get(f"{API}/admin/settlements/shops/export.csv", headers=admin).text
    assert "Quick Prints" in csv_text and "78.84" in csv_text and csv_text.startswith("settlement_id,shop,payout_to")

    pay_url = f"{API}/admin/settlements/shops/{sets[0]['id']}/pay"
    assert client.post(pay_url, headers=admin, json={"upi_reference": "x"}).status_code == 422
    assert client.post(pay_url, headers=admin, json={"upi_reference": "UTR998877"}).json()["status"] == "paid"
    assert client.post(pay_url, headers=admin, json={"upi_reference": "UTR998877"}).status_code == 409
    acc = client.get(f"{API}/shops/me/accounting", headers=shop).json()
    assert acc["unsettled_orders"] == 0 and acc["settlements"][0]["upi_reference"] == "UTR998877"
    assert client.get(f"{API}/admin/settlements/shops/export.csv", headers=admin).text.count("Quick Prints") == 0  # paid ones leave the queue

    rg = client.post(f"{API}/admin/settlements/riders/generate", headers=admin, json=week())
    assert len(rg.json()["created"]) == 1
    assert client.post(f"{API}/admin/settlements/riders/generate", headers=admin, json=week()).json()["created"] == []
    rs = client.get(f"{API}/admin/settlements/riders", headers=admin).json()[0]
    assert rs["amount"] == "60.00" and rs["rider_name"] == "Kumar" and rs["payout_to"] == "kumar@okbank"
    pay_r = f"{API}/admin/settlements/riders/{rs['id']}/pay"
    assert client.post(pay_r, headers=admin, json={"upi_reference": "UTR55512"}).status_code == 200
    assert client.post(pay_r, headers=admin, json={"upi_reference": "UTR55512"}).status_code == 409
    e = client.get(f"{API}/riders/me/earnings", headers=rider).json()
    assert e["unsettled"] == "0.00" and e["payouts"][0]["status"] == "paid"


def test_shop_deduction_reduces_the_next_payout_and_csv_is_injection_safe(client, student, seeded, db_session, razorpay, make_shop, make_rider, admin):
    shop, sid = make_shop()
    rider, _ = make_rider()
    oid, _ = deliver_fully(client, student, seeded, db_session, razorpay, shop, rider)
    cid = complain(client, student, oid, "damaged_binding")
    rid = client.post(f"{API}/admin/complaints/{cid}/refund", headers=admin, json={"amount": "20", "deduct_from_shop": "20"}).json()["id"]
    db_session.query(ShopProfile).update({ShopProfile.shop_name: "=HYPERLINK(\"http://evil\")"})
    db_session.commit()

    client.post(f"{API}/admin/settlements/shops/generate", headers=admin, json=week())
    s = client.get(f"{API}/admin/settlements/shops", headers=admin).json()[0]
    assert (s["gross_amount"], s["refund_deductions"], s["net_amount"]) == ("78.84", "20.00", "58.84")
    assert db_session.get(Refund, uuid.UUID(rid)).shop_settlement_id is not None  # a deduction is only ever taken once
    csv_text = client.get(f"{API}/admin/settlements/shops/export.csv", headers=admin).text
    assert "'=HYPERLINK" in csv_text and ",=HYPERLINK" not in csv_text


# ---- configuration, colleges ------------------------------------------------------------------


def test_config_validation_audit_and_snapshots(client, student, seeded, db_session, razorpay, make_shop, admin):
    shop, _ = make_shop()
    cfg = client.get(f"{API}/admin/config", headers=admin).json()
    assert D(cfg["commission_percent"]) == 10 and cfg["no_wait_minutes"] == 4
    assert client.put(f"{API}/admin/config", headers=admin, json={**cfg, "commission_percent": "101"}).status_code == 422
    assert client.put(f"{API}/admin/config", headers=admin, json={**cfg, "delivery_fee": "-1"}).status_code == 422

    first, _ = placed_order(client, student, seeded, db_session, razorpay)
    assert client.put(f"{API}/admin/config", headers=admin, json={**cfg, "commission_percent": "20", "delivery_fee": "25"}).status_code == 200
    log = db_session.query(AuditLog).filter_by(action="config.update").one()
    assert log.data["before"]["commission_percent"] == "10.00" and log.data["after"]["commission_percent"] == "20"
    assert log.actor_id is not None

    second, _ = placed_order(client, student, seeded, db_session, razorpay)
    ent = lambda oid: db_session.get(Order, uuid.UUID(oid)).shop_entitlement  # noqa: E731
    assert ent(first) == D("78.84")  # locked in at the old 10%
    assert ent(second) == D("70.08")  # 87.60 * 0.80
    assert client.get(f"{API}/orders/{second}", headers=student).json()["quotation"]["total"] == "112.60"  # new delivery fee
    assert client.get(f"{API}/orders/{first}", headers=student).json()["quotation"]["total"] == "102.60"  # unchanged

    assert client.put(f"{API}/admin/config/rates", headers=admin, json=[{"paper_size": "A4", "gsm": 80, "color": "bw", "sided": "single", "price_per_page": "2.00"}]).json() == {"updated": 1}
    assert client.put(f"{API}/admin/config/rates", headers=admin, json=[{"paper_size": "A4", "gsm": 90, "color": "bw", "sided": "single", "price_per_page": "2"}]).status_code == 422
    assert any(r["price_per_page"] == "2.00" for r in client.get(f"{API}/admin/config/rates", headers=admin).json()["rates"])
    assert client.put(f"{API}/admin/config/binding", headers=admin, json=[{"binding": "none", "price": "1"}]).status_code == 422


def test_coupons(client, admin):
    ok = client.put(f"{API}/admin/coupons", headers=admin, json={"code": "save10", "percent_off": "10"})
    assert ok.json()["code"] == "SAVE10"
    assert client.put(f"{API}/admin/coupons", headers=admin, json={"code": "both", "percent_off": "10", "flat_off": "5"}).status_code == 422
    assert client.put(f"{API}/admin/coupons", headers=admin, json={"code": "none"}).status_code == 422
    client.put(f"{API}/admin/coupons", headers=admin, json={"code": "SAVE10", "percent_off": "15", "active": False})
    c = client.get(f"{API}/admin/coupons", headers=admin).json()
    assert len(c) == 1 and D(c[0]["percent_off"]) == 15 and c[0]["active"] is False


def test_colleges_and_slots_management(client, student, seeded, admin):
    body = {"name": "Greenfield Institute", "security_cabin": "Gate 2 cabin", "city": "Chennai", "active": True,
            "latitude": "13.05", "longitude": "80.25"}
    c = client.post(f"{API}/admin/colleges", headers=admin, json=body)
    assert c.status_code == 201
    cid = c.json()["id"]
    assert client.post(f"{API}/admin/colleges", headers=admin, json=body).status_code == 409
    assert client.put(f"{API}/admin/colleges/{cid}", headers=admin, json={**body, "drop_instructions": "Top shelf"}).json()["drop_instructions"] == "Top shelf"
    slot = client.post(f"{API}/admin/colleges/{cid}/slots", headers=admin,
                       json={"label": "Noon", "delivery_time": "12:00", "cutoff_minutes": 90, "capacity": 5})
    assert slot.status_code == 201 and slot.json()["delivery_time"] == "12:00"
    assert client.post(f"{API}/admin/colleges/{uuid.uuid4()}/slots", headers=admin, json={"label": "x", "delivery_time": "12:00", "cutoff_minutes": 0, "capacity": 1}).status_code == 404
    assert client.post(f"{API}/admin/colleges/{cid}/slots", headers=admin, json={"label": "x", "delivery_time": "12:00", "cutoff_minutes": 0, "capacity": 0}).status_code == 422
    assert len(client.get(f"{API}/colleges/{cid}/slots", headers=student).json()) == 3  # 3 days x 1 slot
    # deactivating hides the slot from students without deleting history
    client.put(f"{API}/admin/slots/{slot.json()['id']}", headers=admin, json={"label": "Noon", "delivery_time": "12:00", "cutoff_minutes": 90, "capacity": 5, "active": False})
    assert client.get(f"{API}/colleges/{cid}/slots", headers=student).json() == []
    assert {x["name"] for x in client.get(f"{API}/colleges", headers=student).json()} >= {"Greenfield Institute"}
    client.put(f"{API}/admin/colleges/{cid}", headers=admin, json={**body, "active": False})
    assert "Greenfield Institute" not in {x["name"] for x in client.get(f"{API}/colleges", headers=student).json()}


def test_shop_location_and_performance(client, student, seeded, db_session, razorpay, make_shop, admin):
    shop, sid = make_shop()
    assert client.put(f"{API}/admin/shops/{sid}/location", headers=admin, json={"latitude": "95", "longitude": "80"}).status_code == 422
    r = client.put(f"{API}/admin/shops/{sid}/location", headers=admin, json={"latitude": "13.1", "longitude": "80.3"})
    assert D(r.json()["latitude"]) == D("13.1")
    oid, _ = placed_order(client, student, seeded, db_session, razorpay)
    client.post(f"{API}/shops/me/orders/{oid}/reject", headers=shop, json={"reason": "No stock"})
    p = client.get(f"{API}/admin/shops/{sid}/performance", headers=admin).json()
    assert p["rejections"] == 1 and p["orders_assigned"] == 0
    listed = client.get(f"{API}/admin/shops", headers=admin, params={"status": "approved"}).json()
    assert listed[0]["colleges"] == ["Sample College (dev)"]


def test_ledger_post_is_idempotent_on_its_own(db_session, seeded):
    """Defence in depth: even if a caller repeats a posting, the same ref is only recorded once."""
    from app.modules.finance import ledger

    for _ in range(3):
        ledger.post(db_session, LedgerType.gateway_fee, D("1.23"), "unit:test-ref")
    db_session.commit()
    rows = db_session.query(LedgerEntry).filter_by(ref="unit:test-ref").all()
    assert len(rows) == 1 and rows[0].amount == D("1.23")
