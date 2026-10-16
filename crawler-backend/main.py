from fastapi import FastAPI, Query, BackgroundTasks, Depends, Header, HTTPException, Request, Response
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
import jwt
import bcrypt
from pydantic import BaseModel
from typing import Optional
import pandas as pd
import io
import uvicorn
import logging
import threading
import time
import webbrowser
from datetime import datetime, timedelta
import sys
import io
from openpyxl import Workbook
import os
import requests

from database import get_connection, create_daily_snapshot, init_db
from pbi_crawler import crawl_lamdong_data, PowerBIUrlError, check_powerbi_url_health

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

DINHVI_BACKEND_URL = os.getenv("DINHVI_BACKEND_URL", "http://localhost:5000")

# SQLite Sync is deprecated since both backends now share the same SQL Server database.
# Keeping empty functions to avoid breaking other imports/invocations.
def sync_user_to_sqlite(username, role, concurrency_limit, password_hash=None, vnpost_username=None, vnpost_password=None):
    pass

def delete_user_from_sqlite(username):
    pass

app = FastAPI(title="Lâm Đồng Power BI Dashboard Clone")

# Shared state to prevent concurrent crawls
crawl_lock = threading.Lock()
is_crawling = False
last_crawl_time = None
last_crawl_status = "Not started"
last_crawl_url_error = False
last_crawl_error_detail = ""
last_crawl_http_status = None

def run_crawler_task():
    """Wrapper to run crawler thread-safely."""
    global is_crawling, last_crawl_time, last_crawl_status, last_crawl_url_error, last_crawl_error_detail, last_crawl_http_status
    if crawl_lock.locked():
        logger.warning("Crawl already in progress. Skipping.")
        return
        
    with crawl_lock:
        is_crawling = True
        last_crawl_status = "In progress"
        try:
            success = crawl_lamdong_data()
            last_crawl_time = datetime.now()
            if success:
                last_crawl_status = "Success"
                last_crawl_url_error = False
                last_crawl_error_detail = ""
                last_crawl_http_status = 200
            else:
                last_crawl_status = "Failed"
        except PowerBIUrlError as pbi_err:
            last_crawl_time = datetime.now()
            last_crawl_status = f"URL Error ({pbi_err.status_code or 'Network'})"
            last_crawl_url_error = True
            last_crawl_error_detail = str(pbi_err)
            last_crawl_http_status = pbi_err.status_code
            logger.error(f"Power BI URL error: {pbi_err}")
        except Exception as e:
            last_crawl_time = datetime.now()
            logger.error(f"Error in background crawl: {e}")
            last_crawl_status = f"Error: {e}"
            err_str = str(e).lower()
            if any(k in err_str for k in ["401", "403", "404", "url", "connection"]):
                last_crawl_url_error = True
                last_crawl_error_detail = str(e)
        finally:
            is_crawling = False

# Background scheduler thread
def scheduler_thread():
    """
    Background scheduler to:
    1. Probe URL health immediately on startup.
    2. Run crawl every 10 minutes.
    3. Run daily snapshot at 00:00 midnight.
    """
    logger.info("Background scheduler thread started.")
    global last_crawl_url_error, last_crawl_error_detail, last_crawl_http_status, last_crawl_status

    # 1. Quick probe on startup
    try:
        is_valid, msg, code = check_powerbi_url_health()
        if not is_valid:
            last_crawl_url_error = True
            last_crawl_error_detail = "Lỗi URL Power BI, liên hệ bộ phận IT để hỗ trợ"
            last_crawl_http_status = code
            last_crawl_status = f"URL Error ({code or 'Network'})"
            logger.warning(f"Initial Power BI health check failed: {msg}")
        else:
            logger.info("Initial Power BI health check passed.")
    except Exception as e:
        logger.error(f"Error in initial health check: {e}")
    
    # Run initial crawl on startup after a brief delay (only if not blocked by URL error)
    time.sleep(5)
    run_crawler_task()
    
    last_crawl_run = datetime.now()
    last_snapshot_date = datetime.now().date() - timedelta(days=1)  # force run today if not done
    
    while True:
        try:
            now = datetime.now()
            
            # 1. Check for midnight snapshot (00:00)
            if now.hour == 0 and now.date() > last_snapshot_date:
                logger.info(f"Midnight reached. Creating daily snapshot for date {now.date()}...")
                create_daily_snapshot()
                last_snapshot_date = now.date()
                
            # 2. Run crawl every 10 minutes
            if (now - last_crawl_run).total_seconds() >= 600: # 10 minutes
                logger.info("10 minutes elapsed. Running scheduled crawl...")
                run_crawler_task()
                last_crawl_run = now
                
        except Exception as e:
            logger.error(f"Error in scheduler loop: {e}")
            
        time.sleep(30) # Check every 30 seconds

# API Endpoints
@app.get("/api/status")
def get_status():
    """Get the current crawling status and last update time."""
    return {
        "is_crawling": is_crawling,
        "last_crawl_time": last_crawl_time.strftime("%Y-%m-%d %H:%M:%S") if last_crawl_time else None,
        "last_crawl_status": last_crawl_status,
        "url_error": last_crawl_url_error,
        "error_message": last_crawl_error_detail,
        "http_status": last_crawl_http_status
    }

@app.get("/api/check-pbi-url")
def check_pbi_url():
    """Explicitly check Power BI URL health."""
    global last_crawl_url_error, last_crawl_error_detail, last_crawl_http_status, last_crawl_status
    is_valid, msg, code = check_powerbi_url_health()
    if not is_valid:
        full_msg = "Lỗi URL Power BI, liên hệ bộ phận IT để hỗ trợ"
        last_crawl_url_error = True
        last_crawl_error_detail = full_msg
        last_crawl_http_status = code
        last_crawl_status = f"URL Error ({code or 'Network'})"
    else:
        full_msg = ""
        last_crawl_url_error = False
        last_crawl_error_detail = ""
        last_crawl_http_status = 200
        last_crawl_status = "Online"
    return {
        "is_valid": is_valid,
        "error_message": full_msg,
        "http_status": code
    }

