"""Persistent platform policy values with deployment configuration ceilings."""

import json
import logging
import os
from sqlalchemy.orm import sessionmaker

from app.database import mysql_engine
from app.models import PlatformSetting


logger = logging.getLogger("trustshare.platform_settings")
SettingsSession = sessionmaker(bind=mysql_engine, autoflush=False, autocommit=False)

DEFAULT_ALLOWED_EXTENSIONS = frozenset(
    extension.strip().lower()
    for extension in os.getenv(
        "ALLOWED_FILE_EXTENSIONS",
        ".pdf,.doc,.docx,.txt,.ppt,.pptx,.xls,.xlsx,.csv,.png,.jpg,.jpeg,.gif,.webp,.svg,.zip",
    ).split(",")
    if extension.strip()
)


def _env_int(name: str, default: int) -> int:
    try:
        return max(1, int(os.getenv(name, str(default))))
    except (TypeError, ValueError):
        return default


def deployment_limits() -> dict:
    return {
        "max_upload_size_bytes": _env_int("MAX_UPLOAD_SIZE_BYTES", 100 * 1024 * 1024),
        "per_user_storage_quota_bytes": _env_int("USER_STORAGE_QUOTA_BYTES", 4 * 1024 * 1024 * 1024),
        "auth_rate_limit_attempts": _env_int("AUTH_RATE_LIMIT_MAX_ATTEMPTS", 5),
        "allowed_file_extensions": sorted(DEFAULT_ALLOWED_EXTENSIONS),
    }


def get_platform_settings(db=None) -> dict:
    """Return effective values, falling back safely to deployment config."""
    values = deployment_limits()
    if db is not None:
        try:
            rows = db.query(PlatformSetting).all()
            for row in rows:
                if row.setting_key not in values:
                    continue
                try:
                    value = json.loads(row.value_json)
                except (TypeError, ValueError):
                    logger.warning("Ignoring invalid persisted platform setting: key=%s", row.setting_key)
                    continue
                values[row.setting_key] = value
        except Exception as exc:
            logger.warning("Could not load persisted platform settings: error_type=%s", type(exc).__name__)
    return _validated_effective(values)


def get_persisted_setting(key: str, fallback):
    """Read one setting for code paths that do not have a request DB session."""
    db = SettingsSession()
    try:
        row = db.query(PlatformSetting).filter(PlatformSetting.setting_key == key).first()
        if row is None:
            return fallback
        value = json.loads(row.value_json)
        candidate = {**deployment_limits(), key: value}
        return _validated_effective(candidate).get(key, fallback)
    except Exception as exc:
        logger.warning("Could not read runtime platform setting: key=%s error_type=%s", key, type(exc).__name__)
        return fallback
    finally:
        db.close()


def _validated_effective(values: dict) -> dict:
    limits = deployment_limits()
    result = dict(limits)
    for key in ("max_upload_size_bytes", "per_user_storage_quota_bytes", "auth_rate_limit_attempts"):
        value = values.get(key)
        try:
            number = int(value)
        except (TypeError, ValueError):
            continue
        if number > 0 and number <= limits[key]:
            result[key] = number
    extensions = values.get("allowed_file_extensions")
    if isinstance(extensions, list) and extensions:
        normalized = {item.lower() for item in extensions if isinstance(item, str)}
        if normalized and normalized.issubset(DEFAULT_ALLOWED_EXTENSIONS):
            result["allowed_file_extensions"] = sorted(normalized)
    return result


def save_platform_settings(db, changes: dict, updated_by: int) -> dict:
    if not changes:
        return get_platform_settings(db)
    for key, value in changes.items():
        row = db.query(PlatformSetting).filter(PlatformSetting.setting_key == key).first()
        encoded = json.dumps(value, separators=(",", ":"))
        if row is None:
            db.add(PlatformSetting(setting_key=key, value_json=encoded, updated_by=updated_by))
        else:
            row.value_json = encoded
            row.updated_by = updated_by
    db.commit()
    return get_platform_settings(db)
