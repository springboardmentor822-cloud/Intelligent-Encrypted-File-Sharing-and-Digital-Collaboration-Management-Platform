from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field

from app.models import User, UserRole
from app.security import get_current_user, require_role
from app.activity_monitoring.audit_service import audit_logging_service

router = APIRouter(prefix="/audit-logs", tags=["Audit Logging Workflows"])

# Enforce administrator-only access for all routes in this router
admin_only = require_role(UserRole.ADMIN)


class AuditLogResponse(BaseModel):
    log_id: str
    user_id: Optional[int] = None
    username: Optional[str] = None
    activity_type: str
    file_id: Optional[str] = None
    file_name: Optional[str] = None
    activity_description: str
    activity_status: str
    ip_address: str
    date_and_time: str
    details: Optional[Dict[str, Any]] = None


class AuditLogListResponse(BaseModel):
    total: int
    page: int
    page_size: int
    logs: List[Dict[str, Any]]


# ==============================================================================
# 1. GET /audit-logs (RETRIEVE ALL AUDIT LOGS - ADMIN ONLY)
# ==============================================================================
@router.get("", response_model=AuditLogListResponse)
async def get_all_audit_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    search: Optional[str] = Query(None, description="Search by user, description, file, or IP"),
    current_admin: User = Depends(admin_only)
):
    """
    Retrieve all audit logs (Administrator-only).
    """
    skip = (page - 1) * page_size
    records, total = await audit_logging_service.get_audit_logs(
        search=search,
        skip=skip,
        limit=page_size
    )

    return AuditLogListResponse(
        total=total,
        page=page,
        page_size=page_size,
        logs=records
    )


# ==============================================================================
# 2. GET /audit-logs/user/{user_id} (RETRIEVE USER-SPECIFIC AUDIT LOGS)
# ==============================================================================
@router.get("/user/{user_id}", response_model=AuditLogListResponse)
async def get_user_audit_logs(
    user_id: int,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    current_admin: User = Depends(admin_only)
):
    """
    Retrieve a particular user's complete audit trail (Administrator-only).
    """
    skip = (page - 1) * page_size
    records, total = await audit_logging_service.get_audit_logs(
        user_id=user_id,
        skip=skip,
        limit=page_size
    )

    return AuditLogListResponse(
        total=total,
        page=page,
        page_size=page_size,
        logs=records
    )


# ==============================================================================
# 3. GET /audit-logs/file/{file_id} (RETRIEVE FILE-SPECIFIC AUDIT LOGS)
# ==============================================================================
@router.get("/file/{file_id}", response_model=AuditLogListResponse)
async def get_file_audit_logs(
    file_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    current_admin: User = Depends(admin_only)
):
    """
    Retrieve activity for a particular file (Administrator-only).
    """
    skip = (page - 1) * page_size
    records, total = await audit_logging_service.get_audit_logs(
        file_id=file_id,
        skip=skip,
        limit=page_size
    )

    return AuditLogListResponse(
        total=total,
        page=page,
        page_size=page_size,
        logs=records
    )


# ==============================================================================
# 4. GET /audit-logs/filter (FILTER LOGS BY DATE, ACTIVITY TYPE, STATUS, USER)
# ==============================================================================
@router.get("/filter", response_model=AuditLogListResponse)
async def filter_audit_logs(
    user_id: Optional[int] = Query(None, description="Filter by User ID"),
    username: Optional[str] = Query(None, description="Filter by Username"),
    activity_type: Optional[str] = Query(None, description="Filter by Activity Type (login, upload, download, share, etc.)"),
    file_id: Optional[str] = Query(None, description="Filter by File ID"),
    file_name: Optional[str] = Query(None, description="Filter by File Name"),
    activity_status: Optional[str] = Query(None, description="Filter by status ('successful' or 'failed')"),
    start_date: Optional[str] = Query(None, description="Filter after start date (ISO-8601)"),
    end_date: Optional[str] = Query(None, description="Filter before end date (ISO-8601)"),
    search: Optional[str] = Query(None, description="Keyword search across records"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    current_admin: User = Depends(admin_only)
):
    """
    Granular audit log filtering (Administrator-only).
    Allows administrators to filter records based on:
    - User (user_id / username)
    - Activity type (login, upload, download, share, etc.)
    - File name or file ID
    - Date range (start_date, end_date)
    - Activity status (successful, failed)
    """
    skip = (page - 1) * page_size
    records, total = await audit_logging_service.get_audit_logs(
        user_id=user_id,
        username=username,
        activity_type=activity_type,
        file_id=file_id,
        file_name=file_name,
        activity_status=activity_status,
        start_date=start_date,
        end_date=end_date,
        search=search,
        skip=skip,
        limit=page_size
    )

    return AuditLogListResponse(
        total=total,
        page=page,
        page_size=page_size,
        logs=records
    )


# ==============================================================================
# 5. GET /audit-logs/{log_id} (RETRIEVE SINGLE AUDIT LOG BY ID)
# ==============================================================================
@router.get("/{log_id}")
async def get_single_audit_log(
    log_id: str,
    current_admin: User = Depends(admin_only)
):
    """
    Retrieve full cryptographic and operational payload of a single audit log.
    """
    record = await audit_logging_service.get_audit_log_by_id(log_id)
    if not record:
        raise HTTPException(status_code=404, detail="Audit log entry not found.")
    return record

