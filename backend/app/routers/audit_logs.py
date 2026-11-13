"""Milestone 3 — Audit Log retrieval API.

The append-only hash-chained audit rows are written by ``services.audit.audit`` across auth, upload,
download, sharing, access-permission and security-monitoring code paths. These endpoints expose them
with the Milestone 3 field names and filters (admin only).
"""
from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ..db import get_db, iso
from ..deps import parse_range, require_admin
from ..models import AuditLog, File, User

router = APIRouter(prefix="/api/audit-logs", tags=["audit-logs"])


def _desc(row: AuditLog) -> str:
    d = row.details or {}
    for k in ("description", "message", "reason"):
        if d.get(k):
            return str(d[k])[:300]
    return row.action.replace(".", " ").replace("_", " ").capitalize()


def _out(row: AuditLog, username: str | None, email: str | None, file_name: str | None) -> dict:
    return {
        "id": row.id, "log_id": f"LOG-{row.id:08d}", "user_id": row.actor_id, "username": username,
        "email": email, "activity_type": row.action, "file_id": row.resource_id if row.resource_type == "file" else None,
        "file_name": file_name, "description": _desc(row), "status": row.outcome, "ip": row.ip,
        "created_at": iso(row.created_at), "resource_type": row.resource_type,
        "resource_id": row.resource_id, "details": row.details or {},
    }


def query(db: Session, *, user_id: str | None = None, activity_type: str | None = None,
          file_id: str | None = None, status: str | None = None, start: datetime | None = None,
          end: datetime | None = None, q: str | None = None, page: int = 1, page_size: int = 50) -> dict:
    stmt = (select(AuditLog, User.full_name, User.email, File.original_name)
            .outerjoin(User, User.id == AuditLog.actor_id)
            .outerjoin(File, File.id == AuditLog.resource_id))
    count_stmt = (select(func.count(AuditLog.id)).outerjoin(User, User.id == AuditLog.actor_id)
                  .outerjoin(File, File.id == AuditLog.resource_id))
    conds = []
    if user_id:
        conds.append(or_(AuditLog.actor_id == user_id, AuditLog.owner_id == user_id))
    if activity_type:
        conds.append(AuditLog.action == activity_type)
    if file_id:
        conds.append(AuditLog.resource_id == file_id)
    if status:
        conds.append(AuditLog.outcome == status)
    if start:
        conds.append(AuditLog.created_at >= start)
    if end:
        conds.append(AuditLog.created_at < end)
    if q:
        like = f"%{q.strip()}%"
        conds.append(or_(AuditLog.action.ilike(like), User.email.ilike(like), User.full_name.ilike(like),
                         File.original_name.ilike(like), AuditLog.resource_id.ilike(like)))
    for c in conds:
        stmt = stmt.where(c)
        count_stmt = count_stmt.where(c)
    total = db.execute(count_stmt).scalar() or 0
    page = max(1, page)
    page_size = min(max(1, page_size), 200)
    rows = db.execute(stmt.order_by(AuditLog.id.desc()).offset((page - 1) * page_size)
                      .limit(page_size)).all()
    items = [_out(r, name or email, email, fname) for r, name, email, fname in rows]
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.get("")
def list_logs(user_id: str | None = None, activity_type: str | None = None, file_id: str | None = None,
              status: str | None = None, start: str | None = None, end: str | None = None,
              q: str | None = None, page: int = Query(1, ge=1), page_size: int = Query(50, ge=1, le=200),
              db: Session = Depends(get_db), _: User = Depends(require_admin)):
    s, e = parse_range(start, end, default_days=30)
    return query(db, user_id=user_id, activity_type=activity_type, file_id=file_id, status=status,
                 start=s, end=e, q=q, page=page, page_size=page_size)


@router.get("/user/{user_id}")
def by_user(user_id: str, activity_type: str | None = None, status: str | None = None,
            start: str | None = None, end: str | None = None, page: int = Query(1, ge=1),
            page_size: int = Query(50, ge=1, le=200), db: Session = Depends(get_db),
            _: User = Depends(require_admin)):
    s, e = parse_range(start, end, default_days=30)
    return query(db, user_id=user_id, activity_type=activity_type, status=status, start=s, end=e,
                 page=page, page_size=page_size)


@router.get("/file/{file_id}")
def by_file(file_id: str, status: str | None = None, start: str | None = None, end: str | None = None,
            page: int = Query(1, ge=1), page_size: int = Query(50, ge=1, le=200),
            db: Session = Depends(get_db), _: User = Depends(require_admin)):
    s, e = parse_range(start, end, default_days=90)
    return query(db, file_id=file_id, status=status, start=s, end=e, page=page, page_size=page_size)


@router.get("/filter")
def filtered(user_id: str | None = None, activity_type: str | None = None, file_id: str | None = None,
             file_name: str | None = None, status: str | None = None, start: str | None = None,
             end: str | None = None, page: int = Query(1, ge=1), page_size: int = Query(50, ge=1, le=200),
             db: Session = Depends(get_db), _: User = Depends(require_admin)):
    s, e = parse_range(start, end, default_days=30)
    q = file_name
    if file_name and not file_id:
        f = db.execute(select(File.id).where(File.original_name.ilike(f"%{file_name}%")).limit(1)).scalar()
        if f:
            file_id = f
    return query(db, user_id=user_id, activity_type=activity_type, file_id=file_id, status=status,
                 start=s, end=e, q=q, page=page, page_size=page_size)


@router.get("/types")
def types(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    rows = db.execute(select(AuditLog.action, func.count()).group_by(AuditLog.action)
                      .order_by(func.count().desc())).all()
    return {"types": [{"action": a, "count": n} for a, n in rows]}
