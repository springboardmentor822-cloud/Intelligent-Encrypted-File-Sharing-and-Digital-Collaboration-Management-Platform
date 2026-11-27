"""Aggregations behind the File Analytics and Security dashboards. Results are cached briefly in Redis."""
import json
from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.mongo import get_mongo
from app.core.redis_client import get_redis
from app.models import FileShare, FileVersion, ShareLink, StoredFile, User
from app.services import audit_service as audit

CATEGORIES = ("documents", "images", "videos", "others")
CACHE_SECONDS = 30


# ---------------------------------------------------------------- date helpers
def parse_range(start: date | None, end: date | None) -> tuple[date, date]:
    end = end or datetime.now(timezone.utc).date()
    start = start or end - timedelta(days=29)
    if start > end:
        start, end = end, start
    if (end - start).days > 365:
        start = end - timedelta(days=365)
    return start, end


def _bounds(start: date, end: date) -> tuple[datetime, datetime]:
    return (datetime.combine(start, time.min, tzinfo=timezone.utc),
            datetime.combine(end + timedelta(days=1), time.min, tzinfo=timezone.utc))


def _days(start: date, end: date) -> list[date]:
    return [start + timedelta(days=i) for i in range((end - start).days + 1)]


def _prev_range(start: date, end: date) -> tuple[date, date]:
    span = (end - start).days + 1
    return start - timedelta(days=span), start - timedelta(days=1)


def pct_change(cur: float, prev: float) -> float:
    if prev == 0:
        return 100.0 if cur > 0 else 0.0
    return round((cur - prev) / prev * 100, 1)


def _iso(dt) -> str | None:
    return dt.isoformat() if dt else None


def _cached(key: str, builder):
    r = get_redis()
    try:
        hit = r.get(key)
        if hit:
            return json.loads(hit)
    except Exception:  # noqa: BLE001
        pass
    value = builder()
    try:
        r.setex(key, CACHE_SECONDS, json.dumps(value, default=str))
    except Exception:  # noqa: BLE001
        pass
    return value


# ---------------------------------------------------------------- file analytics
def _uploads(db: Session, owner_id, s: datetime, e: datetime):
    d = func.date(FileVersion.created_at)
    q = (select(d, StoredFile.category, func.count(), func.coalesce(func.sum(FileVersion.size_bytes), 0))
         .join(StoredFile, StoredFile.id == FileVersion.file_id)
         .where(FileVersion.created_at >= s, FileVersion.created_at < e).group_by(d, StoredFile.category))
    if owner_id:
        q = q.where(StoredFile.owner_id == owner_id)
    return db.execute(q).all()


def _link_shares(db: Session, owner_id, s: datetime, e: datetime):
    d = func.date(ShareLink.created_at)
    q = select(d, func.count()).where(ShareLink.created_at >= s, ShareLink.created_at < e).group_by(d)
    if owner_id:
        q = q.where(ShareLink.created_by == owner_id)
    return db.execute(q).all()


def _user_shares(db: Session, owner_id, s: datetime, e: datetime):
    d = func.date(FileShare.created_at)
    q = (select(d, FileShare.share_type, func.count()).where(FileShare.created_at >= s, FileShare.created_at < e)
         .group_by(d, FileShare.share_type))
    if owner_id:
        q = q.where(FileShare.shared_by == owner_id)
    return db.execute(q).all()


def _downloads(owner_id, s: datetime, e: datetime):
    match = {"ts": {"$gte": s, "$lt": e}}
    if owner_id:
        match["owner_id"] = str(owner_id)
    return list(get_mongo().download_events.aggregate([
        {"$match": match},
        {"$group": {"_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$ts"}},
                    "total": {"$sum": 1}, "users": {"$addToSet": "$actor"},
                    "shared": {"$sum": {"$cond": [{"$ne": ["$via", "owner"]}, 1, 0]}}}},
    ]))


