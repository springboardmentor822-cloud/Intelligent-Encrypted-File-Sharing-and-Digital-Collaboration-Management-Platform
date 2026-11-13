from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import parse_range, require_admin
from ..models import User
from . import detection, service

router = APIRouter(prefix="/api/security-monitoring", tags=["security-monitoring"])


@router.get("/overview")
def overview(start: str | None = None, end: str | None = None, db: Session = Depends(get_db),
             _: User = Depends(require_admin)):
    s, e = parse_range(start, end, default_days=30)
    return service.overview(db, s, e)


@router.get("/rules")
def rules(_: User = Depends(require_admin)):
    return {"rules": detection.rule_config()}


@router.post("/scan")
def scan(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    return detection.scan(db)


@router.get("/events")
def events(user_id: str | None = None, category: str | None = None, severity: str | None = None,
           start: str | None = None, end: str | None = None, page: int = Query(1, ge=1),
           page_size: int = Query(50, ge=1, le=200), db: Session = Depends(get_db),
           _: User = Depends(require_admin)):
    s, e = parse_range(start, end, default_days=30)
    return service.list_events(db, user_id=user_id, category=category, severity=severity, start=s, end=e,
                               page=page, page_size=page_size)


@router.get("/suspicious")
def suspicious(user_id: str | None = None, rule: str | None = None, severity: str | None = None,
               status: str | None = None, start: str | None = None, end: str | None = None,
               page: int = Query(1, ge=1), page_size: int = Query(50, ge=1, le=200),
               db: Session = Depends(get_db), _: User = Depends(require_admin)):
    s, e = parse_range(start, end, default_days=30)
    return service.list_alerts(db, user_id=user_id, rule=rule, severity=severity, status=status, start=s,
                               end=e, page=page, page_size=page_size)


@router.post("/alerts/{alert_id}/acknowledge")
def acknowledge(alert_id: int, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    a = service.acknowledge(db, alert_id, admin.id)
    if not a:
        raise HTTPException(404, "Alert not found")
    return detection.alert_out(a)
