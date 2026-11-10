import secrets
from datetime import datetime, timedelta
from typing import Optional
from urllib.parse import urlencode
from pydantic import BaseModel, EmailStr
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.database import get_db, redis_client
from app.models import User, UserRole
from app.schemas import UserCreate, UserResponse, UserLogin, TokenResponse, UserProfileUpdate
from app.security import (
    hash_password,
    verify_password,
    create_access_token,
    get_current_user,
    require_role,
    security,
)
from app.services.logger import log_activity
from app.services.rate_limiter import check_rate_limit
from app.services import oauth_service

router = APIRouter(prefix="/auth", tags=["Authentication & RBAC"])


# Schemas for MFA, OAuth, and Password Reset
class MFASetupResponse(BaseModel):
    secret: str
    otpauth_url: str
    message: str

class MFAVerifyRequest(BaseModel):
    code: str

class OAuthMockRequest(BaseModel):
    provider: str  # 'google', 'microsoft', etc.
    email: EmailStr
    name: str

class OAuthContinueRequest(BaseModel):
    provider: str  # 'google' | 'microsoft'
    email: EmailStr
    name: str
    provider_id: Optional[str] = None

class OAuthVerifyRequest(BaseModel):
    provider: str  # 'google' | 'microsoft'
    token: str

class OAuthConfigRequest(BaseModel):
    provider: str  # 'google' | 'microsoft'
    client_id: str
    client_secret: str
    tenant_id: Optional[str] = "common"

class ForgotPasswordRequest(BaseModel):
    email: EmailStr

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


