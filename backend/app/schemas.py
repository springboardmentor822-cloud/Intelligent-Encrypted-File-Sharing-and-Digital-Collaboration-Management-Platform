from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr
from app.models import UserRole

# Registration Schema
class UserCreate(BaseModel):
    email: EmailStr
    username: str
    password: str
    full_name: Optional[str] = None
    role: Optional[UserRole] = UserRole.USER

# User Public Response
class UserResponse(BaseModel):
    id: int
    email: str
    username: str
    full_name: Optional[str] = None
    role: UserRole
    is_mfa_enabled: bool
    oauth_provider: Optional[str] = None
    is_active: bool
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

# Login Schema
class UserLogin(BaseModel):
    email_or_username: str
    password: str

# Token Return Schema
class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse

# User Profile Update Schema
class UserProfileUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[str] = None
    username: Optional[str] = None
    current_password: Optional[str] = None
    new_password: Optional[str] = None