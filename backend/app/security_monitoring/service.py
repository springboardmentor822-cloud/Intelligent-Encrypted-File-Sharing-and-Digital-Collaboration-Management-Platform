"""Query helpers for the Security Monitoring dashboard."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import iso, utcnow
from ..models import ActivityRecord, SecurityAlert, SecurityEvent, User
from .detection import alert_out


def _between(col, start, end):
    conds = []
    if start:
        conds.append(col >= start)
    if end:
        conds.append(col < end)
    return conds


def overview(db: Session, start: datetime | None = None, end: datetime | None = None) -> dict:
    def count_activity(t: str) -> int:
        stmt = select(func.count(ActivityRecord.id)).where(ActivityRecord.activity_type == t)
        for c in _between(ActivityRecord.created_at, start, end):
            stmt = stmt.where(c)
        return db.execute(stmt).scalar() or 0

    alerts_stmt = select(SecurityAlert)
    for c in _between(SecurityAlert.created_at, start, end):
        alerts_stmt = alerts_stmt.where(c)
    alerts = db.execute(alerts_stmt.order_by(SecurityAlert.id.desc())).scalars().all()
    open_alerts = [a for a in alerts if a.status == "open"]
    by_sev: dict[str, int] = {}
    for a in alerts:
        by_sev[a.severity] = by_sev.get(a.severity, 0) + 1

    ev_stmt = select(SecurityEvent)
    for c in _between(SecurityEvent.created_at, start, end):
        ev_stmt = ev_stmt.where(c)
    events = db.execute(ev_stmt.order_by(SecurityEvent.id.desc()).limit(500)).scalars().all()

    series_stmt = (select(func.substr(SecurityAlert.created_at, 1, 10), func.count())
                   .group_by(func.substr(SecurityAlert.created_at, 1, 10))
                   .order_by(func.substr(SecurityAlert.created_at, 1, 10)))
    for c in _between(SecurityAlert.created_at, start, end):
        series_stmt = series_stmt.where(c)
    series = db.execute(series_stmt).all()

    return {
        "totals": {
            "failed_logins": count_activity("login_failed"),
            "unauthorized_attempts": count_activity("unauthorized_access"),
            "suspicious_downloads": count_activity("file_download"),
            "expired_link_attempts": count_activity("share_expired_access"),
            "revoked_link_attempts": count_activity("share_revoked_access"),
            "open_alerts": len(open_alerts),
            "alerts": len(alerts),
            "events": len(events),
        },
        "alerts_by_severity": by_sev,
        "alerts_series": [{"date": d, "count": n} for d, n in series],
        "recent_alerts": [alert_out(a) for a in alerts[:10]],
        "recent_events": [event_out(e) for e in events[:15]],
    }


def event_out(e: SecurityEvent) -> dict:
    return {"id": e.id, "event_id": f"EVT-{e.id:08d}", "category": e.category, "kind": e.kind,
            "severity": e.severity, "description": e.description, "user_id": e.user_id, "ip": e.ip,
            "resource": e.resource, "details": e.details or {}, "disposition": e.disposition,
            "created_at": iso(e.created_at)}


def list_events(db: Session, *, user_id: str | None = None, category: str | None = None,
                severity: str | None = None, start: datetime | None = None, end: datetime | None = None,
                page: int = 1, page_size: int = 50) -> dict:
    conds = []
    if user_id:
        conds.append(SecurityEvent.user_id == user_id)
    if category:
        conds.append(SecurityEvent.category == category)
    if severity:
        conds.append(SecurityEvent.severity == severity)
    conds += _between(SecurityEvent.created_at, start, end)
    total = db.execute(select(func.count(SecurityEvent.id)).where(*conds)).scalar() or 0
    rows = db.execute(select(SecurityEvent).where(*conds).order_by(SecurityEvent.id.desc())
                      .offset((page - 1) * page_size).limit(page_size)).scalars().all()
    return {"items": [event_out(e) for e in rows], "total": total, "page": page, "page_size": page_size}


def list_alerts(db: Session, *, user_id: str | None = None, rule: str | None = None,
                severity: str | None = None, status: str | None = None, start: datetime | None = None,
                end: datetime | None = None, page: int = 1, page_size: int = 50) -> dict:
    conds = []
    if user_id:
        conds.append(SecurityAlert.user_id == user_id)
    if rule:
        conds.append(SecurityAlert.rule == rule)
    if severity:
        conds.append(SecurityAlert.severity == severity)
    if status:
        conds.append(SecurityAlert.status == status)
    conds += _between(SecurityAlert.created_at, start, end)
    total = db.execute(select(func.count(SecurityAlert.id)).where(*conds)).scalar() or 0
    rows = db.execute(select(SecurityAlert, User.email).outerjoin(User, User.id == SecurityAlert.user_id)
                      .where(*conds).order_by(SecurityAlert.id.desc())
                      .offset((page - 1) * page_size).limit(page_size)).all()
    items = [{**alert_out(a), "user_email": email} for a, email in rows]
    return {"items": items, "total": total, "page": page, "page_size": page_size}


def acknowledge(db: Session, alert_id: int, actor_id: str) -> SecurityAlert | None:
    a = db.get(SecurityAlert, alert_id)
    if not a:
        return None
    if a.status != "acknowledged":
        a.status = "acknowledged"
        a.acknowledged_by = actor_id
        a.acknowledged_at = utcnow()
        db.commit()
    return a
