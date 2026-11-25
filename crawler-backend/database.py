import logging
import os
import re
import socket
from datetime import datetime

import bcrypt
import pymssql

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

DB_HOST = os.environ.get("DB_SERVER")
DB_PORT = os.environ.get("DB_PORT", "1433")
DB_USER = os.environ.get("DB_USER")
DB_PASS = os.environ.get("DB_PASSWORD")
DB_NAME = os.environ.get("DB_NAME")

REPORT_COLUMNS = (
    "item_code, province_ton, pos_code, pos_name, dk1, "
    "status_name, loai_ton, nhom_kh, cod_amount, weight, color_code, postman_name"
)

REPORT_TABLE_SCHEMA = """
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
"""

POS_CLASSIFY_SQL = """
    CASE
        WHEN UPPER(LTRIM(RTRIM({col}))) LIKE 'BCKT%' THEN 0
        ELSE 1
    END AS is_active,
    CASE
        WHEN UPPER(LTRIM(RTRIM({col}))) LIKE 'BCKT%' THEN 'BCKT'
        WHEN UPPER(LTRIM(RTRIM({col}))) LIKE 'BCP%' THEN 'BCP'
        ELSE 'OTHER'
    END AS pos_type
"""


def test_tcp_connection(host, port):
    """Test if the SQL Server port is reachable via TCP."""
    if not host:
        return False, "DB_SERVER env var is empty"
    try:
        port_num = int(port)
    except ValueError:
        return False, f"Invalid port: {port}"
    try:
        with socket.create_connection((host, port_num), timeout=3):
            return True, "Reachable"
    except Exception as e:
        return False, f"TCP Connection to {host}:{port_num} failed: {e}"


