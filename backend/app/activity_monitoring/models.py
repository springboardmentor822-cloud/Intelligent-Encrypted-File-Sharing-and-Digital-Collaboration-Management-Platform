from enum import Enum
from typing import Optional, Dict, Any
from datetime import datetime, timezone

class ActivityType(str, Enum):
    LOGIN = "login"
    LOGOUT = "logout"
    LOGIN_FAILED = "login_failed"
    FILE_UPLOAD = "upload"
    FILE_DOWNLOAD = "download"
    FILE_ACCESS = "file_access"
    SHARE_CREATE = "share_create"
    SHARE_EXPIRE = "share_expire"
    SHARE_REVOKE = "share_revoke"
    UNAUTHORIZED_ACCESS = "unauthorized_access"
    ADMIN_ACTION = "admin_action"
    USER_UPDATE = "user_update"


class ActivityStatus(str, Enum):
    SUCCESSFUL = "successful"
    FAILED = "failed"


def normalize_activity_type(action: str) -> str:
    """
    Maps action strings to standard system activity types.
    """
    act = (action or "").upper()
    if "LOGIN_FAILED" in act or "AUTH_FAILED" in act:
        return ActivityType.LOGIN.value
    if "LOGIN" in act:
        return ActivityType.LOGIN.value
    if "LOGOUT" in act:
        return ActivityType.LOGOUT.value
    if "UPLOAD" in act:
        return ActivityType.FILE_UPLOAD.value
    if "DOWNLOAD" in act:
        return ActivityType.FILE_DOWNLOAD.value
    if "PREVIEW" in act or "ACCESS" in act and "DENIED" not in act and "UNAUTHORIZED" not in act:
        return ActivityType.FILE_ACCESS.value
    if "SHARE_REVOKE" in act or "REVOKED" in act:
        return ActivityType.SHARE_REVOKE.value
    if "SHARE_EXPIRE" in act or "EXPIRED" in act:
        return ActivityType.SHARE_EXPIRE.value
    if "SHARE" in act:
        return ActivityType.SHARE_CREATE.value
    if "DENIED" in act or "UNAUTHORIZED" in act or "REJECTED" in act or "FAILED" in act:
        return ActivityType.UNAUTHORIZED_ACCESS.value
    return ActivityType.ADMIN_ACTION.value


def normalize_activity_status(action: str, explicit_status: Optional[str] = None) -> str:
    """
    Derives 'successful' or 'failed' status based on explicit parameter or action string.
    """
    if explicit_status:
        s = explicit_status.lower()
        if s in ["success", "successful", "ok", "true"]:
            return ActivityStatus.SUCCESSFUL.value
        if s in ["failed", "fail", "denied", "error", "false"]:
            return ActivityStatus.FAILED.value

    act = (action or "").upper()
    if any(neg in act for neg in ["FAILED", "DENIED", "REJECTED", "ERROR", "BLOCKED", "UNAUTHORIZED"]):
        return ActivityStatus.FAILED.value
    return ActivityStatus.SUCCESSFUL.value

