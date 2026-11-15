"""Storage analytics for administrators (Milestone 3, Task 5). All numbers come from the real database records:
file sizes and owners from PostgreSQL, downloads and sharing events from the MongoDB audit log.

  GET /analytics/users/storage   storage used by each user
  GET /analytics/files           file statistics (uploaded, downloaded, shared, storage, uploads by date, by type)
  GET /analytics/downloads       download statistics
  GET /analytics/sharing         sharing statistics
  GET /analytics/overview        everything above in one call (used by the Storage Analytics page)
Filters: date_from, date_to (or days), user (e-mail or id), file_type (pdf / image / video / document / spreadsheet / presentation / text),
activity_type (upload | download | share) which keeps only that kind of activity in the charts.
"""
from collections import Counter
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.deps import require_roles
from app.core.validation import ALLOWED, category_for_mime
from app.db.mongo import mongo_db
from app.db.postgres import get_db
from app.models.postgres import FilePermission, SharedLink, StoredFile, User
from app.routers.files import CATEGORY_MIMES
from app.routers.share import link_status
from app.services.audit_view import parse_day
from app.services.storage_watch import forecast, platform_used

router = APIRouter(prefix="/analytics", tags=["Storage analytics (admin)"])


def _range(date_from, date_to, days):
    end = parse_day(date_to, end=True) or datetime.now(timezone.utc) + timedelta(seconds=1)
    start = parse_day(date_from) or (end - timedelta(days=days))
    return start, end


def _labels(start: datetime, end: datetime) -> list[str]:
    n = min(max((end - start).days, 1), 366)
    return [(start + timedelta(days=i)).strftime("%Y-%m-%d") for i in range(n)]


async def _user_ids(db: AsyncSession, user: str | None) -> set[str] | None:
    if not user:
        return None
    rows = (await db.execute(select(User.id).where((User.id == user) | User.email.ilike(f"%{user}%")))).all()
    return {r[0] for r in rows} or {"-none-"}


def _name_regex(file_type: str | None) -> dict | None:
    """Audit records only know the file NAME, so a file type becomes 'name ends with .pdf / .png ...'."""
    if not file_type:
        return None
    exts = [e for e, mime in ALLOWED.items() if category_for_mime(mime) == file_type]
    return {"details.name": {"$regex": r"\.(" + "|".join(exts) + r")$", "$options": "i"}} if exts else {"details.name": "-none-"}


