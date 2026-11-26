
import logging
from threading import Lock

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth import ROLE_SUPER_ADMIN, require_roles
from app.activity import record_activity
from app.rotate_file_keys import rotate_file_keys

logger = logging.getLogger("trustshare.key_rotation")
rotation_lock = Lock()

router = APIRouter(
    prefix="/admin/key-rotation",
    tags=["Super Admin Key Rotation"],
    dependencies=[Depends(require_roles(ROLE_SUPER_ADMIN))],
)


class RotationConfirmation(BaseModel):
    confirm: bool


@router.get("/preview")
def preview_key_rotation():
    try:
        return {
            "mode": "preview",
            **rotate_file_keys(apply=False),
        }
    except Exception as exc:
        logger.exception("Key rotation preview failed")
        raise HTTPException(
            status_code=503,
            detail="Unable to preview key rotation. Check server configuration.",
        ) from exc


@router.post("/apply")
def apply_key_rotation(
    request: RotationConfirmation,
    current_user=Depends(require_roles(ROLE_SUPER_ADMIN)),
):
    if request.confirm is not True:
        raise HTTPException(
            status_code=400,
            detail="Explicit confirmation is required.",
        )

    if not rotation_lock.acquire(blocking=False):
        raise HTTPException(
            status_code=409,
            detail="A key rotation is already running. Try again later.",
        )

    try:
        preview = rotate_file_keys(apply=False)

        if preview["pending"] == 0:
            return {
                "mode": "apply",
                **preview,
                "message": "No files need key rotation.",
            }

        result = rotate_file_keys(apply=True)

        record_activity(
            "encryption_key_rotation",
            user_id=current_user.id,
            username=getattr(current_user, "full_name", None),
            details=(
                f"Key rotation completed. Active key: "
                f"{result['active_key_id']}; "
                f"files rewrapped: {result['rewrapped']}"
            ),
            severity="high",
        )

        return {
            "mode": "apply",
            **result,
            "message": "Key rotation completed.",
        }

    except Exception as exc:
        logger.exception("Key rotation failed")

        try:
            record_activity(
                "encryption_key_rotation_failed",
                user_id=getattr(current_user, "id", None),
                username=getattr(current_user, "full_name", None),
                details="Key rotation failed. Check server logs.",
                severity="high",
            )
        except Exception:
            logger.exception("Could not record key rotation failure")

        raise HTTPException(
            status_code=503,
            detail="Key rotation failed. Check server logs and key configuration.",
        ) from exc

    finally:
        rotation_lock.release()