@app.post("/api/trigger-crawl")
def trigger_crawl(background_tasks: BackgroundTasks):
    """Manually trigger a crawl in a background task."""
    global is_crawling, last_crawl_url_error, last_crawl_error_detail, last_crawl_http_status, last_crawl_status
    if is_crawling:
        return {"status": "already_running", "message": "Crawl is already in progress"}
    
    # If URL error is flagged, probe first to see if link was updated
    is_valid, msg, code = check_powerbi_url_health()
    if not is_valid:
        last_crawl_url_error = True
        last_crawl_error_detail = "Lỗi URL Power BI, liên hệ bộ phận IT để hỗ trợ"
        last_crawl_http_status = code
        last_crawl_status = f"URL Error ({code or 'Network'})"
        return {
            "status": "url_error",
            "message": "Lỗi URL Power BI, liên hệ bộ phận IT để hỗ trợ"
        }

    # URL is valid, clear error and run
    last_crawl_url_error = False
    last_crawl_error_detail = ""
    last_crawl_http_status = 200
    background_tasks.add_task(run_crawler_task)
    return {"status": "triggered", "message": "Crawl triggered successfully"}

# --- POS CONFIGURATION MODELS & ENDPOINTS ---
class PosConfigItem(BaseModel):
    pos_code: str
    is_active: bool

class PosConfigRequest(BaseModel):
    configs: list[PosConfigItem]

@app.get("/api/pos-config")
def get_pos_configs():
    """Get list of all post offices with active status, type, and current item count."""
    conn = get_connection(with_db=True)
    try:
        with conn.cursor() as cursor:
            cursor.execute("""
                SELECT 
                    c.pos_code, 
                    c.pos_name, 
                    c.is_active, 
                    c.pos_type, 
                    c.updated_at,
                    COUNT(d.item_code) as item_count
                FROM pos_config c
                LEFT JOIN detailed_report_staging d ON c.pos_code = d.pos_code AND d.province_ton = N'BĐT Lâm Đồng'
                GROUP BY c.pos_code, c.pos_name, c.is_active, c.pos_type, c.updated_at
                ORDER BY c.is_active DESC, c.pos_name ASC
            """)
            rows = cursor.fetchall()
            results = []
            for r in rows:
                results.append({
                    "pos_code": r[0],
                    "pos_name": r[1],
                    "is_active": bool(r[2]),
                    "pos_type": r[3] or "OTHER",
                    "updated_at": r[4].strftime("%Y-%m-%d %H:%M:%S") if r[4] else None,
                    "item_count": r[5] or 0
                })
            return results
    except Exception as e:
        logger.error(f"Error fetching pos config: {e}")
        return []
    finally:
        conn.close()

