"""Task 4: file-activity and security reports (administrators only).

Reads from PostgreSQL (files, shares) and MongoDB (downloads, logins, security events).
Every report supports filters: date range, user, file type and file.
"""
import re
import uuid
from collections import Counter
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_admin
from app.core.mongo import get_mongo
from app.models import FileShare, FileVersion, ShareLink, StoredFile, User
from app.services import analytics_service
from app.services.audit_helpers import category_of, derive_status, describe

router = APIRouter(prefix="/reports", tags=["reports"], dependencies=[Depends(get_admin)])
CATEGORIES = analytics_service.CATEGORIES


def _rng(start: date | None, end: date | None):
    s, e = analytics_service.parse_range(start, end)
    lo, hi = analytics_service._bounds(s, e)
    return s, e, lo, hi


def _iso(dt):
    return dt.isoformat() if dt else None


def _fill(days, rows: dict, keys):
    return [{"date": d.isoformat(), **{k: rows.get(d, {}).get(k, 0) for k in keys}} for d in days]


# ---------------------------------------------------------------- uploads
@router.get("/uploads")
def uploads_report(start: date | None = None, end: date | None = None, user_id: uuid.UUID | None = None,
                   file_type: str | None = None, db: Session = Depends(get_db)):
    s, e, lo, hi = _rng(start, end)
    base = [FileVersion.created_at >= lo, FileVersion.created_at < hi]
    if user_id:
        base.append(StoredFile.owner_id == user_id)
    if file_type in CATEGORIES:
        base.append(StoredFile.category == file_type)
    join = lambda q: q.select_from(FileVersion).join(StoredFile, StoredFile.id == FileVersion.file_id)  # noqa: E731

    total, total_bytes = db.execute(join(select(func.count(), func.coalesce(func.sum(FileVersion.size_bytes), 0))).where(*base)).one()
    by_user = db.execute(
        join(select(User.full_name, User.email, func.count(), func.coalesce(func.sum(FileVersion.size_bytes), 0)))
        .join(User, User.id == StoredFile.owner_id).where(*base).group_by(User.id, User.full_name, User.email)
        .order_by(func.count().desc()).limit(50)).all()
    by_type = db.execute(join(select(StoredFile.category, func.count())).where(*base).group_by(StoredFile.category)).all()
    d = func.date(FileVersion.created_at)
    series_rows = db.execute(join(select(d, StoredFile.category, func.count())).where(*base).group_by(d, StoredFile.category)).all()
    rows = db.execute(
        join(select(StoredFile.id, StoredFile.name, StoredFile.category, FileVersion.version, FileVersion.size_bytes,
                    FileVersion.created_at, User.full_name, User.email))
        .join(User, User.id == StoredFile.owner_id).where(*base).order_by(FileVersion.created_at.desc()).limit(300)).all()

    days = analytics_service._days(s, e)
    grid = {x: {c: 0 for c in CATEGORIES} for x in days}
    for day, cat, n in series_rows:
        if day in grid and cat in grid[day]:
            grid[day][cat] += n

    fail_q = {"action": "file.upload_rejected", "ts": {"$gte": lo, "$lt": hi}}
    if user_id:
        fail_q["actor_id"] = str(user_id)
    failed_coll = get_mongo().audit_logs
    return {
        "range": {"start": s.isoformat(), "end": e.isoformat()},
        "totals": {"total_files": total, "total_bytes": int(total_bytes), "failed_uploads": failed_coll.count_documents(fail_q)},
        "by_user": [{"user": n, "email": em, "files": c, "bytes": int(b)} for n, em, c, b in by_user],
        "by_type": [{"type": t, "files": c} for t, c in by_type],
        "series": [{"date": x.isoformat(), **grid[x]} for x in days],
        "rows": [{"file_id": i, "name": n, "type": c, "version": v, "size_bytes": sz, "uploaded_at": ts,
                  "user": u, "email": em, "status": "success"} for i, n, c, v, sz, ts, u, em in rows],
        "failed": [{"ts": x["ts"], "user": x.get("actor_email"), "name": (x.get("details") or {}).get("name"),
                    "reason": (x.get("details") or {}).get("reason"), "status": "failed"}
                   for x in failed_coll.find(fail_q).sort("ts", -1).limit(30)],
    }


