import secrets
import uuid
from datetime import timedelta
from urllib.parse import quote

import jwt
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import bearer, get_current_user
from app.core.redis_client import get_redis
from app.core.request import RequestInfo, get_request_info
from app.core.security import (DUMMY_HASH, create_token, decode_token, generate_secure_token, hash_password,
                               hash_token, validate_password_strength, verify_password)
from app.models import PasswordResetToken, Role, User, aware, utcnow
from app.serializers import user_dict
from app.services import audit_service as audit
from app.services import email_service, key_service, mfa_service, oauth_service, session_service, threat_service
from app.services.ratelimit import rate_limit

router = APIRouter(prefix="/auth", tags=["auth"])


# ---------------------------------------------------------------- schemas
class RegisterIn(BaseModel):
    email: EmailStr
    password: str
    full_name: str = Field(min_length=1, max_length=120)


class LoginIn(BaseModel):
    email: str
    password: str


class MfaVerifyIn(BaseModel):
    mfa_token: str
    code: str


class RefreshIn(BaseModel):
    refresh_token: str


class ForgotIn(BaseModel):
    email: str


class ResetIn(BaseModel):
    token: str
    new_password: str


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str


class CodeIn(BaseModel):
    code: str


class MfaDisableIn(BaseModel):
    code: str
    password: str | None = None


class ProfileIn(BaseModel):
    full_name: str = Field(min_length=1, max_length=120)


class OAuthExchangeIn(BaseModel):
    code: str


# ---------------------------------------------------------------- helpers
def _issue_tokens(user: User, info: RequestInfo) -> dict:
    jti = uuid.uuid4().hex
    sid = session_service.create_session(user.id, info.ip, info.user_agent, jti)
    refresh, _ = create_token(str(user.id), "refresh", timedelta(days=settings.refresh_token_days), sid=sid, jti=jti)
    access, _ = create_token(str(user.id), "access", timedelta(minutes=settings.access_token_minutes), sid=sid)
    return {"access_token": access, "refresh_token": refresh, "token_type": "bearer",
            "expires_in": settings.access_token_minutes * 60}


def _complete_login(db: Session, user: User, info: RequestInfo) -> dict:
    threat_service.clear_failures(user.email)
    user.last_login_at = utcnow()
    db.commit()
    tokens = _issue_tokens(user, info)
    audit.log_login(user.email, user.id, True, "ok", info, user.full_name)
    audit.log_audit("auth.login", user, "user", user.id, info)
    threat_service.check_new_device(user, info)
    if user.role == Role.ADMIN:
        audit.log_security_event(audit.EVT_OTHER, "info", "Admin login", info, user,
                                 "Admin dashboard accessed", notify_admins=False)
    return {**tokens, "user": user_dict(user)}


def _login_response(db: Session, user: User, info: RequestInfo) -> dict:
    """Either finish the login or ask for the second factor."""
    if user.mfa_enabled:
        token, _ = create_token(str(user.id), "mfa", timedelta(minutes=5))
        return {"mfa_required": True, "mfa_token": token}
    return _complete_login(db, user, info)


def _check_password_or_400(pw: str) -> None:
    err = validate_password_strength(pw)
    if err:
        raise HTTPException(400, err)


# ---------------------------------------------------------------- register / login
@router.post("/register", status_code=201)
def register(body: RegisterIn, db: Session = Depends(get_db), info: RequestInfo = Depends(get_request_info)):
    rate_limit(f"register:{info.ip}", 10, 3600, info)
    _check_password_or_400(body.password)
    email = body.email.lower()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(409, "An account with this email already exists.")
    user = User(email=email, full_name=body.full_name.strip(), hashed_password=hash_password(body.password), role=Role.USER)
    db.add(user)
    db.commit()
    audit.log_audit("auth.register", user, "user", user.id, info)
    return {"user": user_dict(user)}


