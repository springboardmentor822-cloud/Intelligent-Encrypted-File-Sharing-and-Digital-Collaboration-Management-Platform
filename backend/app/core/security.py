"""Password hashing, JWTs and secure token generation."""
import base64
import hashlib
import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from app.core.config import settings


# ---- Passwords --------------------------------------------------------------
def _prehash(password: str) -> bytes:
    # SHA-256 + base64 avoids bcrypt's 72-byte limit and NUL-byte issues.
    return base64.b64encode(hashlib.sha256(password.encode("utf-8")).digest())


def hash_password(password: str) -> str:
    return bcrypt.hashpw(_prehash(password), bcrypt.gensalt(rounds=12)).decode()


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(_prehash(password), hashed.encode())
    except ValueError:
        return False


DUMMY_HASH = hash_password("trustshare-dummy-password")  # equalises timing for unknown users


def validate_password_strength(password: str) -> str | None:
    """Return an error message, or None if the password is acceptable."""
    if len(password) < 8:
        return "Password must be at least 8 characters."
    if len(password) > 128:
        return "Password must be 128 characters or fewer."
    if not re.search(r"[A-Za-z]", password) or not re.search(r"\d", password):
        return "Password must include at least one letter and one number."
    return None


# ---- JWT --------------------------------------------------------------------
def create_token(subject: str, token_type: str, expires: timedelta, **claims) -> tuple[str, dict]:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": subject,
        "type": token_type,
        "jti": uuid.uuid4().hex,
        "iat": now,
        "exp": now + expires,
        **claims,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm), payload


def decode_token(token: str, expected_type: str) -> dict:
    """Raises jwt.PyJWTError if the token is invalid, expired or the wrong type."""
    payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    if payload.get("type") != expected_type:
        raise jwt.InvalidTokenError("wrong token type")
    return payload


# ---- Secure tokens (share links, reset links) -------------------------------
def generate_secure_token(nbytes: int = 32) -> str:
    return secrets.token_urlsafe(nbytes)


def hash_token(token: str) -> str:
    """Only the SHA-256 of a token is stored; the raw token is shown to the user once."""
    return hashlib.sha256(token.encode()).hexdigest()
