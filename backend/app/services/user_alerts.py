"""Per-user security triggers.

`wrong_password` is called by the login route after every failed password attempt for an existing account. It
notifies the *account owner* (not only administrators) so they learn about guessing attempts straight away:
first wrong password -> low-severity notice, then a high-severity alert + email each time the configured
threshold is reached inside the window (defaults: 3 wrong passwords in 15 minutes).
"""
from datetime import timedelta
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from ..config import get_settings
from ..db import utcnow
from ..models import LoginEvent, User


def wrong_password(db: Session, user: User, request=None) -> int:
    s = get_settings()
    since = utcnow() - timedelta(minutes=s.user_wrong_password_window_minutes)
    n = db.scalar(select(func.count()).select_from(LoginEvent).where(
        LoginEvent.user_id == user.id, LoginEvent.success.is_(False), LoginEvent.created_at >= since)) or 0
    thr = max(1, s.user_wrong_password_alert_threshold)
    from ..notifications.service import notify
    if n == 1 and thr > 1:
        notify(db, user.id, "Wrong password entered on your account",
               "Someone tried to sign in to your account with an incorrect password. If that was you, no action is needed.",
               type="security_alert", severity="low", link="/app/security", meta={"failed_in_window": n})
    elif n >= thr and (n - thr) % thr == 0:
        notify(db, user.id, "Repeated wrong-password attempts on your account",
               f"{n} incorrect passwords were entered for your account within {s.user_wrong_password_window_minutes} "
               "minutes. If this was not you, change your password now.",
               type="security_alert", severity="high", link="/app/security", email=True,
               meta={"failed_in_window": n, "threshold": thr})
    return n