def _totals(db: Session, owner_id, start: date, end: date) -> dict:
    s, e = _bounds(start, end)
    ups = _uploads(db, owner_id, s, e)
    shares = sum(r[1] for r in _link_shares(db, owner_id, s, e)) + sum(r[2] for r in _user_shares(db, owner_id, s, e))
    return {"uploads": sum(r[2] for r in ups), "uploaded_bytes": sum(int(r[3]) for r in ups),
            "downloads": sum(r["total"] for r in _downloads(owner_id, s, e)), "shares": shares}


def file_overview(db: Session, owner_id, start: date | None = None, end: date | None = None) -> dict:
    start, end = parse_range(start, end)
    key = f"analytics:files:{owner_id or 'all'}:{start}:{end}"
    return _cached(key, lambda: _build_file_overview(db, owner_id, start, end))


def _build_file_overview(db: Session, owner_id, start: date, end: date) -> dict:
    s, e = _bounds(start, end)
    days = _days(start, end)
    cur, prev = _totals(db, owner_id, start, end), _totals(db, owner_id, *_prev_range(start, end))

    # storage by category (all stored versions, including trash)
    q = (select(StoredFile.category, func.coalesce(func.sum(FileVersion.encrypted_size), 0))
         .join(FileVersion, FileVersion.file_id == StoredFile.id).group_by(StoredFile.category))
    if owner_id:
        q = q.where(StoredFile.owner_id == owner_id)
    by_cat = {c: 0 for c in CATEGORIES}
    by_cat.update({c: int(b) for c, b in db.execute(q).all()})
    used = sum(by_cat.values())
    quota = db.get(User, owner_id).storage_quota_bytes if owner_id else None

    # uploads per day per category
    up = {d: {c: 0 for c in CATEGORIES} for d in days}
    for d, cat, n, _ in _uploads(db, owner_id, s, e):
        if d in up and cat in up[d]:
            up[d][cat] += n
    # downloads per day
    dl = {d: {"total": 0, "unique_users": 0, "shared": 0} for d in days}
    for row in _downloads(owner_id, s, e):
        d = date.fromisoformat(row["_id"])
        if d in dl:
            dl[d] = {"total": row["total"], "unique_users": len(row["users"]), "shared": row["shared"]}
    # shares per day per type
    sh = {d: {"direct": 0, "link": 0, "internal": 0} for d in days}
    for d, n in _link_shares(db, owner_id, s, e):
        if d in sh:
            sh[d]["link"] += n
    for d, t, n in _user_shares(db, owner_id, s, e):
        if d in sh and t in sh[d]:
            sh[d][t] += n

    # recent activity
    rq = (select(StoredFile.name, FileVersion.size_bytes, FileVersion.created_at, StoredFile.category)
          .join(StoredFile, StoredFile.id == FileVersion.file_id).order_by(FileVersion.created_at.desc()).limit(5))
    if owner_id:
        rq = rq.where(StoredFile.owner_id == owner_id)
    recent_uploads = [{"name": n, "size_bytes": sz, "type": n.rsplit(".", 1)[-1].upper() if "." in n else "FILE",
                       "created_at": _iso(ts)} for n, sz, ts, _ in db.execute(rq).all()]
    dm = {"owner_id": str(owner_id)} if owner_id else {}
    recent_downloads = [{"name": x["file_name"], "downloaded_by": x.get("actor_name", "Unknown"),
                         "size_bytes": x.get("size_bytes", 0), "created_at": _iso(x["ts"])}
                        for x in get_mongo().download_events.find(dm).sort("ts", -1).limit(5)]

    return {
        "range": {"start": start.isoformat(), "end": end.isoformat()},
        "cards": {
            "storage": {"used": used, "quota": quota, "change_pct": pct_change(cur["uploaded_bytes"], prev["uploaded_bytes"])},
            "uploads": {"value": cur["uploads"], "change_pct": pct_change(cur["uploads"], prev["uploads"])},
            "downloads": {"value": cur["downloads"], "change_pct": pct_change(cur["downloads"], prev["downloads"])},
            "shares": {"value": cur["shares"], "change_pct": pct_change(cur["shares"], prev["shares"])},
        },
        "storage_by_category": [{"category": c, "bytes": by_cat[c]} for c in CATEGORIES],
        "uploads_series": [{"date": d.isoformat(), **up[d]} for d in days],
        "downloads_series": [{"date": d.isoformat(), **dl[d]} for d in days],
        "shares_series": [{"date": d.isoformat(), **sh[d]} for d in days],
        "recent_uploads": recent_uploads,
        "recent_downloads": recent_downloads,
    }


