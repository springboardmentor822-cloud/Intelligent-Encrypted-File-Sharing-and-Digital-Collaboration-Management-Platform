import logging
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.gmail_service import GmailDeliveryUncertain, send_gmail_message
from app.models import FileShare, StoredFile, User


reminder_logger = logging.getLogger("trustshare.expiry_reminders")
REMINDER_LEASE = timedelta(minutes=10)


def _utc_now(value: datetime | None = None) -> datetime:
    current = value or datetime.now(timezone.utc)
    if current.tzinfo is None:
        return current.replace(tzinfo=timezone.utc)
    return current.astimezone(timezone.utc)


def _claim_reminder(
    db: Session,
    share_id: int,
    sent_field: str,
    claimed_field: str,
    state_field: str,
    now: datetime,
) -> FileShare | None:
    share = db.query(FileShare).filter(
        FileShare.id == share_id,
        FileShare.revoked.is_(False),
    ).with_for_update().first()
    if share is None or share.expires_at is None:
        db.rollback()
        return None

    expires_at = _utc_now(share.expires_at)
    if expires_at <= now or getattr(share, sent_field) is not None:
        db.rollback()
        return None

    state = getattr(share, state_field)
    if state in {"sent", "uncertain"}:
        db.rollback()
        return None

    claimed_at = getattr(share, claimed_field)
    if state == "sending" or claimed_at is not None:
        if claimed_at is not None and _utc_now(claimed_at) > now - REMINDER_LEASE:
            db.rollback()
            return None
        # A previous worker may have reached Gmail before it crashed. Never
        # reclaim an expired send lease automatically: that can duplicate mail.
        setattr(share, state_field, "uncertain")
        setattr(share, claimed_field, None)
        db.commit()
        return None

    if state not in {None, "retryable"}:
        db.rollback()
        return None

    setattr(share, claimed_field, now.replace(tzinfo=None))
    setattr(share, state_field, "sending")
    db.commit()
    return share


def _set_delivery_state(
    db: Session,
    share_id: int,
    claimed_field: str,
    state_field: str,
    state: str,
) -> None:
    share = db.query(FileShare).filter(FileShare.id == share_id).with_for_update().first()
    if share is not None:
        setattr(share, state_field, state)
        setattr(share, claimed_field, None)
        db.commit()
    else:
        db.rollback()


def _mark_sent(
    db: Session,
    share_id: int,
    sent_field: str,
    claimed_field: str,
    state_field: str,
    now: datetime,
) -> None:
    share = db.query(FileShare).filter(FileShare.id == share_id).with_for_update().first()
    if share is None:
        db.rollback()
        return
    setattr(share, sent_field, now.replace(tzinfo=None))
    setattr(share, state_field, "sent")
    setattr(share, claimed_field, None)
    db.commit()


def _send_one(
    db: Session,
    share: FileShare,
    item: StoredFile,
    owner: User,
    *,
    minutes: int,
    sent_field: str,
    claimed_field: str,
    state_field: str,
    now: datetime,
) -> bool:
    recipient = (share.recipient_email or "").strip().lower()
    owner_email = (owner.email or "").strip().lower()
    if not recipient or recipient == owner_email:
        _set_delivery_state(db, share.id, claimed_field, state_field, "retryable")
        return False

    subject = f"TrustShare: Your shared file expires in {minutes} minutes"
    expires_text = _utc_now(share.expires_at).isoformat().replace("+00:00", " UTC")
    body = (
        f'The shared file "{item.original_name}" will expire at {expires_text}.\n\n'
        "After expiration, this TrustShare share will no longer be accessible."
    )
    try:
        send_gmail_message(db, owner.id, recipient, subject, body)
    except GmailDeliveryUncertain as exc:
        _set_delivery_state(db, share.id, claimed_field, state_field, "uncertain")
        reminder_logger.warning(
            "File-share expiry reminder outcome uncertain: share_id=%s window=%s status=%s",
            share.id,
            minutes,
            exc.status_code,
        )
        return False
    except HTTPException as exc:
        # HTTP errors from the provider are explicit rejections, and failures
        # before its send request are safe to retry after configuration changes.
        _set_delivery_state(db, share.id, claimed_field, state_field, "retryable")
        reminder_logger.warning(
            "File-share expiry reminder failed: share_id=%s window=%s status=%s",
            share.id,
            minutes,
            exc.status_code,
        )
        return False
    except Exception as exc:
        # An unexpected exception may have happened after provider acceptance.
        _set_delivery_state(db, share.id, claimed_field, state_field, "uncertain")
        reminder_logger.warning(
            "File-share expiry reminder failed: share_id=%s window=%s error=%s",
            share.id,
            minutes,
            type(exc).__name__,
        )
        return False

    _mark_sent(db, share.id, sent_field, claimed_field, state_field, now)
    reminder_logger.info(
        "File-share expiry reminder accepted: share_id=%s window=%s",
        share.id,
        minutes,
    )
    return True


def send_file_share_expiry_reminders(
    db: Session,
    *,
    now: datetime | None = None,
) -> int:
    current = _utc_now(now)
    current_naive = current.replace(tzinfo=None)
    shares = db.query(FileShare).filter(
        FileShare.revoked.is_(False),
        FileShare.expires_at.is_not(None),
        FileShare.expires_at > current_naive,
        FileShare.expires_at <= current_naive + timedelta(minutes=90),
    ).all()
    sent_count = 0

    for candidate in shares:
        expires_at = _utc_now(candidate.expires_at)
        remaining = expires_at - current
        if remaining <= timedelta(0):
            continue

        if remaining <= timedelta(minutes=30):
            windows = ((30, "reminder_30_sent_at", "reminder_30_claimed_at", "reminder_30_state"),)
        else:
            windows = ((90, "reminder_90_sent_at", "reminder_90_claimed_at", "reminder_90_state"),)

        item = db.query(StoredFile).filter(
            StoredFile.id == candidate.file_id,
            StoredFile.owner_id == candidate.owner_id,
        ).first()
        owner = db.query(User).filter(User.id == candidate.owner_id).first()
        if item is None or owner is None:
            continue

        for minutes, sent_field, claimed_field, state_field in windows:
            share = _claim_reminder(
                db,
                candidate.id,
                sent_field,
                claimed_field,
                state_field,
                current,
            )
            if share is not None and _send_one(
                db,
                share,
                item,
                owner,
                minutes=minutes,
                sent_field=sent_field,
                claimed_field=claimed_field,
                state_field=state_field,
                now=current,
            ):
                sent_count += 1

    return sent_count
