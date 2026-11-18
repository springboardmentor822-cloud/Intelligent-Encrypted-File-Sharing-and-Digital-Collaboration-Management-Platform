"""
TrustShare - Storage Analytics Routes
======================================
FastAPI endpoints for storage, user usage, and file activity monitoring.
- GET /analytics/storage
- GET /analytics/users/storage
- GET /analytics/files
- GET /analytics/downloads
- GET /analytics/sharing
- GET /analytics/dashboard
"""

from typing import Optional
from fastapi import APIRouter, Depends, Query, status

from app.models import User, UserRole
from app.security import require_role
from app.analytics.service import storage_analytics_service
from app.analytics.schemas import (
    AnalyticsFilterParams,
    StorageAnalyticsResponse,
    UserStorageResponse,
    FileStatisticsResponse,
    DownloadStatisticsResponse,
    SharingStatisticsResponse,
    DashboardAnalyticsResponse
)

router = APIRouter(prefix="/analytics", tags=["Storage Analytics & Usage Monitoring"])

# Strict Administrator-Only Access Control
admin_only = require_role(UserRole.ADMIN)


def build_analytics_filters(
    start_date: Optional[str] = Query(None, description="Start date (YYYY-MM-DD or ISO)"),
    end_date: Optional[str] = Query(None, description="End date (YYYY-MM-DD or ISO)"),
    user_id: Optional[int] = Query(None, description="Filter by user ID"),
    username: Optional[str] = Query(None, description="Filter by username"),
    file_type: Optional[str] = Query(None, description="Filter by category or file type"),
    activity_type: Optional[str] = Query(None, description="Filter by activity"),
    days: int = Query(30, ge=1, le=365, description="Lookback window in days")
) -> AnalyticsFilterParams:
    """Dependency helper parsing analytics query filters."""
    return AnalyticsFilterParams(
        start_date=start_date,
        end_date=end_date,
        user_id=user_id,
        username=username,
        file_type=file_type,
        activity_type=activity_type,
        days=days
    )


# ==============================================================================
# 1. GET /analytics/storage (TOTAL STORAGE USAGE)
# ==============================================================================
@router.get("/storage", response_model=StorageAnalyticsResponse)
async def get_storage_usage(
    filters: AnalyticsFilterParams = Depends(build_analytics_filters),
    current_admin: User = Depends(admin_only)
):
    """
    Retrieve total storage usage.
    Calculates combined size of all uploaded files using actual stored file sizes.
    """
    return await storage_analytics_service.get_storage_usage(filters)


# ==============================================================================
# 2. GET /analytics/users/storage (USER-WISE STORAGE USAGE)
# ==============================================================================
@router.get("/users/storage", response_model=UserStorageResponse)
async def get_user_storage_usage(
    filters: AnalyticsFilterParams = Depends(build_analytics_filters),
    current_admin: User = Depends(admin_only)
):
    """
    Retrieve user-wise storage usage.
    Calculates storage consumption for each individual user (User, Files Uploaded, Storage Used).
    """
    return await storage_analytics_service.get_user_storage_usage(filters)


# ==============================================================================
# 3. GET /analytics/files (FILE STATISTICS)
# ==============================================================================
@router.get("/files", response_model=FileStatisticsResponse)
async def get_file_statistics(
    filters: AnalyticsFilterParams = Depends(build_analytics_filters),
    current_admin: User = Depends(admin_only)
):
    """
    Retrieve file statistics.
    Returns:
    - Total uploaded files
    - Total downloaded files
    - Total shared files
    - Total storage occupied
    - Storage used by individual users
    - Most frequently downloaded files
    """
    return await storage_analytics_service.get_file_statistics(filters)


# ==============================================================================
# 4. GET /analytics/downloads (DOWNLOAD STATISTICS)
# ==============================================================================
@router.get("/downloads", response_model=DownloadStatisticsResponse)
async def get_download_statistics(
    filters: AnalyticsFilterParams = Depends(build_analytics_filters),
    current_admin: User = Depends(admin_only)
):
    """
    Retrieve download statistics.
    Returns total downloads, failed download attempts, and date-wise trends.
    """
    return await storage_analytics_service.get_download_statistics(filters)


# ==============================================================================
# 5. GET /analytics/sharing (SHARING STATISTICS)
# ==============================================================================
@router.get("/sharing", response_model=SharingStatisticsResponse)
async def get_sharing_statistics(
    filters: AnalyticsFilterParams = Depends(build_analytics_filters),
    current_admin: User = Depends(admin_only)
):
    """
    Retrieve sharing statistics.
    Returns active, expired, and revoked share link metrics.
    """
    return await storage_analytics_service.get_sharing_statistics(filters)


# ==============================================================================
# 6. GET /analytics/dashboard (FULL DASHBOARD SUITE)
# ==============================================================================
@router.get("/dashboard", response_model=DashboardAnalyticsResponse)
async def get_dashboard_analytics(
    filters: AnalyticsFilterParams = Depends(build_analytics_filters),
    current_admin: User = Depends(admin_only)
):
    """
    Retrieve comprehensive dashboard payload with pre-computed chart series:
    - Pie chart: storage usage by users.
    - Bar chart: file uploads by date.
    - Line/Bar chart: file downloads.
    - Chart: file sharing statistics.
    """
    return await storage_analytics_service.get_dashboard_analytics(filters)

