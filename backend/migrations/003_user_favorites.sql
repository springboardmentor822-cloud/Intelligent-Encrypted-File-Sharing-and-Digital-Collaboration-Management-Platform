-- Add per-account persistent favorites without changing existing file/folder data.
CREATE TABLE IF NOT EXISTS favorites (
    id INT NOT NULL AUTO_INCREMENT,
    user_id INT NOT NULL,
    file_id INT NULL,
    folder_id INT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY ix_favorites_user_id (user_id),
    KEY ix_favorites_file_id (file_id),
    KEY ix_favorites_folder_id (folder_id),
    UNIQUE KEY uq_favorite_user_file (user_id, file_id),
    UNIQUE KEY uq_favorite_user_folder (user_id, folder_id),
    CONSTRAINT fk_favorites_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_favorites_file FOREIGN KEY (file_id) REFERENCES stored_files (id) ON DELETE CASCADE,
    CONSTRAINT fk_favorites_folder FOREIGN KEY (folder_id) REFERENCES folders (id) ON DELETE CASCADE
);
