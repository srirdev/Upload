"""Operator commands for accounts (no default admin account exists).

Bootstrap the initial administrator:
  Set in .env:  ADMIN_MOBILE=9XXXXXXXXX  ADMIN_NAME="Full Name"  ADMIN_EMAIL=ops@example.com (optional)
  Then run:     python -m app.modules.auth.cli
  A mobile passed as the first argument overrides ADMIN_MOBILE (e.g. to add a second admin).
  You are asked for the admin's password (it is never read from .env).

Set or reset any user's password (e.g. accounts created before passwords existed):
  python -m app.modules.auth.cli set-password <mobile>
"""
import getpass
import re
import sys

from sqlalchemy import select

from app.core import security as sec
from app.core.config import get_settings
from app.db.session import SessionLocal
from app.modules.auth.models import AdminProfile, Role, User


def read_password() -> str:
    pw = getpass.getpass("New password (8+ characters): ")
    if len(pw) < 8:
        sys.exit("Password must be at least 8 characters")
    if getpass.getpass("Repeat password: ") != pw:
        sys.exit("Passwords do not match")
    return pw


def set_password(mobile: str) -> None:
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.mobile == mobile))
        if not user:
            sys.exit(f"No account with mobile {mobile}")
        user.password_hash = sec.hash_password(read_password())
        user.failed_logins, user.locked_until = 0, None
        db.commit()
    print(f"Password set for {mobile} ({user.role.value}).")


def main() -> None:
    if len(sys.argv) > 1 and sys.argv[1] == "set-password":
        if len(sys.argv) != 3:
            sys.exit("Usage: python -m app.modules.auth.cli set-password <mobile>")
        return set_password(sys.argv[2])

    s = get_settings()
    mobile = sys.argv[1] if len(sys.argv) > 1 else s.admin_mobile
    name, email = s.admin_name.strip(), (s.admin_email.strip().lower() or None)
    if not re.fullmatch(r"[6-9]\d{9}", mobile or ""):
        sys.exit("Set ADMIN_MOBILE (10-digit Indian mobile) in .env, or pass it: python -m app.modules.auth.cli <mobile>")
    if len(name) < 2:
        sys.exit("Set ADMIN_NAME in .env")
    if email and not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        sys.exit("ADMIN_EMAIL is not a valid email address")
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.mobile == mobile))
        if user and user.role != Role.admin:
            sys.exit(f"{mobile} already exists as {user.role.value}; refusing to change role")
        if email and db.scalar(select(User.id).where(User.email == email, User.mobile != mobile)):
            sys.exit(f"{email} is already used by another account")
        if not user:
            user = User(mobile=mobile, role=Role.admin, full_name=name)
            db.add(user)
            db.flush()
        if user.email is None:
            user.email = email
        if user.password_hash is None:
            user.password_hash = sec.hash_password(read_password())
        profile = db.scalar(select(AdminProfile).where(AdminProfile.user_id == user.id))
        if profile:
            db.commit()
            print(f"Admin already set up: {mobile} ({profile.full_name})")
            return
        db.add(AdminProfile(user_id=user.id, full_name=name, email=email))
        db.commit()
    print(f"Admin ready: {mobile} ({name}). Sign in at /admin/login with your mobile number or email and password.")


if __name__ == "__main__":
    main()
