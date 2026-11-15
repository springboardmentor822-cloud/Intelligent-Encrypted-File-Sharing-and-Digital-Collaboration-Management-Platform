"""Passwords (bcrypt), JWT tokens and TOTP (MFA) helpers."""
import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
import pyotp

from app.core.config import settings


# ---------- passwords ----------
def hash_password(password: str) -> str:
    # bcrypt only looks at the first 72 bytes
    return bcrypt.hashpw(password.encode()[:72], bcrypt.gensalt(rounds=12)).decode()


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode()[:72], hashed.encode())
    except ValueError:
        return False


DUMMY_HASH = hash_password("dummy-password-for-timing")


# ---------- JWT ----------
def _create_token(sub: str, token_type: str, expires: timedelta, extra: dict | None = None) -> tuple[str, str]:
    jti = uuid.uuid4().hex
    now = datetime.now(timezone.utc)
    payload = {"sub": sub, "type": token_type, "jti": jti, "iat": now, "exp": now + expires}
    if extra:
        payload.update(extra)
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM), jti


def create_access_token(user_id: str, roles: list[str]) -> tuple[str, str]:
    return _create_token(user_id, "access", timedelta(minutes=settings.ACCESS_TOKEN_MINUTES), {"roles": roles})


def create_refresh_token(user_id: str) -> tuple[str, str]:
    return _create_token(user_id, "refresh", timedelta(days=settings.REFRESH_TOKEN_DAYS))


def decode_token(token: str, expected_type: str) -> dict:
    payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    if payload.get("type") != expected_type:
        raise jwt.InvalidTokenError("Wrong token type")
    return payload


# ---------- random tokens (share links, password reset) ----------
def generate_url_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    """We store only the SHA-256 hash of share/reset tokens, never the token itself."""
    return hashlib.sha256(token.encode()).hexdigest()


# ---------- MFA (TOTP, works with Google Authenticator) ----------
def new_totp_secret() -> str:
    return pyotp.random_base32()


def totp_uri(secret: str, email: str) -> str:
    return pyotp.TOTP(secret).provisioning_uri(name=email, issuer_name=settings.APP_NAME)


def verify_totp(secret: str, code: str) -> bool:
    return pyotp.TOTP(secret).verify(code.strip(), valid_window=1)