@router.post("/login")
def login(body: LoginIn, db: Session = Depends(get_db), info: RequestInfo = Depends(get_request_info)):
    email = body.email.lower()
    rate_limit(f"login:{info.ip}", 30, 60, info)

    if threat_service.is_locked(email, info.ip):
        audit.log_login(email, None, False, "locked_out", info)
        audit.log_access_attempt("blocked", "account temporarily locked after repeated failures", info)
        raise HTTPException(429, f"Too many failed attempts. Try again in {settings.login_lock_minutes} minutes.")

    user = db.scalar(select(User).where(User.email == email))
    stored_hash = user.hashed_password if user and user.hashed_password else DUMMY_HASH
    password_ok = verify_password(body.password, stored_hash) and user is not None and user.hashed_password is not None
    if not password_ok:
        threat_service.register_failed_login(email, info.ip, info, user)
        audit.log_login(email, user.id if user else None, False, "invalid_credentials", info)
        raise HTTPException(401, "Incorrect email or password.")
    if not user.is_active:
        audit.log_login(email, user.id, False, "account_disabled", info)
        raise HTTPException(403, "This account has been disabled. Contact your administrator.")
    return _login_response(db, user, info)


@router.post("/mfa/verify")
def mfa_verify(body: MfaVerifyIn, db: Session = Depends(get_db), info: RequestInfo = Depends(get_request_info)):
    rate_limit(f"mfa:{info.ip}", 20, 60, info)
    try:
        payload = decode_token(body.mfa_token, "mfa")
        user = db.get(User, uuid.UUID(payload["sub"]))
    except (jwt.PyJWTError, ValueError, KeyError):
        raise HTTPException(401, "Verification expired. Sign in again.") from None
    if not user or not user.is_active or not user.mfa_secret_enc:
        raise HTTPException(401, "Verification expired. Sign in again.")
    if threat_service.is_locked(user.email, info.ip):
        raise HTTPException(429, "Too many failed attempts. Try again later.")
    secret = key_service.reveal_secret(user.mfa_secret_enc)
    if not mfa_service.verify_code(secret, body.code, user.id):
        threat_service.register_failed_login(user.email, info.ip, info, user)
        audit.log_login(user.email, user.id, False, "invalid_mfa_code", info, user.full_name)
        raise HTTPException(401, "That code isn't valid. Check your authenticator app and try again.")
    return _complete_login(db, user, info)


@router.post("/refresh")
def refresh(body: RefreshIn, db: Session = Depends(get_db), info: RequestInfo = Depends(get_request_info)):
    try:
        payload = decode_token(body.refresh_token, "refresh")
        sid = payload["sid"]
        user = db.get(User, uuid.UUID(payload["sub"]))
    except (jwt.PyJWTError, KeyError, ValueError):
        raise HTTPException(401, "Session expired. Please sign in again.") from None
    session = session_service.get_session(sid)
    if not session:
        raise HTTPException(401, "Session ended. Please sign in again.")
    if session.get("refresh_jti") != payload["jti"]:
        # A refresh token was used twice: treat as theft and kill the session.
        session_service.delete_session(sid)
        audit.log_security_event(audit.EVT_OTHER, "high", "Refresh token reuse detected", info, user,
                                 "A rotated refresh token was replayed; the session was revoked")
        raise HTTPException(401, "Session ended. Please sign in again.")
    if not user or not user.is_active:
        raise HTTPException(401, "Account unavailable")
    new_jti = uuid.uuid4().hex
    new_refresh, _ = create_token(str(user.id), "refresh", timedelta(days=settings.refresh_token_days), sid=sid, jti=new_jti)
    access, _ = create_token(str(user.id), "access", timedelta(minutes=settings.access_token_minutes), sid=sid)
    session_service.set_refresh_jti(sid, new_jti)
    return {"access_token": access, "refresh_token": new_refresh, "token_type": "bearer",
            "expires_in": settings.access_token_minutes * 60}


@router.post("/logout")
def logout(creds=Depends(bearer), user: User = Depends(get_current_user), info: RequestInfo = Depends(get_request_info)):
    payload = decode_token(creds.credentials, "access")
    session_service.delete_session(payload["sid"], user.id)
    audit.log_audit("auth.logout", user, "user", user.id, info)
    return {"ok": True}


@router.get("/me")
def me(user: User = Depends(get_current_user)):
    return user_dict(user)


@router.patch("/me")
def update_profile(body: ProfileIn, user: User = Depends(get_current_user), db: Session = Depends(get_db),
                   info: RequestInfo = Depends(get_request_info)):
    user.full_name = body.full_name.strip()
    db.commit()
    audit.log_audit("user.update_profile", user, "user", user.id, info)
    return user_dict(user)


