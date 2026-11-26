-- TrustShare file sharing migration
-- Apply to existing MySQL databases before deploying the sharing workflow.
CREATE TABLE IF NOT EXISTS file_shares (
    id INT NOT NULL AUTO_INCREMENT,
    file_id INT NOT NULL,
    owner_id INT NOT NULL,
    recipient_email VARCHAR(255) NOT NULL,
    permission VARCHAR(20) NOT NULL DEFAULT 'download',
    revoked BOOLEAN NOT NULL DEFAULT FALSE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY ix_file_shares_file_id (file_id),
    KEY ix_file_shares_owner_id (owner_id),
    KEY ix_file_shares_recipient_email (recipient_email),
    UNIQUE KEY uq_file_share_recipient (file_id, recipient_email),
    CONSTRAINT fk_file_share_file FOREIGN KEY (file_id) REFERENCES stored_files(id) ON DELETE CASCADE,
    CONSTRAINT fk_file_share_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);
