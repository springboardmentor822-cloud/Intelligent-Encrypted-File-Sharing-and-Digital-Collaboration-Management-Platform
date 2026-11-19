import sqlite3
import os
import uuid
import hashlib

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "trustshare_milestone2.db")

def repair():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    rows = cur.execute("SELECT id, user_id, activity_type, file_id, activity_status, timestamp FROM audit_logs ORDER BY id ASC").fetchall()

    prev_hash = "GENESIS_HASH_00000000000000000000000000000000"
    for r in rows:
        row_id, user_id, activity_type, file_id, status, ts = r
        ev_id = str(uuid.uuid4())
        ts_clean = str(ts).replace("T", " ")[:19]
        payload = f"{prev_hash}|{ev_id}|{user_id}|{activity_type}|{file_id or 'None'}|{status}|{ts_clean}|None"
        rec_hash = hashlib.sha256(payload.encode("utf-8")).hexdigest()
        cur.execute(
            "UPDATE audit_logs SET event_id=?, prev_hash=?, record_hash=? WHERE id=?",
            (ev_id, prev_hash, rec_hash, row_id)
        )
        prev_hash = rec_hash

    conn.commit()
    conn.close()
    print("✅ Successfully repaired legacy audit chain records!")

if __name__ == "__main__":
    repair()
