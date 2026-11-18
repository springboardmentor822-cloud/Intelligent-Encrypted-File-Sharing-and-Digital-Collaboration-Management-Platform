from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status

from app.models import User, UserRole
from app.security import get_current_user
from app.activity_monitoring.service import activity_monitoring_service
from app.activity_monitoring.schemas import (
    ActivityRecordCreate,
    ActivityRecordResponse,
    ActivityListResponse,
    ActivitySummaryStats
)

router = APIRouter(prefix="/activity-monitoring", tags=["Activity Monitoring"])

@router.get("/activities", response_model=ActivityListResponse)
async def list_activities(
    user_id: Optional[int] = Query(None, description="Filter by user ID"),
    activity_type: Optional[str] = Query(None, description="Filter by activity type (login, upload, download, share, etc.)"),
    file_id: Optional[str] = Query(None, description="Filter by related file ID"),
    status: Optional[str] = Query(None, description="Filter by status (successful, failed)"),
    start_date: Optional[str] = Query(None, description="Start date (ISO-8601)"),
    end_date: Optional[str] = Query(None, description="End date (ISO-8601)"),
    search: Optional[str] = Query(None, description="Keyword search in activities"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    current_user: User = Depends(get_current_user)
):
    """
    Retrieves paginated and filtered activity records.
    Admins can view all activities; standard users can view their own activities.
    """
    target_user_id = user_id
    if current_user.role != UserRole.ADMIN:
        # Standard users are restricted to viewing only their own activity log
        target_user_id = current_user.id

    skip = (page - 1) * page_size
    records, total = await activity_monitoring_service.get_activities(
        user_id=target_user_id,
        activity_type=activity_type,
        file_id=file_id,
        status=status,
        start_date=start_date,
        end_date=end_date,
        search=search,
        skip=skip,
        limit=page_size
    )

    return ActivityListResponse(
        total=total,
        page=page,
        page_size=page_size,
        activities=records
    )


@router.get("/stats", response_model=ActivitySummaryStats)
async def get_activity_stats(current_user: User = Depends(get_current_user)):
    """
    Retrieves aggregate activity statistics and breakdown.
    """
    return await activity_monitoring_service.get_activity_stats()


@router.get("/activities/{activity_id}", response_model=ActivityRecordResponse)
async def get_activity_detail(
    activity_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Retrieves a single activity record by its unique Activity ID.
    """
    record = await activity_monitoring_service.get_activity_by_id(activity_id)
    if not record:
        raise HTTPException(status_code=404, detail="Activity record not found.")

    if current_user.role != UserRole.ADMIN and record.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Permission denied to access this activity record.")

    return record


@router.get("/file/{file_id}", response_model=List[ActivityRecordResponse])
async def get_file_activities(
    file_id: str,
    limit: int = Query(50, ge=1, le=200),
    current_user: User = Depends(get_current_user)
):
    """
    Retrieves the complete audit trail and activity history for a specific file.
    """
    records, _ = await activity_monitoring_service.get_activities(
        file_id=file_id,
        limit=limit
    )
    return records


@router.get("/user/{user_id}", response_model=List[ActivityRecordResponse])
async def get_user_activities(
    user_id: int,
    limit: int = Query(50, ge=1, le=200),
    current_user: User = Depends(get_current_user)
):
    """
    Retrieves user-specific activity history.
    """
    if current_user.role != UserRole.ADMIN and current_user.id != user_id:
        raise HTTPException(status_code=403, detail="Permission denied to access other user's activities.")

    records, _ = await activity_monitoring_service.get_activities(
        user_id=user_id,
        limit=limit
    )
    return records


@router.post("/record", status_code=status.HTTP_201_CREATED)
async def record_client_activity(
    req: ActivityRecordCreate,
    request: Request,
    current_user: User = Depends(get_current_user)
):
    """
    Allows authorized clients to record UI or application events into the monitoring system.
    """
    ip = request.client.host if request.client else req.ip_address
    doc = await activity_monitoring_service.record_activity(
        user_id=current_user.id if req.user_id is None else req.user_id,
        username=current_user.username if req.username is None else req.username,
        activity_type=req.activity_type,
        status=req.status,
        file_id=req.file_id,
        resource_name=req.resource_name,
        ip_address=ip,
        details=req.details
    )
    return {"status": "success", "activity_id": doc.get("activity_id")}

