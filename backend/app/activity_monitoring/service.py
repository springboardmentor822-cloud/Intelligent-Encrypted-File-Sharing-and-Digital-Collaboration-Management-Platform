import uuid
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
from app.core.config import settings
from app.db.session import SessionLocal
from app.models.audit_log import AuditLog
from app.db.mongo import mongo_db
from app.security_monitoring.detection import SecurityDetectionEngine


def _format_iso(dt):
    if not dt:
        return None
    if isinstance(dt, datetime):
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.isoformat()
    return str(dt)

class ActivityMonitoringService:
    """
    Milestone 3 Task 1 & Task 2: Activity Monitoring & Audit Logging Service.
    Maintains complete tamper-evident audit history across MongoDB and PostgreSQL.
    """

    @classmethod
    async def record_activity(
        cls,
        user_id: Optional[int],
        action: str,
        details: Optional[Dict[str, Any]] = None,
        user_email: Optional[str] = None,
        file_id: Optional[int] = None,
        description: Optional[str] = None,
        status: str = "SUCCESS",
        ip_address: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Records an append-only audit log document into MongoDB collection 'audit_logs'
        and mirrors into PostgreSQL 'audit_logs' table.
        """
        now = datetime.now(timezone.utc)
        activity_id = str(uuid.uuid4())
        details = details or {}
        ip = ip_address or details.get("ip", "127.0.0.1")

        if not description:
            description = details.get("reason") or f"Operation {action} executed with status {status}."

        # 1. Write to PostgreSQL audit_logs table
        try:
            with SessionLocal() as db:
                entry = AuditLog(
                    user_id=user_id,
                    user_email=user_email,
                    action=action,
                    details={
                        **details,
                        "activity_id": activity_id,
                        "file_id": file_id,
                        "description": description,
                        "status": status,
                        "ip": ip,
                    },
                    timestamp=now,
                )
                db.add(entry)
                db.commit()
        except Exception as e:
            print(f"PostgreSQL audit logging error: {e}")

        # 2. Write to MongoDB Atlas 'audit_logs' collection
        doc = {
            "activity_id": activity_id,
            "user_id": user_id,
            "username": user_email or "system_user",
            "activity_type": action,
            "file_id": file_id,
            "description": description,
            "status": status,
            "ip_address": ip,
            "timestamp": now,
            "details": details,
        }

        if mongo_db is not None:
            try:
                await mongo_db["audit_logs"].insert_one(doc)
                # Also maintain backwards compatibility with 'activity_logs'
                await mongo_db["activity_logs"].insert_one({
                    "user_id": user_id,
                    "user_email": user_email,
                    "action": action,
                    "details": doc["details"],
                    "timestamp": now,
                })
            except Exception as e:
                print(f"MongoDB audit logging error: {e}")

        # 3. Evaluate activity with Rule-Based Suspicious Activity Detection Engine (Task 6)
        try:
            await SecurityDetectionEngine.evaluate_activity(
                user_id=user_id,
                user_email=user_email,
                action=action,
                details=details,
                ip_address=ip,
            )
        except Exception as e:
            print(f"Suspicious activity detection error: {e}")

        return doc

    @classmethod
    async def get_all_logs(cls, limit: int = 50, skip: int = 0) -> List[Dict[str, Any]]:
        """Retrieves audit logs ordered by timestamp descending."""
        if mongo_db is not None:
            try:
                cursor = (
                    mongo_db["audit_logs"]
                    .find({})
                    .sort("timestamp", -1)
                    .skip(skip)
                    .limit(limit)
                )
                records = await cursor.to_list(length=limit)
                for r in records:
                    r["_id"] = str(r["_id"])
                    if isinstance(r.get("timestamp"), datetime):
                        r["timestamp"] = _format_iso(r["timestamp"])
                return records
            except Exception as e:
                print(f"MongoDB get_all_logs warning: {e}")

        # PostgreSQL fallback
        with SessionLocal() as db:
            logs = db.query(AuditLog).order_by(AuditLog.timestamp.desc()).offset(skip).limit(limit).all()
            return [
                {
                    "activity_id": (l.details or {}).get("activity_id", str(l.id)),
                    "user_id": l.user_id,
                    "username": l.user_email,
                    "activity_type": l.action,
                    "file_id": (l.details or {}).get("file_id"),
                    "description": (l.details or {}).get("description", l.action),
                    "status": (l.details or {}).get("status", "SUCCESS"),
                    "ip_address": (l.details or {}).get("ip", "127.0.0.1"),
                    "timestamp": _format_iso(l.timestamp),
                    "details": l.details,
                }
                for l in logs
            ]

    @classmethod
    async def get_user_logs(cls, user_id: int, limit: int = 50) -> List[Dict[str, Any]]:
        """Retrieves audit logs for a specific user."""
        if mongo_db is not None:
            try:
                cursor = (
                    mongo_db["audit_logs"]
                    .find({"user_id": user_id})
                    .sort("timestamp", -1)
                    .limit(limit)
                )
                records = await cursor.to_list(length=limit)
                for r in records:
                    r["_id"] = str(r["_id"])
                    if isinstance(r.get("timestamp"), datetime):
                        r["timestamp"] = _format_iso(r["timestamp"])
                return records
            except Exception as e:
                print(f"MongoDB get_user_logs warning: {e}")

        with SessionLocal() as db:
            logs = (
                db.query(AuditLog)
                .filter(AuditLog.user_id == user_id)
                .order_by(AuditLog.timestamp.desc())
                .limit(limit)
                .all()
            )
            return [
                {
                    "activity_id": (l.details or {}).get("activity_id", str(l.id)),
                    "user_id": l.user_id,
                    "username": l.user_email,
                    "activity_type": l.action,
                    "file_id": (l.details or {}).get("file_id"),
                    "description": (l.details or {}).get("description", l.action),
                    "status": (l.details or {}).get("status", "SUCCESS"),
                    "ip_address": (l.details or {}).get("ip", "127.0.0.1"),
                    "timestamp": _format_iso(l.timestamp),
                }
                for l in logs
            ]

    @classmethod
    async def get_file_logs(cls, file_id: int, limit: int = 50) -> List[Dict[str, Any]]:
        """Retrieves audit activity for a specific file."""
        if mongo_db is not None:
            try:
                cursor = (
                    mongo_db["audit_logs"]
                    .find({"$or": [{"file_id": file_id}, {"details.file_id": file_id}]})
                    .sort("timestamp", -1)
                    .limit(limit)
                )
                records = await cursor.to_list(length=limit)
                for r in records:
                    r["_id"] = str(r["_id"])
                    if isinstance(r.get("timestamp"), datetime):
                        r["timestamp"] = _format_iso(r["timestamp"])
                return records
            except Exception as e:
                print(f"MongoDB get_file_logs warning: {e}")

        with SessionLocal() as db:
            logs = (
                db.query(AuditLog)
                .filter(AuditLog.details["file_id"].as_integer() == file_id)
                .order_by(AuditLog.timestamp.desc())
                .limit(limit)
                .all()
            )
            return [
                {
                    "activity_id": (l.details or {}).get("activity_id", str(l.id)),
                    "user_id": l.user_id,
                    "username": l.user_email,
                    "activity_type": l.action,
                    "file_id": file_id,
                    "description": (l.details or {}).get("description", l.action),
                    "status": (l.details or {}).get("status", "SUCCESS"),
                    "ip_address": (l.details or {}).get("ip", "127.0.0.1"),
                    "timestamp": _format_iso(l.timestamp),
                }
                for l in logs
            ]

    @classmethod
    async def filter_logs(
        cls,
        user_id: Optional[int] = None,
        activity_type: Optional[str] = None,
        file_id: Optional[int] = None,
        status: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        limit: int = 100,
        skip: int = 0,
    ) -> List[Dict[str, Any]]:
        """Filters audit records based on specified criteria."""
        mongo_query: Dict[str, Any] = {}
        if user_id is not None:
            mongo_query["user_id"] = user_id
        if activity_type and activity_type != "ALL":
            mongo_query["activity_type"] = activity_type
        if file_id is not None:
            mongo_query["$or"] = [{"file_id": file_id}, {"details.file_id": file_id}]
        if status and status != "ALL":
            mongo_query["status"] = status

        date_filter: Dict[str, Any] = {}
        if start_date:
            date_filter["$gte"] = start_date
        if end_date:
            date_filter["$lte"] = end_date
        if date_filter:
            mongo_query["timestamp"] = date_filter

        if mongo_db is not None:
            try:
                cursor = (
                    mongo_db["audit_logs"]
                    .find(mongo_query)
                    .sort("timestamp", -1)
                    .skip(skip)
                    .limit(limit)
                )
                records = await cursor.to_list(length=limit)
                for r in records:
                    r["_id"] = str(r["_id"])
                    if isinstance(r.get("timestamp"), datetime):
                        r["timestamp"] = _format_iso(r["timestamp"])
                return records
            except Exception as e:
                print(f"MongoDB filter_logs warning: {e}")

        # PostgreSQL query fallback
        with SessionLocal() as db:
            q = db.query(AuditLog)
            if user_id is not None:
                q = q.filter(AuditLog.user_id == user_id)
            if activity_type and activity_type != "ALL":
                q = q.filter(AuditLog.action == activity_type)
            if start_date:
                q = q.filter(AuditLog.timestamp >= start_date)
            if end_date:
                q = q.filter(AuditLog.timestamp <= end_date)
            records = q.order_by(AuditLog.timestamp.desc()).offset(skip).limit(limit).all()
            return [
                {
                    "activity_id": (l.details or {}).get("activity_id", str(l.id)),
                    "user_id": l.user_id,
                    "username": l.user_email,
                    "activity_type": l.action,
                    "file_id": (l.details or {}).get("file_id"),
                    "description": (l.details or {}).get("description", l.action),
                    "status": (l.details or {}).get("status", "SUCCESS"),
                    "ip_address": (l.details or {}).get("ip", "127.0.0.1"),
                    "timestamp": _format_iso(l.timestamp),
                    "details": l.details,
                }
                for l in records
            ]

