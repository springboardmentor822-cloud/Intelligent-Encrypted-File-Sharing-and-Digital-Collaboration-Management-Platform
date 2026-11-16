from datetime import datetime, timezone
from typing import Optional, Dict, Any
from motor.motor_asyncio import AsyncIOMotorClient
from app.core.config import settings

# 1. Initialize Async Motor Client
mongo_client: Optional[AsyncIOMotorClient] = None
mongo_db = None

if settings.MONGODB_URL:
    try:
        mongo_client = AsyncIOMotorClient(
            settings.MONGODB_URL,
            serverSelectionTimeoutMS=2000,
            connectTimeoutMS=2000,
        )
        mongo_db = mongo_client[settings.MONGODB_DB_NAME]
    except Exception as e:
        print(f"MongoDB initialization warning: {e}")


# 2. Activity / Audit Logging Helper
async def log_activity(
    user_id: int,
    action: str,
    details: Optional[Dict[str, Any]] = None,
    user_email: Optional[str] = None,
):
    """
    Records an append-only audit log document into MongoDB Atlas 'audit_logs'
    and PostgreSQL 'audit_logs' table, while evaluating suspicious activity rules.
    """
    try:
        from app.activity_monitoring.service import ActivityMonitoringService
        ip = (details or {}).get("ip") if details else None
        file_id = (details or {}).get("file_id") if details else None
        status = "FAILED" if "FAILED" in action or "REJECTED" in action or "UNAUTHORIZED" in action else "SUCCESS"
        await ActivityMonitoringService.record_activity(
            user_id=user_id,
            action=action,
            details=details,
            user_email=user_email,
            file_id=file_id,
            status=status,
            ip_address=ip,
        )
    except Exception as e:
        print(f"Activity logging delegation error: {e}")



# 3. Extended File Metadata Logging Helper
async def log_file_metadata(file_doc: Dict[str, Any]):
    """
    Stores flexible document metadata for uploaded files into MongoDB Atlas.
    """
    if mongo_db is None:
        return
    try:
        file_doc["created_at"] = datetime.now(timezone.utc)
        await mongo_db["file_metadata"].insert_one(file_doc)
    except Exception as e:
        print(f"MongoDB metadata logging warning: {e}")
