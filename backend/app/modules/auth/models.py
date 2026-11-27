import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, String, Text, Uuid, event, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class Role(str, enum.Enum):
    student = "student"
    rider = "rider"
    shop = "shop"
    admin = "admin"


ROLE_DESCRIPTIONS = {
    Role.student: "Uploads documents, pays and collects packets",
    Role.rider: "Delivery partner: collects packets from shops and delivers to the security cabin",
    Role.shop: "Printing shop owner: prints, binds and packs orders",
    Role.admin: "Operations centre: approvals, colleges, complaints, refunds and finance",
}


class RoleRecord(Base):
    """RBAC role catalogue. users.role references it; the API enforces permissions per role (auth/deps.py)."""

    __tablename__ = "roles"

    name: Mapped[str] = mapped_column(String(20), primary_key=True)
    description: Mapped[str] = mapped_column(Text)


@event.listens_for(RoleRecord.__table__, "after_create")
def _seed_roles(table, connection, **_) -> None:  # reference data, needed wherever the table is created
    connection.execute(table.insert(), [{"name": r.value, "description": d} for r, d in ROLE_DESCRIPTIONS.items()])


class User(Base):
    """Login identity only (mobile or email + password, role). Role-specific details live in the *_profiles tables."""

    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    full_name: Mapped[str | None] = mapped_column(String(120))  # set at sign-up; NULL for older accounts
    mobile: Mapped[str] = mapped_column(String(10), unique=True, index=True)
    email: Mapped[str | None] = mapped_column(String(254), unique=True, index=True)  # stored lower-case
    # NULL = no password yet (accounts from the OTP era): set one with `python -m app.modules.auth.cli set-password`
    password_hash: Mapped[str | None] = mapped_column(String(255))
    failed_logins: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    role: Mapped[Role] = mapped_column(Enum(Role, native_enum=False, length=20), ForeignKey("roles.name"), index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AdminProfile(Base):
    __tablename__ = "admin_profiles"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), unique=True)
    full_name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str | None] = mapped_column(String(254), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class PasswordResetToken(Base):
    """Single-use, expiring password reset link. Only the HMAC of the token is stored."""

    __tablename__ = "password_reset_tokens"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    requested_ip: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class LoginAuditLog(Base):
    """Every sign-in attempt (and password events), for security review and per-IP throttling."""

    __tablename__ = "login_audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), index=True)
    identifier: Mapped[str] = mapped_column(String(254))  # what was typed (mobile or email), even if unknown
    role: Mapped[str | None] = mapped_column(String(20))
    # login_ok | login_failed | locked | throttled | password_reset_requested | password_reset | password_changed
    event: Mapped[str] = mapped_column(String(40))
    ip: Mapped[str | None] = mapped_column(String(64), index=True)
    user_agent: Mapped[str | None] = mapped_column(String(300))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
