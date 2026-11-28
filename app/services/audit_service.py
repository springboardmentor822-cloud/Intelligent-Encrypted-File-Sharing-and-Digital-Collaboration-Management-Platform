from datetime import datetime, timezone
from pymongo import ASCENDING, DESCENDING
from pymongo.errors import PyMongoError

from app.services.mongodb_service import MongoDBService


class AuditService:
    COLLECTION_NAME = "audit_logs"

    @classmethod
    def _get_collection(cls):
        db = MongoDBService.get_database()
        return db[cls.COLLECTION_NAME]

    @classmethod
    def ensure_indexes(cls):
        collection = cls._get_collection()

        collection.create_index(
            [("created_at", DESCENDING)]
        )
        collection.create_index(
            [("actor_id", ASCENDING), ("created_at", DESCENDING)]
        )
        collection.create_index(
            [("category", ASCENDING), ("created_at", DESCENDING)]
        )
        collection.create_index(
            [("action", ASCENDING)]
        )
        collection.create_index(
            [("resource_id", ASCENDING)]
        )

    @classmethod
    def log_event(
        cls,
        category: str,
        action: str,
        actor_id=None,
        actor_email=None,
        resource_type=None,
        resource_id=None,
        status="SUCCESS",
        ip_address=None,
        details=None,
    ):
        event = {
            "category": category,
            "action": action,
            "actor_id": actor_id,
            "actor_email": actor_email,
            "resource_type": resource_type,
            "resource_id": str(resource_id) if resource_id is not None else None,
            "status": status,
            "ip_address": ip_address,
            "details": details or {},
            "created_at": datetime.now(timezone.utc),
        }

        try:
            result = cls._get_collection().insert_one(event)
            return str(result.inserted_id)
        except PyMongoError as exc:
            print(f"Audit logging failed: {exc}")
            return None

    @classmethod
    def get_events(
        cls,
        category=None,
        action=None,
        actor_id=None,
        status=None,
        limit=50,
        skip=0,
    ):
        filters = {}

        if category:
            filters["category"] = category
        if action:
            filters["action"] = action
        if actor_id is not None:
            filters["actor_id"] = actor_id
        if status:
            filters["status"] = status

        limit = max(1, min(int(limit), 100))
        skip = max(0, int(skip))

        cursor = (
            cls._get_collection()
            .find(filters, {"_id": 0})
            .sort("created_at", DESCENDING)
            .skip(skip)
            .limit(limit)
        )

        return list(cursor)
