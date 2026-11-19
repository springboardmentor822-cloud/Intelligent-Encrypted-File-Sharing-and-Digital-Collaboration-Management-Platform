import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "trustshare_milestone2.db")

def migrate():
    print(f"🔧 Checking and migrating database at: {DB_PATH}")
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    # Helper to check if column exists
    def get_columns(table):
        try:
            return [col[1] for col in cur.execute(f"PRAGMA table_info({table})").fetchall()]
        except Exception:
            return []

    # 1. audit_logs migration
    audit_cols = get_columns("audit_logs")
    print("Existing audit_logs columns:", audit_cols)
    if "event_id" not in audit_cols:
        print("Adding column audit_logs.event_id...")
        cur.execute("ALTER TABLE audit_logs ADD COLUMN event_id TEXT")
    if "request_id" not in audit_cols:
        print("Adding column audit_logs.request_id...")
        cur.execute("ALTER TABLE audit_logs ADD COLUMN request_id TEXT")
    if "prev_hash" not in audit_cols:
        print("Adding column audit_logs.prev_hash TEXT...")
        cur.execute("ALTER TABLE audit_logs ADD COLUMN prev_hash TEXT DEFAULT 'GENESIS_HASH_00000000000000000000000000000000'")
    if "record_hash" not in audit_cols:
        print("Adding column audit_logs.record_hash TEXT...")
        cur.execute("ALTER TABLE audit_logs ADD COLUMN record_hash TEXT")

    # 2. stored_files migration
    file_cols = get_columns("stored_files")
    print("Existing stored_files columns:", file_cols)
    if "key_version" not in file_cols:
        print("Adding column stored_files.key_version...")
        cur.execute("ALTER TABLE stored_files ADD COLUMN key_version INTEGER DEFAULT 1")
    if "owner_id" not in file_cols:
        print("Adding column stored_files.owner_id...")
        cur.execute("ALTER TABLE stored_files ADD COLUMN owner_id INTEGER")
    if "is_deleted" not in file_cols:
        print("Adding column stored_files.is_deleted...")
        cur.execute("ALTER TABLE stored_files ADD COLUMN is_deleted BOOLEAN DEFAULT 0")
    if "deleted_at" not in file_cols:
        print("Adding column stored_files.deleted_at...")
        cur.execute("ALTER TABLE stored_files ADD COLUMN deleted_at TIMESTAMP")

    # 3. file_shares migration
    share_cols = get_columns("file_shares")
    print("Existing file_shares columns:", share_cols)
    if "token_hash" not in share_cols:
        print("Adding column file_shares.token_hash...")
        cur.execute("ALTER TABLE file_shares ADD COLUMN token_hash TEXT")
    if "max_downloads" not in share_cols:
        print("Adding column file_shares.max_downloads...")
        cur.execute("ALTER TABLE file_shares ADD COLUMN max_downloads INTEGER")
    if "password_hash" not in share_cols:
        print("Adding column file_shares.password_hash...")
        cur.execute("ALTER TABLE file_shares ADD COLUMN password_hash TEXT")

    # 4. security_alerts migration
    alert_cols = get_columns("security_alerts")
    print("Existing security_alerts columns:", alert_cols)
    if "rule_id" not in alert_cols:
        print("Adding column security_alerts.rule_id...")
        cur.execute("ALTER TABLE security_alerts ADD COLUMN rule_id TEXT")
    if "resolution_notes" not in alert_cols:
        print("Adding column security_alerts.resolution_notes...")
        cur.execute("ALTER TABLE security_alerts ADD COLUMN resolution_notes TEXT")

    conn.commit()
    conn.close()
    print("✅ Migration completed successfully without data loss!")

if __name__ == "__main__":
    migrate()
