"""
TrustShare - Reports Schemas
=============================
Pydantic data transfer models for File Activity and Security Reports.
Supports granular filtering by user, activity type, file, date range, and status.
"""

from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


class ReportFilterParams(BaseModel):
    user_id: Optional[int] = None
    username: Optional[str] = None
    activity_type: Optional[str] = None
    file_id: Optional[str] = None
    file_name: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    status: Optional[str] = None
    limit: int = Field(100, ge=1, le=1000)
    skip: int = Field(0, ge=0)


# ------------------------------------------------------------------------------
# FILE UPLOAD REPORT SCHEMAS
# ------------------------------------------------------------------------------
class FileUploadSummaryByUser(BaseModel):
    user_id: Optional[int] = None
    username: str
    full_name: Optional[str] = None
    file_count: int
    total_bytes: int


class FileTypeDistribution(BaseModel):
    file_type: str
    count: int
    total_bytes: int


class FileUploadRecord(BaseModel):
    file_id: str
    file_name: str
    owner_id: Optional[int] = None
    owner_username: Optional[str] = None
    file_size: int
    mime_type: Optional[str] = None
    file_type: str
    is_encrypted: bool = True
    upload_status: str = "successful"
    created_at: str


class FileUploadReportResponse(BaseModel):
    total_files_uploaded: int
    total_bytes_uploaded: int
    files_by_user: List[FileUploadSummaryByUser]
    file_type_distribution: List[FileTypeDistribution]
    upload_status_breakdown: Dict[str, int]
    records: List[FileUploadRecord]


# ------------------------------------------------------------------------------
# FILE DOWNLOAD REPORT SCHEMAS
# ------------------------------------------------------------------------------
class FileDownloadSummaryByUser(BaseModel):
    user_id: Optional[int] = None
    username: str
    download_count: int


class MostDownloadedFileItem(BaseModel):
    file_id: str
    file_name: str
    owner_username: Optional[str] = None
    download_count: int
    file_size: Optional[int] = None


class FileDownloadRecord(BaseModel):
    log_id: Optional[str] = None
    file_id: Optional[str] = None
    file_name: Optional[str] = None
    user_id: Optional[int] = None
    username: str
    ip_address: Optional[str] = None
    date_and_time: str
    status: str
    is_failed: bool = False
    failure_reason: Optional[str] = None


class FileDownloadReportResponse(BaseModel):
    total_downloads: int
    downloads_by_user: List[FileDownloadSummaryByUser]
    most_downloaded_files: List[MostDownloadedFileItem]
    failed_downloads_count: int
    failed_downloads: List[FileDownloadRecord]
    records: List[FileDownloadRecord]


# ------------------------------------------------------------------------------
# FILE SHARING REPORT SCHEMAS
# ------------------------------------------------------------------------------
class SharesByUserItem(BaseModel):
    user_id: Optional[int] = None
    username: str
    share_count: int


class ShareRecipientItem(BaseModel):
    recipient_email: str
    share_count: int


class FileShareRecord(BaseModel):
    share_id: str
    file_id: str
    file_name: str
    owner_id: Optional[int] = None
    owner_username: Optional[str] = None
    recipient_email: Optional[str] = None
    permission: str
    is_active: bool
    is_expired: bool
    is_revoked: bool
    status: str  # "active" | "expired" | "revoked"
    downloads_count: int
    max_downloads: Optional[int] = None
    created_at: str
    expires_at: Optional[str] = None


class FileSharingReportResponse(BaseModel):
    total_files_shared: int
    total_sharing_links: int
    shares_by_user: List[SharesByUserItem]
    recipients: List[ShareRecipientItem]
    active_links_count: int
    expired_links_count: int
    revoked_links_count: int
    records: List[FileShareRecord]


# ------------------------------------------------------------------------------
# USER ACTIVITY REPORT SCHEMAS
# ------------------------------------------------------------------------------
class UserActivitySummary(BaseModel):
    user_id: int
    username: str
    email: str
    full_name: Optional[str] = None
    role: str
    is_active: bool
    login_count: int
    upload_count: int
    download_count: int
    share_count: int
    failed_actions_count: int
    last_active: Optional[str] = None


class UserActivityTimelineEvent(BaseModel):
    log_id: str
    user_id: Optional[int] = None
    username: str
    activity_type: str
    activity_description: str
    activity_status: str
    file_id: Optional[str] = None
    file_name: Optional[str] = None
    ip_address: str
    date_and_time: str
    details: Optional[Dict[str, Any]] = None


class UserActivityReportResponse(BaseModel):
    total_users: int
    active_users_count: int
    user_summaries: List[UserActivitySummary]
    activity_timeline: List[UserActivityTimelineEvent]


# ------------------------------------------------------------------------------
# SECURITY REPORT SCHEMAS
# ------------------------------------------------------------------------------
class SecurityIncidentRecord(BaseModel):
    log_id: str
    incident_type: str  # "failed_login" | "unauthorized_access" | "suspicious_download" | "expired_link" | "revoked_link"
    title: str
    description: str
    user_id: Optional[int] = None
    username: Optional[str] = None
    target_resource: Optional[str] = None
    ip_address: str
    date_and_time: str
    severity: str = "medium"  # "low" | "medium" | "high" | "critical"
    details: Optional[Dict[str, Any]] = None


class SecurityReportResponse(BaseModel):
    total_security_events: int
    failed_logins_count: int
    unauthorized_access_count: int
    suspicious_downloads_count: int
    expired_link_access_count: int
    revoked_link_access_count: int
    security_alerts_generated: int
    incidents: List[SecurityIncidentRecord]


# ------------------------------------------------------------------------------
# COMPREHENSIVE OVERVIEW / DASHBOARD SUMMARY
# ------------------------------------------------------------------------------
class ReportSummaryMetrics(BaseModel):
    total_uploads: int
    total_upload_bytes: int
    total_downloads: int
    failed_downloads: int
    total_shares: int
    active_shares: int
    expired_shares: int
    revoked_shares: int
    total_users: int
    total_security_incidents: int
    security_alerts: int


class ComprehensiveReportResponse(BaseModel):
    generated_at: str
    date_range_applied: Dict[str, Optional[str]]
    metrics: ReportSummaryMetrics
    top_uploaders: List[FileUploadSummaryByUser]
    top_downloaders: List[FileDownloadSummaryByUser]
    most_downloaded_files: List[MostDownloadedFileItem]
    recent_security_incidents: List[SecurityIncidentRecord]
    recent_uploads: List[FileUploadRecord]

