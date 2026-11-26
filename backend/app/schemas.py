
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class RegisterRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=100)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    full_name: str
    email: EmailStr
    role: str
    auth_provider: str | None = None
    microsoft_linked: bool = False


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class StoredFileResponse(BaseModel):
    id: int
    original_name: str
    content_type: str
    size_bytes: int
    created_at: datetime | None = None
    folder_id: int | None = None
    is_password_protected: bool = False
    is_parent_folder_password_protected: bool = False
    is_favorite: bool = False
    is_encrypted_at_rest: bool = False


class FileDownloadRequest(BaseModel):
    password: str | None = None
    folder_password: str | None = None
    folder_unlock_token: str | None = None


class FileShareRequest(BaseModel):
    recipient_email: EmailStr
    permission: str = "download"
    expires_at: datetime | None = None
    folder_password: str | None = None
    folder_unlock_token: str | None = None


class FileShareUpdateRequest(BaseModel):
    permission: str = "download"
    expires_at: datetime | None = None


class FolderCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    password: str | None = Field(
        default=None,
        min_length=8,
        max_length=128,
    )


class FolderUpdateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)


class FolderShareRequest(BaseModel):
    recipient_email: EmailStr
    permission: str = "viewer"
    expires_at: datetime | None = None
    folder_password: str | None = None
    folder_unlock_token: str | None = None


class FolderUnlockRequest(BaseModel):
    password: str = Field(min_length=1, max_length=128)


class FolderShareUpdateRequest(BaseModel):
    permission: str = "viewer"
    expires_at: datetime | None = None


class ProtectedPasswordResetRequest(BaseModel):
    password: str = Field(min_length=8, max_length=128)


class RecoveryResendRequest(BaseModel):
    challenge_id: str = Field(min_length=20, max_length=200)


class RecoveryVerifyRequest(BaseModel):
    challenge_id: str = Field(min_length=20, max_length=200)
    code: str = Field(min_length=6, max_length=6)


class RecoveryResetRequest(ProtectedPasswordResetRequest):
    reset_token: str = Field(min_length=20, max_length=200)


class AccountRecoveryStartRequest(BaseModel):
    email: EmailStr


class AccountRecoveryResetRequest(ProtectedPasswordResetRequest):
    reset_token: str = Field(min_length=20, max_length=200)


class FolderResponse(BaseModel):
    model_config = {"from_attributes": True}
    id: int
    name: str
    owner_id: int
    created_at: datetime | None = None
    is_password_protected: bool = False
    is_shared: bool = False
    permission: str = "owner"
