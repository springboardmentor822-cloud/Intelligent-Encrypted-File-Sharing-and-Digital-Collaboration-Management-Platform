"""OAuth2 / OpenID Connect authorization-code flow for Google and Microsoft."""
from urllib.parse import urlencode

import httpx

from app.core.config import settings

PROVIDERS = {
    "google": {
        "label": "Google",
        "auth_url": "https://accounts.google.com/o/oauth2/v2/auth",
        "token_url": "https://oauth2.googleapis.com/token",
        "userinfo_url": "https://openidconnect.googleapis.com/v1/userinfo",
        "scope": "openid email profile",
    },
    "microsoft": {
        "label": "Microsoft",
        "auth_url": "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
        "token_url": "https://login.microsoftonline.com/common/oauth2/v2.0/token",
        "userinfo_url": "https://graph.microsoft.com/oidc/userinfo",
        "scope": "openid email profile",
    },
}


def _creds(provider: str) -> tuple[str, str]:
    if provider == "google":
        return settings.google_client_id, settings.google_client_secret
    return settings.microsoft_client_id, settings.microsoft_client_secret


def enabled_providers() -> list[dict]:
    return [{"id": pid, "label": p["label"]} for pid, p in PROVIDERS.items() if _creds(pid)[0] and _creds(pid)[1]]


def redirect_uri(provider: str) -> str:
    return f"{settings.backend_public_url}/api/v1/auth/oauth/{provider}/callback"


def authorize_url(provider: str, state: str) -> str:
    client_id, _ = _creds(provider)
    p = PROVIDERS[provider]
    params = {"client_id": client_id, "redirect_uri": redirect_uri(provider), "response_type": "code",
              "scope": p["scope"], "state": state}
    if provider == "google":
        params["prompt"] = "select_account"
    return f"{p['auth_url']}?{urlencode(params)}"


def fetch_profile(provider: str, code: str) -> dict:
    client_id, client_secret = _creds(provider)
    p = PROVIDERS[provider]
    with httpx.Client(timeout=10) as http:
        tok = http.post(p["token_url"], data={
            "grant_type": "authorization_code", "code": code, "client_id": client_id,
            "client_secret": client_secret, "redirect_uri": redirect_uri(provider),
        })
        tok.raise_for_status()
        access = tok.json()["access_token"]
        info = http.get(p["userinfo_url"], headers={"Authorization": f"Bearer {access}"})
        info.raise_for_status()
        data = info.json()
    email = (data.get("email") or data.get("preferred_username") or "").lower()
    verified = bool(data.get("email_verified")) if provider == "google" else False
    return {"email": email, "name": data.get("name") or email.split("@")[0], "sub": str(data.get("sub")),
            "email_verified": verified}
