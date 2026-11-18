"""
TrustShare - Email Notification Service
========================================
Supports sending emails for:
1. File sharing invitations & access passcodes
2. Security alerts (failed logins, unauthorized access)
3. Sharing link expiration reminders
Falls back safely to simulated log delivery if SMTP is unconfigured.
"""

import os
import smtplib
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional, Dict, Any

logger = logging.getLogger("trustshare.notifications.email")

SMTP_HOST = os.getenv("SMTP_HOST")
SMTP_PORT = int(os.getenv("SMTP_PORT", 587))
SMTP_USER = os.getenv("SMTP_USER")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")
EMAILS_FROM = os.getenv("EMAILS_FROM", "notifications@trustshare.io")


class EmailNotificationService:

    @staticmethod
    def send_email(
        to_email: str,
        subject: str,
        body_text: str,
        body_html: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Delivers an email via SMTP or records a simulated delivery log for development.
        """
        if not to_email:
            return {"status": "skipped", "reason": "No recipient email provided"}

        # Real SMTP Delivery if credentials provided
        if SMTP_HOST and SMTP_USER and SMTP_PASSWORD:
            try:
                msg = MIMEMultipart("alternative")
                msg["Subject"] = subject
                msg["From"] = EMAILS_FROM
                msg["To"] = to_email

                part1 = MIMEText(body_text, "plain")
                msg.attach(part1)

                if body_html:
                    part2 = MIMEText(body_html, "html")
                    msg.attach(part2)

                with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
                    server.starttls()
                    server.login(SMTP_USER, SMTP_PASSWORD)
                    server.sendmail(EMAILS_FROM, to_email, msg.as_string())

                logger.info(f"[Email Sent] Successfully delivered to {to_email}: '{subject}'")
                return {"status": "delivered", "recipient": to_email, "mode": "smtp"}
            except Exception as e:
                logger.error(f"[Email Error] SMTP failed for {to_email}: {e}. Falling back to simulated log.")

        # Development / Testing Simulated Delivery
        logger.info(
            f"[Simulated Email Delivery]\n"
            f"  To: {to_email}\n"
            f"  Subject: {subject}\n"
            f"  Body Preview: {body_text[:120]}..."
        )
        return {
            "status": "delivered",
            "recipient": to_email,
            "mode": "simulated",
            "subject": subject
        }

    @classmethod
    def send_file_share_email(
        cls,
        recipient_email: str,
        sender_username: str,
        file_name: str,
        share_url: str,
        permission: str = "download",
        guest_password: Optional[str] = None
    ):
        subject = f"TrustShare: {sender_username} shared '{file_name}' with you"
        body_text = (
            f"Hello,\n\n"
            f"{sender_username} has shared a document with you on TrustShare.\n\n"
            f"File: {file_name}\n"
            f"Permission: {permission.upper()}\n"
            f"Link: {share_url}\n"
        )
        if guest_password:
            body_text += f"Guest Passcode: {guest_password}\n"
        body_text += "\nAccess the file securely through TrustShare's encrypted vault."

        return cls.send_email(to_email=recipient_email, subject=subject, body_text=body_text)

    @classmethod
    def send_security_alert_email(
        cls,
        admin_email: str,
        alert_title: str,
        alert_message: str,
        ip_address: str = "127.0.0.1"
    ):
        subject = f"[CRITICAL SECURITY ALERT] TrustShare: {alert_title}"
        body_text = (
            f"SECURITY ALERT NOTIFICATION\n"
            f"===========================\n"
            f"Alert: {alert_title}\n"
            f"Message: {alert_message}\n"
            f"Source IP: {ip_address}\n\n"
            f"Please log in to the Administrator Security Dashboard to review telemetry."
        )
        return cls.send_email(to_email=admin_email, subject=subject, body_text=body_text)

    @classmethod
    def send_link_expiration_email(
        cls,
        owner_email: str,
        file_name: str,
        expires_at_str: str,
        share_url: str
    ):
        subject = f"TrustShare Reminder: Sharing link for '{file_name}' is expiring soon"
        body_text = (
            f"Hello,\n\n"
            f"Your shared link for document '{file_name}' is approaching its expiration.\n"
            f"Expiration Timestamp: {expires_at_str}\n"
            f"Link: {share_url}\n\n"
            f"You can renew, extend, or revoke this link from your TrustShare Dashboard."
        )
        return cls.send_email(to_email=owner_email, subject=subject, body_text=body_text)


email_service = EmailNotificationService()

