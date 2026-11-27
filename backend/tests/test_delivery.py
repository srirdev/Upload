import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from app.modules.delivery.models import BatchShopArrival, DeliveryBatch, ShelfPhoto
from app.modules.orders.enums import OrderStatus
from app.modules.orders.models import Order
from tests.conftest import future_slot_date
from tests.helpers import API, JPG, RIDER, hdr, placed_order


def accept_and_pack(client, shop, oid):
    url = f"{API}/shops/me/orders/{oid}"
    assert client.post(f"{url}/accept", headers=shop).status_code == 200
    assert client.post(f"{url}/printing-done", headers=shop).status_code == 200
    assert client.post(f"{url}/packing-done", headers=shop).status_code == 200
    return client.post(f"{url}/handover-otp", headers=shop).json()["code"]


def run(client, rider):
    return client.get(f"{API}/riders/me/run", headers=rider).json()


def photo(client, h, bid, name="shelf.jpg", data=JPG):
    return client.post(f"{API}/delivery/batches/{bid}/shelf-photo", headers=h, files={"file": (name, data, "image/jpeg")})


def test_rider_registration_kyc_and_approval(client, login, admin, seeded):
    h = hdr(login("9333333333", "rider"))
    bad = {**RIDER, "vehicle_number": "!!"}
    assert client.post(f"{API}/riders/me", headers=h, json=bad).status_code == 422
    rid = client.post(f"{API}/riders/me", headers=h, json=RIDER).json()["id"]
    assert client.post(f"{API}/riders/me", headers=h, json=RIDER).status_code == 409
    assert client.get(f"{API}/riders/me/run", headers=h).status_code == 403  # KYC pending
    # can't approve before both documents are in; only images/PDF accepted
    assert client.post(f"{API}/admin/riders/{rid}/approve", headers=admin).status_code == 409
    assert client.post(f"{API}/riders/me/documents/dl", headers=h, files={"file": ("x.docx", b"PK", "application/zip")}).status_code in (415, 422)
    assert client.post(f"{API}/riders/me/documents/zz", headers=h, files={"file": ("a.jpg", JPG, "image/jpeg")}).status_code == 404
    for kind in ("dl", "rc"):
        assert client.post(f"{API}/riders/me/documents/{kind}", headers=h, files={"file": ("a.jpg", JPG, "image/jpeg")}).status_code == 200
    assert client.post(f"{API}/admin/riders/{rid}/reject", headers=admin, json={"reason": "Blurry licence"}).status_code == 200
    me = client.get(f"{API}/riders/me", headers=h).json()
    assert me["kyc_status"] == "rejected" and me["kyc_note"] == "Blurry licence"
    client.post(f"{API}/riders/me/documents/dl", headers=h, files={"file": ("a.jpg", JPG, "image/jpeg")})  # resubmit
    assert client.get(f"{API}/riders/me", headers=h).json()["kyc_status"] == "pending"
    assert client.get(f"{API}/admin/riders/{rid}/documents", headers=admin).json()["dl_url"].startswith("https://files.test/kyc/")
    assert client.post(f"{API}/admin/riders/{rid}/approve", headers=admin).status_code == 200
    assert client.get(f"{API}/riders/me/run", headers=h).json() is None


def test_accepted_order_creates_batch_offered_to_rider(client, student, seeded, db_session, razorpay, make_shop, make_rider):
    shop, _ = make_shop()
    rider, _ = make_rider()
    oid, _ = placed_order(client, student, seeded, db_session, razorpay)
    assert run(client, rider) is None  # nothing until the shop accepts
    accept_and_pack(client, shop, oid)
    r = run(client, rider)
    assert r["status"] == "offered" and r["shop_count"] == 1 and r["packet_count"] == 1
    assert r["route_distance_km"] is not None and Decimal(r["route_distance_km"]) > 0
    assert r["guaranteed_payout"] == "60.00"  # 40 + 0 + 3 is below the 60 minimum guarantee
    assert r["shops"][0]["maps_url"].startswith("https://www.google.com/maps/dir/?api=1&destination=13.0827")
    assert r["college"]["security_cabin"] == "Main gate security cabin"
    # coordinates for the rider's route map (same points the Google Maps links use)
    assert abs(r["shops"][0]["latitude"] - 13.0827) < 0.01 and isinstance(r["shops"][0]["longitude"], float)
    assert r["college"]["latitude"] is None or isinstance(r["college"]["latitude"], float)
    assert "student" not in str(r).lower()  # riders never see student details


