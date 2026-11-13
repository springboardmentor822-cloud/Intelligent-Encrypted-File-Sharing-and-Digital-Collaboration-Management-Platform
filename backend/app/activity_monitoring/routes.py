from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import current_user, parse_range, require_admin
from ..models import User
from . import service

router = APIRouter(prefix="/api/activity", tags=["activity-monitoring"])
me_router = APIRouter(prefix="/api/activity", tags=["activity-monitoring"])


@router.get("/all")
def list_activity(user_id: str | None = None, activity_type: str | None = None, status: str | None = None,
                  file_id: str | None = None, start: str | None = None, end: str | None = None,
                  q: str | None = None, page: int = Query(1, ge=1), page_size: int = Query(50, ge=1, le=200),
                  db: Session = Depends(get_db), _: User = Depends(require_admin)):
    s, e = parse_range(start, end, default_days=30)
    return service.query(db, user_id=user_id, activity_type=activity_type, status=status, file_id=file_id,
                         start=s, end=e, q=q, page=page, page_size=page_size)


@router.get("/summary")
def activity_summary(start: str | None = None, end: str | None = None, user_id: str | None = None,
                     db: Session = Depends(get_db), _: User = Depends(require_admin)):
    s, e = parse_range(start, end, default_days=30)
    return service.summary(db, start=s, end=e, owner_id=user_id)


@router.get("/types")
def activity_types(_: User = Depends(require_admin)):
    return {"types": service.ACTIVITY_TYPES}


@me_router.get("/me")
def my_activity(activity_type: str | None = None, status: str | None = None, start: str | None = None,
                end: str | None = None, page: int = Query(1, ge=1), page_size: int = Query(50, ge=1, le=200),
                db: Session = Depends(get_db), user: User = Depends(current_user)):
    s, e = parse_range(start, end, default_days=30)
    return service.query(db, owner_id=user.id, activity_type=activity_type, status=status, start=s, end=e,
                         page=page, page_size=page_size)
