from datetime import timedelta

from fastapi import Depends

from app.core import security as sec
from app.main import app
from app.modules.auth.deps import require_roles
from app.modules.auth.models import Role, User
from tests.conftest import PASSWORD

P = "/api/v1/auth"


def auth(tokens):
    return {"Authorization": f"Bearer {tokens['access_token']}"}


def test_signup_login_and_me(client, login):
    t = login()
    assert t["user"]["role"] == "student"
    r = client.get(f"{P}/me", headers=auth(t))
    assert r.status_code == 200 and r.json()["mobile"] == "9876543210"
    assert login()["user"]["id"] == t["user"]["id"]  # second login reuses the account


REG = {"full_name": "Asha Raman", "mobile": "9876543210", "email": "asha@college.edu", "password": PASSWORD, "role": "student"}


def test_invalid_registration_rejected(client):
    reg = REG
    assert client.post(f"{P}/register", json={**reg, "mobile": "12345"}).status_code == 422
    assert client.post(f"{P}/register", json={**reg, "password": "short"}).status_code == 422
    assert client.post(f"{P}/register", json={**reg, "email": "not-an-email"}).status_code == 422
    assert client.post(f"{P}/register", json={**reg, "email": None}).status_code == 422  # email is required
    assert client.post(f"{P}/register", json={**reg, "full_name": " "}).status_code == 422
    assert client.post(f"{P}/register", json={**reg, "role": "admin"}).status_code == 422  # admins: operator CLI only


def test_password_is_hashed_and_email_login_works(client, db_session):
    r = client.post(f"{P}/register", json={**REG, "email": " Asha@College.EDU ", "full_name": "  Asha   Raman "})
    assert r.status_code == 201 and r.json()["user"]["email"] == "asha@college.edu"
    assert r.json()["user"]["full_name"] == "Asha Raman"
    stored = db_session.query(User).one().password_hash
    assert PASSWORD not in stored and stored.startswith("$argon2id$")
    for identifier in ("9876543210", "asha@college.edu", "ASHA@college.edu"):
        r = client.post(f"{P}/login", json={"identifier": identifier, "password": PASSWORD, "role": "student"})
        assert r.status_code == 200, identifier


def test_legacy_scrypt_hash_still_works_and_is_upgraded(client, db_session):
    import hashlib
    salt = b"0123456789abcdef"
    dk = hashlib.scrypt(PASSWORD.encode(), salt=salt, n=16, r=8, p=1)
    db_session.add(User(mobile="9876543210", role=Role.student, password_hash=f"scrypt$16$8$1${salt.hex()}${dk.hex()}"))
    db_session.commit()
    r = client.post(f"{P}/login", json={"identifier": "9876543210", "password": PASSWORD, "role": "student"})
    assert r.status_code == 200
    db_session.expire_all()
    assert db_session.query(User).one().password_hash.startswith("$argon2id$")  # re-hashed on sign-in


def test_duplicate_mobile_or_email_rejected(client):
    reg = {**REG, "email": "a@b.co"}
    assert client.post(f"{P}/register", json=reg).status_code == 201
    assert client.post(f"{P}/register", json={**reg, "email": "other@b.co"}).status_code == 409
    assert client.post(f"{P}/register", json={**reg, "mobile": "9876543211"}).status_code == 409


def test_wrong_password_and_unknown_account_look_the_same(client, login):
    login()
    wrong = client.post(f"{P}/login", json={"identifier": "9876543210", "password": "nope-nope", "role": "student"})
    unknown = client.post(f"{P}/login", json={"identifier": "9876543299", "password": PASSWORD, "role": "student"})
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json()


def test_lockout_after_repeated_wrong_passwords(client, db_session, login):
    login()
    body = {"identifier": "9876543210", "password": "wrong-password", "role": "student"}
    for _ in range(5):
        assert client.post(f"{P}/login", json=body).status_code == 401
    # locked: even the correct password is refused until the lock expires
    assert client.post(f"{P}/login", json={**body, "password": PASSWORD}).status_code == 429

    user = db_session.query(User).one()
    user.locked_until = sec.now() - timedelta(seconds=1)
    db_session.commit()
    assert client.post(f"{P}/login", json={**body, "password": PASSWORD}).status_code == 200


