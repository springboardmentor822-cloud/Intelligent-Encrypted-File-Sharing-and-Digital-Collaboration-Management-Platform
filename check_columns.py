
import psycopg

conn = psycopg.connect(
    host="127.0.0.1",
    port=5432,
    dbname="trustshare",
    user="trustshare_user",
    password="trustshare_dev_password"
)

cur = conn.cursor()

cur.execute("""
    UPDATE file_shares
    SET created_at = NOW() - INTERVAL '2 hours',
        expires_at = NOW() - INTERVAL '1 hour'
    WHERE id = 24
      AND revoked_at IS NULL
    RETURNING id, created_at, expires_at, revoked_at;
""")

result = cur.fetchone()
conn.commit()

if result:
    print("Expiry test setup successful!")
    print(result)
else:
    print("Share ID 24 not found or already revoked.")

cur.close()
conn.close()
