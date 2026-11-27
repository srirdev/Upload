"""Shared test helpers (plain functions). Fixtures live in conftest.py."""
from tests.test_orders import API, build_order, pay  # noqa: F401

REG = {"shop_name": "Quick Prints", "owner_name": "Ravi", "latitude": "13.0827", "longitude": "80.2707",
       "area": "Guindy", "landmark": "Near bus stand", "upi_id": "ravi@okbank", "accept_terms": True}
RIDER = {"full_name": "Kumar", "base_area": "Guindy", "vehicle_number": "TN09AB1234", "upi_id": "kumar@okbank"}
JPG = bytes([0xFF, 0xD8, 0xFF, 0xE0]) + b"0" * 64


def hdr(tokens):
    return {"Authorization": f"Bearer {tokens['access_token']}"}


def tab(client, h, name):
    return client.get(f"{API}/shops/me/orders", headers=h, params={"tab": name}).json()


def placed_order(client, student, seeded, db, razorpay):
    oid, doc = build_order(client, student, seeded, db)
    pay(client, student, oid)
    return oid, doc
