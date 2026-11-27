from fastapi import HTTPException

from app.core.redis_client import get_redis
from app.core.request import RequestInfo
from app.services import audit_service


def rate_limit(key: str, limit: int, window_seconds: int, info: RequestInfo | None = None) -> None:
    """Fixed-window limiter backed by Redis. Raises 429 and records a blocked access attempt."""
    r = get_redis()
    rk = f"rl:{key}"
    count = r.incr(rk)
    if count == 1:
        r.expire(rk, window_seconds)
    if count > limit:
        if info:
            audit_service.log_access_attempt("blocked", f"rate limit exceeded ({key.split(':')[0]})", info)
        ttl = r.ttl(rk)
        raise HTTPException(status_code=429, detail="Too many requests. Please wait and try again.",
                            headers={"Retry-After": str(max(ttl, 1))})