def test_decline_goes_to_next_rider_and_backup_is_last_resort(client, student, seeded, db_session, razorpay, make_shop, make_rider):
    shop, _ = make_shop()
    a, _ = make_rider("9333333331")
    backup, _ = make_rider("9333333332", backup=True)
    oid, _ = placed_order(client, student, seeded, db_session, razorpay)
    accept_and_pack(client, shop, oid)
    assert run(client, a)["status"] == "offered" and run(client, backup) is None  # primary first
    bid = run(client, a)["id"]
    assert client.post(f"{API}/delivery/batches/{bid}/decline", headers=a).status_code == 204
    assert run(client, a) is None and run(client, backup)["status"] == "offered"  # falls back to the backup
    assert client.post(f"{API}/delivery/batches/{bid}/decline", headers=backup).status_code == 204
    assert db_session.get(DeliveryBatch, uuid.UUID(bid)).status.value == "unassigned"  # nobody left; admin can assign
    # strangers can't act on someone else's run
    assert client.post(f"{API}/delivery/batches/{bid}/accept", headers=a).status_code == 404


def test_pickup_otp_rules(client, student, seeded, db_session, razorpay, make_shop, make_rider):
    shop, _ = make_shop()
    rider, _ = make_rider()
    oid, _ = placed_order(client, student, seeded, db_session, razorpay)
    url = f"{API}/shops/me/orders/{oid}"
    client.post(f"{url}/accept", headers=shop)
    bid = run(client, rider)["id"]
    d = f"{API}/delivery/batches/{bid}"
    pick = lambda code: client.post(f"{d}/pickup", headers=rider, json={"order_id": oid, "code": code})  # noqa: E731
    assert pick("1234").status_code == 409  # run not accepted yet
    client.post(f"{d}/accept", headers=rider)
    assert pick("1234").status_code == 409  # shop hasn't packed / generated a code

    client.post(f"{url}/printing-done", headers=shop)
    client.post(f"{url}/packing-done", headers=shop)
    code = client.post(f"{url}/handover-otp", headers=shop).json()["code"]
    wrong = "0000" if code != "0000" else "1111"
    assert pick(wrong).status_code == 400
    assert pick(code[:3]).status_code == 422
    for _ in range(4):
        pick(wrong)
    assert pick(code).status_code == 423  # locked after 5 attempts, even for the right code
    code = client.post(f"{url}/handover-otp", headers=shop).json()["code"]  # shop regenerates
    r = pick(code)
    assert r.status_code == 200 and r.json()["shops"][0]["orders"][0]["status"] == "picked_up"
    assert client.get(f"{API}/orders/{oid}", headers=student).json()["status"] == "handover_verified"
    assert pick(code).status_code == 404  # can't reuse
    assert "rider_pickup" in [n["kind"] for n in client.get(f"{API}/notifications", headers=student).json()["items"]]


def deliver(client, student_oid, rider, shop, student):
    """Helper: accept → pack → pick up → depart; returns (batch id, d)."""
    code = accept_and_pack(client, shop, student_oid)
    r = run(client, rider)
    bid, d = r["id"], f"{API}/delivery/batches/{r['id']}"
    client.post(f"{d}/accept", headers=rider)
    assert client.post(f"{d}/pickup", headers=rider, json={"order_id": student_oid, "code": code}).status_code == 200
    return bid, d


