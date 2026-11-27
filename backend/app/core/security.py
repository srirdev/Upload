import hashlib
import hmac
import secrets
import uuid
from datetime import UTC, datetime, timedelta

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

from app.core.config import get_settings


def now() -> datetime:
    return datetime.now(UTC)


def aware(dt: datetime) -> datetime:
    """SQLite returns naive datetimes; treat them as UTC."""
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


def _digest(value: str) -> str:
    return hmac.new(get_settings().secret_key.encode(), value.encode(), hashlib.sha256).hexdigest()


# Passwords: Argon2id (OWASP-recommended). Older scrypt hashes ("scrypt$...") still verify and are re-hashed
# to Argon2id on the user's next successful login. Tests swap `_ph` for cheap parameters to stay fast.
_ph = PasswordHasher()  # argon2id, m=64 MiB, t=3, p=4
_DUMMY = _ph.hash("timing-equaliser")


def hash_password(password: str) -> str:
    return _ph.hash(password)


def verify_password(password: str, stored: str | None) -> bool:
    """Constant-time check. With no stored hash, still does the work so timing doesn't reveal unknown accounts."""
    if stored and stored.startswith("scrypt$"):
        return _verify_scrypt(password, stored)
    try:
        return _ph.verify(stored or _DUMMY, password) and stored is not None
    except (VerifyMismatchError, InvalidHashError, VerificationError):
        return False


def needs_rehash(stored: str) -> bool:
    """True for legacy scrypt hashes or Argon2 hashes made with weaker parameters than today's."""
    return stored.startswith("scrypt$") or _ph.check_needs_rehash(stored)


def _verify_scrypt(password: str, stored: str) -> bool:
    try:
        _, n, r, p, salt, expected = stored.split("$")
        dk = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=int(n), r=int(r), p=int(p),
                            maxmem=64 * 1024 * 1024)
    except ValueError:
        return False
    return hmac.compare_digest(dk.hex(), expected)


def new_url_token() -> tuple[str, str]:
    """A random single-use token for links (password reset) and its HMAC digest for storage."""
    raw = secrets.token_urlsafe(32)
    return raw, _digest(f"link:{raw}")


def hash_url_token(raw: str) -> str:
    return _digest(f"link:{raw}")


def generate_otp() -> str:
    """Shop -> rider handover codes (shops/delivery). Login uses passwords, not OTPs."""
    return f"{secrets.randbelow(1_000_000):06d}"


def hash_otp(mobile: str, code: str) -> str:
    return _digest(f"otp:{mobile}:{code}")


def new_refresh_token() -> tuple[str, str]:
    raw = secrets.token_urlsafe(48)
    return raw, hash_refresh_token(raw)


def hash_refresh_token(raw: str) -> str:
    return _digest(f"refresh:{raw}")


def create_access_token(user_id: uuid.UUID, role: str) -> str:
    s = get_settings()
    exp = now() + timedelta(minutes=s.access_token_minutes)
    return jwt.encode({"sub": str(user_id), "role": role, "exp": exp}, s.secret_key, algorithm="HS256")


def decode_access_token(token: str) -> dict:
    return jwt.decode(token, get_settings().secret_key, algorithms=["HS256"])
