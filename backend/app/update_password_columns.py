
from sqlalchemy import inspect, text
from app.database import mysql_engine


def update_password_columns():
    inspector = inspect(mysql_engine)

    tables = {
        "folders": "password_hash",
        "stored_files": "password_hash",
    }

    with mysql_engine.begin() as connection:
        for table, column in tables.items():
            existing_columns = {
                item["name"]
                for item in inspect(connection).get_columns(table)
            }

            if column in existing_columns:
                print(f"{table}.{column} already exists. Skipping.")
            else:
                connection.execute(
                    text(
                        f"ALTER TABLE `{table}` "
                        f"ADD COLUMN `{column}` VARCHAR(255) NULL"
                    )
                )
                print(f"Added {table}.{column} successfully.")

    print("Database update completed.")


if __name__ == "__main__":
    try:
        update_password_columns()
    except Exception as error:
        print("Database update failed.")
        print(f"Error type: {type(error).__name__}")
        print(error)
