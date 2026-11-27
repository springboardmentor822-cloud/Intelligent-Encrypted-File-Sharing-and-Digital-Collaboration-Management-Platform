"""MongoDB access (activity, login, security and audit logs)."""
from pymongo import ASCENDING, DESCENDING, MongoClient

from app.core.config import settings

_client: MongoClient | None = None


def get_mongo():
    global _client
    if _client is None:
        _client = MongoClient(settings.mongo_url, tz_aware=True, serverSelectionTimeoutMS=3000)
    return _client[settings.mongo_db]


def init_indexes() -> None:
    db = get_mongo()
    db.audit_logs.create_index([("ts", DESCENDING)])
    db.audit_logs.create_index([("actor_id", ASCENDING), ("ts", DESCENDING)])
    db.audit_logs.create_index([("owner_id", ASCENDING), ("ts", DESCENDING)])
    db.login_events.create_index([("ts", DESCENDING)])
    db.login_events.create_index([("email", ASCENDING), ("ts", DESCENDING)])
    db.security_events.create_index([("ts", DESCENDING)])
    db.security_events.create_index([("severity", ASCENDING)])
    db.access_attempts.create_index([("ts", DESCENDING)])
    db.download_events.create_index([("ts", DESCENDING)])
    db.download_events.create_index([("owner_id", ASCENDING), ("ts", DESCENDING)])
    db.share_events.create_index([("file_id", ASCENDING), ("ts", DESCENDING)])
