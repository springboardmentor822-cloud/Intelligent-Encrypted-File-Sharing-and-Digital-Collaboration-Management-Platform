import hashlib
import hmac
import json
import logging
import os
import secrets
import time

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth import (
    get_current_user,
    get_db,
    hash_password,
    require_roles,
)
from app.database import redis_client
from app.email_service import send_email
from app.models import Folder, StoredFile, User
from app.routes_folders import hash_folder_password
from app.schemas import (
    RecoveryResetRequest,
    AccountRecoveryResetRequest,
    AccountRecoveryStartRequest,
    RecoveryResendRequest,
    RecoveryVerifyRequest,
)


router = APIRouter(prefix="/recovery", tags=["Password recovery"])
CHALLENGE_TTL_SECONDS = 600
RESEND_COOLDOWN_SECONDS = 60
MAX_VERIFY_ATTEMPTS = 5
MAX_RECOVERY_EMAILS_PER_WINDOW = 3
RECOVERY_EMAIL_WINDOW_SECONDS = 900
recovery_logger = logging.getLogger("trustshare.recovery")


_CONSUME_IF_UNCHANGED_SCRIPT = """
local current = redis.call('GET', KEYS[1])
if current and current == ARGV[1] then
    return redis.call('DEL', KEYS[1])
end
return 0
"""

_RECORD_FAILED_ATTEMPT_SCRIPT = """
local raw = redis.call('GET', KEYS[1])
if not raw then return -1 end
local ttl = redis.call('PTTL', KEYS[1])
if ttl <= 0 then
    redis.call('DEL', KEYS[1])
    return -1
end
local challenge = cjson.decode(raw)
local attempts = (tonumber(challenge.attempts) or 0) + 1
if attempts >= tonumber(ARGV[1]) then
    redis.call('DEL', KEYS[1])
    return 0
end
challenge.attempts = attempts
redis.call('SET', KEYS[1], cjson.encode(challenge), 'PX', ttl)
return attempts
"""

_RECOVERY_EMAIL_LIMIT_SCRIPT = """
local count = redis.call('INCR', KEYS[1])
local ttl = redis.call('TTL', KEYS[1])
if count == 1 or ttl < 0 then
    redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return count
"""


def _secret() -> str:
    secret = os.getenv("JWT_SECRET_KEY", "")
    if len(secret) < 32:
        raise HTTPException(
            status_code=503,
            detail="Password recovery is not configured.",
        )
    return secret


def mask_email(email: str) -> str:
    local, domain = email.split("@", 1)
    visible = local[:1]
    return f"{visible}{'*' * max(2, len(local) - 1)}@{domain}"


def _otp_digest(challenge_id: str, code: str) -> str:
    value = f"{challenge_id}:{code}".encode("utf-8")
    return hmac.new(
        _secret().encode("utf-8"),
        value,
        hashlib.sha256,
    ).hexdigest()


def _atomic_eval(script: str, *args):
    try:
        return int(redis_client.eval(script, 1, *args))
    except Exception as exc:
        recovery_logger.warning("Recovery state operation failed: %s", type(exc).__name__)
        raise HTTPException(status_code=503, detail="Password recovery is temporarily unavailable.")


def _consume_once(key: str, raw: str) -> bool:
    return _atomic_eval(_CONSUME_IF_UNCHANGED_SCRIPT, key, raw) == 1


def _failed_attempt(key: str) -> int:
    return _atomic_eval(_RECORD_FAILED_ATTEMPT_SCRIPT, key, MAX_VERIFY_ATTEMPTS)


def _reject_invalid_code(key: str, detail: str) -> None:
    attempts = _failed_attempt(key)
    if attempts == 0:
        raise HTTPException(status_code=429, detail="Too many incorrect codes. Request a new code.")
    if attempts < 0:
        raise HTTPException(status_code=400, detail="This recovery request has expired.")
    raise HTTPException(status_code=400, detail=detail)


def _limit_recovery_subject(scope: str, identity: str) -> None:
    digest = hmac.new(_secret().encode(), identity.encode(), hashlib.sha256).hexdigest()
    key = f"trustshare:recovery:limit:{scope}:{digest}"
    count = _atomic_eval(_RECOVERY_EMAIL_LIMIT_SCRIPT, key, RECOVERY_EMAIL_WINDOW_SECONDS)
    if count > MAX_RECOVERY_EMAILS_PER_WINDOW:
        raise HTTPException(status_code=429, detail="Too many recovery requests. Please try again later.", headers={"Retry-After": str(RECOVERY_EMAIL_WINDOW_SECONDS)})


