-- TrustShare folder management migration
-- Apply manually against the configured MySQL database after review.
-- This migration is intentionally not executed by the application or tests.

CREATE TABLE IF NOT EXISTS folders (
    id INT NOT NULL AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,
    owner_id INT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_folder_owner_name (owner_id, name),
    CONSTRAINT fk_folder_owner
        FOREIGN KEY (owner_id) REFERENCES users(id)
        ON DELETE CASCADE
);

SET @folder_unique_exists = (
    SELECT COUNT(*)
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'folders'
      AND index_name = 'uq_folder_owner_name'
);
SET @sql = IF(
    @folder_unique_exists = 0,
    'ALTER TABLE folders ADD UNIQUE KEY uq_folder_owner_name (owner_id, name)',
    'SELECT 1'
);
PREPARE add_folder_unique FROM @sql;
EXECUTE add_folder_unique;
DEALLOCATE PREPARE add_folder_unique;

SET @folder_owner_fk_exists = (
    SELECT COUNT(*)
    FROM information_schema.key_column_usage
    WHERE table_schema = DATABASE()
      AND table_name = 'folders'
      AND constraint_name = 'fk_folder_owner'
);
SET @sql = IF(
    @folder_owner_fk_exists = 0,
    'ALTER TABLE folders ADD CONSTRAINT fk_folder_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE',
    'SELECT 1'
);
PREPARE add_folder_owner_fk FROM @sql;
EXECUTE add_folder_owner_fk;
DEALLOCATE PREPARE add_folder_owner_fk;

SET @column_exists = (
    SELECT COUNT(*)
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'stored_files'
      AND column_name = 'folder_id'
);
SET @sql = IF(
    @column_exists = 0,
    'ALTER TABLE stored_files ADD COLUMN folder_id INT NULL',
    'SELECT 1'
);
PREPARE add_folder_column FROM @sql;
EXECUTE add_folder_column;
DEALLOCATE PREPARE add_folder_column;

SET @index_exists = (
    SELECT COUNT(*)
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'stored_files'
      AND index_name = 'ix_stored_files_folder_id'
);
SET @sql = IF(
    @index_exists = 0,
    'ALTER TABLE stored_files ADD INDEX ix_stored_files_folder_id (folder_id)',
    'SELECT 1'
);
PREPARE add_folder_index FROM @sql;
EXECUTE add_folder_index;
DEALLOCATE PREPARE add_folder_index;

SET @foreign_key_exists = (
    SELECT COUNT(*)
    FROM information_schema.key_column_usage
    WHERE table_schema = DATABASE()
      AND table_name = 'stored_files'
      AND column_name = 'folder_id'
      AND constraint_name = 'fk_stored_file_folder'
);
SET @sql = IF(
    @foreign_key_exists = 0,
    'ALTER TABLE stored_files ADD CONSTRAINT fk_stored_file_folder FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE SET NULL',
    'SELECT 1'
);
PREPARE add_folder_foreign_key FROM @sql;
EXECUTE add_folder_foreign_key;
DEALLOCATE PREPARE add_folder_foreign_key;