# ---------------------------------------------------------------- downloads
@router.get("/downloads")
def downloads_report(start: date | None = None, end: date | None = None, user_id: uuid.UUID | None = None,
                     file_id: uuid.UUID | None = None):
    s, e, lo, hi = _rng(start, end)
    mdb = get_mongo()
    match: dict = {"ts": {"$gte": lo, "$lt": hi}}
    if user_id:
        match["actor"] = str(user_id)
    if file_id:
        match["file_id"] = str(file_id)

    total = mdb.download_events.count_documents(match)
    by_user = [{"user": r["_id"] or "Unknown", "downloads": r["n"]} for r in mdb.download_events.aggregate([
        {"$match": match}, {"$group": {"_id": "$actor_name", "n": {"$sum": 1}}}, {"$sort": {"n": -1}}, {"$limit": 25}])]
    top_files = [{"file_id": r["_id"], "name": r["name"], "downloads": r["n"]} for r in mdb.download_events.aggregate([
        {"$match": match}, {"$group": {"_id": "$file_id", "name": {"$first": "$file_name"}, "n": {"$sum": 1}}},
        {"$sort": {"n": -1}}, {"$limit": 10}])]
    series_rows = {r["_id"]: r["n"] for r in mdb.download_events.aggregate([
        {"$match": match}, {"$group": {"_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$ts"}}, "n": {"$sum": 1}}}])}
    days = analytics_service._days(s, e)

    failed_match: dict = {"ts": {"$gte": lo, "$lt": hi}, "$or": [
        {"reason": {"$regex": "^download access denied"}}, {"reason": {"$regex": "^share link"}}, {"reason": "invalid share token"}]}
    if user_id:
        failed_match["user_id"] = str(user_id)
    return {
        "range": {"start": s.isoformat(), "end": e.isoformat()},
        "totals": {"total_downloads": total, "failed_attempts": mdb.access_attempts.count_documents(failed_match),
                   "distinct_files": len(mdb.download_events.distinct("file_id", match))},
        "by_user": by_user, "top_files": top_files,
        "series": [{"date": d.isoformat(), "total": series_rows.get(d.isoformat(), 0)} for d in days],
        "rows": [{"file_name": x["file_name"], "downloaded_by": x.get("actor_name"), "via": x.get("via"), "ip": x.get("ip"),
                  "size_bytes": x.get("size_bytes"), "ts": x["ts"], "status": "success"}
                 for x in mdb.download_events.find(match).sort("ts", -1).limit(300)],
        "failed": [{"ts": x["ts"], "reason": x.get("reason"), "user": x.get("user_email"), "ip": x.get("ip"), "status": "failed"}
                   for x in mdb.access_attempts.find(failed_match).sort("ts", -1).limit(30)],
    }


# ---------------------------------------------------------------- sharing
@router.get("/sharing")
def sharing_report(start: date | None = None, end: date | None = None, user_id: uuid.UUID | None = None,
                   file_id: uuid.UUID | None = None, db: Session = Depends(get_db)):
    s, e, lo, hi = _rng(start, end)
    lc = [ShareLink.created_at >= lo, ShareLink.created_at < hi]
    sc = [FileShare.created_at >= lo, FileShare.created_at < hi]
    if user_id:
        lc.append(ShareLink.created_by == user_id)
        sc.append(FileShare.shared_by == user_id)
    if file_id:
        lc.append(ShareLink.file_id == file_id)
        sc.append(FileShare.file_id == file_id)
    links = db.scalars(select(ShareLink).where(*lc).order_by(ShareLink.created_at.desc()).limit(2000)).all()
    shares = db.scalars(select(FileShare).where(*sc).order_by(FileShare.created_at.desc()).limit(2000)).all()

    status = Counter(l.status for l in links)
    by_user = Counter()
    for l in links:
        by_user[l.creator.full_name if l.creator else "Unknown"] += 1
    for x in shares:
        by_user[x.sharer.full_name] += 1
    return {
        "range": {"start": s.isoformat(), "end": e.isoformat()},
        "totals": {"files_shared": len({l.file_id for l in links} | {x.file_id for x in shares}),
                   "links_created": len(links), "user_shares": len(shares),
                   "active_links": status["active"], "expired_links": status["expired"],
                   "revoked_links": status["revoked"], "exhausted_links": status["exhausted"]},
        "by_user": [{"user": u, "shares": n} for u, n in by_user.most_common(25)],
        "recipients": [{"file": x.file.name, "shared_by": x.sharer.full_name, "recipient": x.recipient.full_name,
                        "email": x.recipient.email, "permission": x.permission, "type": x.share_type, "status": x.status,
                        "created_at": x.created_at, "expires_at": x.expires_at} for x in shares[:300]],
        "links": [{"file": l.file.name if l.file else "(deleted)", "created_by": l.creator.full_name if l.creator else "",
                   "permission": l.permission, "status": l.status, "opens": l.access_count, "downloads": l.download_count,
                   "created_at": l.created_at, "expires_at": l.expires_at} for l in links[:300]],
    }


