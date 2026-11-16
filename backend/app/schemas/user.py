from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr
from app.models.user import UserRole


# 1. Shared attributes (common to input and output)
class UserBase(BaseModel):
    email: EmailStr
    full_name: Optional[str] = None
    role: Optional[UserRole] = UserRole.USER


# 2. Schema for User Registration (Signup)
# Notice: 'password' is required here when registering!
class UserCreate(UserBase):
    password: str


# 3. Schema for User Login
class UserLogin(BaseModel):
    email: EmailStr
    password: str


# 4. Schema for Public User Profile (API Output)
# Notice: NO password field here! Your password is never exposed in responses.
class UserResponse(UserBase):
    id: int
    is_active: bool
    created_at: datetime

    class Config:
        # Tells Pydantic to read data directly from SQLAlchemy database objects
        from_attributes = True


# 5. Schema returned when a user successfully logs in
class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
