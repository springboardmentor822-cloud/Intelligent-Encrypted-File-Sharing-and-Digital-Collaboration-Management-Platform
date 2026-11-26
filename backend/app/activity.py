import logging
import os
import re
import secrets
import hashlib
from datetime import date, datetime, time, timedelta, timezone

from pymongo.errors import DuplicateKeyError

from app.database import mongo_db


activity_logger = logging.getLogger("trustshare.activity")
ACTIVITY_COLLECTION = "activity_logs"
AUDIT_COLLECTION = "audit_logs"
NOTIFICATION_COLLECTION = "notifications"
SECURITY_COLLECTION = "security_events"
INFERRED_ACTIVITY_STATUSES = {
    "login_failed": "failed",
    "login_blocked": "blocked",
    "file_download_failed": "failed",
    "share_email_failed": "failed",
    "unauthorized_access": "failed",
    "expired_link_access": "failed",
    "revoked_link_access": "failed",
}


def list_audit_history(
    *,
    user_id: int | None = None,
    file_id: int | None = None,
    activity_type: str | None = None,
    status: str | None = None,
    start_date: date | str | None = None,
    end_date: date | str | None = None,
    search: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[dict]:
    """Read administrator audit history from the dedicated audit collection."""
    filters = {}
    if user_id is not None:
        filters["user_id"] = user_id
    if file_id is not None:
        filters["file_id"] = file_id
    if activity_type:
        filters["activity_type"] = activity_type
    if status:
        inferred_types = [
            event_type
            for event_type, inferred_status in INFERRED_ACTIVITY_STATUSES.items()
            if inferred_status == status
        ]
        alternatives = [{"activity_status": status}]
        if inferred_types:
            alternatives.append({"activity_type": {"$in": inferred_types}})
        filters.setdefault("$and", []).append({"$or": alternatives})

    if start_date or end_date:
        try:
            first = date.fromisoformat(str(start_date)) if start_date else None
            last = date.fromisoformat(str(end_date)) if end_date else None
        except ValueError as exc:
            from fastapi import HTTPException

            raise HTTPException(status_code=422, detail="Dates must use ISO format (YYYY-MM-DD).") from exc
        first = first or last
        last = last or first
        if first > last:
            from fastapi import HTTPException

            raise HTTPException(status_code=422, detail="start_date must be on or before end_date.")
        filters["created_at"] = {
            "$gte": datetime.combine(first, time.min, tzinfo=timezone.utc),
            "$lt": datetime.combine(last + timedelta(days=1), time.min, tzinfo=timezone.utc),
        }

    if search and search.strip():
        expression = re.escape(search.strip())
        search_filters = [
            {"activity_type": {"$regex": expression, "$options": "i"}},
            {"activity_description": {"$regex": expression, "$options": "i"}},
            {"username": {"$regex": expression, "$options": "i"}},
            {"target_email": {"$regex": expression, "$options": "i"}},
            {"target_name": {"$regex": expression, "$options": "i"}},
        ]
        if search.strip().isdigit():
            search_filters.append({"file_id": int(search.strip())})
        filters.setdefault("$and", []).append({"$or": search_filters})

    rows = list(
        mongo_db[AUDIT_COLLECTION]
        .find(filters, {"_id": 0})
        .sort("created_at", -1)
        .skip(offset)
        .limit(limit)
    )
    # Map existing audit documents to the event fields expected by legacy clients.
    # Keep the audit-specific keys so newer clients can use the native schema.
    allowed = {
        "log_id", "activity_id", "user_id", "username", "activity_type",
        "file_id", "folder_id", "activity_description", "activity_status",
        "ip_address", "target_email", "target_name", "provider", "severity",
        "resource_owner_id", "created_at",
    }
    result = []
    for row in rows:
        item = {key: value for key, value in row.items() if key in allowed}
        event_type = row.get("activity_type")
        item.update({
            "event_type": event_type,
            "status": INFERRED_ACTIVITY_STATUSES.get(event_type, row.get("activity_status")),
            "details": row.get("activity_description"),
        })
        result.append(item)
    return result


def ensure_activity_indexes() -> None:
    try:
        collection = mongo_db[ACTIVITY_COLLECTION]
        collection.create_index(
            [("user_id", 1), ("created_at", -1)],
            name="activity_user_created",
        )
        collection.create_index(
            [("event_type", 1), ("target_email", 1), ("created_at", -1)],
            name="activity_security_email_created",
        )
        audit_collection = mongo_db[AUDIT_COLLECTION]
        if audit_collection is not collection:
            audit_collection.create_index([("user_id", 1), ("created_at", -1)])
            audit_collection.create_index([("file_id", 1), ("created_at", -1)])
            mongo_db[NOTIFICATION_COLLECTION].create_index([("user_id", 1), ("read", 1), ("created_at", -1)])
            mongo_db[NOTIFICATION_COLLECTION].create_index([("user_id", 1), ("dedupe_key", 1)])
            mongo_db[SECURITY_COLLECTION].create_index([("created_at", -1)])
            mongo_db[SECURITY_COLLECTION].create_index(
                [("event_type", 1), ("user_id", 1), ("window", 1), ("bucket", 1)],
                name="security_event_dedupe_lookup",
            )
    except Exception as exc:
        activity_logger.warning(
            "Activity index setup unavailable: %s",
            type(exc).__name__,
        )


def record_activity(
    event_type: str,
    user_id: int | None = None,
    *,
    username: str | None = None,
    provider: str | None = None,
    file_id: int | None = None,
    folder_id: int | None = None,
    target_email: str | None = None,
    target_name: str | None = None,
    ip_address: str | None = None,
    details: str | None = None,
    severity: str | None = None,
    resource_owner_id: int | None = None,
    shared_download: bool | None = None,
    status: str | None = None,
    description: str | None = None,
) -> None:
    now = datetime.now(timezone.utc)
    if status is None:
        status = INFERRED_ACTIVITY_STATUSES.get(event_type, "success")
    document = {
        "activity_id": secrets.token_urlsafe(18),
        "event_type": event_type,
        "user_id": user_id,
        "status": status,
        "description": (description or details or event_type.replace("_", " ")).strip()[:500],
        "created_at": now,
    }

    if username is not None:
        document["username"] = username[:255]

    if provider is not None:
        document["provider"] = provider

    if file_id is not None:
        document["file_id"] = file_id

    if folder_id is not None:
        document["folder_id"] = folder_id

    if target_email is not None:
        document["target_email"] = target_email

    if target_name is not None:
        document["target_name"] = target_name

    if ip_address and ip_address != "unknown":
        document["ip_address"] = ip_address

    if details is not None:
        document["details"] = details[:500]

    if severity is not None:
        document["severity"] = severity

    if resource_owner_id is not None:
        document["resource_owner_id"] = resource_owner_id

    if shared_download is not None:
        document["shared_download"] = shared_download

    activity_saved = False
    try:
        mongo_db[ACTIVITY_COLLECTION].insert_one(document)
        activity_saved = True
    except Exception as exc:
        activity_logger.warning(
            "Activity event could not be recorded: event=%s error=%s",
            event_type,
            type(exc).__name__,
        )

    try:
        audit_collection = mongo_db[AUDIT_COLLECTION]
        if audit_collection is not mongo_db[ACTIVITY_COLLECTION]:
            audit_collection.insert_one({
                "log_id": secrets.token_urlsafe(18),
                "activity_id": document["activity_id"],
                "user_id": user_id,
                "username": username,
                "provider": provider,
                "activity_type": event_type,
                "file_id": file_id,
                "folder_id": folder_id,
                "activity_description": document["description"],
                "activity_status": status,
                "ip_address": ip_address,
                "target_email": target_email,
                "target_name": target_name,
                "severity": severity,
                "resource_owner_id": resource_owner_id,
                "created_at": now,
            })
    except Exception as exc:
        activity_logger.warning(
            "Audit history write failed: event=%s error=%s",
            event_type,
            type(exc).__name__,
        )
    if activity_saved:
        _evaluate_security_rules(document)


def create_notification(
    user_id: int,
    title: str,
    message: str,
    notification_type: str,
    *,
    dedupe_key: str | None = None,
) -> bool:
    document = {
        "notification_id": secrets.token_urlsafe(18),
        "user_id": user_id,
        "title": title[:200],
        "message": message[:1000],
        "notification_type": notification_type[:80],
        "read": False,
        "created_at": datetime.now(timezone.utc),
    }
    try:
        collection = mongo_db[NOTIFICATION_COLLECTION]
        if dedupe_key:
            document["dedupe_key"] = dedupe_key
            # Keep old/random-ID documents compatible while new writes are atomic.
            if collection.find_one({"user_id": user_id, "dedupe_key": dedupe_key}):
                return False
            document["_id"] = hashlib.sha256(f"{user_id}:{dedupe_key}".encode()).hexdigest()
            result = collection.update_one(
                {"_id": document["_id"]}, {"$setOnInsert": document}, upsert=True
            )
            return result.upserted_id is not None
        collection.insert_one(document)
        return True
    except Exception as exc:
        activity_logger.warning("Notification could not be recorded: error=%s", type(exc).__name__)
        return False


def create_expiry_reminders(db, *, now: datetime | None = None) -> int:
    """Create one notification per active share entering its expiry window."""
    from app.models import FileShare, FolderShare, User

    current = now or datetime.now(timezone.utc)
    if current.tzinfo is None:
        current = current.replace(tzinfo=timezone.utc)
    current_naive = current.astimezone(timezone.utc).replace(tzinfo=None)
    reminder_until = current_naive + timedelta(hours=24)
    created = 0

    file_shares = db.query(FileShare).filter(
        FileShare.revoked.is_(False),
        FileShare.expires_at.is_not(None),
        FileShare.expires_at > current_naive,
        FileShare.expires_at <= reminder_until,
    ).all()
    folder_shares = db.query(FolderShare).filter(
        FolderShare.revoked.is_(False),
        FolderShare.expires_at.is_not(None),
        FolderShare.expires_at > current_naive,
        FolderShare.expires_at <= reminder_until,
    ).all()

    for share, resource_type in [
        *((share, "file") for share in file_shares),
        *((share, "folder") for share in folder_shares),
    ]:
        recipient = db.query(User).filter(User.email == share.recipient_email).first()
        if recipient is None:
            continue
        expires_at = share.expires_at
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        resource_label = "file access" if resource_type == "file" else "folder access"
        if create_notification(
            recipient.id,
            f"{resource_label.title()} expires soon",
            f"Your {resource_label} expires on {expires_at.astimezone(timezone.utc).isoformat()} UTC.",
            "share_expiry_reminder",
            dedupe_key=f"{resource_type}_share_expiry:{share.id}:{expires_at.isoformat()}",
        ):
            created += 1

    return created


def _evaluate_security_rules(document: dict) -> None:
    """Create one alert per threshold window using a deterministic Mongo _id."""
    event_type = document.get("event_type")
    if event_type not in {
        "login_failed", "unauthorized_access", "expired_link_access",
        "revoked_link_access", "file_download_success",
    }:
        return
    try:
        collection = mongo_db[ACTIVITY_COLLECTION]
        events = {
            "login_failed": ("FAILED_LOGIN_THRESHOLD", 5, 600, "repeated_failed_logins", "High"),
            "file_download_success": ("DOWNLOAD_THRESHOLD", 20, 300, "suspicious_downloads", "Medium"),
            "unauthorized_access": ("UNAUTHORIZED_THRESHOLD", 3, 600, "repeated_unauthorized_access", "High"),
            "expired_link_access": ("EXPIRED_LINK_THRESHOLD", 3, 600, "repeated_expired_link_access", "Medium"),
            "revoked_link_access": ("REVOKED_LINK_THRESHOLD", 3, 600, "repeated_revoked_link_access", "Medium"),
        }
        env_key, threshold, window, alert_type, severity = events[event_type]
        threshold = int(os.getenv(env_key, str(threshold)))
        now = datetime.now(timezone.utc)
        since = now - timedelta(seconds=window)
        query = {"event_type": event_type, "created_at": {"$gte": since, "$lte": now}}
        if document.get("user_id") is not None:
            query["user_id"] = document["user_id"]
        count = collection.count_documents(query)
        if count <= threshold:
            return
        security = mongo_db[SECURITY_COLLECTION]
        bucket = int(now.timestamp() // window)
        dedupe = {
            "event_type": alert_type,
            "user_id": document.get("user_id"),
            "window": window,
            "bucket": bucket,
        }
        if security.find_one(dedupe):
            return
        event_id = f"{alert_type}:{document.get('user_id')}:{bucket}"
        security_event = {
            **dedupe,
            "event_id": event_id,
            "alert_id": event_id,
            "user_id": document.get("user_id"),
            "description": f"{count} {event_type.replace('_', ' ')} events in {window // 60} minutes.",
            "timestamp": now,
            "severity": severity,
            "status": "open",
        }
        try:
            result = security.update_one(
                {"_id": event_id},
                {"$setOnInsert": {**security_event, "_id": event_id}},
                upsert=True,
            )
        except DuplicateKeyError:
            # Concurrent upserts share the deterministic _id; the winner alerts.
            return
        if result.upserted_id is None:
            return
        admin_ids = [
            int(value.strip())
            for value in os.getenv("SECURITY_ALERT_ADMIN_IDS", "").split(",")
            if value.strip().isdigit()
        ]
        if not admin_ids:
            activity_logger.warning(
                "Security alert has no configured administrator recipients: event=%s",
                alert_type,
            )
        for admin_id in admin_ids:
            create_notification(
                admin_id,
                "Security alert",
                f"Suspicious activity detected: {alert_type}.",
                "security_alert",
                dedupe_key=event_id,
            )
        from app.email_service import send_security_alert_emails

        send_security_alert_emails(alert_type, count, window)
    except Exception as exc:
        activity_logger.warning("Security rule evaluation unavailable: error=%s", type(exc).__name__)
