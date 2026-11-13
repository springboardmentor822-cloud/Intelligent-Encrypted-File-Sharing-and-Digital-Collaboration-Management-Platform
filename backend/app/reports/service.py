from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import iso, utcnow
from ..models import ActivityRecord, DownloadRecord, File, SecurityAlert, SecurityEvent, Share, User
from ..serializers import share_status


def _range(col, start, end):
    c = []
    if start:
        c.append(col >= start)
    if end:
        c.append(col < end)
    return c


def _day(dt) -> str:
    return dt.date().isoformat() if dt else ""


def uploads(db: Session, *, start: datetime | None = None, end: datetime | None = None,
            user_id: str | None = None, file_id: str | None = None) -> dict:
    stmt = (select(ActivityRecord, File).outerjoin(File, File.id == ActivityRecord.file_id)
            .where(ActivityRecord.activity_type == "file_upload"))
    if user_id:
        stmt = stmt.where(ActivityRecord.user_id == user_id)
    if file_id:
        stmt = stmt.where(ActivityRecord.file_id == file_id)
    for c in _range(ActivityRecord.created_at, start, end):
        stmt = stmt.where(c)
    rows = db.execute(stmt.order_by(ActivityRecord.id.desc()).limit(10000)).all()
    users = {u.id: u for u in db.execute(select(User)).scalars().all()}
    by_user: dict[str, int] = {}
    by_type: dict[str, int] = {}
    by_status: dict[str, int] = {}
    by_day: dict[str, int] = {}
    total_bytes = 0
    for a, f in rows:
        key = a.user_id or "unknown"
        by_user[key] = by_user.get(key, 0) + 1
        cat = (f.category if f else "unknown")
        by_type[cat] = by_type.get(cat, 0) + 1
        by_status[a.status] = by_status.get(a.status, 0) + 1
        d = _day(a.created_at)
        by_day[d] = by_day.get(d, 0) + 1
        total_bytes += (f.size if f else 0)
    return {
        "total_uploads": len(rows), "total_bytes": total_bytes,
        "by_user": [{"user_id": k, "email": users[k].email if k in users else None,
                     "name": users[k].full_name if k in users else None, "count": v}
                    for k, v in sorted(by_user.items(), key=lambda x: -x[1])],
        "by_file_type": by_type, "by_status": by_status,
        "by_day": [{"date": k, "count": v} for k, v in sorted(by_day.items())],
        "recent": [{"id": a.id, "user_id": a.user_id, "file_id": a.file_id,
                    "file_name": f.original_name if f else None, "status": a.status,
                    "created_at": iso(a.created_at)} for a, f in rows[:20]],
    }


def downloads(db: Session, *, start: datetime | None = None, end: datetime | None = None,
              user_id: str | None = None, file_id: str | None = None) -> dict:
    stmt = (select(DownloadRecord, File).outerjoin(File, File.id == DownloadRecord.file_id)
            .where(DownloadRecord.action == "download"))
    if user_id:
        stmt = stmt.where(DownloadRecord.user_id == user_id)
    if file_id:
        stmt = stmt.where(DownloadRecord.file_id == file_id)
    for c in _range(DownloadRecord.created_at, start, end):
        stmt = stmt.where(c)
    rows = db.execute(stmt.order_by(DownloadRecord.id.desc()).limit(10000)).all()
    users = {u.id: u for u in db.execute(select(User)).scalars().all()}
    by_user: dict[str, int] = {}
    by_file: dict[str, dict] = {}
    by_day: dict[str, int] = {}
    total_bytes = 0
    for d, f in rows:
        key = d.user_id or "anonymous"
        by_user[key] = by_user.get(key, 0) + 1
        fk = d.file_id
        entry = by_file.setdefault(fk, {"file_id": fk, "file_name": f.original_name if f else None, "count": 0})
        entry["count"] += 1
        by_day[_day(d.created_at)] = by_day.get(_day(d.created_at), 0) + 1
        total_bytes += d.bytes or 0

    failed_stmt = select(ActivityRecord).where(ActivityRecord.activity_type == "file_download",
                                               ActivityRecord.status.in_(["failed", "denied"]))
    for c in _range(ActivityRecord.created_at, start, end):
        failed_stmt = failed_stmt.where(c)
    if user_id:
        failed_stmt = failed_stmt.where(ActivityRecord.user_id == user_id)
    failed = db.execute(failed_stmt.limit(10000)).scalars().all()

    return {
        "total_downloads": len(rows), "total_bytes": total_bytes,
        "failed_attempts": len(failed),
        "by_user": [{"user_id": k, "email": users[k].email if k in users else None,
                     "name": users[k].full_name if k in users else None, "count": v}
                    for k, v in sorted(by_user.items(), key=lambda x: -x[1])],
        "most_downloaded": sorted(by_file.values(), key=lambda x: -x["count"])[:10],
        "by_day": [{"date": k, "count": v} for k, v in sorted(by_day.items())],
        "recent": [{"id": d.id, "user_id": d.user_id, "file_id": d.file_id,
                    "file_name": f.original_name if f else None, "bytes": d.bytes,
                    "created_at": iso(d.created_at)} for d, f in rows[:20]],
    }


