
import os
import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.activity import record_activity
from app.auth import ROLE_SUPER_ADMIN, get_db, require_roles
from app.models import FileShare, FolderShare, GmailCredential, StoredFile, User
from app.platform_settings import (
    DEFAULT_ALLOWED_EXTENSIONS,
    deployment_limits,
    get_platform_settings,
    save_platform_settings,
)
from app.routes_admin import get_system_health
from app.services.encryption_service import keyring_configured


router = APIRouter(
    prefix="/admin/settings",
    tags=["Super Admin Settings"],
    dependencies=[Depends(require_roles(ROLE_SUPER_ADMIN))],
)


class PlatformSettingsUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    max_upload_size_bytes: int | None = Field(default=None, ge=1_048_576)
    per_user_storage_quota_bytes: int | None = Field(default=None, ge=1_048_576)
    auth_rate_limit_attempts: int | None = Field(default=None, ge=1)
    allowed_file_extensions: list[str] | None = Field(
        default=None, min_length=1, max_length=64
    )

    @field_validator("allowed_file_extensions")
    @classmethod
    def normalize_extensions(cls, value):
        if value is None:
            return value

        normalized = [item.strip().lower() for item in value]

        if any(
            not re.fullmatch(r"\.[a-z0-9]{1,12}", item)
            for item in normalized
        ):
            raise ValueError("File extensions must use the format .ext.")

        if len(set(normalized)) != len(normalized):
            raise ValueError("File extensions must be unique.")

        return normalized


def _settings_document(db: Session):
    effective = get_platform_settings(db)
    limits = deployment_limits()

    backend = os.getenv("FILE_STORAGE_BACKEND", "local").strip().lower()

    if backend == "local":
        storage_status = "Active (private local storage)"

    elif backend == "s3":
        s3_config_present = bool(
            os.getenv("S3_BUCKET", "").strip()
            and os.getenv("AWS_REGION", "").strip()
        )

        try:
            import boto3  # noqa: F401

            s3_dependency = True
        except ImportError:
            s3_dependency = False

        if not s3_config_present:
            storage_status = "Configuration required"
        elif not s3_dependency:
            storage_status = "Dependency required"
        else:
            storage_status = "Configured; bucket access not probed"

    elif backend == "azure":
        azure_account_present = bool(
            os.getenv("AZURE_STORAGE_ACCOUNT_URL", "").strip()
            or os.getenv("AZURE_STORAGE_ACCOUNT_NAME", "").strip()
        )
        azure_container_present = bool(
            os.getenv("AZURE_STORAGE_CONTAINER", "").strip()
        )

        try:
            import azure.identity  # noqa: F401
            import azure.storage.blob  # noqa: F401

            azure_dependency = True
        except ImportError:
            azure_dependency = False

        if not azure_account_present or not azure_container_present:
            storage_status = "Configuration required"
        elif not azure_dependency:
            storage_status = "Dependency required"
        else:
            storage_status = "Configured; Azure access not probed"

    else:
        storage_status = "Invalid deployment configuration"

    smtp_configured = bool(
        os.getenv("SMTP_HOST", "").strip()
        and os.getenv("SMTP_FROM", "").strip()
    )

    legacy_count = (
        db.query(StoredFile)
        .filter(StoredFile.encryption_version == 0)
        .count()
    )
    recent_email_failures = (
        db.query(FileShare)
        .filter(FileShare.email_status == "failed")
        .count()
    )
    gmail_connections = db.query(GmailCredential).count()
    activity_tracking = "Best effort (MongoDB)"

    return {
        "settings": effective,
        "limits": {
            "max_upload_size_bytes": limits["max_upload_size_bytes"],
            "per_user_storage_quota_bytes": limits[
                "per_user_storage_quota_bytes"
            ],
            "auth_rate_limit_attempts": limits["auth_rate_limit_attempts"],
            "allowed_file_extensions": limits["allowed_file_extensions"],
        },
        "security": {
            "password_min_length": 8,
            "password_max_length": 128,
            "password_policy_status": (
                "Enforced by registration and password-reset validation"
            ),
            "session_timeout_minutes": int(
                os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30")
            ),
            "rate_limit_window_seconds": int(
                os.getenv("AUTH_RATE_LIMIT_WINDOW_SECONDS", "300")
            ),
            "mfa_status": "Not supported by the current authentication flow",
            "encryption_algorithm": "AES-256-GCM envelope encryption",
            "encryption_status": (
                "Configured"
                if keyring_configured()
                else "Configuration required"
            ),
            "legacy_unencrypted_file_count": legacy_count,
        },
        "storage": {
            "provider": backend,
            "provider_status": storage_status,
            "usage_bytes": int(
                db.query(
                    func.coalesce(func.sum(StoredFile.size_bytes), 0)
                ).scalar()
                or 0
            ),
            "file_count": int(db.query(StoredFile).count()),
            "quota_scope": (
                "Per-account quota applies to existing and new accounts; "
                "the schema has no separate per-user quota field."
            ),
        },
        "sharing": {
            "expiration_supported": True,
            "default_expiration": (
                "Not configured; owners choose expiration per share"
            ),
            "maximum_duration": "No application-wide maximum is enforced",
            "public_links": (
                "Not supported; shared resources require an authenticated account"
            ),
            "password_protection": (
                "Optional resource passwords are supported; there is no "
                "global required-password policy"
            ),
            "revocation": "Supported; owners can revoke file and folder shares",
            "share_count": int(
                db.query(FileShare).count()
                + db.query(FolderShare).count()
            ),
        },
        "email": {
            "smtp_status": (
                "Configured (credentials are held by the backend)"
                if smtp_configured
                else "Not configured"
            ),
            "gmail_sender_connections": gmail_connections,
            "failed_file_share_notifications": recent_email_failures,
            "delivery_note": (
                "Configured indicates required SMTP host and sender values "
                "exist; live provider delivery is not probed here."
            ),
        },
        "users": {
            "registration_policy": (
                "Enabled; the registration endpoint is open to new accounts"
            ),
            "google_sign_in": (
                "Configured"
                if (
                    os.getenv("GOOGLE_CLIENT_ID")
                    and os.getenv("GOOGLE_CLIENT_SECRET")
                )
                else "Not configured"
            ),
            "default_role": "user (assigned by backend registration logic)",
            "account_restrictions": (
                "No global account-restriction policy is implemented"
            ),
        },
        "audit": {
            "retention": (
                "Not supported; audit events have no configured retention job"
            ),
            "activity_tracking": activity_tracking,
            "application_version": "1.0.0",
            "system_health": get_system_health()["services"],
            "backup_status": "Not supported by the application",
        },
    }


