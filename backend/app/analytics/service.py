from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.db.session import SessionLocal
from app.models.user import User
from app.models.file import FileRecord
from app.models.share_link import ShareLink
from app.models.audit_log import AuditLog


def format_bytes(size: int) -> str:
    if size < 1024:
        return f"{size} B"
    elif size < 1024 * 1024:
        return f"{round(size / 1024, 1)} KB"
    elif size < 1024 * 1024 * 1024:
        return f"{round(size / (1024 * 1024), 2)} MB"
    else:
        return f"{round(size / (1024 * 1024 * 1024), 2)} GB"


class AnalyticsService:
    """
    Milestone 3 Task 5: Storage Analytics & Usage Monitoring Service.
    Calculates storage usage and file statistics from actual database records.
    """

    @classmethod
    def get_total_storage(cls) -> Dict[str, Any]:
        with SessionLocal() as db:
            total_bytes = db.query(func.sum(FileRecord.file_size)).scalar() or 0
            total_files = db.query(FileRecord).count()
            return {
                "total_storage_bytes": total_bytes,
                "total_storage_formatted": format_bytes(total_bytes),
                "total_files": total_files,
                "allocated_quota_bytes": 10 * 1024 * 1024 * 1024,  # 10 GB platform pool
                "usage_percentage": round((total_bytes / (10 * 1024 * 1024 * 1024)) * 100, 2),
            }

    @classmethod
    def get_user_storage_usage(cls) -> List[Dict[str, Any]]:
        with SessionLocal() as db:
            users = db.query(User).all()
            total_platform_bytes = db.query(func.sum(FileRecord.file_size)).scalar() or 1
            results = []

            for u in users:
                user_files = db.query(FileRecord).filter(FileRecord.owner_id == u.id).all()
                file_count = len(user_files)
                user_bytes = sum(f.file_size for f in user_files)
                pct = round((user_bytes / total_platform_bytes) * 100, 1) if total_platform_bytes > 0 else 0

                results.append({
                    "user_id": u.id,
                    "user_name": u.full_name or u.email.split("@")[0],
                    "email": u.email,
                    "role": u.role.value if hasattr(u.role, "value") else str(u.role),
                    "files_uploaded": file_count,
                    "storage_used_bytes": user_bytes,
                    "storage_used_formatted": format_bytes(user_bytes),
                    "percentage": pct,
                })

            # Sort users by storage used descending
            results.sort(key=lambda x: x["storage_used_bytes"], reverse=True)
            return results

    @classmethod
    def get_file_statistics(cls) -> Dict[str, Any]:
        with SessionLocal() as db:
            total_uploaded = db.query(FileRecord).count()
            total_shared = db.query(ShareLink).count()
            total_storage_bytes = db.query(func.sum(FileRecord.file_size)).scalar() or 0

            # Downloads count from audit logs
            total_downloaded = db.query(AuditLog).filter(
                AuditLog.action.in_(["FILE_DOWNLOAD", "PUBLIC_SHARE_DOWNLOAD"])
            ).count()

            # Group storage by file extension
            all_files = db.query(FileRecord.original_filename, FileRecord.file_size).all()
            ext_map = {}
            for fname, size in all_files:
                ext = fname.split(".")[-1].lower() if "." in fname else "other"
                ext_map[ext] = ext_map.get(ext, 0) + size

            breakdown_by_type = [
                {"file_type": ext.upper(), "size_bytes": size, "formatted": format_bytes(size)}
                for ext, size in ext_map.items()
            ]

            # Most frequently downloaded files
            download_logs = db.query(AuditLog).filter(
                AuditLog.action.in_(["FILE_DOWNLOAD", "PUBLIC_SHARE_DOWNLOAD"])
            ).all()
            fn_counts = {}
            for l in download_logs:
                details = l.details or {}
                fn = details.get("filename") or f"File #{details.get('file_id')}"
                fn_counts[fn] = fn_counts.get(fn, 0) + 1

            most_frequent = sorted(
                [{"filename": k, "download_count": v} for k, v in fn_counts.items()],
                key=lambda x: x["download_count"],
                reverse=True,
            )[:10]

            return {
                "total_uploaded_files": total_uploaded,
                "total_downloaded_files": total_downloaded,
                "total_shared_files": total_shared,
                "total_storage_occupied_bytes": total_storage_bytes,
                "total_storage_occupied_formatted": format_bytes(total_storage_bytes),
                "storage_by_file_type": breakdown_by_type,
                "most_frequently_downloaded": most_frequent,
            }

    @classmethod
    def get_download_statistics(cls) -> Dict[str, Any]:
        with SessionLocal() as db:
            seven_days_ago = datetime.now(timezone.utc) - timedelta(days=7)
            logs = db.query(AuditLog).filter(
                AuditLog.action.in_(["FILE_DOWNLOAD", "PUBLIC_SHARE_DOWNLOAD", "FILE_DOWNLOAD_REJECTED"]),
                AuditLog.timestamp >= seven_days_ago,
            ).all()

            daily_downloads = {}
            for l in logs:
                day_str = l.timestamp.strftime("%Y-%m-%d") if l.timestamp else "Today"
                if day_str not in daily_downloads:
                    daily_downloads[day_str] = {"date": day_str, "successful": 0, "failed": 0}
                if "REJECTED" in l.action or "FAILED" in l.action:
                    daily_downloads[day_str]["failed"] += 1
                else:
                    daily_downloads[day_str]["successful"] += 1

            timeline = sorted(daily_downloads.values(), key=lambda x: x["date"])
            return {
                "daily_downloads_timeline": timeline,
                "recent_downloads_count": len(logs),
            }

    @classmethod
    def get_sharing_statistics(cls) -> Dict[str, Any]:
        now = datetime.now(timezone.utc)
        with SessionLocal() as db:
            links = db.query(ShareLink).all()
            active = 0
            expired = 0
            revoked = 0
            total_downloads_via_shares = sum(l.download_count for l in links)

            for l in links:
                is_expired = False
                if l.expires_at:
                    exp = l.expires_at
                    if exp.tzinfo is None:
                        exp = exp.replace(tzinfo=timezone.utc)
                    if exp < now:
                        is_expired = True

                if l.is_revoked:
                    revoked += 1
                elif is_expired or (l.max_downloads and l.download_count >= l.max_downloads):
                    expired += 1
                else:
                    active += 1

            return {
                "total_share_links": len(links),
                "active_links": active,
                "expired_links": expired,
                "revoked_links": revoked,
                "total_downloads_via_shares": total_downloads_via_shares,
            }

