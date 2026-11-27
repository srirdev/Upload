from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.modules.auth.models import Role

MOBILE_RE = r"^[6-9]\d{9}$"
EMAIL_RE = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"
Mobile = Field(pattern=MOBILE_RE, description="10-digit Indian mobile number")
Password = Field(min_length=8, max_length=128)
RoleName = Literal["student", "rider", "shop", "admin"]


def _lower_email(v):
    return (v.strip().lower() or None) if isinstance(v, str) else v


class RegisterRequest(BaseModel):
    """Self sign-up for students, shops and riders (admins are created with the operator CLI)."""

    full_name: str = Field(min_length=2, max_length=120)
    mobile: str = Mobile
    email: str = Field(max_length=254, pattern=EMAIL_RE)  # required: password resets are emailed
    password: str = Password
    role: Literal["student", "rider", "shop"]

    @field_validator("email", mode="before")
    @classmethod
    def _normalise_email(cls, v):
        return _lower_email(v)

    @field_validator("full_name", mode="before")
    @classmethod
    def _strip_name(cls, v):
        return " ".join(v.split()) if isinstance(v, str) else v


class LoginRequest(BaseModel):
    identifier: str = Field(min_length=3, max_length=254, description="Mobile number or email")
    password: str = Field(min_length=1, max_length=128)
    role: RoleName


class ForgotPasswordRequest(BaseModel):
    email: str = Field(max_length=254, pattern=EMAIL_RE)

    @field_validator("email", mode="before")
    @classmethod
    def _normalise_email(cls, v):
        return _lower_email(v)


class ForgotPasswordOut(BaseModel):
    message: str
    # DEV MOCK only: the emailed link, returned when no SMTP server is configured in development.
    dev_reset_url: str | None = None


class ResetPasswordRequest(BaseModel):
    token: str = Field(min_length=20, max_length=200)
    password: str = Password


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Password


class RefreshRequest(BaseModel):
    refresh_token: str


class UserOut(BaseModel):
    id: str
    full_name: str | None = None
    mobile: str
    email: str | None = None
    role: Role


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    user: UserOut
