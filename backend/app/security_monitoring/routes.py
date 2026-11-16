from typing import List, Optional
from fastapi import APIRouter, Depends, Query, HTTPException
from app.models.user import User
from app.routers.admin import require_admin
from app.security_monitoring.service import SecurityMonitoringService
from app.security_monitoring.detection import SecurityDetectionEngine

router = APIRouter(prefix="/security-monitoring", tags=["Suspicious Activity Detection & Threat Center"])


@router.get("/summary")
def get_security_summary(
    admin: User = Depends(require_admin),
):
    """
    Task 6 Step 6: Security overview KPIs:
    Total security events, failed logins, unauthorized access, suspicious downloads, expired link attempts.
    """
    return SecurityMonitoringService.get_security_summary()


@router.get("/alerts")
def get_security_alerts(
    severity: Optional[str] = Query(default=None),
    activity_type: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=100),
    skip: int = Query(default=0, ge=0),
    admin: User = Depends(require_admin),
):
    """
    Task 6 Step 5 & 7: Retrieves detected security alerts with severity and filter controls.
    """
    return SecurityMonitoringService.get_security_alerts(
        severity=severity,
        activity_type=activity_type,
        status=status,
        limit=limit,
        skip=skip,
    )


@router.post("/alerts/{alert_id}/resolve")
def resolve_security_alert(
    alert_id: int,
    admin: User = Depends(require_admin),
):
    """Marks a security alert as resolved/investigated."""
    success = SecurityMonitoringService.resolve_alert(alert_id=alert_id)
    if not success:
        raise HTTPException(status_code=404, detail="Security alert not found")
    return {"status": "success", "message": f"Alert #{alert_id} resolved"}


@router.post("/simulate-suspicious-event")
async def simulate_suspicious_event(
    event_type: str = Query(..., description="FAILED_LOGINS, UNAUTHORIZED_ACCESS, EXCESSIVE_DOWNLOADS, EXPIRED_LINK_ACCESS, REVOKED_LINK_ACCESS"),
    admin: User = Depends(require_admin),
):
    """
    Step 8 Test helper: Triggers a simulated suspicious activity event for testing the detection rules.
    """
    if event_type == "FAILED_LOGINS":
        await SecurityDetectionEngine.trigger_security_alert(
            user_id=None,
            user_email="attacker@external-probe.com",
            ip_address="198.51.100.42",
            activity_type="FAILED_LOGINS",
            description="Multiple failed login attempts (6 failures in 10 minutes) detected for attacker@external-probe.com.",
            severity="High",
            details={"failures_count": 6, "window_minutes": 10},
        )
    elif event_type == "UNAUTHORIZED_ACCESS":
        await SecurityDetectionEngine.trigger_security_alert(
            user_id=None,
            user_email="probe@unauthorized.org",
            ip_address="203.0.113.19",
            activity_type="UNAUTHORIZED_ACCESS",
            description="Repeated unauthorized file download attempts detected on restricted vault objects.",
            severity="High",
            details={"violations_count": 4},
        )
    elif event_type == "EXCESSIVE_DOWNLOADS":
        await SecurityDetectionEngine.trigger_security_alert(
            user_id=admin.id,
            user_email=admin.email,
            ip_address="127.0.0.1",
            activity_type="EXCESSIVE_DOWNLOADS",
            description="Suspicious download spike: 25 downloads within 5 minutes.",
            severity="Medium",
            details={"download_count": 25, "window_minutes": 5},
        )
    elif event_type == "EXPIRED_LINK_ACCESS":
        await SecurityDetectionEngine.trigger_security_alert(
            user_id=None,
            user_email=None,
            ip_address="192.0.2.77",
            activity_type="EXPIRED_LINK_ACCESS",
            description="Repeated attempts to access expired sharing link (Token: tk_exp_...)",
            severity="Medium",
            details={"token": "tk_exp_test"},
        )
    elif event_type == "REVOKED_LINK_ACCESS":
        await SecurityDetectionEngine.trigger_security_alert(
            user_id=None,
            user_email=None,
            ip_address="192.0.2.88",
            activity_type="REVOKED_LINK_ACCESS",
            description="Attempt to access permanently revoked sharing link (Token: tk_rev_...)",
            severity="High",
            details={"token": "tk_rev_test"},
        )
    else:
        raise HTTPException(status_code=400, detail="Invalid event_type")

    return {"status": "success", "message": f"Suspicious event '{event_type}' simulated successfully."}

