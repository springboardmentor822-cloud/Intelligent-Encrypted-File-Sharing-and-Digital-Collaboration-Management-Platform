"""
TrustShare - Suspicious Activity Detection Engine
=================================================
Identifies suspicious activities (failed logins, unauthorized access, excessive downloads, expired/revoked links).
Configurable detection rules & sliding window thresholds:
- Failed Logins: >= 3 failed attempts within 10 minutes (Severity: High)
- Unauthorized Access: >= 3 unauthorized attempts within 10 minutes (Severity: High)
- Excessive Downloads: >= 5 downloads within 5 minutes (Severity: Medium/High)
- Expired Link Access: >= 2 attempts within 10 minutes (Severity: Medium)
- Revoked Link Access: >= 2 attempts within 10 minutes (Severity: High)
Connects with activity monitoring and generates alerts in MongoDB `security_events` & `notifications`.
"""

import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, List
from collections import defaultdict, deque

from app.database import mongo_db
from app.notifications import notification_service


class DetectionRule:
    """Represents a rule for detecting unusual or unauthorized user activity."""
    def __init__(
        self,
        rule_id: str,
        name: str,
        event_type: str,
        threshold: int,
        window_seconds: int,
        severity: str,
        description: str
    ):
        self.rule_id = rule_id
        self.name = name
        self.event_type = event_type
        self.threshold = threshold
        self.window_seconds = window_seconds
        self.severity = severity
        self.description = description


