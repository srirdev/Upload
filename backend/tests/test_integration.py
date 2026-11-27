"""Phase 7: whole-platform scenarios. Each test drives the real API like the four portals do."""
import uuid
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

import pytest

from app.modules.colleges.models import CollegeSlot
from app.modules.delivery.models import BatchShopArrival, DeliveryBatch
from app.modules.finance.models import LedgerEntry
from app.modules.orders.enums import OrderStatus
from app.modules.orders.models import Order
from app.modules.payments.models import Payment
from tests.conftest import future_slot_date
from tests.helpers import API, JPG, build_order, hdr, pay, placed_order
from tests.test_admin import D, complain, deliver_fully, totals, week
from tests.test_delivery import accept_and_pack, photo, run
from tests.test_orders import sign, webhook_body


def status_of(client, h, oid):
    return client.get(f"{API}/orders/{oid}", headers=h).json()["status"]


def timeline_done(client, h, oid):
    return [s["done"] for s in client.get(f"{API}/orders/{oid}", headers=h).json()["timeline"]]


def test_student_to_cabin_to_collection_and_everyone_gets_paid(client, student, seeded, db_session, razorpay, make_shop, make_rider, admin, login):
    """Student -> shop -> rider -> security cabin -> shelf photo -> student collection -> settlements."""
    shop, _ = make_shop()
    rider, _ = make_rider()
    other_student = hdr(login("9123456780"))  # must never see any of this

    oid, doc = placed_order(client, student, seeded, db_session, razorpay)
    assert status_of(client, student, oid) == "placed" and timeline_done(client, student, oid) == [True] + [False] * 5
    assert client.get(f"{API}/orders/{oid}", headers=other_student).status_code == 404

    # shop production
    code = accept_and_pack(client, shop, oid)
    assert status_of(client, student, oid) == "packing" and timeline_done(client, student, oid) == [True, True, True, False, False, False]

    # rider pickup with the 4-digit handover code
    r = run(client, rider)
    d = f"{API}/delivery/batches/{r['id']}"
    client.post(f"{d}/accept", headers=rider)
    assert client.post(f"{d}/pickup", headers=rider, json={"order_id": oid, "code": code}).status_code == 200
    assert status_of(client, student, oid) == "handover_verified"

    # delivery to the cabin requires the shelf photo
    client.post(f"{d}/depart", headers=rider)
    assert timeline_done(client, student, oid) == [True] * 5 + [False]
    assert client.post(f"{d}/complete", headers=rider).status_code == 409
    photo(client, rider, r["id"])
    client.post(f"{d}/complete", headers=rider)

    detail = client.get(f"{API}/orders/{oid}", headers=student).json()
    assert detail["status"] == "delivered" and all(s["done"] for s in detail["timeline"])
    assert detail["shelf_photo_url"] and detail["college"]["security_cabin"] and detail["can_collect"]
    assert client.get(f"{API}/orders/{oid}", headers=other_student).status_code == 404

    # student collects (no OTP needed)
    assert client.post(f"{API}/orders/{oid}/collect", headers=student).json()["status"] == "collected"
    assert client.post(f"{API}/orders/{oid}/collect", headers=student).status_code == 409

    # the student was kept informed at each step
    kinds = {n["kind"] for n in client.get(f"{API}/notifications", headers=student).json()["items"]}
    assert {"order_placed", "printing_started", "rider_pickup", "out_for_delivery", "delivered", "shelf_photo"} <= kinds

    # money: everything reconciles and payouts happen exactly once
    t = totals(client, admin)
    assert t["gross_revenue"] == D("102.60")
    assert t["net_platform_margin"] == t["gross_revenue"] - t["shop_entitlement"] - t["rider_payout"] - t["gateway_fee"]
    assert client.post(f"{API}/admin/settlements/shops/generate", headers=admin, json=week()).status_code == 201
    assert client.post(f"{API}/admin/settlements/riders/generate", headers=admin, json=week()).status_code == 201
    for kind in ("shops", "riders"):
        s = client.get(f"{API}/admin/settlements/{kind}", headers=admin).json()[0]
        assert client.post(f"{API}/admin/settlements/{kind}/{s['id']}/pay", headers=admin, json={"upi_reference": "UTR0001"}).status_code == 200
        assert client.post(f"{API}/admin/settlements/{kind}/{s['id']}/pay", headers=admin, json={"upi_reference": "UTR0001"}).status_code == 409
    assert client.get(f"{API}/shops/me/accounting", headers=shop).json()["unsettled_orders"] == 0
    assert client.get(f"{API}/riders/me/earnings", headers=rider).json()["unsettled"] == "0.00"


