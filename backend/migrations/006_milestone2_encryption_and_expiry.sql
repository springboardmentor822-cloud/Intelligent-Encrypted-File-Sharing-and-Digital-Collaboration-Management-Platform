-- Additive only: existing file and sharing records remain intact.
ALTER TABLE stored_files
  ADD COLUMN encryption_version INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN wrapped_data_key VARCHAR(512) NULL,
  ADD COLUMN encryption_key_id VARCHAR(100) NULL,
  ADD COLUMN storage_backend VARCHAR(20) NOT NULL DEFAULT 'local';

ALTER TABLE file_shares
  ADD COLUMN expires_at DATETIME NULL;

-- Existing records default to encryption_version=0 and remain readable as legacy objects.
-- Existing shares retain their current recipient, permission, token, and revocation state;
-- NULL expires_at preserves their existing no-expiry behavior.
