"""Demo accounts: development-only, idempotent, every portal ready to use, never available in production."""
import pytest
from sqlalchemy import select

from app.core.config import get_settings
from app.modules.auth.demo import DemoError, seed_demo
from app.modules.auth.models import User
from app.modules.riders.models import RiderProfile
from app.modules.shops.models import ShopProfile
from app.modules.students.models import StudentProfile
from tests.helpers import API

DEMO_PW = "demo-pass-2026"


@pytest.fixture
def demo_env(monkeypatch):
    s = get_settings()
    monkeypatch.setattr(s, "demo_password", DEMO_PW)
    monkeypatch.setattr(s, "app_env", "development")
    return s


def signin(client, role, identifier, password=DEMO_PW):
    return client.post(f"{API}/auth/login", json={"identifier": identifier, "password": password, "role": role})


def test_demo_accounts_are_ready_to_use_in_every_portal(client, db_session, demo_env):
    report = seed_demo(db_session)
    assert len(report) == 4 and not any(r.startswith("SKIPPED") for r in report)

    student = signin(client, "student", demo_env.demo_student_mobile)
    assert student.status_code == 200
    h = {"Authorization": f"Bearer {student.json()['access_token']}"}
    assert client.get(f"{API}/students/me/profile", headers=h).status_code == 200  # onboarding already done

    shop = signin(client, "shop", demo_env.demo_shop_email)  # email sign-in works too
    hs = {"Authorization": f"Bearer {shop.json()['access_token']}"}
    me = client.get(f"{API}/shops/me", headers=hs).json()
    assert me["status"] == "approved" and me["is_open"] is True

    rider = signin(client, "rider", demo_env.demo_rider_mobile)
    hr = {"Authorization": f"Bearer {rider.json()['access_token']}"}
    r = client.get(f"{API}/riders/me", headers=hr).json()
    assert r["kyc_status"] == "approved" and r["is_online"] is True and r["has_dl"] and r["has_rc"]
    assert client.get(f"{API}/riders/me/run", headers=hr).status_code == 200  # past the KYC gate

    admin = signin(client, "admin", demo_env.demo_admin_mobile)
    ha = {"Authorization": f"Bearer {admin.json()['access_token']}"}
    assert client.get(f"{API}/admin/me", headers=ha).json()["full_name"] == "Demo Admin"


def test_demo_seed_is_idempotent_and_resets_the_password(client, db_session, demo_env, monkeypatch):
    seed_demo(db_session)
    seed_demo(db_session)
    assert db_session.scalar(select(User).where(User.mobile == demo_env.demo_shop_mobile)) is not None
    assert db_session.query(ShopProfile).count() == 1 and db_session.query(RiderProfile).count() == 1
    assert db_session.query(StudentProfile).count() == 1

    monkeypatch.setattr(demo_env, "demo_password", "a-new-demo-pass")
    seed_demo(db_session)
    assert signin(client, "rider", demo_env.demo_rider_mobile, "a-new-demo-pass").status_code == 200
    assert signin(client, "rider", demo_env.demo_rider_mobile).status_code == 401


def test_demo_never_takes_over_another_role(client, db_session, demo_env, login):
    login(demo_env.demo_rider_mobile, "student")  # that number already belongs to a real student
    report = seed_demo(db_session)
    assert any(r.startswith("SKIPPED rider") for r in report)
    assert db_session.scalar(select(User.role).where(User.mobile == demo_env.demo_rider_mobile)).value == "student"


def test_demo_is_refused_outside_development_and_without_a_password(db_session, demo_env, monkeypatch):
    monkeypatch.setattr(demo_env, "app_env", "production")
    with pytest.raises(DemoError, match="development"):
        seed_demo(db_session)
    monkeypatch.setattr(demo_env, "app_env", "development")
    monkeypatch.setattr(demo_env, "demo_password", "")
    with pytest.raises(DemoError, match="DEMO_PASSWORD"):
        seed_demo(db_session)


def test_demo_accounts_endpoint_is_development_only(client, demo_env, monkeypatch):
    r = client.get(f"{API}/auth/demo-accounts")
    assert r.status_code == 200
    assert {a["role"] for a in r.json()} == {"student", "shop", "rider", "admin"}
    assert all(a["password"] == DEMO_PW for a in r.json())
    monkeypatch.setattr(demo_env, "app_env", "production")
    assert client.get(f"{API}/auth/demo-accounts").status_code == 404
    monkeypatch.setattr(demo_env, "app_env", "development")
    monkeypatch.setattr(demo_env, "demo_password", "")
    assert client.get(f"{API}/auth/demo-accounts").status_code == 404