def test_direct_shop_delivery_end_to_end(client, student, seeded, db_session, razorpay, make_shop, admin):
    shop, _ = make_shop()
    oid, _ = placed_order(client, student, seeded, db_session, razorpay)
    accept_and_pack(client, shop, oid)
    bid = client.post(f"{API}/shops/me/orders/{oid}/direct-delivery", headers=shop).json()["batch_id"]
    client.post(f"{API}/delivery/batches/{bid}/shelf-photo", headers=shop, files={"file": ("s.jpg", JPG, "image/jpeg")})
    assert client.post(f"{API}/delivery/batches/{bid}/complete", headers=shop).status_code == 200
    d = client.get(f"{API}/orders/{oid}", headers=student).json()
    assert d["status"] == "delivered" and d["shelf_photo_url"]
    t = totals(client, admin)
    assert t["rider_payout"] == 0 and t["shop_entitlement"] == D("78.84")  # shop earns; no rider cost on direct trips
    assert client.get(f"{API}/admin/ops/custody", headers=admin).json()[0]["batch_mode"] == "direct"


def test_shop_failure_chain_then_admin_rescues_the_order(client, student, seeded, db_session, razorpay, make_shop, make_rider, admin):
    a, _ = make_shop("9111111111")
    oid, _ = placed_order(client, student, seeded, db_session, razorpay)
    assert client.post(f"{API}/shops/me/orders/{oid}/reject", headers=a, json={"reason": "Printer is down"}).status_code == 204
    assert status_of(client, student, oid) == "placed"  # student's order is not lost
    assert client.get(f"{API}/admin/ops/summary", headers=admin).json()["unassigned_orders"] == 1
    b, sid_b = make_shop("9222222222")  # a second shop joins; the waiting order is offered to it automatically
    assert any(x["id"] == oid for x in client.get(f"{API}/shops/me/orders", headers=b).json())
    rider, _ = make_rider()
    deliver = accept_and_pack(client, b, oid)
    r = run(client, rider)
    d = f"{API}/delivery/batches/{r['id']}"
    client.post(f"{d}/accept", headers=rider)
    client.post(f"{d}/pickup", headers=rider, json={"order_id": oid, "code": deliver})
    client.post(f"{d}/depart", headers=rider)
    photo(client, rider, r["id"])
    client.post(f"{d}/complete", headers=rider)
    assert status_of(client, student, oid) == "delivered"
    assert client.get(f"{API}/shops/me/dashboard", headers=a).json()["total_earnings"] == "0.00"  # rejecting shop earns nothing


def test_rider_failure_chain_decline_backup_skip_and_next_slot_delivery(client, student, seeded, db_session, razorpay, make_shop, make_rider, admin):
    shop, _ = make_shop()
    primary, _ = make_rider("9333333331")
    backup, _ = make_rider("9333333332", backup=True)
    oid, _ = placed_order(client, student, seeded, db_session, razorpay)
    client.post(f"{API}/shops/me/orders/{oid}/accept", headers=shop)  # accepted, still being printed
    morning = db_session.get(Order, uuid.UUID(oid)).slot_id

    first = run(client, primary)
    assert client.post(f"{API}/delivery/batches/{first['id']}/decline", headers=primary).status_code == 204
    assert run(client, backup)["id"] == first["id"]  # the backup rider is next in line
    d1 = f"{API}/delivery/batches/{first['id']}"
    client.post(f"{d1}/accept", headers=backup)
    shop_id = first["shops"][0]["shop_id"]
    client.post(f"{d1}/arrive", headers=backup, json={"shop_id": shop_id})
    assert client.post(f"{d1}/not-ready", headers=backup, json={"shop_id": shop_id}).status_code == 409  # inside the 4 minutes
    db_session.get(BatchShopArrival, (uuid.UUID(first["id"]), uuid.UUID(shop_id))).arrived_at = datetime.now(UTC) - timedelta(minutes=5)
    db_session.commit()
    assert client.post(f"{d1}/not-ready", headers=backup, json={"shop_id": shop_id}).json()["skipped"]
    assert client.post(f"{d1}/close-empty", headers=backup).status_code == 200  # backup still gets the guarantee

    order = db_session.get(Order, uuid.UUID(oid))
    assert order.slot_id != morning and order.status == OrderStatus.printing  # rolled over to the next slot
    assert "order_delayed" in [n["kind"] for n in client.get(f"{API}/notifications", headers=student).json()["items"]]

    # the shop finishes; the primary rider (who declined only the first run) gets the new run and delivers
    code = client.post(f"{API}/shops/me/orders/{oid}/printing-done", headers=shop) and None
    client.post(f"{API}/shops/me/orders/{oid}/packing-done", headers=shop)
    code = client.post(f"{API}/shops/me/orders/{oid}/handover-otp", headers=shop).json()["code"]
    second = run(client, primary)
    assert second and second["id"] != first["id"]
    d2 = f"{API}/delivery/batches/{second['id']}"
    client.post(f"{d2}/accept", headers=primary)
    assert client.post(f"{d2}/pickup", headers=primary, json={"order_id": oid, "code": code}).status_code == 200
    client.post(f"{d2}/depart", headers=primary)
    photo(client, primary, second["id"])
    client.post(f"{d2}/complete", headers=primary)
    assert all(timeline_done(client, student, oid))
    assert totals(client, admin)["rider_payout"] == D("120.00")  # 60 (empty-run guarantee) + 60 (delivery)


