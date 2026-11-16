from fastapi import APIRouter, Depends
from app.models.user import User
from app.routers.admin import require_admin
from app.analytics.service import AnalyticsService

router = APIRouter(prefix="/analytics", tags=["Storage Analytics & Usage Monitoring"])


@router.get("/storage")
def get_storage_analytics(
    admin: User = Depends(require_admin),
):
    """
    Task 5 Step 5: GET /analytics/storage
    Retrieve total combined storage usage calculated from actual stored file sizes.
    """
    return AnalyticsService.get_total_storage()


@router.get("/users/storage")
def get_user_storage_analytics(
    admin: User = Depends(require_admin),
):
    """
    Task 5 Step 5: GET /analytics/users/storage
    Retrieve user-wise storage usage (User, Files Uploaded, Storage Used).
    """
    return AnalyticsService.get_user_storage_usage()


@router.get("/files")
def get_file_analytics(
    admin: User = Depends(require_admin),
):
    """
    Task 5 Step 5: GET /analytics/files
    Retrieve overall file statistics and most frequently downloaded files.
    """
    return AnalyticsService.get_file_statistics()


@router.get("/downloads")
def get_download_analytics(
    admin: User = Depends(require_admin),
):
    """
    Task 5 Step 5: GET /analytics/downloads
    Retrieve download statistics timeline and success rates.
    """
    return AnalyticsService.get_download_statistics()


@router.get("/sharing")
def get_sharing_analytics(
    admin: User = Depends(require_admin),
):
    """
    Task 5 Step 5: GET /analytics/sharing
    Retrieve sharing statistics, active vs expired vs revoked links.
    """
    return AnalyticsService.get_sharing_statistics()

