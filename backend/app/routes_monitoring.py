from datetime import date, datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, func
from sqlalchemy.orm import Session

from app.activity import (
    ACTIVITY_COLLECTION,
    NOTIFICATION_COLLECTION,
    SECURITY_COLLECTION,
    list_audit_history,
    mongo_db,
)
from app.auth import ROLE_ADMIN, ROLE_SUPER_ADMIN, get_current_user, get_db, require_roles
from app.models import FileShare, FolderShare, StoredFile, User


router = APIRouter(tags=["Monitoring"])


def _date_filter(start_date: str | None, end_date: str | None) -> dict[str, Any]:
    result: dict[str, Any] = {}
    try:
        if start_date:
            result["$gte"] = datetime.fromisoformat(start_date).replace(tzinfo=timezone.utc)
        if end_date:
            result["$lt"] = datetime.fromisoformat(end_date).replace(tzinfo=timezone.utc) + timedelta(days=1)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="Dates must use ISO format (YYYY-MM-DD).") from exc
    if "$gte" in result and "$lt" in result and result["$gte"] >= result["$lt"]:
        raise HTTPException(status_code=422, detail="start_date must be on or before end_date.")
    return {"created_at": result} if result else {}


def _sql_date_bounds(start_date: str | None, end_date: str | None):
    try:
        start = date.fromisoformat(start_date) if start_date else None
        end = date.fromisoformat(end_date) if end_date else None
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="Dates must use ISO format (YYYY-MM-DD).") from exc
    if start and end and start > end:
        raise HTTPException(status_code=422, detail="start_date must be on or before end_date.")
    if start is None and end is None:
        return None, None
    since = datetime.combine(start, datetime.min.time()) if start else None
    until = datetime.combine(end + timedelta(days=1), datetime.min.time()) if end else None
    return since, until


def _file_type_ids(db: Session, file_type: str | None):
    if not file_type:
        return None
    return [row[0] for row in db.query(StoredFile.id).filter(StoredFile.content_type == file_type).all()]


def _download_report(start_date: str | None, end_date: str | None, user_id: int | None, file_type: str | None, db: Session):
    query = {"event_type": {"$in": ["file_download_success", "file_download_failed"]}, **_date_filter(start_date, end_date)}
    if user_id is not None:
        query["user_id"] = user_id
    if file_type:
        ids = _file_type_ids(db, file_type)
        query["file_id"] = {"$in": ids}
    activity = mongo_db[ACTIVITY_COLLECTION]
    successful_query = {**query, "event_type": "file_download_success"}
    failed_query = {**query, "event_type": "file_download_failed"}
    groups = list(activity.aggregate([
        {"$match": successful_query},
        {"$group": {"_id": "$file_id", "downloads": {"$sum": 1}}},
        {"$sort": {"downloads": -1}},
        {"$limit": 20},
    ]))
    ids = [row.get("_id") for row in groups if isinstance(row.get("_id"), int)]
    files = db.query(StoredFile).filter(StoredFile.id.in_(ids)).all() if ids else []
    names = {row.id: row.original_name for row in files}
    return {
        "total_downloads": int(activity.count_documents(successful_query) or 0),
        "failed_downloads": int(activity.count_documents(failed_query) or 0),
        "files": [
            {
                "file_id": row.get("_id"),
                "_id": row.get("_id"),
                "file_name": names.get(
                    row.get("_id"),
                    f"File record unavailable (ID: {row.get('_id')})",
                ),
                "downloads": int(row.get("downloads", 0) or 0),
            }
            for row in groups if isinstance(row.get("_id"), int)
        ],
    }