@app.post("/api/pos-config")
def update_pos_configs(req: PosConfigRequest):
    """Batch update is_active status for post offices."""
    if not req.configs:
        return {"status": "ok", "updated": 0}
    conn = get_connection(with_db=True, autocommit=False)
    try:
        with conn.cursor() as cursor:
            for item in req.configs:
                cursor.execute("""
                    UPDATE pos_config 
                    SET is_active = %s, updated_at = GETDATE()
                    WHERE pos_code = %s
                """, (1 if item.is_active else 0, item.pos_code.strip()))
        conn.commit()
        return {"status": "ok", "updated": len(req.configs)}
    except Exception as e:
        conn.rollback()
        logger.error(f"Error updating pos config: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.get("/api/filters")
def get_filters():
    """Get unique filters list for dropdowns (POSNames, Statuses, Category ages). Filtered by active POS."""
    conn = get_connection(with_db=True)
    try:
        with conn.cursor() as cursor:
            # POS Names list (only active post offices)
            cursor.execute("""
                SELECT DISTINCT pos_name 
                FROM detailed_report_staging 
                WHERE province_ton = N'BĐT Lâm Đồng' 
                  AND pos_name IS NOT NULL
                  AND (
                      NOT EXISTS (SELECT 1 FROM pos_config WHERE is_active = 1)
                      OR pos_code IN (SELECT pos_code FROM pos_config WHERE is_active = 1)
                  )
                ORDER BY pos_name
            """)
            pos_names = [r[0] for r in cursor.fetchall() if r[0]]
            
            # Status Names list
            cursor.execute("""
                SELECT DISTINCT status_name 
                FROM detailed_report_staging 
                WHERE province_ton = N'BĐT Lâm Đồng' AND status_name IS NOT NULL
                ORDER BY status_name
            """)
            status_names = [r[0] for r in cursor.fetchall() if r[0]]
            
            # Category list
            cursor.execute("""
                SELECT DISTINCT loai_ton,
                    CASE 
                        WHEN loai_ton = N'<1 ngày' THEN 0.5
                        WHEN loai_ton = N'≥1 ngày' THEN 1
                        WHEN loai_ton = N'≥1.5 ngày' THEN 1.5
                        WHEN loai_ton = N'≥2 ngày' THEN 2
                        WHEN loai_ton = N'≥3 ngày' THEN 3
                        WHEN loai_ton = N'≥4 ngày' THEN 4
                        WHEN loai_ton = N'≥5 ngày' THEN 5
                        WHEN loai_ton = N'≥7 ngày' THEN 7
                        WHEN loai_ton = N'≥14 ngày' THEN 14
                        ELSE 99
                    END as sort_order
                FROM detailed_report_staging 
                WHERE province_ton = N'BĐT Lâm Đồng' AND loai_ton IS NOT NULL
                ORDER BY sort_order ASC
            """)
            loai_tons = [r[0] for r in cursor.fetchall() if r[0]]
            
            # Nhom_KH list
            cursor.execute("""
                SELECT DISTINCT nhom_kh 
                FROM detailed_report_staging 
                WHERE province_ton = N'BĐT Lâm Đồng' AND nhom_kh IS NOT NULL
                ORDER BY nhom_kh
            """)
            nhom_khs = [r[0] for r in cursor.fetchall() if r[0]]
            
            return {
                "pos_names": pos_names,
                "status_names": status_names,
                "loai_tons": loai_tons,
                "nhom_khs": nhom_khs
            }
    except Exception as e:
        logger.error(f"Error fetching filters: {e}")
        return {"pos_names": [], "status_names": [], "loai_tons": [], "nhom_khs": []}
    finally:
        conn.close()

@app.get("/api/summary")
def get_summary(nhom_kh: str = ""):
    """Get KPI summary cards and the pivot matrix data by POS office, filtered by active POS."""
    conn = get_connection(with_db=True)
    try:
        with conn.cursor() as cursor:
            nhom_filter_sql = ""
            params1 = []
            params2 = []
            if nhom_kh:
                nhoms = [n.strip() for n in nhom_kh.split(",") if n.strip()]
                if nhoms:
                    placeholders = ", ".join(["%s"] * len(nhoms))
                    nhom_filter_sql = f" AND nhom_kh IN ({placeholders})"
                    params1 = list(nhoms)
                    params2 = list(nhoms)

            # 1. Total Metrics (Filtered by active POS)
            cursor.execute(f"""
                SELECT 
                    COUNT(*) as total_qty,
                    SUM(cod_amount) as total_cod,
                    SUM(weight) as total_weight
                FROM detailed_report_staging
                WHERE province_ton = N'BĐT Lâm Đồng'
                  AND (
                      NOT EXISTS (SELECT 1 FROM pos_config WHERE is_active = 1)
                      OR pos_code IN (SELECT pos_code FROM pos_config WHERE is_active = 1)
                  )
                {nhom_filter_sql}
            """, tuple(params1))
            kpis = cursor.fetchone()
            total_qty = kpis[0] if kpis and kpis[0] is not None else 0
            total_cod = float(kpis[1]) if kpis and kpis[1] is not None else 0.0
            total_weight = float(kpis[2]) if kpis and kpis[2] is not None else 0.0
            
            # 2. Pivot Matrix Data (Rows: POSName, Columns: loai_ton, Metrics: Count & COD, Filtered by active POS)
            cursor.execute(f"""
                SELECT 
                    pos_name,
                    loai_ton,
                    COUNT(*) as qty,
                    SUM(cod_amount) as cod
                FROM detailed_report_staging
                WHERE province_ton = N'BĐT Lâm Đồng' AND pos_name IS NOT NULL AND loai_ton IS NOT NULL
                  AND (
                      NOT EXISTS (SELECT 1 FROM pos_config WHERE is_active = 1)
                      OR pos_code IN (SELECT pos_code FROM pos_config WHERE is_active = 1)
                  )
                {nhom_filter_sql}
                GROUP BY pos_name, loai_ton
                ORDER BY pos_name
            """, tuple(params2))
            raw_matrix = cursor.fetchall()
            
            # Format matrix data for easy rendering in frontend
            # We want: { "pos_name": { "loai_ton": { "qty": X, "cod": Y } } }
            matrix_data = {}
            for r in raw_matrix:
                pos = r[0]
                category = r[1]
                qty = r[2]
                cod = float(r[3]) if r[3] is not None else 0.0
                
                if pos not in matrix_data:
                    matrix_data[pos] = {}
                matrix_data[pos][category] = {"qty": qty, "cod": cod}
                
            return {
                "total_qty": total_qty,
                "total_cod": total_cod,
                "total_weight": total_weight,
                "matrix": matrix_data
            }
    except Exception as e:
        logger.error(f"Error fetching summary: {e}")
        return {"total_qty": 0, "total_cod": 0.0, "total_weight": 0.0, "matrix": {}}
    finally:
        conn.close()

@app.get("/api/bckt-summary")
def get_bckt_summary():
    """Get breakdown and detailed item list for Khai thác / KTC1 / BCKT / KHL / GD offices."""
    conn = get_connection(with_db=True)
    try:
        with conn.cursor() as cursor:
            # 1. Grouped matrix per BCKT office
            cursor.execute("""
                SELECT pos_name, pos_code, loai_ton, COUNT(*) as qty, SUM(cod_amount) as cod
                FROM detailed_report_staging
                WHERE province_ton = N'BĐT Lâm Đồng'
                  AND (
                      pos_name LIKE N'%KTC1%' 
                      OR pos_name LIKE N'%BCKT%' 
                      OR pos_name LIKE N'%KHL%' 
                      OR pos_name LIKE N'%GD%' 
                      OR pos_name LIKE N'%Hub%'
                      OR pos_name LIKE N'%KT %'
                  )
                GROUP BY pos_name, pos_code, loai_ton
                ORDER BY pos_name
            """)
            raw_summary = cursor.fetchall()
            
            summary_dict = {}
            for r in raw_summary:
                pos = r[0].strip()
                code = r[1]
                cat = r[2]
                qty = r[3]
                cod = float(r[4]) if r[4] is not None else 0.0
                
                if pos not in summary_dict:
                    summary_dict[pos] = {
                        "pos_name": pos,
                        "pos_code": code,
                        "total_qty": 0,
                        "total_cod": 0.0,
                        "matrix": {}
                    }
                summary_dict[pos]["matrix"][cat] = {"qty": qty, "cod": cod}
                summary_dict[pos]["total_qty"] += qty
                summary_dict[pos]["total_cod"] += cod

            # 2. Detailed item list
            cursor.execute("""
                SELECT item_code, pos_name, pos_code, loai_ton, status_name, cod_amount, weight, nhom_kh, postman_name
                FROM detailed_report_staging
                WHERE province_ton = N'BĐT Lâm Đồng'
                  AND (
                      pos_name LIKE N'%KTC1%' 
                      OR pos_name LIKE N'%BCKT%' 
                      OR pos_name LIKE N'%KHL%' 
                      OR pos_name LIKE N'%GD%' 
                      OR pos_name LIKE N'%Hub%'
                      OR pos_name LIKE N'%KT %'
                  )
                ORDER BY cod_amount DESC, pos_name ASC
            """)
            raw_items = cursor.fetchall()
            items_list = []
            for r in raw_items:
                items_list.append({
                    "item_code": r[0],
                    "pos_name": r[1],
                    "pos_code": r[2],
                    "loai_ton": r[3],
                    "status_name": r[4],
                    "cod_amount": float(r[5]) if r[5] is not None else 0.0,
                    "weight": float(r[6]) if r[6] is not None else 0.0,
                    "nhom_kh": r[7],
                    "postman_name": r[8]
                })

            return {
                "bckt_summary": list(summary_dict.values()),
                "bckt_items": items_list,
                "total_bckt_qty": len(items_list),
                "total_bckt_cod": sum(i["cod_amount"] for i in items_list)
            }
    except Exception as e:
        logger.error(f"Error fetching bckt summary: {e}")
        return {"bckt_summary": [], "bckt_items": [], "total_bckt_qty": 0, "total_bckt_cod": 0.0}
    finally:
        conn.close()

@app.get("/api/detailed")
def get_detailed(
    page: int = 1,
    page_size: int = 50,
    search: str = "",
    pos_name: str = "",
    loai_ton: str = "",
    status_name: str = "",
    nhom_kh: str = "",
    sort_col: str = "item_code",
    sort_dir: str = "asc",
    codes_only: bool = False
):
    """Get detailed report data with server-side pagination, searching, sorting, and filtering."""
    conn = get_connection(with_db=True)
    try:
        # Build query filters (filtered by active POS)
        where_clauses = [
            "province_ton = N'BĐT Lâm Đồng'",
            "(NOT EXISTS (SELECT 1 FROM pos_config WHERE is_active = 1) OR pos_code IN (SELECT pos_code FROM pos_config WHERE is_active = 1))"
        ]
        params = []
        
        if search:
            where_clauses.append("(item_code LIKE %s OR postman_name LIKE %s OR pos_name LIKE %s)")
            params.extend([f"%{search}%", f"%{search}%", f"%{search}%"])
            
        if pos_name:
            pos_list = [p.strip() for p in pos_name.split(",") if p.strip()]
            logger.info(f"Detailed API filtering by pos_names: {pos_list}")
            if pos_list:
                placeholders = ",".join(["%s"] * len(pos_list))
                where_clauses.append(f"pos_name IN ({placeholders})")
                params.extend(pos_list)
            
        if loai_ton:
            loai_list = [l.strip() for l in loai_ton.split(",") if l.strip()]
            if loai_list:
                placeholders = ",".join(["%s"] * len(loai_list))
                where_clauses.append(f"loai_ton IN ({placeholders})")
                params.extend(loai_list)
            
        if status_name:
            status_list = [s.strip() for s in status_name.split(",") if s.strip()]
            if status_list:
                placeholders = ",".join(["%s"] * len(status_list))
                where_clauses.append(f"status_name IN ({placeholders})")
                params.extend(status_list)
                
        if nhom_kh:
            nhom_list = [n.strip() for n in nhom_kh.split(",") if n.strip()]
            if nhom_list:
                placeholders = ",".join(["%s"] * len(nhom_list))
                where_clauses.append(f"nhom_kh IN ({placeholders})")
                params.extend(nhom_list)
            
        where_str = " AND ".join(where_clauses)
        
        # Fast path: If only codes are requested, return lightweight distinct list
        if codes_only:
            codes_sql = f"SELECT DISTINCT item_code FROM detailed_report_staging WHERE {where_str}"
            with conn.cursor() as cursor:
                cursor.execute(codes_sql, tuple(params))
                rows = cursor.fetchall()
                codes = [r[0] for r in rows if r[0]]
            return {
                "total": len(codes),
                "codes": codes,
                "rows": [{"item_code": c} for c in codes]
            }
        
        # Validation of sort column to prevent SQL injection
        allowed_sort_cols = ["item_code", "pos_code", "pos_name", "dk1", "status_name", "loai_ton", "cod_amount", "weight", "updated_at", "postman_name", "nhom_kh"]
        if sort_col not in allowed_sort_cols:
            sort_col = "item_code"
            
        sort_dir_str = "DESC" if sort_dir.lower() == "desc" else "ASC"
        
        if sort_col == "loai_ton":
            order_by_clause = f"CASE WHEN loai_ton = N'<1 ngày' THEN 0.5 WHEN loai_ton = N'≥1 ngày' THEN 1 WHEN loai_ton = N'≥1.5 ngày' THEN 1.5 WHEN loai_ton = N'≥2 ngày' THEN 2 WHEN loai_ton = N'≥3 ngày' THEN 3 WHEN loai_ton = N'≥4 ngày' THEN 4 WHEN loai_ton = N'≥5 ngày' THEN 5 WHEN loai_ton = N'≥7 ngày' THEN 7 WHEN loai_ton = N'≥14 ngày' THEN 14 ELSE 99 END {sort_dir_str}"
        else:
            order_by_clause = f"{sort_col} {sort_dir_str}"
        
        # Query total count
        count_sql = f"SELECT COUNT(*) FROM detailed_report_staging WHERE {where_str}"
        logger.info(f"count_sql: {count_sql}")
        logger.info(f"params: {params}")
        
        # Query paginated rows
        # MS SQL Server uses OFFSET / FETCH NEXT for pagination (supported in SQL Server 2012+)
        offset = (page - 1) * page_size
        rows_sql = f"""
            SELECT item_code, pos_code, pos_name, dk1, status_name, loai_ton, nhom_kh, cod_amount, weight, color_code, updated_at, postman_name
            FROM detailed_report_staging
            WHERE {where_str}
            ORDER BY {order_by_clause}
            OFFSET %s ROWS
            FETCH NEXT %s ROWS ONLY
        """
        
        with conn.cursor() as cursor:
            # 1. Total records count
            cursor.execute(count_sql, tuple(params))
            total_records = cursor.fetchone()[0]
            
            # 2. Page records
            cursor.execute(rows_sql, tuple(params + [offset, page_size]))
            rows = cursor.fetchall()
            
            # Format date for response
            formatted_rows = []
            for r in rows:
                formatted_rows.append({
                    "item_code": r[0],
                    "pos_code": r[1],
                    "pos_name": r[2],
                    "dk1": r[3],
                    "status_name": r[4],
                    "loai_ton": r[5],
                    "nhom_kh": r[6],
                    "cod_amount": float(r[7]) if r[7] is not None else 0.0,
                    "weight": float(r[8]) if r[8] is not None else 0.0,
                    "color_code": r[9],
                    "updated_at": r[10].strftime("%Y-%m-%d %H:%M:%S") if r[10] else None,
                    "postman_name": r[11]
                })
                
        return {
            "total": total_records,
            "page": page,
            "page_size": page_size,
            "rows": formatted_rows
        }
    except Exception as e:
        logger.error(f"Error fetching detailed report: {e}")
        return {"total": 0, "page": page, "page_size": page_size, "rows": []}
    finally:
        conn.close()

@app.get("/api/summary/export")
def get_export(
    search: str = "",
    pos_name: str = "",
    loai_ton: str = "",
    status_name: str = "",
    nhom_kh: str = "",
    sort_col: str = "item_code",
    sort_dir: str = "asc"
):
    """
    Get all rows matching filters (without pagination) for Excel/CSV export.
    Returns raw rows.
    """
    conn = get_connection(with_db=True)
    try:
        where_clauses = [
            "province_ton = N'BĐT Lâm Đồng'",
            "(NOT EXISTS (SELECT 1 FROM pos_config WHERE is_active = 1) OR pos_code IN (SELECT pos_code FROM pos_config WHERE is_active = 1))"
        ]
        params = []
        
        if search:
            where_clauses.append("(item_code LIKE %s OR pos_name LIKE %s)")
            params.extend([f"%{search}%", f"%{search}%"])
            
        if pos_name:
            pos_list = [p.strip() for p in pos_name.split(",") if p.strip()]
            logger.info(f"Export API filtering by pos_names: {pos_list}")
            if pos_list:
                placeholders = ",".join(["%s"] * len(pos_list))
                where_clauses.append(f"pos_name IN ({placeholders})")
                params.extend(pos_list)
            
        if loai_ton:
            loai_list = [l.strip() for l in loai_ton.split(",") if l.strip()]
            if loai_list:
                placeholders = ",".join(["%s"] * len(loai_list))
                where_clauses.append(f"loai_ton IN ({placeholders})")
                params.extend(loai_list)
            
        if status_name:
            status_list = [s.strip() for s in status_name.split(",") if s.strip()]
            if status_list:
                placeholders = ",".join(["%s"] * len(status_list))
                where_clauses.append(f"status_name IN ({placeholders})")
                params.extend(status_list)
                
        if nhom_kh:
            nhom_list = [n.strip() for n in nhom_kh.split(",") if n.strip()]
            if nhom_list:
                placeholders = ",".join(["%s"] * len(nhom_list))
                where_clauses.append(f"nhom_kh IN ({placeholders})")
                params.extend(nhom_list)
            
        where_str = " AND ".join(where_clauses)
        
        # Validation of sort column to prevent SQL injection
        allowed_sort_cols = ["item_code", "pos_code", "pos_name", "dk1", "status_name", "loai_ton", "cod_amount", "weight", "updated_at"]
        if sort_col not in allowed_sort_cols:
            sort_col = "item_code"
            
        sort_dir_str = "DESC" if sort_dir.lower() == "desc" else "ASC"
        
        if sort_col == "loai_ton":
            order_by_clause = f"CASE WHEN loai_ton = N'≥3 ngày' THEN 3 WHEN loai_ton = N'≥4 ngày' THEN 4 WHEN loai_ton = N'≥5 ngày' THEN 5 WHEN loai_ton = N'≥7 ngày' THEN 7 WHEN loai_ton = N'≥14 ngày' THEN 14 ELSE 99 END {sort_dir_str}"
        else:
            order_by_clause = f"{sort_col} {sort_dir_str}"
        
        rows_sql = f"""
            SELECT item_code, pos_code, pos_name, dk1, status_name, loai_ton, nhom_kh, cod_amount, weight, updated_at, postman_name
            FROM detailed_report_staging
            WHERE {where_str}
            ORDER BY {order_by_clause}
        """
        
        with conn.cursor() as cursor:
            cursor.execute(rows_sql, tuple(params))
            # Use cursor iterator for streaming rows
            rows = cursor.fetchall()
            return StreamingResponse(
                generate_excel_file(rows),
                media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                headers={"Content-Disposition": "attachment; filename=report_ton.xlsx"}
            )
    except Exception as e:
        logger.error(f"Error exporting data: {e}")
        # Fallback: return an empty Excel file with error message
        output = io.BytesIO()
        wb = Workbook()
        ws = wb.active
        ws.title = "Error"
        ws.append(["Error", str(e)])
        wb.save(output)
        output.seek(0)
        return StreamingResponse(
            io.BytesIO(output.read()),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": "attachment; filename=report_error.xlsx"}
        )
    finally:
        conn.close()

def generate_excel_file(rows):
    """Helper to generate Excel from DB rows."""
    output = io.BytesIO()
    wb = Workbook()
    ws = wb.active
    ws.append(["Mã bưu gửi", "Mã bưu cục", "Bưu cục Phát", "DK1", "Thời gian tồn", "Trạng thái", "Nhóm KH", "Bưu tá", "COD", "Trọng lượng", "Thời gian quét"])
    for r in rows:
        ws.append([r[0], r[1], r[2], r[3], r[5], r[4], r[6], r[10], float(r[7]) if r[7] else 0.0, float(r[8]) if r[8] else 0.0, r[9].strftime("%Y-%m-%d %H:%M:%S") if r[9] else ""])
    wb.save(output)
    output.seek(0)
    return output

@app.get("/api/history")
def get_history():
    """Get aggregate history metrics from daily_snapshot table for graphing."""
    conn = get_connection(with_db=True)
    try:
        with conn.cursor() as cursor:
            cursor.execute("""
                SELECT 
                    snapshot_date,
                    COUNT(*) as qty,
                    SUM(cod_amount) as cod
                FROM daily_snapshot
                WHERE province_ton = N'BĐT Lâm Đồng'
                GROUP BY snapshot_date
                ORDER BY snapshot_date ASC
            """)
            rows = cursor.fetchall()
            
            history_data = []
            for r in rows:
                history_data.append({
                    "date": r[0].strftime("%Y-%m-%d") if isinstance(r[0], datetime) or hasattr(r[0], 'strftime') else str(r[0]),
                    "qty": r[1],
                    "cod": float(r[2]) if r[2] is not None else 0.0
                })
            return history_data
    except Exception as e:
        logger.error(f"Error fetching history data: {e}")
        return []
    finally:
        conn.close()

# --- AUTHENTICATION & USER MANAGEMENT ---

JWT_SECRET = "vnpost-excel-exporter-jwt-secret-key-2026-dynamic-secure"
JWT_ALGORITHM = "HS256"

class LoginRequest(BaseModel):
    username: str
    password: str
    captchaSolution: Optional[str] = None
    initialFields: Optional[dict] = None
    initialCookies: Optional[dict] = None

class ImportUserItem(BaseModel):
    username: str
    password: Optional[str] = None
    role: str
    concurrency_limit: int
    vnpost_username: Optional[str] = None
    vnpost_password: Optional[str] = None

class ImportUsersRequest(BaseModel):
    users: list[ImportUserItem]

class UserCreate(BaseModel):
    username: str
    password: str
    role: str
    concurrency_limit: Optional[int] = 3
    vnpost_username: Optional[str] = None
    vnpost_password: Optional[str] = None

class UserUpdate(BaseModel):
    username: Optional[str] = None
    password: Optional[str] = None
    role: Optional[str] = None
    concurrency_limit: Optional[int] = None
    vnpost_username: Optional[str] = None
    vnpost_password: Optional[str] = None

class SettingsUpdate(BaseModel):
    vnpost_cookie: Optional[str] = None
    vnpost_username: Optional[str] = None
    vnpost_password: Optional[str] = None
    password: Optional[str] = None

def get_current_user(authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Không tìm thấy mã Token xác thực.")
    token = authorization.split(" ")[1]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except Exception:
        raise HTTPException(status_code=403, detail="Token không hợp lệ hoặc đã hết hạn.")

@app.get("/api/auth/login-captcha")
def get_login_captcha():
    try:
        r = requests.get(f"{DINHVI_BACKEND_URL}/api/auth/login-captcha")
        if r.status_code == 200:
            return r.json()
        raise HTTPException(status_code=r.status_code, detail="Không thể lấy captcha từ Node.js")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi lấy Captcha từ máy chủ: {e}")

@app.get("/api/app-version")
def get_app_version():
    return {"version": "3.10.0"}

@app.post("/api/auth/login")
def auth_login(req: LoginRequest):
    username = req.username.strip()
    password = req.password
    
    conn = get_connection(with_db=True)
    try:
        with conn.cursor() as cursor:
            cursor.execute("""
                SELECT id, username, password_hash, role, concurrency_limit, vnpost_cookie
                FROM users 
                WHERE username = %s
            """, (username,))
            row = cursor.fetchone()
            if not row:
                raise HTTPException(status_code=400, detail="Tài khoản không tồn tại.")
                
            user_id, db_username, db_password_hash, db_role, db_concurrency_limit, db_cookie = row
            
            is_first_login = (db_password_hash is None or db_password_hash == "" or 
                              db_password_hash == "BCCP_PENDING" or 
                              db_password_hash == "vnpost-auth-placeholder")
            
            has_captcha = bool(req.captchaSolution and req.initialFields and req.initialCookies)
            
            if is_first_login:
                # ── FIRST LOGIN: Set password directly without requiring Captcha ──
                hashed = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
                cursor.execute("""
                    UPDATE users 
                    SET password_hash = %s, vnpost_username = %s, vnpost_password = %s
                    WHERE id = %s
                """, (hashed, username, password, user_id))
                sync_user_to_sqlite(db_username, db_role, db_concurrency_limit, hashed)
                logger.info(f"First login complete for '{username}' — password initialized.")

            else:
                # ── REGULAR LOGIN: verify password locally ──
                try:
                    is_correct = bcrypt.checkpw(password.encode('utf-8'), db_password_hash.encode('utf-8'))
                except Exception:
                    is_correct = False
                    
                if not is_correct:
                    raise HTTPException(status_code=400, detail="Mật khẩu không chính xác.")
                
                # Always sync vnpost_username and vnpost_password so worker threads have credentials
                cursor.execute("""
                    UPDATE users 
                    SET vnpost_username = %s, vnpost_password = %s 
                    WHERE id = %s
                """, (username, password, user_id))
                
                # Optional: If captcha was provided, refresh VNPost session slot 0
                if has_captcha:
                    try:
                        payload = {
                            "username": username,
                            "password": password,
                            "captchaSolution": req.captchaSolution,
                            "initialFields": req.initialFields,
                            "initialCookies": req.initialCookies
                        }
                        node_res = requests.post(
                            f"{DINHVI_BACKEND_URL}/api/auth/login",
                            json=payload,
                            timeout=15
                        )
                        if node_res.status_code == 200:
                            cursor.execute("SELECT vnpost_cookie FROM users WHERE username = %s", (username,))
                            sql_row = cursor.fetchone()
                            fresh_cookie = sql_row[0] if sql_row else None

                            if fresh_cookie:
                                cursor.execute("""
                                    UPDATE users SET vnpost_cookie = %s WHERE id = %s
                                """, (fresh_cookie, user_id))
                                db_cookie = fresh_cookie
                                logger.info(f"Login: refreshed VNPost session slot 0 for '{username}' using captcha.")
                    except Exception as e:
                        logger.warning(f"Login optional captcha VNPost refresh error for '{username}': {e}")
                        
            # Create JWT token
            token = jwt.encode({
                "id": user_id,
                "username": db_username,
                "role": db_role
            }, JWT_SECRET, algorithm=JWT_ALGORITHM)
            
            return {
                "token": token,
                "user": {
                    "id": user_id,
                    "username": db_username,
                    "role": db_role,
                    "hasVnpostCookie": bool(db_cookie),
                    "vnpostUsername": db_username,
                    "concurrency_limit": db_concurrency_limit
                }
            }
    finally:
        conn.close()

@app.post("/api/admin/import-users")
def admin_import_users(req: ImportUsersRequest, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Từ chối truy cập. Quyền Admin được yêu cầu.")
        
    conn = get_connection(with_db=True)
    success_count = 0
    try:
        with conn.cursor() as cursor:
            for user_item in req.users:
                username = user_item.username.strip()
                if not username:
                    continue
                # Check duplicate
                cursor.execute("SELECT COUNT(*) FROM users WHERE username = %s", (username,))
                if cursor.fetchone()[0] > 0:
                    continue
                
                # If password is provided, hash it. Otherwise, set it to "BCCP_PENDING" so they authenticate via BCCP on first login
                if user_item.password and user_item.password.strip() != "":
                    hashed = bcrypt.hashpw(user_item.password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
                else:
                    hashed = "BCCP_PENDING"
                    
                vn_user = user_item.vnpost_username.strip() if user_item.vnpost_username else None
                vn_pass = user_item.vnpost_password if user_item.vnpost_password else None
                
                cursor.execute("""
                    INSERT INTO users (username, password_hash, role, concurrency_limit, vnpost_username, vnpost_password)
                    VALUES (%s, %s, %s, %s, %s, %s)
                """, (username, hashed, user_item.role, user_item.concurrency_limit, vn_user, vn_pass))
                
                # Sync user details to SQLite database
                sync_user_to_sqlite(username, user_item.role, user_item.concurrency_limit, hashed, vn_user, vn_pass)
                success_count += 1
                
            return {"message": f"Đồng bộ thành công {success_count} tài khoản từ BCCP."}
    finally:
        conn.close()

@app.get("/api/auth/me")
def auth_me(current_user: dict = Depends(get_current_user)):
    conn = get_connection(with_db=True)
    try:
        with conn.cursor() as cursor:
            cursor.execute("""
                SELECT id, username, role, concurrency_limit, vnpost_cookie
                FROM users
                WHERE id = %s
            """, (current_user["id"],))
            row = cursor.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Không tìm thấy người dùng.")
            user_id, username, role, concurrency_limit, vnpost_cookie = row
            return {
                "id": user_id,
                "username": username,
                "role": role,
                "hasVnpostCookie": bool(vnpost_cookie),
                "vnpostUsername": username,
                "concurrencyLimit": concurrency_limit or 3
            }
    finally:
        conn.close()

@app.post("/api/user/settings")
def user_settings(req: SettingsUpdate, current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    conn = get_connection(with_db=True)
    try:
        with conn.cursor() as cursor:
            if req.password:
                hashed = bcrypt.hashpw(req.password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
                cursor.execute("UPDATE users SET password_hash = %s WHERE id = %s", (hashed, user_id))
            
            if req.vnpost_cookie is not None:
                import json
                cookie_str = json.dumps([req.vnpost_cookie.strip()])
                cursor.execute("UPDATE users SET vnpost_cookie = %s WHERE id = %s", (cookie_str, user_id))
                
            if req.vnpost_username is not None and req.vnpost_password is not None:
                cursor.execute("""
                    UPDATE users 
                    SET vnpost_username = %s, vnpost_password = %s 
                    WHERE id = %s
                """, (req.vnpost_username.strip(), req.vnpost_password, user_id))
                
            return {"message": "Cập nhật cấu hình thành công."}
    finally:
        conn.close()

@app.get("/api/admin/users")
def admin_get_users(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Từ chối truy cập. Quyền Admin được yêu cầu.")
        
    conn = get_connection(with_db=True)
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT id, username, role, concurrency_limit, created_at, vnpost_username, vnpost_password FROM users ORDER BY username")
            rows = cursor.fetchall()
            users = []
            for r in rows:
                users.append({
                    "id": r[0],
                    "username": r[1],
                    "role": r[2],
                    "concurrency_limit": r[3] or 3,
                    "created_at": r[4].strftime("%Y-%m-%d %H:%M:%S") if r[4] else None,
                    "vnpost_username": r[5] or "",
                    "vnpost_password": r[6] or ""
                })
            return users
    finally:
        conn.close()

@app.post("/api/admin/users")
def admin_create_user(req: UserCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Từ chối truy cập. Quyền Admin được yêu cầu.")
        
    username = req.username.strip()
    conn = get_connection(with_db=True)
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT COUNT(*) FROM users WHERE username = %s", (username,))
            if cursor.fetchone()[0] > 0:
                raise HTTPException(status_code=400, detail="Tài khoản này đã tồn tại.")
                
            hashed = bcrypt.hashpw(req.password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
            
            vn_user = req.vnpost_username.strip() if req.vnpost_username else None
            vn_pass = req.vnpost_password if req.vnpost_password else None

            cursor.execute("""
                INSERT INTO users (username, password_hash, role, concurrency_limit, vnpost_username, vnpost_password)
                VALUES (%s, %s, %s, %s, %s, %s)
            """, (username, hashed, req.role, req.concurrency_limit or 3, vn_user, vn_pass))
            
            # Sync to SQLite database
            sync_user_to_sqlite(username, req.role, req.concurrency_limit or 3, hashed, vn_user, vn_pass)
            
            return {"message": "Tạo tài khoản thành công."}
    finally:
        conn.close()

@app.put("/api/admin/users/{user_id}")
def admin_update_user(user_id: int, req: UserUpdate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Từ chối truy cập. Quyền Admin được yêu cầu.")
        
    conn = get_connection(with_db=True)
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT username FROM users WHERE id = %s", (user_id,))
            if not cursor.fetchone():
                raise HTTPException(status_code=404, detail="Không tìm thấy tài khoản.")
                
            if req.username is not None:
                cursor.execute("UPDATE users SET username = %s WHERE id = %s", (req.username.strip(), user_id))
            if req.role is not None:
                cursor.execute("UPDATE users SET role = %s WHERE id = %s", (req.role, user_id))
            if req.concurrency_limit is not None:
                cursor.execute("UPDATE users SET concurrency_limit = %s WHERE id = %s", (req.concurrency_limit, user_id))
            if req.password is not None and req.password.strip() != "":
                hashed = bcrypt.hashpw(req.password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
                cursor.execute("UPDATE users SET password_hash = %s WHERE id = %s", (hashed, user_id))
            if req.vnpost_username is not None:
                vn_user = req.vnpost_username.strip() if req.vnpost_username.strip() != "" else None
                cursor.execute("UPDATE users SET vnpost_username = %s WHERE id = %s", (vn_user, user_id))
            if req.vnpost_password is not None:
                vn_pass = req.vnpost_password if req.vnpost_password.strip() != "" else None
                cursor.execute("UPDATE users SET vnpost_password = %s WHERE id = %s", (vn_pass, user_id))
                
            # Fetch updated user details to sync with SQLite
            cursor.execute("SELECT username, role, concurrency_limit, password_hash, vnpost_username, vnpost_password FROM users WHERE id = %s", (user_id,))
            updated_row = cursor.fetchone()
            if updated_row:
                db_username, db_role, db_concurrency, db_pw_hash, db_vn_user, db_vn_pass = updated_row
                sync_user_to_sqlite(db_username, db_role, db_concurrency, db_pw_hash, db_vn_user, db_vn_pass)
                
            return {"message": "Cập nhật tài khoản thành công."}
    finally:
        conn.close()

@app.delete("/api/admin/users/{user_id}")
def admin_delete_user(user_id: int, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Từ chối truy cập. Quyền Admin được yêu cầu.")
        
    if current_user["id"] == user_id:
        raise HTTPException(status_code=400, detail="Bạn không thể tự xóa tài khoản của chính mình.")
        
    conn = get_connection(with_db=True)
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT username FROM users WHERE id = %s", (user_id,))
            del_row = cursor.fetchone()
            if del_row:
                delete_user_from_sqlite(del_row[0])
                
            cursor.execute("DELETE FROM users WHERE id = %s", (user_id,))
            return {"message": "Xóa tài khoản thành công."}
    finally:
        conn.close()

# Proxy requests for /api/vnpost to the Node.js backend
@app.api_route("/api/vnpost/{path:path}", methods=["GET", "POST", "PUT", "DELETE"])
async def proxy_vnpost(path: str, request: Request):
    body = await request.body()
    headers = dict(request.headers)
    headers.pop("host", None)
    params = dict(request.query_params)
    
    url = f"{DINHVI_BACKEND_URL}/api/vnpost/{path}"
    
    try:
        response = requests.request(
            method=request.method,
            url=url,
            headers=headers,
            data=body,
            params=params,
            timeout=120
        )
        return Response(
            content=response.content,
            status_code=response.status_code,
            headers=dict(response.headers)
        )
    except Exception as e:
        logger.error(f"Proxy to Node.js backend failed for path /api/vnpost/{path}: {e}")
        raise HTTPException(status_code=500, detail=f"Lỗi kết nối Node.js backend: {e}")

# Proxy requests for /api/export to the Node.js backend
@app.api_route("/api/export", methods=["POST"])
async def proxy_export(request: Request):
    body = await request.body()
    headers = dict(request.headers)
    headers.pop("host", None)
    params = dict(request.query_params)
    
    url = f"{DINHVI_BACKEND_URL}/api/export"
    
    try:
        response = requests.request(
            method=request.method,
            url=url,
            headers=headers,
            data=body,
            params=params,
            timeout=300
        )
        return Response(
            content=response.content,
            status_code=response.status_code,
            headers=dict(response.headers)
        )
    except Exception as e:
        logger.error(f"Proxy to Node.js backend failed for path /api/export: {e}")
        raise HTTPException(status_code=500, detail=f"Lỗi kết nối Node.js backend: {e}")

# Proxy requests for /api/merge-and-save to the Node.js backend
@app.api_route("/api/merge-and-save", methods=["POST"])
async def proxy_merge_and_save(request: Request):
    body = await request.body()
    headers = dict(request.headers)
    headers.pop("host", None)
    params = dict(request.query_params)
    
    url = f"{DINHVI_BACKEND_URL}/api/merge-and-save"
    
    try:
        response = requests.request(
            method=request.method,
            url=url,
            headers=headers,
            data=body,
            params=params,
            timeout=120
        )
        return Response(
            content=response.content,
            status_code=response.status_code,
            headers=dict(response.headers)
        )
    except Exception as e:
        logger.error(f"Proxy to Node.js backend failed for /api/merge-and-save: {e}")
        raise HTTPException(status_code=500, detail=f"Lỗi kết nối Node.js backend: {e}")


# Serves static frontend files (Dynamic lookup: prefers root ../frontend, falls back gracefully)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "frontend"))
if not os.path.exists(FRONTEND_DIR):
    FRONTEND_DIR = os.path.join(BASE_DIR, "frontend")

if os.path.exists(FRONTEND_DIR):
    app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")

    @app.get("/")
    def read_root():
        index_path = os.path.join(FRONTEND_DIR, "index.html")
        if os.path.exists(index_path):
            return FileResponse(index_path)
        return {"status": "ok", "message": "Crawler API is running."}
else:
    @app.get("/")
    def read_root():
        return {"status": "ok", "message": "Crawler API is running. Frontend is served separately via Nginx."}

def open_browser_delayed():
    """Wait for server to start, then open standard browser."""
    time.sleep(2)
    url = "http://localhost:8000"
    logger.info(f"Automatically opening dashboard in browser: {url}")
    webbrowser.open(url)

@app.on_event("startup")
def startup_event():
    # Ensure database is initialized before starting
    try:
        init_db()
    except Exception as e:
        logger.error(f"Error during startup DB initialization: {e}")
        
    # Start scheduler thread
    sched_t = threading.Thread(target=scheduler_thread, daemon=True)
    sched_t.start()

if __name__ == "__main__":
    # Start browser opener thread
    browser_t = threading.Thread(target=open_browser_delayed, daemon=True)
    browser_t.start()
    
    # Start FastAPI Web Server
    uvicorn.run(app, host="0.0.0.0", port=8000)
