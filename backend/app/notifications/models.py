from enum import Enum
from typing import Optional, Dict, Any
from datetime import datetime, timezone

class NotificationType(str, Enum):
    FILE_SHARE = "file_share"
    FILE_DOWNLOAD = "file_download"
    SECURITY_ALERT = "security_alert"
    LINK_EXPIRATION = "link_expiration"
    SYSTEM = "system"


class NotificationPriority(str, Enum):
    LOW = "low"
    NORMAL = "normal"
    HIGH = "high"
    CRITICAL = "critical"

