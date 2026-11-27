import uuid
from decimal import Decimal

from app.modules.auth.models import Role, User
from app.modules.orders.enums import OrderStatus
from app.modules.orders.models import Order, OrderEvent
from app.modules.shops.models import HandoverOtp, Settlement, SettlementStatus, ShopProfile
from tests.helpers import API, REG, hdr, placed_order, tab

def test_registration_validation_and_approval_gate(client, login, make_shop):
    h = hdr(login("9111111111", "shop"))
    assert client.post(f"{API}/shops/me", headers=h, json={**REG, "accept_terms": False}).status_code == 422
    no_payout = {k: v for k, v in REG.items() if k != "upi_id"}
    assert client.post(f"{API}/shops/me", headers=h, json=no_payout).status_code == 422
    assert client.post(f"{API}/shops/me", headers=h, json=REG).status_code == 201
    assert client.post(f"{API}/shops/me", headers=h, json=REG).status_code == 409
    # pending shops cannot do anything operational
    assert client.get(f"{API}/shops/me/orders", headers=h).status_code == 403
    assert client.put(f"{API}/shops/me/open", headers=h, json={"is_open": True}).status_code == 403
    assert client.get(f"{API}/shops/me", headers=h).json()["status"] == "pending"


def test_only_admin_can_approve_and_roles_are_enforced(client, login, student, make_shop):
    h, sid = make_shop(approve=False)
    assert client.post(f"{API}/admin/shops/{sid}/approve", headers=h).status_code == 403
    assert client.post(f"{API}/admin/shops/{sid}/approve", headers=student).status_code == 403
    assert client.get(f"{API}/shops/me/orders", headers=student).status_code == 403  # students are not shops


def test_order_is_assigned_to_open_shop_with_commission_split(client, student, seeded, db_session, razorpay, make_shop):
    h, _ = make_shop()
    oid, _ = placed_order(client, student, seeded, db_session, razorpay)
    new = tab(client, h, "new")
    assert len(new) == 1 and new[0]["next_action"] == "accept"
    # printing 18.20? quote base = printing 17.60 + binding 60 + cover 10 = 87.60; 10% commission -> 78.84
    assert new[0]["entitlement"] == "78.84"
    order = db_session.get(Order, uuid.UUID(oid))
    assert order.commission_amount == Decimal("8.76") and order.commission_percent == Decimal("10.00")


def test_order_waits_until_a_shop_opens(client, student, seeded, db_session, razorpay, make_shop):
    h, _ = make_shop(open_=False)
    oid, _ = placed_order(client, student, seeded, db_session, razorpay)
    assert tab(client, h, "new") == []
    assert db_session.get(Order, uuid.UUID(oid)).shop_id is None
    client.put(f"{API}/shops/me/open", headers=h, json={"is_open": True})
    assert len(tab(client, h, "new")) == 1


def test_full_shop_workflow_and_student_sees_progress(client, student, seeded, db_session, razorpay, make_shop):
    h, _ = make_shop()
    oid, doc = placed_order(client, student, seeded, db_session, razorpay)
    # files are locked until the shop accepts
    url = f"{API}/shops/me/orders/{oid}"
    assert client.get(f"{url}/documents/{doc['id']}/url", headers=h).status_code == 409
    assert client.post(f"{url}/printing-done", headers=h).status_code == 409  # can't skip accept

    assert client.post(f"{url}/accept", headers=h).json()["next_action"] == "printing_done"
    assert client.get(f"{API}/orders/{oid}", headers=student).json()["status"] == "printing"
    assert client.post(f"{API}/orders/{oid}/cancel", headers=student).status_code == 409  # printing started
    assert client.post(f"{url}/accept", headers=h).status_code == 409  # not twice

    assert client.get(f"{url}/documents/{doc['id']}/url", headers=h).json()["url"].startswith("https://files.test/orders/")
    assert client.post(f"{url}/handover-otp", headers=h).status_code == 409  # not packed yet
    assert client.post(f"{url}/printing-done", headers=h).json()["next_action"] == "packing_done"
    assert client.post(f"{url}/handover-otp", headers=h).status_code == 409
    assert client.post(f"{url}/packing-done", headers=h).json()["next_action"] == "handover_otp"
    assert client.post(f"{url}/packing-done", headers=h).status_code == 409

    code = client.post(f"{url}/handover-otp", headers=h).json()["code"]
    assert len(code) == 4 and code.isdigit()
    client.post(f"{url}/handover-otp", headers=h)  # regenerate replaces the stored hash
    db_session.expire_all()
    assert db_session.query(HandoverOtp).count() == 1

    assert len(tab(client, h, "pending")) == 1 and tab(client, h, "new") == []
    d = client.get(f"{API}/orders/{oid}", headers=student).json()
    assert [s["done"] for s in d["timeline"]][:3] == [True, True, True]
    kinds = [n["kind"] for n in client.get(f"{API}/notifications", headers=student).json()["items"]]
    assert "printing_started" in kinds