def sharing(db: Session, *, start: datetime | None = None, end: datetime | None = None,
            user_id: str | None = None, file_id: str | None = None) -> dict:
    stmt = (select(Share, File, User).outerjoin(File, File.id == Share.file_id)
            .outerjoin(User, User.id == Share.owner_id))
    if user_id:
        stmt = stmt.where(Share.owner_id == user_id)
    if file_id:
        stmt = stmt.where(Share.file_id == file_id)
    for c in _range(Share.created_at, start, end):
        stmt = stmt.where(c)
    rows = db.execute(stmt.order_by(Share.id.desc()).limit(10000)).all()
    now = utcnow()
    recipients = {u.id: u for u in db.execute(select(User)).scalars().all()}
    by_user: dict[str, int] = {}
    by_status: dict[str, int] = {}
    by_day: dict[str, int] = {}
    recipient_counts: dict[str, int] = {}
    for s, f, owner in rows:
        by_user[s.owner_id] = by_user.get(s.owner_id, 0) + 1
        st = share_status(s, now)
        by_status[st] = by_status.get(st, 0) + 1
        by_day[_day(s.created_at)] = by_day.get(_day(s.created_at), 0) + 1
        if s.recipient_id:
            recipient_counts[s.recipient_id] = recipient_counts.get(s.recipient_id, 0) + 1
    return {
        "total_shares": len(rows),
        "active_links": by_status.get("active", 0), "expired_links": by_status.get("expired", 0),
        "revoked_links": by_status.get("revoked", 0), "exhausted_links": by_status.get("exhausted", 0),
        "by_status": by_status,
        "by_user": [{"user_id": k, "email": recipients[k].email if k in recipients else None,
                     "count": v} for k, v in sorted(by_user.items(), key=lambda x: -x[1])],
        "recipients": [{"user_id": k, "email": recipients[k].email if k in recipients else None,
                        "count": v} for k, v in sorted(recipient_counts.items(), key=lambda x: -x[1])],
        "by_day": [{"date": k, "count": v} for k, v in sorted(by_day.items())],
        "recent": [{"id": s.id, "file_id": s.file_id, "file_name": f.original_name if f else None,
                    "owner_id": s.owner_id, "kind": s.kind, "status": share_status(s, now),
                    "created_at": iso(s.created_at)} for s, f, _o in rows[:20]],
    }


def users(db: Session, *, start: datetime | None = None, end: datetime | None = None,
          user_id: str | None = None) -> dict:
    stmt = select(ActivityRecord)
    if user_id:
        stmt = stmt.where(ActivityRecord.user_id == user_id)
    for c in _range(ActivityRecord.created_at, start, end):
        stmt = stmt.where(c)
    rows = db.execute(stmt.limit(20000)).scalars().all()
    all_users = db.execute(select(User)).scalars().all()
    by_user: dict[str, dict] = {}
    for a in rows:
        e = by_user.setdefault(a.user_id or "unknown", {"total": 0, "by_type": {}})
        e["total"] += 1
        e["by_type"][a.activity_type] = e["by_type"].get(a.activity_type, 0) + 1
    items = []
    for u in all_users:
        e = by_user.get(u.id, {"total": 0, "by_type": {}})
        items.append({"user_id": u.id, "email": u.email, "name": u.full_name, "role": u.role,
                      "total": e["total"], "by_type": e["by_type"]})
    items.sort(key=lambda x: -x["total"])
    return {"users": items, "total_events": len(rows)}


def security(db: Session, *, start: datetime | None = None, end: datetime | None = None) -> dict:
    ev_stmt = select(SecurityEvent)
    al_stmt = select(SecurityAlert)
    for c in _range(SecurityEvent.created_at, start, end):
        ev_stmt = ev_stmt.where(c)
    for c in _range(SecurityAlert.created_at, start, end):
        al_stmt = al_stmt.where(c)
    events = db.execute(ev_stmt.limit(20000)).scalars().all()
    alerts = db.execute(al_stmt.limit(20000)).scalars().all()
    by_cat: dict[str, int] = {}
    by_sev: dict[str, int] = {}
    by_day: dict[str, int] = {}
    for e in events:
        by_cat[e.category] = by_cat.get(e.category, 0) + 1
        by_sev[e.severity] = by_sev.get(e.severity, 0) + 1
        by_day[_day(e.created_at)] = by_day.get(_day(e.created_at), 0) + 1
    alert_by_rule: dict[str, int] = {}
    for a in alerts:
        k = a.rule or a.kind
        alert_by_rule[k] = alert_by_rule.get(k, 0) + 1
    return {"total_events": len(events), "total_alerts": len(alerts),
            "open_alerts": sum(1 for a in alerts if a.status == "open"),
            "by_category": by_cat, "by_severity": by_sev, "alerts_by_rule": alert_by_rule,
            "by_day": [{"date": k, "count": v} for k, v in sorted(by_day.items())]}