def _send_otp(email: str, code: str) -> None:
    send_email(
        email,
        "Your TrustShare verification code",
        "Your TrustShare verification code is "
        f"{code}. It expires in 10 minutes and can be used once."
    )


def _resource(
    kind: str,
    resource_id: int,
    user: User,
    db: Session,
):
    if kind not in {"file", "folder"}:
        raise HTTPException(status_code=404, detail="Protected item not found.")
    model = Folder if kind == "folder" else StoredFile
    resource = (
        db.query(model)
        .filter(model.id == resource_id, model.owner_id == user.id)
        .first()
    )
    if resource is None:
        raise HTTPException(status_code=404, detail="Protected item not found.")
    return resource


def _new_challenge(kind: str, resource_id: int, user: User) -> dict:
    challenge_id = secrets.token_urlsafe(32)
    code = f"{secrets.randbelow(1_000_000):06d}"
    now = int(time.time())
    challenge = {
        "user_id": user.id,
        "kind": kind,
        "resource_id": resource_id,
        "otp_digest": _otp_digest(challenge_id, code),
        "attempts": 0,
        "created_at": now,
        "expires_at": now + CHALLENGE_TTL_SECONDS,
        "resend_at": now + RESEND_COOLDOWN_SECONDS,
    }
    redis_client.setex(
        f"trustshare:recovery:challenge:{challenge_id}",
        CHALLENGE_TTL_SECONDS,
        json.dumps(challenge),
    )
    return {"challenge_id": challenge_id, "code": code, **challenge}


def _load_challenge(challenge_id: str, user: User) -> tuple[dict, str]:
    raw = redis_client.get(
        f"trustshare:recovery:challenge:{challenge_id}"
    )
    if not raw:
        raise HTTPException(
            status_code=400,
            detail="This recovery request has expired.",
        )
    challenge = json.loads(raw)
    expires_at = challenge.get(
        "expires_at",
        challenge.get("created_at", int(time.time())) + CHALLENGE_TTL_SECONDS,
    )
    if int(time.time()) >= expires_at:
        redis_client.delete(f"trustshare:recovery:challenge:{challenge_id}")
        raise HTTPException(status_code=400, detail="This recovery request has expired.")
    if challenge["user_id"] != user.id:
        raise HTTPException(status_code=403, detail="Recovery request denied.")
    return challenge, raw


def _new_account_challenge(user_id: int | None, email: str) -> dict:
    challenge_id = secrets.token_urlsafe(32)
    code = f"{secrets.randbelow(1_000_000):06d}"
    now = int(time.time())
    challenge = {
        "user_id": user_id,
        "email": email,
        "kind": "account",
        "otp_digest": _otp_digest(challenge_id, code),
        "attempts": 0,
        "created_at": now,
        "expires_at": now + CHALLENGE_TTL_SECONDS,
        "resend_at": now + RESEND_COOLDOWN_SECONDS,
    }
    redis_client.setex(
        f"trustshare:recovery:challenge:{challenge_id}",
        CHALLENGE_TTL_SECONDS,
        json.dumps(challenge),
    )
    return {"challenge_id": challenge_id, "code": code, **challenge}


def _account_challenge(challenge_id: str) -> tuple[dict, str]:
    raw = redis_client.get(
        f"trustshare:recovery:challenge:{challenge_id}"
    )
    if not raw:
        raise HTTPException(
            status_code=400,
            detail="This recovery request has expired.",
        )
    challenge = json.loads(raw)
    expires_at = challenge.get(
        "expires_at",
        challenge.get("created_at", int(time.time())) + CHALLENGE_TTL_SECONDS,
    )
    if int(time.time()) >= expires_at:
        redis_client.delete(f"trustshare:recovery:challenge:{challenge_id}")
        raise HTTPException(status_code=400, detail="This recovery request has expired.")
    if challenge.get("kind") != "account":
        raise HTTPException(status_code=403, detail="Recovery request denied.")
    return challenge, raw


