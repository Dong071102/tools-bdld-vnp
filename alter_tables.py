import os
import pymssql

DB_HOST = os.environ.get("DB_SERVER", "10.61.200.10")
DB_USER = os.environ.get("DB_USER", "sa")
DB_PASS = os.environ.get("DB_PASSWORD", "Sadmin123")
DB_NAME = os.environ.get("DB_NAME", "caw_powerbi_db")
DB_PORT = "1433"

def alter_tables():
    conn = pymssql.connect(server=DB_HOST, user=DB_USER, password=DB_PASS, database=DB_NAME, charset='utf8', autocommit=True)
    try:
        with conn.cursor() as cursor:
            print("Adding nhom_kh to detailed_report...")
            try:
                cursor.execute("ALTER TABLE detailed_report ADD nhom_kh NVARCHAR(100)")
            except Exception as e:
                print(e)
                
            print("Adding nhom_kh to detailed_report_staging...")
            try:
                cursor.execute("ALTER TABLE detailed_report_staging ADD nhom_kh NVARCHAR(100)")
            except Exception as e:
                print(e)
                
            print("Adding nhom_kh to daily_snapshot...")
            try:
                cursor.execute("ALTER TABLE daily_snapshot ADD nhom_kh NVARCHAR(100)")
            except Exception as e:
                print(e)
                
        print("Done altering tables.")
    except Exception as e:
        print(f"Error: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    alter_tables()
