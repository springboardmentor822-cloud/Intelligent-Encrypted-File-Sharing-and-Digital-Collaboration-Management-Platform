
import os

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.auth import get_current_user, get_db
from app.models import StoredFile, User
from app.services.encryption_service import keyring_configured


router = APIRouter(prefix="/security", tags=["Security"])


@router.get("/status")
def security_status(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return safe feature metadata without exposing provider secrets."""
    del current_user

    google_configured = bool(
        os.getenv("GOOGLE_CLIENT_ID") and os.getenv("GOOGLE_CLIENT_SECRET")
    )
    microsoft_configured = bool(
        os.getenv("MICROSOFT_CLIENT_ID") and os.getenv("MICROSOFT_CLIENT_SECRET")
    )
    encryption_configured = keyring_configured()

    legacy_file_count = (
        db.query(StoredFile)
        .filter(StoredFile.encryption_version == 0)
        .count()
    )

    storage_backend = os.getenv(
        "FILE_STORAGE_BACKEND", "local"
    ).strip().lower()

    cloud_configured = False
    cloud_dependency_available = True
    cloud_details = ""

    if storage_backend == "azure":
        account_configured = bool(
            os.getenv("AZURE_STORAGE_ACCOUNT_URL", "").strip()
            or os.getenv("AZURE_STORAGE_ACCOUNT_NAME", "").strip()
        )
        container_configured = bool(
            os.getenv("AZURE_STORAGE_CONTAINER", "").strip()
        )
        cloud_configured = account_configured and container_configured

        try:
            import azure.identity  # noqa: F401
            import azure.storage.blob  # noqa: F401
        except ImportError:
            cloud_dependency_available = False

        if not cloud_configured:
            cloud_details = (
                "Configure AZURE_STORAGE_ACCOUNT_NAME (or "
                "AZURE_STORAGE_ACCOUNT_URL) and AZURE_STORAGE_CONTAINER."
            )
        elif not cloud_dependency_available:
            cloud_details = (
                "Install azure-identity and azure-storage-blob in the "
                "backend environment."
            )
        else:
            cloud_details = (
                "Azure Blob Storage is selected for new uploads. "
                "Azure authentication and private-container access have "
                "been verified separately; runtime operations still depend "
                "on the configured identity and blob permissions."
            )

    elif storage_backend == "s3":
        cloud_configured = bool(
            os.getenv("S3_BUCKET", "").strip()
            and os.getenv("AWS_REGION", "").strip()
        )

        try:
            import boto3  # noqa: F401
        except ImportError:
            cloud_dependency_available = False

        if not cloud_configured:
            cloud_details = (
                "Configure FILE_STORAGE_BACKEND=s3, S3_BUCKET, "
                "AWS_REGION, and AWS credentials or an appropriate role."
            )
        elif not cloud_dependency_available:
            cloud_details = "Install boto3 to use Amazon S3."
        else:
            cloud_details = (
                "Amazon S3 is selected for new uploads. Runtime access "
                "depends on the configured AWS credentials or role."
            )

    else:
        cloud_details = (
            "Local storage is selected. Cloud storage is not enabled "
            "for new uploads."
        )

    if storage_backend == "local":
        cloud_status = "Not selected"
    elif not cloud_configured:
        cloud_status = "Configuration required"
    elif not cloud_dependency_available:
        cloud_status = "Dependency required"
    else:
        cloud_status = "Configured"

    return {
        "features": {
            "file_encryption": {
                "status": (
                    "Active"
                    if encryption_configured and legacy_file_count == 0
                    else "Partial"
                    if encryption_configured
                    else "Configuration required"
                ),
                "details": (
                    f"New uploads use AES-256-GCM envelope encryption. "
                    f"{legacy_file_count} legacy file(s) still need "
                    "encryption migration."
                    if encryption_configured
                    else "Set FILE_KEY_ENCRYPTION_KEY before encrypted "
                    "uploads can be stored."
                ),
            },
            "cloud_storage": {
                "status": cloud_status,
                "details": cloud_details,
            },
            "https_tls": {
                "status": (
                    "Active"
                    if request.url.scheme == "https"
                    else "Deployment dependent"
                ),
                "details": (
                    "TLS is only verified for this request when its ASGI "
                    "URL scheme is HTTPS. Configure and trust the reverse "
                    "proxy explicitly in production."
                ),
            },
            "jwt": {
                "status": "Active",
                "details": (
                    "Bearer tokens are signature-validated with a "
                    "configured algorithm and expiry. Access-token "
                    "lifetime is controlled by ACCESS_TOKEN_EXPIRE_MINUTES."
                ),
            },
            "oauth": {
                "status": (
                    "Active"
                    if google_configured or microsoft_configured
                    else "Configuration required"
                ),
                "details": (
                    "Configured providers: "
                    + (
                        ", ".join(
                            name
                            for name, enabled in (
                                ("Google", google_configured),
                                ("Microsoft", microsoft_configured),
                            )
                            if enabled
                        )
                        or "none"
                    )
                ),
                "providers": {
                    "google": google_configured,
                    "microsoft": microsoft_configured,
                },
            },
            "rbac": {
                "status": "Active",
                "details": (
                    "Protected routes enforce backend roles; file and "
                    "folder routes separately check ownership, active "
                    "grants, and protected-folder unlocks."
                ),
            },
            "temporary_links": {
                "status": "Active",
                "details": (
                    "File and folder share grants can have a UTC expiration "
                    "time and are checked on every link access; owners can "
                    "revoke them before expiry."
                ),
            },
            "download_tracking": {
                "status": "Partial",
                "details": (
                    "Download events are recorded when a download response "
                    "is prepared. The activity store is best effort and "
                    "does not confirm client receipt."
                ),
            },
            "audit_logging": {
                "status": "Partial",
                "details": (
                    "Server-side activity events are written to MongoDB "
                    "on a best-effort basis; storage failures are logged "
                    "by the service."
                ),
            },
            "secure_tokens": {
                "status": "Active",
                "details": (
                    "Folder-unlock and recovery tokens use Python's "
                    "cryptographically secure secrets.token_urlsafe "
                    "generator."
                ),
            },
            "key_rotation": {
                "status": "Partial",
                "details": (
                    "Versioned wrapping-key IDs are stored with encrypted "
                    "file metadata. Rotation requires keeping old keys in "
                    "FILE_KEY_ENCRYPTION_KEYS until all file DEKs have "
                    "been rewrapped."
                ),
            },
        }
    }