@router.post("/account/start")
def start_account_recovery(
    data: AccountRecoveryStartRequest,
    db: Session = Depends(get_db),
):
    email = str(data.email).strip().lower()
    _limit_recovery_subject("account", email)
    user = db.query(User).filter(User.email == email).first()

    recoverable_user = user is not None and bool(user.hashed_password)
    # Return the same response shape for unknown and OAuth-only accounts to
    # avoid exposing account existence through the recovery endpoint.
    challenge = _new_account_challenge(
        user.id if recoverable_user else None,
        user.email if recoverable_user else email,
    )
    if recoverable_user:
        try:
            _send_otp(user.email, challenge["code"])
        except HTTPException:
            redis_client.delete(
                f"trustshare:recovery:challenge:{challenge['challenge_id']}"
            )
            raise

    return {
        "message": (
            "If that account can use password recovery, a verification "
            "code has been sent."
        ),
        "challenge_id": challenge["challenge_id"],
        "masked_email": mask_email(challenge["email"]),
        "resend_after": RESEND_COOLDOWN_SECONDS,
    }


@router.post("/account/resend")
def resend_account_code(
    data: RecoveryResendRequest,
):
    challenge, raw = _account_challenge(data.challenge_id)
    _limit_recovery_subject("account", challenge["email"])
    now = int(time.time())
    if now < challenge["resend_at"]:
        raise HTTPException(
            status_code=429,
            detail=(
                f"Please wait {challenge['resend_at'] - now} seconds "
                "before requesting another code."
            ),
        )

    if not _consume_once(f"trustshare:recovery:challenge:{data.challenge_id}", raw):
        raise HTTPException(status_code=400, detail="This recovery request has expired or was already used.")
    replacement = _new_account_challenge(
        challenge["user_id"],
        challenge["email"],
    )
    if challenge["user_id"] is not None:
        try:
            _send_otp(challenge["email"], replacement["code"])
        except HTTPException:
            redis_client.delete(
                f"trustshare:recovery:challenge:{replacement['challenge_id']}"
            )
            raise
    return {
        "challenge_id": replacement["challenge_id"],
        "masked_email": mask_email(challenge["email"]),
        "resend_after": RESEND_COOLDOWN_SECONDS,
    }


@router.post("/account/verify")
def verify_account_code(
    data: RecoveryVerifyRequest,
):
    challenge, raw = _account_challenge(data.challenge_id)
    key = f"trustshare:recovery:challenge:{data.challenge_id}"
    if not data.code.isdigit() or len(data.code) != 6:
        _reject_invalid_code(key, "Enter the 6-digit code.")

    if challenge["user_id"] is None or not hmac.compare_digest(
        challenge["otp_digest"],
        _otp_digest(data.challenge_id, data.code),
    ):
        _reject_invalid_code(key, "Incorrect verification code.")

    if not _consume_once(f"trustshare:recovery:challenge:{data.challenge_id}", raw):
        raise HTTPException(status_code=400, detail="This recovery request has expired or was already used.")
    reset_token = secrets.token_urlsafe(32)
    redis_client.setex(
        f"trustshare:recovery:authorization:{reset_token}",
        CHALLENGE_TTL_SECONDS,
        json.dumps({"user_id": challenge["user_id"], "kind": "account"}),
    )
    return {"reset_token": reset_token, "expires_in": CHALLENGE_TTL_SECONDS}


@router.post("/account/reset")
def reset_account_password(
    data: AccountRecoveryResetRequest,
    db: Session = Depends(get_db),
):
    key = f"trustshare:recovery:authorization:{data.reset_token}"
    raw = redis_client.get(key)
    if not raw:
        raise HTTPException(
            status_code=400,
            detail="This recovery authorization has expired or was already used.",
        )

    authorization = json.loads(raw)
    if authorization.get("kind") != "account":
        raise HTTPException(status_code=403, detail="Recovery request denied.")

    user = db.query(User).filter(User.id == authorization["user_id"]).first()
    if user is None:
        raise HTTPException(status_code=400, detail="Account not found.")

    if not _consume_once(key, raw):
        raise HTTPException(status_code=400, detail="This recovery authorization has expired or was already used.")
    user.hashed_password = hash_password(data.password)
    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        recovery_logger.warning("Account recovery database commit failed: %s", type(exc).__name__)
        raise HTTPException(status_code=503, detail="Password recovery could not be completed. Start a new recovery request.")
    return {"message": "Password reset successfully."}


