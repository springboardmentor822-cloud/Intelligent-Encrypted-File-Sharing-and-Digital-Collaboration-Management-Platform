import secrets, urllib.parse
from datetime import timedelta
import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from ..config import get_settings
from ..db import get_db, utcnow
from ..deps import current_user, get_claims
from ..models import OneTimeToken, RevokedToken, SecurityEvent, LoginEvent, User
from ..serializers import user_out
from ..services.audit import audit, login_event, security_event, client_ip, raise_alert
from ..services.ratelimit import rate_limit
from ..services.security import (create_access_token, hash_password, new_token, password_problem, sha256, verify_password)

router = APIRouter(prefix="/api/auth", tags=["auth"])
settings = get_settings()


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(max_length=128)
    full_name: str = Field(min_length=1, max_length=120)
    model_config = {"extra": "forbid"}     # a "role" field in the payload is rejected (422), never applied


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(max_length=128)
    remember: bool = False


def _issue(db, user, remember=False):
    tok, jti, exp = create_access_token(user.id, remember)
    return {"access_token": tok, "token_type": "bearer", "expires_at": exp.isoformat() + "Z", "user": user_out(user)}


def _one_time(db, user, purpose, minutes):
    raw = new_token()
    db.add(OneTimeToken(user_id=user.id, purpose=purpose, token_hash=sha256(raw), expires_at=utcnow() + timedelta(minutes=minutes)))
    db.commit()
    return raw


@router.post("/register", status_code=201, dependencies=[Depends(rate_limit("register", 10))])
def register(body: RegisterIn, request: Request, db: Session = Depends(get_db)):
    if (p := password_problem(body.password)):
        raise HTTPException(422, p)
    email = body.email.lower()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(409, "An account with this email already exists")
    u = User(email=email, full_name=body.full_name.strip(), password_hash=hash_password(body.password), role="user",
             quota_bytes=settings.user_quota_mb * 1024 * 1024)
    db.add(u); db.commit()
    audit(db, "auth.register", request=request, actor_id=u.id, resource_type="user", resource_id=u.id)
    out = {"user": user_out(u), "message": "Account created. Verification email is not sent unless an email provider is configured."}
    if settings.dev_expose_tokens and not settings.is_prod:
        out["dev_verify_token"] = _one_time(db, u, "verify", 60 * 24)
    return out


@router.post("/login", dependencies=[Depends(rate_limit("login"))])
def login(body: LoginIn, request: Request, db: Session = Depends(get_db)):
    email = body.email.lower()
    u = db.scalar(select(User).where(User.email == email))
    ok = verify_password(body.password, u.password_hash if u else None)
    if not ok or not u or not u.is_active:
        reason = "unknown_or_bad_credentials" if not (u and ok) else "account_disabled"
        login_event(db, request, email=email, user_id=u.id if u else None, success=False, reason=reason)
        try:
            from ..activity_monitoring import service as activity
            activity.record(db, "login_failed", user_id=u.id if u else None, status="failed", request=request,
                            details={"email": email, "reason": reason})
        except Exception:
            pass
        # Milestone 3 — per-user "incorrect password" security trigger (repeated wrong passwords).
        if u and not ok:
            try:
                from ..services import user_alerts
                user_alerts.wrong_password(db, u, request)
            except Exception:
                pass
        # Security Dashboard alert: someone tried to sign in to this account with a wrong password.
        if u and not ok:
            raise_alert(db, "failed_login", "high",
                        f"Wrong password for {u.email}",
                        f"A sign-in attempt for {u.email} used an incorrect password.",
                        request=request, user_id=u.id, email=u.email, resource=f"user:{u.id}",
                        details={"reason": reason, "method": "password"})
        elif not u:
            raise_alert(db, "failed_login", "medium",
                        f"Sign-in attempt for unknown account ({email})",
                        "A sign-in attempt used an email address that is not registered.",
                        request=request, email=email, details={"reason": reason})
        ip, since = client_ip(request), utcnow() - timedelta(minutes=15)
        fails = db.scalar(select(func.count()).select_from(LoginEvent).where(LoginEvent.success == False, LoginEvent.created_at >= since, LoginEvent.ip == ip))  # noqa: E712
        if fails == 5:
            security_event(db, "multiple_failed_logins", "high", "5 failed login attempts from one IP within 15 minutes",
                           request=request, details={"count": fails})
            raise_alert(db, "brute_force", "critical", "Repeated failed sign-ins from one IP",
                        "5 failed login attempts from the same IP address within 15 minutes.",
                        request=request, details={"count": fails})
        raise HTTPException(401, "Invalid email or password")
    # Abnormal-activity trigger: a successful sign-in from an IP this account has never used before.
    ip = client_ip(request)
    seen_before = db.scalar(select(func.count()).select_from(LoginEvent).where(
        LoginEvent.user_id == u.id, LoginEvent.success == True, LoginEvent.ip == ip)) or 0  # noqa: E712
    if ip and seen_before == 0 and u.last_login_at is not None:
        security_event(db, "new_signin_location", "medium", "Successful sign-in from a new IP address",
                       request=request, user_id=u.id, details={"ip": ip})
        raise_alert(db, "new_signin_location", "medium", f"New sign-in location for {u.email}",
                    "This account signed in successfully from an IP address it has not used before. "
                    "If the account owner does not recognise this, treat it as account takeover.",
                    request=request, user_id=u.id, email=u.email, resource=f"user:{u.id}", details={"ip": ip})
    u.last_login_at = utcnow(); db.commit()
    login_event(db, request, email=email, user_id=u.id, success=True)
    audit(db, "auth.login", request=request, actor_id=u.id, resource_type="user", resource_id=u.id)
    try:
        from ..activity_monitoring import service as activity
        activity.record(db, "login", user_id=u.id, request=request, details={"method": "password"})
    except Exception:
        pass
    return _issue(db, u, body.remember)


