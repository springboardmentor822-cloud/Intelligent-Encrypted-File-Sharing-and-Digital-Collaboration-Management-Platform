"""
TrustShare - Storage Analytics Service
=======================================
Retrieves actual file metadata from PostgreSQL and MongoDB:
- Connects to PostgreSQL `file_records` and MongoDB `file_metadata`
  to retrieve File ID, File name, File size, File owner, Upload date, Storage location.
- Calculates total storage usage (combined actual bytes).
- Calculates user-wise storage usage (User, Files Uploaded, Storage Used).
- Calculates file statistics (Total uploaded, downloaded, shared, top files).
- Powers FastAPI endpoints for storage, users/storage, files, downloads, sharing.
- Powers storage analytics dashboard, charts, and filters.
"""

import os
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any, Tuple
from collections import defaultdict

from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import SessionLocal, mongo_db
from app.models import User, UserRole, FileRecord
from app.analytics.schemas import (
    AnalyticsFilterParams,
    StorageAnalyticsResponse,
    StorageLocationBreakdown,
    UserStorageResponse,
    UserStorageItem,
    FileStatisticsResponse,
    MostDownloadedFileStat,
    DownloadStatisticsResponse,
    DownloadsByDateStat,
    SharingStatisticsResponse,
    SharesByDateStat,
    DashboardAnalyticsResponse
)


def format_bytes(num_bytes: int) -> str:
    """Formats raw byte count into human-readable string (B, KB, MB, GB, TB)."""
    if num_bytes is None or num_bytes <= 0:
        return "0 B"
    units = ["B", "KB", "MB", "GB", "TB", "PB"]
    size = float(num_bytes)
    idx = 0
    while size >= 1024.0 and idx < len(units) - 1:
        size /= 1024.0
        idx += 1
    if idx == 0:
        return f"{int(size)} {units[idx]}"
    return f"{size:.2f} {units[idx]}"


