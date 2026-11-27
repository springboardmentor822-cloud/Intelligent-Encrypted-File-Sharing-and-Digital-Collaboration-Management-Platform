"""Pure helpers for audit records: status derivation and human-readable descriptions."""

FAILED_SUFFIXES = ("_rejected", "_failed", "_denied", "_blocked")
FAILED_ACTIONS = {"access.unauthorized", "access.blocked"}

TEMPLATES = {
    "auth.login": "Signed in", "auth.login_failed": "Failed sign-in attempt", "auth.logout": "Signed out",
    "auth.register": "Registered an account", "auth.register_oauth": "Registered with an OAuth provider",
    "auth.password_changed": "Changed password", "auth.password_reset": "Reset password",
    "auth.password_reset_requested": "Requested a password reset",
    "auth.mfa_enabled": "Turned on two-factor authentication", "auth.mfa_disabled": "Turned off two-factor authentication",
    "auth.session_revoked": "Signed out another session",
    "file.upload": "Uploaded a file", "file.upload_rejected": "Upload was blocked", "file.new_version": "Uploaded a new version",
    "file.download": "Downloaded a file", "file.view": "Viewed a file", "file.update": "Updated a file",
    "file.trash": "Moved a file to the trash", "file.restore": "Restored a file", "file.delete_permanent": "Deleted a file permanently",
    "folder.create": "Created a folder", "folder.update": "Updated a folder", "folder.delete": "Deleted a folder",
    "share.link_created": "Created a share link", "share.link_revoked": "Revoked a share link",
    "share.link_opened": "Share link was opened", "share.link_download": "File downloaded through a share link",
    "share.link_expired": "Share link expired", "share.user_shared": "Shared a file with a person",
    "share.user_revoked": "Removed a person's access",
    "access.unauthorized": "Unauthorized access attempt", "access.blocked": "Request was blocked",
    "admin.user_created": "Admin created a user", "admin.user_updated": "Admin updated a user",
    "admin.user_unlocked": "Admin cleared a sign-in lockout", "admin.mfa_reset": "Admin reset two-factor authentication",
    "admin.file_deleted": "Admin deleted a file", "admin.audit_export": "Exported the audit log",
    "keys.rotated": "Encryption keys were rotated", "security.event_status": "Security event status changed",
    "notification.broadcast": "Sent a notification broadcast",
}


def derive_status(action: str) -> str:
    """'failed' for rejected/blocked/denied style actions, otherwise 'success'."""
    return "failed" if action in FAILED_ACTIONS or action.endswith(FAILED_SUFFIXES) else "success"


def category_of(action: str) -> str:
    return action.split(".", 1)[0] if action else "other"


def describe(action: str, details: dict | None = None) -> str:
    d = details or {}
    base = TEMPLATES.get(action) or action.replace(".", " ").replace("_", " ").capitalize()
    extras = []
    if d.get("name"):
        extras.append(str(d["name"]))
    if d.get("with"):
        extras.append(f"with {d['with']}")
    if d.get("email") and action.startswith("auth."):
        extras.append(str(d["email"]))
    if d.get("via"):
        extras.append(f"via {d['via']}")
    if d.get("reason"):
        extras.append(str(d["reason"]).replace("_", " "))
    return base + (": " + ", ".join(extras) if extras else "")