@router.post("/logout")
def logout(request: Request, claims: dict = Depends(get_claims), db: Session = Depends(get_db)):
    from datetime import datetime, timezone
    if not db.get(RevokedToken, claims["jti"]):
        db.add(RevokedToken(jti=claims["jti"], expires_at=datetime.fromtimestamp(claims["exp"], timezone.utc).replace(tzinfo=None)))
        db.commit()
    audit(db, "auth.logout", request=request, actor_id=claims["sub"])
    try:
        from ..activity_monitoring import service as activity
        activity.record(db, "logout", user_id=claims["sub"], request=request)
    except Exception:
        pass
    return {"ok": True}


@router.get("/me")
def me(user: User = Depends(current_user)):
    return user_out(user)


class ForgotIn(BaseModel):
    email: EmailStr


@router.post("/forgot-password", dependencies=[Depends(rate_limit("forgot", 5))])
def forgot(body: ForgotIn, request: Request, db: Session = Depends(get_db)):
    u = db.scalar(select(User).where(User.email == body.email.lower()))
    out = {"message": "If that email is registered, password reset instructions have been sent."}
    if u and u.is_active and u.password_hash:
        raw = _one_time(db, u, "reset", 30)
        audit(db, "auth.password_reset_requested", request=request, actor_id=u.id)
        # No email provider is wired in: the link is only exposed in development, never in production.
        if settings.dev_expose_tokens and not settings.is_prod:
            out["dev_reset_token"] = raw
    return out


class ResetIn(BaseModel):
    token: str = Field(max_length=200)
    password: str = Field(max_length=128)


def _consume(db, raw, purpose):
    t = db.scalar(select(OneTimeToken).where(OneTimeToken.token_hash == sha256(raw), OneTimeToken.purpose == purpose))
    if not t or t.used_at or t.expires_at < utcnow():
        raise HTTPException(400, "This link is invalid or has expired")
    t.used_at = utcnow()
    return t


@router.post("/reset-password", dependencies=[Depends(rate_limit("reset", 10))])
def reset(body: ResetIn, request: Request, db: Session = Depends(get_db)):
    if (p := password_problem(body.password)):
        raise HTTPException(422, p)
    t = _consume(db, body.token, "reset")
    u = db.get(User, t.user_id)
    u.password_hash = hash_password(body.password); db.commit()
    audit(db, "auth.password_reset", request=request, actor_id=u.id)
    return {"ok": True}


class VerifyIn(BaseModel):
    token: str = Field(max_length=200)


@router.post("/verify-email")
def verify_email(body: VerifyIn, request: Request, db: Session = Depends(get_db)):
    t = _consume(db, body.token, "verify")
    u = db.get(User, t.user_id); u.is_verified = True; db.commit()
    audit(db, "auth.email_verified", request=request, actor_id=u.id)
    return {"ok": True}


