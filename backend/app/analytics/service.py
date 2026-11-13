from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import iso, utcnow
from ..models import DownloadRecord, File, Share, User
from ..serializers import share_status


def _file_conds(start, end, user_id, file_type):
    c = [File.deleted_at.is_(None)]
    if start:
        c.append(File.created_at >= start)
    if end:
        c.append(File.created_at < end)
    if user_id:
        c.append(File.owner_id == user_id)
    if file_type:
        c.append(File.category == file_type)
    return c


def storage(db: Session, *, start: datetime | None = None, end: datetime | None = None,
            user_id: str | None = None, file_type: str | None = None) -> dict:
    conds = _file_conds(start, end, user_id, file_type)
    total_bytes = db.execute(select(func.coalesce(func.sum(File.size), 0)).where(*conds)).scalar() or 0
    total_files = db.execute(select(func.count(File.id)).where(*conds)).scalar() or 0
    deleted = db.execute(select(func.count(File.id)).where(File.deleted_at.is_not(None))).scalar() or 0
    users = db.execute(select(User)).scalars().all()
    quota = sum(u.quota_bytes or 0 for u in users)
    by_cat = db.execute(select(File.category, func.count(), func.coalesce(func.sum(File.size), 0))
                        .where(*conds).group_by(File.category)).all()
    by_user = db.execute(select(File.owner_id, func.count(), func.coalesce(func.sum(File.size), 0))
                         .where(*conds).group_by(File.owner_id)).all()
    umap = {u.id: u for u in users}
    series = db.execute(select(func.substr(File.created_at, 1, 10), func.count(),
                               func.coalesce(func.sum(File.size), 0))
                        .where(*conds).group_by(func.substr(File.created_at, 1, 10))
                        .order_by(func.substr(File.created_at, 1, 10))).all()
    return {
        "total_bytes": int(total_bytes), "total_files": total_files, "deleted_files": deleted,
        "quota_bytes": quota, "used_pct": round(total_bytes / quota * 100, 1) if quota else 0,
        "by_category": [{"category": c, "files": n, "bytes": int(b)} for c, n, b in by_cat],
        "by_user": [{"user_id": uid, "email": umap[uid].email if uid in umap else None,
                     "name": umap[uid].full_name if uid in umap else None,
                     "files": n, "bytes": int(b), "quota_bytes": umap[uid].quota_bytes if uid in umap else 0}
                    for uid, n, b in sorted(by_user, key=lambda x: -x[2])],
        "series": [{"date": d, "files": n, "bytes": int(b)} for d, n, b in series],
    }


def users_storage(db: Session) -> dict:
    rows = db.execute(select(File.owner_id, func.count(), func.coalesce(func.sum(File.size), 0))
                      .where(File.deleted_at.is_(None)).group_by(File.owner_id)).all()
    agg = {uid: (n, int(b)) for uid, n, b in rows}
    users = db.execute(select(User).order_by(User.created_at)).scalars().all()
    items = []
    for u in users:
        n, b = agg.get(u.id, (0, 0))
        items.append({"user_id": u.id, "email": u.email, "name": u.full_name, "role": u.role,
                      "files": n, "bytes": b, "quota_bytes": u.quota_bytes,
                      "used_pct": round(b / u.quota_bytes * 100, 1) if u.quota_bytes else 0})
    items.sort(key=lambda x: -x["bytes"])
    return {"users": items, "total_bytes": sum(i["bytes"] for i in items),
            "total_quota_bytes": sum(i["quota_bytes"] or 0 for i in items)}


def files(db: Session, *, start=None, end=None, user_id=None, file_type=None) -> dict:
    conds = _file_conds(start, end, user_id, file_type)
    by_cat = db.execute(select(File.category, func.count(), func.coalesce(func.sum(File.size), 0))
                        .where(*conds).group_by(File.category)).all()
    by_ext = db.execute(select(File.ext, func.count(), func.coalesce(func.sum(File.size), 0))
                        .where(*conds).group_by(File.ext).order_by(func.count().desc()).limit(15)).all()
    largest = db.execute(select(File).where(*conds).order_by(File.size.desc()).limit(10)).scalars().all()
    return {
        "total_files": db.execute(select(func.count(File.id)).where(*conds)).scalar() or 0,
        "by_category": [{"category": c, "files": n, "bytes": int(b)} for c, n, b in by_cat],
        "by_extension": [{"ext": e or "(none)", "files": n, "bytes": int(b)} for e, n, b in by_ext],
        "largest": [{"id": f.id, "name": f.original_name, "size": f.size, "category": f.category,
                     "created_at": iso(f.created_at)} for f in largest],
    }


def downloads(db: Session, *, start=None, end=None, user_id=None) -> dict:
    conds = [DownloadRecord.action == "download"]
    if start:
        conds.append(DownloadRecord.created_at >= start)
    if end:
        conds.append(DownloadRecord.created_at < end)
    if user_id:
        conds.append(DownloadRecord.user_id == user_id)
    total = db.execute(select(func.count(DownloadRecord.id)).where(*conds)).scalar() or 0
    total_bytes = db.execute(select(func.coalesce(func.sum(DownloadRecord.bytes), 0)).where(*conds)).scalar() or 0
    series = db.execute(select(func.substr(DownloadRecord.created_at, 1, 10), func.count())
                        .where(*conds).group_by(func.substr(DownloadRecord.created_at, 1, 10))
                        .order_by(func.substr(DownloadRecord.created_at, 1, 10))).all()
    top = db.execute(select(DownloadRecord.file_id, File.original_name, func.count())
                     .outerjoin(File, File.id == DownloadRecord.file_id).where(*conds)
                     .group_by(DownloadRecord.file_id, File.original_name)
                     .order_by(func.count().desc()).limit(10)).all()
    by_user = db.execute(select(DownloadRecord.user_id, func.count())
                         .where(*conds).group_by(DownloadRecord.user_id)
                         .order_by(func.count().desc()).limit(20)).all()
    return {"total_downloads": total, "total_bytes": int(total_bytes),
            "series": [{"date": d, "count": n} for d, n in series],
            "top_files": [{"file_id": fid, "name": name, "count": n} for fid, name, n in top],
            "by_user": [{"user_id": uid, "count": n} for uid, n in by_user]}


def sharing(db: Session, *, start=None, end=None, user_id=None) -> dict:
    stmt = select(Share)
    if start:
        stmt = stmt.where(Share.created_at >= start)
    if end:
        stmt = stmt.where(Share.created_at < end)
    if user_id:
        stmt = stmt.where(Share.owner_id == user_id)
    rows = db.execute(stmt.limit(20000)).scalars().all()
    now = utcnow()
    by_status: dict[str, int] = {}
    by_day: dict[str, int] = {}
    by_file: dict[str, int] = {}
    for s in rows:
        st = share_status(s, now)
        by_status[st] = by_status.get(st, 0) + 1
        by_day[s.created_at.date().isoformat()] = by_day.get(s.created_at.date().isoformat(), 0) + 1
        by_file[s.file_id] = by_file.get(s.file_id, 0) + 1
    files = {f.id: f.original_name for f in db.execute(select(File)).scalars().all()}
    return {"total_shares": len(rows), "by_status": by_status,
            "series": [{"date": d, "count": n} for d, n in sorted(by_day.items())],
            "top_files": [{"file_id": k, "name": files.get(k), "count": v}
                          for k, v in sorted(by_file.items(), key=lambda x: -x[1])[:10]]}
