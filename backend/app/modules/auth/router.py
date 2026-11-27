from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.session import get_db
from app.modules.auth import demo, service
from app.modules.auth.deps import get_current_user
from app.modules.auth.models import User
from app.modules.auth.schemas import (
    ChangePasswordRequest,
    ForgotPasswordOut,
    ForgotPasswordRequest,
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    ResetPasswordRequest,
    TokenPair,
    UserOut,
)

router = APIRouter(prefix="/auth", tags=["auth"])


def client(request: Request) -> service.Client:
    return service.Client(ip=request.client.host if request.client else None, user_agent=request.headers.get("user-agent"))


@router.post("/register", response_model=TokenPair, status_code=201)
def register(body: RegisterRequest, request: Request, db: Session = Depends(get_db)):
    return service.register(db, body.full_name, body.mobile, body.email, body.password, body.role, client(request))


@router.post("/login", response_model=TokenPair)
def login(body: LoginRequest, request: Request, db: Session = Depends(get_db)):
    return service.login(db, body.identifier, body.password, body.role, client(request))


@router.post("/password/forgot", response_model=ForgotPasswordOut, status_code=202)
def forgot_password(body: ForgotPasswordRequest, request: Request, db: Session = Depends(get_db)):
    """Emails a single-use reset link. Same answer whether or not the email is registered."""
    return service.forgot_password(db, body.email, client(request))


@router.post("/password/reset", status_code=204)
def reset_password(body: ResetPasswordRequest, request: Request, db: Session = Depends(get_db)):
    """Sets a new password from a reset link, then signs the account out everywhere."""
    service.reset_password(db, body.token, body.password, client(request))


@router.post("/password/change", response_model=TokenPair)
def change_password(body: ChangePasswordRequest, request: Request, user: User = Depends(get_current_user),
                    db: Session = Depends(get_db)):
    """Signed-in password change; other devices are signed out and this one gets fresh tokens."""
    return service.change_password(db, user, body.current_password, body.new_password, client(request))


@router.get("/demo-accounts", include_in_schema=False)
def demo_accounts():
    """DEVELOPMENT ONLY: the demo sign-ins for the login pages' "Use demo account" button. 404 everywhere else."""
    if not demo.demo_enabled():
        raise HTTPException(404, "Not Found")
    password = get_settings().demo_password
    return [{**a, "password": password} for a in demo.demo_accounts()]


@router.post("/refresh", response_model=TokenPair)
def refresh(body: RefreshRequest, db: Session = Depends(get_db)):
    return service.refresh(db, body.refresh_token)


@router.post("/logout", status_code=204)
def logout(body: RefreshRequest, db: Session = Depends(get_db)):
    service.logout(db, body.refresh_token)


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return service.user_out(user)
