import os
from database import get_connection

def alter_tables():
    conn = get_connection(with_db=True)
    try:
        with conn.cursor() as cursor:
            for table in ["detailed_report", "detailed_report_staging", "daily_snapshot"]:
                try:
                    cursor.execute(f"ALTER TABLE {table} ADD postman_name NVARCHAR(200)")
                    print(f"Added postman_name to {table}")
                except Exception as e:
                    print(f"Error altering {table} (might already exist): {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    alter_tables()
