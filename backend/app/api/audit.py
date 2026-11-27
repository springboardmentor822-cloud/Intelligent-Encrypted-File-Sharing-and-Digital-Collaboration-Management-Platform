"""Task 2: audit-log retrieval APIs (administrators only).

GET /audit-logs                     all logs
GET /audit-logs/user/{uid}          one user's logs
GET /audit-logs/file/{fid}          activity for one file
GET /audit-logs/filter              filter by user, activity type, file, status and date range
GET /audit-logs/types               distinct activity types (for filter drop-downs)
"""
import re
import uuid
from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_admin
from app.core.mongo import get_mongo
from app.models import StoredFile
from app.services import analytics_service
from app.services.audit_helpers import category_of, derive_status, describe

router = APIRouter(prefix="/audit-logs", tags=["audit"], dependencies=[Depends(get_admin)])


class AuditFilters:
    """Shared query parameters for every audit-log endpoint."""

    def __init__(self, user_id: uuid.UUID | None = None, activity_type: str | None = None,
                 file_id: uuid.UUID | None = None, file_name: str | None = None, status: str | None = None,
                 start: date | None = None, end: date | None = None, q: str | None = None,
                 page: int = 1, page_size: int = 25):
        self.user_id, self.activity_type, self.file_id, self.file_name = user_id, activity_type, file_id, file_name
        self.status, self.start, self.end, self.q = status, start, end, q
        self.page, self.page_size = max(page, 1), min(max(page_size, 1), 200)


def _uuid_or_none(value):
    try:
        return uuid.UUID(str(value))
    except (ValueError, TypeError):
        return None


def _conditions(f: AuditFilters, db: Session) -> list[dict]:
    conds: list[dict] = []
    if f.user_id:
        conds.append({"actor_id": str(f.user_id)})
    if f.activity_type:
        conds.append({"action": {"$regex": "^" + re.escape(f.activity_type[:60])}})
    if f.file_id:
        conds.append({"resource_id": str(f.file_id)})
    if f.file_name:
        like = f"%{f.file_name[:100]}%"
        ids = [str(i) for i in db.scalars(select(StoredFile.id).where(StoredFile.name.ilike(like)).limit(500))]
        conds.append({"$or": [{"resource_id": {"$in": ids}}, {"details.name": {"$regex": re.escape(f.file_name[:100]), "$options": "i"}}]})
    if f.status == "failed":
        conds.append({"status": "failed"})
    elif f.status == "success":
        conds.append({"status": {"$ne": "failed"}})
    if f.start or f.end:
        s, e = analytics_service.parse_range(f.start, f.end)
        lo, hi = analytics_service._bounds(s, e)
        conds.append({"ts": {"$gte": lo, "$lt": hi}})
    if f.q:
        rx = {"$regex": re.escape(f.q[:60]), "$options": "i"}
        conds.append({"$or": [{"actor_email": rx}, {"action": rx}, {"ip": rx}, {"description": rx}]})
    return conds


def _file_names(db: Session, docs: list[dict]) -> dict[str, str]:
    ids = {d["resource_id"] for d in docs if d.get("resource_type") == "file" and d.get("resource_id")}
    uuids = [u for u in (_uuid_or_none(i) for i in ids) if u]
    if not uuids:
        return {}
    return {str(i): n for i, n in db.execute(select(StoredFile.id, StoredFile.name).where(StoredFile.id.in_(uuids))).all()}


def _view(d: dict, names: dict[str, str]) -> dict:
    action = d.get("action", "")
    details = d.get("details") or {}
    file_id = d.get("resource_id") if d.get("resource_type") == "file" else details.get("file_id")
    return {
        "log_id": d.get("log_id") or str(d["_id"]),
        "ts": d["ts"],
        "user_id": d.get("actor_id"),
        "username": d.get("actor_name") or d.get("actor_email") or "Anonymous",
        "email": d.get("actor_email"),
        "activity_type": action,
        "category": d.get("category") or category_of(action),
        "file_id": file_id,
        "file_name": details.get("name") or names.get(file_id or ""),
        "description": d.get("description") or describe(action, details),
        "status": d.get("status") or derive_status(action),
        "ip": d.get("ip"),
    }


def _run(db: Session, f: AuditFilters) -> dict:
    conds = _conditions(f, db)
    flt = {"$and": conds} if conds else {}
    coll = get_mongo().audit_logs
    total = coll.count_documents(flt)
    docs = list(coll.find(flt).sort("ts", -1).skip((f.page - 1) * f.page_size).limit(f.page_size))
    names = _file_names(db, docs)
    return {"items": [_view(d, names) for d in docs], "total": total, "page": f.page, "page_size": f.page_size}


@router.get("")
def all_logs(f: AuditFilters = Depends(), db: Session = Depends(get_db)):
    return _run(db, f)


@router.get("/filter")
def filter_logs(f: AuditFilters = Depends(), db: Session = Depends(get_db)):
    return _run(db, f)


@router.get("/types")
def activity_types():
    actions = sorted(a for a in get_mongo().audit_logs.distinct("action") if a)
    return {"categories": sorted({category_of(a) for a in actions}), "actions": actions}


@router.get("/user/{uid}")
def logs_for_user(uid: uuid.UUID, f: AuditFilters = Depends(), db: Session = Depends(get_db)):
    f.user_id = uid
    return _run(db, f)


@router.get("/file/{fid}")
def logs_for_file(fid: uuid.UUID, f: AuditFilters = Depends(), db: Session = Depends(get_db)):
    f.file_id = fid
    return _run(db, f)
