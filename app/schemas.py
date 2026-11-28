from typing import Literal
from pydantic import BaseModel, EmailStr, Field
from pydantic import BaseModel, EmailStr, Field


class UserCreate(BaseModel):
    model_config = BaseModel.model_config | {"extra": "forbid"}
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)

class UserLogin(BaseModel):
    model_config = BaseModel.model_config | {"extra": "forbid"}
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
class PasswordChange(BaseModel):
    model_config = BaseModel.model_config | {"extra": "forbid"}

    current_password: str = Field(min_length=8, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)
class ShareRequest(BaseModel):
    model_config = BaseModel.model_config | {"extra": "forbid"}

    shared_with_email: EmailStr | None = None

    permission: Literal["Viewer", "Editor"] = "Viewer"

    expires_in_hours: int = Field(
        default=24,
        ge=1,
        le=720,
    )