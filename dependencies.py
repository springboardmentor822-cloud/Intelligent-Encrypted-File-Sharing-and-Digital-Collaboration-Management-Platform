from typing import Optional
from fastapi import Depends, HTTPException, status, Request
from sqlalchemy.orm import Session

from database import get_db
from models.user import User, UserRole
from models.user_session import UserSession
from models.stored_file import StoredFile
from services.authentication_service import AuthenticationService
from config import settings

def extract_session_token(request: Request) -> Optional[str]:
    """Extract session token from HttpOnly cookie or Authorization Bearer header."""
    # 1. Try HttpOnly Cookie
    cookie_token = request.cookies.get(settings.SESSION_COOKIE_NAME)
    if cookie_token:
        return cookie_token

    # 2. Try Authorization: Bearer <token>
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        return auth_header.split(" ", 1)[1].strip()

    # 3. Try custom header X-Session-Token
    custom_header = request.headers.get("X-Session-Token")
    if custom_header:
        return custom_header.strip()

    return None

def get_current_user(
    request: Request,
    db: Session = Depends(get_db)
) -> User:
    """Dependency that ensures the request is from a verified authenticated user."""
    token = extract_session_token(request)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please sign in to continue.",
            headers={"WWW-Authenticate": "Bearer"}
        )

    user, session, err = AuthenticationService.validate_session(db, token)
    if err or not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=err or "Invalid or expired session. Please sign in again.",
            headers={"WWW-Authenticate": "Bearer"}
        )

    # Attach current user and session to request state for middleware/logging
    request.state.current_user = user
    request.state.current_session = session
    return user

def get_optional_user(
    request: Request,
    db: Session = Depends(get_db)
) -> Optional[User]:
    """Allows guest or authenticated access."""
    token = extract_session_token(request)
    if not token:
        return None
    user, session, err = AuthenticationService.validate_session(db, token)
    if user:
        request.state.current_user = user
        request.state.current_session = session
        return user
    return None

def require_admin(
    current_user: User = Depends(get_current_user)
) -> User:
    """Dependency that strictly enforces ADMIN role."""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access Denied: Administrator role required to access this resource."
        )
    return current_user

def verify_file_access(
    file_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> StoredFile:
    """Verifies file existence and verifies caller is owner or admin (IDOR protection)."""
    db_file = db.query(StoredFile).filter(StoredFile.id == file_id).first()
    if not db_file or db_file.is_deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found or has been moved to recycle bin."
        )

    # Admin can access any file for security review; Users can only access own files
    is_owner = (db_file.owner_email == current_user.email) or (db_file.owner_id == current_user.id)
    is_admin = (current_user.role == UserRole.ADMIN)

    if not is_owner and not is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access Denied: You do not have permission to access this file."
        )

    return db_file
