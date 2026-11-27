import logging
import smtplib
import threading
from email.message import EmailMessage

from app.core.config import settings

log = logging.getLogger("trustshare.email")


def _send(to: str, subject: str, body: str) -> None:
    if not settings.smtp_host:
        log.info("EMAIL (SMTP not configured) to=%s subject=%s\n%s", to, subject, body)
        return
    msg = EmailMessage()
    msg["From"], msg["To"], msg["Subject"] = settings.smtp_from, to, subject
    msg.set_content(body)
    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=8) as smtp:
            if settings.smtp_tls:
                smtp.starttls()
            if settings.smtp_user:
                smtp.login(settings.smtp_user, settings.smtp_password)
            smtp.send_message(msg)
    except Exception:  # noqa: BLE001
        log.exception("Could not send email to %s", to)


def send_email(to: str, subject: str, body: str) -> None:
    """Fire-and-forget so a slow mail server never blocks a request."""
    threading.Thread(target=_send, args=(to, subject, body), daemon=True).start()
