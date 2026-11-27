import uuid

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.request import RequestInfo, get_request_info
from app.core.security import decode_token
from app.models import Role, User
from app.services import audit_service as audit
from app.services import session_service

bearer = HTTPBearer(auto_error=False)


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
    info: RequestInfo = Depends(get_request_info),
) -> User:
    if not creds:
        raise HTTPException(401, "Not authenticated", headers={"WWW-Authenticate": "Bearer"})
    try:
        payload = decode_token(creds.credentials, "access")
        user_id = uuid.UUID(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        raise HTTPException(401, "Session expired. Please sign in again.", headers={"WWW-Authenticate": "Bearer"}) from None
    if not session_service.get_session(payload.get("sid", "")):
        raise HTTPException(401, "Session ended. Please sign in again.", headers={"WWW-Authenticate": "Bearer"})
    user = db.get(User, user_id)
    if not user or not user.is_active:
        raise HTTPException(401, "Account unavailable")
    return user


def require_roles(*roles: str):
    """RBAC dependency: enforced on the server for every protected route."""
    def checker(user: User = Depends(get_current_user), info: RequestInfo = Depends(get_request_info)) -> User:
        if user.role not in roles:
            audit.log_access_attempt("unauthorized", f"role '{user.role}' not allowed", info, user)
            audit.log_security_event(audit.EVT_UNAUTHORIZED, "high" if Role.ADMIN in roles else "medium",
                                     "Unauthorized access attempt", info, user,
                                     f"{user.email} ({user.role}) requested {info.method} {info.path}")
            raise HTTPException(403, "You don't have permission to access this area.")
        return user
    return checker


get_admin = require_roles(Role.ADMIN)
get_member = require_roles(Role.ADMIN, Role.USER)   # can upload / manage files (guests are read-only)
