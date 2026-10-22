import os
from datetime import datetime, timezone
from typing import Optional, Dict, Any
from app.database import mongo_db

async def log_activity(
    user_id: Optional[int],
    username: Optional[str],
    action: str,
    resource_id: Optional[str] = None,
    resource_name: Optional[str] = None,
    ip_address: str = "127.0.0.1",
    details: Optional[Dict[str, Any]] = None
):
    """
    Appends an audit log entry to MongoDB 'activity_logs' collection.
    """
    try:
        log_entry = {
            "user_id": user_id,
            "username": username or "system",
            "action": action,
            "resource_id": resource_id,
            "resource_name": resource_name,
            "ip_address": ip_address,
            "details": details or {},
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        await mongo_db.activity_logs.insert_one(log_entry)
    except Exception as e:
        # Non-blocking logging failure to avoid breaking main business logic
        print(f"[ActivityLog Error] Failed to write audit log: {e}")
