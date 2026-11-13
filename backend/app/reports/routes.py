from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import parse_range, require_admin
from ..models import User
from . import service

router = APIRouter(prefix="/api/reports", tags=["reports"])


@router.get("/uploads")
def uploads(start: str | None = None, end: str | None = None, user_id: str | None = None,
            file_id: str | None = None, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    s, e = parse_range(start, end, default_days=30)
    return service.uploads(db, start=s, end=e, user_id=user_id, file_id=file_id)


@router.get("/downloads")
def downloads(start: str | None = None, end: str | None = None, user_id: str | None = None,
              file_id: str | None = None, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    s, e = parse_range(start, end, default_days=30)
    return service.downloads(db, start=s, end=e, user_id=user_id, file_id=file_id)


@router.get("/sharing")
def sharing(start: str | None = None, end: str | None = None, user_id: str | None = None,
            file_id: str | None = None, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    s, e = parse_range(start, end, default_days=30)
    return service.sharing(db, start=s, end=e, user_id=user_id, file_id=file_id)


@router.get("/users")
def users(start: str | None = None, end: str | None = None, user_id: str | None = None,
          db: Session = Depends(get_db), _: User = Depends(require_admin)):
    s, e = parse_range(start, end, default_days=30)
    return service.users(db, start=s, end=e, user_id=user_id)


@router.get("/security")
def security(start: str | None = None, end: str | None = None, db: Session = Depends(get_db),
             _: User = Depends(require_admin)):
    s, e = parse_range(start, end, default_days=30)
    return service.security(db, start=s, end=e)
