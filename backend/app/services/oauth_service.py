import os
import secrets
from pathlib import Path
from urllib.parse import urlencode
from typing import Dict, Any, Optional
import httpx
from dotenv import load_dotenv

env_path = Path(__file__).resolve().parent.parent.parent / ".env"

def _reload_env():
    if env_path.exists():
        load_dotenv(dotenv_path=env_path, override=True)

# Initial load
_reload_env()


def get_google_client_id() -> str:
    _reload_env()
    return os.getenv("GOOGLE_CLIENT_ID", "").strip()


def get_google_client_secret() -> str:
    _reload_env()
    return os.getenv("GOOGLE_CLIENT_SECRET", "").strip()


def get_google_redirect_uri() -> str:
    _reload_env()
    return os.getenv(
        "GOOGLE_REDIRECT_URI",
        "http://127.0.0.1:8000/auth/oauth/google/callback"
    ).strip()


def get_microsoft_client_id() -> str:
    _reload_env()
    return os.getenv("MICROSOFT_CLIENT_ID", "").strip()


def get_microsoft_client_secret() -> str:
    _reload_env()
    return os.getenv("MICROSOFT_CLIENT_SECRET", "").strip()


def get_microsoft_tenant_id() -> str:
    _reload_env()
    return os.getenv("MICROSOFT_TENANT_ID", "common").strip()


def get_microsoft_redirect_uri() -> str:
    _reload_env()
    return os.getenv(
        "MICROSOFT_REDIRECT_URI",
        "http://127.0.0.1:8000/auth/oauth/microsoft/callback"
    ).strip()


def get_frontend_url() -> str:
    _reload_env()
    return os.getenv("FRONTEND_URL", "http://localhost:3000").rstrip("/")


def is_google_configured() -> bool:
    return bool(get_google_client_id() and get_google_client_secret())


def is_microsoft_configured() -> bool:
    return bool(get_microsoft_client_id() and get_microsoft_client_secret())


def get_oauth_config() -> Dict[str, Any]:
    return {
        "google": {
            "enabled": is_google_configured(),
            "client_id": get_google_client_id() if is_google_configured() else None,
            "redirect_uri": get_google_redirect_uri(),
        },
        "microsoft": {
            "enabled": is_microsoft_configured(),
            "client_id": get_microsoft_client_id() if is_microsoft_configured() else None,
            "tenant_id": get_microsoft_tenant_id(),
            "redirect_uri": get_microsoft_redirect_uri(),
        },
        "frontend_url": get_frontend_url(),
    }


def get_google_auth_url(state: Optional[str] = None) -> str:
    client_id = get_google_client_id()
    if not client_id:
        raise ValueError("Google OAuth credentials (GOOGLE_CLIENT_ID) not configured.")
    state_param = state or secrets.token_urlsafe(16)
    params = {
        "client_id": client_id,
        "redirect_uri": get_google_redirect_uri(),
        "response_type": "code",
        "scope": "openid email profile",
        "prompt": "select_account",
        "access_type": "offline",
        "state": state_param,
    }
    return f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}"


def get_microsoft_auth_url(state: Optional[str] = None) -> str:
    client_id = get_microsoft_client_id()
    if not client_id:
        raise ValueError("Microsoft OAuth credentials (MICROSOFT_CLIENT_ID) not configured.")
    state_param = state or secrets.token_urlsafe(16)
    tenant = get_microsoft_tenant_id() or "common"
    params = {
        "client_id": client_id,
        "response_type": "code",
        "redirect_uri": get_microsoft_redirect_uri(),
        "response_mode": "query",
        "scope": "openid email profile User.Read",
        "prompt": "select_account",
        "state": state_param,
    }
    return f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize?{urlencode(params)}"


