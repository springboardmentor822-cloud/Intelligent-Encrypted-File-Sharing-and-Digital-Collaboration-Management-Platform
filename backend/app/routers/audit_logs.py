"""Audit log APIs for administrators (Milestone 3, Task 2). The names follow the milestone document:

  GET /audit-logs                 all logs (with filters + pages)
  GET /audit-logs/user/{user_id}  one user's logs  (the user id or the e-mail)
  GET /audit-logs/file/{file_id}  one file's history (the file id or part of its name)
  GET /audit-logs/filter          same filters, kept as a separate URL because the document lists it
  GET /audit-logs/export          the same query as a CSV download

ADMIN ONLY. There is deliberately no PUT / PATCH / DELETE here: audit records cannot be edited or removed from the app.
"""
import csv
import io

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import require_roles
from app.db.mongo import mongo_db
from app.db.postgres import get_db
from app.models.postgres import User
from app.services.audit import log_event
from app.services.audit_view import ACTION_TYPES, build_filter, to_rows

router = APIRouter(prefix="/audit-logs", tags=["Audit logs (admin)"])


async def _search(db: AsyncSession, flt: dict, page: int, page_size: int) -> dict:
    total = await mongo_db.audit_logs.count_documents(flt)
    cursor = mongo_db.audit_logs.find(flt).sort("timestamp", -1).skip((page - 1) * page_size).limit(page_size)
    docs = [d async for d in cursor]
    ok = await mongo_db.audit_logs.count_documents({"$and": [flt, {"result": "success"}]} if flt else {"result": "success"})
    return {"items": await to_rows(db, docs), "total": total, "page": page, "page_size": page_size,
            "success": ok, "failure": total - ok, "activity_types": ACTION_TYPES}


@router.get("")
async def all_logs(user: str | None = None, activity_type: str | None = None, file: str | None = None, status: str | None = None,
                   date_from: str | None = None, date_to: str | None = None, page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=200),
                   _: User = Depends(require_roles("admin")), db: AsyncSession = Depends(get_db)):
    return await _search(db, build_filter(user=user, activity_type=activity_type, file=file, status=status, date_from=date_from, date_to=date_to), page, page_size)


@router.get("/filter")
async def filter_logs(user: str | None = None, activity_type: str | None = None, file: str | None = None, status: str | None = None,
                      date_from: str | None = None, date_to: str | None = None, page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=200),
                      _: User = Depends(require_roles("admin")), db: AsyncSession = Depends(get_db)):
    return await _search(db, build_filter(user=user, activity_type=activity_type, file=file, status=status, date_from=date_from, date_to=date_to), page, page_size)


@router.get("/user/{user_id}")
async def user_logs(user_id: str, activity_type: str | None = None, status: str | None = None, date_from: str | None = None, date_to: str | None = None,
                    page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=200),
                    _: User = Depends(require_roles("admin")), db: AsyncSession = Depends(get_db)):
    return await _search(db, build_filter(user=user_id, activity_type=activity_type, status=status, date_from=date_from, date_to=date_to), page, page_size)


@router.get("/file/{file_id}")
async def file_logs(file_id: str, activity_type: str | None = None, status: str | None = None, date_from: str | None = None, date_to: str | None = None,
                    page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=200),
                    _: User = Depends(require_roles("admin")), db: AsyncSession = Depends(get_db)):
    return await _search(db, build_filter(file=file_id, activity_type=activity_type, status=status, date_from=date_from, date_to=date_to), page, page_size)


@router.get("/export")
async def export_logs(request: Request, user: str | None = None, activity_type: str | None = None, file: str | None = None, status: str | None = None,
                      date_from: str | None = None, date_to: str | None = None,
                      admin: User = Depends(require_roles("admin")), db: AsyncSession = Depends(get_db)):
    """CSV of the filtered logs (at most 5000 rows). Opening Excel on it is the easiest way to hand a log to someone."""
    flt = build_filter(user=user, activity_type=activity_type, file=file, status=status, date_from=date_from, date_to=date_to)
    docs = [d async for d in mongo_db.audit_logs.find(flt).sort("timestamp", -1).limit(5000)]
    rows = await to_rows(db, docs)
    buf = io.StringIO()
    cols = ["log_id", "timestamp", "user_id", "username", "user_email", "activity_type", "file_id", "file_name", "description", "status", "ip", "location"]
    w = csv.DictWriter(buf, fieldnames=cols, extrasaction="ignore")
    w.writeheader()
    for r in rows:   # a cell that starts with = + - @ could run as a formula in Excel, so it is prefixed with a quote
        w.writerow({k: ("'" + str(v) if isinstance(v, str) and v[:1] in "=+-@" else v) for k, v in r.items()})
    await log_event("audit_export", request, user=admin, details={"rows": len(rows)})
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv", headers={"Content-Disposition": 'attachment; filename="audit_logs.csv"'})
