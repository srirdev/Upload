import re
from dataclasses import dataclass
from datetime import timedelta

from fastapi import HTTPException
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.core import security as sec
from app.core.config import get_settings
from app.core.email import send_email
from app.modules.auth.models import LoginAuditLog, PasswordResetToken, RefreshToken, Role, User
from app.modules.auth.schemas import MOBILE_RE, ForgotPasswordOut, TokenPair, UserOut


BAD_CREDENTIALS = "Incorrect mobile number/email or password"
RESET_SENT = "If an account uses this email, we've sent a link to reset the password. It expires soon."
RESET_INVALID = "This reset link is invalid or has expired. Request a new one."
RESETS_PER_HOUR = 3


@dataclass(frozen=True)
class Client:
    """Who is calling (for the login audit log and per-IP throttling)."""
    ip: str | None = None
    user_agent: str | None = None


def _audit(db: Session, event: str, client: Client, *, user: User | None = None, identifier: str = "", role: str | None = None):
    db.add(LoginAuditLog(
        user_id=user.id if user else None, identifier=identifier[:254] or (user.email or user.mobile if user else ""),
        role=role or (user.role.value if user else None), event=event, ip=client.ip,
        user_agent=(client.user_agent or "")[:300] or None,
    ))


def register(db: Session, full_name: str, mobile: str, email: str, password: str, role: str,
             client: Client = Client()) -> TokenPair:
    if db.scalar(select(User.id).where(User.mobile == mobile)):
        raise HTTPException(409, "This mobile number is already registered. Sign in instead.")
    if db.scalar(select(User.id).where(User.email == email)):
        raise HTTPException(409, "This email is already registered. Sign in instead.")
    user = User(full_name=full_name, mobile=mobile, email=email, password_hash=sec.hash_password(password), role=Role(role))
    db.add(user)
    db.flush()
    _audit(db, "registered", client, user=user)
    return _issue_tokens(db, user)


def login(db: Session, identifier: str, password: str, role: str, client: Client = Client()) -> TokenPair:
    s = get_settings()
    identifier = identifier.strip()

    # Per-IP throttle across all accounts (credential stuffing); per-account lockout is below.
    if client.ip:
        since = sec.now() - timedelta(minutes=15)
        failures = db.scalar(select(func.count()).select_from(LoginAuditLog).where(
            LoginAuditLog.ip == client.ip, LoginAuditLog.event == "login_failed", LoginAuditLog.created_at > since))
        if failures >= s.login_ip_max_failures:
            _audit(db, "throttled", client, identifier=identifier, role=role)
            db.commit()
            raise HTTPException(429, "Too many sign-in attempts from this network. Try again in 15 minutes.")

    if re.fullmatch(MOBILE_RE, identifier):
        user = db.scalar(select(User).where(User.mobile == identifier))
    else:
        user = db.scalar(select(User).where(User.email == identifier.lower()))

    if user and user.locked_until and sec.aware(user.locked_until) > sec.now():
        _audit(db, "locked", client, user=user, identifier=identifier, role=role)
        db.commit()
        raise HTTPException(429, f"Too many wrong passwords. Try again in {s.login_lockout_minutes} minutes.")
    if not sec.verify_password(password, user.password_hash if user else None):
        if user:
            user.failed_logins += 1
            if user.failed_logins >= s.login_max_failures:
                user.failed_logins = 0
                user.locked_until = sec.now() + timedelta(minutes=s.login_lockout_minutes)
        _audit(db, "login_failed", client, user=user, identifier=identifier, role=role)
        db.commit()
        raise HTTPException(401, BAD_CREDENTIALS)

    _check_role(user, role)
    user.failed_logins, user.locked_until = 0, None
    if sec.needs_rehash(user.password_hash):  # e.g. legacy scrypt -> Argon2id, transparently
        user.password_hash = sec.hash_password(password)
    _audit(db, "login_ok", client, user=user, identifier=identifier, role=role)
    return _issue_tokens(db, user)


