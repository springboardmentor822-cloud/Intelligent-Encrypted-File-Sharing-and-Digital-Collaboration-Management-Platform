import hashlib, secrets, uuid
from datetime import timedelta
import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, InvalidHashError
from ..config import get_settings
from ..db import utcnow

ph = PasswordHasher()   # Argon2id
_DUMMY = ph.hash("dummy-password-for-timing")


def hash_password(pw: str) -> str:
    return ph.hash(pw)


def verify_password(pw: str, h: str | None) -> bool:
    try:
        return ph.verify(h or _DUMMY, pw) and h is not None
    except (VerifyMismatchError, InvalidHashError):
        return False


def new_token(nbytes: int = 32) -> str:
    return secrets.token_urlsafe(nbytes)


def sha256(s: str) -> str:
    return hashlib.sha256(s.encode()).hexdigest()


def create_access_token(user_id: str, remember: bool = False) -> tuple[str, str, object]:
    s = get_settings()
    exp = utcnow() + (timedelta(days=s.remember_token_days) if remember else timedelta(minutes=s.access_token_minutes))
    jti = uuid.uuid4().hex
    tok = jwt.encode({"sub": user_id, "jti": jti, "exp": exp, "iat": utcnow(), "typ": "access"}, s.jwt_secret, algorithm=s.jwt_algorithm)
    return tok, jti, exp


def decode_token(tok: str) -> dict:
    """Decode an ACCESS token. Purpose-scoped grants (typ='scope') are rejected here so a share-passcode,
    Secure Folder, or Admin Visit grant can never be replayed as a session token."""
    s = get_settings()
    claims = jwt.decode(tok, s.jwt_secret, algorithms=[s.jwt_algorithm],
                        options={"require": ["exp", "sub", "jti", "typ"]})
    if claims.get("typ") != "access":
        raise jwt.InvalidTokenError("not an access token")
    return claims


def create_scope_token(scope: str, subject: str, minutes: int = 15) -> tuple[str, object]:
    """Short-lived, purpose-scoped grant (e.g. an unlocked Secure Folder or a verified share passcode).
    It is signed with the same secret but carries typ='scope' so it can never be used as an access token."""
    s = get_settings()
    exp = utcnow() + timedelta(minutes=minutes)
    tok = jwt.encode({"sub": subject, "jti": uuid.uuid4().hex, "exp": exp, "iat": utcnow(), "typ": "scope",
                      "scope": scope}, s.jwt_secret, algorithm=s.jwt_algorithm)
    return tok, exp


def decode_scope_token(tok: str, scope: str) -> dict:
    s = get_settings()
    claims = jwt.decode(tok, s.jwt_secret, algorithms=[s.jwt_algorithm], options={"require": ["exp", "sub", "jti", "typ"]})
    if claims.get("typ") != "scope" or claims.get("scope") != scope:
        raise jwt.InvalidTokenError("wrong scope")
    return claims


def password_problem(pw: str) -> str | None:
    if len(pw) < 8: return "Password must be at least 8 characters"
    if len(pw) > 128: return "Password is too long"
    if not any(c.isalpha() for c in pw) or not any(c.isdigit() for c in pw):
        return "Password must contain letters and numbers"
    return None