async def exchange_google_code(code: str) -> Dict[str, Any]:
    token_url = "https://oauth2.googleapis.com/token"
    client_id = get_google_client_id()
    client_secret = get_google_client_secret()
    redirect_uri = get_google_redirect_uri()

    async with httpx.AsyncClient(timeout=10.0) as client:
        token_resp = await client.post(
            token_url,
            data={
                "client_id": client_id,
                "client_secret": client_secret,
                "code": code,
                "grant_type": "authorization_code",
                "redirect_uri": redirect_uri,
            },
            headers={"Accept": "application/json"},
        )
        if token_resp.status_code != 200:
            raise ValueError(f"Failed to exchange Google authorization code: {token_resp.text}")

        token_data = token_resp.json()
        access_token = token_data.get("access_token")

        # Fetch profile
        userinfo_resp = await client.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if userinfo_resp.status_code != 200:
            raise ValueError(f"Failed to fetch Google profile: {userinfo_resp.text}")

        user_info = userinfo_resp.json()
        email = user_info.get("email")
        if not email:
            raise ValueError("No email returned by Google OAuth.")

        return {
            "provider": "google",
            "email": email.lower(),
            "name": user_info.get("name") or email.split("@")[0],
            "provider_id": str(user_info.get("id")),
            "picture": user_info.get("picture"),
        }


async def verify_google_id_token(id_token: str) -> Dict[str, Any]:
    url = f"https://oauth2.googleapis.com/tokeninfo?id_token={id_token}"
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(url)
        if resp.status_code != 200:
            raise ValueError(f"Invalid Google ID token: {resp.text}")

        data = resp.json()
        email = data.get("email")
        if not email:
            raise ValueError("No email in Google ID token.")

        return {
            "provider": "google",
            "email": email.lower(),
            "name": data.get("name") or email.split("@")[0],
            "provider_id": str(data.get("sub")),
            "picture": data.get("picture"),
        }


async def exchange_microsoft_code(code: str) -> Dict[str, Any]:
    tenant = get_microsoft_tenant_id() or "common"
    token_url = f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token"
    client_id = get_microsoft_client_id()
    client_secret = get_microsoft_client_secret()
    redirect_uri = get_microsoft_redirect_uri()

    async with httpx.AsyncClient(timeout=10.0) as client:
        token_resp = await client.post(
            token_url,
            data={
                "client_id": client_id,
                "client_secret": client_secret,
                "code": code,
                "grant_type": "authorization_code",
                "redirect_uri": redirect_uri,
                "scope": "openid email profile User.Read",
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        if token_resp.status_code != 200:
            raise ValueError(f"Failed to exchange Microsoft code: {token_resp.text}")

        token_data = token_resp.json()
        access_token = token_data.get("access_token")

        # Fetch Microsoft Graph profile
        graph_resp = await client.get(
            "https://graph.microsoft.com/v1.0/me",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if graph_resp.status_code != 200:
            raise ValueError(f"Failed to fetch Microsoft Graph user profile: {graph_resp.text}")

        profile = graph_resp.json()
        email = profile.get("mail") or profile.get("userPrincipalName")
        if not email:
            raise ValueError("No email found in Microsoft account profile.")

        return {
            "provider": "microsoft",
            "email": email.lower(),
            "name": profile.get("displayName") or email.split("@")[0],
            "provider_id": str(profile.get("id")),
        }


def save_oauth_credentials(
    provider: str,
    client_id: str,
    client_secret: str,
    tenant_id: Optional[str] = None
) -> bool:
    """Persists updated OAuth provider credentials into backend/.env and reloads environment"""
    if not env_path.exists():
        env_path.touch()

    lines = env_path.read_text(encoding="utf-8").splitlines()
    updates = {}
    provider_lower = provider.lower()
    if provider_lower == "google":
        updates["GOOGLE_CLIENT_ID"] = client_id.strip()
        updates["GOOGLE_CLIENT_SECRET"] = client_secret.strip()
    elif provider_lower == "microsoft":
        updates["MICROSOFT_CLIENT_ID"] = client_id.strip()
        updates["MICROSOFT_CLIENT_SECRET"] = client_secret.strip()
        if tenant_id:
            updates["MICROSOFT_TENANT_ID"] = tenant_id.strip()

    new_lines = []
    found_keys = set()
    for line in lines:
        stripped = line.strip()
        if stripped and not stripped.startswith("#") and "=" in stripped:
            key, _ = stripped.split("=", 1)
            key = key.strip()
            if key in updates:
                new_lines.append(f"{key}={updates[key]}")
                found_keys.add(key)
                continue
        new_lines.append(line)

    for k, v in updates.items():
        if k not in found_keys:
            new_lines.append(f"{k}={v}")

    env_path.write_text("\n".join(new_lines) + "\n", encoding="utf-8")
    _reload_env()
    return True
