import uuid

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.security import decode_access_token
from app.db.session import get_db
from app.modules.auth.models import Role, User

bearer = HTTPBearer(auto_error=False)


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer), db: Session = Depends(get_db)
) -> User:
    if creds is None:
        raise HTTPException(401, "Not authenticated")
    try:
        payload = decode_access_token(creds.credentials)
        user = db.get(User, uuid.UUID(payload["sub"]))
    except (jwt.PyJWTError, KeyError, ValueError):
        raise HTTPException(401, "Invalid or expired token") from None
    if user is None or not user.is_active:
        raise HTTPException(401, "Invalid or expired token")
    return user


def require_roles(*roles: Role):
    """Dependency factory: `Depends(require_roles(Role.admin))`. Role is read from the DB, not the token."""

    def dep(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(403, "Forbidden")
        return user

    return dep
