"""
TrustShare - Reports Service
=============================
Core business logic for generating File Activity and Security Reports:
- Integrated PostgreSQL and MongoDB report data aggregation.
- File upload reports (volume, user breakdown, timestamps, file types, statuses).
- File download reports (volume, user breakdown, most downloaded, failure analysis).
- File sharing reports (active, expired, revoked links, recipients, breakdown).
- User activity reports (individual login, upload, download, sharing tracking).
- Security reports (failed logins, unauthorized access, suspicious downloads, expired/revoked links).
- Comprehensive filtering by user, activity type, file, and date range.
"""

import os
import re
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any, Tuple
from collections import defaultdict

from app.database import SessionLocal, mongo_db
from app.models import User, UserRole
from app.reports.schemas import (
    ReportFilterParams,
    FileUploadReportResponse,
    FileUploadSummaryByUser,
    FileTypeDistribution,
    FileUploadRecord,
    FileDownloadReportResponse,
    FileDownloadSummaryByUser,
    MostDownloadedFileItem,
    FileDownloadRecord,
    FileSharingReportResponse,
    SharesByUserItem,
    ShareRecipientItem,
    FileShareRecord,
    UserActivityReportResponse,
    UserActivitySummary,
    UserActivityTimelineEvent,
    SecurityReportResponse,
    SecurityIncidentRecord,
    ComprehensiveReportResponse,
    ReportSummaryMetrics,
)


