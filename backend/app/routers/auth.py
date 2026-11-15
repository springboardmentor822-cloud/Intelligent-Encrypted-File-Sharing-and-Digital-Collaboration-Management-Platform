"""Registration, login (JSON + OAuth2 password flow + Google), JWT refresh/logout, MFA (TOTP), password reset."""
import json
import secrets
import time
from urllib.parse import urlencode

import httpx
import jwt
from fastapi import APIRouter, Depends, Form, HTTPException, Request
from fastapi.responses import RedirectResponse
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.deps import is_admin, client_ip, get_current_user, get_token_payload, rate_limit, role_names
from app.core.security import (
    DUMMY_HASH, create_access_token, create_refresh_token, decode_token, generate_url_token,
    hash_password, hash_token, new_totp_secret, totp_uri, verify_password, verify_totp,
)
from app.db.postgres import get_db
from app.db.redis import redis_client
from app.models.postgres import Role, User
from app.schemas.auth import (
    AdminAreaAttemptIn, ChangePasswordIn, ForgotPasswordIn, LoginIn, OAuthExchangeIn, LogoutIn, MfaDisableIn, MfaSetupOut, OtpIn, RefreshIn,
    RegisterIn, ResetPasswordIn, TokenOut, UserOut, user_to_out,
)
from app.services.access_policy import require_approval
from app.services.audit import log_event
from app.services.notifications import notify_admins
from app.services.notifications import send_email

router = APIRouter(prefix="/auth", tags=["Authentication"])

MAX_LOGIN_FAILS = 5
LOCK_SECONDS = 900


async def _issue_tokens(user: User) -> TokenOut:
    access, _ = create_access_token(user.id, role_names(user))
    refresh, refresh_jti = create_refresh_token(user.id)
    # Sessions live in Redis: a refresh token only works while its jti exists here
    await redis_client.set(f"refresh:{refresh_jti}", user.id, ex=settings.REFRESH_TOKEN_DAYS * 86400)
    return TokenOut(access_token=access, refresh_token=refresh, user=user_to_out(user))


@router.post("/register", response_model=UserOut, status_code=201,
             dependencies=[Depends(rate_limit("register", 10, 3600))])
async def register(body: RegisterIn, request: Request, db: AsyncSession = Depends(get_db)):
    email = body.email.lower()
    if (await db.execute(select(User).where(User.email == email))).scalar_one_or_none():
        raise HTTPException(409, "An account with this email already exists")
    role_name = "admin" if settings.ADMIN_EMAIL and email == settings.ADMIN_EMAIL.lower() else "user"
    role = (await db.execute(select(Role).where(Role.name == role_name))).scalar_one()
    # Access control: when the admin turned on "approve new accounts", a new account waits as "pending" until approved.
    pending = role_name != "admin" and await require_approval()
    user = User(email=email, full_name=body.full_name.strip(), hashed_password=hash_password(body.password), roles=[role],
                approval_status="pending" if pending else "approved")
    db.add(user)
    await db.commit()
    await log_event("register", request, user=user, resource_type="user", resource_id=user.id, details={"pending_approval": pending})
    if pending:
        await notify_admins("New account waiting for approval", f"{user.full_name} ({email}) asked for access. Approve or reject it in Access Control.", ntype="access_request")
    return user_to_out(user)