def test_pdfs_for_cover_and_label(client, student, seeded, db_session, razorpay, make_shop):
    h, _ = make_shop()
    oid, doc = placed_order(client, student, seeded, db_session, razorpay)
    url = f"{API}/shops/me/orders/{oid}"
    assert client.get(f"{url}/label.pdf", headers=h).status_code == 409  # before accept
    client.post(f"{url}/accept", headers=h)
    lab = client.get(f"{url}/label.pdf", headers=h)
    cov = client.get(f"{url}/cover.pdf", headers=h, params={"document_id": doc["id"]})
    assert lab.status_code == cov.status_code == 200
    assert lab.content.startswith(b"%PDF") and cov.content.startswith(b"%PDF")
    assert cov.headers["content-type"] == "application/pdf"


def test_reject_reassigns_to_another_shop_and_never_back(client, student, seeded, db_session, razorpay, make_shop):
    a, _ = make_shop("9111111111")
    oid, _ = placed_order(client, student, seeded, db_session, razorpay)
    assert client.post(f"{API}/shops/me/orders/{oid}/reject", headers=a, json={"reason": ""}).status_code == 422
    b, _ = make_shop("9222222222")
    # orders go to the least-loaded shop; whichever has it rejects it
    holder, other = (a, b) if tab(client, a, "new") else (b, a)
    assert client.post(f"{API}/shops/me/orders/{oid}/reject", headers=holder, json={"reason": "Printer broken"}).status_code == 204
    assert tab(client, holder, "new") == [] and len(tab(client, other, "new")) == 1
    assert client.post(f"{API}/shops/me/orders/{oid}/reject", headers=other, json={"reason": "No paper"}).status_code == 204
    # nobody left: stays unassigned for admin, and is not re-offered to either shop
    assert tab(client, holder, "new") == [] and tab(client, other, "new") == []
    assert db_session.get(Order, uuid.UUID(oid)).status == OrderStatus.placed


def test_admin_can_assign_waiting_order(client, student, seeded, db_session, razorpay, make_shop, admin):
    h, sid = make_shop(open_=False)
    oid, _ = placed_order(client, student, seeded, db_session, razorpay)
    assert client.post(f"{API}/admin/orders/{oid}/assign-shop", headers=admin, json={"shop_id": sid}).status_code == 204
    assert len(tab(client, h, "new")) == 1


def test_shops_cannot_touch_each_others_orders(client, student, seeded, db_session, razorpay, make_shop):
    a, _ = make_shop("9111111111")
    oid, _ = placed_order(client, student, seeded, db_session, razorpay)
    b, _ = make_shop("9222222222", open_=False)
    for action in ("accept", "printing-done", "handover-otp"):
        assert client.post(f"{API}/shops/me/orders/{oid}/{action}", headers=b).status_code == 404
    assert client.get(f"{API}/shops/me/orders/{oid}/label.pdf", headers=b).status_code == 404


def test_dashboard_and_accounting(client, student, seeded, db_session, razorpay, make_shop):
    h, sid = make_shop()
    oid, _ = placed_order(client, student, seeded, db_session, razorpay)
    d = client.get(f"{API}/shops/me/dashboard", headers=h).json()
    assert (d["orders_today"], d["new_orders"], d["pending_orders"], d["weekly_earnings"], d["total_earnings"]) == (1, 1, 0, "0.00", "0.00")

    order = db_session.get(Order, uuid.UUID(oid))
    from app.modules.orders.service import set_status
    set_status(db_session, order, OrderStatus.handover_verified)  # normally done by the rider in Phase 5
    db_session.commit()
    d = client.get(f"{API}/shops/me/dashboard", headers=h).json()
    assert d["weekly_earnings"] == "78.84" and d["total_earnings"] == "78.84" and d["pending_orders"] == 0
    assert len(tab(client, h, "finished")) == 1

    acc = client.get(f"{API}/shops/me/accounting", headers=h).json()
    assert acc["unsettled_orders"] == 1 and acc["unsettled_amount"] == "78.84" and acc["settlements"] == []
    from datetime import date
    s = Settlement(shop_id=uuid.UUID(sid), period_start=date(2026, 1, 5), period_end=date(2026, 1, 11), order_count=1,
                   gross_amount=Decimal("78.84"), net_amount=Decimal("78.84"), status=SettlementStatus.paid, upi_reference="UTR123")
    db_session.add(s)
    db_session.flush()
    order.settlement_id = s.id
    db_session.commit()
    acc = client.get(f"{API}/shops/me/accounting", headers=h).json()
    assert acc["unsettled_orders"] == 0 and acc["settlements"][0]["upi_reference"] == "UTR123"
