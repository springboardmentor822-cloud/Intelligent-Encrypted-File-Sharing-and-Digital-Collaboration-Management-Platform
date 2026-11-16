from datetime import datetime
from typing import Optional
from pydantic import BaseModel


# Metadata response sent back to user after file upload or list
class FileResponse(BaseModel):
    id: int
    filename: str
    original_filename: str
    file_size: int
    content_type: Optional[str] = None
    owner_id: int
    uploaded_at: datetime
    is_encrypted: bool = True
    encryption_algorithm: Optional[str] = "AES-256-GCM"
    sha256_hash: Optional[str] = None

    class Config:
        from_attributes = True
