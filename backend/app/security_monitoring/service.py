from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
from sqlalchemy.orm import Session
from app.db.session import SessionLocal
from app.models.security_alert import SecurityAlert
from app.models.audit_log import AuditLog
from app.db.mongo import mongo_db


class SecurityMonitoringService:
    """
    Milestone 3 Task 6: Security Monitoring & Threat Investigation Service.
    """

    @classmethod
    def get_security_summary(cls) -> Dict[str, Any]:
        with SessionLocal() as db:
            total_alerts = db.query(SecurityAlert).count()
            active_alerts = db.query(SecurityAlert).filter(SecurityAlert.status == "active").count()
            failed_logins = db.query(AuditLog).filter(AuditLog.action == "USER_LOGIN_FAILED").count()
            unauthorized_access = db.query(AuditLog).filter(
                AuditLog.action.in_(["UNAUTHORIZED_ACCESS", "FILE_DOWNLOAD_REJECTED"])
            ).count()
            suspicious_downloads = db.query(SecurityAlert).filter(
                SecurityAlert.activity_type == "EXCESSIVE_DOWNLOADS"
            ).count()
            expired_link_attempts = db.query(SecurityAlert).filter(
                SecurityAlert.activity_type == "EXPIRED_LINK_ACCESS"
            ).count()
            revoked_link_attempts = db.query(SecurityAlert).filter(
                SecurityAlert.activity_type == "REVOKED_LINK_ACCESS"
            ).count()

            return {
                "total_security_events": total_alerts + failed_logins + unauthorized_access,
                "active_alerts": active_alerts,
                "failed_login_attempts": failed_logins,
                "unauthorized_access_attempts": unauthorized_access,
                "suspicious_downloads": suspicious_downloads,
                "expired_link_access_attempts": expired_link_attempts,
                "revoked_link_access_attempts": revoked_link_attempts,
            }

    @classmethod
    def get_security_alerts(
        cls,
        severity: Optional[str] = None,
        activity_type: Optional[str] = None,
        status: Optional[str] = None,
        limit: int = 50,
        skip: int = 0,
    ) -> List[Dict[str, Any]]:
        with SessionLocal() as db:
            q = db.query(SecurityAlert)
            if severity and severity != "ALL":
                q = q.filter(SecurityAlert.severity == severity)
            if activity_type and activity_type != "ALL":
                q = q.filter(SecurityAlert.activity_type == activity_type)
            if status and status != "ALL":
                q = q.filter(SecurityAlert.status == status)

            alerts = q.order_by(SecurityAlert.timestamp.desc()).offset(skip).limit(limit).all()
            return [
                {
                    "id": a.id,
                    "user_id": a.user_id,
                    "user_email": a.user_email,
                    "ip_address": a.ip_address,
                    "activity_type": a.activity_type,
                    "description": a.description,
                    "severity": a.severity,
                    "status": a.status,
                    "timestamp": a.timestamp.isoformat() if a.timestamp else None,
                    "details": a.details,
                }
                for a in alerts
            ]

    @classmethod
    def resolve_alert(cls, alert_id: int) -> bool:
        with SessionLocal() as db:
            alert = db.query(SecurityAlert).filter(SecurityAlert.id == alert_id).first()
            if alert:
                alert.status = "resolved"
                db.commit()
                return True
            return False

