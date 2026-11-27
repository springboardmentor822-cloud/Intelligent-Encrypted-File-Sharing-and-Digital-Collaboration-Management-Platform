"""Task 6: suspicious-activity detection, security alerts and the Security Monitoring interface."""
import re
import uuid
from datetime import date

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_admin
from app.core.mongo import get_mongo
from app.core.request import RequestInfo, get_request_info
from app.models import User
from app.services import analytics_service
from app.services import audit_service as audit
from app.services import detection_rules

router = APIRouter(prefix="/security-monitoring", tags=["security monitoring"], dependencies=[Depends(get_admin)])


def _range(start: date | None, end: date | None) -> dict:
    s, e = analytics_service.parse_range(start, end)
    lo, hi = analytics_service._bounds(s, e)
    return {"ts": {"$gte": lo, "$lt": hi}}


def _view(d: dict) -> dict:
    return {
        "id": str(d["_id"]), "alert_id": d.get("alert_id") or str(d["_id"]), "ts": d["ts"], "title": d.get("title"),
        "category": d.get("category"), "severity": d.get("severity"), "status": d.get("status") or "open",
        "details": d.get("details", ""), "ip": d.get("ip"), "user_id": d.get("user_id"), "user_email": d.get("user_email"),
    }


@router.get("/summary")
def summary(start: date | None = None, end: date | None = None):
    mdb = get_mongo()
    rng = _range(start, end)
    ev = mdb.security_events
    open_filter = {"$or": [{"status": "open"}, {"status": {"$exists": False}}]}

    def count_title(rx: str) -> int:
        return ev.count_documents({**rng, "title": {"$regex": rx, "$options": "i"}})

    return {
        "metrics": {
            "total_events": ev.count_documents(rng),
            "failed_logins": mdb.login_events.count_documents({**rng, "status": "failed"}),
            "unauthorized_attempts": mdb.access_attempts.count_documents({**rng, "kind": "unauthorized"}),
            "suspicious_downloads": count_title("download"),
            "expired_link_attempts": mdb.access_attempts.count_documents({**rng, "reason": "share link expired"}),
            "revoked_link_attempts": mdb.access_attempts.count_documents({**rng, "reason": "share link revoked"}),
            "open_alerts": ev.count_documents({"$and": [rng, open_filter]}),
        },
        "recent_alerts": [_view(d) for d in ev.find().sort("ts", -1).limit(8)],
    }


@router.get("/rules")
def detection_rules_table():
    """The detection rules currently in force (thresholds are configurable through environment variables)."""
    return {"rules": detection_rules.rules_table(settings.login_max_failures, settings.login_lock_minutes,
                                                 settings.download_anomaly_threshold),
            "configurable_with": ["LOGIN_MAX_FAILURES", "LOGIN_LOCK_MINUTES", "DOWNLOAD_ANOMALY_THRESHOLD",
                                  "DETECT_UNAUTHORIZED_MAX", "DETECT_LINK_ATTEMPTS_MAX", "DETECT_WINDOW_SECONDS"]}


@router.get("/events")
def events(page: int = 1, page_size: int = 25, user: str | None = None, event_type: str | None = None,
           severity: str | None = None, status: str | None = None, q: str | None = None,
           start: date | None = None, end: date | None = None):
    page, page_size = max(page, 1), min(max(page_size, 1), 200)
    conds: list[dict] = [_range(start, end)]
    if user:
        rx = {"$regex": re.escape(user[:80]), "$options": "i"}
        conds.append({"$or": [{"user_email": rx}, {"user_id": user[:64]}]})
    if event_type in audit.EVENT_CATEGORIES:
        conds.append({"category": event_type})
    if severity in audit.SEVERITIES:
        conds.append({"severity": severity})
    if status == "open":
        conds.append({"$or": [{"status": "open"}, {"status": {"$exists": False}}]})
    elif status in audit.EVENT_STATUSES:
        conds.append({"status": status})
    if q:
        rx = {"$regex": re.escape(q[:80]), "$options": "i"}
        conds.append({"$or": [{"title": rx}, {"details": rx}, {"ip": rx}]})
    coll = get_mongo().security_events
    flt = {"$and": conds}
    return {"items": [_view(d) for d in coll.find(flt).sort("ts", -1).skip((page - 1) * page_size).limit(page_size)],
            "total": coll.count_documents(flt), "page": page, "page_size": page_size}


class StatusIn(BaseModel):
    status: str


@router.patch("/events/{event_id}")
def update_event_status(event_id: str, body: StatusIn, admin: User = Depends(get_admin),
                        info: RequestInfo = Depends(get_request_info)):
    if body.status not in audit.EVENT_STATUSES:
        raise HTTPException(400, "Status must be open, investigating or resolved.")
    try:
        oid = ObjectId(event_id)
    except (InvalidId, TypeError):
        raise HTTPException(404, "Event not found") from None
    res = get_mongo().security_events.find_one_and_update({"_id": oid}, {"$set": {"status": body.status}}, return_document=True)
    if not res:
        raise HTTPException(404, "Event not found")
    audit.log_audit("security.event_status", admin, "security_event", event_id, info,
                    {"status": body.status, "name": res.get("title")})
    return _view(res)
