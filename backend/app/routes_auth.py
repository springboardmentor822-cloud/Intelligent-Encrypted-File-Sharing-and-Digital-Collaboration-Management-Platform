
import os
import logging
from urllib.parse import quote


from authlib.integrations.base_client.errors import OAuthError
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse, RedirectResponse
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from starlette.status import HTTP_302_FOUND

from app.activity import record_activity
from app.rate_limit import client_address
from app.auth import (
    create_access_token,
    get_current_user,
    get_db,
    oauth,
    hash_password,
    ROLE_USER,
    verify_password,
)
from app.rate_limit import enforce_auth_rate_limit
from app.models import User, LinkedProvider
from app.gmail_service import save_gmail_credential
from app.schemas import LoginRequest, RegisterRequest, TokenResponse, UserResponse


router = APIRouter(prefix="/auth", tags=["Authentication"])
oauth_logger = logging.getLogger("trustshare.oauth")


# ---------------------------------------------------------
# Redirect configuration
# ---------------------------------------------------------

FRONTEND_URL = os.getenv(
    "FRONTEND_URL",
    "http://localhost:5173",
).rstrip("/")

GOOGLE_REDIRECT_URI = os.getenv(
    "GOOGLE_REDIRECT_URI",
    "http://localhost:8000/auth/google/callback",
)

MICROSOFT_REDIRECT_URI = os.getenv(
    "MICROSOFT_REDIRECT_URI",
    "http://localhost:8000/auth/microsoft/callback",
)

MICROSOFT_LINK_REDIRECT_URI = os.getenv(
    "MICROSOFT_LINK_REDIRECT_URI",
    "http://localhost:8000/auth/microsoft/link/callback",
)
GOOGLE_GMAIL_REDIRECT_URI = os.getenv(
    "GOOGLE_GMAIL_REDIRECT_URI",
    "http://localhost:8000/auth/google/gmail/callback",
)


# ---------------------------------------------------------
# Common helpers
# ---------------------------------------------------------

def token_response(user: User) -> dict:
    return {
        "access_token": create_access_token(user),
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "full_name": user.full_name,
            "email": user.email,
            "role": user.role,
        },
    }


def get_provider_client(provider: str):
    client = getattr(oauth, provider, None)

    if client is None:
        raise HTTPException(
            status_code=503,
            detail=f"{provider.title()} sign-in is not configured.",
        )

    return client


def log_oauth_failure(request: Request, flow: str, exc: Exception):
    state_keys = [
        key
        for key in request.session
        if key.startswith("_state_")
    ]
    query_keys = sorted(request.query_params.keys())
    error_fields = {
        field: getattr(exc, field, None)
        for field in ("error", "description", "error_uri", "code")
        if getattr(exc, field, None) is not None
    }

    oauth_logger.warning(
        "Microsoft OAuth %s failed: exception=%s details=%s "
        "host=%s path=%s session_cookie=%s oauth_state_entries=%d "
        "query_keys=%s",
        flow,
        type(exc).__name__,
        error_fields or str(exc),
        request.headers.get("host"),
        request.url.path,
        "trustshare_session" in request.cookies,
        len(state_keys),
        query_keys,
    )


def oauth_success_redirect(user: User):
    access_token = create_access_token(user)

    callback_url = (
        f"{FRONTEND_URL}/auth/callback"
        f"#token={access_token}"
    )

    return RedirectResponse(
        url=callback_url,
        status_code=HTTP_302_FOUND,
    )


# ---------------------------------------------------------
# Registration and password login
# ---------------------------------------------------------

@router.post(
    "/register",
    response_model=TokenResponse,
    status_code=201,
)
def register(
    data: RegisterRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    enforce_auth_rate_limit("register", request)
    email = str(data.email).lower().strip()

    existing_user = (
        db.query(User)
        .filter(User.email == email)
        .first()
    )

    if existing_user:
        raise HTTPException(
            status_code=409,
            detail="An account with this email already exists.",
        )

    user = User(
        full_name=data.full_name.strip(),
        email=email,
        hashed_password=hash_password(data.password),
        role=ROLE_USER,
        auth_provider="local",
    )

    db.add(user)

    try:
        db.commit()
        db.refresh(user)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="An account with this email already exists.",
        ) from exc

    record_activity("registration_success", user.id, username=getattr(user, "full_name", None))
    return token_response(user)



