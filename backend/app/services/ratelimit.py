"""Simple in-process sliding-window limiter. Single-process only: use Redis for multi-instance deployments."""
import time
from collections import defaultdict, deque
from fastapi import HTTPException, Request
from ..config import get_settings
from ..db import SessionLocal
from .audit import client_ip, security_event

_hits: dict[tuple[str, str], deque] = defaultdict(deque)


def reset():
    _hits.clear()


def rate_limit(bucket: str, limit: int | None = None, per: int = 60):
    def dep(request: Request):
        s = get_settings()
        if not s.rate_limit_enabled:
            return
        lim = limit or s.login_rate_per_min
        ip = client_ip(request) or "?"
        q, now = _hits[(bucket, ip)], time.monotonic()
        while q and now - q[0] > per:
            q.popleft()
        if len(q) >= lim:
            with SessionLocal() as db:
                if len(q) == lim:   # log once per window rather than on every blocked call
                    security_event(db, "rate_limit", "medium", f"Rate limit exceeded on {bucket}", request=request,
                                   kind="blocked", disposition="blocked", details={"bucket": bucket})
            q.append(now)
            raise HTTPException(429, "Too many requests. Please try again shortly.")
        q.append(now)
    return dep