# ---------------------------------------------------------------- one user's activity
@router.get("/users/{uid}/activity")
def user_activity(uid: uuid.UUID, start: date | None = None, end: date | None = None, activity_type: str | None = None,
                  db: Session = Depends(get_db)):
    user = db.get(User, uid)
    if not user:
        raise HTTPException(404, "User not found")
    s, e, lo, hi = _rng(start, end)
    mdb = get_mongo()
    flt: dict = {"actor_id": str(uid), "ts": {"$gte": lo, "$lt": hi}}
    if activity_type:
        flt["action"] = {"$regex": "^" + re.escape(activity_type[:60])}
    docs = list(mdb.audit_logs.find(flt).sort("ts", -1).limit(300))

    def count(prefix: str) -> int:
        return mdb.audit_logs.count_documents({"actor_id": str(uid), "ts": {"$gte": lo, "$lt": hi},
                                               "action": {"$regex": "^" + re.escape(prefix)}})
    logins = mdb.login_events.count_documents({"$or": [{"user_id": str(uid)}, {"email": user.email}], "status": "success", "ts": {"$gte": lo, "$lt": hi}})
    failed = mdb.login_events.count_documents({"$or": [{"user_id": str(uid)}, {"email": user.email}], "status": "failed", "ts": {"$gte": lo, "$lt": hi}})
    return {
        "user": {"id": user.id, "name": user.full_name, "email": user.email, "role": user.role},
        "range": {"start": s.isoformat(), "end": e.isoformat()},
        "summary": {"logins": logins, "failed_logins": failed, "uploads": count("file.upload"),
                    "downloads": count("file.download"), "shares": count("share.")},
        "timeline": [{"ts": d["ts"], "activity_type": d["action"], "category": d.get("category") or category_of(d["action"]),
                      "description": d.get("description") or describe(d["action"], d.get("details")),
                      "status": d.get("status") or derive_status(d["action"]), "ip": d.get("ip")} for d in docs],
    }


# ---------------------------------------------------------------- security
@router.get("/security")
def security_report(start: date | None = None, end: date | None = None, user_id: uuid.UUID | None = None,
                    severity: str | None = None):
    s, e, lo, hi = _rng(start, end)
    mdb = get_mongo()
    rng = {"ts": {"$gte": lo, "$lt": hi}}
    uf = {"user_id": str(user_id)} if user_id else {}
    ev_match = {**rng, **uf, **({"severity": severity} if severity else {})}

    def grouped(field: str) -> list[dict]:
        key = {"$ifNull": ["$status", "open"]} if field == "status" else f"${field}"
        return [{"name": r["_id"], "count": r["n"]} for r in mdb.security_events.aggregate(
            [{"$match": ev_match}, {"$group": {"_id": key, "n": {"$sum": 1}}}, {"$sort": {"n": -1}}])]

    def title_count(rx: str) -> int:
        return mdb.security_events.count_documents({**ev_match, "title": {"$regex": rx, "$options": "i"}})

    return {
        "range": {"start": s.isoformat(), "end": e.isoformat()},
        "totals": {
            "failed_logins": mdb.login_events.count_documents({**rng, **uf, "status": "failed"}),
            "unauthorized_attempts": mdb.access_attempts.count_documents({**rng, **uf, "kind": "unauthorized"}),
            "suspicious_downloads": title_count("download"),
            "expired_link_attempts": mdb.access_attempts.count_documents({**rng, "reason": "share link expired"}),
            "revoked_link_attempts": mdb.access_attempts.count_documents({**rng, "reason": "share link revoked"}),
            "alerts_generated": mdb.security_events.count_documents(ev_match),
        },
        "by_category": grouped("category"), "by_severity": grouped("severity"), "by_status": grouped("status"),
        "rows": [{"alert_id": x.get("alert_id") or str(x["_id"]), "ts": x["ts"], "title": x.get("title"), "category": x.get("category"),
                  "severity": x.get("severity"), "status": x.get("status") or "open", "ip": x.get("ip"),
                  "user": x.get("user_email"), "details": x.get("details", "")}
                 for x in mdb.security_events.find(ev_match).sort("ts", -1).limit(150)],
    }