class SuspiciousActivityDetector:
    """
    Evaluates recorded activities in real time against sliding window security rules.
    Maintains history in memory and triggers persistent security alerts.
    """

    def __init__(self):
        # Configurable security rules
        self.rules: Dict[str, DetectionRule] = {
            "failed_logins": DetectionRule(
                rule_id="RULE_FAILED_LOGINS",
                name="Multiple Failed Login Attempts",
                event_type="failed_logins",
                threshold=3,  # >= 3 attempts within 10 minutes
                window_seconds=600,
                severity="High",
                description="Repeated failed authentication attempts detected within a short time window"
            ),
            "unauthorized_access": DetectionRule(
                rule_id="RULE_UNAUTHORIZED_ACCESS",
                name="Repeated Unauthorized Access Attempts",
                event_type="unauthorized_access",
                threshold=3,  # >= 3 attempts within 10 minutes
                window_seconds=600,
                severity="High",
                description="Repeated attempts to access restricted files or invalid file passwords"
            ),
            "excessive_downloads": DetectionRule(
                rule_id="RULE_EXCESSIVE_DOWNLOADS",
                name="Excessive File Download Surge",
                event_type="excessive_downloads",
                threshold=5,  # >= 5 downloads within 5 minutes
                window_seconds=300,
                severity="Medium",
                description="Unusually high frequency of file downloads within 5 minutes"
            ),
            "expired_link": DetectionRule(
                rule_id="RULE_EXPIRED_LINK",
                name="Repeated Expired Link Access",
                event_type="expired_link",
                threshold=2,  # >= 2 attempts within 10 minutes
                window_seconds=600,
                severity="Medium",
                description="Repeated attempts to retrieve files using expired sharing links"
            ),
            "revoked_link": DetectionRule(
                rule_id="RULE_REVOKED_LINK",
                name="Repeated Revoked Link Access",
                event_type="revoked_link",
                threshold=2,  # >= 2 attempts within 10 minutes
                window_seconds=600,
                severity="High",
                description="Repeated attempts to retrieve files using explicitly revoked sharing links"
            )
        }

        # Sliding window tracking: (rule_type, key) -> deque([timestamps])
        self._sliding_windows: Dict[str, deque] = defaultdict(deque)

        # Cooldown tracking to prevent duplicate alert storms within 60 seconds
        self._last_alert_time: Dict[str, datetime] = {}

    def _get_key(self, event_type: str, user_id: Optional[int], username: Optional[str], ip: str) -> str:
        ident = username or (str(user_id) if user_id else ip)
        return f"{event_type}:{ident}"

    async def evaluate_activity(
        self,
        action: str,
        user_id: Optional[int] = None,
        username: Optional[str] = None,
        ip_address: str = "127.0.0.1",
        resource_id: Optional[str] = None,
        resource_name: Optional[str] = None,
        status: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Connect detection with activity monitoring.
        Whenever a new activity is recorded:
        1. Classifies the activity.
        2. Evaluates the corresponding rule's sliding time window.
        3. Generates a security event and alert if the rule triggers.
        """
        act_upper = (action or "").upper()
        event_type = None

        if "LOGIN_FAIL" in act_upper or "FAILED_LOGIN" in act_upper:
            event_type = "failed_logins"
        elif any(x in act_upper for x in ["ACCESS_DENIED", "UNAUTHORIZED", "PASSWORD_VERIFY_FAILED"]):
            event_type = "unauthorized_access"
        elif "FILE_DOWNLOAD" in act_upper:
            event_type = "excessive_downloads"
        elif "EXPIRED_LINK" in act_upper:
            event_type = "expired_link"
        elif "REVOKED_LINK" in act_upper:
            event_type = "revoked_link"

        if not event_type or event_type not in self.rules:
            return None

        rule = self.rules[event_type]
        now = datetime.now(timezone.utc)
        key = self._get_key(event_type, user_id, username, ip_address)

        # 1. Update sliding window
        window = self._sliding_windows[key]
        window.append(now)

        # 2. Prune old timestamps
        cutoff = now - timedelta(seconds=rule.window_seconds)
        while window and window[0] < cutoff:
            window.popleft()

        attempt_count = len(window)

        # 3. Check threshold
        if attempt_count >= rule.threshold:
            # Check cooldown (avoid repeating identical alerts within 45 seconds)
            last_alert = self._last_alert_time.get(key)
            if last_alert and (now - last_alert).total_seconds() < 45:
                return None

            self._last_alert_time[key] = now

            # Generate Security Event & Alert
            event = await self._trigger_security_alert(
                rule=rule,
                user_id=user_id,
                username=username,
                ip_address=ip_address,
                resource_id=resource_id,
                resource_name=resource_name,
                attempt_count=attempt_count,
                details=details
            )
            return event

        return None

    async def _trigger_security_alert(
        self,
        rule: DetectionRule,
        user_id: Optional[int],
        username: Optional[str],
        ip_address: str,
        resource_id: Optional[str],
        resource_name: Optional[str],
        attempt_count: int,
        details: Optional[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Persists the security event in MongoDB and notifies administrators."""
        event_id = f"sec_ev_{uuid.uuid4().hex[:12]}"
        alert_id = f"alert_{uuid.uuid4().hex[:8]}"
        now_iso = datetime.now(timezone.utc).isoformat()

        user_label = username or (f"User #{user_id}" if user_id else f"IP {ip_address}")
        target_label = resource_name or resource_id or "System Resource"
        desc = f"Rule triggered: {rule.name}. {attempt_count} occurrences detected within {rule.window_seconds // 60} minutes for {user_label}."

        event_doc = {
            "event_id": event_id,
            "alert_id": alert_id,
            "user_id": user_id,
            "username": username or "Unknown",
            "ip_address": ip_address,
            "event_type": rule.event_type,
            "rule_name": rule.name,
            "description": desc,
            "severity": rule.severity,
            "status": "Open",
            "date_and_time": now_iso,
            "resource_id": resource_id,
            "resource_name": target_label,
            "attempt_count": attempt_count,
            "details": details or {}
        }

        # 1. Store in MongoDB security_events collection
        try:
            await mongo_db.security_events.insert_one(event_doc)
        except Exception as e:
            print(f"[SuspiciousActivityDetector] Mongo save error: {e}")

        # 2. Generate notification for administrators
        try:
            await notification_service.notify_security_alert(
                alert_title=f"Security Alert: {rule.name}",
                alert_message=desc,
                ip_address=ip_address,
                file_id=resource_id,
                file_name=resource_name,
                priority=rule.severity.lower()
            )
        except Exception as e:
            print(f"[SuspiciousActivityDetector] Notification error: {e}")

        return event_doc


suspicious_activity_detector = SuspiciousActivityDetector()

