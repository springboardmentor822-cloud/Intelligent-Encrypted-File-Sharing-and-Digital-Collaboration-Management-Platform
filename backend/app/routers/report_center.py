"""File activity and security REPORTS for administrators (Milestone 3, Task 4). Admin only.

  GET /reports/uploads     total uploads, per user, file types, status, date/time
  GET /reports/downloads   total downloads, per user, most downloaded files, failed attempts
  GET /reports/sharing     files shared, per user, recipients, active / expired / revoked links
  GET /reports/security    failed logins, unauthorized attempts, suspicious downloads, expired-link attempts, alerts
Every report accepts the filters  user, activity_type, file, date_from, date_to  (or days)  and  format=csv  for a download.
"""
import csv
import io
from collections import Counter
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import require_roles
from app.db.mongo import mongo_db
from app.db.postgres import get_db
from app.models.postgres import FilePermission, SharedLink, StoredFile, User
from app.routers.share import link_status
from app.services.audit import BLOCKED_ACTIONS, UNAUTHORIZED_ACTIONS
from app.services.audit_view import build_filter, parse_day, to_rows

router = APIRouter(prefix="/reports", tags=["Reports (admin)"])


def _iso(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    return (dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt).isoformat()


def _days_between(date_from: str | None, date_to: str | None, days: int) -> list[str]:
    end = (parse_day(date_to) if date_to else datetime.now(timezone.utc)).replace(hour=0, minute=0, second=0, microsecond=0)
    start = parse_day(date_from) if date_from else end - timedelta(days=days - 1)
    n = min(max((end - start).days + 1, 1), 366)
    return [(start + timedelta(days=i)).strftime("%Y-%m-%d") for i in range(n)]


def _csv(rows: list[dict], cols: list[str], name: str) -> StreamingResponse:
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=cols, extrasaction="ignore")
    w.writeheader()
    for r in rows:   # a value starting with = + - @ could run as a formula in Excel, so it gets a leading quote
        w.writerow({k: ("'" + str(v) if isinstance(v, str) and v[:1] in "=+-@" else v) for k, v in r.items()})
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv", headers={"Content-Disposition": f'attachment; filename="{name}.csv"'})


def _ext(name: str | None) -> str:
    return name.rsplit(".", 1)[-1].upper() if name and "." in name else "-"


async def _per_day(flt: dict, labels: list[str], fields: dict[str, dict]) -> list[dict]:
    """fields = {"success": {extra match}, "failed": {...}} -> [{"day": ..., "success": n, "failed": n}]"""
    out = {d: {"day": d, **{k: 0 for k in fields}} for d in labels}
    for key, extra in fields.items():
        match = {"$and": [flt, extra]} if flt else extra
        async for r in mongo_db.audit_logs.aggregate([{"$match": match}, {"$group": {"_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$timestamp"}}, "n": {"$sum": 1}}}]):
            if r["_id"] in out:
                out[r["_id"]][key] = r["n"]
    return list(out.values())


# ----------------------------------------------------------------------------------------------------------------- uploads
@router.get("/uploads")
async def uploads_report(user: str | None = None, file: str | None = None, status: str | None = None, date_from: str | None = None, date_to: str | None = None,
                         days: int = Query(30, ge=1, le=366), format: str = "json", _: User = Depends(require_roles("admin")), db: AsyncSession = Depends(get_db)):
    flt = build_filter(user=user, activity_type="upload", file=file, status=status, date_from=date_from, date_to=date_to, days=None if date_from else days)
    docs = [d async for d in mongo_db.audit_logs.find(flt).sort("timestamp", -1).limit(1000)]
    rows = [{"time": r["timestamp"], "user": r["user_email"] or r["username"], "file": r["file_name"], "type": _ext(r["file_name"]),
             "size_bytes": (d.get("details") or {}).get("size"), "status": r["status"], "ip": r["ip"], "note": (d.get("details") or {}).get("reason")}
            for d, r in zip(docs, await to_rows(db, docs))]
    if format == "csv":
        return _csv(rows, ["time", "user", "file", "type", "size_bytes", "status", "ip", "note"], "upload_report")
    ok = [r for r in rows if r["status"] == "success"]
    by_user = Counter(r["user"] for r in ok)
    by_type = Counter(r["type"] for r in ok)
    labels = _days_between(date_from, date_to, days)
    series = await _per_day(flt, labels, {"success": {"result": "success"}, "failed": {"result": "failure"}})
    return {"total": len(ok), "failed": len(rows) - len(ok), "total_bytes": sum(r["size_bytes"] or 0 for r in ok), "by_user": [{"user": u, "count": n} for u, n in by_user.most_common(10)],
            "by_type": [{"type": t, "count": n} for t, n in by_type.most_common()], "series": series, "rows": rows[:200]}


