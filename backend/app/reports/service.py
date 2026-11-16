import io
import csv
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.db.session import SessionLocal
from app.models.user import User
from app.models.file import FileRecord
from app.models.share_link import ShareLink
from app.models.audit_log import AuditLog
from app.models.security_alert import SecurityAlert
from app.db.mongo import mongo_db


class ReportsService:
    """
    Milestone 3 Task 4: File Activity & Security Reporting Service.
    Aggregates file operations, user histories, and security logs into structured reports.
    """

    @classmethod
    def get_upload_report(cls, start_date: Optional[datetime] = None, end_date: Optional[datetime] = None) -> Dict[str, Any]:
        with SessionLocal() as db:
            q = db.query(FileRecord)
            if start_date:
                q = q.filter(FileRecord.uploaded_at >= start_date)
            if end_date:
                q = q.filter(FileRecord.uploaded_at <= end_date)
            files = q.order_by(FileRecord.uploaded_at.desc()).all()

            total_uploaded = len(files)
            user_counts: Dict[str, int] = {}
            type_counts: Dict[str, int] = {}
            recent_uploads = []

            for f in files:
                owner = db.query(User).filter(User.id == f.owner_id).first()
                owner_name = owner.email if owner else f"User #{f.owner_id}"
                user_counts[owner_name] = user_counts.get(owner_name, 0) + 1

                ext = f.original_filename.split(".")[-1].lower() if "." in f.original_filename else "unknown"
                type_counts[ext] = type_counts.get(ext, 0) + 1

                recent_uploads.append({
                    "file_id": f.id,
                    "original_filename": f.original_filename,
                    "file_size": f.file_size,
                    "content_type": f.content_type,
                    "owner": owner_name,
                    "upload_date": f.uploaded_at.isoformat() if f.uploaded_at else None,
                    "status": "Encrypted (AES-256-GCM)",
                })

            return {
                "total_files_uploaded": total_uploaded,
                "files_uploaded_by_user": [{"user": k, "count": v} for k, v in user_counts.items()],
                "file_types_distribution": [{"type": k, "count": v} for k, v in type_counts.items()],
                "recent_uploads": recent_uploads[:50],
            }

    @classmethod
    def get_download_report(cls, start_date: Optional[datetime] = None, end_date: Optional[datetime] = None) -> Dict[str, Any]:
        with SessionLocal() as db:
            q = db.query(AuditLog).filter(
                AuditLog.action.in_(["FILE_DOWNLOAD", "PUBLIC_SHARE_DOWNLOAD", "FILE_DOWNLOAD_REJECTED"])
            )
            if start_date:
                q = q.filter(AuditLog.timestamp >= start_date)
            if end_date:
                q = q.filter(AuditLog.timestamp <= end_date)
            logs = q.order_by(AuditLog.timestamp.desc()).all()

            total_downloads = 0
            failed_downloads = 0
            user_downloads: Dict[str, int] = {}
            file_download_counts: Dict[str, int] = {}
            recent_events = []

            for l in logs:
                details = l.details or {}
                fn = details.get("filename") or f"File #{details.get('file_id', 'Unknown')}"
                user_label = l.user_email or "Public Recipient"

                if l.action == "FILE_DOWNLOAD_REJECTED" or "FAILED" in l.action:
                    failed_downloads += 1
                else:
                    total_downloads += 1
                    user_downloads[user_label] = user_downloads.get(user_label, 0) + 1
                    file_download_counts[fn] = file_download_counts.get(fn, 0) + 1

                recent_events.append({
                    "id": l.id,
                    "user": user_label,
                    "filename": fn,
                    "action": l.action,
                    "status": "Failed" if "FAILED" in l.action or "REJECTED" in l.action else "Success",
                    "timestamp": l.timestamp.isoformat() if l.timestamp else None,
                    "ip": details.get("ip", "127.0.0.1"),
                })

            most_downloaded = sorted(
                [{"filename": k, "count": v} for k, v in file_download_counts.items()],
                key=lambda x: x["count"],
                reverse=True,
            )[:10]

            return {
                "total_downloads": total_downloads,
                "failed_download_attempts": failed_downloads,
                "downloads_by_user": [{"user": k, "count": v} for k, v in user_downloads.items()],
                "most_downloaded_files": most_downloaded,
                "recent_download_events": recent_events[:50],
            }

    @classmethod
    def get_sharing_report(cls) -> Dict[str, Any]:
        now = datetime.now(timezone.utc)
        with SessionLocal() as db:
            links = db.query(ShareLink).order_by(ShareLink.created_at.desc()).all()
            total_shared = len(links)
            active_links = 0
            expired_links = 0
            revoked_links = 0
            user_shared_counts: Dict[str, int] = {}
            recent_shares = []

            for link in links:
                creator = db.query(User).filter(User.id == link.created_by_id).first()
                creator_name = creator.email if creator else f"User #{link.created_by_id}"
                user_shared_counts[creator_name] = user_shared_counts.get(creator_name, 0) + 1

                # Status calculation
                # link.expires_at can be naive in postgres
                is_expired = False
                if link.expires_at:
                    exp = link.expires_at
                    if exp.tzinfo is None:
                        exp = exp.replace(tzinfo=timezone.utc)
                    if exp < now:
                        is_expired = True

                if link.is_revoked:
                    status = "Revoked"
                    revoked_links += 1
                elif is_expired:
                    status = "Expired"
                    expired_links += 1
                elif link.max_downloads and link.download_count >= link.max_downloads:
                    status = "Exhausted"
                    expired_links += 1
                else:
                    status = "Active"
                    active_links += 1

                file_rec = db.query(FileRecord).filter(FileRecord.id == link.file_id).first()
                file_name = file_rec.original_filename if file_rec else "Deleted File"

                recent_shares.append({
                    "id": link.id,
                    "creator": creator_name,
                    "filename": file_name,
                    "permission": link.permission,
                    "download_count": link.download_count,
                    "max_downloads": link.max_downloads,
                    "status": status,
                    "expires_at": link.expires_at.isoformat() if link.expires_at else None,
                    "created_at": link.created_at.isoformat() if link.created_at else None,
                })

            return {
                "total_files_shared": total_shared,
                "active_sharing_links": active_links,
                "expired_sharing_links": expired_links,
                "revoked_sharing_links": revoked_links,
                "files_shared_by_user": [{"user": k, "count": v} for k, v in user_shared_counts.items()],
                "recent_shares": recent_shares[:50],
            }

    @classmethod
    def get_user_activity_report(cls, user_id: int) -> Dict[str, Any]:
        with SessionLocal() as db:
            user = db.query(User).filter(User.id == user_id).first()
            if not user:
                return {"error": "User not found"}

            uploaded_files = db.query(FileRecord).filter(FileRecord.owner_id == user_id).all()
            shares = db.query(ShareLink).filter(ShareLink.created_by_id == user_id).all()
            logs = db.query(AuditLog).filter(AuditLog.user_id == user_id).order_by(AuditLog.timestamp.desc()).limit(100).all()

            return {
                "user": {
                    "id": user.id,
                    "email": user.email,
                    "full_name": user.full_name,
                    "role": user.role.value if hasattr(user.role, "value") else str(user.role),
                    "created_at": user.created_at.isoformat() if user.created_at else None,
                },
                "summary": {
                    "total_uploads": len(uploaded_files),
                    "total_shares": len(shares),
                    "total_activities": len(logs),
                },
                "uploads": [
                    {
                        "file_id": f.id,
                        "filename": f.original_filename,
                        "size": f.file_size,
                        "uploaded_at": f.uploaded_at.isoformat() if f.uploaded_at else None,
                    }
                    for f in uploaded_files
                ],
                "activity_history": [
                    {
                        "action": l.action,
                        "timestamp": l.timestamp.isoformat() if l.timestamp else None,
                        "details": l.details,
                    }
                    for l in logs
                ],
            }

    @classmethod
    def get_security_report(cls) -> Dict[str, Any]:
        with SessionLocal() as db:
            alerts = db.query(SecurityAlert).order_by(SecurityAlert.timestamp.desc()).all()
            failed_logins = db.query(AuditLog).filter(AuditLog.action == "USER_LOGIN_FAILED").count()
            unauthorized = db.query(AuditLog).filter(
                AuditLog.action.in_(["UNAUTHORIZED_ACCESS", "FILE_DOWNLOAD_REJECTED"])
            ).count()
            expired_link_attempts = db.query(SecurityAlert).filter(SecurityAlert.activity_type == "EXPIRED_LINK_ACCESS").count()
            revoked_link_attempts = db.query(SecurityAlert).filter(SecurityAlert.activity_type == "REVOKED_LINK_ACCESS").count()

            return {
                "summary": {
                    "total_security_alerts": len(alerts),
                    "failed_login_attempts": failed_logins,
                    "unauthorized_access_attempts": unauthorized,
                    "expired_link_access_attempts": expired_link_attempts,
                    "revoked_link_access_attempts": revoked_link_attempts,
                },
                "recent_alerts": [
                    {
                        "id": a.id,
                        "activity_type": a.activity_type,
                        "description": a.description,
                        "severity": a.severity,
                        "status": a.status,
                        "ip": a.ip_address,
                        "user_email": a.user_email,
                        "timestamp": a.timestamp.isoformat() if a.timestamp else None,
                    }
                    for a in alerts[:50]
                ],
            }

    @classmethod
    def generate_csv_report(cls, report_type: str) -> str:
        """
        Milestone 3 Task 4 Step 7-8: Exports structured reports into standard CSV format.
        """
        output = io.StringIO()
        writer = csv.writer(output)

        if report_type == "uploads":
            rep = cls.get_upload_report()
            writer.writerow(["File ID", "Filename", "File Size (Bytes)", "Content Type", "Owner", "Upload Date (UTC)", "Status"])
            for row in rep.get("recent_uploads", []):
                writer.writerow([
                    row.get("file_id"),
                    row.get("original_filename"),
                    row.get("file_size"),
                    row.get("content_type"),
                    row.get("owner"),
                    row.get("upload_date"),
                    row.get("status"),
                ])

        elif report_type == "downloads":
            rep = cls.get_download_report()
            writer.writerow(["Log ID", "User / Recipient", "Filename", "Action", "Status", "Timestamp (UTC)", "IP Address"])
            for row in rep.get("recent_download_events", []):
                writer.writerow([
                    row.get("id"),
                    row.get("user"),
                    row.get("filename"),
                    row.get("action"),
                    row.get("status"),
                    row.get("timestamp"),
                    row.get("ip"),
                ])

        elif report_type == "sharing":
            rep = cls.get_sharing_report()
            writer.writerow(["Share ID", "Creator", "Filename", "Permission", "Download Count", "Max Downloads", "Status", "Created At (UTC)", "Expires At (UTC)"])
            for row in rep.get("recent_shares", []):
                writer.writerow([
                    row.get("id"),
                    row.get("creator"),
                    row.get("filename"),
                    row.get("permission"),
                    row.get("download_count"),
                    row.get("max_downloads") or "Unlimited",
                    row.get("status"),
                    row.get("created_at"),
                    row.get("expires_at"),
                ])

        elif report_type == "security":
            rep = cls.get_security_report()
            writer.writerow(["Alert ID", "Activity Type", "Severity", "Status", "IP Address", "User Email", "Description", "Timestamp (UTC)"])
            for row in rep.get("recent_alerts", []):
                writer.writerow([
                    row.get("id"),
                    row.get("activity_type"),
                    row.get("severity"),
                    row.get("status"),
                    row.get("ip"),
                    row.get("user_email") or "Anonymous",
                    row.get("description"),
                    row.get("timestamp"),
                ])

        return output.getvalue()

