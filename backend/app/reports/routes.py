from typing import Optional
from datetime import datetime
from fastapi import APIRouter, Depends, Query, HTTPException, Response
from app.models.user import User
from app.routers.admin import require_admin
from app.reports.service import ReportsService

router = APIRouter(prefix="/reports", tags=["Activity & Security Reporting"])


@router.get("/uploads")
def get_file_upload_report(
    start_date: Optional[datetime] = Query(default=None),
    end_date: Optional[datetime] = Query(default=None),
    admin: User = Depends(require_admin),
):
    """
    Task 4 Step 2: Generate file upload reports.
    Total files uploaded, files uploaded by each user, upload date/time, file type, upload status.
    """
    return ReportsService.get_upload_report(start_date=start_date, end_date=end_date)


@router.get("/downloads")
def get_file_download_report(
    start_date: Optional[datetime] = Query(default=None),
    end_date: Optional[datetime] = Query(default=None),
    admin: User = Depends(require_admin),
):
    """
    Task 4 Step 3: Generate file download reports.
    Total downloads, downloads by each user, most downloaded files, failed download attempts.
    """
    return ReportsService.get_download_report(start_date=start_date, end_date=end_date)


@router.get("/sharing")
def get_file_sharing_report(
    admin: User = Depends(require_admin),
):
    """
    Task 4 Step 4: Generate file sharing reports.
    Total files shared, files shared by each user, sharing recipients, active, expired & revoked links.
    """
    return ReportsService.get_sharing_report()


@router.get("/user/{user_id}")
def get_user_activity_report(
    user_id: int,
    admin: User = Depends(require_admin),
):
    """
    Task 4 Step 5: Generate user activity reports.
    Activities performed by individual users, including login, upload, download, and sharing history.
    """
    report = ReportsService.get_user_activity_report(user_id=user_id)
    if "error" in report:
        raise HTTPException(status_code=404, detail="User not found")
    return report


@router.get("/security")
def get_security_report(
    admin: User = Depends(require_admin),
):
    """
    Task 4 Step 6: Generate security reports.
    Failed login attempts, unauthorized access, suspicious downloads, expired/revoked link access.
    """
    return ReportsService.get_security_report()


@router.get("/export/csv")
def export_report_csv(
    report_type: str = Query(..., description="Report category: uploads, downloads, sharing, security"),
    admin: User = Depends(require_admin),
):
    """
    Milestone 3 Task 4 Step 7-8: Download report as CSV file for auditing.
    """
    if report_type not in ["uploads", "downloads", "sharing", "security"]:
        raise HTTPException(status_code=400, detail="Invalid report type. Allowed: uploads, downloads, sharing, security")

    csv_data = ReportsService.generate_csv_report(report_type)
    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename=trustshare_{report_type}_report.csv"
        },
    )


