"""Rule-based suspicious-activity detection.

Each rule counts recent activity in a rolling window and, when the threshold is crossed, creates a
SecurityAlert (severity + rule id), a SecurityEvent, and an admin notification. Alerts are deduplicated
per rule + subject within the rule window so a scan loop cannot flood the dashboard.
"""
from __future__ import annotations

from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import iso, utcnow
from ..models import ActivityRecord, LoginEvent, SecurityAlert, User
from ..notifications import service as notify_service
from ..services.audit import raise_alert, security_event

# rule id -> (title, kind, severity, activity types)
RULES = {
    "failed_logins": ("Repeated failed login attempts", "failed_login", "high", ["login_failed"]),
    "unauthorized_access": ("Repeated unauthorized access attempts", "unauthorized_access", "high",
                            ["unauthorized_access"]),
    "download_burst": ("Suspicious download volume", "suspicious_download", "medium", ["file_download"]),
    "expired_link_access": ("Repeated expired share-link access", "expired_link_access", "medium",
                            ["share_expired_access"]),
    "revoked_link_access": ("Repeated revoked share-link access", "revoked_link_access", "high",
                            ["share_revoked_access"]),
}


def rule_config() -> list[dict]:
    s = get_settings()
    return [
        {"id": "failed_logins", "label": RULES["failed_logins"][0], "threshold": s.failed_login_threshold,
         "window_minutes": s.failed_login_window_minutes, "severity": "high",
         "description": f"More than {s.failed_login_threshold} failed logins in {s.failed_login_window_minutes} minutes"},
        {"id": "unauthorized_access", "label": RULES["unauthorized_access"][0],
         "threshold": s.unauthorized_threshold, "window_minutes": s.unauthorized_window_minutes,
         "severity": "high",
         "description": f"{s.unauthorized_threshold}+ unauthorized access attempts in {s.unauthorized_window_minutes} minutes"},
        {"id": "download_burst", "label": RULES["download_burst"][0], "threshold": s.download_burst_threshold,
         "window_minutes": s.download_burst_window_minutes, "severity": "medium",
         "description": f"More than {s.download_burst_threshold} downloads in {s.download_burst_window_minutes} minutes"},
        {"id": "expired_link_access", "label": RULES["expired_link_access"][0],
         "threshold": s.link_abuse_threshold, "window_minutes": s.link_abuse_window_minutes,
         "severity": "medium",
         "description": f"{s.link_abuse_threshold}+ attempts to use expired links in {s.link_abuse_window_minutes} minutes"},
        {"id": "revoked_link_access", "label": RULES["revoked_link_access"][0],
         "threshold": s.link_abuse_threshold, "window_minutes": s.link_abuse_window_minutes,
         "severity": "high",
         "description": f"{s.link_abuse_threshold}+ attempts to use revoked links in {s.link_abuse_window_minutes} minutes"},
    ]


def _already_alerted(db: Session, rule: str, user_id: str | None, email: str | None, since) -> bool:
    stmt = select(SecurityAlert.id).where(SecurityAlert.rule == rule, SecurityAlert.created_at >= since)
    if user_id:
        stmt = stmt.where(SecurityAlert.user_id == user_id)
    elif email:
        stmt = stmt.where(SecurityAlert.email == email)
    else:
        stmt = stmt.where(SecurityAlert.user_id.is_(None), SecurityAlert.email.is_(None))
    return db.execute(stmt.limit(1)).scalar() is not None


def _emit(db: Session, rule: str, *, user_id: str | None, email: str | None, count: int,
          window_minutes: int, ip: str | None = None, details: dict | None = None) -> SecurityAlert | None:
    title, kind, severity, _ = RULES[rule]
    since = utcnow() - timedelta(minutes=window_minutes)
    if _already_alerted(db, rule, user_id, email, since):
        return None
    desc = f"{count} matching events in the last {window_minutes} minutes"
    alert = raise_alert(db, kind, severity, title, desc, user_id=user_id, email=email, resource=f"rule:{rule}",
                        details={**(details or {}), "count": count, "window_minutes": window_minutes}, rule=rule)
    security_event(db, "suspicious_activity", severity, f"{title} ({desc})", user_id=user_id,
                   resource=f"rule:{rule}", details={"count": count, "window_minutes": window_minutes})
    notify_service.notify_admins(db, f"Security alert: {title}", desc, severity=severity,
                                 link="/admin/security-monitoring", email=True,
                                 meta={"rule": rule, "alert_id": alert.id, "user_id": user_id})
    return alert


def _count_by_subject(db: Session, activity_type: str, since, limit: int) -> list[tuple]:
    return db.execute(
        select(ActivityRecord.user_id, func.count(ActivityRecord.id), func.max(ActivityRecord.ip))
        .where(ActivityRecord.activity_type == activity_type, ActivityRecord.created_at >= since)
        .group_by(ActivityRecord.user_id).order_by(func.count(ActivityRecord.id).desc()).limit(limit)
    ).all()


def scan(db: Session) -> dict:
    """Evaluate every rule. Safe to call repeatedly; returns the alerts created by this scan."""
    s = get_settings()
    created: list[SecurityAlert] = []
    now = utcnow()

    # Rule 1 — failed logins (LoginEvent covers unknown emails too).
    since = now - timedelta(minutes=s.failed_login_window_minutes)
    rows = db.execute(
        select(LoginEvent.user_id, LoginEvent.email, func.count(LoginEvent.id), func.max(LoginEvent.ip))
        .where(LoginEvent.success.is_(False), LoginEvent.created_at >= since)
        .group_by(LoginEvent.user_id, LoginEvent.email)
        .order_by(func.count(LoginEvent.id).desc()).limit(s.detection_scan_limit)
    ).all()
    for user_id, email, count, ip in rows:
        if count > s.failed_login_threshold:
            a = _emit(db, "failed_logins", user_id=user_id, email=email, count=count,
                      window_minutes=s.failed_login_window_minutes, ip=ip)
            if a:
                created.append(a)

    # Rules 2-5 — activity-count based.
    specs = [
        ("unauthorized_access", "unauthorized_access", s.unauthorized_threshold, s.unauthorized_window_minutes, ">="),
        ("download_burst", "file_download", s.download_burst_threshold, s.download_burst_window_minutes, ">"),
        ("expired_link_access", "share_expired_access", s.link_abuse_threshold, s.link_abuse_window_minutes, ">="),
        ("revoked_link_access", "share_revoked_access", s.link_abuse_threshold, s.link_abuse_window_minutes, ">="),
    ]
    for rule, activity_type, threshold, window, op in specs:
        since = now - timedelta(minutes=window)
        for user_id, count, ip in _count_by_subject(db, activity_type, since, s.detection_scan_limit):
            hit = count >= threshold if op == ">=" else count > threshold
            if hit:
                a = _emit(db, rule, user_id=user_id, email=None, count=count, window_minutes=window, ip=ip,
                          details={"activity_type": activity_type})
                if a:
                    created.append(a)

    return {"scanned_at": iso(now), "rules": len(RULES), "alerts_created": len(created),
            "alerts": [alert_out(a) for a in created]}


def alert_out(a: SecurityAlert) -> dict:
    return {"id": a.id, "alert_id": f"ALR-{a.id:06d}", "rule": a.rule, "kind": a.kind, "severity": a.severity,
            "title": a.title, "description": a.description, "user_id": a.user_id, "email": a.email, "ip": a.ip,
            "resource": a.resource, "details": a.details or {}, "status": a.status,
            "acknowledged_by": a.acknowledged_by, "acknowledged_at": iso(a.acknowledged_at),
            "created_at": iso(a.created_at)}