@router.post("/login", response_model=TokenResponse)
def login(
    data: LoginRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    enforce_auth_rate_limit("login", request)
    email = str(data.email).lower().strip()

    user = (
        db.query(User)
        .filter(User.email == email)
        .first()
    )

    if (
        user is None
        or not user.hashed_password
        or not verify_password(data.password, user.hashed_password)
    ):
        record_activity(
            "login_failed",
            user.id if user is not None else None,
            username=getattr(user, "full_name", None) if user is not None else None,
            provider="local",
            target_email=email,
            ip_address=client_address(request),
            details="Invalid credentials",
            severity="warning",
        )

        raise HTTPException(
            status_code=401,
            detail="Incorrect email or password.",
        )

    record_activity("login_success", user.id, username=getattr(user, "full_name", None), provider="local", ip_address=client_address(request))
    return token_response(user)


@router.get("/me", response_model=UserResponse)
def get_me(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    microsoft_linked = (
        user.auth_provider == "microsoft"
        or db.query(LinkedProvider)
        .filter(
            LinkedProvider.user_id == user.id,
            LinkedProvider.provider == "microsoft",
        )
        .first()
        is not None
    )

    return {
        "id": user.id,
        "full_name": user.full_name,
        "email": user.email,
        "role": user.role,
        "auth_provider": user.auth_provider,
        "microsoft_linked": microsoft_linked,
    }


@router.post("/logout")
def logout(
    request: Request,
    current_user: User = Depends(get_current_user),
):
    record_activity(
        "logout",
        current_user.id,
        username=getattr(current_user, "full_name", None),
        ip_address=client_address(request),
        description="User signed out.",
    )
    return {"status": "logged_out"}


# ---------------------------------------------------------
# Google authentication
# ---------------------------------------------------------

@router.get("/google/login")
async def google_login(request: Request):
    client = get_provider_client("google")

    return await client.authorize_redirect(
        request,
        GOOGLE_REDIRECT_URI,
        prompt="select_account",
    )


@router.get("/google/link")
async def google_link_login(
    request: Request,
    current_user: User = Depends(get_current_user),
):
    client = get_provider_client("google")

    request.session["google_link_user_id"] = current_user.id

    return await client.authorize_redirect(
        request,
        GOOGLE_REDIRECT_URI,
        prompt="select_account",
    )


@router.post("/google/link/start")
async def google_link_start(
    request: Request,
    current_user: User = Depends(get_current_user),
):
    client = get_provider_client("google")

    request.session["google_link_user_id"] = current_user.id

    authorization = await client.create_authorization_url(
        GOOGLE_REDIRECT_URI,
        prompt="select_account",
    )

    await client.save_authorize_data(
        request,
        redirect_uri=GOOGLE_REDIRECT_URI,
        **authorization,
    )

    return {
        "authorization_url": authorization["url"],
    }


@router.get("/google/gmail/status")
def google_gmail_status(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from app.gmail_service import gmail_status
    return gmail_status(db, current_user.id)


@router.post("/google/gmail/connect/start")
async def google_gmail_connect_start(
    request: Request,
    current_user: User = Depends(get_current_user),
):
    client = get_provider_client("google")
    # This value is also used for the code exchange in the callback. Keep the
    # exact configured URI visible in server diagnostics so redirect mismatch
    # can be resolved without ever logging OAuth credentials.
    oauth_logger.info("Gmail OAuth started: user_id=%s redirect_uri=%s", current_user.id, GOOGLE_GMAIL_REDIRECT_URI)
    request.session["gmail_connect_user_id"] = current_user.id
    authorization = await client.create_authorization_url(
        GOOGLE_GMAIL_REDIRECT_URI,
        scope="openid email profile https://www.googleapis.com/auth/gmail.send",
        access_type="offline",
        prompt="consent select_account",
        include_granted_scopes="true",
    )
    await client.save_authorize_data(request, redirect_uri=GOOGLE_GMAIL_REDIRECT_URI, **authorization)
    return {"authorization_url": authorization["url"]}


@router.get("/google/gmail/callback")
async def google_gmail_callback(request: Request, db: Session = Depends(get_db)):
    user_id = request.session.pop("gmail_connect_user_id", None)
    if user_id is None:
        oauth_logger.warning("Gmail OAuth callback rejected: missing initiating session")
        return RedirectResponse(f"{FRONTEND_URL}/dashboard?gmail=failed", status_code=HTTP_302_FOUND)
    if request.query_params.get("error") == "access_denied":
        oauth_logger.info("Gmail OAuth consent denied: user_id=%s", user_id)
        return RedirectResponse(f"{FRONTEND_URL}/dashboard?gmail=denied", status_code=HTTP_302_FOUND)
    try:
        client = get_provider_client("google")
        token = await client.authorize_access_token(request)
        profile = token.get("userinfo") or await client.userinfo(token=token)
        email = (profile.get("email") or "").strip().lower()
        if profile.get("email_verified") is not True or not email:
            raise HTTPException(status_code=403, detail="Google must confirm the Gmail address before connecting.")
        granted_scopes = token.get("scope", "")
        if isinstance(granted_scopes, str):
            granted_scopes = granted_scopes.split()
        if "https://www.googleapis.com/auth/gmail.send" not in granted_scopes:
            raise HTTPException(status_code=403, detail="Gmail sending permission was not granted.")
        save_gmail_credential(db, user_id, email, token)
    except OAuthError as exc:
        # Provider exceptions can contain callback details; log only their
        # class and our configured callback URI, never query values or tokens.
        oauth_logger.warning("Gmail OAuth exchange failed: user_id=%s exception=%s redirect_uri=%s", user_id, type(exc).__name__, GOOGLE_GMAIL_REDIRECT_URI)
        return RedirectResponse(f"{FRONTEND_URL}/dashboard?gmail=failed", status_code=HTTP_302_FOUND)
    except HTTPException as exc:
        oauth_logger.warning("Gmail OAuth validation failed: user_id=%s status=%s redirect_uri=%s", user_id, exc.status_code, GOOGLE_GMAIL_REDIRECT_URI)
        return RedirectResponse(f"{FRONTEND_URL}/dashboard?gmail=failed", status_code=HTTP_302_FOUND)
    except Exception:
        db.rollback()
        oauth_logger.warning("Gmail authorization could not be stored: user_id=%s exception=storage_error", user_id)
        return RedirectResponse(f"{FRONTEND_URL}/dashboard?gmail=failed", status_code=HTTP_302_FOUND)
    return RedirectResponse(f"{FRONTEND_URL}/dashboard?gmail=connected", status_code=HTTP_302_FOUND)


@router.get("/google/callback")
async def google_callback(
    request: Request,
    db: Session = Depends(get_db),
):
    client = get_provider_client("google")

    try:
        token = await client.authorize_access_token(request)
    except OAuthError as exc:
        request.session.pop("google_link_user_id", None)
        record_activity(
            "login_failed",
            provider="google",
            ip_address=client_address(request),
            details="OAuth sign-in failed",
            severity="warning",
        )

        raise HTTPException(
            status_code=401,
            detail="Google sign-in failed. Please try again.",
        ) from exc

    profile = token.get("userinfo")

    if not profile:
        raise HTTPException(
            status_code=401,
            detail="Google profile unavailable.",
        )

    provider_subject = profile.get("sub")
    email = (profile.get("email") or "").strip().lower()
    full_name = profile.get("name") or email.split("@")[0]
    verified = profile.get("email_verified") is True

    if not provider_subject or not email or not verified:
        raise HTTPException(
            status_code=401,
            detail="A verified Google email is required.",
        )

    link_user_id = request.session.pop("google_link_user_id", None)

    if link_user_id is not None:
        user = (
            db.query(User)
            .filter(User.id == link_user_id)
            .first()
        )

        if user is None:
            raise HTTPException(
                status_code=401,
                detail="TrustShare account not found.",
            )

        linked_user = (
            db.query(User)
            .filter(User.provider_subject == provider_subject)
            .first()
        )

        if linked_user is not None and linked_user.id != user.id:
            raise HTTPException(
                status_code=409,
                detail="This Google account is already linked to another user.",
            )

        if user.auth_provider not in ("local", "google"):
            raise HTTPException(
                status_code=409,
                detail="This account uses another sign-in provider.",
            )

        user.auth_provider = "google"
        user.provider_subject = provider_subject

        try:
            db.commit()
            db.refresh(user)
        except IntegrityError as exc:
            db.rollback()
            raise HTTPException(
                status_code=409,
                detail="Unable to link this Google account.",
            ) from exc

        record_activity("provider_linked", user.id, username=getattr(user, "full_name", None), provider="google")

    else:
        user = (
            db.query(User)
            .filter(User.email == email)
            .first()
        )

        if user is None:
            user = User(
                full_name=full_name[:100],
                email=email,
                hashed_password=None,
                role=ROLE_USER,
                auth_provider="google",
                provider_subject=provider_subject,
            )

            db.add(user)

            try:
                db.commit()
                db.refresh(user)
            except IntegrityError as exc:
                db.rollback()
                raise HTTPException(
                    status_code=409,
                    detail="Account conflict. Please try again.",
                ) from exc

        elif user.auth_provider == "google":
            if (
                user.provider_subject
                and user.provider_subject != provider_subject
            ):
                raise HTTPException(
                    status_code=409,
                    detail="Google account mismatch.",
                )

            if not user.provider_subject:
                user.provider_subject = provider_subject

                try:
                    db.commit()
                    db.refresh(user)
                except IntegrityError as exc:
                    db.rollback()
                    raise HTTPException(
                        status_code=409,
                        detail="Google account conflict.",
                    ) from exc

        else:
            raise HTTPException(
                status_code=409,
                detail=(
                    "An account already exists with this email. "
                    "Sign in using its original method, then link Google "
                    "from your account settings."
                ),
            )

    record_activity("login_success", user.id, username=getattr(user, "full_name", None), provider="google", ip_address=client_address(request))
    return oauth_success_redirect(user)


# ---------------------------------------------------------
# Microsoft sign-in
# ---------------------------------------------------------

@router.get("/microsoft/login")
async def microsoft_login(request: Request):
    client = get_provider_client("microsoft")

    response = await client.authorize_redirect(
        request,
        MICROSOFT_REDIRECT_URI,
        prompt="select_account",
    )

    oauth_logger.warning(
        "Microsoft OAuth login started: host=%s redirect_uri=%s "
        "oauth_state_entries=%d response_type=%s",
        request.headers.get("host"),
        MICROSOFT_REDIRECT_URI,
        sum(key.startswith("_state_") for key in request.session),
        type(response).__name__,
    )
    return response


async def get_microsoft_identity(request: Request):
    client = get_provider_client("microsoft")
    token = await client.authorize_access_token(request)
    profile = token.get("userinfo") or {}

    provider_subject = profile.get("sub") or profile.get("oid")
    email = (
        profile.get("email")
        or profile.get("preferred_username")
        or ""
    ).strip().lower()

    if not provider_subject or not email or "@" not in email:
        raise HTTPException(
            status_code=401,
            detail="Microsoft did not provide a usable account identity.",
        )

    return (
        provider_subject,
        email,
        (profile.get("name") or email.split("@")[0])[:100],
    )


@router.get("/microsoft/callback")
async def microsoft_callback(
    request: Request,
    db: Session = Depends(get_db),
):
    try:
        provider_subject, email, full_name = await get_microsoft_identity(
            request
        )
    except OAuthError as exc:
        log_oauth_failure(request, "login", exc)
        record_activity(
            "login_failed",
            provider="microsoft",
            ip_address=client_address(request),
            details="OAuth sign-in failed",
            severity="warning",
        )

        raise HTTPException(
            status_code=401,
            detail="Microsoft sign-in failed. Please try again.",
        ) from exc

    linked = (
        db.query(LinkedProvider)
        .filter(
            LinkedProvider.provider == "microsoft",
            LinkedProvider.provider_subject == provider_subject,
        )
        .first()
    )

    if linked is not None:
        linked_user = (
            db.query(User)
            .filter(User.id == linked.user_id)
            .first()
        )

        if linked_user is not None:
            record_activity(
                "login_success",
                linked_user.id,
                username=getattr(linked_user, "full_name", None),
                provider="microsoft",
                ip_address=client_address(request),
            )
            return oauth_success_redirect(linked_user)

    primary_user = (
        db.query(User)
        .filter(
            User.auth_provider == "microsoft",
            User.provider_subject == provider_subject,
        )
        .first()
    )

    if primary_user is not None:
        record_activity(
            "login_success",
            primary_user.id,
                username=getattr(primary_user, "full_name", None),
            provider="microsoft",
            ip_address=client_address(request),
        )
        return oauth_success_redirect(primary_user)

    user = (
        db.query(User)
        .filter(User.email == email)
        .first()
    )

    if user is None:
        user = User(
            full_name=full_name[:100],
            email=email,
            hashed_password=None,
            role=ROLE_USER,
            auth_provider="microsoft",
            provider_subject=provider_subject,
        )

        db.add(user)

        try:
            db.commit()
            db.refresh(user)
        except IntegrityError as exc:
            db.rollback()
            raise HTTPException(
                status_code=409,
                detail="Account conflict. Please try again.",
            ) from exc

        record_activity("login_success", user.id, username=getattr(user, "full_name", None), provider="microsoft", ip_address=client_address(request))
        return oauth_success_redirect(user)

    if user.auth_provider == "microsoft":
        if (
            user.provider_subject
            and user.provider_subject != provider_subject
        ):
            raise HTTPException(
                status_code=409,
                detail="Microsoft account mismatch.",
            )

        if not user.provider_subject:
            user.provider_subject = provider_subject

            try:
                db.commit()
                db.refresh(user)
            except IntegrityError as exc:
                db.rollback()
                raise HTTPException(
                    status_code=409,
                    detail="Microsoft account conflict.",
                ) from exc

    else:
        return RedirectResponse(
            url=(
                f"{FRONTEND_URL}/login"
                "?error=microsoft_account_exists"
            ),
            status_code=HTTP_302_FOUND,
        )

    record_activity("login_success", user.id, username=getattr(user, "full_name", None), provider="microsoft", ip_address=client_address(request))
    return oauth_success_redirect(user)


# ---------------------------------------------------------
# Microsoft account linking
# ---------------------------------------------------------

@router.post("/microsoft/link/start")
async def microsoft_link_start(
    request: Request,
    current_user: User = Depends(get_current_user),
):
    client = get_provider_client("microsoft")

    # Tie this OAuth attempt to the currently authenticated user.
    request.session["microsoft_link_user_id"] = current_user.id

    # Authlib saves OAuth state/nonce data in the session.
    authorization = await client.create_authorization_url(
        MICROSOFT_LINK_REDIRECT_URI,
        prompt="select_account",
    )

    await client.save_authorize_data(
        request,
        redirect_uri=MICROSOFT_LINK_REDIRECT_URI,
        **authorization,
    )

    return JSONResponse(
        {"authorization_url": authorization["url"]}
    )


def microsoft_link_redirect(error: str | None = None):
    url = f"{FRONTEND_URL}/account"

    if error:
        url += f"?microsoft_link_error={quote(error, safe='')}"
    else:
        url += "?microsoft_linked=1"

    return RedirectResponse(
        url=url,
        status_code=HTTP_302_FOUND,
    )


@router.get("/microsoft/link/callback")
async def microsoft_link_callback(
    request: Request,
    db: Session = Depends(get_db),
):
    link_user_id = request.session.get("microsoft_link_user_id")

    try:
        if link_user_id is None:
            return microsoft_link_redirect(
                "Your account link session expired. Please try again."
            )

        provider_subject, _, _ = await get_microsoft_identity(request)
        user = db.query(User).filter(User.id == link_user_id).first()

        if user is None:
            return microsoft_link_redirect("TrustShare account not found.")

        primary_user = (
            db.query(User)
            .filter(
                User.auth_provider == "microsoft",
                User.provider_subject == provider_subject,
            )
            .first()
        )

        linked = (
            db.query(LinkedProvider)
            .filter(
                LinkedProvider.provider == "microsoft",
                LinkedProvider.provider_subject == provider_subject,
            )
            .first()
        )

        if (
            (primary_user is not None and primary_user.id != user.id)
            or (linked is not None and linked.user_id != user.id)
        ):
            return microsoft_link_redirect(
                "This Microsoft account is already linked to another user."
            )

        if primary_user is None and linked is None:
            db.add(
                LinkedProvider(
                    user_id=user.id,
                    provider="microsoft",
                    provider_subject=provider_subject,
                )
            )
            db.commit()
            record_activity(
                "provider_linked",
                user.id,
                provider="microsoft",
                username=getattr(user, "full_name", None),
            )

        request.session.pop("microsoft_link_user_id", None)
        return microsoft_link_redirect()

    except OAuthError as exc:
        db.rollback()
        log_oauth_failure(request, "link", exc)
        return microsoft_link_redirect(
            "Microsoft sign-in could not be verified. Please try again."
        )
    except IntegrityError:
        db.rollback()
        return microsoft_link_redirect(
            "This Microsoft account could not be linked. Please try again."
        )
    except HTTPException as exc:
        db.rollback()
        return microsoft_link_redirect(
            str(exc.detail)
        )