# ---- payment failures & duplicates ------------------------------------------------------------


def test_payment_failure_and_replays(client, student, seeded, db_session, razorpay, make_shop, admin):
    oid, _ = build_order(client, student, seeded, db_session)
    gw, bad = pay(client, student, oid, good=False)
    assert bad.status_code == 400 and status_of(client, student, oid) == "awaiting_payment"
    assert totals(client, admin)["gross_revenue"] == 0  # a failed verification books nothing

    body = webhook_body(gw, 10260, "payment.failed")
    hook = lambda b, eid: client.post(f"{API}/payments/webhook", content=b, headers={  # noqa: E731
        "X-Razorpay-Signature": sign("whsec_test", b), "X-Razorpay-Event-Id": eid})
    assert hook(body, "evt_f1").status_code == 200
    assert db_session.query(Payment).one().status.value == "failed"
    # the student retries: a fresh checkout works, and a captured webhook delivered twice only counts once
    gw2 = client.post(f"{API}/orders/{oid}/checkout", headers=student).json()["razorpay_order_id"]
    ok = webhook_body(gw2, 10260)
    assert hook(ok, "evt_c1").json()["status"] == "ok"
    assert hook(ok, "evt_c1").json()["status"] == "duplicate"
    assert hook(ok, "evt_c2").status_code == 200  # a different event id for the same payment is also harmless
    assert status_of(client, student, oid) == "placed"
    assert totals(client, admin)["gross_revenue"] == D("102.60")
    assert db_session.query(LedgerEntry).filter(LedgerEntry.ref.like("gross:%")).count() == 1


def test_cancel_before_printing_pays_back_and_frees_the_shop(client, student, seeded, db_session, razorpay, make_shop, admin):
    shop, _ = make_shop()
    oid, _ = placed_order(client, student, seeded, db_session, razorpay)
    assert len(client.get(f"{API}/shops/me/orders", headers=shop).json()) == 1
    client.post(f"{API}/orders/{oid}/cancel", headers=student)
    assert client.get(f"{API}/shops/me/orders", headers=shop).json() == []  # gone from the shop's queue
    assert client.post(f"{API}/shops/me/orders/{oid}/accept", headers=shop).status_code == 409
    rf = client.get(f"{API}/admin/refunds", headers=admin, params={"status": "requested"}).json()[0]
    client.post(f"{API}/admin/refunds/{rf['id']}/approve", headers=admin, json={})
    client.post(f"{API}/admin/refunds/{rf['id']}/record", headers=admin, json={"provider_ref": "rfnd_X1"})
    t = totals(client, admin)
    assert t["refund"] == D("102.60") and t["shop_entitlement"] == 0
    assert t["net_platform_margin"] == -t["gateway_fee"]  # the only cost left is the gateway fee


def test_duplicate_requests_are_harmless(client, student, seeded, db_session, razorpay, make_shop, make_rider, admin):
    shop, _ = make_shop()
    rider, _ = make_rider()
    oid, _ = placed_order(client, student, seeded, db_session, razorpay)
    url = f"{API}/shops/me/orders/{oid}"
    assert client.post(f"{url}/accept", headers=shop).status_code == 200
    assert client.post(f"{url}/accept", headers=shop).status_code == 409
    assert db_session.query(DeliveryBatch).count() == 1  # accepting twice never makes a second run
    client.post(f"{url}/printing-done", headers=shop)
    client.post(f"{url}/packing-done", headers=shop)
    code = client.post(f"{url}/handover-otp", headers=shop).json()["code"]
    r = run(client, rider)
    d = f"{API}/delivery/batches/{r['id']}"
    assert client.post(f"{d}/accept", headers=rider).status_code == 200
    assert client.post(f"{d}/accept", headers=rider).status_code == 409
    pick = {"order_id": oid, "code": code}
    assert client.post(f"{d}/pickup", headers=rider, json=pick).status_code == 200
    assert client.post(f"{d}/pickup", headers=rider, json=pick).status_code == 404
    assert client.post(f"{d}/depart", headers=rider).status_code == 200
    assert client.post(f"{d}/depart", headers=rider).status_code == 409
    photo(client, rider, r["id"])
    assert client.post(f"{d}/complete", headers=rider).status_code == 200
    assert client.post(f"{d}/complete", headers=rider).status_code == 409
    t = totals(client, admin)
    assert t["shop_entitlement"] == D("78.84") and t["rider_payout"] == D("60.00")  # each paid once, not twice
    assert db_session.query(LedgerEntry).filter(LedgerEntry.ref.like("shop:%")).count() == 1


