"""
TrustShare - Security Monitoring Routes
========================================
RESTful endpoints for Suspicious Activity Detection and Security Alerts.
- GET /security-monitoring/summary
- GET /security-monitoring/events
- PATCH /security-monitoring/events/{event_id}/status
- POST /security-monitoring/trigger-scan
"""

from typing import Optional
from fastapi import APIRouter, Depends, Query, HTTPException, status

from app.models import User, UserRole
from app.security import require_role
from app.security_monitoring.service import security_monitoring_service
from app.security_monitoring.detection import suspicious_activity_detector
from app.security_monitoring.schemas import (
    SecurityEventFilterParams,
    SecurityEventListResponse,
    SecurityMonitoringSummaryResponse,
    UpdateEventStatusRequest
)

router = APIRouter(prefix="/security-monitoring", tags=["Suspicious Activity Detection"])

admin_only = require_role(UserRole.ADMIN)


def build_security_filters(
    user_id: Optional[int] = Query(None, description="Filter by user ID"),
    username: Optional[str] = Query(None, description="Filter by username"),
    event_type: Optional[str] = Query(None, description="Filter by event type"),
    severity: Optional[str] = Query(None, description="Filter by severity: Low, Medium, High, Critical"),
    status: Optional[str] = Query(None, description="Filter by status: Open, Investigating, Resolved, Dismissed"),
    start_date: Optional[str] = Query(None, description="Start date (YYYY-MM-DD or ISO)"),
    end_date: Optional[str] = Query(None, description="End date (YYYY-MM-DD or ISO)"),
    limit: int = Query(50, ge=1, le=500),
    skip: int = Query(0, ge=0)
) -> SecurityEventFilterParams:
    return SecurityEventFilterParams(
        user_id=user_id,
        username=username,
        event_type=event_type,
        severity=severity,
        status=status,
        start_date=start_date,
        end_date=end_date,
        limit=limit,
        skip=skip
    )


# ==============================================================================
# 1. GET /security-monitoring/summary (SUMMARY METRICS)
# ==============================================================================
@router.get("/summary", response_model=SecurityMonitoringSummaryResponse)
async def get_security_monitoring_summary(current_admin: User = Depends(admin_only)):
    """
    Retrieve security monitoring metrics:
    - Total security events
    - Failed login attempts
    - Unauthorized access attempts
    - Suspicious downloads
    - Expired link access attempts
    - Recent security alerts
    """
    return await security_monitoring_service.get_security_summary()


# ==============================================================================
# 2. GET /security-monitoring/events (EVENTS WITH FILTERS)
# ==============================================================================
@router.get("/events", response_model=SecurityEventListResponse)
async def get_security_events(
    filters: SecurityEventFilterParams = Depends(build_security_filters),
    current_admin: User = Depends(admin_only)
):
    """
    Retrieve security events filtered by User, Event Type, Severity, Date Range, and Status.
    """
    return await security_monitoring_service.get_security_events(filters)


# ==============================================================================
# 3. PATCH /security-monitoring/events/{event_id}/status (STATUS UPDATE)
# ==============================================================================
@router.patch("/events/{event_id}/status")
async def update_security_event_status(
    event_id: str,
    req: UpdateEventStatusRequest,
    current_admin: User = Depends(admin_only)
):
    """
    Update investigation/resolution status for an incident (Open, Investigating, Resolved, Dismissed).
    """
    success = await security_monitoring_service.update_event_status(
        event_id=event_id,
        new_status=req.status,
        notes=req.resolution_notes
    )
    if not success:
        raise HTTPException(status_code=404, detail="Security event not found.")
    return {"status": "success", "event_id": event_id, "new_status": req.status}


# ==============================================================================
# 4. POST /security-monitoring/trigger-scan
# ==============================================================================
@router.post("/trigger-scan")
async def trigger_security_scan(current_admin: User = Depends(admin_only)):
    """
    Manually triggers security rule scan on recent audit events.
    """
    from app.database import mongo_db
    cursor = mongo_db.audit_logs.find({}).sort("date_and_time", -1).limit(100)
    logs = await cursor.to_list(length=100)

    events_triggered = 0
    for l in logs:
        action = l.get("activity_type") or l.get("action")
        ev = await suspicious_activity_detector.evaluate_activity(
            action=action,
            user_id=l.get("user_id"),
            username=l.get("username"),
            ip_address=l.get("ip_address", "127.0.0.1"),
            resource_id=l.get("file_id"),
            resource_name=l.get("file_name"),
            status=l.get("activity_status"),
            details=l.get("details")
        )
        if ev:
            events_triggered += 1

    return {"status": "success", "logs_scanned": len(logs), "new_events_triggered": events_triggered}

