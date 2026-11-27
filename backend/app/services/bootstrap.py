import logging

from sqlalchemy import select

from app.core.config import settings
from app.core.database import SessionLocal
from app.core.security import hash_password
from app.models import Role, User

log = logging.getLogger("trustshare.bootstrap")

DEMO_PASSWORD = "Demo@12345"
DEMO_USERS = [
    ("usha@trustshare.local", "Usha Nayak", Role.USER),
    ("rohit@trustshare.local", "Rohit Verma", Role.USER),
    ("guest@trustshare.local", "Guest Reviewer", Role.GUEST),
]


def seed() -> None:
    with SessionLocal() as db:
        if settings.admin_password and not db.scalar(select(User).where(User.email == settings.admin_email.lower())):
            db.add(User(email=settings.admin_email.lower(), full_name=settings.admin_name,
                        hashed_password=hash_password(settings.admin_password), role=Role.ADMIN))
            log.info("Created admin account %s", settings.admin_email)
        if settings.seed_demo_users and not settings.is_production:
            for email, name, role in DEMO_USERS:
                if not db.scalar(select(User).where(User.email == email)):
                    db.add(User(email=email, full_name=name, role=role, hashed_password=hash_password(DEMO_PASSWORD)))
            log.info("Demo users ready (password %s)", DEMO_PASSWORD)
        db.commit()
