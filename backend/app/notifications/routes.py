from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db, iso
from ..deps import current_user, require_admin
from ..models import Notification, User
from . import service

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


@router.get("")
def list_notifications(unread_only: bool = False, type: str | None = None, page: int = Query(1, ge=1),
                       page_size: int = Query(30, ge=1, le=100), db: Session = Depends(get_db),
                       user: User = Depends(current_user)):
    return service.list_for(db, user.id, unread_only=unread_only, type=type, page=page, page_size=page_size)


@router.get("/history")
def notification_history(type: str | None = None, page: int = Query(1, ge=1),
                         page_size: int = Query(30, ge=1, le=100), db: Session = Depends(get_db),
                         user: User = Depends(current_user)):
    return service.list_for(db, user.id, unread_only=False, type=type, page=page, page_size=page_size)


@router.get("/unread-count")
def unread(db: Session = Depends(get_db), user: User = Depends(current_user)):
    return {"unread": service.unread_count(db, user.id)}


@router.post("/read-all")
def read_all(db: Session = Depends(get_db), user: User = Depends(current_user)):
    return {"marked": service.mark_all_read(db, user.id), "unread": 0}


@router.post("/{notification_id}/read")
def read_one(notification_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    n = service.mark_read(db, user.id, notification_id)
    if not n:
        raise HTTPException(404, "Notification not found")
    return service.out(n)


# --- Admin notification management ---
@router.get("/admin/all")
def admin_all(user_id: str | None = None, type: str | None = None, severity: str | None = None,
              read: bool | None = None, page: int = Query(1, ge=1), page_size: int = Query(50, ge=1, le=200),
              db: Session = Depends(get_db), _: User = Depends(require_admin)):
    conds = []
    if user_id:
        conds.append(Notification.user_id == user_id)
    if type:
        conds.append(Notification.type == type)
    if severity:
        conds.append(Notification.severity == severity)
    if read is True:
        conds.append(Notification.read_at.is_not(None))
    if read is False:
        conds.append(Notification.read_at.is_(None))
    total = db.execute(select(func.count(Notification.id)).where(*conds)).scalar() or 0
    rows = db.execute(select(Notification, User.email).outerjoin(User, User.id == Notification.user_id)
                      .where(*conds).order_by(Notification.id.desc())
                      .offset((page - 1) * page_size).limit(page_size)).all()
    items = [{**service.out(n), "user_email": email} for n, email in rows]
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.get("/admin/stats")
def admin_stats(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    by_type = db.execute(select(Notification.type, func.count()).group_by(Notification.type)).all()
    by_sev = db.execute(select(Notification.severity, func.count()).group_by(Notification.severity)).all()
    unread = db.execute(select(func.count(Notification.id))
                        .where(Notification.read_at.is_(None))).scalar() or 0
    total = db.execute(select(func.count(Notification.id))).scalar() or 0
    emails = db.execute(select(func.count(Notification.id))
                        .where(Notification.email_sent.is_(True))).scalar() or 0
    return {"total": total, "unread": unread, "emails_sent": emails,
            "by_type": {k: v for k, v in by_type}, "by_severity": {k: v for k, v in by_sev}}


@router.post("/admin/run-expiry-reminders")
def run_reminders(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    return {**service.send_expiry_reminders(db), **service.process_expired_shares(db)}
