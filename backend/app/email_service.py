import os
import smtplib
import logging
import re
from email.message import EmailMessage

from fastapi import HTTPException


email_logger = logging.getLogger("trustshare.email")


def send_email(recipient: str, subject: str, body: str) -> bool:
    host = os.getenv("SMTP_HOST", "").strip()
    sender = os.getenv("SMTP_FROM", "").strip()
    username = os.getenv("SMTP_USERNAME", "").strip()
    password = os.getenv("SMTP_PASSWORD", "")
    try:
        port = int(os.getenv("SMTP_PORT", "587"))
    except ValueError as exc:
        raise HTTPException(status_code=503, detail="SMTP_PORT must be a valid port number.") from exc
    if not 1 <= port <= 65535:
        raise HTTPException(status_code=503, detail="SMTP_PORT must be between 1 and 65535.")

    use_tls = os.getenv("SMTP_USE_TLS", "true").strip().lower() == "true"
    use_ssl = os.getenv("SMTP_USE_SSL", "false").strip().lower() == "true"
    if not host or not sender:
        raise HTTPException(
            status_code=503,
            detail="Email delivery is not configured. Set SMTP_HOST and SMTP_FROM.",
        )
    address_pattern = r"[^\s@]+@[^\s@]+\.[^\s@]+"
    if not re.fullmatch(address_pattern, sender) or not re.fullmatch(address_pattern, recipient):
        raise HTTPException(status_code=422, detail="A valid sender and recipient email address are required.")
    if username and not password:
        raise HTTPException(
            status_code=503,
            detail="SMTP_PASSWORD is required when SMTP_USERNAME is configured.",
        )
    if use_tls and use_ssl:
        raise HTTPException(
            status_code=503,
            detail="Configure either SMTP_USE_TLS or SMTP_USE_SSL, not both.",
        )

    message = EmailMessage()
    message["Subject"] = " ".join(subject.splitlines()).strip()[:200]
    message["From"] = sender
    message["To"] = recipient
    message.set_content(body)

    smtp_type = smtplib.SMTP_SSL if use_ssl else smtplib.SMTP
    try:
        with smtp_type(host, port, timeout=15) as smtp:
            if use_tls:
                smtp.starttls()
            if username:
                smtp.login(username, password)
            refused = smtp.send_message(message)
            if recipient in refused:
                raise smtplib.SMTPRecipientsRefused({recipient: refused[recipient]})
    except (OSError, smtplib.SMTPException) as exc:
        # Do not include provider exception text: it can contain account details.
        raise HTTPException(
            status_code=503,
            detail="The email provider could not accept the message. Check SMTP settings and try again.",
        ) from exc
    return True


def send_security_alert_emails(alert_type: str, event_count: int, window_seconds: int) -> None:
    """Send optional, data-minimized security alerts; SMTP failures never affect the request."""
    recipients = [value.strip() for value in os.getenv("SECURITY_ALERT_EMAILS", "").split(",") if value.strip()]
    for recipient in recipients:
        try:
            send_email(
                recipient,
                "TrustShare security alert",
                f"TrustShare detected {event_count} events matching {alert_type} in {window_seconds} seconds. "
                "Sign in to the administrator dashboard to review the security event.",
            )
        except Exception as exc:
            email_logger.warning("Security alert email failed: error=%s", type(exc).__name__)
