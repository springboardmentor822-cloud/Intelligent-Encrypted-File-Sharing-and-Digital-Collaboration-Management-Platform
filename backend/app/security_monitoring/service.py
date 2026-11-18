"""
TrustShare - Security Monitoring Service
=========================================
Handles query, filtration, and status management for security events:
- Security monitoring metrics & dashboard aggregation.
- Multi-criteria filtering by user, event type, severity, date range, and status.
"""

from typing import Optional, List, Dict, Any, Tuple
from datetime import datetime, timezone

from app.database import mongo_db
from app.security_monitoring.schemas import (
    SecurityEventFilterParams,
    SecurityEventRecord,
    SecurityEventListResponse,
    SecurityMonitoringSummaryResponse
)


class SecurityMonitoringService:
    """Manages retrieval and lifecycle updates for suspicious security events."""

    @staticmethod
    def _parse_dt(dt_val: Any) -> Optional[datetime]:
        if not dt_val:
            return None
        if isinstance(dt_val, datetime):
            if dt_val.tzinfo is None:
                return dt_val.replace(tzinfo=timezone.utc)
            return dt_val.astimezone(timezone.utc)
        try:
            s = str(dt_val).replace("Z", "+00:00")
            if len(s) == 10 and "-" in s:
                s = f"{s}T00:00:00+00:00"
            dt = datetime.fromisoformat(s)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt.astimezone(timezone.utc)
        except Exception:
            return None

    @classmethod
    async def get_security_events(
        cls,
        filters: SecurityEventFilterParams
    ) -> SecurityEventListResponse:
        """
        Retrieve security events with multi-criteria filtering:
        - user_id / username
        - event_type
        - severity
        - date_range
        - status
        """
        query: Dict[str, Any] = {}

        if filters.user_id:
            query["user_id"] = filters.user_id
        if filters.username:
            query["username"] = {"$regex": filters.username.strip(), "$options": "i"}
        if filters.event_type and filters.event_type != "all":
            query["event_type"] = filters.event_type
        if filters.severity and filters.severity != "all":
            query["severity"] = {"$regex": f"^{filters.severity}$", "$options": "i"}
        if filters.status and filters.status != "all":
            query["status"] = {"$regex": f"^{filters.status}$", "$options": "i"}

        if filters.start_date or filters.end_date:
            date_filter: Dict[str, Any] = {}
            if filters.start_date:
                date_filter["$gte"] = filters.start_date
            if filters.end_date:
                date_filter["$lte"] = f"{filters.end_date}T23:59:59"
            query["date_and_time"] = date_filter

        total = await mongo_db.security_events.count_documents(query)
        open_count = await mongo_db.security_events.count_documents({"status": "Open"})
        resolved_count = await mongo_db.security_events.count_documents({"status": {"$in": ["Resolved", "Dismissed"]}})

        cursor = mongo_db.security_events.find(query).sort("date_and_time", -1).skip(filters.skip).limit(filters.limit)
        docs = await cursor.to_list(length=filters.limit)

        records: List[SecurityEventRecord] = []
        for d in docs:
            d["_id"] = str(d["_id"])
            records.append(SecurityEventRecord(
                event_id=d.get("event_id", str(d["_id"])),
                alert_id=d.get("alert_id", "alert_unknown"),
                user_id=d.get("user_id"),
                username=d.get("username") or "Unknown",
                ip_address=d.get("ip_address", "127.0.0.1"),
                event_type=d.get("event_type", "suspicious_activity"),
                rule_name=d.get("rule_name", "Security Rule Triggered"),
                description=d.get("description", "Unusual behavior detected"),
                severity=d.get("severity", "High"),
                status=d.get("status", "Open"),
                date_and_time=d.get("date_and_time", datetime.now(timezone.utc).isoformat()),
                resource_id=d.get("resource_id"),
                resource_name=d.get("resource_name"),
                attempt_count=d.get("attempt_count", 1),
                details=d.get("details")
            ))

        return SecurityEventListResponse(
            total=total,
            open_events_count=open_count,
            resolved_events_count=resolved_count,
            events=records
        )

    @classmethod
    async def get_security_summary(cls) -> SecurityMonitoringSummaryResponse:
        """
        Develop the security monitoring summary metrics:
        - Total security events
        - Failed login attempts
        - Unauthorized access attempts
        - Suspicious downloads
        - Expired link access attempts
        - Revoked link access attempts
        - Recent security alerts
        """
        total_events = await mongo_db.security_events.count_documents({})

        # Count events from security_events collection
        failed_logins = await mongo_db.security_events.count_documents({"event_type": "failed_logins"})
        unauthorized = await mongo_db.security_events.count_documents({"event_type": "unauthorized_access"})
        downloads = await mongo_db.security_events.count_documents({"event_type": "excessive_downloads"})
        expired = await mongo_db.security_events.count_documents({"event_type": "expired_link"})
        revoked = await mongo_db.security_events.count_documents({"event_type": "revoked_link"})

        # Fallback to audit logs if security_events count is smaller
        if failed_logins == 0:
            failed_logins = await mongo_db.audit_logs.count_documents({
                "activity_type": {"$in": ["login", "security"]},
                "activity_status": "failed"
            })
        if unauthorized == 0:
            unauthorized = await mongo_db.audit_logs.count_documents({
                "activity_status": {"$in": ["denied", "blocked"]}
            })

        cursor = mongo_db.security_events.find({}).sort("date_and_time", -1).limit(10)
        recent_docs = await cursor.to_list(length=10)

        recent_alerts: List[SecurityEventRecord] = []
        for d in recent_docs:
            recent_alerts.append(SecurityEventRecord(
                event_id=d.get("event_id", str(d["_id"])),
                alert_id=d.get("alert_id", "alert_unknown"),
                user_id=d.get("user_id"),
                username=d.get("username") or "Unknown",
                ip_address=d.get("ip_address", "127.0.0.1"),
                event_type=d.get("event_type", "suspicious_activity"),
                rule_name=d.get("rule_name", "Security Rule Triggered"),
                description=d.get("description", "Unusual behavior detected"),
                severity=d.get("severity", "High"),
                status=d.get("status", "Open"),
                date_and_time=d.get("date_and_time", datetime.now(timezone.utc).isoformat()),
                resource_id=d.get("resource_id"),
                resource_name=d.get("resource_name"),
                attempt_count=d.get("attempt_count", 1),
                details=d.get("details")
            ))

        return SecurityMonitoringSummaryResponse(
            total_security_events=total_events,
            failed_login_attempts=failed_logins,
            unauthorized_access_attempts=unauthorized,
            suspicious_downloads=downloads,
            expired_link_access_attempts=expired,
            revoked_link_access_attempts=revoked,
            recent_security_alerts=recent_alerts
        )

    @classmethod
    async def update_event_status(
        cls,
        event_id: str,
        new_status: str,
        notes: Optional[str] = None
    ) -> bool:
        """Updates resolution status for an incident (Open, Investigating, Resolved, Dismissed)."""
        res = await mongo_db.security_events.update_one(
            {"event_id": event_id},
            {
                "$set": {
                    "status": new_status,
                    "resolution_notes": notes,
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }
            }
        )
        return res.modified_count > 0


security_monitoring_service = SecurityMonitoringService()

