"""
TrustShare - Audit Logging Service
===================================
Maintains a detailed, permanent, and tamper-resistant history of all activities
performed within the application in MongoDB collection 'audit_logs'.
Enforces strict Administrator-Only inspection and granular filtering.
"""

import uuid
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List, Tuple
from bson import ObjectId

from app.database import mongo_db
from app.activity_monitoring.models import (
    ActivityType,
    ActivityStatus,
    normalize_activity_type,
    normalize_activity_status
)

logger = logging.getLogger("trustshare.audit_logging")


class AuditLoggingService:
    """
    Manages the permanent 'audit_logs' collection in MongoDB.
    Provides reusable logging functions and administrative query pipelines.
    """

    @staticmethod
    async def log_audit_event(
        activity_type: str,
        activity_description: str,
        activity_status: str = "successful",
        user_id: Optional[int] = None,
        username: Optional[str] = None,
        file_id: Optional[str] = None,
        file_name: Optional[str] = None,
        ip_address: str = "127.0.0.1",
        details: Optional[Dict[str, Any]] = None,
        timestamp: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Reusable audit logging function for FastAPI backend.
        Stores an immutable record in MongoDB 'audit_logs' with all required fields:
        - log_id
        - user_id
        - username
        - activity_type
        - file_id
        - activity_description
        - activity_status
        - ip_address
        - date_and_time
        """
        try:
            log_id = f"audit_{uuid.uuid4().hex}"
            norm_type = normalize_activity_type(activity_type)
            norm_status = normalize_activity_status(activity_type, activity_status)
            dt_iso = timestamp or datetime.now(timezone.utc).isoformat()

            audit_entry = {
                "log_id": log_id,
                "user_id": user_id,
                "username": username or "system",
                "activity_type": norm_type,
                "file_id": file_id,
                "file_name": file_name or (details.get("file_name") if details else None),
                "activity_description": activity_description,
                "activity_status": norm_status,
                "ip_address": ip_address or "127.0.0.1",
                "date_and_time": dt_iso,
                # Retain timestamp alias for backwards compatibility
                "timestamp": dt_iso,
                "details": details or {}
            }

            # Persist directly into the dedicated MongoDB 'audit_logs' collection
            res = await mongo_db.audit_logs.insert_one(audit_entry)
            audit_entry["_id"] = str(res.inserted_id)

            return audit_entry

        except Exception as e:
            logger.error(f"[AuditLoggingService Error] Failed to write audit record: {e}")
            return {
                "log_id": f"audit_err_{uuid.uuid4().hex[:8]}",
                "activity_status": "failed",
                "error": str(e)
            }

    @staticmethod
    def _doc_to_response(doc: Dict[str, Any]) -> Dict[str, Any]:
        clean = dict(doc)
        if "_id" in clean:
            clean["_id"] = str(clean["_id"])
        if "log_id" not in clean:
            clean["log_id"] = str(clean.get("_id", ""))
        if "date_and_time" not in clean:
            clean["date_and_time"] = clean.get("timestamp", datetime.now(timezone.utc).isoformat())
        if "activity_status" not in clean:
            clean["activity_status"] = clean.get("status", "successful")
        if "activity_description" not in clean:
            clean["activity_description"] = clean.get("action", "Platform activity performed")
        return clean

    @classmethod
    async def get_audit_logs(
        cls,
        user_id: Optional[int] = None,
        username: Optional[str] = None,
        activity_type: Optional[str] = None,
        file_id: Optional[str] = None,
        file_name: Optional[str] = None,
        activity_status: Optional[str] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        search: Optional[str] = None,
        skip: int = 0,
        limit: int = 50
    ) -> Tuple[List[Dict[str, Any]], int]:
        """
        Retrieves paginated audit logs from MongoDB 'audit_logs' with full filtering support.
        """
        query: Dict[str, Any] = {}

        if user_id is not None:
            query["user_id"] = user_id

        if username:
            query["username"] = {"$regex": username.strip(), "$options": "i"}

        if activity_type and activity_type != "ALL":
            norm = activity_type.lower().strip()
            query["$or"] = [
                {"activity_type": norm},
                {"action": {"$regex": norm, "$options": "i"}}
            ]

        if file_id:
            query["$or"] = [
                {"file_id": file_id},
                {"resource_id": file_id}
            ]

        if file_name:
            query["$or"] = [
                {"file_name": {"$regex": file_name.strip(), "$options": "i"}},
                {"resource_name": {"$regex": file_name.strip(), "$options": "i"}}
            ]

        if activity_status and activity_status != "ALL":
            stat_norm = "failed" if "fail" in activity_status.lower() else "successful"
            query["$or"] = [
                {"activity_status": stat_norm},
                {"status": stat_norm}
            ]

        # Date range filtering
        if start_date or end_date:
            date_filter: Dict[str, Any] = {}
            if start_date:
                date_filter["$gte"] = start_date
            if end_date:
                date_filter["$lte"] = end_date
            query["$or"] = [
                {"date_and_time": date_filter},
                {"timestamp": date_filter}
            ]

        if search:
            s_regex = {"$regex": search.strip(), "$options": "i"}
            search_clause = [
                {"log_id": s_regex},
                {"username": s_regex},
                {"activity_description": s_regex},
                {"activity_type": s_regex},
                {"file_id": s_regex},
                {"file_name": s_regex},
                {"ip_address": s_regex}
            ]
            if "$or" in query:
                query["$and"] = [{"$or": query.pop("$or")}, {"$or": search_clause}]
            else:
                query["$or"] = search_clause

        total = await mongo_db.audit_logs.count_documents(query)
        cursor = mongo_db.audit_logs.find(query).sort("date_and_time", -1).skip(skip).limit(limit)
        docs = await cursor.to_list(length=limit)

        records = [cls._doc_to_response(d) for d in docs]
        return records, total

    @classmethod
    async def get_audit_log_by_id(cls, log_id: str) -> Optional[Dict[str, Any]]:
        query = {"$or": [{"log_id": log_id}]}
        if ObjectId.is_valid(log_id):
            query["$or"].append({"_id": ObjectId(log_id)})

        doc = await mongo_db.audit_logs.find_one(query)
        if doc:
            return cls._doc_to_response(doc)
        return None


audit_logging_service = AuditLoggingService()
log_audit_event = AuditLoggingService.log_audit_event

