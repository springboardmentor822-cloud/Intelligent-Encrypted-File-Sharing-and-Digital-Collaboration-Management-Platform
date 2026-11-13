from datetime import datetime, timedelta
import jwt
from fastapi import Depends, Header, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session
from .db import get_db, utcnow
from .models import RevokedToken, User
from .services.audit import denied
from .services.security import decode_scope_token, decode_token

bearer = HTTPBearer(auto_error=False)


def _auth_fail(db, request, reason: str, severity: str):
    denied(db, request, user_id=None, action="auth.protected_route_denied", resource_type="route",
           resource_id=request.url.path[:60], severity=severity,
           description=f"Unauthenticated request to protected route ({reason})", details={"reason": reason})
    raise HTTPException(401, "Not authenticated", headers={"WWW-Authenticate": "Bearer"})


def get_claims(request: Request, creds: HTTPAuthorizationCredentials | None = Depends(bearer), db: Session = Depends(get_db)):
    if creds is None:
        _auth_fail(db, request, "missing_credentials", "informational")
    try:
        claims = decode_token(creds.credentials)
    except jwt.ExpiredSignatureError:
        _auth_fail(db, request, "expired_token", "informational")
    except jwt.PyJWTError:
        _auth_fail(db, request, "invalid_token", "low")
    if db.get(RevokedToken, claims["jti"]):
        _auth_fail(db, request, "revoked_token", "low")
    return claims


def current_user(request: Request, claims: dict = Depends(get_claims), db: Session = Depends(get_db)) -> User:
    user = db.get(User, claims["sub"])
    if not user or not user.is_active:
        _auth_fail(db, request, "inactive_or_unknown_user", "low")
    request.state.user = user
    return user


ADMIN_VISIT_SCOPE = "admin_visit"


def admin_visit_claims(token: str | None, user: User) -> dict | None:
    """Validate an Admin Visit grant. The grant is a purpose-scoped token (typ=scope) bound to one user id,
    so it can never be replayed as an access token or used by a different account."""
    if not token:
        return None
    try:
        claims = decode_scope_token(token, ADMIN_VISIT_SCOPE)
    except jwt.PyJWTError:
        return None
    return claims if claims.get("sub") == user.id else None


def require_admin(request: Request, user: User = Depends(current_user), db: Session = Depends(get_db),
                  x_admin_visit: str | None = Header(None)) -> User:
    """Server-side admin gate.

    Two ways in, both verified server-side:
      1. the account's database role is `admin`, or
      2. the caller holds a live Admin Visit grant (password-gated, see /api/admin-visit/unlock).
    The role is read from the database, never from the token or request body.
    """
    if user.role == "admin":
        request.state.admin_visit = False
        return user
    if admin_visit_claims(x_admin_visit, user):
        request.state.admin_visit = True
        return user
    denied(db, request, user_id=user.id, action="admin.access_denied", resource_type="route",
           resource_id=request.url.path[:60], severity="medium",
           description="Non-administrator attempted to access an administrator endpoint without an Admin Visit grant")
    raise HTTPException(403, "Administrator privileges required", headers={"X-Admin-Visit": "required"})


def parse_range(start: str | None, end: str | None, default_days: int = 30) -> tuple[datetime, datetime]:
    """Dates are YYYY-MM-DD (UTC). `end` is inclusive."""
    try:
        e = datetime.fromisoformat(end[:10]) + timedelta(days=1) if end else utcnow().replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)
        s = datetime.fromisoformat(start[:10]) if start else e - timedelta(days=default_days)
    except ValueError:
        raise HTTPException(422, "Invalid date; use YYYY-MM-DD")
    if s >= e or (e - s).days > 366:
        raise HTTPException(422, "Invalid date range (max 366 days)")
    return s, e


def days_between(s: datetime, e: datetime) -> list[str]:
    return [(s + timedelta(days=i)).date().isoformat() for i in range((e - s).days)]


def paginate(q_total: int, page: int, size: int) -> dict:
    return {"total": q_total, "page": page, "page_size": size}


def pct_change(cur: int | float, prev: int | float):
    return None if not prev else round((cur - prev) / prev * 100, 1)
