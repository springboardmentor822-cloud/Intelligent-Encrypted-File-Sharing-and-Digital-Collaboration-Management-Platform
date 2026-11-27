"""Task 5: storage analytics and usage monitoring for administrators.

GET /admin/analytics/storage         total storage usage
GET /admin/analytics/users/storage   user-wise storage usage
GET /admin/analytics/files           file statistics (uploads, downloads, shares, most downloaded)
GET /admin/analytics/downloads       download statistics
GET /admin/analytics/sharing         sharing statistics
GET /admin/analytics/overview        all of the above in one call (used by the dashboard)
Filters: start/end (date range), user_id (file owner) and file_type (documents|images|videos|others).
"""
import uuid
from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_admin
from app.core.mongo import get_mongo
from app.models import FileShare, FileVersion, ShareLink, StoredFile, User
from app.services import analytics_service
from app.services.file_validation import ALLOWED

router = APIRouter(prefix="/admin/analytics", tags=["storage analytics"], dependencies=[Depends(get_admin)])
CATEGORIES = analytics_service.CATEGORIES


class Filters:
    def __init__(self, start: date | None = None, end: date | None = None, user_id: uuid.UUID | None = None,
                 file_type: str | None = None):
        self.start, self.end = analytics_service.parse_range(start, end)
        self.lo, self.hi = analytics_service._bounds(self.start, self.end)
        self.user_id = user_id
        self.file_type = file_type if file_type in CATEGORIES else None

    def file_conds(self) -> list:
        c = []
        if self.user_id:
            c.append(StoredFile.owner_id == self.user_id)
        if self.file_type:
            c.append(StoredFile.category == self.file_type)
        return c

    def mongo_match(self) -> dict:
        m: dict = {"ts": {"$gte": self.lo, "$lt": self.hi}}
        if self.user_id:
            m["owner_id"] = str(self.user_id)
        if self.file_type:
            exts = [e for e, (cat, _) in ALLOWED.items() if cat == self.file_type]
            m["file_name"] = {"$regex": r"\.(" + "|".join(exts) + r")$", "$options": "i"}
        return m


def _storage(db: Session, f: Filters) -> dict:
    conds = f.file_conds()
    total_bytes = int(db.scalar(select(func.coalesce(func.sum(FileVersion.encrypted_size), 0))
                                .select_from(FileVersion).join(StoredFile, StoredFile.id == FileVersion.file_id).where(*conds)) or 0)
    total_files = db.scalar(select(func.count()).select_from(StoredFile).where(StoredFile.deleted_at.is_(None), *conds)) or 0
    cats = dict(db.execute(select(StoredFile.category, func.coalesce(func.sum(FileVersion.encrypted_size), 0))
                           .select_from(FileVersion).join(StoredFile, StoredFile.id == FileVersion.file_id)
                           .where(*conds).group_by(StoredFile.category)).all())
    return {"total_bytes": total_bytes, "total_files": total_files,
            "by_category": [{"category": c, "bytes": int(cats.get(c, 0))} for c in CATEGORIES]}


def _users_storage(db: Session, f: Filters) -> list[dict]:
    size = func.coalesce(func.sum(FileVersion.encrypted_size), 0)
    rows = db.execute(
        select(User.id, User.full_name, User.email, func.count(func.distinct(StoredFile.id)), size)
        .select_from(User).join(StoredFile, StoredFile.owner_id == User.id).join(FileVersion, FileVersion.file_id == StoredFile.id)
        .where(*f.file_conds()).group_by(User.id, User.full_name, User.email).order_by(size.desc())).all()
    total = sum(int(r[4]) for r in rows) or 1
    return [{"user_id": i, "name": n, "email": em, "files": c, "bytes": int(b), "percent": round(int(b) / total * 100, 1)}
            for i, n, em, c, b in rows]


def _uploads(db: Session, f: Filters) -> dict:
    d = func.date(FileVersion.created_at)
    rows = db.execute(select(d, StoredFile.category, func.count()).select_from(FileVersion)
                      .join(StoredFile, StoredFile.id == FileVersion.file_id)
                      .where(FileVersion.created_at >= f.lo, FileVersion.created_at < f.hi, *f.file_conds())
                      .group_by(d, StoredFile.category)).all()
    days = analytics_service._days(f.start, f.end)
    grid = {x: {c: 0 for c in CATEGORIES} for x in days}
    for day, cat, n in rows:
        if day in grid and cat in grid[day]:
            grid[day][cat] += n
    return {"total": sum(r[2] for r in rows), "series": [{"date": x.isoformat(), **grid[x]} for x in days]}


