"""Shared FastAPI dependencies: current user, RBAC role checks, rate limiting."""
import jwt
from fastapi import Depends, HTTPException, Request
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_token
from app.db.postgres import get_db
from app.db.redis import redis_client
from app.models.postgres import User

# OAuth2 "password flow": the client posts email+password to /auth/token and sends the returned token as Bearer.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/token")


def client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


async def get_token_payload(token: str = Depends(oauth2_scheme)) -> dict:
    try:
        payload = decode_token(token, "access")
    except jwt.PyJWTError:
        raise HTTPException(401, "Invalid or expired token")
    if await redis_client.exists(f"blacklist:{payload['jti']}"):
        raise HTTPException(401, "Token has been revoked (logged out)")
    return payload


async def get_current_user(
    payload: dict = Depends(get_token_payload), db: AsyncSession = Depends(get_db)
) -> User:
    user = await db.get(User, payload["sub"])
    if not user or not user.is_active or getattr(user, "approval_status", "approved") != "approved":
        raise HTTPException(401, "User not found or disabled")
    return user


def role_names(user: User) -> list[str]:
    return [r.name for r in user.roles]


def is_admin(user: User) -> bool:
    return "admin" in role_names(user)


def require_roles(*allowed: str):
    """RBAC: only users having at least one of the allowed roles can pass."""

    async def checker(request: Request, user: User = Depends(get_current_user)) -> User:
        if not set(role_names(user)) & set(allowed):
            from app.services.audit import log_event  # imported here to avoid a circular import

            await log_event("admin_access" if "admin" in allowed else "role_denied", request, user=user,
                            result="failure", severity="warning", details={"reason": "forbidden", "path": request.url.path})
            raise HTTPException(403, f"This action requires one of these roles: {', '.join(allowed)}")
        return user

    return checker


def rate_limit(name: str, limit: int, window_seconds: int):
    """Allow only `limit` requests per `window_seconds` from one IP (counter kept in Redis)."""

    async def dep(request: Request):
        key = f"rl:{name}:{client_ip(request)}"
        count = await redis_client.incr(key)
        if count == 1:
            await redis_client.expire(key, window_seconds)
        if count > limit:
            if count == limit + 1 or count % 25 == 0:  # log the first block, then every 25th (no log flooding)
                from app.services.audit import log_event

                await log_event("blocked_request", request, result="failure", severity="warning",
                                details={"reason": "rate_limit", "endpoint": name})
            raise HTTPException(
                429, "Too many requests. Please slow down.", headers={"Retry-After": str(window_seconds)}
            )

    return dep