def test_account_without_password_cannot_sign_in(client, db_session):
    db_session.add(User(mobile="9876543210", role=Role.student))  # e.g. created before passwords existed
    db_session.commit()
    for pw in (PASSWORD, ""):
        assert client.post(f"{P}/login", json={"identifier": "9876543210", "password": pw, "role": "student"}).status_code in (401, 422)


def test_role_mismatch_blocked(client, login):
    login(role="student")
    r = client.post(f"{P}/login", json={"identifier": "9876543210", "password": PASSWORD, "role": "rider"})
    assert r.status_code == 403


def test_refresh_rotates_and_logout_revokes(client, login):
    t = login()
    r = client.post(f"{P}/refresh", json={"refresh_token": t["refresh_token"]})
    assert r.status_code == 200
    t2 = r.json()
    assert client.post(f"{P}/refresh", json={"refresh_token": t["refresh_token"]}).status_code == 401
    assert client.post(f"{P}/logout", json={"refresh_token": t2["refresh_token"]}).status_code == 204
    assert client.post(f"{P}/refresh", json={"refresh_token": t2["refresh_token"]}).status_code == 401


def test_protected_routes_and_role_enforcement(client, db_session, login):

    @app.get("/_test/admin-only")
    def admin_only(_: User = Depends(require_roles(Role.admin))):
        return {"ok": True}

    assert client.get("/_test/admin-only").status_code == 401
    assert client.get("/_test/admin-only", headers={"Authorization": "Bearer junk"}).status_code == 401
    student = login()
    assert client.get("/_test/admin-only", headers=auth(student)).status_code == 403

    db_session.add(User(mobile="9000000001", role=Role.admin, password_hash=sec.hash_password(PASSWORD)))
    db_session.commit()
    admin = login("9000000001", "admin")
    assert client.get("/_test/admin-only", headers=auth(admin)).status_code == 200


def test_otp_and_dev_login_endpoints_are_gone(client):
    body = {"mobile": "9812345678", "role": "shop"}
    for path in ("/otp/request", "/otp/verify", "/dev-login"):
        assert client.post(f"{P}{path}", json=body).status_code == 404
    assert client.get(f"{P}/login-options").status_code == 404


# ---- password reset, change, audit, throttling --------------------------------------------------


def _reset_token(url: str) -> str:
    return url.split("token=", 1)[1]


def test_forgot_password_link_is_single_use_and_revokes_sessions(client, db_session, login):
    t = login()  # student 9876543210 / 9876543210@test.upload
    r = client.post(f"{P}/password/forgot", json={"email": "9876543210@TEST.upload"})
    assert r.status_code == 202
    url = r.json()["dev_reset_url"]  # development without SMTP: DEV MOCK link in the response
    assert url.startswith("http://localhost:5173/student/reset-password?token=")
    token = _reset_token(url)
    from app.modules.auth.models import PasswordResetToken
    assert token not in db_session.query(PasswordResetToken).one().token_hash  # only the HMAC is stored

    assert client.post(f"{P}/password/reset", json={"token": token, "password": "short"}).status_code == 422
    assert client.post(f"{P}/password/reset", json={"token": token, "password": "brand-new-pass-1"}).status_code == 204
    # single use
    assert client.post(f"{P}/password/reset", json={"token": token, "password": "another-pass-22"}).status_code == 400
    # old password gone, new one works, existing sessions were revoked
    assert client.post(f"{P}/login", json={"identifier": "9876543210", "password": PASSWORD, "role": "student"}).status_code == 401
    assert client.post(f"{P}/login", json={"identifier": "9876543210", "password": "brand-new-pass-1", "role": "student"}).status_code == 200
    assert client.post(f"{P}/refresh", json={"refresh_token": t["refresh_token"]}).status_code == 401


def test_forgot_password_never_reveals_accounts_and_is_rate_limited(client, login):
    login()
    unknown = client.post(f"{P}/password/forgot", json={"email": "nobody@nowhere.in"})
    known = client.post(f"{P}/password/forgot", json={"email": "9876543210@test.upload"})
    assert unknown.status_code == known.status_code == 202
    assert unknown.json()["message"] == known.json()["message"] and unknown.json()["dev_reset_url"] is None
    for _ in range(2):
        assert client.post(f"{P}/password/forgot", json={"email": "9876543210@test.upload"}).json()["dev_reset_url"]
    assert client.post(f"{P}/password/forgot", json={"email": "9876543210@test.upload"}).json()["dev_reset_url"] is None  # 4th in an hour