@router.get("/notifications")
def list_notifications(
    current_user: User = Depends(get_current_user),
    unread_only: bool = False,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    query = {"user_id": current_user.id}
    total = mongo_db[NOTIFICATION_COLLECTION].count_documents(query)
    page_query = dict(query)
    if unread_only:
        page_query["read"] = False
        total = mongo_db[NOTIFICATION_COLLECTION].count_documents(page_query)
    rows = list(mongo_db[NOTIFICATION_COLLECTION].find(page_query, {"_id": 0}).sort("created_at", -1).skip(offset).limit(limit))
    unread = mongo_db[NOTIFICATION_COLLECTION].count_documents({"user_id": current_user.id, "read": False})
    return {"notifications": rows, "unread_count": unread, "total": total, "offset": offset, "limit": limit}


@router.post("/notifications/{notification_id}/read")
def mark_notification_read(notification_id: str, current_user: User = Depends(get_current_user)):
    result = mongo_db[NOTIFICATION_COLLECTION].update_one(
        {"notification_id": notification_id, "user_id": current_user.id}, {"$set": {"read": True}}
    )
    if not result.matched_count:
        raise HTTPException(status_code=404, detail="Notification not found.")
    return {"status": "read"}


@router.post("/notifications/read-all")
def mark_all_notifications_read(current_user: User = Depends(get_current_user)):
    result = mongo_db[NOTIFICATION_COLLECTION].update_many(
        {"user_id": current_user.id, "read": False},
        {"$set": {"read": True}},
    )
    return {"status": "read", "updated": result.modified_count}


admin_dependency = Depends(require_roles(ROLE_ADMIN, ROLE_SUPER_ADMIN))


@router.get("/admin/notifications", dependencies=[admin_dependency])
def admin_notifications(
    user_id: int | None = None,
    read: bool | None = None,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    """List persisted notifications for administrators with optional filters."""
    query: dict[str, Any] = {}
    if user_id is not None:
        query["user_id"] = user_id
    if read is not None:
        query["read"] = read
    collection = mongo_db[NOTIFICATION_COLLECTION]
    rows = list(
        collection.find(query, {"_id": 0})
        .sort("created_at", -1)
        .skip(offset)
        .limit(limit)
    )
    unread_query = dict(query)
    unread_query["read"] = False
    return {
        "notifications": rows,
        "unread_count": collection.count_documents(unread_query),
        "total": collection.count_documents(query),
        "offset": offset,
        "limit": limit,
    }


@router.get("/audit-logs", dependencies=[admin_dependency])
def audit_logs(
    user_id: int | None = None,
    file_id: int | None = None,
    activity_type: str | None = None,
    event_type: str | None = None,
    status: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    search: str | None = Query(default=None, max_length=255),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    rows = list_audit_history(
        user_id=user_id,
        file_id=file_id,
        activity_type=activity_type or event_type,
        status=status,
        start_date=start_date,
        end_date=end_date,
        search=search,
        limit=limit,
        offset=offset,
    )
    return {"events": rows, "logs": rows, "count": len(rows), "limit": limit, "offset": offset}


@router.get("/audit-logs/user/{user_id}", dependencies=[admin_dependency])
def audit_logs_by_user(user_id: int, limit: int = Query(100, ge=1, le=500)):
    return audit_logs(user_id=user_id, limit=limit, search=None)


@router.get("/audit-logs/file/{file_id}", dependencies=[admin_dependency])
def audit_logs_by_file(file_id: int, limit: int = Query(100, ge=1, le=500)):
    return audit_logs(file_id=file_id, limit=limit, search=None)


@router.get("/audit-logs/filter", dependencies=[admin_dependency])
def filter_audit_logs(
    activity_type: str | None = None,
    status: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    limit: int = Query(100, ge=1, le=500),
):
    return audit_logs(activity_type=activity_type, status=status, start_date=start_date, end_date=end_date, search=None, limit=limit)


@router.get("/security-events", dependencies=[admin_dependency])
def security_events(
    severity: str | None = None,
    status: str | None = None,
    event_type: str | None = None,
    user_id: int | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    limit: int = Query(100, ge=1, le=500),
):
    query = {
        key: value
        for key, value in (("severity", severity), ("status", status), ("event_type", event_type), ("user_id", user_id))
        if value is not None
    }
    date_filter = _date_filter(start_date, end_date)
    if date_filter:
        timestamp_filter = date_filter["created_at"]
        query["timestamp"] = timestamp_filter
    rows = list(mongo_db[SECURITY_COLLECTION].find(query, {"_id": 0}).sort("timestamp", -1).limit(limit))
    return {"events": rows, "count": len(rows)}


@router.get("/analytics/storage", dependencies=[admin_dependency])
def storage_analytics(
    db: Session = Depends(get_db),
    start_date: str | None = None,
    end_date: str | None = None,
    user_id: int | None = None,
    file_type: str | None = None,
):
    since, until = _sql_date_bounds(start_date, end_date)
    filters = []
    if since:
        filters.append(StoredFile.created_at >= since)
    if until:
        filters.append(StoredFile.created_at < until)
    if user_id is not None:
        filters.append(StoredFile.owner_id == user_id)
    if file_type:
        filters.append(StoredFile.content_type == file_type)
    files_query = db.query(StoredFile)
    if filters:
        files_query = files_query.filter(*filters)
    total_files = files_query.with_entities(func.count(StoredFile.id)).scalar() or 0
    total_storage = files_query.with_entities(func.coalesce(func.sum(StoredFile.size_bytes), 0)).scalar() or 0
    user_join = [StoredFile.owner_id == User.id]
    if since:
        user_join.append(StoredFile.created_at >= since)
    if until:
        user_join.append(StoredFile.created_at < until)
    if file_type:
        user_join.append(StoredFile.content_type == file_type)
    user_query = db.query(User.id, User.email, func.coalesce(func.sum(StoredFile.size_bytes), 0)).outerjoin(
        StoredFile, and_(*user_join)
    )
    if user_id is not None:
        user_query = user_query.filter(User.id == user_id)
    users = user_query.group_by(User.id, User.email).all()
    download_data = _download_report(start_date, end_date, user_id, file_type, db)
    share_query = db.query(func.count(func.distinct(FileShare.file_id))).join(StoredFile, FileShare.file_id == StoredFile.id)
    if user_id is not None:
        share_query = share_query.filter(FileShare.owner_id == user_id)
    if since:
        share_query = share_query.filter(FileShare.created_at >= since)
    if until:
        share_query = share_query.filter(FileShare.created_at < until)
    if file_type:
        share_query = share_query.filter(StoredFile.content_type == file_type)
    total_shared_files = share_query.scalar() or 0
    return {
        "total_storage_bytes": int(total_storage),
        "total_files": int(total_files),
        "total_downloads": download_data["total_downloads"],
        "total_shared_files": int(total_shared_files),
        "top_downloaded_files": download_data["files"],
        "user_storage": [{"user_id": row[0], "email": row[1], "storage_bytes": int(row[2] or 0)} for row in users],
    }


@router.get("/analytics/users/storage", dependencies=[admin_dependency])
def users_storage(
    db: Session = Depends(get_db),
    start_date: str | None = None,
    end_date: str | None = None,
    user_id: int | None = None,
    file_type: str | None = None,
):
    return storage_analytics(db, start_date, end_date, user_id, file_type)


@router.get("/analytics/files", dependencies=[admin_dependency])
def file_analytics(
    db: Session = Depends(get_db),
    user_id: int | None = None,
    file_type: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
):
    since, until = _sql_date_bounds(start_date, end_date)
    query = db.query(
        StoredFile.content_type,
        func.count(StoredFile.id),
        func.coalesce(func.sum(StoredFile.size_bytes), 0),
    )
    if user_id is not None:
        query = query.filter(StoredFile.owner_id == user_id)
    if file_type:
        query = query.filter(StoredFile.content_type == file_type)
    if since:
        query = query.filter(StoredFile.created_at >= since)
    if until:
        query = query.filter(StoredFile.created_at < until)
    rows = query.group_by(StoredFile.content_type).all()
    return {"files": [{"content_type": row[0] or "application/octet-stream", "count": int(row[1]), "size_bytes": int(row[2] or 0)} for row in rows], "total_files": sum(int(row[1] or 0) for row in rows)}


@router.get("/analytics/downloads", dependencies=[admin_dependency])
def download_analytics(
    db: Session = Depends(get_db),
    start_date: str | None = None,
    end_date: str | None = None,
    user_id: int | None = None,
    file_type: str | None = None,
):
    return _download_report(start_date, end_date, user_id, file_type, db)


@router.get("/analytics/sharing", dependencies=[admin_dependency])
def sharing_analytics(
    db: Session = Depends(get_db),
    start_date: str | None = None,
    end_date: str | None = None,
    user_id: int | None = None,
    status: str | None = None,
):
    since, until = _sql_date_bounds(start_date, end_date)
    file_query = db.query(FileShare)
    folder_query = db.query(FolderShare)
    for query, model in ((file_query, FileShare), (folder_query, FolderShare)):
        if user_id is not None:
            query = query.filter(model.owner_id == user_id)
        if since:
            query = query.filter(model.created_at >= since)
        if until:
            query = query.filter(model.created_at < until)
        if status == "revoked":
            query = query.filter(model.revoked.is_(True))
        elif status in {"active", "expired"}:
            query = query.filter(model.revoked.is_(False))
        if model is FileShare:
            file_query = query
        else:
            folder_query = query
    file_rows = file_query.all()
    folder_rows = folder_query.all()
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    shares = [(row, "file") for row in file_rows] + [(row, "folder") for row in folder_rows]
    def share_status(row):
        if row.revoked:
            return "revoked"
        expiry = getattr(row, "expires_at", None)
        if expiry is not None and (expiry.replace(tzinfo=None) if expiry.tzinfo else expiry) <= now:
            return "expired"
        return "active"
    if status:
        shares = [(row, kind) for row, kind in shares if share_status(row) == status]
    file_ids = {row.file_id for row, kind in shares if kind == "file"}
    return {
        "total_shared_files": len(file_ids),
        "total_links": len(shares),
        "active_links": sum(share_status(row) == "active" for row, _kind in shares),
        "expired_links": sum(share_status(row) == "expired" for row, _kind in shares),
        "revoked_links": sum(share_status(row) == "revoked" for row, _kind in shares),
    }