# ---------------------------------------------------------------- password recovery
@router.post("/forgot-password")
def forgot_password(body: ForgotIn, db: Session = Depends(get_db), info: RequestInfo = Depends(get_request_info)):
    email = body.email.lower()
    rate_limit(f"forgot:ip:{info.ip}", 10, 3600, info)
    rate_limit(f"forgot:email:{email}", 3, 3600, info)
    user = db.scalar(select(User).where(User.email == email, User.is_active.is_(True)))
    if user:
        raw = generate_secure_token()
        db.add(PasswordResetToken(user_id=user.id, token_hash=hash_token(raw),
                                  expires_at=utcnow() + timedelta(minutes=30)))
        db.commit()
        link = f"{settings.frontend_url}/reset-password?token={raw}"
        email_service.send_email(user.email, "[TrustShare] Reset your password",
                                 f"Use this link to choose a new password. It expires in 30 minutes.\n\n{link}\n\n"
                                 "If you didn't ask for this, you can ignore this email.")
        audit.log_audit("auth.password_reset_requested", user, "user", user.id, info)
    # Same response whether or not the account exists (prevents account enumeration).
    return {"message": "If an account exists for that email, a reset link is on its way."}


@router.post("/reset-password")
def reset_password(body: ResetIn, db: Session = Depends(get_db), info: RequestInfo = Depends(get_request_info)):
    rate_limit(f"reset:{info.ip}", 10, 3600, info)
    _check_password_or_400(body.new_password)
    tok = db.scalar(select(PasswordResetToken).where(PasswordResetToken.token_hash == hash_token(body.token)))
    if not tok or tok.used_at is not None or aware(tok.expires_at) <= utcnow():
        raise HTTPException(400, "This reset link is invalid or has expired. Request a new one.")
    user = db.get(User, tok.user_id)
    user.hashed_password = hash_password(body.new_password)
    tok.used_at = utcnow()
    db.commit()
    session_service.delete_all_sessions(user.id)
    threat_service.clear_failures(user.email)
    audit.log_audit("auth.password_reset", user, "user", user.id, info)
    return {"message": "Password updated. You can sign in now."}


@router.post("/change-password")
def change_password(body: ChangePasswordIn, user: User = Depends(get_current_user), db: Session = Depends(get_db),
                    info: RequestInfo = Depends(get_request_info)):
    if not user.hashed_password or not verify_password(body.current_password, user.hashed_password):
        raise HTTPException(400, "Your current password is incorrect.")
    _check_password_or_400(body.new_password)
    user.hashed_password = hash_password(body.new_password)
    db.commit()
    session_service.delete_all_sessions(user.id)
    audit.log_audit("auth.password_changed", user, "user", user.id, info)
    return {"message": "Password changed. Please sign in again."}


# ---------------------------------------------------------------- MFA (TOTP)
@router.post("/mfa/setup")
def mfa_setup(user: User = Depends(get_current_user)):
    if user.mfa_enabled:
        raise HTTPException(400, "Two-factor authentication is already on.")
    secret = mfa_service.new_secret()
    get_redis().setex(f"mfa_setup:{user.id}", 600, secret)
    return {"secret": secret, "otpauth_uri": mfa_service.provisioning_uri(secret, user.email)}


@router.post("/mfa/enable")
def mfa_enable(body: CodeIn, user: User = Depends(get_current_user), db: Session = Depends(get_db),
               info: RequestInfo = Depends(get_request_info)):
    secret = get_redis().get(f"mfa_setup:{user.id}")
    if not secret:
        raise HTTPException(400, "Setup expired. Start again.")
    if not mfa_service.verify_code(secret, body.code, user.id):
        raise HTTPException(400, "That code isn't valid. Check your authenticator app and try again.")
    user.mfa_secret_enc = key_service.protect_secret(secret)
    user.mfa_enabled = True
    db.commit()
    get_redis().delete(f"mfa_setup:{user.id}")
    audit.log_audit("auth.mfa_enabled", user, "user", user.id, info)
    return user_dict(user)


