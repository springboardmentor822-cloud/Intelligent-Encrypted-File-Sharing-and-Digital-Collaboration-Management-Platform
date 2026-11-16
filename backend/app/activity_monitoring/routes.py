from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, Query, HTTPException, status
from app.models.user import User
from app.routers.admin import require_admin
from app.activity_monitoring.service import ActivityMonitoringService
from app.activity_monitoring.schemas import AuditLogResponse

router = APIRouter(prefix="/audit-logs", tags=["Activity Monitoring & Audit Logging"])


@router.get("", response_model=List[AuditLogResponse])
async def get_all_audit_logs(
    limit: int = Query(default=50, ge=1, le=200),
    skip: int = Query(default=0, ge=0),
    admin: User = Depends(require_admin),
):
    """
    Step 5: GET /audit-logs
    Retrieves complete application audit logs from MongoDB Atlas with PostgreSQL persistence.
    """
    return await ActivityMonitoringService.get_all_logs(limit=limit, skip=skip)


@router.get("/user/{user_id}", response_model=List[AuditLogResponse])
async def get_user_audit_logs(
    user_id: int,
    limit: int = Query(default=50, ge=1, le=100),
    admin: User = Depends(require_admin),
):
    """
    Step 5: GET /audit-logs/user/{user_id}
    Retrieves all activity records performed by a specific user.
    """
    return await ActivityMonitoringService.get_user_logs(user_id=user_id, limit=limit)


@router.get("/file/{file_id}", response_model=List[AuditLogResponse])
async def get_file_audit_logs(
    file_id: int,
    limit: int = Query(default=50, ge=1, le=100),
    admin: User = Depends(require_admin),
):
    """
    Step 5: GET /audit-logs/file/{file_id}
    Retrieves all activity and sharing history for a specific file.
    """
    return await ActivityMonitoringService.get_file_logs(file_id=file_id, limit=limit)


@router.get("/filter", response_model=List[AuditLogResponse])
async def filter_audit_logs(
    user_id: Optional[int] = Query(default=None),
    activity_type: Optional[str] = Query(default=None),
    file_id: Optional[int] = Query(default=None),
    status: Optional[str] = Query(default=None),
    start_date: Optional[datetime] = Query(default=None),
    end_date: Optional[datetime] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    skip: int = Query(default=0, ge=0),
    admin: User = Depends(require_admin),
):
    """
    Step 5 & 6: GET /audit-logs/filter
    Filters audit records based on User, Activity Type, File ID, Status, and Date Range.
    """
    return await ActivityMonitoringService.filter_logs(
        user_id=user_id,
        activity_type=activity_type,
        file_id=file_id,
        status=status,
        start_date=start_date,
        end_date=end_date,
        limit=limit,
        skip=skip,
    )

