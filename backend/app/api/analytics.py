from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models import User
from app.services import analytics_service

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/files")
def file_analytics(start: date | None = None, end: date | None = None, user: User = Depends(get_current_user),
                   db: Session = Depends(get_db)):
    """Storage, uploads, downloads and sharing analytics for the signed-in user's own files."""
    return analytics_service.file_overview(db, user.id, start, end)
