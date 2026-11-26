from datetime import date as Date, datetime, time, timedelta, timezone
import re

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, text
from sqlalchemy.orm import Session

from app.activity import ACTIVITY_COLLECTION, list_audit_history
from app.auth import (
    ROLE_SUPER_ADMIN,
    get_db,
    require_roles,
)
from app.database import mongo_client, mongo_db, mysql_engine, redis_client
from app.models import FileShare, Folder, FolderShare, StoredFile, User


router = APIRouter(
    prefix="/admin",
    tags=["Super Admin"],
    dependencies=[Depends(require_roles(ROLE_SUPER_ADMIN))],
)


def serialize_activity(event: dict) -> dict:
    """Return safe activity fields without exposing internal credentials."""
    return {
        "event_type": event.get("event_type"),
        "user_id": event.get("user_id"),
        "target_email": event.get("target_email"),
        "provider": event.get("provider"),
        "file_id": event.get("file_id"),
        "created_at": event.get("created_at"),
        "ip_address": event.get("ip_address"),
        "details": event.get("details"),
        "severity": event.get("severity"),
    }


@router.get("/overview")
def get_admin_overview(db: Session = Depends(get_db)):
    now = datetime.now(timezone.utc)
    since = now - timedelta(hours=24)

    total_users = db.query(func.count(User.id)).scalar() or 0
    total_files = db.query(func.count(StoredFile.id)).scalar() or 0
    total_storage = (
        db.query(func.coalesce(func.sum(StoredFile.size_bytes), 0)).scalar()
        or 0
    )

    failed_logins_24h = mongo_db[ACTIVITY_COLLECTION].count_documents({
        "event_type": "login_failed",
        "created_at": {"$gte": since},
    })

    return {
        "total_users": total_users,
        "total_files": total_files,
        "total_storage_bytes": int(total_storage),
        "failed_logins_last_24_hours": failed_logins_24h,
    }


