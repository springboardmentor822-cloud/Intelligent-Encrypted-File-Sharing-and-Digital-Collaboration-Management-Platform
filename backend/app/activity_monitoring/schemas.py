from typing import Optional, Dict, Any
from pydantic import BaseModel


class AuditLogResponse(BaseModel):
    activity_id: str
    user_id: Optional[int] = None
    username: Optional[str] = None
    activity_type: str
    file_id: Optional[int] = None
    description: Optional[str] = None
    status: str
    ip_address: Optional[str] = None
    timestamp: Optional[str] = None
    details: Optional[Dict[str, Any]] = None

