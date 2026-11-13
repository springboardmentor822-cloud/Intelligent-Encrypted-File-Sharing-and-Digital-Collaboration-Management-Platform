"""Admin Visit — password-gated entry into the administrator panel.

Flow the product asks for: a user signs in normally, opens their dashboard, and finds an
"Admin Visit" entry. Only someone who knows the admin password can pass the gate. A correct
password issues a short-lived, purpose-scoped grant bound to that user id; every admin API
call then carries `X-Admin-Visit`. The grant is *not* a role change: it expires, it is bound
to one account, and it is never accepted as an access token.

Failed attempts are rate-limited, audited, and raise a critical Security Dashboard alert —
that is exactly the "someone is trying to get into the admin panel" trigger.
"""
import hmac
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import get_db, iso
from ..deps import ADMIN_VISIT_SCOPE, admin_visit_claims, current_user
from ..models import User
from ..serializers import user_out
from ..services.audit import audit, denied, raise_alert, security_event
from ..services.ratelimit import rate_limit
from ..services.security import create_scope_token

settings = get_settings()
router = APIRouter(prefix="/api/admin-visit", tags=["admin-visit"])


class VisitIn(BaseModel):
    password: str = Field(min_length=1, max_length=200)
    model_config = {"extra": "forbid"}


def _password_ok(candidate: str) -> bool:
    return hmac.compare_digest(candidate.encode(), settings.admin_visit_password.encode())


@router.get("/status")
def status(x_admin_visit: str | None = Header(None), user: User = Depends(current_user)):
    """Tells the UI whether this account already holds a live Admin Visit grant."""
    claims = admin_visit_claims(x_admin_visit, user)
    return {"unlocked": bool(claims), "is_admin_role": user.role == "admin",
            "expires_at": iso(datetime.fromtimestamp(claims["exp"], timezone.utc).replace(tzinfo=None)) if claims else None,
            "session_minutes": settings.admin_visit_minutes}


@router.post("/unlock", dependencies=[Depends(rate_limit("admin_visit", 5, 60))])
def unlock(body: VisitIn, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if not settings.admin_visit_enabled:
        raise HTTPException(404, "Admin Visit is disabled")
    if not _password_ok(body.password):
        denied(db, request, user_id=user.id, action="admin_visit.denied", resource_type="admin_visit",
               severity="high", category="admin_visit_failure", kind="blocked",
               description="Incorrect admin-visit password entered")
        raise_alert(db, "admin_visit_failure", "critical", "Failed Admin Visit attempt",
                    f"{user.email} entered an incorrect admin-visit password. Repeated failures may indicate "
                    "someone is trying to reach the administrator panel from a standard account.",
                    request=request, user_id=user.id, email=user.email, resource="admin_visit",
                    details={"path": request.url.path})
        raise HTTPException(401, "Incorrect admin password")

    tok, exp = create_scope_token(ADMIN_VISIT_SCOPE, user.id, minutes=settings.admin_visit_minutes)
    audit(db, "admin_visit.granted", request=request, actor_id=user.id, owner_id=user.id,
          resource_type="admin_visit", resource_id=user.id, details={"minutes": settings.admin_visit_minutes})
    security_event(db, "admin_visit", "medium", "Admin Visit grant issued", request=request, user_id=user.id,
                   details={"email": user.email})
    return {"admin_token": tok, "expires_at": iso(exp), "user": user_out(user)}


@router.post("/lock")
def lock(request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Client discards the grant; we record the end of the visit for the audit trail."""
    audit(db, "admin_visit.locked", request=request, actor_id=user.id, owner_id=user.id, resource_type="admin_visit",
          resource_id=user.id)
    return {"locked": True}
