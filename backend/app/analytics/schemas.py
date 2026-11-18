"""
TrustShare - Storage Analytics Schemas
=======================================
Pydantic response models for storage analytics and reporting endpoints.
"""

from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


class AnalyticsFilterParams(BaseModel):
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    user_id: Optional[int] = None
    username: Optional[str] = None
    file_type: Optional[str] = None
    activity_type: Optional[str] = None
    days: int = Field(30, ge=1, le=365)


# ------------------------------------------------------------------------------
# STORAGE USAGE SCHEMAS
# ------------------------------------------------------------------------------
class StorageLocationBreakdown(BaseModel):
    provider: str
    file_count: int
    total_bytes: int
    formatted_size: str


class StorageAnalyticsResponse(BaseModel):
    total_storage_bytes: int
    total_storage_formatted: str
    total_files: int
    storage_location_breakdown: List[StorageLocationBreakdown]
    category_breakdown: Dict[str, Dict[str, Any]]
    quota_limit_bytes: int = 524288000  # Default 500 MB system pool
    quota_limit_formatted: str = "500.00 MB"
    used_percentage: float


# ------------------------------------------------------------------------------
# USER-WISE STORAGE SCHEMAS
# ------------------------------------------------------------------------------
class UserStorageItem(BaseModel):
    user_id: int
    username: str
    email: str
    full_name: Optional[str] = None
    files_uploaded: int
    storage_used_bytes: int
    storage_used_formatted: str
    storage_percentage: float


class UserStorageResponse(BaseModel):
    total_users_with_storage: int
    combined_storage_bytes: int
    combined_storage_formatted: str
    users: List[UserStorageItem]


# ------------------------------------------------------------------------------
# FILE STATISTICS SCHEMAS
# ------------------------------------------------------------------------------
class MostDownloadedFileStat(BaseModel):
    file_id: str
    file_name: str
    owner_username: Optional[str] = None
    download_count: int
    file_size_bytes: int
    file_size_formatted: str
    category: str


class FileStatisticsResponse(BaseModel):
    total_uploaded_files: int
    total_downloaded_files: int
    total_shared_files: int
    total_storage_occupied_bytes: int
    total_storage_occupied_formatted: str
    average_file_size_bytes: int
    average_file_size_formatted: str
    largest_file: Optional[Dict[str, Any]] = None
    encrypted_files_count: int
    files_by_category: Dict[str, int]
    storage_used_by_users: List[UserStorageItem]
    most_frequently_downloaded: List[MostDownloadedFileStat]


# ------------------------------------------------------------------------------
# DOWNLOAD & SHARING STATS
# ------------------------------------------------------------------------------
class DownloadsByDateStat(BaseModel):
    date: str
    downloads_count: int
    failed_attempts: int


class DownloadStatisticsResponse(BaseModel):
    total_downloads: int
    unique_files_downloaded: int
    failed_downloads_count: int
    downloads_by_user: List[Dict[str, Any]]
    most_downloaded_files: List[MostDownloadedFileStat]
    downloads_by_date: List[DownloadsByDateStat]


class SharesByDateStat(BaseModel):
    date: str
    active_shares: int
    expired_shares: int
    revoked_shares: int


class SharingStatisticsResponse(BaseModel):
    total_shared_files: int
    total_sharing_links: int
    active_sharing_links: int
    expired_sharing_links: int
    revoked_sharing_links: int
    permission_distribution: Dict[str, int]
    shares_by_user: List[Dict[str, Any]]
    shares_by_date: List[SharesByDateStat]


# ------------------------------------------------------------------------------
# FULL DASHBOARD & CHARTS
# ------------------------------------------------------------------------------
class ChartDataPoint(BaseModel):
    label: str
    value: float
    secondary_value: Optional[float] = None
    color: Optional[str] = None
    percentage: Optional[float] = None


class DashboardAnalyticsResponse(BaseModel):
    generated_at: str
    filters_applied: Dict[str, Any]
    storage: StorageAnalyticsResponse
    user_storage: List[UserStorageItem]
    files: FileStatisticsResponse
    downloads: DownloadStatisticsResponse
    sharing: SharingStatisticsResponse
    charts: Dict[str, List[Dict[str, Any]]]