# --------------------------------------------------------------------------------------------------------------- downloads
@router.get("/downloads")
async def downloads_report(user: str | None = None, file: str | None = None, date_from: str | None = None, date_to: str | None = None,
                           days: int = Query(30, ge=1, le=366), format: str = "json", _: User = Depends(require_roles("admin")), db: AsyncSession = Depends(get_db)):
    base = build_filter(user=user, file=file, date_from=date_from, date_to=date_to, days=None if date_from else days)
    kinds = {"action": {"$in": ["download", "share_download"]}}
    flt = {"$and": [base, kinds]} if base else kinds
    docs = [d async for d in mongo_db.audit_logs.find(flt).sort("timestamp", -1).limit(1000)]
    rows = [{"time": r["timestamp"], "user": r["user_email"] or "link visitor", "file": r["file_name"], "via": "share link" if r["activity_type"] == "share_download" else "account",
             "status": r["status"], "ip": r["ip"], "reason": (d.get("details") or {}).get("reason")} for d, r in zip(docs, await to_rows(db, docs))]
    if format == "csv":
        return _csv(rows, ["time", "user", "file", "via", "status", "ip", "reason"], "download_report")
    ok = [r for r in rows if r["status"] == "success"]
    labels = _days_between(date_from, date_to, days)
    series = await _per_day(flt, labels, {"success": {"result": "success"}, "failed": {"result": "failure"}})
    return {"total": len(ok), "failed": len(rows) - len(ok), "unique_users": len({r["user"] for r in ok}),
            "by_user": [{"user": u, "count": n} for u, n in Counter(r["user"] for r in ok).most_common(10)],
            "top_files": [{"file": f, "count": n} for f, n in Counter(r["file"] for r in ok if r["file"]).most_common(10)],
            "series": series, "failed_rows": [r for r in rows if r["status"] == "failure"][:50], "rows": rows[:200]}


# ----------------------------------------------------------------------------------------------------------------- sharing
@router.get("/sharing")
async def sharing_report(user: str | None = None, file: str | None = None, date_from: str | None = None, date_to: str | None = None,
                         days: int = Query(90, ge=1, le=366), format: str = "json", _: User = Depends(require_roles("admin")), db: AsyncSession = Depends(get_db)):
    start, end = parse_day(date_from), parse_day(date_to, end=True)
    if not start:
        start = datetime.now(timezone.utc) - timedelta(days=days)

    def window(col):
        c = [col >= start] + ([col < end] if end else [])
        return c
    like = (lambda s: f"%{s}%")
    perm_q = (select(FilePermission, StoredFile.original_name, StoredFile.owner_id).join(StoredFile, StoredFile.id == FilePermission.file_id)
              .where(StoredFile.deleted_at.is_(None), *window(FilePermission.created_at)))
    link_q = (select(SharedLink, StoredFile.original_name, StoredFile.owner_id, StoredFile.deleted_at).join(StoredFile, StoredFile.id == SharedLink.file_id)
              .where(*window(SharedLink.created_at)))
    if file:
        perm_q, link_q = perm_q.where(StoredFile.original_name.ilike(like(file))), link_q.where(StoredFile.original_name.ilike(like(file)))
    people = {u.id: u for u in (await db.execute(select(User))).scalars().all()}
    if user:   # filter by the person who SHARED (the file owner / link creator)
        wanted = {uid for uid, u in people.items() if user == uid or user.lower() in u.email.lower()}
        perm_q, link_q = perm_q.where(StoredFile.owner_id.in_(wanted)), link_q.where(StoredFile.owner_id.in_(wanted))
    perms = (await db.execute(perm_q.limit(1000))).all()
    links = (await db.execute(link_q.limit(1000))).all()

    recipients = [{"file": name, "shared_by": people[owner].email if owner in people else "?", "recipient": people[p.user_id].email if p.user_id in people else "?",
                   "access": p.level, "when": _iso(p.created_at)} for p, name, owner in perms]
    link_rows, counts = [], Counter()
    for l, name, owner, deleted in links:
        st = link_status(l)
        if deleted is not None and st == "active":
            st = "unavailable"
        counts[st] += 1
        link_rows.append({"file": name, "shared_by": people[l.created_by].email if l.created_by in people else "?", "status": st, "created": _iso(l.created_at),
                          "expires": _iso(l.expires_at), "downloads": l.download_count, "max_downloads": l.max_downloads, "view_only": not l.allow_download})
    if format == "csv":
        return _csv([{"kind": "person", **r} for r in recipients] + [{"kind": "link", **r} for r in link_rows],
                    ["kind", "file", "shared_by", "recipient", "access", "when", "status", "created", "expires", "downloads", "max_downloads", "view_only"], "sharing_report")
    shared_files = {name for _, name, _ in perms} | {name for _, name, _, _ in links}
    by_user = Counter(r["shared_by"] for r in recipients) + Counter(r["shared_by"] for r in link_rows)
    return {"files_shared": len(shared_files), "people_shares": len(recipients), "links_total": len(link_rows),
            "links": {"active": counts["active"], "expired": counts["expired"], "revoked": counts["revoked"], "exhausted": counts["exhausted"], "unavailable": counts["unavailable"]},
            "by_user": [{"user": u, "count": n} for u, n in by_user.most_common(10)], "recipients": recipients[:200], "link_rows": link_rows[:200]}


