-- Additive only: existing file shares remain active and unsent reminder fields are NULL.
ALTER TABLE file_shares
  ADD COLUMN reminder_90_sent_at DATETIME NULL,
  ADD COLUMN reminder_90_claimed_at DATETIME NULL,
  ADD COLUMN reminder_30_sent_at DATETIME NULL,
  ADD COLUMN reminder_30_claimed_at DATETIME NULL;
