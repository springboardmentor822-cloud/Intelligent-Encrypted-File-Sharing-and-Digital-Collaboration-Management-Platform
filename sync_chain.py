import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from database import SessionLocal
from models.audit_log import AuditLog
from services.audit_service import AuditService, GENESIS_HASH

def recompute_all():
    db = SessionLocal()
    records = db.query(AuditLog).order_by(AuditLog.id.asc()).all()
    prev = GENESIS_HASH
    for r in records:
        r.prev_hash = prev
        r.record_hash = AuditService._compute_hash(
            prev_hash=r.prev_hash,
            event_id=r.event_id,
            user_id=r.user_id,
            activity_type=r.activity_type,
            file_id=r.file_id,
            status=r.activity_status,
            timestamp_str=r.timestamp,
            request_id=r.request_id
        )
        prev = r.record_hash
    db.commit()
    verify = AuditService.verify_chain_integrity(db)
    print("Verification after sync:", verify)
    db.close()

if __name__ == "__main__":
    recompute_all()