# ---- permissions ------------------------------------------------------------------------------


ANY = {"student", "shop", "rider", "admin"}
MATRIX = [
    # (method, path, roles that are allowed in)
    ("get", "/orders", {"student"}), ("post", "/orders", {"student"}), ("get", "/orders/{id}", {"student"}),
    ("post", "/orders/{id}/cancel", {"student"}), ("get", "/students/me/profile", {"student"}),
    ("get", "/students/complaints", {"student"}), ("get", "/shops/me/orders", {"shop"}),
    ("get", "/shops/me/dashboard", {"shop"}), ("post", "/shops/me/orders/{id}/accept", {"shop"}),
    ("get", "/riders/me/run", {"rider"}), ("get", "/riders/me/earnings", {"rider"}),
    ("post", "/delivery/batches/{id}/accept", {"rider"}), ("post", "/delivery/batches/{id}/complete", {"shop", "rider"}),
    ("get", "/admin/ops/summary", {"admin"}), ("get", "/admin/finance/ledger", {"admin"}),
    ("post", "/admin/refunds/{id}/approve", {"admin"}), ("get", "/notifications", ANY), ("get", "/colleges", ANY),
    ("get", "/auth/me", ANY),
]


@pytest.mark.parametrize("method, path, allowed", MATRIX)
def test_role_permission_matrix(client, student, make_shop, make_rider, admin, method, path, allowed):
    shop, _ = make_shop()
    rider, _ = make_rider()
    who = {"student": student, "shop": shop, "rider": rider, "admin": admin}
    url = f"{API}{path.replace('{id}', str(uuid.uuid4()))}"
    kwargs = {"json": {}} if method == "post" else {}
    assert getattr(client, method)(url, **kwargs).status_code == 401  # signed-out
    for role, h in who.items():
        code = getattr(client, method)(url, headers=h, **kwargs).status_code
        if role in allowed:
            assert code not in (401, 403), f"{role} should reach {method} {path}, got {code}"
        else:
            assert code == 403, f"{role} must be blocked from {method} {path}, got {code}"


def test_tenants_cannot_reach_each_others_files_and_runs(client, student, seeded, db_session, razorpay, make_shop, make_rider, login):
    shop, _ = make_shop("9111111111")
    other_shop, _ = make_shop("9222222222", open_=False)
    rider, _ = make_rider("9333333331")
    other_rider, _ = make_rider("9333333332")
    other_student = hdr(login("9123456780"))
    oid, doc = placed_order(client, student, seeded, db_session, razorpay)
    cid_order = oid
    accept_and_pack(client, shop, oid)
    cid = complain(client, student, cid_order)

    u = f"{API}/orders/{oid}/documents/{doc['id']}/url"
    assert client.get(u, headers=student).status_code == 200 and client.get(u, headers=other_student).status_code == 404
    assert client.get(f"{API}/shops/me/orders/{oid}/documents/{doc['id']}/url", headers=other_shop).status_code == 404
    assert client.get(f"{API}/shops/me/orders/{oid}/label.pdf", headers=other_shop).status_code == 404
    bid = (run(client, rider) or run(client, other_rider))["id"]
    holder, stranger = (rider, other_rider) if run(client, rider) else (other_rider, rider)
    assert client.post(f"{API}/delivery/batches/{bid}/accept", headers=stranger).status_code == 404
    assert client.post(f"{API}/delivery/batches/{bid}/shelf-photo", headers=stranger, files={"file": ("a.jpg", JPG, "image/jpeg")}).status_code == 404
    assert [c["id"] for c in client.get(f"{API}/students/complaints", headers=other_student).json()] == []
    assert [c["id"] for c in client.get(f"{API}/students/complaints", headers=student).json()] == [cid]
    assert client.get(f"{API}/notifications", headers=other_student).json()["items"] == []