@router.get("/security-dashboard")
def get_security_dashboard(
    days: int = Query(default=30, ge=7, le=365),
    start_date: Date | None = Query(default=None),
    end_date: Date | None = Query(default=None),
    db: Session = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    if start_date or end_date:
        last_day = end_date or now.date()
        first_day = start_date or last_day - timedelta(days=days - 1)
        if first_day > last_day:
            raise HTTPException(status_code=422, detail="start_date must be on or before end_date.")
        if (last_day - first_day).days >= 365:
            raise HTTPException(status_code=422, detail="Security date ranges cannot exceed 365 days.")
        since = datetime.combine(first_day, time.min, tzinfo=timezone.utc)
        until = datetime.combine(last_day + timedelta(days=1), time.min, tzinfo=timezone.utc)
    else:
        until = now
        since = now - timedelta(days=days)
    duration = until - since
    previous_since = since - duration
    security_types = ["login_failed", "unauthorized_access", "login_blocked"]
    tracked_types = ["login_success", *security_types]
    collection = mongo_db[ACTIVITY_COLLECTION]
    current_filter = {"created_at": {"$gte": since, "$lt": until}, "event_type": {"$in": tracked_types}}
    previous_filter = {"created_at": {"$gte": previous_since, "$lt": since}, "event_type": {"$in": tracked_types}}

    counts = {
        "successful_logins": collection.count_documents({**current_filter, "event_type": "login_success"}),
        "failed_logins": collection.count_documents({**current_filter, "event_type": "login_failed"}),
        "unauthorized_access_attempts": collection.count_documents({**current_filter, "event_type": "unauthorized_access"}),
        "blocked_attempts": collection.count_documents({**current_filter, "event_type": "login_blocked"}),
    }
    previous_counts = {
        "successful_logins": collection.count_documents({**previous_filter, "event_type": "login_success"}),
        "failed_logins": collection.count_documents({**previous_filter, "event_type": "login_failed"}),
        "unauthorized_access_attempts": collection.count_documents({**previous_filter, "event_type": "unauthorized_access"}),
        "blocked_attempts": collection.count_documents({**previous_filter, "event_type": "login_blocked"}),
    }
    counts["login_attempts"] = counts["successful_logins"] + counts["failed_logins"] + counts["blocked_attempts"]
    counts["security_events"] = counts["failed_logins"] + counts["unauthorized_access_attempts"] + counts["blocked_attempts"]
    previous_counts["login_attempts"] = previous_counts["successful_logins"] + previous_counts["failed_logins"] + previous_counts["blocked_attempts"]
    previous_counts["security_events"] = previous_counts["failed_logins"] + previous_counts["unauthorized_access_attempts"] + previous_counts["blocked_attempts"]

    daily = {}
    cursor_day = since.date()
    last_chart_day = (until - timedelta(microseconds=1)).date()
    while cursor_day <= last_chart_day:
        day = cursor_day.isoformat()
        daily[day] = {"date": day, "successful_logins": 0, "failed_logins": 0, "unauthorized_access": 0, "blocked_attempts": 0}
        cursor_day += timedelta(days=1)
    pipeline = [
        {"$match": current_filter},
        {"$group": {"_id": {"day": {"$dateToString": {"format": "%Y-%m-%d", "date": "$created_at", "timezone": "UTC"}}, "event_type": "$event_type"}, "count": {"$sum": 1}}},
    ]
    key_by_type = {"login_success": "successful_logins", "login_failed": "failed_logins", "unauthorized_access": "unauthorized_access", "login_blocked": "blocked_attempts"}
    for group in collection.aggregate(pipeline):
        day = group.get("_id", {}).get("day")
        key = key_by_type.get(group.get("_id", {}).get("event_type"))
        if day in daily and key:
            daily[day][key] = group.get("count", 0)

    recent_logins = list(collection.find({"created_at": {"$gte": since, "$lt": until}, "event_type": {"$in": ["login_success", "login_failed", "login_blocked"]}}, {"_id": 0}).sort("created_at", -1).limit(20))
    recent_security = list(collection.find({"created_at": {"$gte": since, "$lt": until}, "event_type": {"$in": security_types}}, {"_id": 0}).sort("created_at", -1).limit(20))
    user_ids = {event.get("user_id") for event in [*recent_logins, *recent_security] if event.get("user_id") is not None}
    emails = {user.id: user.email for user in (db.query(User).filter(User.id.in_(user_ids)).all() if user_ids else [])}
    for event in [*recent_logins, *recent_security]:
        event["account_email"] = event.get("target_email") or emails.get(event.get("user_id"))

    def percentage_change(current, previous):
        return round(((current - previous) / previous) * 100, 1) if previous else None

    return {
        "period_days": days,
        "start_date": since,
        "end_date": until - timedelta(microseconds=1),
        "summary": counts,
        "previous_period_summary": previous_counts,
        "summary_change_percent": {key: percentage_change(value, previous_counts[key]) for key, value in counts.items()},
        "daily": list(daily.values()),
        "recent_logins": [{**serialize_activity(event), "account_email": event.get("account_email")} for event in recent_logins],
        "recent_security_events": [{**serialize_activity(event), "account_email": event.get("account_email")} for event in recent_security],
    }


@router.get("/users")
def list_platform_users(
    search: str | None = Query(default=None, max_length=255),
    role: str | None = Query(default=None, max_length=20),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    query = db.query(User)

    if search:
        term = f"%{search.strip()}%"
        query = query.filter(or_(User.email.ilike(term), User.full_name.ilike(term)))

    if role:
        query = query.filter(User.role == role)

    total = query.count()
    users = (
        query.order_by(User.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    user_ids = [user.id for user in users]
    storage_by_user = {}

    if user_ids:
        storage_rows = (
            db.query(
                StoredFile.owner_id,
                func.coalesce(func.sum(StoredFile.size_bytes), 0),
            )
            .filter(StoredFile.owner_id.in_(user_ids))
            .group_by(StoredFile.owner_id)
            .all()
        )
        storage_by_user = {
            owner_id: int(size_bytes)
            for owner_id, size_bytes in storage_rows
        }

    return {
        "users": [
            {
                "id": user.id,
                "full_name": user.full_name,
                "email": user.email,
                "role": user.role,
                "auth_provider": user.auth_provider,
                "created_at": user.created_at,
                "storage_used_bytes": storage_by_user.get(user.id, 0),
            }
            for user in users
        ],
        "limit": limit,
        "offset": offset,
        "total": total,
    }


@router.get("/security-alerts")
def list_security_alerts(
    limit: int = Query(default=100, ge=1, le=500),
):
    events = list(
        mongo_db[ACTIVITY_COLLECTION]
        .find({"event_type": "login_failed"}, {"_id": 0})
        .sort("created_at", -1)
        .limit(limit)
    )

    return {
        "alerts": [serialize_activity(event) for event in events],
        "count": len(events),
    }



@router.get("/audit-logs")
def list_audit_logs(
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    event_type: str | None = Query(default=None, max_length=100),
    user_id: int | None = None,
    file_id: int | None = None,
    status: str | None = None,
    start_date: Date | None = None,
    end_date: Date | None = None,
    search: str | None = Query(default=None, max_length=255),
):
    events = list_audit_history(
        user_id=user_id,
        file_id=file_id,
        activity_type=event_type,
        status=status,
        start_date=start_date,
        end_date=end_date,
        search=search,
        limit=limit,
        offset=offset,
    )
    return {
        "events": events,
        "logs": events,
        "count": len(events),
        "limit": limit,
        "offset": offset,
    }

@router.get("/file-analytics")
def get_file_analytics(
    db: Session = Depends(get_db),
    user_id: int | None = None,
    start_date: Date | None = None,
    end_date: Date | None = None,
    activity_type: str | None = None,
    status: str | None = None,
):
    total_files = db.query(func.count(StoredFile.id)).scalar() or 0

    total_storage = (
        db.query(func.coalesce(func.sum(StoredFile.size_bytes), 0)).scalar()
        or 0
    )

    event_filter = {}
    if user_id is not None:
        event_filter["user_id"] = user_id
    if status:
        event_filter["status"] = status
    if start_date or end_date:
        first = start_date or end_date
        last = end_date or start_date
        if first > last:
            raise HTTPException(status_code=422, detail="start_date must be on or before end_date.")
        event_filter["created_at"] = {
            "$gte": datetime.combine(first, time.min, tzinfo=timezone.utc),
            "$lt": datetime.combine(last + timedelta(days=1), time.min, tzinfo=timezone.utc),
        }
    activity = mongo_db[ACTIVITY_COLLECTION]
    def event_count(event_type):
        if activity_type and activity_type != event_type:
            return 0
        return activity.count_documents({**event_filter, "event_type": event_type})
    uploads = event_count("file_upload_success")
    downloads = event_count("file_download_success")
    deletions = event_count("file_delete_success")

    return {
        "current_file_count": total_files,
        "current_storage_bytes": int(total_storage),
        "recorded_upload_events": uploads,
        "recorded_download_events": downloads,
        "recorded_delete_events": deletions,
    }


@router.get("/files")
def list_platform_files(
    search: str | None = Query(default=None, max_length=255),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    query = db.query(StoredFile, User).join(User, StoredFile.owner_id == User.id)
    if search:
        term = f"%{search.strip()}%"
        query = query.filter(or_(StoredFile.original_name.ilike(term), User.email.ilike(term), User.full_name.ilike(term)))
    total = query.count()
    rows = query.order_by(StoredFile.created_at.desc()).offset(offset).limit(limit).all()
    return {"files": [{
        "id": file.id, "name": file.original_name, "content_type": file.content_type,
        "size_bytes": int(file.size_bytes or 0), "owner_id": owner.id,
        "owner_name": owner.full_name, "owner_email": owner.email,
        "folder_id": file.folder_id, "created_at": file.created_at,
    } for file, owner in rows], "limit": limit, "offset": offset, "total": total}


@router.get("/sharing-reports")
def get_sharing_reports(
    search: str | None = Query(default=None, max_length=255),
    status: str | None = Query(default=None, max_length=20),
    owner_id: int | None = None,
    kind: str | None = None,
    start_date: Date | None = None,
    end_date: Date | None = None,
    limit: int = Query(default=200, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    rows = []
    file_query = db.query(FileShare, StoredFile, User).join(StoredFile, FileShare.file_id == StoredFile.id).join(User, FileShare.owner_id == User.id)
    folder_query = db.query(FolderShare, Folder, User).join(Folder, FolderShare.folder_id == Folder.id).join(User, FolderShare.owner_id == User.id)
    if owner_id is not None:
        file_query = file_query.filter(FileShare.owner_id == owner_id)
        folder_query = folder_query.filter(FolderShare.owner_id == owner_id)
    if start_date or end_date:
        first = start_date or end_date
        last = end_date or start_date
        if first > last:
            raise HTTPException(status_code=422, detail="start_date must be on or before end_date.")
        since = datetime.combine(first, time.min)
        until = datetime.combine(last + timedelta(days=1), time.min)
        file_query = file_query.filter(FileShare.created_at >= since, FileShare.created_at < until)
        folder_query = folder_query.filter(FolderShare.created_at >= since, FolderShare.created_at < until)
    if kind == "file":
        folder_query = folder_query.filter(False)
    elif kind == "folder":
        file_query = file_query.filter(False)
    if search:
        term = f"%{search.strip()}%"
        file_query = file_query.filter(or_(StoredFile.original_name.ilike(term), User.email.ilike(term), FileShare.recipient_email.ilike(term)))
        folder_query = folder_query.filter(or_(Folder.name.ilike(term), User.email.ilike(term), FolderShare.recipient_email.ilike(term)))
    for share, file, owner in file_query.all():
        expiry = getattr(share, "expires_at", None)
        if share.revoked:
            share_status = "revoked"
        elif expiry is not None and (expiry.replace(tzinfo=timezone.utc) if expiry.tzinfo is None else expiry) <= now:
            share_status = "expired"
        else:
            share_status = "active"
        if status and status != share_status:
            continue
        rows.append({"id": share.id, "kind": "file", "resource_name": file.original_name, "owner_id": owner.id, "owner_name": owner.full_name, "owner_email": owner.email, "recipient_email": share.recipient_email, "permission": share.permission, "status": share_status, "email_status": share.email_status, "created_at": share.created_at, "expires_at": getattr(share, "expires_at", None)})
    for share, folder, owner in folder_query.all():
        expired = False
        if share.expires_at is not None:
            expiration = share.expires_at.replace(tzinfo=timezone.utc) if share.expires_at.tzinfo is None else share.expires_at
            expired = expiration <= now
        share_status = "revoked" if share.revoked else "expired" if expired else "active"
        if status and status != share_status:
            continue
        rows.append({"id": share.id, "kind": "folder", "resource_name": folder.name, "owner_id": owner.id, "owner_name": owner.full_name, "owner_email": owner.email, "recipient_email": share.recipient_email, "permission": share.permission, "status": share_status, "email_status": getattr(share, "email_status", None), "email_attempt_count": getattr(share, "email_attempt_count", None), "email_attempted_at": getattr(share, "email_attempted_at", None), "email_sent_at": getattr(share, "email_sent_at", None), "email_error_category": getattr(share, "email_error_category", None), "created_at": share.created_at, "expires_at": share.expires_at})
    rows.sort(key=lambda row: row["created_at"], reverse=True)
    total = len(rows)
    return {"shares": rows[offset:offset + limit], "total": total, "limit": limit, "offset": offset}


@router.get("/system-health")
def get_system_health():
    checked_at = datetime.now(timezone.utc)
    services = {}
    try:
        with mysql_engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        services["mysql"] = "healthy"
    except Exception:
        services["mysql"] = "unavailable"
    try:
        mongo_client.admin.command("ping")
        services["mongodb"] = "healthy"
    except Exception:
        services["mongodb"] = "unavailable"
    try:
        redis_client.ping()
        services["redis"] = "healthy"
    except Exception:
        services["redis"] = "unavailable"
    return {"checked_at": checked_at, "services": services}
