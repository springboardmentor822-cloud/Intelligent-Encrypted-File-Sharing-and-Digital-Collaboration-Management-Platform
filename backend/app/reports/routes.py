"""
TrustShare - Reports API Routes
================================
RESTful endpoints for File Activity and Security Reports (Administrator-only).
- GET /reports/uploads (File upload reports).
- GET /reports/downloads (File download reports).
- GET /reports/shares (File sharing reports).
- GET /reports/user-activity (User activity reports).
- GET /reports/security (Security reports).
- Filtering by user, activity type, file, date range, status.
- Comprehensive dashboard summary & CSV/JSON export.
"""

import csv
import io
from typing import Optional
from fastapi import APIRouter, Depends, Query, HTTPException, Response, status
from fastapi.responses import StreamingResponse

from app.models import User, UserRole
from app.security import require_role
from app.reports.service import reports_service
from app.reports.schemas import (
    ReportFilterParams,
    FileUploadReportResponse,
    FileDownloadReportResponse,
    FileSharingReportResponse,
    UserActivityReportResponse,
    SecurityReportResponse,
    ComprehensiveReportResponse
)

router = APIRouter(prefix="/reports", tags=["File Activity & Security Reports"])

# All reports require administrator privileges
admin_only = require_role(UserRole.ADMIN)