# ----------------------------------------------------------------------------------------------------------------- security
SECURITY_ACTIONS = ["login", "download", "view", "share_access", "admin_access", "blocked_request", "upload", "permission_grant", "delete"]


@router.get("/security")
async def security_report(user: str | None = None, activity_type: str | None = None, file: str | None = None, date_from: str | None = None, date_to: str | None = None,
                          days: int = Query(30, ge=1, le=366), format: str = "json", _: User = Depends(require_roles("admin")), db: AsyncSession = Depends(get_db)):
    base = build_filter(user=user, activity_type=activity_type, file=file, date_from=date_from, date_to=date_to, days=None if date_from else days)
    fails = {"result": "failure"}
    flt = {"$and": [base, fails]} if base else fails
    docs = [d async for d in mongo_db.audit_logs.find(flt).sort("timestamp", -1).limit(1000)]
    rows = [{"time": r["timestamp"], "event": r["activity_type"], "user": r["user_email"] or "-", "ip": r["ip"], "description": r["description"]} for r in await to_rows(db, docs)]
    if format == "csv":
        return _csv(rows, ["time", "event", "user", "ip", "description"], "security_report")

    def count(extra: dict) -> dict:
        return {"$and": [base, extra]} if base else extra
    audit = mongo_db.audit_logs
    alert_flt = {"created_at": {"$gte": parse_day(date_from) or datetime.now(timezone.utc).replace(microsecond=0) - timedelta(days=days)}}
    if date_to:
        alert_flt["created_at"]["$lt"] = parse_day(date_to, end=True)
    alerts_by_type = [{"type": r["_id"], "count": r["n"]} async for r in mongo_db.security_alerts.aggregate([{"$match": alert_flt}, {"$group": {"_id": "$type", "n": {"$sum": 1}}}, {"$sort": {"n": -1}}])]
    by_sev = {"low": 0, "medium": 0, "high": 0}
    async for r in mongo_db.security_alerts.aggregate([{"$match": alert_flt}, {"$group": {"_id": "$severity", "n": {"$sum": 1}}}]):
        by_sev[{"info": "low", "warning": "medium", "critical": "high"}.get(r["_id"], "medium")] += r["n"]
    labels = _days_between(date_from, date_to, days)
    series = await _per_day(base, labels, {"failed_logins": {"action": "login", "result": "failure"}, "unauthorized": {"result": "failure", "action": {"$in": UNAUTHORIZED_ACTIONS}},
                                           "blocked": {"action": {"$in": BLOCKED_ACTIONS}}})
    link = {"action": "share_access", "result": "failure"}
    return {"failed_logins": await audit.count_documents(count({"action": "login", "result": "failure"})),
            "unauthorized_attempts": await audit.count_documents(count({"result": "failure", "action": {"$in": UNAUTHORIZED_ACTIONS}})),
            "suspicious_downloads": sum(r["count"] for r in alerts_by_type if r["type"] in ("download_burst", "repeated_failed_download")),
            "expired_link_attempts": await audit.count_documents(count({**link, "details.reason": "expired"})),
            "revoked_link_attempts": await audit.count_documents(count({**link, "details.reason": "revoked"})),
            "alerts_total": sum(r["count"] for r in alerts_by_type), "alerts_by_type": alerts_by_type, "alerts_by_severity": by_sev,
            "series": series, "rows": rows[:200]}
