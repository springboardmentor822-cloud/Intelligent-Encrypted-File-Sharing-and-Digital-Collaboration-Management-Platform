import base64
import os
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage

import httpx
from cryptography.fernet import Fernet, InvalidToken
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models import GmailCredential

GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GMAIL_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"


class GmailDeliveryUncertain(HTTPException):
    """Provider may have accepted a send but TrustShare did not get confirmation."""

    def __init__(self):
        super().__init__(status_code=503, detail="Gmail send outcome is uncertain; automatic retry is withheld.")


def _fernet():
    key = os.getenv("GOOGLE_TOKEN_ENCRYPTION_KEY", "").strip()
    if not key:
        raise HTTPException(status_code=503, detail="Gmail token encryption is not configured.")
    try:
        return Fernet(key.encode("ascii"))
    except (ValueError, UnicodeEncodeError) as exc:
        raise HTTPException(status_code=503, detail="Gmail token encryption configuration is invalid.") from exc


def encrypt_token(value: str) -> str:
    return _fernet().encrypt(value.encode("utf-8")).decode("ascii")


def decrypt_token(value: str) -> str:
    try:
        return _fernet().decrypt(value.encode("ascii")).decode("utf-8")
    except (InvalidToken, UnicodeEncodeError) as exc:
        raise HTTPException(status_code=503, detail="Stored Gmail authorization is unavailable. Reconnect Gmail.") from exc


def save_gmail_credential(db: Session, user_id: int, sender_email: str, token: dict):
    access = token.get("access_token")
    if not access:
        raise HTTPException(status_code=502, detail="Google did not return Gmail authorization. Please try again.")
    row = db.query(GmailCredential).filter(GmailCredential.user_id == user_id).first()
    if row is None:
        row = GmailCredential(user_id=user_id, sender_email=sender_email)
        db.add(row)
    row.sender_email = sender_email.strip().lower()
    row.access_token_encrypted = encrypt_token(access)
    refresh = token.get("refresh_token")
    if refresh:
        row.refresh_token_encrypted = encrypt_token(refresh)
    elif not row.refresh_token_encrypted:
        db.rollback()
        raise HTTPException(status_code=502, detail="Google did not grant offline Gmail access. Reconnect Gmail and approve the request.")
    expires_in = token.get("expires_in")
    row.expires_at = datetime.now(timezone.utc) + timedelta(seconds=int(expires_in)) if expires_in else None
    db.commit()
    return row


def gmail_status(db: Session, user_id: int):
    row = db.query(GmailCredential).filter(GmailCredential.user_id == user_id).first()
    return {"connected": row is not None, "sender_email": row.sender_email if row else None}


def _google_refresh_error_code(response: httpx.Response) -> str | None:
    """Return only a fixed OAuth error identifier; never retain provider text."""
    try:
        payload = response.json()
    except (ValueError, TypeError):
        return None
    if not isinstance(payload, dict):
        return None
    code = payload.get("error")
    allowed = {"invalid_grant", "invalid_client", "unauthorized_client", "invalid_request"}
    return code if isinstance(code, str) and code in allowed else None


