
import psycopg

DATABASE_URL = (
    "postgresql://trustshare_user:trustshare_dev_password"
    "@localhost:5432/trustshare"
)

ADMIN_EMAIL = "sireeshakottavalasa2@gmail.com"

try:
    with psycopg.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE users
                SET role = 'admin'
                WHERE LOWER(email) = LOWER(%s)
                RETURNING email, role;
                """,
                (ADMIN_EMAIL,),
            )

            result = cur.fetchone()

            if result:
                print("Admin role assigned successfully!")
                print("Email:", result[0])
                print("Role:", result[1])
            else:
                print("Email not found. Register this email first.")

except Exception as error:
    print("Error:", error)
