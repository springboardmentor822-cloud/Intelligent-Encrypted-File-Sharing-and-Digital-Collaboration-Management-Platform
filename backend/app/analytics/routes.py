from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import parse_range, require_admin
from ..models import User
from . import service

router = APIRouter(prefix="/api/analytics", tags=["storage-analytics"])


@router.get("/storage")
def storage(start: str | None = None, end: str | None = None, user_id: str | None = None,
            file_type: str | None = None, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    s, e = parse_range(start, end, default_days=90)
    return service.storage(db, start=s, end=e, user_id=user_id, file_type=file_type)


@router.get("/users/storage")
def users_storage(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    return service.users_storage(db)


@router.get("/files")
def files(start: str | None = None, end: str | None = None, user_id: str | None = None,
          file_type: str | None = None, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    s, e = parse_range(start, end, default_days=90)
    return service.files(db, start=s, end=e, user_id=user_id, file_type=file_type)


@router.get("/downloads")
def downloads(start: str | None = None, end: str | None = None, user_id: str | None = None,
              db: Session = Depends(get_db), _: User = Depends(require_admin)):
    s, e = parse_range(start, end, default_days=30)
    return service.downloads(db, start=s, end=e, user_id=user_id)


@router.get("/sharing")
def sharing(start: str | None = None, end: str | None = None, user_id: str | None = None,
            db: Session = Depends(get_db), _: User = Depends(require_admin)):
    s, e = parse_range(start, end, default_days=30)
    return service.sharing(db, start=s, end=e, user_id=user_id)
