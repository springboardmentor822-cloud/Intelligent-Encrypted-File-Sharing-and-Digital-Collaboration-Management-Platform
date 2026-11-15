import re
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator


class RegisterIn(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=120)
    password: str = Field(min_length=8, max_length=72)

    @field_validator("password")
    @classmethod
    def strong_password(cls, v: str) -> str:
        if not (re.search(r"[A-Za-z]", v) and re.search(r"\d", v)):
            raise ValueError("Password must contain at least one letter and one number")
        return v


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(max_length=72)
    otp: str | None = None


class RefreshIn(BaseModel):
    refresh_token: str


class LogoutIn(BaseModel):
    refresh_token: str | None = None


class UserOut(BaseModel):
    id: str
    email: str
    full_name: str
    roles: list[str]
    mfa_enabled: bool
    is_active: bool = True
    approval_status: str = "approved"
    created_at: datetime


class TokenOut(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserOut


class ChangePasswordIn(BaseModel):
    current_password: str = Field(max_length=72)
    new_password: str = Field(min_length=8, max_length=72)

    @field_validator("new_password")
    @classmethod
    def strong_password(cls, v: str) -> str:
        if not (re.search(r"[A-Za-z]", v) and re.search(r"\d", v)):
            raise ValueError("Password must contain at least one letter and one number")
        return v


class OAuthExchangeIn(BaseModel):
    code: str


class MfaSetupOut(BaseModel):
    secret: str
    otpauth_uri: str


class OtpIn(BaseModel):
    otp: str = Field(min_length=6, max_length=8)


class MfaDisableIn(BaseModel):
    password: str
    otp: str


class ForgotPasswordIn(BaseModel):
    email: EmailStr


class ResetPasswordIn(BaseModel):
    token: str
    new_password: str = Field(min_length=8, max_length=72)

    @field_validator("new_password")
    @classmethod
    def strong_password(cls, v: str) -> str:
        if not (re.search(r"[A-Za-z]", v) and re.search(r"\d", v)):
            raise ValueError("Password must contain at least one letter and one number")
        return v


def user_to_out(user) -> UserOut:
    return UserOut(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        roles=[r.name for r in user.roles],
        mfa_enabled=user.mfa_enabled,
        is_active=user.is_active,
        approval_status=getattr(user, "approval_status", "approved"),
        created_at=user.created_at,
    )


class AdminAreaAttemptIn(BaseModel):
    path: str = Field(max_length=120)
