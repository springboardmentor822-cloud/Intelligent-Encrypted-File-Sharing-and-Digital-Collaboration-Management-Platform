-- Additive only: NULL preserves the legacy eligible state for unsent reminders.
ALTER TABLE file_shares
  ADD COLUMN reminder_90_state VARCHAR(20) NULL,
  ADD COLUMN reminder_30_state VARCHAR(20) NULL;