def test_full_delivery_with_photo_payout_history_and_collect(client, student, seeded, db_session, razorpay, make_shop, make_rider):
    shop, _ = make_shop()
    rider, _ = make_rider()
    oid, _ = placed_order(client, student, seeded, db_session, razorpay)
    bid, d = deliver(client, oid, rider, shop, student)

    assert client.post(f"{d}/complete", headers=rider).status_code == 409  # not departed yet
    assert client.post(f"{d}/depart", headers=rider).json()["status"] == "out_for_delivery"
    assert client.get(f"{API}/orders/{oid}", headers=student).json()["status"] == "out_for_delivery"
    # completion needs a real image on the shelf photo
    assert client.post(f"{d}/complete", headers=rider).status_code == 409
    assert photo(client, rider, bid, "x.jpg", b"not an image").status_code == 415
    assert client.post(f"{d}/complete", headers=rider).status_code == 409
    assert photo(client, rider, bid).json()["shelf_photo_count"] == 1
    done = client.post(f"{d}/complete", headers=rider).json()
    assert done["status"] == "completed" and done["guaranteed_payout"] == "60.00"
    assert client.post(f"{d}/complete", headers=rider).status_code == 409  # not twice

    detail = client.get(f"{API}/orders/{oid}", headers=student).json()
    assert detail["status"] == "delivered" and detail["can_collect"]
    assert detail["shelf_photo_url"].startswith("https://files.test/shelf/")
    kinds = [n["kind"] for n in client.get(f"{API}/notifications", headers=student).json()["items"]]
    assert {"delivered", "shelf_photo", "out_for_delivery"} <= set(kinds)
    assert client.post(f"{API}/orders/{oid}/collect", headers=student).json()["status"] == "collected"

    hist = client.get(f"{API}/riders/me/history", headers=rider).json()
    assert len(hist) == 1 and hist[0]["packet_count"] == 1 and hist[0]["payout"] == "60.00" and hist[0]["shelf_photo_url"]
    e = client.get(f"{API}/riders/me/earnings", headers=rider).json()
    assert e["today"] == "60.00" and e["this_week"] == "60.00" and e["unsettled"] == "60.00"
    assert e["last_trip"]["base_fee"] == "40.00" and e["last_trip"]["packet_bonus"] == "3.00"
    # the shop is credited once the packet is handed over
    assert client.get(f"{API}/shops/me/dashboard", headers=shop).json()["total_earnings"] == "78.84"


def test_multi_shop_run_pays_extra_shop_fee_and_bonus(client, student, seeded, db_session, razorpay, make_shop, make_rider, login):
    s1, _ = make_shop("9111111111")
    s2, _ = make_shop("9222222222")
    rider, _ = make_rider()
    # two orders; least-loaded assignment spreads them over both shops
    o1, _ = placed_order(client, student, seeded, db_session, razorpay)
    o2, _ = placed_order(client, student, seeded, db_session, razorpay)
    holds = lambda h, oid: any(x["id"] == oid for x in client.get(f"{API}/shops/me/orders", headers=h).json())  # noqa: E731
    shops_for = {o1: s1 if holds(s1, o1) else s2}
    shops_for[o2] = s2 if shops_for[o1] is s1 else s1
    assert holds(shops_for[o2], o2)  # the second order went to the other, less-loaded shop
    codes = {oid: accept_and_pack(client, shops_for[oid], oid) for oid in (o1, o2)}
    r = run(client, rider)
    assert r["shop_count"] == 2 and r["packet_count"] == 2
    assert r["guaranteed_payout"] == "61.00"  # 40 base + 15 extra shop + 2 x 3 bonus
    d = f"{API}/delivery/batches/{r['id']}"
    client.post(f"{d}/accept", headers=rider)
    # depart is blocked until every packet is picked up or skipped
    assert client.post(f"{d}/pickup", headers=rider, json={"order_id": o1, "code": codes[o1]}).status_code == 200
    assert client.post(f"{d}/depart", headers=rider).status_code == 409
    client.post(f"{d}/pickup", headers=rider, json={"order_id": o2, "code": codes[o2]})
    client.post(f"{d}/depart", headers=rider)
    photo(client, rider, r["id"])
    assert client.post(f"{d}/complete", headers=rider).json()["guaranteed_payout"] == "61.00"


