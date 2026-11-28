import io
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from pypdf import PdfWriter
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import get_settings
from app.db import models  # noqa: F401
from app.db.session import Base, get_db
from app.main import app
from app.modules.colleges.models import College
from app.modules.finance.seed import seed_defaults, seed_sample_college
from app.modules.orders.slots import IST


@pytest.fixture
def db_session():
    engine = create_engine("sqlite://", poolclass=StaticPool, connect_args={"check_same_thread": False})
    # Enforce foreign keys like PostgreSQL does (SQLite ignores them unless asked).
    event.listen(engine, "connect", lambda conn, _: conn.execute("PRAGMA foreign_keys=ON"))
    Base.metadata.create_all(engine)
    with sessionmaker(bind=engine, expire_on_commit=False)() as s:
        yield s


@pytest.fixture
def client(db_session):
    app.dependency_overrides[get_db] = lambda: db_session
    yield TestClient(app)
    app.dependency_overrides.clear()


PASSWORD = "correct-horse-1"


@pytest.fixture(autouse=True)
def fast_password_hashing(monkeypatch):
    """Cheap Argon2 parameters so hundreds of test logins stay fast (parameters are stored in each hash)."""
    from argon2 import PasswordHasher

    cheap = PasswordHasher(time_cost=1, memory_cost=8, parallelism=1)
    monkeypatch.setattr("app.core.security._ph", cheap)
    monkeypatch.setattr("app.core.security._DUMMY", cheap.hash("timing-equaliser"))


@pytest.fixture
def login(client):
    """Signs in with PASSWORD, registering the account first if it doesn't exist yet."""
    def _login(mobile="9876543210", role="student"):
        r = client.post("/api/v1/auth/login", json={"identifier": mobile, "password": PASSWORD, "role": role})
        if r.status_code == 401:
            r = client.post("/api/v1/auth/register", json={
                "full_name": "Test User", "mobile": mobile, "email": f"{mobile}@test.upload", "password": PASSWORD, "role": role})
        assert r.status_code in (200, 201), r.text
        return r.json()

    return _login


# ---- Phase 3 fixtures -------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def fake_storage(monkeypatch):
    """In-memory object store so tests never touch MinIO/S3."""
    store: dict[str, bytes] = {}
    monkeypatch.setattr("app.core.storage.put_object", lambda key, data, ctype: store.__setitem__(key, data))
    monkeypatch.setattr("app.core.storage.delete_object", lambda key: store.pop(key, None))
    monkeypatch.setattr("app.core.storage.get_object", lambda key: store[key])
    monkeypatch.setattr("app.core.storage.object_exists", lambda key: key in store)
    monkeypatch.setattr("app.core.storage.presign_get", lambda key, expires=300: f"https://files.test/{key}")
    return store


@pytest.fixture
def seeded(db_session):
    seed_defaults(db_session)
    seed_sample_college(db_session)
    return db_session.query(College).one()


@pytest.fixture(autouse=True)
def no_real_razorpay_keys(monkeypatch):
    """Ignore any Razorpay keys in the developer's .env so tests never reach the real gateway."""
    s = get_settings()
    for name in ("razorpay_key_id", "razorpay_key_secret", "razorpay_webhook_secret"):
        monkeypatch.setattr(s, name, "")


@pytest.fixture
def razorpay(monkeypatch):
    """Configured Razorpay keys + a fake gateway-order creator (no network)."""
    s = get_settings()
    monkeypatch.setattr(s, "razorpay_key_id", "rzp_test_key")
    monkeypatch.setattr(s, "razorpay_key_secret", "test_secret")
    monkeypatch.setattr(s, "razorpay_webhook_secret", "whsec_test")
    counter = iter(range(1, 100))
    monkeypatch.setattr("app.modules.payments.service.create_gateway_order",
                        lambda amount, receipt: f"order_{next(counter)}")
    return s


@pytest.fixture
def student(client, login, seeded):
    tokens = login()
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}
    r = client.post("/api/v1/students/me/profile", headers=headers, json={
        "full_name": "Asha Raman", "college_id": str(seeded.id), "department": "CSE", "year": 3,
        "register_number": "21CS001",
    })
    assert r.status_code == 201, r.text
    return headers


def make_pdf(pages: int = 3) -> bytes:
    w = PdfWriter()
    for _ in range(pages):
        w.add_blank_page(width=595, height=842)
    buf = io.BytesIO()
    w.write(buf)
    return buf.getvalue()


def future_slot_date(days: int = 2):
    return (datetime.now(UTC).astimezone(IST).date() + timedelta(days=days)).isoformat()


# ---- Phase 4/5 fixtures: admin, shops, riders -------------------------------------------------


@pytest.fixture
def admin(client, db_session, login):
    from app.core.security import hash_password
    from app.modules.auth.models import Role, User

    db_session.add(User(mobile="9000000009", role=Role.admin, password_hash=hash_password(PASSWORD)))
    db_session.commit()
    return {"Authorization": f"Bearer {login('9000000009', 'admin')['access_token']}"}


@pytest.fixture
def make_shop(client, login, admin, seeded):
    """Registers a shop, has admin approve it, assigns the sample college and (optionally) opens it."""
    from tests.helpers import API, REG, hdr

    def _make(mobile="9111111111", open_=True, approve=True):
        h = hdr(login(mobile, "shop"))
        r = client.post(f"{API}/shops/me", headers=h, json=REG)
        assert r.status_code == 201, r.text
        sid = r.json()["id"]
        if approve:
            assert client.post(f"{API}/admin/shops/{sid}/approve", headers=admin).status_code == 200
            assert client.put(f"{API}/admin/shops/{sid}/colleges", headers=admin, json={"college_ids": [str(seeded.id)]}).status_code == 204
            if open_:
                assert client.put(f"{API}/shops/me/open", headers=h, json={"is_open": True}).status_code == 200
        return h, sid
    return _make


@pytest.fixture
def make_rider(client, login, admin, seeded):
    """Registers a rider with KYC docs and (optionally) approves them for the sample college."""
    from tests.helpers import API, JPG, RIDER, hdr

    def _make(mobile="9333333333", approve=True, backup=False, online=True):
        h = hdr(login(mobile, "rider"))
        r = client.post(f"{API}/riders/me", headers=h, json=RIDER)
        assert r.status_code == 201, r.text
        rid = r.json()["id"]
        for kind in ("dl", "rc"):
            up = client.post(f"{API}/riders/me/documents/{kind}", headers=h, files={"file": (f"{kind}.jpg", JPG, "image/jpeg")})
            assert up.status_code == 200, up.text
        if approve:
            assert client.post(f"{API}/admin/riders/{rid}/approve", headers=admin).status_code == 200
            body = {"backup": [str(seeded.id)]} if backup else {"primary": [str(seeded.id)]}
            assert client.put(f"{API}/admin/riders/{rid}/colleges", headers=admin, json=body).status_code == 204
            if online:
                assert client.put(f"{API}/riders/me/availability", headers=h, json={"is_online": True}).status_code == 200
        return h, rid
    return _make