def _downloads(f: Filters) -> dict:
    coll = get_mongo().download_events
    match = f.mongo_match()
    days = analytics_service._days(f.start, f.end)
    agg = {r["_id"]: r for r in coll.aggregate([
        {"$match": match},
        {"$group": {"_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$ts"}}, "total": {"$sum": 1},
                    "users": {"$addToSet": "$actor"}, "shared": {"$sum": {"$cond": [{"$ne": ["$via", "owner"]}, 1, 0]}}}}])}
    series = []
    for d in days:
        r = agg.get(d.isoformat())
        series.append({"date": d.isoformat(), "total": r["total"] if r else 0,
                       "unique_users": len(r["users"]) if r else 0, "shared": r["shared"] if r else 0})
    top = [{"file_id": r["_id"], "name": r["name"], "downloads": r["n"]} for r in coll.aggregate([
        {"$match": match}, {"$group": {"_id": "$file_id", "name": {"$first": "$file_name"}, "n": {"$sum": 1}}},
        {"$sort": {"n": -1}}, {"$limit": 10}])]
    return {"total": coll.count_documents(match), "series": series, "top_files": top}


def _sharing(db: Session, f: Filters) -> dict:
    days = analytics_service._days(f.start, f.end)
    grid = {x: {"direct": 0, "link": 0, "internal": 0} for x in days}
    needs_join = bool(f.file_conds())
    lq = select(func.date(ShareLink.created_at), func.count()).where(ShareLink.created_at >= f.lo, ShareLink.created_at < f.hi)
    uq = select(func.date(FileShare.created_at), FileShare.share_type, func.count()).where(FileShare.created_at >= f.lo, FileShare.created_at < f.hi)
    if needs_join:
        lq = lq.join(StoredFile, StoredFile.id == ShareLink.file_id).where(*f.file_conds())
        uq = uq.join(StoredFile, StoredFile.id == FileShare.file_id).where(*f.file_conds())
    for day, n in db.execute(lq.group_by(func.date(ShareLink.created_at))).all():
        if day in grid:
            grid[day]["link"] += n
    for day, t, n in db.execute(uq.group_by(func.date(FileShare.created_at), FileShare.share_type)).all():
        if day in grid and t in grid[day]:
            grid[day][t] += n
    total = sum(sum(v.values()) for v in grid.values())
    files_shared = db.scalar(select(func.count(func.distinct(ShareLink.file_id))).select_from(ShareLink)
                             .join(StoredFile, StoredFile.id == ShareLink.file_id)
                             .where(ShareLink.created_at >= f.lo, ShareLink.created_at < f.hi, *f.file_conds())) or 0
    return {"total": total, "files_shared_by_link": files_shared, "series": [{"date": x.isoformat(), **grid[x]} for x in days]}


@router.get("/storage")
def storage(f: Filters = Depends(), db: Session = Depends(get_db)):
    return _storage(db, f)


@router.get("/users/storage")
def users_storage(f: Filters = Depends(), db: Session = Depends(get_db)):
    return {"items": _users_storage(db, f)}


@router.get("/files")
def file_stats(f: Filters = Depends(), db: Session = Depends(get_db)):
    up, dl, sh, st = _uploads(db, f), _downloads(f), _sharing(db, f), _storage(db, f)
    return {"total_uploaded": up["total"], "total_downloaded": dl["total"], "total_shared": sh["total"],
            "total_files": st["total_files"], "total_storage_bytes": st["total_bytes"],
            "uploads_series": up["series"], "most_downloaded": dl["top_files"]}


@router.get("/downloads")
def download_stats(f: Filters = Depends()):
    return _downloads(f)


@router.get("/sharing")
def sharing_stats(f: Filters = Depends(), db: Session = Depends(get_db)):
    return _sharing(db, f)


@router.get("/overview")
def overview(f: Filters = Depends(), db: Session = Depends(get_db)):
    st, up, dl, sh = _storage(db, f), _uploads(db, f), _downloads(f), _sharing(db, f)
    return {
        "range": {"start": f.start.isoformat(), "end": f.end.isoformat()},
        "storage": st, "users_storage": _users_storage(db, f),
        "uploads": up, "downloads": dl, "sharing": sh,
    }
