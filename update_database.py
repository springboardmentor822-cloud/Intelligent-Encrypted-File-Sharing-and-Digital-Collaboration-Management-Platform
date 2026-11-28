
import sqlite3

connection = sqlite3.connect("trustshare.db")
cursor = connection.cursor()

columns = [
    column[1]
    for column in cursor.execute("PRAGMA table_info(users)").fetchall()
]

if "role" not in columns:
    cursor.execute(
        "ALTER TABLE users ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'User'"
    )
    connection.commit()
    print("Success: role column added.")
else:
    print("The role column already exists.")

connection.close()