@router.post("/login", response_model=TokenOut, dependencies=[Depends(rate_limit("login", 30, 60))])
async def login(body: LoginIn, request: Request, db: AsyncSession = Depends(get_db)):
    email = body.email.lower()
    lock_key = f"loginfail:{email}"
    if int(await redis_client.get(lock_key) or 0) >= MAX_LOGIN_FAILS:
        await log_event("login", request, user_email=email, result="failure", details={"reason": "account_locked"})
        raise HTTPException(429, "Too many failed attempts. Try again in 15 minutes.")

    user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
    password_ok = verify_password(body.password, user.hashed_password if user else DUMMY_HASH)

    async def fail(reason: str):
        count = await redis_client.incr(lock_key)
        if count == 1:
            await redis_client.expire(lock_key, LOCK_SECONDS)
        await log_event("login", request, user_email=email, user_id=user.id if user else None,
                        result="failure", details={"reason": reason, "account_exists": user is not None})
        raise HTTPException(401, "Invalid email or password")

    if not user or not password_ok:
        await fail("bad_credentials")
    if not user.is_active:
        await log_event("login", request, user=user, result="failure", details={"reason": "account_disabled", "account_exists": True})
        raise HTTPException(403, "This account has been disabled")
    if user.approval_status != "approved":      # access control: not let in (yet)
        await log_event("login", request, user=user, result="failure", details={"reason": f"approval_{user.approval_status}", "account_exists": True})
        raise HTTPException(403, "Your account is waiting for administrator approval." if user.approval_status == "pending"
                            else "Your access request was declined by the administrator.")

    if user.mfa_enabled:
        if not body.otp:
            raise HTTPException(401, "otp_required")  # frontend then asks for the 6-digit code
        if not verify_totp(user.mfa_secret, body.otp):
            await fail("bad_otp")

    await redis_client.delete(lock_key)
    tokens = await _issue_tokens(user)
    await log_event("login", request, user=user, details={"mfa": user.mfa_enabled})
    return tokens


@router.post("/refresh", response_model=TokenOut)
async def refresh(body: RefreshIn, request: Request, db: AsyncSession = Depends(get_db)):
    try:
        payload = decode_token(body.refresh_token, "refresh")
    except jwt.PyJWTError:
        raise HTTPException(401, "Invalid or expired refresh token")
    # Rotation: each refresh token works only once
    if not await redis_client.getdel(f"refresh:{payload['jti']}"):
        await log_event("token_refresh", request, user_id=payload["sub"], result="failure",
                        severity="critical", details={"reason": "reused_or_revoked_refresh_token"})
        raise HTTPException(401, "Refresh token already used or revoked")
    user = await db.get(User, payload["sub"])
    if not user or not user.is_active or user.approval_status != "approved":
        raise HTTPException(401, "User not found or disabled")
    return await _issue_tokens(user)


@router.post("/logout")
async def logout(body: LogoutIn, request: Request, payload: dict = Depends(get_token_payload),
                 user: User = Depends(get_current_user)):
    ttl = max(int(payload["exp"] - time.time()), 1)
    await redis_client.set(f"blacklist:{payload['jti']}", "1", ex=ttl)  # access token blacklisted
    if body.refresh_token:
        try:
            r = decode_token(body.refresh_token, "refresh")
            await redis_client.delete(f"refresh:{r['jti']}")
        except jwt.PyJWTError:
            pass
    await log_event("logout", request, user=user)
    return {"message": "Logged out"}


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(get_current_user)):
    return user_to_out(user)