async def collect(db: AsyncSession, date_from, date_to, days, user, file_type, activity_type) -> dict:
    start, end = _range(date_from, date_to, days)
    labels = _labels(start, end)
    owners = await _user_ids(db, user)
    want = lambda kind: activity_type in (None, "", kind)   # noqa: E731  (only compute the kinds the filter asks for)

    # ---------- PostgreSQL: the real files
    fq = select(StoredFile, User.email, User.full_name).join(User, User.id == StoredFile.owner_id).where(StoredFile.deleted_at.is_(None))
    if owners is not None:
        fq = fq.where(StoredFile.owner_id.in_(owners))
    if file_type in CATEGORY_MIMES:
        fq = fq.where(CATEGORY_MIMES[file_type](file_type))
    all_files = (await db.execute(fq)).all()
    in_range = [(f, e, n) for f, e, n in all_files if start <= (f.created_at if f.created_at.tzinfo else f.created_at.replace(tzinfo=timezone.utc)) < end]
    total_bytes = sum(f.size_bytes for f, _, _ in all_files)

    per_user: dict[str, dict] = {}
    for f, email, name in all_files:
        row = per_user.setdefault(f.owner_id, {"user_id": f.owner_id, "name": name, "email": email, "files": 0, "bytes": 0})
        row["files"] += 1
        row["bytes"] += f.size_bytes
    users_storage = sorted(per_user.values(), key=lambda r: -r["bytes"])
    for r in users_storage:
        r["percent"] = round(r["bytes"] / total_bytes * 100, 1) if total_bytes else 0

    up_by_day = Counter((f.created_at if f.created_at.tzinfo else f.created_at.replace(tzinfo=timezone.utc)).strftime("%Y-%m-%d") for f, _, _ in in_range)
    by_type = Counter(category_for_mime(f.mime_type) for f, _, _ in all_files)
    type_bytes = Counter()
    for f, _, _ in all_files:
        type_bytes[category_for_mime(f.mime_type)] += f.size_bytes
    largest = [{"name": f.original_name, "size_bytes": f.size_bytes, "owner": email, "category": category_for_mime(f.mime_type)}
               for f, email, _ in sorted(all_files, key=lambda r: -r[0].size_bytes)[:8]]

    # ---------- MongoDB: downloads and sharing events
    audit_base: dict = {"timestamp": {"$gte": start, "$lt": end}, "result": "success"}
    if owners is not None:
        audit_base["$or"] = [{"owner_id": {"$in": list(owners)}}, {"user_id": {"$in": list(owners)}}]
    nm = _name_regex(file_type)
    if nm:
        audit_base.update(nm)

    async def per_day(extra: dict) -> dict[str, int]:
        out: dict[str, int] = {}
        async for r in mongo_db.audit_logs.aggregate([{"$match": {**audit_base, **extra}}, {"$group": {"_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$timestamp"}}, "n": {"$sum": 1}}}]):
            out[r["_id"]] = r["n"]
        return out

    dl_day = await per_day({"action": {"$in": ["download", "share_download"]}}) if want("download") else {}
    dl_link_day = await per_day({"action": "share_download"}) if want("download") else {}
    link_day = await per_day({"action": "share_link_create"}) if want("share") else {}
    perm_day = await per_day({"action": "permission_grant"}) if want("share") else {}
    top_dl, dl_users = [], []
    if want("download"):
        async for r in mongo_db.audit_logs.aggregate([{"$match": {**audit_base, "action": {"$in": ["download", "share_download"]}}},
                                                       {"$group": {"_id": "$details.name", "n": {"$sum": 1}}}, {"$sort": {"n": -1}}, {"$limit": 8}]):
            if r["_id"]:
                top_dl.append({"file": r["_id"], "downloads": r["n"]})
        async for r in mongo_db.audit_logs.aggregate([{"$match": {**audit_base, "action": "download"}}, {"$group": {"_id": "$user_email", "n": {"$sum": 1}}}, {"$sort": {"n": -1}}, {"$limit": 8}]):
            dl_users.append({"user": r["_id"] or "unknown", "downloads": r["n"]})

    # ---------- PostgreSQL: current sharing state
    link_rows = (await db.execute(select(SharedLink, StoredFile.deleted_at, StoredFile.owner_id).join(StoredFile, StoredFile.id == SharedLink.file_id))).all()
    link_counts = Counter()
    shared_file_ids = {fid for (fid,) in (await db.execute(select(FilePermission.file_id).join(StoredFile, StoredFile.id == FilePermission.file_id).where(StoredFile.deleted_at.is_(None)))).all()}
    for l, deleted, owner in link_rows:
        if owners is not None and owner not in owners:
            continue
        st = link_status(l)
        link_counts["unavailable" if deleted is not None and st == "active" else st] += 1
        if deleted is None:
            shared_file_ids.add(l.file_id)
    if owners is not None:
        shared_file_ids &= {f.id for f, _, _ in all_files}

    total_downloads = sum(dl_day.values())
    capacity = settings.platform_capacity_bytes
    platform_bytes = await platform_used(db)           # EVERY stored byte (also Trash), the number the 1 GB limit applies to
    fc = await forecast(db, platform_bytes)
    return {
        "range": {"from": labels[0], "to": labels[-1], "days": len(labels)},
        "filters": {"user": user, "file_type": file_type, "activity_type": activity_type},
        "totals": {"storage_bytes": total_bytes, "capacity_bytes": capacity, "platform_used_bytes": platform_bytes, **fc,
                   "warn_percent": settings.STORAGE_WARN_PERCENT, "critical_percent": settings.STORAGE_CRITICAL_PERCENT, "files": len(all_files), "uploaded_in_range": len(in_range),
                   "downloads": total_downloads, "shared_files": len(shared_file_ids), "users_with_files": len(users_storage)},
        "users_storage": users_storage,
        "uploads_series": [{"day": d, "uploads": up_by_day.get(d, 0)} if want("upload") else {"day": d, "uploads": 0} for d in labels],
        "downloads_series": [{"day": d, "downloads": dl_day.get(d, 0), "via_link": dl_link_day.get(d, 0)} for d in labels],
        "sharing_series": [{"day": d, "links": link_day.get(d, 0), "people": perm_day.get(d, 0)} for d in labels],
        "by_type": [{"type": t, "files": n, "bytes": type_bytes[t]} for t, n in by_type.most_common()],
        "top_downloads": top_dl, "download_users": dl_users, "largest": largest,
        "links": {k: link_counts.get(k, 0) for k in ("active", "expired", "revoked", "exhausted", "unavailable")},
    }


def _filters(date_from: str | None = None, date_to: str | None = None, days: int = Query(30, ge=1, le=366), user: str | None = None,
             file_type: str | None = None, activity_type: str | None = None) -> dict:
    return dict(date_from=date_from, date_to=date_to, days=days, user=user, file_type=file_type, activity_type=activity_type)


@router.get("/overview")
async def overview(f: dict = Depends(_filters), _: User = Depends(require_roles("admin")), db: AsyncSession = Depends(get_db)):
    return await collect(db, **f)


@router.get("/users/storage")
async def users_storage(f: dict = Depends(_filters), _: User = Depends(require_roles("admin")), db: AsyncSession = Depends(get_db)):
    d = await collect(db, **f)
    return {"users": d["users_storage"], "total_bytes": d["totals"]["storage_bytes"], "capacity_bytes": d["totals"]["capacity_bytes"]}


@router.get("/files")
async def file_statistics(f: dict = Depends(_filters), _: User = Depends(require_roles("admin")), db: AsyncSession = Depends(get_db)):
    d = await collect(db, **f)
    return {"totals": d["totals"], "uploads_series": d["uploads_series"], "by_type": d["by_type"], "largest": d["largest"], "top_downloads": d["top_downloads"]}


@router.get("/downloads")
async def download_statistics(f: dict = Depends(_filters), _: User = Depends(require_roles("admin")), db: AsyncSession = Depends(get_db)):
    d = await collect(db, **f)
    return {"total": d["totals"]["downloads"], "series": d["downloads_series"], "top_files": d["top_downloads"], "by_user": d["download_users"]}


@router.get("/sharing")
async def sharing_statistics(f: dict = Depends(_filters), _: User = Depends(require_roles("admin")), db: AsyncSession = Depends(get_db)):
    d = await collect(db, **f)
    return {"shared_files": d["totals"]["shared_files"], "series": d["sharing_series"], "links": d["links"]}
