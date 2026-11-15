"""First-run setup: make sure the administrator account exists.

Why: the old rule ("whoever registers with ADMIN_EMAIL becomes admin") fails if you registered before setting ADMIN_EMAIL, or
typed a slightly different e-mail. Now, at every start-up:
  * if ADMIN_EMAIL belongs to an existing account -> that account is given the admin role;
  * if it does not exist and ADMIN_PASSWORD is set -> the admin account is created.
"""
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import hash_password
from app.models.postgres import Role, User

logger = logging.getLogger("trustshare.bootstrap")


async def _promote_oldest_if_no_admin(db: AsyncSession) -> None:
    """Safety net: a platform with NO administrator cannot be managed, so the oldest account (the person who set it up) becomes admin."""
    if not settings.PROMOTE_FIRST_USER:
        return
    admin_role = (await db.execute(select(Role).where(Role.name == "admin"))).scalar_one()
    has_admin = (await db.execute(select(User.id).join(User.roles).where(Role.name == "admin").limit(1))).first()
    if has_admin:
        return
    first = (await db.execute(select(User).order_by(User.created_at.asc()).limit(1))).scalar_one_or_none()
    if first:
        first.roles.append(admin_role)
        first.is_active, first.approval_status = True, "approved"
        await db.commit()
        logger.warning("No administrator existed, so the oldest account %s was made ADMIN (PROMOTE_FIRST_USER)", first.email)


async def ensure_admin(db: AsyncSession) -> None:
    email = (settings.ADMIN_EMAIL or "").strip().lower()
    if not email:
        logger.info("ADMIN_EMAIL is empty: no admin is created from it (use scripts/make_admin.py)")
        await _promote_oldest_if_no_admin(db)
        return
    admin_role = (await db.execute(select(Role).where(Role.name == "admin"))).scalar_one()
    user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if user:
        changed = False
        if "admin" not in [r.name for r in user.roles]:
            user.roles.append(admin_role)
            changed = True
        if not user.is_active or user.approval_status != "approved":
            user.is_active, user.approval_status, changed = True, "approved", True
        if changed:
            await db.commit()
            logger.warning("Account %s now has the ADMIN role (because it matches ADMIN_EMAIL)", email)
        return
    pw = settings.ADMIN_PASSWORD
    if len(pw) >= 8 and any(c.isalpha() for c in pw) and any(c.isdigit() for c in pw):
        db.add(User(email=email, full_name=email.split("@")[0].title() or "Administrator", hashed_password=hash_password(pw), roles=[admin_role]))
        await db.commit()
        logger.warning("Administrator account %s was created from ADMIN_EMAIL / ADMIN_PASSWORD", email)
    else:
        logger.info("Admin %s does not exist yet. Register with that e-mail, or set ADMIN_PASSWORD (8+ characters with a letter and a number).", email)
        await _promote_oldest_if_no_admin(db)
