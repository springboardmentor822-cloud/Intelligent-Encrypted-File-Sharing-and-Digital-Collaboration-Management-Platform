
import psycopg

DATABASE_URL = "postgresql://trustshare_user:trustshare_dev_password@localhost:5432/trustshare"


def test_db_connection():
    try:
        with psycopg.connect(DATABASE_URL, connect_timeout=5) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT version();")
                result = cur.fetchone()
                print("PostgreSQL connection successful!")
                print(result[0])
    except Exception as e:
        print("Database connection failed:", e)


def create_users_table():
    try:
        with psycopg.connect(DATABASE_URL, connect_timeout=5) as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS users (
                        id SERIAL PRIMARY KEY,
                        full_name VARCHAR(100) NOT NULL,
                        email VARCHAR(255) UNIQUE NOT NULL,
                        password_hash TEXT NOT NULL,
                        role VARCHAR(20) NOT NULL DEFAULT 'user'
                            CHECK (role IN ('admin', 'user', 'guest')),
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    );
                """)

                cur.execute("""
                    ALTER TABLE users
                    ADD COLUMN IF NOT EXISTS role
                    VARCHAR(20) NOT NULL DEFAULT 'user'
                    CHECK (role IN ('admin', 'user', 'guest'));
                """)

        print("Users table and role column are ready!")

    except Exception as e:
        print("Table creation/update failed:", e)


def verify_users_table():
    try:
        with psycopg.connect(DATABASE_URL, connect_timeout=5) as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT column_name, data_type
                    FROM information_schema.columns
                    WHERE table_name = 'users'
                    ORDER BY ordinal_position;
                """)

                print("Users table columns:")
                for row in cur.fetchall():
                    print(row)

    except Exception as e:
        print("Verification failed:", e)


if __name__ == "__main__":
    test_db_connection()
    create_users_table()
    verify_users_table()
