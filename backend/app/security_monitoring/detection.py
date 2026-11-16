from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any
from sqlalchemy.orm import Session
from app.db.session import SessionLocal
from app.models.security_alert import SecurityAlert
from app.models.audit_log import AuditLog
from app.models.notification import Notification
from app.models.user import User, UserRole
from app.db.mongo import mongo_db
from app.notifications.email_service import EmailService


class SecurityDetectionEngine:
    """
    Milestone 3 Task 6: Rule-Based Suspicious Activity Detection Engine.
    Monitors incoming activities in real-time against defined security rules:
    - Failed Logins: > 5 failed attempts within 10 minutes (Severity: HIGH)
    - Unauthorized Access: Repeated restricted file access (Severity: HIGH)
    - Excessive Downloads: > 20 downloads within 5 minutes (Severity: MEDIUM)
    - Expired Link Access: Repeated attempts to use expired links (Severity: MEDIUM)
    - Revoked Link Access: Attempts to use revoked links (Severity: HIGH)
    """

    @classmethod
    async def evaluate_activity(
        cls,
        user_id: Optional[int],
        user_email: Optional[str],
        action: str,
        details: Optional[Dict[str, Any]],
        ip_address: Optional[str] = None,
    ):
        details = details or {}
        ip = ip_address or details.get("ip", "127.0.0.1")
        now = datetime.now(timezone.utc)

        # 1. Failed Logins Check (> 5 failed attempts within 10 minutes)
        if action == "USER_LOGIN_FAILED":
            ten_mins_ago = now - timedelta(minutes=10)
            count = 0
            if mongo_db is not None:
                try:
                    count = await mongo_db["activity_logs"].count_documents({
                        "action": "USER_LOGIN_FAILED",
                        "timestamp": {"$gte": ten_mins_ago},
                        "$or": [{"user_email": user_email}, {"details.ip": ip}],
                    })
                except Exception:
                    count = 0
            if count == 0:
                with SessionLocal() as db:
                    count = (
                        db.query(AuditLog)
                        .filter(
                            AuditLog.action == "USER_LOGIN_FAILED",
                            AuditLog.timestamp >= ten_mins_ago,
                            (AuditLog.user_email == user_email) | (AuditLog.details["ip"].as_string() == ip),
                        )
                        .count()
                    )

            if count >= 5:
                await cls.trigger_security_alert(
                    user_id=user_id,
                    user_email=user_email,
                    ip_address=ip,
                    activity_type="FAILED_LOGINS",
                    description=f"Multiple failed login attempts ({count} failures in 10 minutes) detected for {user_email or ip}.",
                    severity="High",
                    details={"failures_count": count, "window_minutes": 10, "ip": ip},
                )

        # 2. Unauthorized Access Check (repeated restricted file access)
        elif action in ["UNAUTHORIZED_ACCESS", "FILE_DOWNLOAD_REJECTED"]:
            fifteen_mins_ago = now - timedelta(minutes=15)
            count = 0
            if mongo_db is not None:
                try:
                    count = await mongo_db["activity_logs"].count_documents({
                        "action": "UNAUTHORIZED_ACCESS",
                        "timestamp": {"$gte": fifteen_mins_ago},
                        "$or": [{"user_id": user_id}, {"details.ip": ip}],
                    })
                except Exception:
                    count = 0
            if count >= 3:
                await cls.trigger_security_alert(
                    user_id=user_id,
                    user_email=user_email,
                    ip_address=ip,
                    activity_type="UNAUTHORIZED_ACCESS",
                    description=f"Repeated unauthorized access attempts ({count} violations) detected from {user_email or ip}.",
                    severity="High",
                    details={"violations_count": count, "ip": ip, "last_action": action},
                )

        # 3. Excessive Downloads Check (> 20 downloads within 5 minutes)
        elif action in ["FILE_DOWNLOAD", "PUBLIC_SHARE_DOWNLOAD"]:
            five_mins_ago = now - timedelta(minutes=5)
            count = 0
            if mongo_db is not None:
                try:
                    count = await mongo_db["activity_logs"].count_documents({
                        "action": {"$in": ["FILE_DOWNLOAD", "PUBLIC_SHARE_DOWNLOAD"]},
                        "timestamp": {"$gte": five_mins_ago},
                        "$or": [{"user_id": user_id}, {"details.ip": ip}],
                    })
                except Exception:
                    count = 0
            if count >= 20:
                await cls.trigger_security_alert(
                    user_id=user_id,
                    user_email=user_email,
                    ip_address=ip,
                    activity_type="EXCESSIVE_DOWNLOADS",
                    description=f"Suspicious download spike: {count} downloads within 5 minutes by {user_email or ip}.",
                    severity="Medium",
                    details={"download_count": count, "window_minutes": 5, "ip": ip},
                )

        # 4. Expired Link Access Check
        elif action in ["EXPIRED_LINK_ACCESS", "SHARE_LINK_EXPIRED_ACCESS"]:
            await cls.trigger_security_alert(
                user_id=user_id,
                user_email=user_email,
                ip_address=ip,
                activity_type="EXPIRED_LINK_ACCESS",
                description=f"Attempted access to an expired share link by IP {ip}.",
                severity="Medium",
                details=details,
            )

        # 5. Revoked Link Access Check
        elif action in ["REVOKED_LINK_ACCESS", "SHARE_LINK_REVOKED_ACCESS"]:
            await cls.trigger_security_alert(
                user_id=user_id,
                user_email=user_email,
                ip_address=ip,
                activity_type="REVOKED_LINK_ACCESS",
                description=f"Attempted access to a revoked share link by IP {ip}.",
                severity="High",
                details=details,
            )

    @classmethod
    async def trigger_security_alert(
        cls,
        user_id: Optional[int],
        user_email: Optional[str],
        ip_address: Optional[str],
        activity_type: str,
        description: str,
        severity: str,
        details: Optional[Dict[str, Any]] = None,
    ):
        now = datetime.now(timezone.utc)
        alert_record = None

        # 1. Save alert into PostgreSQL
        with SessionLocal() as db:
            # Prevent duplicate identical active alerts within 1 minute
            one_min_ago = now - timedelta(minutes=1)
            recent_alert = (
                db.query(SecurityAlert)
                .filter(
                    SecurityAlert.activity_type == activity_type,
                    SecurityAlert.timestamp >= one_min_ago,
                    SecurityAlert.ip_address == ip_address,
                )
                .first()
            )
            if recent_alert:
                return  # Skip spamming identical alerts

            alert_record = SecurityAlert(
                user_id=user_id,
                user_email=user_email,
                ip_address=ip_address,
                activity_type=activity_type,
                description=description,
                severity=severity,
                status="active",
                timestamp=now,
                details=details or {},
            )
            db.add(alert_record)
            db.commit()
            db.refresh(alert_record)

            # 2. Automatically dispatch notifications & email alerts to all Administrators
            admin_users = db.query(User).filter(User.role == UserRole.ADMIN).all()
            for admin in admin_users:
                notif = Notification(
                    user_id=admin.id,
                    title=f"Security Alert: {severity.upper()} - {activity_type.replace('_', ' ').title()}",
                    message=description,
                    notification_type="SECURITY_ALERT",
                    is_read=False,
                    link_url="/admin?tab=security",
                    created_at=now,
                )
                db.add(notif)
                if admin.email:
                    EmailService.send_security_alert_email(
                        admin_email=admin.email,
                        alert_type=activity_type,
                        severity=severity,
                        details=description,
                    )
            db.commit()

        # 3. Save alert into MongoDB Atlas collection 'security_alerts'
        if mongo_db is not None:
            try:
                await mongo_db["security_alerts"].insert_one({
                    "sql_alert_id": alert_record.id if alert_record else None,
                    "user_id": user_id,
                    "user_email": user_email,
                    "ip_address": ip_address,
                    "activity_type": activity_type,
                    "description": description,
                    "severity": severity,
                    "status": "active",
                    "timestamp": now,
                    "details": details or {},
                })
            except Exception as e:
                print(f"MongoDB security alert logging error: {e}")