def _access_token(db: Session, row: GmailCredential):
    now = datetime.now(timezone.utc)
    expires = row.expires_at
    if expires is not None and expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires is not None and expires > now + timedelta(seconds=60):
        return decrypt_token(row.access_token_encrypted)
    if not row.refresh_token_encrypted:
        raise HTTPException(status_code=403, detail="Gmail authorization expired. Reconnect Gmail to send invitations.")
    client_id = os.getenv("GOOGLE_CLIENT_ID", "").strip()
    client_secret = os.getenv("GOOGLE_CLIENT_SECRET", "")
    if not client_id or not client_secret:
        raise HTTPException(status_code=503, detail="Google OAuth is not configured for Gmail sending.")
    try:
        response = httpx.post(GOOGLE_TOKEN_URL, data={
            "client_id": client_id,
            "client_secret": client_secret,
            "refresh_token": decrypt_token(row.refresh_token_encrypted),
            "grant_type": "refresh_token",
        }, timeout=15)
        response.raise_for_status()
        token = response.json()
        if not isinstance(token, dict) or not isinstance(token.get("access_token"), str) or not token["access_token"]:
            raise ValueError("Google token response did not include an access token")
        row.access_token_encrypted = encrypt_token(token["access_token"])
        rotated_refresh_token = token.get("refresh_token")
        if isinstance(rotated_refresh_token, str) and rotated_refresh_token:
            row.refresh_token_encrypted = encrypt_token(rotated_refresh_token)
        row.expires_at = now + timedelta(seconds=int(token.get("expires_in", 3600)))
        db.commit()
        return token["access_token"]
    except httpx.HTTPStatusError as exc:
        db.rollback()
        error_code = _google_refresh_error_code(exc.response)
        if error_code == "invalid_grant":
            detail = "Gmail refresh authorization was revoked or expired. Reconnect Gmail to send invitations."
        elif error_code in {"invalid_client", "unauthorized_client"}:
            detail = "Google OAuth client configuration was rejected. Check the Gmail OAuth client settings."
        else:
            detail = "Gmail authorization could not be refreshed. Reconnect Gmail or check Google OAuth configuration."
        raise HTTPException(status_code=403, detail=detail) from exc
    except (httpx.HTTPError, KeyError, ValueError, TypeError, AttributeError):
        db.rollback()
        raise HTTPException(status_code=403, detail="Gmail authorization expired or was revoked. Reconnect Gmail to send invitations.")



def send_gmail_message(db: Session, user_id: int, recipient: str, subject: str, body: str):
    row = db.query(GmailCredential).filter(
        GmailCredential.user_id == user_id
    ).first()

    if row is None:
        raise HTTPException(
            status_code=403,
            detail="Connect Gmail before sending sharing invitations."
        )

    token = _access_token(db, row)

    message = EmailMessage()
    message["To"] = recipient
    message["From"] = row.sender_email
    message["Subject"] = subject
    message.set_content(body)

    raw = base64.urlsafe_b64encode(
        message.as_bytes()
    ).decode("ascii").rstrip("=")

    try:
        response = httpx.post(
            GMAIL_SEND_URL,
            json={"raw": raw},
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            timeout=20,
        )

        if response.status_code == 401:
            raise HTTPException(
                status_code=403,
                detail="Gmail authorization expired or is invalid. Reconnect Gmail."
            )

        if response.status_code == 403:
            try:
                error = response.json().get("error", {})
                reasons = " ".join(
                    str(item.get("reason", ""))
                    for item in error.get("errors", [])
                    if isinstance(item, dict)
                ).lower()
                error_message = str(error.get("message", "")).lower()
            except (ValueError, AttributeError):
                reasons = ""
                error_message = ""

            if "scope" in error_message or "insufficient" in error_message:
                raise HTTPException(
                    status_code=403,
                    detail=(
                        "Gmail sending permission is missing. "
                        "Reconnect Gmail and approve the Gmail send permission."
                    )
                )

            if any(
                marker in reasons
                for marker in ("quota", "ratelimit", "rate_limit")
            ):
                raise HTTPException(
                    status_code=503,
                    detail="Gmail sending quota is exhausted. Try again later."
                )

            raise HTTPException(
                status_code=403,
                detail=(
                    "Gmail refused the invitation. Check Gmail API permissions "
                    "and reconnect Gmail if necessary."
                )
            )

        if response.status_code == 429:
            raise HTTPException(
                status_code=503,
                detail="Gmail sending quota is exhausted. Try again later."
            )

        try:
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code >= 500:
                raise GmailDeliveryUncertain() from exc
            raise HTTPException(
                status_code=502,
                detail="Gmail rejected the invitation request.",
            ) from exc

        try:
            result = response.json()
        except ValueError as exc:
            raise GmailDeliveryUncertain() from exc

        message_id = result.get("id")

        if not message_id:
            raise GmailDeliveryUncertain()

        return message_id

    except HTTPException:
        raise

    except httpx.TimeoutException as exc:
        raise GmailDeliveryUncertain() from exc

    except httpx.HTTPError as exc:
        raise GmailDeliveryUncertain() from exc