class ReportsService:
    """Service for generating file activity and security reports across PostgreSQL and MongoDB."""

    # --------------------------------------------------------------------------
    # INTERNAL HELPERS
    # --------------------------------------------------------------------------
    @staticmethod
    def _get_users_map() -> Dict[int, Dict[str, Any]]:
        """Queries PostgreSQL users and returns a mapping from user_id to user metadata."""
        users_map: Dict[int, Dict[str, Any]] = {}
        try:
            with SessionLocal() as db_session:
                users = db_session.query(User).all()
                for u in users:
                    role_str = u.role.value if hasattr(u.role, "value") else str(u.role)
                    users_map[u.id] = {
                        "id": u.id,
                        "username": u.username,
                        "email": u.email,
                        "full_name": u.full_name or u.username,
                        "role": role_str,
                        "is_active": u.is_active,
                        "created_at": u.created_at.isoformat() if u.created_at else None
                    }
        except Exception as e:
            print(f"[ReportsService Warning] Could not fetch PostgreSQL users: {e}")
        return users_map

    @staticmethod
    def _parse_dt(dt_val: Any) -> Optional[datetime]:
        """Safely parses a datetime object or ISO string into a timezone-aware UTC datetime."""
        if not dt_val:
            return None
        if isinstance(dt_val, datetime):
            if dt_val.tzinfo is None:
                return dt_val.replace(tzinfo=timezone.utc)
            return dt_val.astimezone(timezone.utc)
        try:
            s = str(dt_val).replace("Z", "+00:00")
            # If string is just YYYY-MM-DD
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
        item_dt: Any,
        item_user_id: Optional[int],
        item_username: Optional[str],
        item_file_id: Optional[str],
        item_file_name: Optional[str],
        item_status: Optional[str],
        filters: ReportFilterParams
    ) -> bool:
        """Evaluates whether a candidate record satisfies the report filter parameters."""
        # 1. Date range filter
        if filters.start_date or filters.end_date:
            record_dt = cls._parse_dt(item_dt)
            if record_dt:
                if filters.start_date:
                    start_dt = cls._parse_dt(filters.start_date)
                    if start_dt and record_dt < start_dt:
                        return False
                if filters.end_date:
                    end_dt = cls._parse_dt(filters.end_date)
                    # Include the entire end day if YYYY-MM-DD format
                    if end_dt:
                        if len(str(filters.end_date).strip()) == 10:
                            end_dt = end_dt.replace(hour=23, minute=59, second=59, microsecond=999999)
                        if record_dt > end_dt:
                            return False

        # 2. User filter
        if filters.user_id is not None and item_user_id is not None:
            if item_user_id != filters.user_id:
                return False
        if filters.username:
            target_user = filters.username.strip().lower()
            rec_user = (item_username or "").strip().lower()
            if target_user not in rec_user:
                return False

        # 3. File filter
        if filters.file_id and item_file_id:
            if filters.file_id != item_file_id:
                return False
        if filters.file_name and item_file_name:
            if filters.file_name.strip().lower() not in item_file_name.strip().lower():
                return False

        # 4. Status filter
        if filters.status and item_status:
            if filters.status.strip().lower() not in item_status.strip().lower():
                return False

        return True

    @staticmethod
    def _determine_file_category(file_name: str, mime_type: Optional[str] = None) -> str:
        """Determines friendly category from filename extension and MIME type."""
        ext = os.path.splitext(file_name)[1].lower() if file_name else ""
        mime = (mime_type or "").lower()

        if ext in [".pdf"] or "pdf" in mime:
            return "PDF Document"
        if ext in [".xlsx", ".xls", ".csv"] or "excel" in mime or "spreadsheet" in mime or "csv" in mime:
            return "Spreadsheet"
        if ext in [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"] or "image" in mime:
            return "Image"
        if ext in [".zip", ".tar", ".gz", ".7z", ".rar"] or "zip" in mime or "compressed" in mime:
            return "Archive"
        if ext in [".docx", ".doc", ".txt", ".md", ".rtf"] or "word" in mime or "text" in mime:
            return "Document"
        if ext in [".py", ".js", ".jsx", ".ts", ".tsx", ".html", ".css", ".json", ".xml", ".sql"]:
            return "Code / Script"
        return "Other"

    # --------------------------------------------------------------------------
    # FILE UPLOAD REPORTS
    # --------------------------------------------------------------------------
    @classmethod
    async def get_upload_report(cls, filters: ReportFilterParams) -> FileUploadReportResponse:
        """
        Generate file upload reports.
        Calculates:
        - Total files uploaded
        - Files uploaded by each user
        - Upload date and time
        - File type distribution
        - Upload status (successful vs failed)
        """
        users_map = cls._get_users_map()

        # Query MongoDB file_metadata (folders excluded)
        file_cursor = mongo_db.file_metadata.find({
            "$or": [{"is_folder": False}, {"is_folder": {"$exists": False}}]
        })
        files = await file_cursor.to_list(length=10000)

        # Query audit_logs for failed upload records
        failed_uploads_cursor = mongo_db.audit_logs.find({
            "activity_type": "upload",
            "activity_status": {"$in": ["failed", "error", "blocked"]}
        })
        failed_upload_logs = await failed_uploads_cursor.to_list(length=1000)

        records: List[FileUploadRecord] = []
        user_counts = defaultdict(lambda: {"count": 0, "bytes": 0})
        type_counts = defaultdict(lambda: {"count": 0, "bytes": 0})
        status_counts = {"successful": 0, "failed": 0}

        # 1. Process successful file uploads
        for f in files:
            file_id = str(f.get("_id"))
            name = f.get("name") or f.get("original_filename") or "Unnamed File"
            owner_id = f.get("owner_id")
            owner_username = f.get("owner_username")

            if owner_id and owner_id in users_map:
                owner_username = users_map[owner_id]["username"]

            created_at = f.get("created_at")
            if isinstance(created_at, datetime):
                created_at_str = created_at.isoformat()
            else:
                created_at_str = str(created_at or datetime.now(timezone.utc).isoformat())

            file_size = int(f.get("file_size") or 0)
            mime_type = f.get("mime_type")
            file_category = cls._determine_file_category(name, mime_type)

            # Apply filters
            if not cls._matches_filters(
                item_dt=created_at_str,
                item_user_id=owner_id,
                item_username=owner_username,
                item_file_id=file_id,
                item_file_name=name,
                item_status="successful",
                filters=filters
            ):
                continue

            status_counts["successful"] += 1
            user_key = (owner_id, owner_username or "Unknown")
            user_counts[user_key]["count"] += 1
            user_counts[user_key]["bytes"] += file_size

            type_counts[file_category]["count"] += 1
            type_counts[file_category]["bytes"] += file_size

            records.append(FileUploadRecord(
                file_id=file_id,
                file_name=name,
                owner_id=owner_id,
                owner_username=owner_username,
                file_size=file_size,
                mime_type=mime_type,
                file_type=file_category,
                is_encrypted=bool(f.get("is_encrypted", True)),
                upload_status="successful",
                created_at=created_at_str
            ))

        # 2. Process failed upload attempts from audit_logs
        for l in failed_upload_logs:
            f_id = l.get("file_id") or "unassigned"
            f_name = l.get("file_name") or "Failed Upload Attempt"
            u_id = l.get("user_id")
            u_name = l.get("username") or "Unknown"
            dt_str = l.get("date_and_time") or l.get("timestamp") or datetime.now(timezone.utc).isoformat()

            if not cls._matches_filters(
                item_dt=dt_str,
                item_user_id=u_id,
                item_username=u_name,
                item_file_id=f_id,
                item_file_name=f_name,
                item_status="failed",
                filters=filters
            ):
                continue

            status_counts["failed"] += 1
            records.append(FileUploadRecord(
                file_id=f_id,
                file_name=f_name,
                owner_id=u_id,
                owner_username=u_name,
                file_size=0,
                mime_type=None,
                file_type="Unknown",
                is_encrypted=False,
                upload_status="failed",
                created_at=dt_str
            ))

        # Sort chronologically descending
        records.sort(key=lambda r: r.created_at, reverse=True)

        # Assemble summary structures
        files_by_user = [
            FileUploadSummaryByUser(
                user_id=u_key[0],
                username=u_key[1],
                full_name=users_map.get(u_key[0], {}).get("full_name") if u_key[0] else u_key[1],
                file_count=data["count"],
                total_bytes=data["bytes"]
            )
            for u_key, data in sorted(user_counts.items(), key=lambda x: x[1]["count"], reverse=True)
        ]

        file_type_distribution = [
            FileTypeDistribution(
                file_type=cat,
                count=data["count"],
                total_bytes=data["bytes"]
            )
            for cat, data in sorted(type_counts.items(), key=lambda x: x[1]["count"], reverse=True)
        ]

        total_files = sum(u.file_count for u in files_by_user)
        total_bytes = sum(u.total_bytes for u in files_by_user)

        # Paginate records
        paginated_records = records[filters.skip: filters.skip + filters.limit]

        return FileUploadReportResponse(
            total_files_uploaded=total_files,
            total_bytes_uploaded=total_bytes,
            files_by_user=files_by_user,
            file_type_distribution=file_type_distribution,
            upload_status_breakdown=status_counts,
            records=paginated_records
        )

    # --------------------------------------------------------------------------
    # FILE DOWNLOAD REPORTS
    # --------------------------------------------------------------------------
    @classmethod
    async def get_download_report(cls, filters: ReportFilterParams) -> FileDownloadReportResponse:
        """
        Generate file download reports.
        Calculates:
        - Total downloads
        - Downloads by each user
        - Most downloaded files
        - Download date and time
        - Failed download attempts
        """
        users_map = cls._get_users_map()

        # Query audit_logs for download activities
        audit_cursor = mongo_db.audit_logs.find({
            "activity_type": {"$in": ["download", "access_control"]}
        })
        audit_logs = await audit_cursor.to_list(length=10000)

        # Also pull legacy activity_logs with download actions
        act_cursor = mongo_db.activity_logs.find({
            "action": {"$in": ["FILE_DOWNLOAD", "DOWNLOAD_FAILED", "UNAUTHORIZED_DOWNLOAD"]}
        })
        act_logs = await act_cursor.to_list(length=10000)

        records: List[FileDownloadRecord] = []
        failed_downloads: List[FileDownloadRecord] = []
        user_download_counts = defaultdict(int)

        # Unify logs
        unified_events = []
        for l in audit_logs:
            if l.get("activity_type") == "download" or "download" in (l.get("activity_description") or "").lower():
                is_failed = l.get("activity_status") in ["failed", "denied", "blocked"]
                unified_events.append({
                    "log_id": l.get("log_id", str(l.get("_id"))),
                    "file_id": l.get("file_id"),
                    "file_name": l.get("file_name"),
                    "user_id": l.get("user_id"),
                    "username": l.get("username") or "Unknown",
                    "ip_address": l.get("ip_address"),
                    "date_and_time": l.get("date_and_time") or datetime.now(timezone.utc).isoformat(),
                    "status": l.get("activity_status", "successful"),
                    "is_failed": is_failed,
                    "failure_reason": l.get("activity_description") if is_failed else None
                })

        for a in act_logs:
            is_failed = a.get("action") in ["DOWNLOAD_FAILED", "UNAUTHORIZED_DOWNLOAD"]
            unified_events.append({
                "log_id": str(a.get("_id")),
                "file_id": str(a.get("resource_id")),
                "file_name": a.get("resource_name"),
                "user_id": a.get("user_id"),
                "username": a.get("username") or "Anonymous",
                "ip_address": a.get("ip_address"),
                "date_and_time": a.get("timestamp") or datetime.now(timezone.utc).isoformat(),
                "status": "failed" if is_failed else "successful",
                "is_failed": is_failed,
                "failure_reason": a.get("details", {}).get("reason") or a.get("details", {}).get("error")
            })

        for e in unified_events:
            if not cls._matches_filters(
                item_dt=e["date_and_time"],
                item_user_id=e["user_id"],
                item_username=e["username"],
                item_file_id=e["file_id"],
                item_file_name=e["file_name"],
                item_status=e["status"],
                filters=filters
            ):
                continue

            rec = FileDownloadRecord(**e)
            records.append(rec)
            if rec.is_failed:
                failed_downloads.append(rec)
            else:
                user_download_counts[(rec.user_id, rec.username)] += 1

        records.sort(key=lambda r: r.date_and_time, reverse=True)
        failed_downloads.sort(key=lambda r: r.date_and_time, reverse=True)

        downloads_by_user = [
            FileDownloadSummaryByUser(
                user_id=u_key[0],
                username=u_key[1],
                download_count=count
            )
            for u_key, count in sorted(user_download_counts.items(), key=lambda x: x[1], reverse=True)
        ]

        # Calculate most downloaded files from file_metadata
        file_cursor = mongo_db.file_metadata.find({
            "downloads_count": {"$gt": 0}
        }).sort("downloads_count", -1).limit(20)
        most_dl_docs = await file_cursor.to_list(length=20)

        most_downloaded_files = []
        for d in most_dl_docs:
            owner_u = d.get("owner_username")
            if d.get("owner_id") in users_map:
                owner_u = users_map[d["owner_id"]]["username"]
            most_downloaded_files.append(MostDownloadedFileItem(
                file_id=str(d["_id"]),
                file_name=d.get("name") or "Unnamed File",
                owner_username=owner_u,
                download_count=int(d.get("downloads_count", 0)),
                file_size=d.get("file_size")
            ))

        paginated_records = records[filters.skip: filters.skip + filters.limit]

        return FileDownloadReportResponse(
            total_downloads=len([r for r in records if not r.is_failed]),
            downloads_by_user=downloads_by_user,
            most_downloaded_files=most_downloaded_files,
            failed_downloads_count=len(failed_downloads),
            failed_downloads=failed_downloads[:50],
            records=paginated_records
        )

    # --------------------------------------------------------------------------
    # FILE SHARING REPORTS
    # --------------------------------------------------------------------------
    @classmethod
    async def get_sharing_report(cls, filters: ReportFilterParams) -> FileSharingReportResponse:
        """
        Generate file-sharing reports.
        Calculates:
        - Total files shared
        - Files shared by each user
        - Sharing recipients
        - Active sharing links
        - Expired sharing links
        - Revoked sharing links
        """
        users_map = cls._get_users_map()

        cursor = mongo_db.file_shares.find({})
        shares = await cursor.to_list(length=10000)

        now = datetime.now(timezone.utc)
        records: List[FileShareRecord] = []
        shares_by_user_counts = defaultdict(int)
        recipients_counts = defaultdict(int)
        distinct_shared_files = set()

        active_count = 0
        expired_count = 0
        revoked_count = 0

        for s in shares:
            share_id = s.get("share_id") or str(s.get("_id"))
            file_id = str(s.get("item_id") or "")
            file_name = s.get("item_name") or "Shared File"
            owner_id = s.get("owner_id")
            owner_username = s.get("owner_username") or "Unknown"

            if owner_id and owner_id in users_map:
                owner_username = users_map[owner_id]["username"]

            recipient_email = s.get("recipient_email")
            permission = s.get("permission", "download")
            is_active_flag = s.get("is_active", True)
            is_revoked_flag = s.get("is_revoked", False) or not is_active_flag

            expires_at = s.get("expires_at")
            is_expired = False
            if expires_at:
                exp_dt = cls._parse_dt(expires_at)
                if exp_dt and exp_dt < now:
                    is_expired = True

            # Determine share status
            if is_revoked_flag:
                share_status = "revoked"
            elif is_expired:
                share_status = "expired"
            else:
                share_status = "active"

            created_at = s.get("created_at") or now.isoformat()

            # Filter checking
            if not cls._matches_filters(
                item_dt=created_at,
                item_user_id=owner_id,
                item_username=owner_username,
                item_file_id=file_id,
                item_file_name=file_name,
                item_status=share_status,
                filters=filters
            ):
                continue

            # Update counters
            distinct_shared_files.add(file_id)
            shares_by_user_counts[(owner_id, owner_username)] += 1

            if recipient_email:
                recipients_counts[recipient_email.lower().strip()] += 1

            if share_status == "active":
                active_count += 1
            elif share_status == "expired":
                expired_count += 1
            elif share_status == "revoked":
                revoked_count += 1

            records.append(FileShareRecord(
                share_id=share_id,
                file_id=file_id,
                file_name=file_name,
                owner_id=owner_id,
                owner_username=owner_username,
                recipient_email=recipient_email,
                permission=permission,
                is_active=(share_status == "active"),
                is_expired=is_expired,
                is_revoked=is_revoked_flag,
                status=share_status,
                downloads_count=int(s.get("downloads_count", 0)),
                max_downloads=s.get("max_downloads"),
                created_at=str(created_at),
                expires_at=str(expires_at) if expires_at else None
            ))

        records.sort(key=lambda r: r.created_at, reverse=True)

        shares_by_user = [
            SharesByUserItem(user_id=u[0], username=u[1], share_count=cnt)
            for u, cnt in sorted(shares_by_user_counts.items(), key=lambda x: x[1], reverse=True)
        ]

        recipients = [
            ShareRecipientItem(recipient_email=email, share_count=cnt)
            for email, cnt in sorted(recipients_counts.items(), key=lambda x: x[1], reverse=True)
        ]

        paginated_records = records[filters.skip: filters.skip + filters.limit]

        return FileSharingReportResponse(
            total_files_shared=len(distinct_shared_files),
            total_sharing_links=len(records),
            shares_by_user=shares_by_user,
            recipients=recipients,
            active_links_count=active_count,
            expired_links_count=expired_count,
            revoked_links_count=revoked_count,
            records=paginated_records
        )

    # --------------------------------------------------------------------------
    # USER ACTIVITY REPORTS
    # --------------------------------------------------------------------------
    @classmethod
    async def get_user_activity_report(cls, filters: ReportFilterParams) -> UserActivityReportResponse:
        """
        Generate user activity reports.
        Displays activities performed by individual users:
        - Login history
        - Upload history
        - Download history
        - Sharing history
        """
        users_map = cls._get_users_map()

        # Gather audit logs
        audit_cursor = mongo_db.audit_logs.find({}).sort("date_and_time", -1)
        audit_logs = await audit_cursor.to_list(length=10000)

        # Gather activity logs
        act_cursor = mongo_db.activity_logs.find({}).sort("timestamp", -1)
        act_logs = await act_cursor.to_list(length=10000)

        user_metrics = defaultdict(lambda: {
            "logins": 0,
            "uploads": 0,
            "downloads": 0,
            "shares": 0,
            "failed": 0,
            "last_active": None
        })

        timeline: List[UserActivityTimelineEvent] = []

        # 1. Process audit logs
        for log in audit_logs:
            u_id = log.get("user_id")
            u_name = log.get("username") or "Unknown"
            act_type = (log.get("activity_type") or "").lower()
            status = log.get("activity_status") or "successful"
            dt_str = log.get("date_and_time") or datetime.now(timezone.utc).isoformat()

            # Filter check
            if not cls._matches_filters(
                item_dt=dt_str,
                item_user_id=u_id,
                item_username=u_name,
                item_file_id=log.get("file_id"),
                item_file_name=log.get("file_name"),
                item_status=status,
                filters=filters
            ):
                continue

            # Update metrics per user
            if u_id:
                m = user_metrics[u_id]
                if act_type == "login":
                    m["logins"] += 1
                elif act_type == "upload":
                    m["uploads"] += 1
                elif act_type == "download":
                    m["downloads"] += 1
                elif act_type in ["sharing", "share"]:
                    m["shares"] += 1

                if status in ["failed", "denied", "blocked"]:
                    m["failed"] += 1

                if not m["last_active"] or dt_str > m["last_active"]:
                    m["last_active"] = dt_str

            timeline.append(UserActivityTimelineEvent(
                log_id=log.get("log_id", str(log.get("_id"))),
                user_id=u_id,
                username=u_name,
                activity_type=act_type,
                activity_description=log.get("activity_description", ""),
                activity_status=status,
                file_id=log.get("file_id"),
                file_name=log.get("file_name"),
                ip_address=log.get("ip_address", "127.0.0.1"),
                date_and_time=dt_str,
                details=log.get("details")
            ))

        # 2. Build UserActivitySummary for all known users
        user_summaries: List[UserActivitySummary] = []
        for u_id, u_data in users_map.items():
            if filters.user_id and u_id != filters.user_id:
                continue
            if filters.username and filters.username.lower() not in u_data["username"].lower():
                continue

            m = user_metrics[u_id]
            user_summaries.append(UserActivitySummary(
                user_id=u_id,
                username=u_data["username"],
                email=u_data["email"],
                full_name=u_data["full_name"],
                role=u_data["role"],
                is_active=u_data["is_active"],
                login_count=m["logins"],
                upload_count=m["uploads"],
                download_count=m["downloads"],
                share_count=m["shares"],
                failed_actions_count=m["failed"],
                last_active=m["last_active"]
            ))

        user_summaries.sort(key=lambda u: (u.last_active or "", u.upload_count + u.download_count), reverse=True)
        timeline.sort(key=lambda t: t.date_and_time, reverse=True)

        paginated_timeline = timeline[filters.skip: filters.skip + filters.limit]

        return UserActivityReportResponse(
            total_users=len(users_map),
            active_users_count=len([u for u in user_summaries if u.last_active is not None]),
            user_summaries=user_summaries,
            activity_timeline=paginated_timeline
        )

    # --------------------------------------------------------------------------
    # SECURITY REPORTS
    # --------------------------------------------------------------------------
    @classmethod
    async def get_security_report(cls, filters: ReportFilterParams) -> SecurityReportResponse:
        """
        Generate security reports.
        Retrieves security events and shows:
        - Failed login attempts
        - Unauthorized access attempts
        - Suspicious download activities
        - Expired link access attempts
        - Security alerts generated
        """
        # 1. Audit logs with security, blocked, or failed status
        audit_cursor = mongo_db.audit_logs.find({
            "$or": [
                {"activity_type": "security"},
                {"activity_status": {"$in": ["failed", "denied", "blocked"]}}
            ]
        })
        audit_logs = await audit_cursor.to_list(length=10000)

        # 2. Activity logs with security tags
        act_cursor = mongo_db.activity_logs.find({
            "action": {"$in": [
                "FAILED_LOGIN",
                "PASSWORD_VERIFY_FAILED",
                "SUSPICIOUS_DOWNLOAD",
                "UNAUTHORIZED_ACCESS",
                "EXPIRED_LINK_ACCESS",
                "REVOKED_LINK_ACCESS"
            ]}
        })
        act_logs = await act_cursor.to_list(length=10000)

        # 3. Notifications with security_alert type
        notif_cursor = mongo_db.notifications.find({
            "notification_type": "security_alert"
        })
        notif_alerts = await notif_cursor.to_list(length=10000)

        incidents: List[SecurityIncidentRecord] = []
        counts = {
            "failed_logins": 0,
            "unauthorized_access": 0,
            "suspicious_downloads": 0,
            "expired_link": 0,
            "revoked_link": 0,
            "alerts": len(notif_alerts)
        }

        # Classify audit logs
        for log in audit_logs:
            desc = (log.get("activity_description") or "").lower()
            act_type = (log.get("activity_type") or "").lower()
            dt_str = log.get("date_and_time") or datetime.now(timezone.utc).isoformat()
            u_id = log.get("user_id")
            u_name = log.get("username") or "Unknown"

            if not cls._matches_filters(
                item_dt=dt_str,
                item_user_id=u_id,
                item_username=u_name,
                item_file_id=log.get("file_id"),
                item_file_name=log.get("file_name"),
                item_status=log.get("activity_status"),
                filters=filters
            ):
                continue

            inc_type = "unauthorized_access"
            severity = "medium"

            if "login" in desc or act_type == "login":
                inc_type = "failed_login"
                counts["failed_logins"] += 1
                severity = "high"
            elif "expired" in desc:
                inc_type = "expired_link"
                counts["expired_link"] += 1
                severity = "medium"
            elif "revoked" in desc:
                inc_type = "revoked_link"
                counts["revoked_link"] += 1
                severity = "high"
            elif "suspicious" in desc or "download limit" in desc:
                inc_type = "suspicious_download"
                counts["suspicious_downloads"] += 1
                severity = "critical"
            else:
                counts["unauthorized_access"] += 1
                severity = "high"

            incidents.append(SecurityIncidentRecord(
                log_id=log.get("log_id", str(log.get("_id"))),
                incident_type=inc_type,
                title=f"Security Alert: {inc_type.replace('_', ' ').title()}",
                description=log.get("activity_description", "Security incident detected"),
                user_id=u_id,
                username=u_name,
                target_resource=log.get("file_name") or log.get("file_id"),
                ip_address=log.get("ip_address", "127.0.0.1"),
                date_and_time=dt_str,
                severity=severity,
                details=log.get("details")
            ))

        # Classify notifications as alerts
        for n in notif_alerts:
            dt_str = n.get("created_at") or n.get("date_and_time") or datetime.now(timezone.utc).isoformat()
            title = n.get("notification_title") or "Security Alert"
            msg = n.get("notification_message") or ""

            if not cls._matches_filters(
                item_dt=dt_str,
                item_user_id=n.get("user_id"),
                item_username=None,
                item_file_id=n.get("file_id"),
                item_file_name=n.get("file_name"),
                item_status="alert",
                filters=filters
            ):
                continue

            inc_type = "unauthorized_access"
            if "login" in (title + msg).lower():
                inc_type = "failed_login"
            elif "expired" in (title + msg).lower():
                inc_type = "expired_link"
            elif "revoked" in (title + msg).lower():
                inc_type = "revoked_link"
            elif "download" in (title + msg).lower():
                inc_type = "suspicious_download"

            incidents.append(SecurityIncidentRecord(
                log_id=n.get("notification_id", str(n.get("_id"))),
                incident_type=inc_type,
                title=title,
                description=msg,
                user_id=n.get("user_id"),
                username=n.get("details", {}).get("username") if isinstance(n.get("details"), dict) else None,
                target_resource=n.get("file_name") or n.get("file_id"),
                ip_address=n.get("details", {}).get("ip_address", "127.0.0.1") if isinstance(n.get("details"), dict) else "127.0.0.1",
                date_and_time=dt_str,
                severity=n.get("priority", "high"),
                details=n.get("details")
            ))

        incidents.sort(key=lambda i: i.date_and_time, reverse=True)
        paginated_incidents = incidents[filters.skip: filters.skip + filters.limit]

        return SecurityReportResponse(
            total_security_events=len(incidents),
            failed_logins_count=counts["failed_logins"],
            unauthorized_access_count=counts["unauthorized_access"],
            suspicious_downloads_count=counts["suspicious_downloads"],
            expired_link_access_count=counts["expired_link"],
            revoked_link_access_count=counts["revoked_link"],
            security_alerts_generated=counts["alerts"],
            incidents=paginated_incidents
        )

    # --------------------------------------------------------------------------
    # COMPREHENSIVE DASHBOARD SUMMARY (COMBINES ALL 5 MODULES)
    # --------------------------------------------------------------------------
    @classmethod
    async def get_comprehensive_summary(cls, filters: ReportFilterParams) -> ComprehensiveReportResponse:
        """Rollup metrics for Admin Reports Dashboard."""
        upload_rep = await cls.get_upload_report(filters)
        download_rep = await cls.get_download_report(filters)
        share_rep = await cls.get_sharing_report(filters)
        user_rep = await cls.get_user_activity_report(filters)
        sec_rep = await cls.get_security_report(filters)

        metrics = ReportSummaryMetrics(
            total_uploads=upload_rep.total_files_uploaded,
            total_upload_bytes=upload_rep.total_bytes_uploaded,
            total_downloads=download_rep.total_downloads,
            failed_downloads=download_rep.failed_downloads_count,
            total_shares=share_rep.total_sharing_links,
            active_shares=share_rep.active_links_count,
            expired_shares=share_rep.expired_links_count,
            revoked_shares=share_rep.revoked_links_count,
            total_users=user_rep.total_users,
            total_security_incidents=sec_rep.total_security_events,
            security_alerts=sec_rep.security_alerts_generated
        )

        return ComprehensiveReportResponse(
            generated_at=datetime.now(timezone.utc).isoformat(),
            date_range_applied={
                "start_date": filters.start_date,
                "end_date": filters.end_date
            },
            metrics=metrics,
            top_uploaders=upload_rep.files_by_user[:5],
            top_downloaders=download_rep.downloads_by_user[:5],
            most_downloaded_files=download_rep.most_downloaded_files[:5],
            recent_security_incidents=sec_rep.incidents[:5],
            recent_uploads=upload_rep.records[:5]
        )


reports_service = ReportsService()

