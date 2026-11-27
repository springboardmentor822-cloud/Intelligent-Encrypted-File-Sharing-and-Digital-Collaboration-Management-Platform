"""Rule-based suspicious-activity detection, run whenever an access attempt is recorded.

Counters live in Redis with an expiry window; a rule fires exactly once when its threshold is crossed.
(Failed-login lockout and download-spike rules live in threat_service.)
"""
import logging

from app.core.redis_client import get_redis
from app.core.request import RequestInfo
from app.services import audit_service as audit
from app.services import detection_rules as rules

log = logging.getLogger("trustshare.detection")


def on_access_attempt(kind: str, reason: str, info: RequestInfo, user=None) -> None:
    bucket = rules.classify_reason(reason)
    if not bucket:
        return
    try:
        r = get_redis()
        window = rules.window_seconds()
        if bucket in rules.LINK_LABELS:
            label = rules.LINK_LABELS[bucket]
            # One alert per visitor per reason per window, so a refreshing browser can't flood the admin.
            if r.set(f"det:ev:{bucket}:{info.ip}", 1, nx=True, ex=window):
                audit.log_security_event(
                    audit.EVT_UNAUTHORIZED, "low", f"Attempt to use {label} share link", info, user,
                    f"Someone from {info.ip} tried to open {label} share link", notify_admins=True)
            key = f"det:cnt:{bucket}:{info.ip}"
            n = r.incr(key)
            if n == 1:
                r.expire(key, window)
            if n == rules.link_attempts_max():
                audit.log_security_event(
                    audit.EVT_SUSPICIOUS_IP, "medium", f"Repeated attempts to use {label} share links", info, user,
                    f"{n} attempts from {info.ip} within {window // 60} minutes", notify_admins=True)
        elif bucket == "unauthorized":
            who = str(user.id) if user is not None else info.ip
            key = f"det:cnt:unauth:{who}"
            n = r.incr(key)
            if n == 1:
                r.expire(key, window)
            if n == rules.unauthorized_max():
                who_text = user.email if user is not None else info.ip
                audit.log_security_event(
                    audit.EVT_UNAUTHORIZED, "high", "Repeated unauthorized access", info, user,
                    f"{n} denied requests by {who_text} within {window // 60} minutes", notify_admins=True)
    except Exception:  # noqa: BLE001
        log.exception("detection failed")
