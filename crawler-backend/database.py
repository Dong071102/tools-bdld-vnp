import pymssql
import logging
import os
from datetime import datetime

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

import socket

DB_HOST = os.environ.get("DB_SERVER")
DB_PORT = os.environ.get("DB_PORT", "1433")
DB_USER = os.environ.get("DB_USER")
DB_PASS = os.environ.get("DB_PASSWORD")
DB_NAME = os.environ.get("DB_NAME")

def test_tcp_connection(host, port):
    """Test if the SQL Server port is reachable via TCP."""
    if not host:
        return False, "DB_SERVER env var is empty"
    try:
        port_num = int(port)
    except ValueError:
        return False, f"Invalid port: {port}"
        
    try:
        with socket.create_connection((host, port_num), timeout=3) as sock:
            return True, "Reachable"
    except Exception as e:
        return False, f"TCP Connection to {host}:{port_num} failed: {e}"

def get_connection(with_db=True, autocommit=True):
    """Establish a connection to the SQL Server database."""
    # Run a diagnostic TCP check first
    reachable, msg = test_tcp_connection(DB_HOST, DB_PORT)
    if not reachable:
        logger.warning(f"Database port diagnostic check: {msg}")
    else:
        logger.info("Database port diagnostic check: Port is reachable")

    conn_params = {
        "server": DB_HOST,
        "user": DB_USER,
        "password": DB_PASS,
        "charset": 'utf8',
        "autocommit": autocommit
    }
    
    if DB_PORT:
        try:
            conn_params["port"] = int(DB_PORT)
        except ValueError:
            pass
            
    if with_db:
        conn_params["database"] = DB_NAME
        
    return pymssql.connect(**conn_params)