@router.post("/mfa/disable")
def mfa_disable(body: MfaDisableIn, user: User = Depends(get_current_user), db: Session = Depends(get_db),
                info: RequestInfo = Depends(get_request_info)):
    if not user.mfa_enabled or not user.mfa_secret_enc:
        raise HTTPException(400, "Two-factor authentication is not on.")
    if user.hashed_password and not (body.password and verify_password(body.password, user.hashed_password)):
        raise HTTPException(400, "Your password is incorrect.")
    if not mfa_service.verify_code(key_service.reveal_secret(user.mfa_secret_enc), body.code, user.id):
        raise HTTPException(400, "That code isn't valid.")
    user.mfa_enabled, user.mfa_secret_enc = False, None
    db.commit()
    audit.log_audit("auth.mfa_disabled", user, "user", user.id, info)
    return user_dict(user)


# ---------------------------------------------------------------- sessions
@router.get("/sessions")
def sessions(creds=Depends(bearer), user: User = Depends(get_current_user)):
    current = decode_token(creds.credentials, "access")["sid"]
    return [{**s, "current": s["id"] == current} for s in session_service.list_sessions(user.id)]


@router.delete("/sessions/{sid}")
def revoke_session(sid: str, user: User = Depends(get_current_user), info: RequestInfo = Depends(get_request_info)):
    s = session_service.get_session(sid)
    if not s or s.get("user_id") != str(user.id):
        raise HTTPException(404, "Session not found")
    session_service.delete_session(sid, user.id)
    audit.log_audit("auth.session_revoked", user, "session", sid, info)
    return {"ok": True}


# ---------------------------------------------------------------- OAuth2
@router.get("/oauth/providers")
def oauth_providers():
    return oauth_service.enabled_providers()


@router.get("/oauth/{provider}/login")
def oauth_login(provider: str):
    if provider not in [p["id"] for p in oauth_service.enabled_providers()]:
        raise HTTPException(404, "This sign-in method isn't configured.")
    state = secrets.token_urlsafe(24)
    get_redis().setex(f"oauth_state:{state}", 600, provider)
    return RedirectResponse(oauth_service.authorize_url(provider, state))


@router.get("/oauth/{provider}/callback")
def oauth_callback(provider: str, code: str | None = None, state: str | None = None, error: str | None = None,
                   db: Session = Depends(get_db), info: RequestInfo = Depends(get_request_info)):
    def fail(msg: str):
        return RedirectResponse(f"{settings.frontend_url}/login?error={quote(msg)}")

    r = get_redis()
    if error or not code or not state:
        return fail("Sign-in was cancelled.")
    stored_provider = r.get(f"oauth_state:{state}")
    r.delete(f"oauth_state:{state}")
    if stored_provider != provider:
        audit.log_access_attempt("blocked", "invalid OAuth state", info)
        return fail("Sign-in could not be verified. Please try again.")
    try:
        profile = oauth_service.fetch_profile(provider, code)
    except Exception:  # noqa: BLE001
        return fail("Could not complete sign-in with that provider.")
    if not profile["email"]:
        return fail("The provider did not share an email address.")

    user = db.scalar(select(User).where(User.email == profile["email"]))
    if user is None:
        user = User(email=profile["email"], full_name=profile["name"], role=Role.USER,
                    oauth_provider=provider, oauth_subject=profile["sub"])
        db.add(user)
        db.commit()
        audit.log_audit("auth.register_oauth", user, "user", user.id, info, {"provider": provider})
    elif user.oauth_provider == provider and user.oauth_subject == profile["sub"]:
        pass
    elif provider == "google" and profile["email_verified"]:
        user.oauth_provider, user.oauth_subject = provider, profile["sub"]
        db.commit()
    else:
        return fail("An account with this email already exists. Sign in with your password.")
    if not user.is_active:
        audit.log_login(user.email, user.id, False, "account_disabled", info)
        return fail("This account has been disabled.")

    one_time = secrets.token_urlsafe(24)
    r.setex(f"oauth_code:{one_time}", 120, str(user.id))
    return RedirectResponse(f"{settings.frontend_url}/oauth/callback?code={one_time}")


@router.post("/oauth/exchange")
def oauth_exchange(body: OAuthExchangeIn, db: Session = Depends(get_db), info: RequestInfo = Depends(get_request_info)):
    r = get_redis()
    user_id = r.get(f"oauth_code:{body.code}")
    r.delete(f"oauth_code:{body.code}")
    if not user_id:
        raise HTTPException(400, "This sign-in link has expired. Please try again.")
    user = db.get(User, uuid.UUID(user_id))
    if not user or not user.is_active:
        raise HTTPException(401, "Account unavailable")
    return _login_response(db, user, info)