@router.get("")
def read_platform_settings(db: Session = Depends(get_db)):
    return _settings_document(db)


@router.patch("")
def update_platform_settings(
    data: PlatformSettingsUpdate,
    current_user: User = Depends(require_roles(ROLE_SUPER_ADMIN)),
    db: Session = Depends(get_db),
):
    changes = data.model_dump(exclude_unset=True)

    if not changes:
        raise HTTPException(
            status_code=422,
            detail="Provide at least one setting to update.",
        )

    if any(value is None for value in changes.values()):
        raise HTTPException(
            status_code=422,
            detail="Editable settings cannot be null.",
        )

    limits = deployment_limits()

    for field in (
        "max_upload_size_bytes",
        "per_user_storage_quota_bytes",
        "auth_rate_limit_attempts",
    ):
        if field in changes and changes[field] > limits[field]:
            raise HTTPException(
                status_code=422,
                detail=(
                    f"{field} cannot exceed its deployment-configured ceiling."
                ),
            )

    if (
        "auth_rate_limit_attempts" in changes
        and changes["auth_rate_limit_attempts"]
        > get_platform_settings(db)["auth_rate_limit_attempts"]
    ):
        raise HTTPException(
            status_code=422,
            detail=(
                "The authentication attempt limit can only be lowered "
                "from its current saved value."
            ),
        )

    if "allowed_file_extensions" in changes:
        extensions = set(changes["allowed_file_extensions"])

        if not extensions.issubset(DEFAULT_ALLOWED_EXTENSIONS):
            raise HTTPException(
                status_code=422,
                detail=(
                    "The platform may restrict extensions but cannot add "
                    "types outside the deployment allowlist."
                ),
            )

    try:
        save_platform_settings(db, changes, current_user.id)
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Unable to save platform settings.",
        ) from exc

    record_activity(
        "platform_settings_updated",
        current_user.id,
        username=getattr(current_user, "full_name", None),
        details="Updated settings: " + ", ".join(sorted(changes)),
    )

    return _settings_document(db)