# ---------------------------------------------------------------- security analytics (admin)
def security_summary(start: date | None = None, end: date | None = None) -> dict:
    start, end = parse_range(start, end)
    return _cached(f"analytics:security:{start}:{end}", lambda: _build_security_summary(start, end))


def _day_series(db_rows, days, keys):
    series = {d: {k: 0 for k in keys} for d in days}
    for r in db_rows:
        d = date.fromisoformat(r["_id"]["d"])
        k = r["_id"]["k"]
        if d in series and k in series[d]:
            series[d][k] += r["n"]
    return [{"date": d.isoformat(), **series[d]} for d in days]


def _build_security_summary(start: date, end: date) -> dict:
    mdb = get_mongo()
    s, e = _bounds(start, end)
    days = _days(start, end)
    rng = {"ts": {"$gte": s, "$lt": e}}
    fmt = {"$dateToString": {"format": "%Y-%m-%d", "date": "$ts"}}

    login_rows = list(mdb.login_events.aggregate([
        {"$match": rng}, {"$group": {"_id": {"d": fmt, "k": "$status"}, "n": {"$sum": 1}}}]))
    access_rows = list(mdb.access_attempts.aggregate([
        {"$match": rng}, {"$group": {"_id": {"d": fmt, "k": "$kind"}, "n": {"$sum": 1}}}]))
    login_series = _day_series(login_rows, days, ["success", "failed"])
    access_series = _day_series(access_rows, days, ["unauthorized", "blocked"])

    success = sum(p["success"] for p in login_series)
    failed = sum(p["failed"] for p in login_series)
    total = success + failed
    unauthorized = sum(p["unauthorized"] for p in access_series)
    blocked = sum(p["blocked"] for p in access_series)
    events_total = mdb.security_events.count_documents(rng)

    breakdown_raw = {r["_id"]: r["n"] for r in mdb.security_events.aggregate(
        [{"$match": rng}, {"$group": {"_id": "$category", "n": {"$sum": 1}}}])}
    breakdown = [{"type": c, "count": breakdown_raw.get(c, 0),
                  "percent": round(breakdown_raw.get(c, 0) / events_total * 100) if events_total else 0}
                 for c in audit.EVENT_CATEGORIES]

    recent_logins = [{"user": x.get("name") or "Unknown User", "email": x.get("email") or "-", "ip": x.get("ip"),
                      "status": x["status"], "reason": x.get("reason"), "location": x.get("location"), "ts": _iso(x["ts"])}
                     for x in mdb.login_events.find().sort("ts", -1).limit(8)]
    recent_events = [{"id": str(x["_id"]), "title": x["title"], "category": x["category"], "severity": x["severity"],
                      "ip": x.get("ip"), "details": x.get("details", ""), "ts": _iso(x["ts"])}
                     for x in mdb.security_events.find().sort("ts", -1).limit(8)]
    return {
        "range": {"start": start.isoformat(), "end": end.isoformat()},
        "metrics": {
            "total_logins": total, "successful_logins": success, "failed_logins": failed,
            "success_rate": round(success / total * 100, 1) if total else 0.0,
            "failure_rate": round(failed / total * 100, 1) if total else 0.0,
            "unauthorized_attempts": unauthorized, "blocked_attempts": blocked, "security_events": events_total,
        },
        "login_series": login_series, "access_series": access_series,
        "event_breakdown": breakdown, "recent_logins": recent_logins, "recent_events": recent_events,
    }
