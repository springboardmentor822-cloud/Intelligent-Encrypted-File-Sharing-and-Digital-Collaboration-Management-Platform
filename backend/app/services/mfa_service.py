import pyotp

from app.core.redis_client import get_redis


def new_secret() -> str:
    return pyotp.random_base32()


def provisioning_uri(secret: str, email: str) -> str:
    return pyotp.TOTP(secret).provisioning_uri(name=email, issuer_name="TrustShare")


def verify_code(secret: str, code: str, user_id) -> bool:
    """Validates a TOTP code (±30s drift) and rejects replays of an already-used code."""
    code = (code or "").strip().replace(" ", "")
    if not pyotp.TOTP(secret).verify(code, valid_window=1):
        return False
    first_use = get_redis().set(f"mfa_used:{user_id}:{code}", 1, nx=True, ex=90)
    return bool(first_use)