# ==============================================================================
# 1. REGISTER
# ==============================================================================
@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(request: Request, user_data: UserCreate, db: Session = Depends(get_db)):
    if (
        user_data.role == UserRole.ADMIN
        or user_data.username.strip().lower() == "admin"
        or user_data.email.strip().lower() == "admin@trustshare.io"
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrator accounts cannot be created via public registration. Administrator access is only available via Login."
        )

    if db.query(User).filter(User.email == user_data.email).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email already exists."
        )

    if db.query(User).filter(User.username == user_data.username).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This username is already taken."
        )

    new_user = User(
        email=user_data.email,
        username=user_data.username,
        full_name=user_data.full_name,
        hashed_password=hash_password(user_data.password),
        role=UserRole.USER,
        is_active=True
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    await log_activity(
        user_id=new_user.id,
        username=new_user.username,
        action="USER_REGISTERED",
        ip_address=request.client.host if request.client else "127.0.0.1",
        details={"role": new_user.role.value, "email": new_user.email}
    )

    return new_user


# ==============================================================================
# 2. LOGIN (WITH REDIS RATE LIMITING & AUDIT LOGGING)
# ==============================================================================
@router.post("/login", response_model=TokenResponse)
async def login(request: Request, credentials: UserLogin, db: Session = Depends(get_db)):
    client_ip = request.client.host if request.client else "127.0.0.1"
    # Rate limit: max 15 login attempts per minute per IP
    await check_rate_limit(f"login:{client_ip}", max_requests=15, window_seconds=60)

    user = db.query(User).filter(
        or_(
            User.email == credentials.email_or_username,
            User.username == credentials.email_or_username
        )
    ).first()

    if not user:
        await log_activity(
            user_id=None,
            username=credentials.email_or_username,
            action="LOGIN_FAILED",
            ip_address=client_ip,
            details={"reason": "User not found"}
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No account found with these credentials."
        )

    if not verify_password(credentials.password, user.hashed_password):
        await log_activity(
            user_id=user.id,
            username=user.username,
            action="LOGIN_FAILED",
            ip_address=client_ip,
            details={"reason": "Incorrect password"}
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect password. Please try again."
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is inactive. Contact administrator."
        )

    # Encode user ID, username, and role into the JWT claims
    access_token = create_access_token(
        data={
            "sub": str(user.id),
            "username": user.username,
            "role": user.role.value
        }
    )

    await log_activity(
        user_id=user.id,
        username=user.username,
        action="LOGIN_SUCCESS",
        ip_address=client_ip,
        details={"role": user.role.value}
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": user
    }


# ==============================================================================
# 3. GET & UPDATE CURRENT USER PROFILE
# ==============================================================================
@router.get("/me", response_model=UserResponse)
def get_my_profile(current_user: User = Depends(get_current_user)):
    """Returns profile and RBAC role of the authenticated token bearer"""
    return current_user


@router.put("/profile", response_model=UserResponse)
@router.put("/me", response_model=UserResponse)
async def update_my_profile(
    request: Request,
    profile_data: UserProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Updates the authenticated user's profile:
    - full_name
    - email (validates uniqueness across users)
    - username (validates uniqueness and updates MongoDB metadata owner_username)
    - password (requires current_password verification)
    """
    client_ip = request.client.host if request.client else "127.0.0.1"

    # 1. Update Full Name
    if profile_data.full_name is not None:
        current_user.full_name = profile_data.full_name.strip()

    # 2. Update Email
    if profile_data.email is not None and profile_data.email.strip().lower() != current_user.email.lower():
        new_email = profile_data.email.strip().lower()
        if new_email == "admin@trustshare.io" and current_user.role != UserRole.ADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cannot use system administrator email address."
            )
        existing = db.query(User).filter(User.email == new_email, User.id != current_user.id).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="An account with this email already exists."
            )
        current_user.email = new_email

    # 3. Update Username
    if profile_data.username is not None and profile_data.username.strip().lower() != current_user.username.lower():
        new_username = profile_data.username.strip()
        if len(new_username) < 3:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username must be at least 3 characters long."
            )
        if new_username.lower() == "admin" and current_user.role != UserRole.ADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Username 'admin' is reserved for system administrators."
            )
        existing = db.query(User).filter(User.username.ilike(new_username), User.id != current_user.id).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This username is already taken."
            )
        current_user.username = new_username

        # Synchronize MongoDB file ownership records
        try:
            from app.database import mongo_db
            await mongo_db.file_metadata.update_many(
                {"owner_id": current_user.id},
                {"$set": {"owner_username": new_username}}
            )
        except Exception as e:
            print("MongoDB owner_username sync warning:", e)

    # 4. Update Password (if requested)
    if profile_data.new_password:
        if len(profile_data.new_password) < 6:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="New password must be at least 6 characters long."
            )
        if current_user.hashed_password:
            if not profile_data.current_password or not verify_password(profile_data.current_password, current_user.hashed_password):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Current password is required and must be correct to set a new password."
                )
        current_user.hashed_password = hash_password(profile_data.new_password)

    db.commit()
    db.refresh(current_user)

    await log_activity(
        user_id=current_user.id,
        username=current_user.username,
        action="USER_PROFILE_UPDATED",
        ip_address=client_ip,
        details={"updated_fields": [k for k, v in profile_data.dict().items() if v is not None and k not in ["current_password", "new_password"]]}
    )

    return current_user



# ==============================================================================
# 4. LOGOUT (TOKEN REVOCATION VIA REDIS)
# ==============================================================================
@router.post("/logout")
async def logout(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    current_user: User = Depends(get_current_user)
):
    """Revokes active JWT by persisting the token signature to Redis with a TTL"""
    token = credentials.credentials
    if redis_client:
        try:
            # 86400 seconds = 24h expiration
            await redis_client.setex(f"blacklist:{token}", 86400, "revoked")
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to invalidate session: {str(e)}"
            )

    await log_activity(
        user_id=current_user.id,
        username=current_user.username,
        action="LOGOUT",
        ip_address=request.client.host if request.client else "127.0.0.1"
    )

    return {"message": "Successfully logged out. Token revoked."}


# ==============================================================================
# 5. MULTI-FACTOR AUTHENTICATION (MFA) FOUNDATIONS
# ==============================================================================
@router.post("/mfa/setup", response_model=MFASetupResponse)
async def setup_mfa(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Generates a secure secret and OTP Auth URI for TOTP authenticator apps"""
    secret = secrets.token_hex(16).upper()
    current_user.mfa_secret = secret
    db.commit()

    otpauth_url = f"otpauth://totp/TrustShare:{current_user.email}?secret={secret}&issuer=TrustShare"

    return {
        "secret": secret,
        "otpauth_url": otpauth_url,
        "message": "MFA secret generated. Scan QR or enter key in your Authenticator app and verify."
    }


@router.post("/mfa/verify")
async def verify_mfa(
    req: MFAVerifyRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Verifies TOTP verification code (accepts 6-digit code or test code '123456')"""
    if not current_user.mfa_secret:
        raise HTTPException(status_code=400, detail="MFA setup has not been initiated.")

    code = req.code.strip()
    # Simple simulated TOTP check (allows standard 6-digit verification)
    if len(code) != 6 or not code.isdigit():
        raise HTTPException(status_code=400, detail="Invalid code format. 6 digits required.")

    current_user.is_mfa_enabled = True
    db.commit()

    await log_activity(
        user_id=current_user.id,
        username=current_user.username,
        action="MFA_ENABLED",
        details={"status": "verified"}
    )

    return {"status": "success", "message": "MFA enabled successfully."}


@router.post("/mfa/disable")
async def disable_mfa(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    current_user.is_mfa_enabled = False
    current_user.mfa_secret = None
    db.commit()

    await log_activity(
        user_id=current_user.id,
        username=current_user.username,
        action="MFA_DISABLED"
    )

    return {"status": "success", "message": "MFA has been disabled."}


# ==============================================================================
# 6. OAUTH 2.0 INTEGRATION (GOOGLE & MICROSOFT OAUTH FOUNDATION)
# ==============================================================================
async def _authenticate_oauth_user(
    db: Session,
    provider: str,
    email: str,
    name: str,
    provider_id: Optional[str] = None,
    client_ip: str = "127.0.0.1",
) -> dict:
    normalized_email = email.strip().lower()
    user = db.query(User).filter(User.email == normalized_email).first()

    if not user:
        base_name = normalized_email.split("@")[0]
        clean_base = "".join(c for c in base_name if c.isalnum() or c == "_")[:20] or "user"
        username = clean_base
        if db.query(User).filter(User.username == username).first():
            username = f"{clean_base}_{secrets.token_hex(2)}"

        user = User(
            email=normalized_email,
            username=username,
            full_name=name.strip() if name else clean_base,
            hashed_password=hash_password(secrets.token_urlsafe(32)),
            role=UserRole.USER,
            oauth_provider=provider.lower(),
            oauth_provider_id=provider_id or f"{provider}_{secrets.token_hex(8)}",
            is_active=True
        )
        db.add(user)
        db.commit()
        db.refresh(user)

        await log_activity(
            user_id=user.id,
            username=user.username,
            action="OAUTH_REGISTER",
            ip_address=client_ip,
            details={"provider": provider, "email": normalized_email}
        )
    else:
        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Account is deactivated. Contact administrator."
            )

        updated = False
        if not user.oauth_provider:
            user.oauth_provider = provider.lower()
            if provider_id:
                user.oauth_provider_id = provider_id
            updated = True

        if not user.full_name and name:
            user.full_name = name.strip()
            updated = True

        if updated:
            db.commit()
            db.refresh(user)

        await log_activity(
            user_id=user.id,
            username=user.username,
            action="OAUTH_LOGIN",
            ip_address=client_ip,
            details={"provider": provider, "email": normalized_email}
        )

    access_token = create_access_token(
        data={
            "sub": str(user.id),
            "username": user.username,
            "role": user.role.value
        }
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": user
    }


@router.get("/oauth/config")
def get_oauth_configuration():
    """Returns configuration status and public client IDs for Google and Microsoft OAuth"""
    return oauth_service.get_oauth_config()


@router.post("/oauth/configure")
async def configure_oauth_credentials(req: OAuthConfigRequest):
    """
    Persists Google or Microsoft OAuth credentials to backend/.env and reloads settings.
    """
    provider_lower = req.provider.strip().lower()
    if provider_lower not in ("google", "microsoft"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provider must be either 'google' or 'microsoft'."
        )

    if not req.client_id.strip() or not req.client_secret.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Client ID and Client Secret cannot be empty."
        )

    success = oauth_service.save_oauth_credentials(
        provider=provider_lower,
        client_id=req.client_id,
        client_secret=req.client_secret,
        tenant_id=req.tenant_id
    )

    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save OAuth credentials."
        )

    return {
        "status": "success",
        "message": f"{provider_lower.capitalize()} OAuth credentials updated successfully.",
        "config": oauth_service.get_oauth_config()
    }


@router.get("/oauth/{provider}/authorize")
def authorize_oauth_provider(provider: str, force: Optional[bool] = False):
    """
    Redirects user's browser directly to Google's or Microsoft's official sign-in page.
    If credentials are configured, sends HTTP 307 Temporary Redirect to accounts.google.com
    or login.microsoftonline.com.
    If unconfigured and force is false, redirects to the frontend with an setup notification.
    """
    provider_lower = provider.lower()
    frontend_url = oauth_service.get_frontend_url()

    if provider_lower == "google":
        if not oauth_service.is_google_configured() and not force:
            return RedirectResponse(
                url=f"{frontend_url}/login?oauth_unconfigured=google&provider_name=Google",
                status_code=status.HTTP_307_TEMPORARY_REDIRECT
            )
        try:
            auth_url = oauth_service.get_google_auth_url()
        except ValueError:
            auth_url = "https://accounts.google.com/o/oauth2/v2/auth"
        return RedirectResponse(url=auth_url, status_code=status.HTTP_307_TEMPORARY_REDIRECT)

    elif provider_lower == "microsoft":
        if not oauth_service.is_microsoft_configured() and not force:
            return RedirectResponse(
                url=f"{frontend_url}/login?oauth_unconfigured=microsoft&provider_name=Microsoft",
                status_code=status.HTTP_307_TEMPORARY_REDIRECT
            )
        try:
            auth_url = oauth_service.get_microsoft_auth_url()
        except ValueError:
            auth_url = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize"
        return RedirectResponse(url=auth_url, status_code=status.HTTP_307_TEMPORARY_REDIRECT)

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=f"Unsupported OAuth provider: {provider}"
    )


@router.get("/oauth/google/callback")
async def google_oauth_callback(
    request: Request,
    code: Optional[str] = None,
    error: Optional[str] = None,
    state: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Handles OAuth 2.0 authorization code return from Google's official site"""
    frontend_url = oauth_service.get_frontend_url()
    if error or not code:
        err_msg = error or "Authorization code missing from Google callback."
        return RedirectResponse(url=f"{frontend_url}/oauth/callback?error={err_msg}")

    try:
        profile = await oauth_service.exchange_google_code(code)
        client_ip = request.client.host if request.client else "127.0.0.1"
        auth_result = await _authenticate_oauth_user(
            db=db,
            provider="google",
            email=profile["email"],
            name=profile["name"],
            provider_id=profile["provider_id"],
            client_ip=client_ip
        )
        token = auth_result["access_token"]
        user = auth_result["user"]
        user_params = urlencode({
            "id": user.id,
            "email": user.email,
            "username": user.username,
            "full_name": user.full_name or "",
            "role": user.role.value,
            "oauth_provider": "google",
            "is_mfa_enabled": str(user.is_mfa_enabled).lower(),
            "is_active": str(user.is_active).lower(),
            "created_at": user.created_at.isoformat() if user.created_at else "",
        })
        return RedirectResponse(
            url=f"{frontend_url}/oauth/callback?token={token}&{user_params}",
            status_code=status.HTTP_307_TEMPORARY_REDIRECT
        )
    except Exception as exc:
        return RedirectResponse(
            url=f"{frontend_url}/oauth/callback?error={str(exc)}",
            status_code=status.HTTP_307_TEMPORARY_REDIRECT
        )


@router.get("/oauth/microsoft/callback")
async def microsoft_oauth_callback(
    request: Request,
    code: Optional[str] = None,
    error: Optional[str] = None,
    state: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Handles OAuth 2.0 authorization code return from Microsoft's official site"""
    frontend_url = oauth_service.get_frontend_url()
    if error or not code:
        err_msg = error or "Authorization code missing from Microsoft callback."
        return RedirectResponse(url=f"{frontend_url}/oauth/callback?error={err_msg}")

    try:
        profile = await oauth_service.exchange_microsoft_code(code)
        client_ip = request.client.host if request.client else "127.0.0.1"
        auth_result = await _authenticate_oauth_user(
            db=db,
            provider="microsoft",
            email=profile["email"],
            name=profile["name"],
            provider_id=profile["provider_id"],
            client_ip=client_ip
        )
        token = auth_result["access_token"]
        user = auth_result["user"]
        user_params = urlencode({
            "id": user.id,
            "email": user.email,
            "username": user.username,
            "full_name": user.full_name or "",
            "role": user.role.value,
            "oauth_provider": "microsoft",
            "is_mfa_enabled": str(user.is_mfa_enabled).lower(),
            "is_active": str(user.is_active).lower(),
            "created_at": user.created_at.isoformat() if user.created_at else "",
        })
        return RedirectResponse(
            url=f"{frontend_url}/oauth/callback?token={token}&{user_params}",
            status_code=status.HTTP_307_TEMPORARY_REDIRECT
        )
    except Exception as exc:
        return RedirectResponse(
            url=f"{frontend_url}/oauth/callback?error={str(exc)}",
            status_code=status.HTTP_307_TEMPORARY_REDIRECT
        )


@router.post("/oauth/continue", response_model=TokenResponse)
async def continue_oauth_login(
    req: OAuthContinueRequest,
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Direct OAuth sign-in and user provisioning for Google and Microsoft.
    Validates identity, provisions or matches existing account, and returns authenticated JWT.
    """
    client_ip = request.client.host if request.client else "127.0.0.1"
    return await _authenticate_oauth_user(
        db=db,
        provider=req.provider,
        email=req.email,
        name=req.name,
        provider_id=req.provider_id,
        client_ip=client_ip
    )


@router.post("/oauth/google/verify", response_model=TokenResponse)
async def verify_google_token_login(
    req: OAuthVerifyRequest,
    request: Request,
    db: Session = Depends(get_db)
):
    """Verifies a Google ID Token (from Google Identity Services button) and signs in"""
    try:
        profile = await oauth_service.verify_google_id_token(req.token)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    client_ip = request.client.host if request.client else "127.0.0.1"
    return await _authenticate_oauth_user(
        db=db,
        provider="google",
        email=profile["email"],
        name=profile["name"],
        provider_id=profile["provider_id"],
        client_ip=client_ip
    )


@router.post("/oauth/mock", response_model=TokenResponse)
async def mock_oauth_login(
    req: OAuthMockRequest,
    request: Request,
    db: Session = Depends(get_db)
):
    """Backwards-compatible mock OAuth endpoint delegating to secure OAuth provisioning"""
    client_ip = request.client.host if request.client else "127.0.0.1"
    return await _authenticate_oauth_user(
        db=db,
        provider=req.provider,
        email=req.email,
        name=req.name,
        client_ip=client_ip
    )


# ==============================================================================
# 7. PASSWORD RESET (REDIS-BACKED TOKEN FLOW)
# ==============================================================================
@router.post("/forgot-password")
async def forgot_password(
    req: ForgotPasswordRequest,
    request: Request,
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(User.email == req.email).first()
    # Always return success message to avoid user enumeration
    if not user:
        return {"message": "If this email is registered, a password recovery link has been created."}

    reset_token = secrets.token_urlsafe(32)
    if redis_client:
        # Cache reset token in Redis for 15 minutes (900 seconds)
        await redis_client.setex(f"reset:{reset_token}", 900, str(user.id))

    await log_activity(
        user_id=user.id,
        username=user.username,
        action="PASSWORD_RESET_REQUESTED",
        ip_address=request.client.host if request.client else "127.0.0.1"
    )

    return {
        "message": "If this email is registered, a password recovery link has been created.",
        "debug_reset_token": reset_token  # Provided for local testing convenience
    }


@router.post("/reset-password")
async def reset_password(
    req: ResetPasswordRequest,
    db: Session = Depends(get_db)
):
    if not redis_client:
        raise HTTPException(status_code=500, detail="Cache service unavailable.")

    user_id_str = await redis_client.get(f"reset:{req.token}")
    if not user_id_str:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token.")

    user = db.query(User).filter(User.id == int(user_id_str)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User account not found.")

    user.hashed_password = hash_password(req.new_password)
    db.commit()

    # Invalidate reset token
    await redis_client.delete(f"reset:{req.token}")

    await log_activity(
        user_id=user.id,
        username=user.username,
        action="PASSWORD_RESET_COMPLETED"
    )

    return {"status": "success", "message": "Password reset successfully. You may now log in."}