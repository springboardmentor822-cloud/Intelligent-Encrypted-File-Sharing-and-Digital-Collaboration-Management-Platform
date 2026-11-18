from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List
from datetime import datetime

class ActivityRecordCreate(BaseModel):
    user_id: Optional[int] = None
    username: Optional[str] = None
    activity_type: str = Field(..., description="Login, upload, download, or sharing")
    file_id: Optional[str] = Field(None, description="Related file identification, if applicable")
    resource_name: Optional[str] = None
    status: str = Field("successful", description="Successful or failed")
    ip_address: str = Field("127.0.0.1", description="Source IP address")
    details: Optional[Dict[str, Any]] = None


class ActivityRecordResponse(BaseModel):
    activity_id: str = Field(..., description="Unique identification for each activity")
    user_id: Optional[int] = Field(None, description="User who performed the activity")
    username: Optional[str] = None
    activity_type: str = Field(..., description="Login, upload, download, or sharing")
    file_id: Optional[str] = Field(None, description="Related file identification, if applicable")
    resource_name: Optional[str] = None
    status: str = Field(..., description="Successful or failed")
    ip_address: str = Field(..., description="Source IP address")
    timestamp: str = Field(..., description="Date and time of activity")
    details: Optional[Dict[str, Any]] = None


class ActivityListResponse(BaseModel):
    total: int
    page: int
    page_size: int
    activities: List[ActivityRecordResponse]


class ActivitySummaryStats(BaseModel):
    total_activities: int
    successful_activities: int
    failed_activities: int
    logins_count: int
    failed_logins_count: int
    uploads_count: int
    downloads_count: int
    shares_count: int
    unauthorized_attempts_count: int
    activity_breakdown: Dict[str, int]

