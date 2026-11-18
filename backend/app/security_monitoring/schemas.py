"""
TrustShare - Security Monitoring Schemas
=========================================
Pydantic models for Suspicious Activity Detection:
- Event and alert data structures.
- Filter and query parameter schemas.
- Resolution update and summary schemas.
"""

from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


class SecurityEventFilterParams(BaseModel):
    user_id: Optional[int] = None
    username: Optional[str] = None
    event_type: Optional[str] = None  # "failed_logins", "unauthorized_access", "excessive_downloads", "expired_link", "revoked_link"
    severity: Optional[str] = None    # "Low", "Medium", "High", "Critical"
    status: Optional[str] = None      # "Open", "Investigating", "Resolved", "Dismissed"
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    limit: int = Field(50, ge=1, le=500)
    skip: int = Field(0, ge=0)


class SecurityEventRecord(BaseModel):
    event_id: str
    alert_id: str
    user_id: Optional[int] = None
    username: Optional[str] = None
    ip_address: str = "127.0.0.1"
    event_type: str
    rule_name: str
    description: str
    severity: str = "High"  # "Low" | "Medium" | "High" | "Critical"
    status: str = "Open"    # "Open" | "Investigating" | "Resolved" | "Dismissed"
    date_and_time: str
    resource_id: Optional[str] = None
    resource_name: Optional[str] = None
    attempt_count: int = 1
    details: Optional[Dict[str, Any]] = None


class SecurityEventListResponse(BaseModel):
    total: int
    open_events_count: int
    resolved_events_count: int
    events: List[SecurityEventRecord]


class SecurityMonitoringSummaryResponse(BaseModel):
    total_security_events: int
    failed_login_attempts: int
    unauthorized_access_attempts: int
    suspicious_downloads: int
    expired_link_access_attempts: int
    revoked_link_access_attempts: int
    recent_security_alerts: List[SecurityEventRecord]


class UpdateEventStatusRequest(BaseModel):
    status: str = Field(..., pattern="^(Open|Investigating|Resolved|Dismissed)$")
    resolution_notes: Optional[str] = None

