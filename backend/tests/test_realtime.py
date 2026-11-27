"""Realtime WebSocket events: authentication, per-role routing, isolation and commit-only publishing."""

import pytest
from starlette.websockets import WebSocketDisconnect

from app.core import realtime
from tests.helpers import API, build_order, hdr, pay
from tests.test_delivery import accept_and_pack


def connect(client, tokens_or_headers):
    token = tokens_or_headers["Authorization"].split()[1]
    ws = client.websocket_connect(f"{API}/ws?token={token}")
    return ws


def drain(ws, until_type, limit=30):
    """Read messages until one of the given type arrives (others are returned too)."""
    seen = []
    for _ in range(limit):
        msg = ws.receive_json()
        seen.append(msg)
        if msg["type"] == until_type:
            return seen
    raise AssertionError(f"no {until_type} in {seen}")


def test_invalid_token_is_refused(client):
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect(f"{API}/ws?token=nope") as ws:
            ws.receive_json()


def test_each_role_hears_about_its_own_work(client, student, seeded, db_session, razorpay, make_shop, make_rider, admin, login):
    shop, shop_id = make_shop()
    rider, _ = make_rider()
    stranger = hdr(login("9876500000", "student"))
    oid, _ = build_order(client, student, seeded, db_session)
    with connect(client, student) as s_ws, connect(client, shop) as shop_ws, connect(client, admin) as a_ws, \
            connect(client, rider) as r_ws, connect(client, stranger) as x_ws:
        for ws in (s_ws, shop_ws, a_ws, r_ws, x_ws):
            assert ws.receive_json()["type"] == "ready"

        pay(client, student, oid)
        statuses = []
        while "placed" not in statuses:  # checkout (awaiting_payment) comes first, then the verified payment
            statuses += [m["status"] for m in drain(s_ws, "order.status") if m.get("order_id") == oid and "status" in m]
        assert statuses[-2:] == ["awaiting_payment", "placed"]
        assert any(m.get("order_id") == oid for m in drain(shop_ws, "order.assigned"))
        assert any(m.get("order_id") == oid for m in drain(a_ws, "order.assigned"))

        accept_and_pack(client, shop, oid)
        assert drain(r_ws, "batch.updated")[-1]["status"] == "offered"  # the rider is offered the run

        # Nothing about this order reached an unrelated student: a probe sent to them arrives first.
        stranger_id = client.get(f"{API}/auth/me", headers=stranger).json()["id"]
        realtime.hub.publish({f"user:{stranger_id}"}, {"type": "probe"})
        assert x_ws.receive_json() == {"type": "probe"}


def test_events_publish_only_after_commit(db_session):
    received = []
    realtime.hub.publish = lambda topics, message: received.append((topics, message))  # type: ignore[method-assign]
    try:
        realtime.emit(db_session, {"admin"}, "test.rolled_back")
        db_session.rollback()
        realtime.emit(db_session, {"admin"}, "test.committed")
        db_session.commit()
    finally:
        del realtime.hub.publish  # restore the class method
    assert [m["type"] for _, m in received] == ["test.committed"]
