import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Notification, Role, User
from app.services.email_service import send_email


def notify(db: Session, user_id: uuid.UUID, type_: str, title: str, message: str,
           link: str | None = None, email_to: str | None = None) -> None:
    """Create an in-app notification (caller commits) and optionally email it."""
    db.add(Notification(user_id=user_id, type=type_, title=title, message=message, link=link))
    if email_to:
        send_email(email_to, f"[TrustShare] {title}", f"{message}\n\n— TrustShare")


def notify_admins(db: Session, type_: str, title: str, message: str) -> None:
    for admin in db.scalars(select(User).where(User.role == Role.ADMIN, User.is_active.is_(True))):
        notify(db, admin.id, type_, title, message)