def get_connection(with_db=True, autocommit=True):
    """Establish a connection to the SQL Server database."""
    conn_params = {
        "server": DB_HOST,
        "user": DB_USER,
        "password": DB_PASS,
        "charset": "utf8",
        "autocommit": autocommit,
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
    reachable, msg = test_tcp_connection(DB_HOST, DB_PORT)
    if not reachable:
        logger.warning(f"Database port diagnostic check: {msg}")

    if not DB_NAME or not re.fullmatch(r"[A-Za-z0-9_]+", DB_NAME):
        raise ValueError(f"Invalid DB_NAME identifier: {DB_NAME!r}")

    conn = get_connection(with_db=False)
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                f"IF NOT EXISTS (SELECT * FROM sys.databases WHERE name = %s) BEGIN CREATE DATABASE [{DB_NAME}] END",
                (DB_NAME,),
            )
        logger.info(f"Database {DB_NAME} checked/created successfully.")
    except Exception as e:
        logger.error(f"Error creating database: {e}")
        raise
    finally:
        conn.close()

    conn = get_connection(with_db=True)
    try:
        with conn.cursor() as cursor:
            for tbl in ("detailed_report", "detailed_report_staging"):
                cursor.execute(f"""
                    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = '{tbl}')
                    BEGIN CREATE TABLE {tbl} ({REPORT_TABLE_SCHEMA}) END
                """)

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

            cursor.execute("""
                IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'pos_config')
                BEGIN
                    CREATE TABLE pos_config (
                        pos_code VARCHAR(50) PRIMARY KEY,
                        pos_name NVARCHAR(200) NOT NULL,
                        is_active BIT DEFAULT 1,
                        pos_type VARCHAR(50) DEFAULT 'BCP',
                        updated_at DATETIME DEFAULT GETDATE()
                    )
                END
            """)

            try:
                cursor.execute(f"""
                    IF NOT EXISTS (SELECT 1 FROM pos_config)
                    BEGIN
                        INSERT INTO pos_config (pos_code, pos_name, is_active, pos_type, updated_at)
                        SELECT DISTINCT d.pos_code, d.pos_name, {POS_CLASSIFY_SQL.format(col='d.pos_name')}, GETDATE()
                        FROM detailed_report_staging d
                        WHERE d.pos_code IS NOT NULL AND d.pos_name IS NOT NULL
                    END
                """)
            except Exception as pe:
                logger.warning(f"Could not seed pos_config initially: {pe}")

            for idx_sql in (
                "CREATE INDEX idx_snapshot_date ON daily_snapshot(snapshot_date)",
                "CREATE INDEX idx_detailed_province ON detailed_report(province_ton)",
                "CREATE INDEX idx_staging_province ON detailed_report_staging(province_ton)",
            ):
                try:
                    cursor.execute(idx_sql)
                except Exception:
                    pass

            cursor.execute("SELECT COUNT(*) FROM users")
            if cursor.fetchone()[0] == 0:
                default_username = os.environ.get("DEFAULT_ADMIN_USER", "lamdong")
                default_password = os.environ.get("DEFAULT_ADMIN_PASSWORD", "Lamdong@2026")
                hashed = bcrypt.hashpw(default_password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
                cursor.execute(
                    """
                    INSERT INTO users (username, password_hash, role, concurrency_limit, vnpost_username, vnpost_password)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    """,
                    (default_username, hashed, "admin", 5, default_username, default_password),
                )
                logger.info(f"Default admin user '{default_username}' created successfully.")

        logger.info("Tables created and initialized successfully.")
    except Exception as e:
        logger.error(f"Error initializing tables: {e}")
        raise
    finally:
        conn.close()


def save_detailed_data(rows):
    """Replace detailed_report_staging atomically via a session-local temp table."""
    if not rows:
        return

    conn = get_connection(with_db=True, autocommit=False)
    try:
        with conn.cursor() as cursor:
            cursor.execute(f"""
                IF OBJECT_ID('tempdb..#detailed_report_staging_temp') IS NOT NULL
                    DROP TABLE #detailed_report_staging_temp;
                CREATE TABLE #detailed_report_staging_temp ({REPORT_TABLE_SCHEMA});
            """)

            seen_codes = set()
            batch_data = []
            for r in rows:
                code = r.get("item_code")
                if not code:
                    continue
                code_clean = str(code).upper().strip()
                if code_clean not in seen_codes:
                    seen_codes.add(code_clean)
                    batch_data.append((
                        code_clean, r["province_ton"], r["pos_code"], r["pos_name"], r["dk1"],
                        r["status_name"], r["loai_ton"], r.get("nhom_kh"), r["cod_amount"],
                        r["weight"], r["color_code"], r.get("postman_name"),
                    ))

            logger.info(f"Prepared {len(batch_data)} rows for insertion into temp table.")

            row_ph = "(%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)"
            for i in range(0, len(batch_data), 500):
                chunk = batch_data[i : i + 500]
                placeholders = ", ".join([row_ph] * len(chunk))
                flat_params = [val for row in chunk for val in row]
                cursor.execute(
                    f"INSERT INTO #detailed_report_staging_temp ({REPORT_COLUMNS}) VALUES {placeholders}",
                    tuple(flat_params),
                )

            cursor.execute("TRUNCATE TABLE detailed_report_staging")
            cursor.execute(
                f"INSERT INTO detailed_report_staging ({REPORT_COLUMNS}) "
                f"SELECT {REPORT_COLUMNS} FROM #detailed_report_staging_temp"
            )

            # Preserve custom POS display names configured in pos_config
            cursor.execute("""
                UPDATE d
                SET d.pos_name = c.pos_name
                FROM detailed_report_staging d
                INNER JOIN pos_config c ON d.pos_code = c.pos_code
                WHERE c.pos_name IS NOT NULL AND LTRIM(RTRIM(c.pos_name)) <> '' AND c.pos_name <> d.pos_name
            """)

            # Auto-learn newly seen post offices
            cursor.execute(f"""
                INSERT INTO pos_config (pos_code, pos_name, is_active, pos_type, updated_at)
                SELECT DISTINCT t.pos_code, t.pos_name, {POS_CLASSIFY_SQL.format(col='t.pos_name')}, GETDATE()
                FROM #detailed_report_staging_temp t
                WHERE t.pos_code IS NOT NULL AND t.pos_name IS NOT NULL
                  AND NOT EXISTS (SELECT 1 FROM pos_config c WHERE c.pos_code = t.pos_code)
            """)
            if cursor.rowcount > 0:
                logger.info(f"Auto-learned {cursor.rowcount} new post office(s) into pos_config.")

        conn.commit()
        logger.info(f"Live crawl: replaced staging table with {len(batch_data)} unique rows (from {len(rows)} raw rows).")
    except Exception as e:
        conn.rollback()
        logger.error(f"Error saving detailed data to staging: {e}")
        raise
    finally:
        conn.close()


def create_daily_snapshot():
    """Copy current staging records to daily_snapshot for today and purge >90-day rows."""
    conn = get_connection(with_db=True)
    today_str = datetime.now().strftime("%Y-%m-%d")
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT COUNT(*) FROM daily_snapshot WHERE snapshot_date = %s", (today_str,))
            result = cursor.fetchone()
            if result and result[0] > 0:
                logger.info(f"Daily snapshot for {today_str} already exists. Skipping.")
                return

            cursor.execute(
                f"""
                INSERT INTO daily_snapshot (snapshot_date, {REPORT_COLUMNS})
                SELECT %s, {REPORT_COLUMNS}
                FROM detailed_report_staging d
                WHERE province_ton = %s
                  AND NOT EXISTS (
                      SELECT 1 FROM daily_snapshot s
                      WHERE s.snapshot_date = %s AND s.item_code = d.item_code
                  )
                """,
                (today_str, "BĐT Lâm Đồng", today_str),
            )
        logger.info(f"Created daily snapshot for {today_str} successfully.")
        purge_old_snapshots(retention_days=90)
    except Exception as e:
        logger.error(f"Error creating daily snapshot: {e}")
        raise
    finally:
        conn.close()


def purge_old_snapshots(retention_days: int = 90):
    """Purge daily_snapshot records older than retention_days to stay under SQL Express 10GB cap."""
    conn = None
    try:
        conn = get_connection(with_db=True, autocommit=True)
        with conn.cursor() as cursor:
            cursor.execute(
                "DELETE FROM daily_snapshot WHERE snapshot_date < DATEADD(day, -%s, GETDATE())",
                (retention_days,),
            )
            if cursor.rowcount and cursor.rowcount > 0:
                logger.info(f"Purged {cursor.rowcount} daily_snapshot records older than {retention_days} days.")
    except Exception as e:
        logger.error(f"Error purging old daily snapshots: {e}")
    finally:
        if conn:
            conn.close()


if __name__ == "__main__":
    init_db()