def init_db():
    """Create database and tables in MS SQL Server if they do not exist."""
    # 1. Create database if not exists
    conn = get_connection(with_db=False)
    try:
        with conn.cursor() as cursor:
            cursor.execute(f"""
                IF NOT EXISTS (SELECT * FROM sys.databases WHERE name = '{DB_NAME}')
                BEGIN
                    CREATE DATABASE {DB_NAME}
                END
            """)
        logger.info(f"Database {DB_NAME} checked/created successfully.")
    except Exception as e:
        logger.error(f"Error creating database: {e}")
        raise e
    finally:
        conn.close()

    # 2. Create tables
    conn = get_connection(with_db=True)
    try:
        with conn.cursor() as cursor:
            # Detailed report table (latest data snapshot, updated on every crawl)
            cursor.execute("""
                IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'detailed_report')
                BEGIN
                    CREATE TABLE detailed_report (
                        item_code VARCHAR(50) PRIMARY KEY,
                        province_ton NVARCHAR(100),
                        pos_code VARCHAR(50),
                        pos_name NVARCHAR(200),
                        dk1 VARCHAR(50),
                        status_name NVARCHAR(100),
                        loai_ton NVARCHAR(50),
                        nhom_kh NVARCHAR(100),
                        cod_amount DECIMAL(15, 2),
                        weight DECIMAL(10, 3),
                        color_code VARCHAR(20),
                        postman_name NVARCHAR(200),
                        updated_at DATETIME DEFAULT GETDATE()
                    )
                END
            """)
            
            # Detailed report staging table (temporary buffer for atomic load)
            cursor.execute("""
                IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'detailed_report_staging')
                BEGIN
                    CREATE TABLE detailed_report_staging (
                        item_code VARCHAR(50) PRIMARY KEY,
                        province_ton NVARCHAR(100),
                        pos_code VARCHAR(50),
                        pos_name NVARCHAR(200),
                        dk1 VARCHAR(50),
                        status_name NVARCHAR(100),
                        loai_ton NVARCHAR(50),
                        nhom_kh NVARCHAR(100),
                        cod_amount DECIMAL(15, 2),
                        weight DECIMAL(10, 3),
                        color_code VARCHAR(20),
                        postman_name NVARCHAR(200),
                        updated_at DATETIME DEFAULT GETDATE()
                    )
                END
            """)
            
            # Daily snapshot table for midnight logging
            cursor.execute("""
                IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'daily_snapshot')
                BEGIN
                    CREATE TABLE daily_snapshot (
                        id INT IDENTITY(1,1) PRIMARY KEY,
                        snapshot_date DATE NOT NULL,
                        item_code VARCHAR(50) NOT NULL,
                        province_ton NVARCHAR(100),
                        pos_code VARCHAR(50),
                        pos_name NVARCHAR(200),
                        dk1 VARCHAR(50),
                        status_name NVARCHAR(100),
                        loai_ton NVARCHAR(50),
                        nhom_kh NVARCHAR(100),
                        cod_amount DECIMAL(15, 2),
                        weight DECIMAL(10, 3),
                        color_code VARCHAR(20),
                        postman_name NVARCHAR(200),
                        created_at DATETIME DEFAULT GETDATE(),
                        CONSTRAINT uq_date_item UNIQUE (snapshot_date, item_code)
                    )
                END
            """)
            
            # users table
            cursor.execute("""
                IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'users')
                BEGIN
                    CREATE TABLE users (
                        id INT IDENTITY(1,1) PRIMARY KEY,
                        username VARCHAR(255) UNIQUE NOT NULL,
                        password_hash VARCHAR(255) NOT NULL,
                        role VARCHAR(50) NOT NULL,
                        vnpost_cookie NVARCHAR(MAX),
                        vnpost_username VARCHAR(255),
                        vnpost_password VARCHAR(255),
                        concurrency_limit INT DEFAULT 3,
                        created_at DATETIME DEFAULT GETDATE()
                    )
                END
            """)
            
            # export_history table
            cursor.execute("""
                IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'export_history')
                BEGIN
                    CREATE TABLE export_history (
                        id INT IDENTITY(1,1) PRIMARY KEY,
                        user_id INT NOT NULL,
                        export_time DATETIME DEFAULT GETDATE(),
                        total_codes INT NOT NULL,
                        success_codes INT NOT NULL,
                        file_name VARCHAR(255) NOT NULL,
                        file_data_blob VARBINARY(MAX),
                        status VARCHAR(50) NOT NULL,
                        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                    )
                END
            """)

            # exported_items table
            cursor.execute("""
                IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'exported_items')
                BEGIN
                    CREATE TABLE exported_items (
                        id INT IDENTITY(1,1) PRIMARY KEY,
                        history_id INT NOT NULL,
                        tracking_code VARCHAR(100) NOT NULL,
                        data_json NVARCHAR(MAX) NOT NULL,
                        FOREIGN KEY (history_id) REFERENCES export_history(id) ON DELETE CASCADE
                    )
                END
            """)
            
            # Index on snapshot_date
            try:
                cursor.execute("CREATE INDEX idx_snapshot_date ON daily_snapshot(snapshot_date)")
            except Exception:
                pass
            try:
                cursor.execute("CREATE INDEX idx_detailed_province ON detailed_report(province_ton)")
            except Exception:
                pass
            try:
                cursor.execute("CREATE INDEX idx_staging_province ON detailed_report_staging(province_ton)")
            except Exception:
                pass
                
            # Seed default admin user
            cursor.execute("SELECT COUNT(*) FROM users")
            count = cursor.fetchone()[0]
            if count == 0:
                import bcrypt
                default_username = "lamdong"
                default_password = "Lamdong@2026"
                hashed = bcrypt.hashpw(default_password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
                cursor.execute("""
                    INSERT INTO users (username, password_hash, role, concurrency_limit, vnpost_username, vnpost_password)
                    VALUES (%s, %s, %s, %s, %s, %s)
                """, (default_username, hashed, "admin", 5, default_username, default_password))
                logger.info(f"Default admin user '{default_username}' created successfully.")
            
        logger.info("Tables created and initialized successfully.")
    except Exception as e:
        logger.error(f"Error initializing tables: {e}")
        raise e
    finally:
        conn.close()

def save_detailed_data(rows):
    """
    Save rows temporarily into detailed_report_staging (live/real-time table).
    Each crawl replaces ALL previous data (TRUNCATE → INSERT).
    No permanent detailed_report table write — staging IS the live source.
    """
    if not rows:
        return
        
    conn = get_connection(with_db=True, autocommit=False)
    try:
        with conn.cursor() as cursor:
            # Step 1: Clear all previous crawl data in a transaction
            cursor.execute("TRUNCATE TABLE detailed_report_staging")
            
            # Step 2: Insert new crawl data (deduplicated by item_code)
            sql = """
                INSERT INTO detailed_report_staging (
                    item_code, province_ton, pos_code, pos_name, dk1, 
                    status_name, loai_ton, nhom_kh, cod_amount, weight, color_code, postman_name
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """
            
            # Deduplicate by item_code (Power BI sometimes returns duplicate barcodes, case-insensitive in SQL Server)
            seen_codes = set()
            batch_data = []
            for r in rows:
                code = r.get('item_code')
                if not code:
                    continue
                code_clean = str(code).upper().strip()
                if code_clean not in seen_codes:
                    seen_codes.add(code_clean)
                    batch_data.append((
                        code_clean, r['province_ton'], r['pos_code'], r['pos_name'], r['dk1'],
                        r['status_name'], r['loai_ton'], r.get('nhom_kh'), r['cod_amount'], r['weight'], r['color_code'], r.get('postman_name')
                    ))
            
            cursor.executemany(sql, batch_data)
        conn.commit()
                
        logger.info(f"Live crawl: replaced staging table with {len(batch_data)} unique rows (from {len(rows)} raw rows).")
    except Exception as e:
        conn.rollback()
        logger.error(f"Error saving detailed data to staging: {e}")
        raise e
    finally:
        conn.close()

def create_daily_snapshot():
    """
    Copy all records from detailed_report to daily_snapshot for the current day.
    Run this at midnight.
    """
    conn = get_connection(with_db=True)
    today_str = datetime.now().strftime("%Y-%m-%d")
    try:
        with conn.cursor() as cursor:
            # Check if snapshot for today already exists
            cursor.execute("SELECT COUNT(*) as cnt FROM daily_snapshot WHERE snapshot_date = %s", (today_str,))
            result = cursor.fetchone()
            if result and result[0] > 0: # pymssql cursor default might return tuple if not specified otherwise
                logger.info(f"Daily snapshot for {today_str} already exists. Skipping.")
                return
                
            # Copy data using MERGE or INSERT with a check
            # In MS SQL, we can do a left join or WHERE NOT EXISTS to avoid duplicate key exceptions
            sql = """
                INSERT INTO daily_snapshot (
                    snapshot_date, item_code, province_ton, pos_code, pos_name, 
                    dk1, status_name, loai_ton, nhom_kh, cod_amount, weight, color_code, postman_name
                )
                SELECT %s, item_code, province_ton, pos_code, pos_name, 
                       dk1, status_name, loai_ton, nhom_kh, cod_amount, weight, color_code, postman_name
                FROM detailed_report_staging d
                WHERE province_ton = %s
                  AND NOT EXISTS (
                      SELECT 1 FROM daily_snapshot s 
                      WHERE s.snapshot_date = %s 
                        AND s.item_code = d.item_code
                  )
            """
            cursor.execute(sql, (today_str, 'BĐT Lâm Đồng', today_str))
        logger.info(f"Created daily snapshot for {today_str} successfully.")
    except Exception as e:
        logger.error(f"Error creating daily snapshot: {e}")
        raise e
    finally:
        conn.close()

if __name__ == "__main__":
    init_db()
