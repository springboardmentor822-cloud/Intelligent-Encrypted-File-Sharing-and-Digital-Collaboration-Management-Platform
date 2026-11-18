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
from app.activity_monitoring.schemas import (
    ActivityRecordResponse,
    ActivitySummaryStats
)

logger = logging.getLogger("trustshare.activity_monitoring")

class ActivityMonitoringService:
    """
    Activity Monitoring Service
    Handles tracking, recording, collection, processing, and retrieval of all
    important user activities across the platform.
    """

    @staticmethod
    async def record_activity(
        user_id: Optional[int],
        activity_type: str,
        status: Optional[str] = None,
        file_id: Optional[str] = None,
        resource_name: Optional[str] = None,
        ip_address: str = "127.0.0.1",
        username: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None,
        action_name: Optional[str] = None,
        timestamp: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Records a user activity into MongoDB 'activity_logs' collection.
        Activity fields:
        - activity_id (UUID)
        - user_id
        - activity_type (login, upload, download, share, etc.)
        - file_id (if applicable)
        - status (successful or failed)
        - ip_address
        - timestamp (ISO-8601 UTC)
        """
        try:
            # 1. Generate unique Activity ID
            activity_id = f"act_{uuid.uuid4().hex}"

            # 2. Derive normalized activity type and status
            action_alias = action_name or activity_type
            norm_type = normalize_activity_type(activity_type or action_alias)
            norm_status = normalize_activity_status(action_alias, status)

            # 3. Timestamp in UTC
            ts = timestamp or datetime.now(timezone.utc).isoformat()

            # 4. Construct complete document
            activity_doc = {
                "activity_id": activity_id,
                "user_id": user_id,
                "username": username or "system",
                "activity_type": norm_type,
                "status": norm_status,
                "file_id": file_id,
                # Compatibility fields
                "action": action_alias,
                "resource_id": file_id,
                "resource_name": resource_name,
                "ip_address": ip_address or "127.0.0.1",
                "timestamp": ts,
                "details": details or {}
            }

            # 5. Persist to MongoDB
            res = await mongo_db.activity_logs.insert_one(activity_doc)
            activity_doc["_id"] = str(res.inserted_id)

            return activity_doc

        except Exception as e:
            logger.error(f"[ActivityMonitoringService Error] Failed to write activity record: {e}")
            return {
                "activity_id": f"act_err_{uuid.uuid4().hex[:8]}",
                "status": "failed",
                "error": str(e)
            }

    @staticmethod
    def _doc_to_response(doc: Dict[str, Any]) -> ActivityRecordResponse:
        """Helper to convert MongoDB document to standard Pydantic response."""
        act_id = doc.get("activity_id") or str(doc.get("_id", ""))
        file_id = doc.get("file_id") or doc.get("resource_id")
        act_type = doc.get("activity_type") or normalize_activity_type(doc.get("action", ""))
        stat = doc.get("status") or normalize_activity_status(doc.get("action", ""))

        return ActivityRecordResponse(
            activity_id=act_id,
            user_id=doc.get("user_id"),
            username=doc.get("username"),
            activity_type=act_type,
            file_id=file_id,
            resource_name=doc.get("resource_name"),
            status=stat,
            ip_address=doc.get("ip_address", "127.0.0.1"),
            timestamp=doc.get("timestamp", datetime.now(timezone.utc).isoformat()),
            details=doc.get("details")
        )

    @classmethod
    async def get_activities(
        cls,
        user_id: Optional[int] = None,
        activity_type: Optional[str] = None,
        file_id: Optional[str] = None,
        status: Optional[str] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        search: Optional[str] = None,
        skip: int = 0,
        limit: int = 50
    ) -> Tuple[List[ActivityRecordResponse], int]:
        """
        Retrieves paginated and filtered activity records from MongoDB.
        """
        query: Dict[str, Any] = {}

        if user_id is not None:
            query["user_id"] = user_id

        if activity_type:
            norm_type = activity_type.lower().strip()
            query["$or"] = [
                {"activity_type": norm_type},
                {"action": {"$regex": norm_type, "$options": "i"}}
            ]

        if file_id:
            query["$or"] = [
                {"file_id": file_id},
                {"resource_id": file_id}
            ]

        if status:
            query["status"] = status.lower().strip()

        # Date range filtering
        if start_date or end_date:
            ts_filter: Dict[str, Any] = {}
            if start_date:
                ts_filter["$gte"] = start_date
            if end_date:
                ts_filter["$lte"] = end_date
            query["timestamp"] = ts_filter

        # Keyword search
        if search:
            s_regex = {"$regex": search.strip(), "$options": "i"}
            search_clause = [
                {"activity_id": s_regex},
                {"username": s_regex},
                {"action": s_regex},
                {"resource_name": s_regex},
                {"ip_address": s_regex}
            ]
            if "$or" in query:
                query["$and"] = [{"$or": query.pop("$or")}, {"$or": search_clause}]
            else:
                query["$or"] = search_clause

        total = await mongo_db.activity_logs.count_documents(query)
        cursor = mongo_db.activity_logs.find(query).sort("timestamp", -1).skip(skip).limit(limit)
        docs = await cursor.to_list(length=limit)

        records = [cls._doc_to_response(d) for d in docs]
        return records, total

    @classmethod
    async def get_activity_by_id(cls, activity_id: str) -> Optional[ActivityRecordResponse]:
        """Looks up a specific activity by its activity_id or MongoDB _id."""
        query: Dict[str, Any] = {"activity_id": activity_id}
        doc = await mongo_db.activity_logs.find_one(query)
        if not doc and ObjectId.is_valid(activity_id):
            doc = await mongo_db.activity_logs.find_one({"_id": ObjectId(activity_id)})

        if doc:
            return cls._doc_to_response(doc)
        return None

    @classmethod
    async def get_activity_stats(cls) -> ActivitySummaryStats:
        """
        Computes aggregate metrics across user activity records.
        """
        total = await mongo_db.activity_logs.count_documents({})
        successful = await mongo_db.activity_logs.count_documents({"status": ActivityStatus.SUCCESSFUL.value})
        failed = await mongo_db.activity_logs.count_documents({"status": ActivityStatus.FAILED.value})

        # Specific activity counts
        logins = await mongo_db.activity_logs.count_documents({
            "$or": [{"activity_type": ActivityType.LOGIN.value}, {"action": {"$regex": "LOGIN", "$options": "i"}}]
        })
        failed_logins = await mongo_db.activity_logs.count_documents({
            "$or": [
                {"action": "LOGIN_FAILED"},
                {"activity_type": ActivityType.LOGIN.value, "status": ActivityStatus.FAILED.value}
            ]
        })
        uploads = await mongo_db.activity_logs.count_documents({
            "$or": [{"activity_type": ActivityType.FILE_UPLOAD.value}, {"action": {"$regex": "UPLOAD", "$options": "i"}}]
        })
        downloads = await mongo_db.activity_logs.count_documents({
            "$or": [{"activity_type": ActivityType.FILE_DOWNLOAD.value}, {"action": {"$regex": "DOWNLOAD", "$options": "i"}}]
        })
        shares = await mongo_db.activity_logs.count_documents({
            "$or": [{"activity_type": ActivityType.SHARE_CREATE.value}, {"action": {"$regex": "SHARE", "$options": "i"}}]
        })
        unauth = await mongo_db.activity_logs.count_documents({
            "$or": [
                {"activity_type": ActivityType.UNAUTHORIZED_ACCESS.value},
                {"action": {"$in": ["ACCESS_DENIED", "UNAUTHORIZED_ACCESS", "PASSWORD_VERIFY_FAILED", "GUEST_PASSWORD_FAILED"]}}
            ]
        })

        return ActivitySummaryStats(
            total_activities=total,
            successful_activities=successful,
            failed_activities=failed,
            logins_count=logins,
            failed_logins_count=failed_logins,
            uploads_count=uploads,
            downloads_count=downloads,
            shares_count=shares,
            unauthorized_attempts_count=unauth,
            activity_breakdown={
                "login": logins,
                "upload": uploads,
                "download": downloads,
                "share": shares,
                "unauthorized": unauth
            }
        )


activity_monitoring_service = ActivityMonitoringService()