@router.post("/{kind}/{resource_id}/start")
def start_recovery(
    kind: str,
    resource_id: int,
    current_user: User = Depends(require_roles("admin", "user")),
    db: Session = Depends(get_db),
):
    if kind not in {"file", "folder"}:
        raise HTTPException(status_code=404, detail="Recovery target not found.")

    _resource(kind, resource_id, current_user, db)
    _limit_recovery_subject("resource", str(current_user.id))
    challenge = _new_challenge(kind, resource_id, current_user)
    try:
        _send_otp(current_user.email, challenge["code"])
    except HTTPException:
        redis_client.delete(
            f"trustshare:recovery:challenge:{challenge['challenge_id']}"
        )
        raise

    return {
        "challenge_id": challenge["challenge_id"],
        "masked_email": mask_email(current_user.email),
        "resend_after": RESEND_COOLDOWN_SECONDS,
    }


@router.post("/resend")
def resend_code(
    data: RecoveryResendRequest,
    current_user: User = Depends(require_roles("admin", "user")),
):
    challenge, raw = _load_challenge(data.challenge_id, current_user)
    _limit_recovery_subject("resource", str(current_user.id))
    now = int(time.time())
    if now < challenge["resend_at"]:
        raise HTTPException(
            status_code=429,
            detail=f"Please wait {challenge['resend_at'] - now} seconds before requesting another code.",
        )

    if not _consume_once(f"trustshare:recovery:challenge:{data.challenge_id}", raw):
        raise HTTPException(status_code=400, detail="This recovery request has expired or was already used.")
    replacement = _new_challenge(
        challenge["kind"],
        challenge["resource_id"],
        current_user,
    )
    try:
        _send_otp(current_user.email, replacement["code"])
    except HTTPException:
        redis_client.delete(
            f"trustshare:recovery:challenge:{replacement['challenge_id']}"
        )
        raise
    return {
        "challenge_id": replacement["challenge_id"],
        "masked_email": mask_email(current_user.email),
        "resend_after": RESEND_COOLDOWN_SECONDS,
    }


@router.post("/verify")
def verify_code(
    data: RecoveryVerifyRequest,
    current_user: User = Depends(require_roles("admin", "user")),
):
    challenge, raw = _load_challenge(data.challenge_id, current_user)
    key = f"trustshare:recovery:challenge:{data.challenge_id}"
    if not data.code.isdigit() or len(data.code) != 6:
        _reject_invalid_code(key, "Enter the 6-digit code.")

    if not hmac.compare_digest(
        challenge["otp_digest"],
        _otp_digest(data.challenge_id, data.code),
    ):
        _reject_invalid_code(key, "Incorrect verification code.")

    if not _consume_once(key, raw):
        raise HTTPException(status_code=400, detail="This recovery request has expired or was already used.")
    reset_token = secrets.token_urlsafe(32)
    redis_client.setex(
        f"trustshare:recovery:authorization:{reset_token}",
        CHALLENGE_TTL_SECONDS,
        json.dumps(
            {
                "user_id": current_user.id,
                "kind": challenge["kind"],
                "resource_id": challenge["resource_id"],
            }
        ),
    )
    return {"reset_token": reset_token, "expires_in": CHALLENGE_TTL_SECONDS}


@router.post("/reset")
def reset_password(
    data: RecoveryResetRequest,
    current_user: User = Depends(require_roles("admin", "user")),
    db: Session = Depends(get_db),
):
    key = f"trustshare:recovery:authorization:{data.reset_token}"
    raw = redis_client.get(key)
    if not raw:
        raise HTTPException(
            status_code=400,
            detail="This recovery authorization has expired or was already used.",
        )

    authorization = json.loads(raw)
    if authorization["user_id"] != current_user.id:
        raise HTTPException(status_code=403, detail="Recovery request denied.")

    resource = _resource(
        authorization["kind"],
        authorization["resource_id"],
        current_user,
        db,
    )
    if not _consume_once(key, raw):
        raise HTTPException(status_code=400, detail="This recovery authorization has expired or was already used.")
    resource.password_hash = hash_folder_password(data.password)
    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        recovery_logger.warning("Resource recovery database commit failed: %s", type(exc).__name__)
        raise HTTPException(status_code=503, detail="Password recovery could not be completed. Start a new recovery request.")
    return {"message": "Password reset successfully."}
