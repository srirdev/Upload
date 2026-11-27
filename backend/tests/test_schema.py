"""Schema foundation (migration 0006): RBAC roles, admin bootstrap, shop services, rider availability,
status history, custody chain and database-level integrity constraints."""
import contextlib
import uuid
from decimal import Decimal
from types import SimpleNamespace

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError, StatementError

from app.modules.auth import cli
from app.modules.auth.models import AdminProfile, Role, RoleRecord, User
from app.modules.delivery.models import CustodyEvent
from app.modules.finance.models import Coupon, PlatformConfig, RateCard
from app.modules.orders.enums import OrderStatus
from app.modules.orders.models import Order, OrderEvent
from app.modules.shops.models import SERVICES, Service
from app.modules.students.models import Complaint
from tests.conftest import PASSWORD
from tests.helpers import API, REG, hdr, placed_order
from tests.test_admin import deliver_fully
from tests.test_delivery import accept_and_pack, run

ORDER_NEEDS = {"print_a4_color", "print_a4_bw", "binding_spiral"}  # what build_order() asks for


# ---- reference data & RBAC --------------------------------------------------------------------


def test_roles_and_services_are_seeded_reference_data(db_session):
    assert {r.name for r in db_session.scalars(select(RoleRecord))} == {r.value for r in Role}
    assert {s.code for s in db_session.scalars(select(Service))} == set(SERVICES)


def test_admin_bootstrap_reads_env_and_creates_profile(db_session, client, login, monkeypatch):
    monkeypatch.setattr(cli, "SessionLocal", lambda: contextlib.nullcontext(db_session))
    prompts = []
    monkeypatch.setattr(cli, "read_password", lambda: prompts.append(1) or PASSWORD)
    env = SimpleNamespace(admin_mobile="9000000077", admin_name="Ops Lead", admin_email="ops@upload.test")
    monkeypatch.setattr(cli, "get_settings", lambda: env)
    monkeypatch.setattr("sys.argv", ["cli"])
    cli.main()
    cli.main()  # idempotent: no duplicate user or profile
    user = db_session.scalar(select(User).where(User.mobile == "9000000077"))
    assert user.role == Role.admin
    assert db_session.query(AdminProfile).filter_by(user_id=user.id).count() == 1
    assert len(prompts) == 1  # password asked once, never read from .env
    me = client.get(f"{API}/admin/me", headers=hdr(login("9000000077", "admin"))).json()
    assert me == {"mobile": "9000000077", "full_name": "Ops Lead", "email": "ops@upload.test"}
    by_email = client.post(f"{API}/auth/login", json={"identifier": "ops@upload.test", "password": PASSWORD, "role": "admin"})
    assert by_email.status_code == 200

    monkeypatch.setattr("sys.argv", ["cli", "set-password", "9000000077"])
    monkeypatch.setattr(cli, "read_password", lambda: "a-brand-new-password")
    cli.main()
    assert client.post(f"{API}/auth/login", json={"identifier": "9000000077", "password": "a-brand-new-password",
                                                  "role": "admin"}).status_code == 200

    monkeypatch.setattr("sys.argv", ["cli"])
    env.admin_mobile = ""
    with pytest.raises(SystemExit):
        cli.main()  # no mobile configured -> refuses, never invents one


def test_admin_bootstrap_refuses_to_change_an_existing_role(db_session, login, monkeypatch):
    login("9000000088", "student")
    monkeypatch.setattr(cli, "SessionLocal", lambda: contextlib.nullcontext(db_session))
    monkeypatch.setattr(cli, "get_settings", lambda: SimpleNamespace(admin_mobile="9000000088", admin_name="X Y", admin_email=""))
    monkeypatch.setattr("sys.argv", ["cli"])
    with pytest.raises(SystemExit):
        cli.main()
    assert db_session.scalar(select(User.role).where(User.mobile == "9000000088")) == Role.student


# ---- shop services ----------------------------------------------------------------------------


def test_shop_services_default_to_all_and_can_be_changed(client, make_shop):
    shop, _ = make_shop()
    assert client.get(f"{API}/shops/me", headers=shop).json()["services"] == sorted(SERVICES)
    catalogue = client.get(f"{API}/shops/services", headers=shop).json()
    assert {s["code"] for s in catalogue} == set(SERVICES) and {s["category"] for s in catalogue} == {"print", "binding"}

    r = client.put(f"{API}/shops/me/services", headers=shop, json={"services": ["print_a4_bw", "binding_spiral"]})
    assert r.status_code == 200 and r.json()["services"] == ["binding_spiral", "print_a4_bw"]
    assert client.put(f"{API}/shops/me/services", headers=shop, json={"services": ["print_a5_bw"]}).status_code == 422
    assert client.put(f"{API}/shops/me/services", headers=shop, json={"services": ["binding_hard"]}).status_code == 422
    assert client.put(f"{API}/shops/me/services", headers=shop, json={"services": []}).status_code == 422