# ---------------- OAuth2 / OpenID Connect (requires provider credentials) ----------------
PROVIDERS = {
    "google": {"auth": "https://accounts.google.com/o/oauth2/v2/auth", "token": "https://oauth2.googleapis.com/token",
               "userinfo": "https://openidconnect.googleapis.com/v1/userinfo", "scope": "openid email profile"},
    "microsoft": {"auth": "https://login.microsoftonline.com/{t}/oauth2/v2.0/authorize",
                  "token": "https://login.microsoftonline.com/{t}/oauth2/v2.0/token",
                  "userinfo": "https://graph.microsoft.com/oidc/userinfo", "scope": "openid email profile"},
}


def _creds(p):
    return (settings.google_client_id, settings.google_client_secret) if p == "google" else (settings.microsoft_client_id, settings.microsoft_client_secret)


def configured(p) -> bool:
    return all(_creds(p))


@router.get("/oauth/providers")
def providers():
    return {p: {"configured": configured(p)} for p in PROVIDERS}


def _state_sign(state: str) -> str:
    return sha256(state + settings.jwt_secret)[:16]


@router.get("/oauth/{provider}/login")
def oauth_login(provider: str):
    if provider not in PROVIDERS:
        raise HTTPException(404, "Unknown provider")
    if not configured(provider):
        raise HTTPException(501, f"{provider.title()} sign-in is not configured on this server")
    cid, _ = _creds(provider)
    cfg = PROVIDERS[provider]
    raw = secrets.token_urlsafe(24)
    state = f"{raw}.{_state_sign(raw)}"
    q = urllib.parse.urlencode({"client_id": cid, "response_type": "code", "scope": cfg["scope"], "state": state,
                                "redirect_uri": f"{settings.public_base_url}/api/auth/oauth/{provider}/callback"})
    resp = RedirectResponse(cfg["auth"].format(t=settings.microsoft_tenant) + "?" + q)
    resp.set_cookie("ts_oauth_state", raw, max_age=600, httponly=True, samesite="lax", secure=settings.is_prod)
    return resp


@router.get("/oauth/{provider}/callback")
def oauth_callback(provider: str, request: Request, code: str = "", state: str = "", db: Session = Depends(get_db)):
    if provider not in PROVIDERS or not configured(provider):
        raise HTTPException(501, "Provider not configured")
    raw = state.split(".")[0]
    if not code or "." not in state or state.split(".")[1] != _state_sign(raw) or request.cookies.get("ts_oauth_state") != raw:
        login_event(db, request, email=None, user_id=None, success=False, reason="oauth_state_invalid", method=provider)
        raise HTTPException(400, "Invalid OAuth state")
    cid, sec = _creds(provider); cfg = PROVIDERS[provider]
    try:
        with httpx.Client(timeout=10) as c:
            tok = c.post(cfg["token"].format(t=settings.microsoft_tenant), data={
                "grant_type": "authorization_code", "code": code, "client_id": cid, "client_secret": sec,
                "redirect_uri": f"{settings.public_base_url}/api/auth/oauth/{provider}/callback"}).json()
            info = c.get(cfg["userinfo"], headers={"Authorization": f"Bearer {tok['access_token']}"}).json()
    except Exception:
        raise HTTPException(502, "Could not complete sign-in with the provider")
    email, sub = (info.get("email") or "").lower(), info.get("sub")
    if not email or not sub:
        raise HTTPException(400, "Provider did not return an email address")
    u = db.scalar(select(User).where(User.oauth_provider == provider, User.oauth_subject == sub))
    if not u:
        u = db.scalar(select(User).where(User.email == email))
        if u:   # never silently link to an existing password account
            login_event(db, request, email=email, user_id=u.id, success=False, reason="oauth_email_conflict", method=provider)
            return RedirectResponse(f"{settings.frontend_url}/login?error=account_exists")
        u = User(email=email, full_name=info.get("name", ""), role="user", is_verified=True, oauth_provider=provider,
                 oauth_subject=sub, quota_bytes=settings.user_quota_mb * 1024 * 1024)
        db.add(u); db.commit()
        audit(db, "auth.register", request=request, actor_id=u.id, details={"method": provider})
    if not u.is_active:
        raise HTTPException(403, "Account disabled")
    u.last_login_at = utcnow(); db.commit()
    login_event(db, request, email=email, user_id=u.id, success=True, method=provider)
    audit(db, "auth.login", request=request, actor_id=u.id, details={"method": provider})
    try:
        from ..activity_monitoring import service as activity
        activity.record(db, "login", user_id=u.id, request=request, details={"method": provider})
    except Exception:
        pass
    tok, _, _ = create_access_token(u.id)
    # token is passed in the URL fragment (never sent to servers / logged in access logs)
    return RedirectResponse(f"{settings.frontend_url}/oauth/complete#token={tok}")
