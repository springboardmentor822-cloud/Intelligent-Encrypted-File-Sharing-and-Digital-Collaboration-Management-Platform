"""Task 3 (admin side): notification management and broadcasts."""
import uuid
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_admin
from app.core.request import RequestInfo, get_request_info
from app.models import Notification, User
from app.services import audit_service as audit
from app.services import notification_service

router = APIRouter(prefix="/admin/notifications", tags=["notification management"], dependencies=[Depends(get_admin)])


@router.get("")
def list_all(page: int = 1, page_size: int = 25, type: str | None = None, read: bool | None = None,
             user_id: uuid.UUID | None = None, db: Session = Depends(get_db)):
    page, page_size = max(page, 1), min(max(page_size, 1), 100)
    conds = []
    if type:
        conds.append(Notification.type == type)
    if read is not None:
        conds.append(Notification.is_read.is_(read))
    if user_id:
        conds.append(Notification.user_id == user_id)
    total = db.scalar(select(func.count()).select_from(Notification).where(*conds)) or 0
    rows = db.execute(select(Notification, User.full_name, User.email).join(User, User.id == Notification.user_id)
                      .where(*conds).order_by(Notification.created_at.desc())
                      .offset((page - 1) * page_size).limit(page_size)).all()
    by_type = dict(db.execute(select(Notification.type, func.count()).group_by(Notification.type)).all())
    unread = db.scalar(select(func.count()).select_from(Notification).where(Notification.is_read.is_(False))) or 0
    return {
        "items": [{"id": n.id, "type": n.type, "title": n.title, "message": n.message, "is_read": n.is_read,
                   "created_at": n.created_at, "user_name": name, "user_email": email} for n, name, email in rows],
        "total": total, "page": page, "page_size": page_size,
        "stats": {"by_type": by_type, "unread": unread, "total": sum(by_type.values())},
    }


class Broadcast(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    message: str = Field(min_length=1, max_length=2000)
    audience: Literal["all", "admin", "user", "guest"] = "all"
    send_email: bool = False


@router.post("/broadcast", status_code=201)
def broadcast(body: Broadcast, admin: User = Depends(get_admin), db: Session = Depends(get_db),
              info: RequestInfo = Depends(get_request_info)):
    stmt = select(User).where(User.is_active.is_(True))
    if body.audience != "all":
        stmt = stmt.where(User.role == body.audience)
    users = db.scalars(stmt).all()
    for u in users:
        notification_service.notify(db, u.id, "system", body.title, body.message,
                                    email_to=u.email if body.send_email else None)
    db.commit()
    audit.log_audit("notification.broadcast", admin, "notification", None, info,
                    {"name": body.title, "audience": body.audience, "recipients": len(users)})
    return {"recipients": len(users)}