# ---------------- MFA ----------------
@router.post("/mfa/setup", response_model=MfaSetupOut)
async def mfa_setup(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if user.mfa_enabled:
        raise HTTPException(409, "MFA is already enabled")
    user.mfa_secret = new_totp_secret()
    await db.commit()
    return MfaSetupOut(secret=user.mfa_secret, otpauth_uri=totp_uri(user.mfa_secret, user.email))


@router.post("/mfa/enable")
async def mfa_enable(body: OtpIn, request: Request, user: User = Depends(get_current_user),
                     db: AsyncSession = Depends(get_db)):
    if not user.mfa_secret:
        raise HTTPException(400, "Call /auth/mfa/setup first")
    if not verify_totp(user.mfa_secret, body.otp):
        await log_event("mfa_enable", request, user=user, result="failure")
        raise HTTPException(400, "Invalid code")
    user.mfa_enabled = True
    await db.commit()
    await log_event("mfa_enable", request, user=user)
    return {"message": "MFA enabled"}


@router.post("/mfa/disable")
async def mfa_disable(body: MfaDisableIn, request: Request, user: User = Depends(get_current_user),
                      db: AsyncSession = Depends(get_db)):
    if not user.mfa_enabled:
        raise HTTPException(400, "MFA is not enabled")
    if not verify_password(body.password, user.hashed_password) or not verify_totp(user.mfa_secret, body.otp):
        await log_event("mfa_disable", request, user=user, result="failure", severity="warning")
        raise HTTPException(400, "Wrong password or code")
    user.mfa_enabled, user.mfa_secret = False, None
    await db.commit()
    await log_event("mfa_disable", request, user=user)
    return {"message": "MFA disabled"}


# ---------------- Password recovery ----------------
@router.post("/forgot-password", dependencies=[Depends(rate_limit("forgot", 5, 3600))])
async def forgot_password(body: ForgotPasswordIn, request: Request, db: AsyncSession = Depends(get_db)):
    user = (await db.execute(select(User).where(User.email == body.email.lower()))).scalar_one_or_none()
    if user:
        token = generate_url_token()
        await redis_client.set(f"reset:{hash_token(token)}", user.id, ex=900)
        link = f"{settings.FRONTEND_URL}/reset-password?token={token}"
        await send_email(user.email, "Reset your TrustShare password",
                         f"Click this link within 15 minutes to reset your password:\n{link}")
        await log_event("password_reset_request", request, user=user)
    # Same answer either way, so attackers cannot discover which emails are registered
    return {"message": "If that email exists, a reset link has been sent."}


@router.post("/reset-password", dependencies=[Depends(rate_limit("reset", 10, 3600))])
async def reset_password(body: ResetPasswordIn, request: Request, db: AsyncSession = Depends(get_db)):
    user_id = await redis_client.getdel(f"reset:{hash_token(body.token)}")
    if not user_id:
        raise HTTPException(400, "Reset link is invalid or has expired")
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(400, "Reset link is invalid or has expired")
    user.hashed_password = hash_password(body.new_password)
    await db.commit()
    await redis_client.delete(f"loginfail:{user.email}")
    await log_event("password_reset", request, user=user)
    return {"message": "Password updated. You can log in now."}


# ---------------- Change password (Settings page) ----------------
@router.post("/change-password")
async def change_password(body: ChangePasswordIn, request: Request, user: User = Depends(get_current_user),
                          db: AsyncSession = Depends(get_db)):
    if not verify_password(body.current_password, user.hashed_password):
        await log_event("password_change", request, user=user, result="failure", details={"reason": "wrong_current_password"})
        raise HTTPException(400, "Current password is wrong")
    user.hashed_password = hash_password(body.new_password)
    await db.commit()
    await log_event("password_change", request, user=user)
    return {"message": "Password changed"}


# ---------------- OAuth2 ----------------
# 1) OAuth2 "password flow": POST /auth/token with form fields username (= your email) + password.
#    This is the standard OAuth2 shape, so the green "Authorize" button in Swagger (/docs) works.
#    (If MFA is on, add the extra form field "otp". Swagger's button has no otp box, so use /auth/login there.)
@router.post("/token", response_model=TokenOut)
async def oauth2_token(request: Request, username: str = Form(...), password: str = Form(...),
                       otp: str | None = Form(None), db: AsyncSession = Depends(get_db)):
    try:
        body = LoginIn(email=username, password=password, otp=otp)
    except ValidationError:
        raise HTTPException(422, "username must be a valid email address")
    await rate_limit("login", 30, 60)(request)  # same limit as /auth/login; checked after the cheap validation above
    return await login(body, request, db)


# 2) OAuth2 "authorization code flow" with Google (optional: needs GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).
GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"


def _google_configured() -> bool:
    return bool(settings.GOOGLE_CLIENT_ID and settings.GOOGLE_CLIENT_SECRET)


def _google_redirect_uri() -> str:
    return f"{settings.OAUTH_REDIRECT_BASE.rstrip('/')}/auth/oauth/google/callback"


@router.get("/oauth/providers")
async def oauth_providers():
    """The login page calls this to decide whether to show the "Continue with Google" button."""
    return {"google": _google_configured()}


@router.get("/oauth/google/login")
async def google_login():
    if not _google_configured():
        raise HTTPException(404, "Google sign-in is not configured on this server")
    state = secrets.token_urlsafe(24)  # random value that protects against forged callbacks (CSRF)
    await redis_client.set(f"oauth_state:{state}", "1", ex=600)
    query = urlencode({"client_id": settings.GOOGLE_CLIENT_ID, "redirect_uri": _google_redirect_uri(),
                       "response_type": "code", "scope": "openid email profile", "state": state, "prompt": "select_account"})
    return RedirectResponse(f"{GOOGLE_AUTH_URL}?{query}")


@router.get("/oauth/google/callback")
async def google_callback(request: Request, code: str | None = None, state: str | None = None,
                          error: str | None = None, db: AsyncSession = Depends(get_db)):
    def back(**params):  # send the browser back to the React app
        return RedirectResponse(f"{settings.FRONTEND_URL}/oauth/callback?{urlencode(params)}")

    if error or not code or not state:
        return back(error="Google sign-in was cancelled")
    if not await redis_client.getdel(f"oauth_state:{state}"):
        await log_event("login", request, result="failure", details={"reason": "oauth_bad_state", "provider": "google"})
        return back(error="Sign-in session expired. Please try again.")
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            token = (await client.post(GOOGLE_TOKEN_URL, data={
                "code": code, "client_id": settings.GOOGLE_CLIENT_ID, "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "redirect_uri": _google_redirect_uri(), "grant_type": "authorization_code"})).json()
            info = (await client.get(GOOGLE_USERINFO_URL, headers={"Authorization": f"Bearer {token['access_token']}"})).json()
    except Exception:
        return back(error="Could not reach Google. Please try again.")
    email = (info.get("email") or "").lower()
    if not email or not info.get("email_verified"):
        return back(error="Your Google email is not verified")

    user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if user is None:  # first Google sign-in creates the account (random unusable password)
        role_name = "admin" if settings.ADMIN_EMAIL and email == settings.ADMIN_EMAIL.lower() else "user"
        role = (await db.execute(select(Role).where(Role.name == role_name))).scalar_one()
        user = User(email=email, full_name=(info.get("name") or email.split("@")[0])[:120],
                    hashed_password=hash_password(secrets.token_urlsafe(24)), roles=[role])
        db.add(user)
        await db.commit()
        await log_event("register", request, user=user, details={"provider": "google"})
    if not user.is_active:
        return back(error="This account has been disabled")
    if user.mfa_enabled:  # simplified: accounts with MFA must use the password + code form
        await log_event("login", request, user=user, result="failure", details={"reason": "oauth_mfa_required", "provider": "google"})
        return back(error="This account uses two-factor login. Please sign in with email, password and code.")

    tokens = await _issue_tokens(user)
    await log_event("login", request, user=user, details={"provider": "google", "mfa": False})
    # The browser gets a one-time code (valid 60 s), NOT the tokens, so tokens never appear in the address bar.
    one_time = secrets.token_urlsafe(24)
    await redis_client.set(f"oauth_code:{one_time}", tokens.model_dump_json(), ex=60)
    return back(code=one_time)


@router.post("/oauth/exchange", response_model=TokenOut)
async def oauth_exchange(body: OAuthExchangeIn):
    raw = await redis_client.getdel(f"oauth_code:{body.code}")
    if not raw:
        raise HTTPException(400, "Sign-in code is invalid or expired")
    return TokenOut(**json.loads(raw))


# ---------------- Admin-area attempts made through the browser ----------------
# The React app hides admin pages from normal users and sends them back to their dashboard. That happens inside the
# browser, so the SERVER would never hear about it. This endpoint lets the browser report the attempt, so the
# "non-admin tried an admin area" trigger works for typed URLs too. (Calling an admin API directly is caught by RBAC itself.)
@router.post("/admin-area-attempt")
async def admin_area_attempt(body: AdminAreaAttemptIn, request: Request, user: User = Depends(get_current_user)):
    if is_admin(user):
        return {"admin": True}
    path = "".join(ch for ch in body.path if ch.isprintable())[:100]
    if not path.startswith("/admin"):
        path = "/admin"
    await log_event("admin_access", request, user=user, result="failure", severity="warning",
                    details={"reason": "forbidden", "path": path, "source": "browser"})
    raise HTTPException(403, "Administrator access required")