class StorageAnalyticsService:
    """Core analytics engine for storage, user usage, file operations, and telemetry."""

    @staticmethod
    def _parse_dt(dt_val: Any) -> Optional[datetime]:
        """Safely parses datetime string or object into timezone-aware UTC datetime."""
        if not dt_val:
            return None
        if isinstance(dt_val, datetime):
            if dt_val.tzinfo is None:
                return dt_val.replace(tzinfo=timezone.utc)
            return dt_val.astimezone(timezone.utc)
        try:
            s = str(dt_val).replace("Z", "+00:00")
            if len(s) == 10 and "-" in s:
                s = f"{s}T00:00:00+00:00"
            dt = datetime.fromisoformat(s)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt.astimezone(timezone.utc)
        except Exception:
            return None

    @classmethod
    def _matches_filters(
        cls,
        dt_val: Any,
        user_id: Optional[int],
        username: Optional[str],
        category: Optional[str],
        filters: AnalyticsFilterParams
    ) -> bool:
        """Evaluates whether an item matches active filters (Date range, User, File type)."""
        # Date range filter
        if filters.start_date or filters.end_date:
            record_dt = cls._parse_dt(dt_val)
            if record_dt:
                if filters.start_date:
                    start_dt = cls._parse_dt(filters.start_date)
                    if start_dt and record_dt < start_dt:
                        return False
                if filters.end_date:
                    end_dt = cls._parse_dt(filters.end_date)
                    if end_dt:
                        if len(str(filters.end_date).strip()) == 10:
                            end_dt = end_dt.replace(hour=23, minute=59, second=59, microsecond=999999)
                        if record_dt > end_dt:
                            return False

        # User filter
        if filters.user_id is not None and user_id is not None:
            if filters.user_id != user_id:
                return False
        if filters.username and username:
            if filters.username.strip().lower() not in username.strip().lower():
                return False

        # File type / category filter
        if filters.file_type and category:
            if filters.file_type.strip().lower() not in category.strip().lower():
                return False

        return True

    # --------------------------------------------------------------------------
    # RETRIEVE FILE INFORMATION (POSTGRESQL & MONGODB)
    # --------------------------------------------------------------------------
    @classmethod
    async def retrieve_all_file_records(
        cls,
        filters: AnalyticsFilterParams
    ) -> Tuple[List[Dict[str, Any]], Dict[int, Dict[str, Any]]]:
        """
        Retrieves actual file metadata stored in the vault system.
        Queries:
        - File ID
        - File name
        - File size
        - File owner (user_id and username)
        - Upload date
        - Storage location (file_path and storage_provider)
        Synchronizes PostgreSQL `file_records` with MongoDB `file_metadata`.
        """
        users_map: Dict[int, Dict[str, Any]] = {}
        pg_files: List[Dict[str, Any]] = []

        # 1. Retrieve from PostgreSQL
        try:
            with SessionLocal() as db_session:
                users = db_session.query(User).all()
                for u in users:
                    users_map[u.id] = {
                        "id": u.id,
                        "username": u.username,
                        "email": u.email,
                        "full_name": u.full_name or u.username,
                        "role": u.role.value if hasattr(u.role, "value") else str(u.role)
                    }

                query = db_session.query(FileRecord).filter(
                    FileRecord.is_folder == False,
                    FileRecord.is_trashed == False
                )
                if filters.user_id:
                    query = query.filter(FileRecord.owner_id == filters.user_id)

                for r in query.all():
                    owner_info = users_map.get(r.owner_id, {})
                    pg_files.append({
                        "id": str(r.id),
                        "name": r.name,
                        "file_size": int(r.file_size or 0),
                        "owner_id": r.owner_id,
                        "owner_username": owner_info.get("username", "Unknown"),
                        "created_at": r.created_at,
                        "storage_provider": r.storage_provider or "local",
                        "storage_location": r.file_path or f"storage/uploads/{r.stored_filename}",
                        "mime_type": r.mime_type or "application/octet-stream",
                        "category": r.category or "document",
                        "is_encrypted": r.is_encrypted,
                        "downloads_count": int(r.downloads_count or 0)
                    })
        except Exception as e:
            print(f"[StorageAnalytics Warning] PostgreSQL query error: {e}")

        # 2. Retrieve from MongoDB file_metadata to guarantee all stored documents are captured
        mongo_cursor = mongo_db.file_metadata.find({
            "$or": [{"is_folder": False}, {"is_folder": {"$exists": False}}],
            "is_trashed": {"$ne": True}
        })
        mongo_files = await mongo_cursor.to_list(length=10000)

        # Merge, deduplicating by ID
        unified_files: Dict[str, Dict[str, Any]] = {f["id"]: f for f in pg_files}

        for mf in mongo_files:
            fid = str(mf.get("_id"))
            if fid not in unified_files:
                oid = mf.get("owner_id")
                uname = mf.get("owner_username")
                if oid and oid in users_map:
                    uname = users_map[oid]["username"]

                category = mf.get("category")
                if not category:
                    ext = os.path.splitext(mf.get("name") or "")[1].lower()
                    if ext in [".pdf"]: category = "pdf"
                    elif ext in [".xlsx", ".xls", ".csv"]: category = "spreadsheet"
                    elif ext in [".png", ".jpg", ".jpeg", ".webp"]: category = "image"
                    elif ext in [".zip", ".tar", ".gz"]: category = "archive"
                    elif ext in [".py", ".js", ".html"]: category = "code"
                    else: category = "document"

                unified_files[fid] = {
                    "id": fid,
                    "name": mf.get("name") or mf.get("original_filename") or "Unnamed File",
                    "file_size": int(mf.get("file_size") or 0),
                    "owner_id": oid,
                    "owner_username": uname or "Unknown",
                    "created_at": mf.get("created_at") or datetime.now(timezone.utc),
                    "storage_provider": mf.get("storage_provider") or "local",
                    "storage_location": mf.get("file_path") or f"storage/uploads/{mf.get('stored_filename')}",
                    "mime_type": mf.get("mime_type") or "application/octet-stream",
                    "category": category,
                    "is_encrypted": bool(mf.get("is_encrypted", True)),
                    "downloads_count": int(mf.get("downloads_count") or 0)
                }

        # Apply active filters
        filtered_files: List[Dict[str, Any]] = []
        for f in unified_files.values():
            if cls._matches_filters(
                dt_val=f["created_at"],
                user_id=f["owner_id"],
                username=f["owner_username"],
                category=f["category"],
                filters=filters
            ):
                filtered_files.append(f)

        return filtered_files, users_map

    # --------------------------------------------------------------------------
    # CALCULATE TOTAL STORAGE USAGE
    # --------------------------------------------------------------------------
    @classmethod
    async def get_storage_usage(cls, filters: AnalyticsFilterParams) -> StorageAnalyticsResponse:
        """
        Calculate total storage usage.
        Calculates the combined size of all uploaded files using actual stored sizes.
        """
        files, _ = await cls.retrieve_all_file_records(filters)

        total_bytes = sum(f["file_size"] for f in files)
        provider_counts = defaultdict(lambda: {"count": 0, "bytes": 0})
        cat_counts = defaultdict(lambda: {"count": 0, "bytes": 0})

        for f in files:
            p = f["storage_provider"]
            c = f["category"]
            provider_counts[p]["count"] += 1
            provider_counts[p]["bytes"] += f["file_size"]

            cat_counts[c]["count"] += 1
            cat_counts[c]["bytes"] += f["file_size"]

        storage_location_breakdown = [
            StorageLocationBreakdown(
                provider=p.upper(),
                file_count=data["count"],
                total_bytes=data["bytes"],
                formatted_size=format_bytes(data["bytes"])
            )
            for p, data in provider_counts.items()
        ]

        category_breakdown = {
            c: {
                "count": data["count"],
                "total_bytes": data["bytes"],
                "formatted_size": format_bytes(data["bytes"])
            }
            for c, data in cat_counts.items()
        }

        quota_limit_bytes = 524288000  # 500 MB default storage pool
        used_percentage = round((total_bytes / quota_limit_bytes) * 100, 2) if quota_limit_bytes > 0 else 0.0

        return StorageAnalyticsResponse(
            total_storage_bytes=total_bytes,
            total_storage_formatted=format_bytes(total_bytes),
            total_files=len(files),
            storage_location_breakdown=storage_location_breakdown,
            category_breakdown=category_breakdown,
            quota_limit_bytes=quota_limit_bytes,
            quota_limit_formatted=format_bytes(quota_limit_bytes),
            used_percentage=used_percentage
        )

    # --------------------------------------------------------------------------
    # CALCULATE USER-WISE STORAGE USAGE
    # --------------------------------------------------------------------------
    @classmethod
    async def get_user_storage_usage(cls, filters: AnalyticsFilterParams) -> UserStorageResponse:
        """
        Calculate user-wise storage usage.
        Calculates how much storage each user occupies (User, Files Uploaded, Storage Used).
        """
        files, users_map = await cls.retrieve_all_file_records(filters)
        total_system_bytes = sum(f["file_size"] for f in files)

        user_storage = defaultdict(lambda: {"count": 0, "bytes": 0})
        for f in files:
            uid = f["owner_id"]
            if uid:
                user_storage[uid]["count"] += 1
                user_storage[uid]["bytes"] += f["file_size"]

        items: List[UserStorageItem] = []
        # Include all known users from users_map
        for uid, udata in users_map.items():
            if filters.user_id and uid != filters.user_id:
                continue
            if filters.username and filters.username.lower() not in udata["username"].lower():
                continue

            stat = user_storage[uid]
            pct = round((stat["bytes"] / total_system_bytes * 100), 2) if total_system_bytes > 0 else 0.0

            items.append(UserStorageItem(
                user_id=uid,
                username=udata["username"],
                email=udata["email"],
                full_name=udata["full_name"],
                files_uploaded=stat["count"],
                storage_used_bytes=stat["bytes"],
                storage_used_formatted=format_bytes(stat["bytes"]),
                storage_percentage=pct
            ))

        items.sort(key=lambda x: x.storage_used_bytes, reverse=True)

        return UserStorageResponse(
            total_users_with_storage=len([u for u in items if u.files_uploaded > 0]),
            combined_storage_bytes=total_system_bytes,
            combined_storage_formatted=format_bytes(total_system_bytes),
            users=items
        )

    # --------------------------------------------------------------------------
    # CALCULATE FILE STATISTICS
    # --------------------------------------------------------------------------
    @classmethod
    async def get_file_statistics(cls, filters: AnalyticsFilterParams) -> FileStatisticsResponse:
        """
        Generate file statistics.
        Calculates:
        - Total uploaded files
        - Total downloaded files
        - Total shared files
        - Total storage occupied
        - Storage used by individual users
        - Most frequently downloaded files
        """
        files, users_map = await cls.retrieve_all_file_records(filters)
        user_storage_rep = await cls.get_user_storage_usage(filters)

        total_bytes = sum(f["file_size"] for f in files)
        avg_size = int(total_bytes / len(files)) if files else 0

        # Largest file
        largest = max(files, key=lambda x: x["file_size"]) if files else None
        largest_file_dict = None
        if largest:
            largest_file_dict = {
                "id": largest["id"],
                "name": largest["name"],
                "size_bytes": largest["file_size"],
                "size_formatted": format_bytes(largest["file_size"]),
                "owner_username": largest["owner_username"]
            }

        cat_counts = defaultdict(int)
        encrypted_count = 0
        total_downloads_sum = 0

        for f in files:
            cat_counts[f["category"]] += 1
            if f["is_encrypted"]:
                encrypted_count += 1
            total_downloads_sum += f["downloads_count"]

        # Most frequently downloaded files
        sorted_by_dl = sorted(files, key=lambda x: x["downloads_count"], reverse=True)
        top_downloaded = [
            MostDownloadedFileStat(
                file_id=f["id"],
                file_name=f["name"],
                owner_username=f["owner_username"],
                download_count=f["downloads_count"],
                file_size_bytes=f["file_size"],
                file_size_formatted=format_bytes(f["file_size"]),
                category=f["category"]
            )
            for f in sorted_by_dl[:10]
        ]

        # Total shared files (distinct item_id in file_shares)
        shares_cursor = mongo_db.file_shares.find({})
        all_shares = await shares_cursor.to_list(length=10000)
        shared_distinct_files = len(set(str(s.get("item_id")) for s in all_shares))

        return FileStatisticsResponse(
            total_uploaded_files=len(files),
            total_downloaded_files=total_downloads_sum,
            total_shared_files=shared_distinct_files,
            total_storage_occupied_bytes=total_bytes,
            total_storage_occupied_formatted=format_bytes(total_bytes),
            average_file_size_bytes=avg_size,
            average_file_size_formatted=format_bytes(avg_size),
            largest_file=largest_file_dict,
            encrypted_files_count=encrypted_count,
            files_by_category=dict(cat_counts),
            storage_used_by_users=user_storage_rep.users,
            most_frequently_downloaded=top_downloaded
        )

    # --------------------------------------------------------------------------
    # DOWNLOAD & SHARING STATS
    # --------------------------------------------------------------------------
    @classmethod
    async def get_download_statistics(cls, filters: AnalyticsFilterParams) -> DownloadStatisticsResponse:
        """Retrieve download statistics including date-wise volume and failed attempts."""
        files, users_map = await cls.retrieve_all_file_records(filters)

        # Pull from audit_logs
        audit_cursor = mongo_db.audit_logs.find({"activity_type": {"$in": ["download", "file_download"]}})
        audit_logs = await audit_cursor.to_list(length=10000)

        # Pull from activity_logs
        act_cursor = mongo_db.activity_logs.find({"action": {"$in": ["FILE_DOWNLOAD", "DOWNLOAD_FAILED"]}})
        act_logs = await act_cursor.to_list(length=10000)

        downloads_by_user = defaultdict(int)
        downloads_by_date = defaultdict(lambda: {"downloads": 0, "failed": 0})
        unique_files = set()
        total_downloads = 0
        failed_count = 0

        for l in audit_logs:
            dt_str = l.get("date_and_time") or l.get("timestamp") or datetime.now(timezone.utc).isoformat()
            u_id = l.get("user_id")
            u_name = l.get("username") or "Unknown"

            if not cls._matches_filters(dt_str, u_id, u_name, None, filters):
                continue

            date_key = str(dt_str)[:10]
            is_failed = l.get("activity_status") in ["failed", "denied", "blocked"]
            if is_failed:
                failed_count += 1
                downloads_by_date[date_key]["failed"] += 1
            else:
                total_downloads += 1
                downloads_by_user[u_name] += 1
                downloads_by_date[date_key]["downloads"] += 1
                if l.get("file_id"):
                    unique_files.add(str(l["file_id"]))

        # Build date array for charts
        sorted_dates = sorted(downloads_by_date.keys())
        by_date_list = [
            DownloadsByDateStat(
                date=d,
                downloads_count=downloads_by_date[d]["downloads"],
                failed_attempts=downloads_by_date[d]["failed"]
            )
            for d in sorted_dates
        ]

        # Top downloaded
        file_stats = await cls.get_file_statistics(filters)

        user_list = [
            {"username": u, "download_count": cnt}
            for u, cnt in sorted(downloads_by_user.items(), key=lambda x: x[1], reverse=True)
        ]

        return DownloadStatisticsResponse(
            total_downloads=total_downloads or file_stats.total_downloaded_files,
            unique_files_downloaded=len(unique_files) or len(file_stats.most_frequently_downloaded),
            failed_downloads_count=failed_count,
            downloads_by_user=user_list,
            most_downloaded_files=file_stats.most_frequently_downloaded,
            downloads_by_date=by_date_list
        )

    @classmethod
    async def get_sharing_statistics(cls, filters: AnalyticsFilterParams) -> SharingStatisticsResponse:
        """Retrieve sharing statistics including active, expired, revoked links."""
        cursor = mongo_db.file_shares.find({})
        shares = await cursor.to_list(length=10000)

        now = datetime.now(timezone.utc)
        active_cnt = 0
        expired_cnt = 0
        revoked_cnt = 0
        distinct_files = set()
        shares_by_user = defaultdict(int)
        shares_by_date = defaultdict(lambda: {"active": 0, "expired": 0, "revoked": 0})
        perm_dist = {"view": 0, "download": 0}

        for s in shares:
            created_at = s.get("created_at") or now.isoformat()
            owner_id = s.get("owner_id")
            owner_u = s.get("owner_username") or "Unknown"

            if not cls._matches_filters(created_at, owner_id, owner_u, None, filters):
                continue

            date_key = str(created_at)[:10]
            distinct_files.add(str(s.get("item_id")))
            shares_by_user[owner_u] += 1
            perm = s.get("permission", "download")
            perm_dist[perm] = perm_dist.get(perm, 0) + 1

            is_rev = s.get("is_revoked", False) or not s.get("is_active", True)
            is_exp = False
            if s.get("expires_at"):
                exp_dt = cls._parse_dt(s["expires_at"])
                if exp_dt and exp_dt < now:
                    is_exp = True

            if is_rev:
                revoked_cnt += 1
                shares_by_date[date_key]["revoked"] += 1
            elif is_exp:
                expired_cnt += 1
                shares_by_date[date_key]["expired"] += 1
            else:
                active_cnt += 1
                shares_by_date[date_key]["active"] += 1

        by_date_list = [
            SharesByDateStat(
                date=d,
                active_shares=shares_by_date[d]["active"],
                expired_shares=shares_by_date[d]["expired"],
                revoked_shares=shares_by_date[d]["revoked"]
            )
            for d in sorted(shares_by_date.keys())
        ]

        user_list = [
            {"username": u, "share_count": cnt}
            for u, cnt in sorted(shares_by_user.items(), key=lambda x: x[1], reverse=True)
        ]

        return SharingStatisticsResponse(
            total_shared_files=len(distinct_files),
            total_sharing_links=len(shares),
            active_sharing_links=active_cnt,
            expired_sharing_links=expired_cnt,
            revoked_sharing_links=revoked_cnt,
            permission_distribution=perm_dist,
            shares_by_user=user_list,
            shares_by_date=by_date_list
        )

    # --------------------------------------------------------------------------
    # DASHBOARD ANALYTICS & PRE-COMPUTED CHART SERIES
    # --------------------------------------------------------------------------
    @classmethod
    async def get_dashboard_analytics(cls, filters: AnalyticsFilterParams) -> DashboardAnalyticsResponse:
        """
        Assembles full Storage Analytics dashboard and chart series:
        1. Pie chart: storage usage by users.
        2. Bar chart: file uploads by date.
        3. Line/Bar chart: file downloads by date.
        4. Chart: file-sharing statistics.
        """
        storage_rep = await cls.get_storage_usage(filters)
        user_storage_rep = await cls.get_user_storage_usage(filters)
        file_stats_rep = await cls.get_file_statistics(filters)
        download_rep = await cls.get_download_statistics(filters)
        sharing_rep = await cls.get_sharing_statistics(filters)

        files, _ = await cls.retrieve_all_file_records(filters)

        # 1. Pie Chart: Storage usage by users
        pie_colors = ["#2563eb", "#7c3aed", "#059669", "#d97706", "#dc2626", "#0891b2", "#4f46e5"]
        user_storage_pie: List[Dict[str, Any]] = []
        for i, u in enumerate(user_storage_rep.users[:7]):
            user_storage_pie.append({
                "label": u.username,
                "value": u.storage_used_bytes,
                "formatted": u.storage_used_formatted,
                "percentage": u.storage_percentage,
                "color": pie_colors[i % len(pie_colors)]
            })

        # 2. Bar Chart: File uploads by date
        uploads_by_date = defaultdict(lambda: {"count": 0, "bytes": 0})
        for f in files:
            d_str = str(f["created_at"])[:10]
            uploads_by_date[d_str]["count"] += 1
            uploads_by_date[d_str]["bytes"] += f["file_size"]

        uploads_by_date_bar = [
            {
                "date": d,
                "count": uploads_by_date[d]["count"],
                "size_bytes": uploads_by_date[d]["bytes"],
                "formatted_size": format_bytes(uploads_by_date[d]["bytes"])
            }
            for d in sorted(uploads_by_date.keys())
        ]

        # 3. Downloads by date chart
        downloads_by_date_chart = [
            {
                "date": d.date,
                "downloads": d.downloads_count,
                "failed": d.failed_attempts
            }
            for d in download_rep.downloads_by_date
        ]

        # 4. Sharing statistics chart
        sharing_stats_chart = [
            {
                "status": "Active Links",
                "count": sharing_rep.active_sharing_links,
                "color": "#10b981"
            },
            {
                "status": "Expired Links",
                "count": sharing_rep.expired_sharing_links,
                "color": "#f59e0b"
            },
            {
                "status": "Revoked Links",
                "count": sharing_rep.revoked_sharing_links,
                "color": "#ef4444"
            }
        ]

        return DashboardAnalyticsResponse(
            generated_at=datetime.now(timezone.utc).isoformat(),
            filters_applied={
                "start_date": filters.start_date,
                "end_date": filters.end_date,
                "user_id": filters.user_id,
                "username": filters.username,
                "file_type": filters.file_type,
                "activity_type": filters.activity_type
            },
            storage=storage_rep,
            user_storage=user_storage_rep.users,
            files=file_stats_rep,
            downloads=download_rep,
            sharing=sharing_rep,
            charts={
                "user_storage_pie": user_storage_pie,
                "uploads_by_date_bar": uploads_by_date_bar,
                "downloads_by_date_chart": downloads_by_date_chart,
                "sharing_stats_chart": sharing_stats_chart
            }
        )


storage_analytics_service = StorageAnalyticsService()

