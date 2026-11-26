CREATE TABLE IF NOT EXISTS gmail_credentials (
    user_id INT NOT NULL PRIMARY KEY,
    sender_email VARCHAR(255) NOT NULL,
    access_token_encrypted VARCHAR(4096) NOT NULL,
    refresh_token_encrypted VARCHAR(4096) NULL,
    expires_at DATETIME NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_gmail_credentials_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
