
import os
import hmac
import hashlib
from datetime import datetime, timedelta, timezone

from authlib.integrations.starlette_client import OAuth
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from pwdlib import PasswordHash
from pwdlib.exceptions import UnknownHashError

from app.database import mysql_engine
from app.activity import record_activity
from app.rate_limit import client_address
from app.models import User
from sqlalchemy.orm import Session, sessionmaker


# JWT configuration
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
TOKEN_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))

if len(JWT_SECRET_KEY) < 32:
    raise RuntimeError(
        "Set JWT_SECRET_KEY in backend/.env to a strong random secret."
    )


password_hash = PasswordHash.recommended()
bearer_scheme = HTTPBearer(auto_error=False)
ROLE_SUPER_ADMIN = "super_admin"
ROLE_ADMIN = "admin"
ROLE_USER = "user"
ROLE_GUEST = "guest"

VALID_ROLES = frozenset({
    ROLE_SUPER_ADMIN,
    ROLE_ADMIN,
    ROLE_USER,
    ROLE_GUEST,
})

SessionLocal = sessionmaker(
    bind=mysql_engine,
    autoflush=False,
    autocommit=False,
)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def hash_password(password: str) -> str:
    return password_hash.hash(password)


def verify_password(password: str, hashed_password: str) -> bool:
    try:
        return password_hash.verify(password, hashed_password)
    except UnknownHashError:
        return False


def create_access_token(user: User) -> str:
    expires_at = datetime.now(timezone.utc) + timedelta(
        minutes=TOKEN_MINUTES
    )

    payload = {
        "sub": str(user.id),
        "email": user.email,
        "role": effective_role(user),
        "password_version": _password_version(user),
        "exp": expires_at,
    }

    return jwt.encode(
        payload,
        JWT_SECRET_KEY,
        algorithm=JWT_ALGORITHM,
    )


def _password_version(user: User) -> str:
    password_hash = user.hashed_password or "oauth-account"
    return hmac.new(
        JWT_SECRET_KEY.encode("utf-8"),
        password_hash.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def effective_role(user: User) -> str:
    """Return a safe role value; unknown values never become privileged."""
    if user.role in VALID_ROLES:
        return user.role

    return ROLE_USER

def require_roles(*allowed_roles: str):
    allowed = frozenset(allowed_roles)

    if not allowed.issubset(VALID_ROLES):
        raise ValueError("Role dependency contains an unknown role.")

    def dependency(
        request: Request,
        user: User = Depends(get_current_user),
    ) -> User:
        if effective_role(user) not in allowed:
            record_activity(
                "unauthorized_access",
                user.id,
                username=getattr(user, "full_name", None),
                ip_address=client_address(request),
                details="Protected route access denied",
                severity="warning",
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to perform this action.",
            )

        return user

    return dependency


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Please sign in to continue.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = jwt.decode(
            credentials.credentials,
            JWT_SECRET_KEY,
            algorithms=[JWT_ALGORITHM],
        )

        subject = payload.get("sub")
        if not subject:
            raise HTTPException(
                status_code=401,
                detail="Invalid authentication token.",
            )

        user_id = int(subject)

    except (JWTError, ValueError):
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired authentication token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = db.query(User).filter(User.id == user_id).first()

    if user is None:
        raise HTTPException(
            status_code=401,
            detail="Account not found.",
        )

    token_password_version = payload.get("password_version")
    if not token_password_version or not hmac.compare_digest(
        token_password_version,
        _password_version(user),
    ):
        raise HTTPException(
            status_code=401,
            detail="This authentication token is no longer valid.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user


# OAuth providers
oauth = OAuth()

# Google OAuth
google_client_id = os.getenv("GOOGLE_CLIENT_ID", "")
google_client_secret = os.getenv("GOOGLE_CLIENT_SECRET", "")

if google_client_id and google_client_secret:
    oauth.register(
        name="google",
        client_id=google_client_id,
        client_secret=google_client_secret,
        server_metadata_url=(
            "https://accounts.google.com/.well-known/openid-configuration"
        ),
        client_kwargs={
            "scope": "openid email profile",
        },
    )


# Microsoft OAuth
microsoft_client_id = os.getenv("MICROSOFT_CLIENT_ID", "")
microsoft_client_secret = os.getenv("MICROSOFT_CLIENT_SECRET", "")
microsoft_tenant = os.getenv("MICROSOFT_TENANT", "consumers").strip()

if microsoft_client_id and microsoft_client_secret:
    oauth.register(
        name="microsoft",
        client_id=microsoft_client_id,
        client_secret=microsoft_client_secret,
        server_metadata_url=(
            "https://login.microsoftonline.com/"
            f"{microsoft_tenant}/v2.0/.well-known/openid-configuration"
        ),
        client_kwargs={
            "scope": "openid profile email",
        },
        # Microsoft consumer accounts have a fixed issuer.
        # This option is not needed when using the consumers endpoint.
    )