def test_expired_reset_link_is_refused(client, db_session, login):
    login()
    token = _reset_token(client.post(f"{P}/password/forgot", json={"email": "9876543210@test.upload"}).json()["dev_reset_url"])
    from app.modules.auth.models import PasswordResetToken
    row = db_session.query(PasswordResetToken).one()
    row.expires_at = sec.now() - timedelta(seconds=1)
    db_session.commit()
    r = client.post(f"{P}/password/reset", json={"token": token, "password": "brand-new-pass-1"})
    assert r.status_code == 400 and "expired" in r.json()["detail"]
    assert client.post(f"{P}/password/reset", json={"token": "x" * 43, "password": "brand-new-pass-1"}).status_code == 400


def test_reset_email_refuses_without_smtp_outside_development(client, login, monkeypatch):
    login()
    from app.core.config import get_settings
    monkeypatch.setattr(get_settings(), "app_env", "production")
    assert client.post(f"{P}/password/forgot", json={"email": "9876543210@test.upload"}).status_code == 503


def test_reset_email_is_sent_over_smtp_when_configured(client, login, monkeypatch):
    login()
    from app.core.config import get_settings
    sent = []

    class FakeSMTP:
        def __init__(self, host, port, timeout):
            sent.append(("connect", host, port))
        def __enter__(self): return self
        def __exit__(self, *a): return False
        def starttls(self): sent.append(("starttls",))
        def login(self, u, p): sent.append(("login", u))
        def send_message(self, msg): sent.append(("send", msg["To"], msg["Subject"], msg.get_content()))

    s = get_settings()
    monkeypatch.setattr(s, "smtp_host", "smtp.test")
    monkeypatch.setattr(s, "smtp_user", "mailer")
    monkeypatch.setattr("app.core.email.smtplib.SMTP", FakeSMTP)
    r = client.post(f"{P}/password/forgot", json={"email": "9876543210@test.upload"})
    assert r.status_code == 202 and r.json()["dev_reset_url"] is None  # never leaked when really emailed
    send = next(x for x in sent if x[0] == "send")
    assert send[1] == "9876543210@test.upload" and "reset-password?token=" in send[3]
    assert ("starttls",) in sent and ("login", "mailer") in sent


def test_change_password_signs_out_other_devices(client, login):
    other_device = login()
    this_device = login()
    h = auth(this_device)
    assert client.post(f"{P}/password/change", headers=h, json={"current_password": "wrong", "new_password": "brand-new-pass-1"}).status_code == 400
    assert client.post(f"{P}/password/change", headers=h, json={"current_password": PASSWORD, "new_password": PASSWORD}).status_code == 422
    r = client.post(f"{P}/password/change", headers=h, json={"current_password": PASSWORD, "new_password": "brand-new-pass-1"})
    assert r.status_code == 200 and r.json()["access_token"]
    for t in (other_device, this_device):
        assert client.post(f"{P}/refresh", json={"refresh_token": t["refresh_token"]}).status_code == 401
    assert client.post(f"{P}/refresh", json={"refresh_token": r.json()["refresh_token"]}).status_code == 200
    assert client.post(f"{P}/password/change", json={"current_password": "x", "new_password": "y" * 8}).status_code == 401


def test_login_audit_log_and_ip_throttling(client, db_session, login, monkeypatch):
    from app.core.config import get_settings
    from app.modules.auth.models import LoginAuditLog
    login()
    bad = {"identifier": "9876543210", "password": "wrong-password", "role": "student"}
    client.post(f"{P}/login", json=bad)
    client.post(f"{P}/login", json={**bad, "identifier": "nobody@x.in"})
    events = [e.event for e in db_session.query(LoginAuditLog).order_by(LoginAuditLog.created_at)]
    # the fixture tries to sign in before registering, so that first attempt is a (correctly logged) failure too
    assert events.count("registered") == 1 and events.count("login_failed") == 3
    unknown = db_session.query(LoginAuditLog).filter_by(identifier="nobody@x.in").one()
    assert unknown.user_id is None and unknown.ip  # unknown accounts are logged too

    monkeypatch.setattr(get_settings(), "login_ip_max_failures", 3)
    client.post(f"{P}/login", json={**bad, "identifier": "9123456789"})
    r = client.post(f"{P}/login", json={**bad, "password": PASSWORD})  # even correct credentials, from this IP
    assert r.status_code == 429 and "network" in r.json()["detail"]
