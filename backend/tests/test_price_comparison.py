"""Students compare shop prices: each shop's own rate card, the standard price, choice, checkout and assignment."""
import uuid
from decimal import Decimal as D

from app.modules.orders.models import Order
from tests.helpers import API, build_order, pay


def cheaper(client, shop, factor):
    """Scale every price on the shop's rate card (e.g. 0.5 = half price)."""
    card = client.get(f"{API}/shops/me/rate-card", headers=shop).json()
    for r in card["rates"]:
        r["price_per_page"] = str((D(r["price_per_page"]) * D(str(factor))).quantize(D("0.01")))
    for b in card["bindings"]:
        b["price"] = str((D(b["price"]) * D(str(factor))).quantize(D("0.01")))
    r = client.put(f"{API}/shops/me/rate-card", headers=shop, json=card)
    assert r.status_code == 200, r.text
    return r.json()


def test_new_shop_starts_from_default_prices_and_can_change_them(client, make_shop, seeded):
    shop, _ = make_shop()
    card = client.get(f"{API}/shops/me/rate-card", headers=shop).json()
    assert len(card["rates"]) == 24 and {b["binding"] for b in card["bindings"]} == {"spiral", "calico", "soft", "hard"}
    updated = cheaper(client, shop, 0.5)
    assert D(updated["rates"][0]["price_per_page"]) < D(card["rates"][0]["price_per_page"]) or D(card["rates"][0]["price_per_page"]) == 0

    bad_gsm = {"rates": [{**card["rates"][0], "gsm": 90}], "bindings": []}
    assert client.put(f"{API}/shops/me/rate-card", headers=shop, json=bad_gsm).status_code == 422
    dup = {"rates": [card["rates"][0], card["rates"][0]], "bindings": []}
    assert client.put(f"{API}/shops/me/rate-card", headers=shop, json=dup).status_code == 422
    negative = {"rates": [{**card["rates"][0], "price_per_page": "-1"}], "bindings": []}
    assert client.put(f"{API}/shops/me/rate-card", headers=shop, json=negative).status_code == 422


def test_compare_choose_pay_and_assign_to_the_chosen_shop(client, student, seeded, db_session, razorpay, make_shop):
    busy, busy_id = make_shop("9111111111")
    cheap, cheap_id = make_shop("9111111113")
    cheaper(client, cheap, 0.5)
    oid, _ = build_order(client, student, seeded, db_session)

    options = client.get(f"{API}/orders/{oid}/shop-options", headers=student).json()
    by_id = {o["shop_id"]: o for o in options}
    assert set(by_id) == {None, busy_id, cheap_id}
    assert options[0]["shop_id"] == cheap_id  # cheapest first
    assert D(by_id[cheap_id]["total"]) < D(by_id[busy_id]["total"]) == D(by_id[None]["total"])
    assert by_id[None]["chosen"] is True  # standard price until the student picks a shop

    r = client.put(f"{API}/orders/{oid}/shop", headers=student, json={"shop_id": cheap_id})
    assert r.status_code == 200 and r.json()["chosen_shop"]["id"] == cheap_id
    quote = client.get(f"{API}/orders/{oid}/quotation", headers=student).json()
    assert D(quote["total"]) == D(by_id[cheap_id]["total"])

    _, verified = pay(client, student, oid)
    assert verified.status_code == 200, verified.text
    order = db_session.get(Order, uuid.UUID(oid))
    db_session.refresh(order)
    assert str(order.shop_id) == cheap_id
    assert D(order.quotation.total) == D(by_id[cheap_id]["total"])
    paid_printing = order.quotation.printing_amount + order.quotation.binding_amount + order.quotation.cover_amount
    assert order.commission_amount + order.shop_entitlement == paid_printing  # split of what was actually paid


def test_choice_rules_closed_shop_and_rejection(client, student, seeded, db_session, razorpay, make_shop):
    a, a_id = make_shop("9111111111")
    b, b_id = make_shop("9111111113")
    oid, _ = build_order(client, student, seeded, db_session)

    assert client.put(f"{API}/orders/{oid}/shop", headers=student, json={"shop_id": str(uuid.uuid4())}).status_code == 409
    assert client.put(f"{API}/orders/{oid}/shop", headers=student, json={"shop_id": a_id}).status_code == 200

    # The chosen shop closes before checkout: checkout asks the student to choose again.
    client.put(f"{API}/shops/me/open", headers=a, json={"is_open": False})
    assert client.post(f"{API}/orders/{oid}/checkout", headers=student).status_code == 409
    assert a_id not in {o["shop_id"] for o in client.get(f"{API}/orders/{oid}/shop-options", headers=student).json()}
    client.put(f"{API}/shops/me/open", headers=a, json={"is_open": True})

    _, verified = pay(client, student, oid)
    assert verified.status_code == 200
    order = db_session.get(Order, uuid.UUID(oid))
    db_session.refresh(order)
    assert str(order.shop_id) == a_id
    # If the chosen shop rejects, the paid order still gets printed by another shop.
    assert client.post(f"{API}/shops/me/orders/{oid}/reject", headers=a, json={"reason": "Printer broken"}).status_code == 204
    db_session.refresh(order)
    assert str(order.shop_id) == b_id


def test_shop_missing_a_needed_price_is_not_offered(client, student, seeded, db_session, make_shop):
    shop, shop_id = make_shop()
    card = client.get(f"{API}/shops/me/rate-card", headers=shop).json()
    card["rates"] = [r for r in card["rates"] if r["color"] != "color"]  # stops pricing colour pages
    assert client.put(f"{API}/shops/me/rate-card", headers=shop, json=card).status_code == 200
    oid, _ = build_order(client, student, seeded, db_session)  # page 1 is colour
    assert [o["shop_id"] for o in client.get(f"{API}/orders/{oid}/shop-options", headers=student).json()] == [None]
    assert client.put(f"{API}/orders/{oid}/shop", headers=student, json={"shop_id": shop_id}).status_code == 422
