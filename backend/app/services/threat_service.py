"""Suspicious-activity detection using Redis counters. Findings become security events."""
import logging

from app.core.config import settings
from app.core.redis_client import get_redis
from app.core.request import RequestInfo
from app.services import audit_service as audit

log = logging.getLogger("trustshare.threat")
WINDOW = settings.login_lock_minutes * 60


def is_locked(email: str, ip: str) -> bool:
    r = get_redis()
    return int(r.get(f"fail:email:{email}") or 0) >= settings.login_max_failures


def register_failed_login(email: str, ip: str, info: RequestInfo, user=None) -> None:
    try:
        r = get_redis()
        n = r.incr(f"fail:email:{email}")
        r.expire(f"fail:email:{email}", WINDOW)
        r.incr(f"fail:ip:{ip}")
        r.expire(f"fail:ip:{ip}", WINDOW)
        r.sadd(f"fail:ip_accounts:{ip}", email)
        r.expire(f"fail:ip_accounts:{ip}", WINDOW)

        if n == settings.login_max_failures:
            audit.log_security_event(
                audit.EVT_MULTIPLE_LOGIN, "high", "Multiple failed login attempts", info, user,
                f"{n} failed attempts for {email}; account temporarily locked for {settings.login_lock_minutes} minutes")
            if user is not None:
                from app.core.database import SessionLocal
                from app.services import notification_service
                with SessionLocal() as db:
                    notification_service.notify(
                        db, user.id, "security", "Repeated failed sign-ins",
                        f"There were {n} failed sign-in attempts on your account from IP {ip}. "
                        "If this wasn't you, change your password.", email_to=user.email)
                    db.commit()

        accounts = r.scard(f"fail:ip_accounts:{ip}")
        if accounts == 3 and r.set(f"flag:ip:{ip}", 1, nx=True, ex=WINDOW):
            audit.log_security_event(audit.EVT_SUSPICIOUS_IP, "high", "Suspicious IP: many accounts targeted", info,
                                     details=f"{ip} failed to sign in to {accounts} different accounts")
    except Exception:  # noqa: BLE001
        log.exception("threat detection failed")


def clear_failures(email: str) -> None:
    try:
        get_redis().delete(f"fail:email:{email}")
    except Exception:  # noqa: BLE001
        pass


def check_new_device(user, info: RequestInfo) -> None:
    """Flag a sign-in from an IP the user has never used before (after their first one)."""
    try:
        r = get_redis()
        key = f"known_ips:{user.id}"
        known = r.smembers(key)
        if known and info.ip not in known:
            audit.log_security_event(audit.EVT_SUSPICIOUS_IP, "medium", "Suspicious login from new device", info, user,
                                     f"First sign-in from {info.ip}", notify_admins=False)
            from app.core.database import SessionLocal
            from app.services import notification_service
            with SessionLocal() as db:
                notification_service.notify(
                    db, user.id, "security", "New sign-in location",
                    f"Your account was accessed from a new IP address ({info.ip}). If this wasn't you, "
                    "revoke the session under Security and change your password.", email_to=user.email)
                db.commit()
        r.sadd(key, info.ip)
    except Exception:  # noqa: BLE001
        log.exception("new-device check failed")


def check_download_anomaly(actor_key: str, info: RequestInfo, user=None) -> None:
    try:
        r = get_redis()
        key = f"dl:{actor_key}"
        n = r.incr(key)
        if n == 1:
            r.expire(key, 600)
        if n == settings.download_anomaly_threshold + 1:
            audit.log_security_event(audit.EVT_OTHER, "medium", "File download anomaly", info, user,
                                     f"More than {settings.download_anomaly_threshold} downloads in 10 minutes")
    except Exception:  # noqa: BLE001
        log.exception("download anomaly check failed")
