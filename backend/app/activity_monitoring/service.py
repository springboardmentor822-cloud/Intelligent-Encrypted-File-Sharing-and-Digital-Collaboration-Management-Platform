"""Recording and querying the Milestone 3 activity stream."""
from __future__ import annotations

from datetime import datetime

from fastapi import Request
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ..db import iso, utcnow
from ..models import ActivityRecord, File, User
from ..services.audit import clean, client_ip
from ..services.mongo import mirror

# Canonical activity types. Existing routers use these names; the API accepts any stored value.
ACTIVITY_TYPES = [
    "login", "login_failed", "logout",
    "file_upload", "file_download", "file_view", "file_delete", "file_restore",
    "share_create", "share_revoke", "share_access", "share_expired_access", "share_revoked_access",
    "share_expired", "share_expiring", "unauthorized_access", "passcode_failed",
    "secure_folder_unlock", "secure_folder_failed", "admin_access",
]


def record(db: Session, activity_type: str, *, user_id: str | None = None, file_id: str | None = None,
           status: str = "success", request: Request | None = None, details: dict | None = None,
           commit: bool = True) -> ActivityRecord:
    """Append one activity row and mirror it to MongoDB (best-effort)."""
    row = ActivityRecord(user_id=user_id, activity_type=activity_type[:60], file_id=file_id,
                         status=status[:16], ip=client_ip(request), details=clean(details),
                         created_at=utcnow())
    db.add(row)
    if commit:
        db.commit()
    else:
        db.flush()
    mirror("activity", {
        "activity_id": f"ACT-{row.id:08d}", "user_id": row.user_id, "activity_type": row.activity_type,
        "file_id": row.file_id, "status": row.status, "ip": row.ip, "details": row.details,
        "timestamp": iso(row.created_at),
    })
    # Milestone 3 (Task 6, Step 4): whenever a security-relevant activity is recorded, re-evaluate
    # the detection rules so suspicious patterns raise alerts without a manual scan.
    if activity_type in {"login_failed", "file_download", "unauthorized_access",
                         "share_expired_access", "share_revoked_access"}:
        try:
            from ..security_monitoring import detection
            detection.scan(db)
        except Exception:
            pass
    return row


def out(row: ActivityRecord, email: str | None = None, name: str | None = None,
        file_name: str | None = None) -> dict:
    return {"id": row.id, "activity_id": f"ACT-{row.id:08d}", "user_id": row.user_id, "user_email": email,
            "user_name": name, "activity_type": row.activity_type, "file_id": row.file_id,
            "file_name": file_name, "status": row.status, "ip": row.ip, "created_at": iso(row.created_at),
            "details": row.details or {}}


def query(db: Session, *, user_id: str | None = None, activity_type: str | None = None,
          status: str | None = None, file_id: str | None = None, start: datetime | None = None,
          end: datetime | None = None, q: str | None = None, page: int = 1, page_size: int = 50,
          owner_id: str | None = None) -> dict:
    """Filtered, paginated activity query. ``owner_id`` scopes results to one account (user view)."""
    stmt = (select(ActivityRecord, User.email, User.full_name, File.original_name)
            .outerjoin(User, User.id == ActivityRecord.user_id)
            .outerjoin(File, File.id == ActivityRecord.file_id))
    count_stmt = (select(func.count(ActivityRecord.id))
                  .outerjoin(User, User.id == ActivityRecord.user_id)
                  .outerjoin(File, File.id == ActivityRecord.file_id))
    conds = []
    if owner_id:
        conds.append(ActivityRecord.user_id == owner_id)
    if user_id:
        conds.append(ActivityRecord.user_id == user_id)
    if activity_type:
        conds.append(ActivityRecord.activity_type == activity_type)
    if status:
        conds.append(ActivityRecord.status == status)
    if file_id:
        conds.append(ActivityRecord.file_id == file_id)
    if start:
        conds.append(ActivityRecord.created_at >= start)
    if end:
        conds.append(ActivityRecord.created_at < end)
    if q:
        like = f"%{q.strip()}%"
        conds.append(or_(ActivityRecord.activity_type.ilike(like), User.email.ilike(like),
                         User.full_name.ilike(like), File.original_name.ilike(like),
                         ActivityRecord.file_id.ilike(like)))
    for c in conds:
        stmt = stmt.where(c)
        count_stmt = count_stmt.where(c)
    total = db.execute(count_stmt).scalar() or 0
    page = max(1, page)
    page_size = min(max(1, page_size), 200)
    rows = db.execute(stmt.order_by(ActivityRecord.id.desc())
                      .offset((page - 1) * page_size).limit(page_size)).all()
    items = [out(r, email, name, fname) for r, email, name, fname in rows]
    return {"items": items, "total": total, "page": page, "page_size": page_size}


def summary(db: Session, *, start: datetime | None = None, end: datetime | None = None,
            owner_id: str | None = None) -> dict:
    conds = []
    if owner_id:
        conds.append(ActivityRecord.user_id == owner_id)
    if start:
        conds.append(ActivityRecord.created_at >= start)
    if end:
        conds.append(ActivityRecord.created_at < end)

    def _apply(stmt):
        for c in conds:
            stmt = stmt.where(c)
        return stmt

    by_type = db.execute(_apply(select(ActivityRecord.activity_type, func.count())
                                .group_by(ActivityRecord.activity_type))).all()
    by_status = db.execute(_apply(select(ActivityRecord.status, func.count())
                                  .group_by(ActivityRecord.status))).all()
    by_day = db.execute(_apply(select(func.substr(ActivityRecord.created_at, 1, 10), func.count())
                               .group_by(func.substr(ActivityRecord.created_at, 1, 10))
                               .order_by(func.substr(ActivityRecord.created_at, 1, 10)))).all()
    return {
        "total": sum(n for _, n in by_type),
        "by_type": {k: n for k, n in by_type},
        "by_status": {k: n for k, n in by_status},
        "by_day": [{"date": d, "count": n} for d, n in by_day],
    }
