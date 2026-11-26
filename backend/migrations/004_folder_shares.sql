CREATE TABLE IF NOT EXISTS folder_shares (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    folder_id INT NOT NULL,
    owner_id INT NOT NULL,
    recipient_email VARCHAR(255) NOT NULL,
    permission VARCHAR(20) NOT NULL DEFAULT 'viewer',
    revoked BOOLEAN NOT NULL DEFAULT FALSE,
    expires_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_folder_share_recipient (folder_id, recipient_email),
    KEY ix_folder_shares_owner_id (owner_id),
    KEY ix_folder_shares_recipient_email (recipient_email),
    CONSTRAINT fk_folder_shares_folder FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE,
    CONSTRAINT fk_folder_shares_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);