def forgot_password(db: Session, email: str, client: Client = Client()) -> ForgotPasswordOut:
    """Always answers the same way (never reveals whether an email is registered)."""
    s = get_settings()
    user = db.scalar(select(User).where(User.email == email))
    out = ForgotPasswordOut(message=RESET_SENT)
    if not user or not user.is_active:
        return out
    recent = db.scalar(select(func.count()).select_from(PasswordResetToken).where(
        PasswordResetToken.user_id == user.id, PasswordResetToken.created_at > sec.now() - timedelta(hours=1)))
    if recent >= RESETS_PER_HOUR:
        return out  # quietly rate limited
    raw, hashed = sec.new_url_token()
    db.add(PasswordResetToken(user_id=user.id, token_hash=hashed, requested_ip=client.ip,
                              expires_at=sec.now() + timedelta(minutes=s.password_reset_minutes)))
    _audit(db, "password_reset_requested", client, user=user, identifier=email)
    db.commit()
    url = f"{s.frontend_url.rstrip('/')}/{user.role.value}/reset-password?token={raw}"
    sent = send_email(
        user.email,
        "Reset your UpLOAD password",
        f"Hi {user.full_name or 'there'},\n\nUse this link to set a new UpLOAD password. It works once and expires in "
        f"{s.password_reset_minutes} minutes:\n\n{url}\n\nIf you didn't ask for this, you can ignore this email; "
        "your password stays the same.\n",
    )
    if not sent:  # development without SMTP only (send_email raises 503 elsewhere)
        out.dev_reset_url = url
    return out


def reset_password(db: Session, raw_token: str, password: str, client: Client = Client()) -> None:
    row = db.scalar(select(PasswordResetToken).where(PasswordResetToken.token_hash == sec.hash_url_token(raw_token)))
    if not row or row.used_at or sec.aware(row.expires_at) < sec.now():
        raise HTTPException(400, RESET_INVALID)
    user = db.get(User, row.user_id)
    if not user or not user.is_active:
        raise HTTPException(400, RESET_INVALID)
    now = sec.now()
    # Single use: this link and any other outstanding links for the account stop working.
    db.execute(update(PasswordResetToken).where(PasswordResetToken.user_id == user.id, PasswordResetToken.used_at.is_(None))
               .values(used_at=now))
    user.password_hash = sec.hash_password(password)
    user.failed_logins, user.locked_until = 0, None
    _revoke_all_sessions(db, user)
    _audit(db, "password_reset", client, user=user)
    db.commit()


def change_password(db: Session, user: User, current: str, new: str, client: Client = Client()) -> TokenPair:
    """Signed-in password change. Signs out every other device and returns fresh tokens for this one."""
    if not sec.verify_password(current, user.password_hash):
        raise HTTPException(400, "Your current password is incorrect")
    if current == new:
        raise HTTPException(422, "Choose a new password that is different from the current one")
    user.password_hash = sec.hash_password(new)
    _revoke_all_sessions(db, user)
    _audit(db, "password_changed", client, user=user)
    return _issue_tokens(db, user)


def _revoke_all_sessions(db: Session, user: User) -> None:
    db.execute(update(RefreshToken).where(RefreshToken.user_id == user.id, RefreshToken.revoked.is_(False)).values(revoked=True))


def refresh(db: Session, raw_token: str) -> TokenPair:
    row = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == sec.hash_refresh_token(raw_token)))
    if not row or row.revoked or sec.aware(row.expires_at) < sec.now():
        raise HTTPException(401, "Invalid refresh token")
    user = db.get(User, row.user_id)
    if not user or not user.is_active:
        raise HTTPException(401, "Account disabled")
    row.revoked = True  # rotate
    return _issue_tokens(db, user)


def logout(db: Session, raw_token: str) -> None:
    row = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == sec.hash_refresh_token(raw_token)))
    if row:
        row.revoked = True
        db.commit()


def _check_role(user: User, role: str) -> None:
    if not user.is_active:
        raise HTTPException(403, "Account disabled")
    if user.role.value != role:
        raise HTTPException(403, f"This account is registered as {user.role.value}")


def user_out(user: User) -> UserOut:
    return UserOut(id=str(user.id), full_name=user.full_name, mobile=user.mobile, email=user.email, role=user.role)


def _issue_tokens(db: Session, user: User) -> TokenPair:
    raw, hashed = sec.new_refresh_token()
    db.add(
        RefreshToken(
            user_id=user.id,
            token_hash=hashed,
            expires_at=sec.now() + timedelta(days=get_settings().refresh_token_days),
        )
    )
    db.commit()
    return TokenPair(
        access_token=sec.create_access_token(user.id, user.role.value),
        refresh_token=raw,
        user=user_out(user),
    )