def test_four_minute_no_wait_rule_skips_and_rolls_over(client, student, seeded, db_session, razorpay, make_shop, make_rider):
    shop, sid = make_shop()
    rider, _ = make_rider()
    oid, _ = placed_order(client, student, seeded, db_session, razorpay)
    client.post(f"{API}/shops/me/orders/{oid}/accept", headers=shop)  # accepted but never packed
    r = run(client, rider)
    bid, d = r["id"], f"{API}/delivery/batches/{r['id']}"
    shop_id = r["shops"][0]["shop_id"]
    client.post(f"{d}/accept", headers=rider)

    assert client.post(f"{d}/not-ready", headers=rider, json={"shop_id": shop_id}).status_code == 409  # not arrived
    assert client.post(f"{d}/arrive", headers=rider, json={"shop_id": shop_id}).status_code == 200
    r = run(client, rider)
    assert r["shops"][0]["can_mark_not_ready"] is False
    assert client.post(f"{d}/not-ready", headers=rider, json={"shop_id": shop_id}).status_code == 409  # < 4 min

    arrival = db_session.get(BatchShopArrival, (uuid.UUID(bid), uuid.UUID(shop_id)))
    arrival.arrived_at = datetime.now(UTC) - timedelta(minutes=5)
    db_session.commit()
    assert run(client, rider)["shops"][0]["can_mark_not_ready"] is True
    order = db_session.get(Order, uuid.UUID(oid))
    old_slot = order.slot_id
    assert client.post(f"{d}/not-ready", headers=rider, json={"shop_id": shop_id}).json()["skipped"] == [order.code]

    db_session.refresh(order)
    assert order.slot_id != old_slot  # moved to the next slot
    assert order.status == OrderStatus.printing  # still being produced
    assert db_session.query(DeliveryBatch).count() == 2  # a new run exists for the next slot
    assert "order_delayed" in [n["kind"] for n in client.get(f"{API}/notifications", headers=student).json()["items"]]
    # with every packet skipped, the rider can close the trip and still gets the minimum guarantee
    r = run(client, rider)
    assert r["can_depart"] is False and r["can_close_empty"] is True
    assert client.post(f"{d}/close-empty", headers=rider).status_code == 200
    assert db_session.get(DeliveryBatch, uuid.UUID(bid)).payout_total == Decimal("60.00")
    assert client.get(f"{API}/riders/me/earnings", headers=rider).json()["today"] == "60.00"


def test_direct_shop_delivery(client, student, seeded, db_session, razorpay, make_shop, make_rider):
    shop, _ = make_shop()
    other, _ = make_shop("9222222222", open_=False)
    rider, _ = make_rider()
    oid, _ = placed_order(client, student, seeded, db_session, razorpay)
    url = f"{API}/shops/me/orders/{oid}"
    client.post(f"{url}/accept", headers=shop)
    assert client.post(f"{url}/direct-delivery", headers=shop).status_code == 409  # must be packed first
    client.post(f"{url}/printing-done", headers=shop)
    client.post(f"{url}/packing-done", headers=shop)
    assert client.post(f"{url}/direct-delivery", headers=other).status_code == 404
    bid = client.post(f"{url}/direct-delivery", headers=shop).json()["batch_id"]
    assert client.get(f"{API}/orders/{oid}", headers=student).json()["status"] == "out_for_delivery"
    v = client.get(f"{API}/shops/me/orders", headers=shop, params={"tab": "finished"}).json()[0]
    assert v["next_action"] == "complete_delivery" and v["direct_batch_id"] == bid

    d = f"{API}/delivery/batches/{bid}"
    assert client.post(f"{d}/complete", headers=shop).status_code == 409  # photo first
    assert client.post(f"{d}/shelf-photo", headers=other, files={"file": ("a.jpg", JPG, "image/jpeg")}).status_code == 404
    assert client.post(f"{d}/shelf-photo", headers=rider, files={"file": ("a.jpg", JPG, "image/jpeg")}).status_code == 404
    assert client.post(f"{d}/shelf-photo", headers=shop, files={"file": ("a.jpg", JPG, "image/jpeg")}).status_code == 200
    assert client.post(f"{d}/complete", headers=shop).json()["status"] == "completed"
    assert db_session.get(DeliveryBatch, uuid.UUID(bid)).payout_total is None  # no rider payout on direct trips
    assert client.get(f"{API}/orders/{oid}", headers=student).json()["shelf_photo_url"]
    # the rider never saw this order
    assert run(client, rider) is None


def test_roles_are_isolated(client, student, make_rider, make_shop, seeded):
    rider, _ = make_rider()
    for path in ("/orders", "/students/me/profile", "/shops/me/orders", "/admin/shops"):
        assert client.get(f"{API}{path}", headers=rider).status_code == 403, path
    assert client.get(f"{API}/riders/me/run", headers=student).status_code == 403
    shop, _ = make_shop()
    assert client.get(f"{API}/riders/me/run", headers=shop).status_code == 403
    assert client.post(f"{API}/delivery/batches/{uuid.uuid4()}/accept", headers=rider).status_code == 404
