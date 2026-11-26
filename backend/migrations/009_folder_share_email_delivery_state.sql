-- Additive only: existing folder shares retain their access and receive a
-- pending delivery state until an invitation is accepted or explicitly retried.
ALTER TABLE folder_shares
  ADD COLUMN email_status VARCHAR(20) NOT NULL DEFAULT 'pending',
  ADD COLUMN email_attempt_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN email_attempted_at DATETIME NULL,
  ADD COLUMN email_sent_at DATETIME NULL,
  ADD COLUMN email_error_category VARCHAR(40) NULL;
