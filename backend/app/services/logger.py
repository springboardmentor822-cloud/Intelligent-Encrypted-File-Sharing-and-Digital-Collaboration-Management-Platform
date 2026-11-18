import os
import uuid
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
    details: Optional[Dict[str, Any]] = None,
    status: Optional[str] = None,
    activity_type: Optional[str] = None
):
    """
    Appends an audit log entry to MongoDB 'activity_logs' and 'audit_logs' collections.
    Delegates to Activity Monitoring Service & Audit Logging Service while maintaining full backwards compatibility.
    """
    try:
        from app.activity_monitoring.service import activity_monitoring_service
        from app.activity_monitoring.audit_service import audit_logging_service

        # 1. Record to Activity Monitoring Service
        act_res = await activity_monitoring_service.record_activity(
            user_id=user_id,
            username=username,
            activity_type=activity_type or action,
            action_name=action,
            file_id=resource_id,
            resource_name=resource_name,
            ip_address=ip_address,
            status=status,
            details=details
        )

        # 2. Record to Permanent Audit Logging Collection
        derived_status = status or ("failed" if any(x in action.upper() for x in ["FAIL", "DENIED", "UNAUTHORIZED", "ERROR", "REJECTED"]) else "successful")
        target_name = resource_name or resource_id or "system"
        description = f"User '{username or 'anonymous'}' performed '{action}' on '{target_name}'"
        if details and "reason" in details:
            description += f" (Reason: {details['reason']})"

        await audit_logging_service.log_audit_event(
            activity_type=activity_type or action,
            activity_description=description,
            activity_status=derived_status,
            user_id=user_id,
            username=username,
            file_id=resource_id,
            file_name=resource_name,
            ip_address=ip_address,
            details=details
        )

        # 3. Evaluate Suspicious Activity Detection Rules
        try:
            from app.security_monitoring.detection import suspicious_activity_detector
            await suspicious_activity_detector.evaluate_activity(
                action=action,
                user_id=user_id,
                username=username,
                ip_address=ip_address,
                resource_id=resource_id,
                resource_name=resource_name,
                status=derived_status,
                details=details
            )
        except Exception:
            pass

        return act_res

    except Exception as e:
        # Fallback to direct insertion if service import fails
        try:
            now_iso = datetime.now(timezone.utc).isoformat()
            derived_status = status or ("failed" if any(x in action.upper() for x in ["FAIL", "DENIED", "UNAUTHORIZED", "ERROR"]) else "successful")
            log_entry = {
                "activity_id": f"act_{uuid.uuid4().hex}",
                "log_id": f"audit_{uuid.uuid4().hex}",
                "user_id": user_id,
                "username": username or "system",
                "action": action,
                "activity_type": action.lower(),
                "file_id": resource_id,
                "resource_id": resource_id,
                "resource_name": resource_name,
                "activity_description": f"User {username} performed {action}",
                "activity_status": derived_status,
                "status": derived_status,
                "ip_address": ip_address,
                "details": details or {},
                "timestamp": now_iso,
                "date_and_time": now_iso
            }
            await mongo_db.activity_logs.insert_one(log_entry)
            await mongo_db.audit_logs.insert_one(dict(log_entry))
            return log_entry
        except Exception as err:
            print(f"[ActivityLog Error] Failed to write audit log: {err}")
            return None
