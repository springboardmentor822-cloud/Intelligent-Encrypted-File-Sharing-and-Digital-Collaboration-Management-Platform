from app.routers.auth import router as auth_router
from app.routers.files import router as files_router
from app.routers.admin import router as admin_router

__all__ = ["auth_router", "files_router", "admin_router"]
