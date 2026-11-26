import logging
import os

from fastapi import HTTPException, Request

from app.database import redis_client
from app.activity import record_activity
from app.platform_settings import get_persisted_setting


rate_logger = logging.getLogger("trustshare.rate_limit")
RATE_LIMIT_PREFIX = "trustshare:rate"
AUTH_RATE_LIMIT_MAX_ATTEMPTS = int(
    os.getenv("AUTH_RATE_LIMIT_MAX_ATTEMPTS", "5")
)
AUTH_RATE_LIMIT_WINDOW_SECONDS = int(
    os.getenv("AUTH_RATE_LIMIT_WINDOW_SECONDS", "300")
)


def client_address(request: Request) -> str:
    if request.client is None or not request.client.host:
        return "unknown"

    return request.client.host


def enforce_auth_rate_limit(scope: str, request: Request) -> None:
    key = f"{RATE_LIMIT_PREFIX}:{scope}:{client_address(request)}"

    try:
        attempts = redis_client.incr(key)
        if attempts == 1:
            redis_client.expire(key, AUTH_RATE_LIMIT_WINDOW_SECONDS)
    except Exception as exc:
        rate_logger.warning(
            "Redis rate limit unavailable: scope=%s error=%s",
            scope,
            type(exc).__name__,
        )
        raise HTTPException(
            status_code=503,
            detail="Authentication is temporarily unavailable. Please try again later.",
            headers={"Retry-After": str(AUTH_RATE_LIMIT_WINDOW_SECONDS)},
        ) from exc

    try:
        attempt_limit = int(
            get_persisted_setting(
                "auth_rate_limit_attempts",
                AUTH_RATE_LIMIT_MAX_ATTEMPTS,
            )
        )
    except (TypeError, ValueError):
        attempt_limit = AUTH_RATE_LIMIT_MAX_ATTEMPTS

    if attempts > attempt_limit:
        record_activity(
            "login_blocked",
            provider=scope,
            ip_address=client_address(request),
            details="Authentication request blocked by rate limit",
            severity="warning",
        )
        raise HTTPException(
            status_code=429,
            detail="Too many attempts. Please try again later.",
            headers={"Retry-After": str(AUTH_RATE_LIMIT_WINDOW_SECONDS)},
        )
