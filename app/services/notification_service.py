
from datetime import datetime, timezone
from pymongo import ASCENDING, DESCENDING
from pymongo.errors import PyMongoError

from app.services.mongodb_service import MongoDBService


class NotificationService:
    COLLECTION_NAME = "notifications"

    @classmethod
    def _get_collection(cls):
        db = MongoDBService.get_database()
        return db[cls.COLLECTION_NAME]

    @classmethod
    def ensure_indexes(cls):
        collection = cls._get_collection()
        collection.create_index(
            [("user_id", ASCENDING), ("created_at", DESCENDING)]
        )
        collection.create_index(
            [("user_id", ASCENDING), ("is_read", ASCENDING)]
        )
        collection.create_index(
            [("created_at", DESCENDING)]
        )

    @classmethod
    def create_notification(
        cls,
        user_id,
        title,
        message,
        notification_type="INFO",
        metadata=None,
    ):
        notification = {
            "user_id": int(user_id),
            "title": title,
            "message": message,
            "type": notification_type,
            "is_read": False,
            "created_at": datetime.now(timezone.utc),
            "metadata": metadata or {},
        }

        try:
            result = cls._get_collection().insert_one(notification)
            notification["notification_id"] = str(result.inserted_id)
            notification.pop("_id", None)
            return notification
        except PyMongoError as exc:
            print(f"Notification creation failed: {exc}")
            return None

    @classmethod
    def get_notifications(cls, user_id, limit=50, skip=0):
        limit = max(1, min(int(limit), 100))
        skip = max(0, int(skip))

        cursor = (
            cls._get_collection()
            .find({"user_id": int(user_id)})
            .sort("created_at", DESCENDING)
            .skip(skip)
            .limit(limit)
        )

        notifications = []

        for item in cursor:
            item["notification_id"] = str(item.pop("_id"))
            notifications.append(item)

        return notifications

    @classmethod
    def get_unread_count(cls, user_id):
        return cls._get_collection().count_documents({
            "user_id": int(user_id),
            "is_read": False,
        })

    @classmethod
    def mark_as_read(cls, user_id, notification_id):
        from bson import ObjectId
        from bson.errors import InvalidId

        try:
            object_id = ObjectId(notification_id)
        except (InvalidId, TypeError):
            return False

        result = cls._get_collection().update_one(
            {
                "_id": object_id,
                "user_id": int(user_id),
            },
            {"$set": {"is_read": True}},
        )

        return result.modified_count > 0 or result.matched_count > 0

    @classmethod
    def mark_all_as_read(cls, user_id):
        result = cls._get_collection().update_many(
            {
                "user_id": int(user_id),
                "is_read": False,
            },
            {"$set": {"is_read": True}},
        )

        return result.modified_count