def test_orders_only_go_to_shops_offering_every_needed_service(client, student, seeded, db_session, razorpay, login, admin):
    h = hdr(login("9111111112", "shop"))
    sid = client.post(f"{API}/shops/me", headers=h, json={**REG, "services": ["print_a4_bw", "binding_spiral"]}).json()["id"]
    client.post(f"{API}/admin/shops/{sid}/approve", headers=admin)
    client.put(f"{API}/admin/shops/{sid}/colleges", headers=admin, json={"college_ids": [str(seeded.id)]})
    client.put(f"{API}/shops/me/open", headers=h, json={"is_open": True})

    oid, _ = placed_order(client, student, seeded, db_session, razorpay)
    order = db_session.get(Order, uuid.UUID(oid))
    assert order.shop_id is None  # the only open shop can't print colour

    r = client.post(f"{API}/admin/orders/{oid}/assign-shop", headers=admin, json={"shop_id": sid})
    assert r.status_code == 409 and "print_a4_color" in r.json()["detail"]

    # Once the shop adds colour printing, the waiting order is assigned to it.
    client.put(f"{API}/shops/me/services", headers=h, json={"services": sorted(ORDER_NEEDS)})
    db_session.refresh(order)
    assert str(order.shop_id) == sid


# ---- rider availability -----------------------------------------------------------------------


def test_offline_riders_get_no_offers_until_they_go_online(client, student, seeded, db_session, razorpay, make_shop, make_rider):
    shop, _ = make_shop()
    rider, _ = make_rider(online=False)
    assert client.get(f"{API}/riders/me", headers=rider).json()["is_online"] is False
    oid, _ = placed_order(client, student, seeded, db_session, razorpay)
    accept_and_pack(client, shop, oid)
    assert run(client, rider) is None

    r = client.put(f"{API}/riders/me/availability", headers=rider, json={"is_online": True})
    assert r.status_code == 200 and r.json()["is_online"] is True
    assert run(client, rider)["status"] == "offered"


def test_going_offline_passes_offers_on_and_is_blocked_mid_run(client, student, seeded, db_session, razorpay, make_shop, make_rider):
    shop, _ = make_shop()
    first, _ = make_rider()
    second, _ = make_rider("9333333334")
    oid, _ = placed_order(client, student, seeded, db_session, razorpay)
    accept_and_pack(client, shop, oid)
    offered_to = first if run(client, first) else second
    other = second if offered_to is first else first

    assert client.put(f"{API}/riders/me/availability", headers=offered_to, json={"is_online": False}).status_code == 200
    batch = run(client, other)
    assert batch["status"] == "offered"

    client.post(f"{API}/delivery/batches/{batch['id']}/accept", headers=other)
    r = client.put(f"{API}/riders/me/availability", headers=other, json={"is_online": False})
    assert r.status_code == 409


# ---- status history & custody -----------------------------------------------------------------


def test_status_events_record_from_and_to_and_collection_closes_custody(client, student, seeded, db_session, razorpay,
                                                                        make_shop, make_rider):
    shop, _ = make_shop()
    rider, _ = make_rider()
    oid, bid = deliver_fully(client, student, seeded, db_session, razorpay, shop, rider)
    assert client.post(f"{API}/orders/{oid}/collect", headers=student).status_code == 200

    events = db_session.scalars(select(OrderEvent).where(OrderEvent.order_id == uuid.UUID(oid), OrderEvent.to_status.is_not(None))
                                .order_by(OrderEvent.created_at)).all()
    chain = [(e.from_status, e.to_status) for e in events]
    assert chain[0] == (None, OrderStatus.draft)
    assert chain[-1] == (OrderStatus.delivered, OrderStatus.collected)
    for (_, prev_to), (nxt_from, _) in zip(chain[1:], chain[2:]):
        assert prev_to == nxt_from  # an unbroken from -> to chain

    custody = db_session.scalars(select(CustodyEvent).where(CustodyEvent.order_id == uuid.UUID(oid))
                                 .order_by(CustodyEvent.created_at)).all()
    assert custody[-1].type == "collected" and str(custody[-1].batch_id) == bid


# ---- database-level integrity -----------------------------------------------------------------


@pytest.mark.parametrize("mutate", [
    lambda db: setattr(db.get(PlatformConfig, 1), "commission_percent", Decimal("101")),
    lambda db: setattr(db.scalars(select(RateCard)).first(), "gsm", 90),
    lambda db: setattr(db.scalars(select(RateCard)).first(), "price_per_page", Decimal("-1")),
    lambda db: db.add(Coupon(code="BOTH", percent_off=Decimal("10"), flat_off=Decimal("5"))),
    lambda db: db.add(Coupon(code="NONE")),
    lambda db: db.add(User(mobile="9000000099", role="superuser")),
], ids=["commission>100", "gsm", "negative price", "coupon both kinds", "coupon no kind", "unknown role"])
def test_database_rejects_invalid_rows(db_session, seeded, mutate):
    with pytest.raises(StatementError):  # IntegrityError (constraint) or invalid enum value
        mutate(db_session)
        db_session.flush()
    db_session.rollback()


def test_complaint_must_belong_to_the_orders_student(client, student, seeded, db_session, razorpay, login):
    oid, _ = placed_order(client, student, seeded, db_session, razorpay)
    login("9876543299", "student")
    stranger = db_session.scalar(select(User).where(User.mobile == "9876543299"))
    db_session.add(Complaint(order_id=uuid.UUID(oid), student_id=stranger.id, category="missing_pages", description="not mine"))
    with pytest.raises(IntegrityError):
        db_session.flush()
    db_session.rollback()
