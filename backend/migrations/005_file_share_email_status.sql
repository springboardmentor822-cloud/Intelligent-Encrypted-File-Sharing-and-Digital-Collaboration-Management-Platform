ALTER TABLE file_shares
    ADD COLUMN email_status VARCHAR(20) NOT NULL DEFAULT 'unknown',
    ADD COLUMN email_attempt_count INT NOT NULL DEFAULT 0,
    ADD COLUMN email_attempted_at DATETIME NULL,
    ADD COLUMN email_sent_at DATETIME NULL,
    ADD COLUMN email_error_category VARCHAR(40) NULL;

ALTER TABLE file_shares
    MODIFY COLUMN email_status VARCHAR(20) NOT NULL DEFAULT 'pending';