def build_filter_params(
    user_id: Optional[int] = Query(None, description="Filter by user ID"),
    username: Optional[str] = Query(None, description="Filter by username or email"),
    activity_type: Optional[str] = Query(None, description="Filter by activity category"),
    file_id: Optional[str] = Query(None, description="Filter by specific file ID"),
    file_name: Optional[str] = Query(None, description="Filter by file name"),
    start_date: Optional[str] = Query(None, description="Filter start date (ISO string or YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="Filter end date (ISO string or YYYY-MM-DD)"),
    status: Optional[str] = Query(None, description="Filter by operation status"),
    limit: int = Query(100, ge=1, le=1000, description="Max records to return"),
    skip: int = Query(0, ge=0, description="Records offset")
) -> ReportFilterParams:
    """Dependency helper to parse common report filter parameters."""
    return ReportFilterParams(
        user_id=user_id,
        username=username,
        activity_type=activity_type,
        file_id=file_id,
        file_name=file_name,
        start_date=start_date,
        end_date=end_date,
        status=status,
        limit=limit,
        skip=skip
    )


# ==============================================================================
# COMPREHENSIVE DASHBOARD SUMMARY
# ==============================================================================
@router.get("/summary", response_model=ComprehensiveReportResponse)
async def get_reports_summary(
    filters: ReportFilterParams = Depends(build_filter_params),
    current_admin: User = Depends(admin_only)
):
    """
    Retrieve comprehensive metrics and rollup statistics for the Admin Dashboard.
    """
    return await reports_service.get_comprehensive_summary(filters)


# ==============================================================================
# FILE UPLOAD REPORTS
# ==============================================================================
@router.get("/uploads", response_model=FileUploadReportResponse)
async def get_file_upload_report(
    filters: ReportFilterParams = Depends(build_filter_params),
    current_admin: User = Depends(admin_only)
):
    """
    Generate file upload reports.
    Returns:
    - Total files uploaded and total bytes
    - Uploads by each user
    - Upload date and time records
    - File type breakdown
    - Upload status breakdown
    """
    return await reports_service.get_upload_report(filters)


# ==============================================================================
# FILE DOWNLOAD REPORTS
# ==============================================================================
@router.get("/downloads", response_model=FileDownloadReportResponse)
async def get_file_download_report(
    filters: ReportFilterParams = Depends(build_filter_params),
    current_admin: User = Depends(admin_only)
):
    """
    Generate file download reports.
    Returns:
    - Total downloads
    - Downloads by each user
    - Most downloaded files leaderboard
    - Download date and time records
    - Failed download attempts analysis
    """
    return await reports_service.get_download_report(filters)


# ==============================================================================
# FILE SHARING REPORTS
# ==============================================================================
@router.get("/shares", response_model=FileSharingReportResponse)
async def get_file_sharing_report(
    filters: ReportFilterParams = Depends(build_filter_params),
    current_admin: User = Depends(admin_only)
):
    """
    Generate file-sharing reports.
    Returns:
    - Total files shared
    - Files shared by each user
    - Sharing recipients
    - Active sharing links count & list
    - Expired sharing links count & list
    - Revoked sharing links count & list
    """
    return await reports_service.get_sharing_report(filters)


# ==============================================================================
# USER ACTIVITY REPORTS
# ==============================================================================
@router.get("/user-activity", response_model=UserActivityReportResponse)
async def get_user_activity_report(
    filters: ReportFilterParams = Depends(build_filter_params),
    current_admin: User = Depends(admin_only)
):
    """
    Generate user activity reports.
    Returns:
    - Aggregated activities per user (login, upload, download, share counts)
    - Chronological timeline of individual user activities
    """
    return await reports_service.get_user_activity_report(filters)


# ==============================================================================
# SECURITY REPORTS
# ==============================================================================
@router.get("/security", response_model=SecurityReportResponse)
async def get_security_report(
    filters: ReportFilterParams = Depends(build_filter_params),
    current_admin: User = Depends(admin_only)
):
    """
    Generate security reports.
    Returns:
    - Failed login attempts
    - Unauthorized access attempts
    - Suspicious download activities
    - Expired link access attempts
    - Revoked link access attempts
    - Security alerts generated
    """
    return await reports_service.get_security_report(filters)


# ==============================================================================
# EXPORT REPORTS (CSV / JSON)
# ==============================================================================
@router.get("/export")
async def export_report(
    category: str = Query("uploads", pattern="^(uploads|downloads|shares|user-activity|security)$"),
    export_format: str = Query("csv", pattern="^(csv|json)$"),
    filters: ReportFilterParams = Depends(build_filter_params),
    current_admin: User = Depends(admin_only)
):
    """
    Export report dataset in CSV or JSON format for administrative audit compliance.
    """
    # Override limit for complete export
    filters.limit = 5000

    if category == "uploads":
        rep = await reports_service.get_upload_report(filters)
        if export_format == "json":
            return rep.model_dump()
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["File ID", "File Name", "Owner Username", "Size Bytes", "File Type", "Status", "Created At"])
        for r in rep.records:
            writer.writerow([r.file_id, r.file_name, r.owner_username, r.file_size, r.file_type, r.upload_status, r.created_at])
        output.seek(0)
        return StreamingResponse(
            io.BytesIO(output.getvalue().encode("utf-8")),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=trustshare_uploads_report.csv"}
        )

    elif category == "downloads":
        rep = await reports_service.get_download_report(filters)
        if export_format == "json":
            return rep.model_dump()
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["Log ID", "File ID", "File Name", "Username", "IP Address", "Status", "Date and Time", "Failure Reason"])
        for r in rep.records:
            writer.writerow([r.log_id, r.file_id, r.file_name, r.username, r.ip_address, r.status, r.date_and_time, r.failure_reason])
        output.seek(0)
        return StreamingResponse(
            io.BytesIO(output.getvalue().encode("utf-8")),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=trustshare_downloads_report.csv"}
        )

    elif category == "shares":
        rep = await reports_service.get_sharing_report(filters)
        if export_format == "json":
            return rep.model_dump()
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["Share ID", "File Name", "Owner Username", "Recipient", "Permission", "Status", "Downloads", "Created At", "Expires At"])
        for r in rep.records:
            writer.writerow([r.share_id, r.file_name, r.owner_username, r.recipient_email, r.permission, r.status, r.downloads_count, r.created_at, r.expires_at])
        output.seek(0)
        return StreamingResponse(
            io.BytesIO(output.getvalue().encode("utf-8")),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=trustshare_shares_report.csv"}
        )

    elif category == "security":
        rep = await reports_service.get_security_report(filters)
        if export_format == "json":
            return rep.model_dump()
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["Log ID", "Incident Type", "Title", "Username", "Target Resource", "IP Address", "Severity", "Date and Time", "Description"])
        for i in rep.incidents:
            writer.writerow([i.log_id, i.incident_type, i.title, i.username, i.target_resource, i.ip_address, i.severity, i.date_and_time, i.description])
        output.seek(0)
        return StreamingResponse(
            io.BytesIO(output.getvalue().encode("utf-8")),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=trustshare_security_report.csv"}
        )

    else:  # user-activity
        rep = await reports_service.get_user_activity_report(filters)
        if export_format == "json":
            return rep.model_dump()
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["User ID", "Username", "Email", "Role", "Logins", "Uploads", "Downloads", "Shares", "Failed Actions", "Last Active"])
        for u in rep.user_summaries:
            writer.writerow([u.user_id, u.username, u.email, u.role, u.login_count, u.upload_count, u.download_count, u.share_count, u.failed_actions_count, u.last_active])
        output.seek(0)
        return StreamingResponse(
            io.BytesIO(output.getvalue().encode("utf-8")),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=trustshare_user_activity_report.csv"}
        )

