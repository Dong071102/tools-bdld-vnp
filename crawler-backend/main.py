import io
import json
import logging
import os
import threading
import time
import webbrowser
from datetime import datetime, timedelta
from typing import Optional

import bcrypt
import jwt
import requests
import uvicorn
from fastapi import BackgroundTasks, Depends, FastAPI, Header, HTTPException, Request, Response
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from pydantic import BaseModel

from database import create_daily_snapshot, get_connection, init_db
from pbi_crawler import PowerBIUrlError, check_powerbi_url_health, crawl_lamdong_data

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

DINHVI_BACKEND_URL = os.getenv("DINHVI_BACKEND_URL", "http://localhost:5000")
JWT_SECRET = os.getenv("JWT_SECRET", "vnpost-excel-exporter-jwt-secret-key-2026-dynamic-secure")
JWT_ALGORITHM = "HS256"
PBI_ERROR_TEXT = "Lỗi URL Power BI, liên hệ bộ phận IT để hỗ trợ"

PROVINCE_SQL = "province_ton = N'BĐT Lâm Đồng'"
ACTIVE_POS_SQL = (
    "(NOT EXISTS (SELECT 1 FROM pos_config WHERE is_active = 1) "
    "OR pos_code IN (SELECT pos_code FROM pos_config WHERE is_active = 1))"
)
BCKT_POS_SQL = (
    "(pos_name LIKE N'%KTC1%' OR pos_name LIKE N'%BCKT%' OR pos_name LIKE N'%KHL%' "
    "OR pos_name LIKE N'%GD%' OR pos_name LIKE N'%Hub%' OR pos_name LIKE N'%KT %')"
)
AGE_ORDER = ["<1 ngày", "≥1 ngày", "≥1.5 ngày", "≥2 ngày", "≥3 ngày", "≥4 ngày", "≥5 ngày", "≥7 ngày", "≥14 ngày"]
LOAI_TON_SORT_SQL = (
    "CASE "
    "WHEN loai_ton = N'<1 ngày' THEN 0.5 "
    "WHEN loai_ton = N'≥1 ngày' THEN 1 "
    "WHEN loai_ton = N'≥1.5 ngày' THEN 1.5 "
    "WHEN loai_ton = N'≥2 ngày' THEN 2 "
    "WHEN loai_ton = N'≥3 ngày' THEN 3 "
    "WHEN loai_ton = N'≥4 ngày' THEN 4 "
    "WHEN loai_ton = N'≥5 ngày' THEN 5 "
    "WHEN loai_ton = N'≥7 ngày' THEN 7 "
    "WHEN loai_ton = N'≥14 ngày' THEN 14 "
    "ELSE 99 END"
)
ALLOWED_SORT_COLS = {
    "item_code", "pos_code", "pos_name", "dk1", "status_name",
    "loai_ton", "cod_amount", "weight", "updated_at", "postman_name", "nhom_kh",
}
FIRST_LOGIN_MARKERS = {None, "", "BCCP_PENDING", "vnpost-auth-placeholder"}

app = FastAPI(title="Lâm Đồng Power BI Dashboard Clone")

# Shared crawl state
crawl_lock = threading.Lock()
crawl_state = {
    "is_crawling": False,
    "last_crawl_time": None,
    "last_crawl_status": "Not started",
    "url_error": False,
    "error_detail": "",
    "http_status": None,
}


def _set_pbi_error(code=None, detail=PBI_ERROR_TEXT):
    crawl_state["url_error"] = True
    crawl_state["error_detail"] = detail
    crawl_state["http_status"] = code
    crawl_state["last_crawl_status"] = f"URL Error ({code or 'Network'})"


def _clear_pbi_error(status="Online"):
    crawl_state["url_error"] = False
    crawl_state["error_detail"] = ""
    crawl_state["http_status"] = 200
    if status:
        crawl_state["last_crawl_status"] = status


def _parse_date(target_date: Optional[str]):
    today = datetime.now().date()
    if not target_date:
        return today
    try:
        return datetime.strptime(target_date.strip(), "%Y-%m-%d").date()
    except ValueError:
        return today


def _add_csv_filter(clauses, params, column, raw_csv):
    if not raw_csv:
        return
    vals = [v.strip() for v in raw_csv.split(",") if v.strip()]
    if vals:
        clauses.append(f"{column} IN ({','.join(['%s'] * len(vals))})")
        params.extend(vals)


def _build_detailed_where(search="", pos_name="", loai_ton="", status_name="", nhom_kh=""):
    clauses = [PROVINCE_SQL, ACTIVE_POS_SQL]
    params = []
    if search:
        s = f"%{search}%"
        clauses.append("(item_code LIKE %s OR postman_name LIKE %s OR pos_name LIKE %s)")
        params.extend([s, s, s])
    _add_csv_filter(clauses, params, "pos_name", pos_name)
    _add_csv_filter(clauses, params, "loai_ton", loai_ton)
    _add_csv_filter(clauses, params, "status_name", status_name)
    _add_csv_filter(clauses, params, "nhom_kh", nhom_kh)
    return " AND ".join(clauses), params


def _build_order_by(sort_col: str, sort_dir: str):
    col = sort_col if sort_col in ALLOWED_SORT_COLS else "item_code"
    direction = "DESC" if sort_dir.lower() == "desc" else "ASC"
    return f"{LOAI_TON_SORT_SQL} {direction}" if col == "loai_ton" else f"{col} {direction}"


def _build_drilldown_query(target_date, pos_code, postman_name, loai_ton, status_name, nhom_kh, search):
    today = datetime.now().date()
    base_dt = _parse_date(target_date)
    is_base_today = base_dt == today
    src_table = "detailed_report_staging" if is_base_today else "daily_snapshot"

    conditions = [PROVINCE_SQL]
    params = []
    if not is_base_today:
        conditions.append("snapshot_date = %s")
        params.append(str(base_dt))

    for col, val in (
        ("pos_code", pos_code),
        ("postman_name", postman_name),
        ("loai_ton", loai_ton),
        ("status_name", status_name),
        ("nhom_kh", nhom_kh),
    ):
        if val and val.strip():
            conditions.append(f"{col} = %s")
            params.append(val.strip())

    if search and search.strip():
        s = f"%{search.strip()}%"
        conditions.append("(item_code LIKE %s OR postman_name LIKE %s OR pos_name LIKE %s)")
        params.extend([s, s, s])

    return base_dt, src_table, " WHERE " + " AND ".join(conditions), params


def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def _thin_border(color="CBD5E1"):
    side = Side(style="thin", color=color)
    return Border(left=side, right=side, top=side, bottom=side)


def _style_header_row(ws, row_idx, col_count, fill_hex="0D9488", border_color="CBD5E1"):
    font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
    fill = PatternFill(start_color=fill_hex, end_color=fill_hex, fill_type="solid")
    border = _thin_border(border_color)
    align = Alignment(horizontal="center", vertical="center")
    for col_idx in range(1, col_count + 1):
        cell = ws.cell(row=row_idx, column=col_idx)
        cell.font = font
        cell.fill = fill
        cell.alignment = align
        cell.border = border


def _autofit_columns(ws, min_w=10, max_w=None):
    for col in ws.columns:
        width = max(max(len(str(c.value or "")) for c in col) + 3, min_w)
        ws.column_dimensions[col[0].column_letter].width = min(width, max_w) if max_w else width


def _xlsx_response(wb, filename):
    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def run_crawler_task():
    """Run Power BI crawler safely without overlapping executions."""
    if crawl_lock.locked():
        logger.warning("Crawl already in progress. Skipping.")
        return

    with crawl_lock:
        crawl_state["is_crawling"] = True
        crawl_state["last_crawl_status"] = "In progress"
        try:
            if crawl_lamdong_data():
                _clear_pbi_error("Success")
            else:
                crawl_state["last_crawl_status"] = "Failed"
        except PowerBIUrlError as pbi_err:
            _set_pbi_error(pbi_err.status_code, str(pbi_err))
            logger.error(f"Power BI URL error: {pbi_err}")
        except Exception as e:
            logger.error(f"Error in background crawl: {e}")
            crawl_state["last_crawl_status"] = f"Error: {e}"
            if any(k in str(e).lower() for k in ("401", "403", "404", "url", "connection")):
                crawl_state["url_error"] = True
                crawl_state["error_detail"] = str(e)
        finally:
            crawl_state["last_crawl_time"] = datetime.now()
            crawl_state["is_crawling"] = False


def scheduler_thread():
    """Probe PBI URL on startup, run initial crawl, crawl at 05:00/12:00/18:00, snapshot at 00:00."""
    scheduled_hours = (5, 12, 18)
    logger.info(f"Background scheduler thread started. Fixed crawl schedule: {list(scheduled_hours)}.")

    try:
        is_valid, msg, code = check_powerbi_url_health()
        if not is_valid:
            _set_pbi_error(code, PBI_ERROR_TEXT)
            logger.warning(f"Initial Power BI health check failed: {msg}")
        else:
            logger.info("Initial Power BI health check passed.")
    except Exception as e:
        logger.error(f"Error in initial health check: {e}")

    time.sleep(5)
    run_crawler_task()

    last_crawl_slot = None
    last_snapshot_date = datetime.now().date() - timedelta(days=1)

    while True:
        try:
            now = datetime.now()
            today, hour = now.date(), now.hour
            if hour == 0 and today > last_snapshot_date:
                logger.info(f"Midnight reached. Creating daily snapshot for date {today}...")
                create_daily_snapshot()
                last_snapshot_date = today
            if hour in scheduled_hours and (today, hour) != last_crawl_slot:
                logger.info(f"Fixed schedule reached ({hour:02d}:00). Running scheduled crawl...")
                last_crawl_slot = (today, hour)
                run_crawler_task()
        except Exception as e:
            logger.error(f"Error in scheduler loop: {e}")
        time.sleep(30)


# --- STATUS & CRAWL ENDPOINTS ---

@app.get("/api/status")
def get_status():
    last_time = crawl_state["last_crawl_time"]
    return {
        "is_crawling": crawl_state["is_crawling"],
        "last_crawl_time": last_time.strftime("%Y-%m-%d %H:%M:%S") if last_time else None,
        "last_crawl_status": crawl_state["last_crawl_status"],
        "url_error": crawl_state["url_error"],
        "error_message": crawl_state["error_detail"],
        "http_status": crawl_state["http_status"],
    }


@app.get("/api/check-pbi-url")
def check_pbi_url():
    is_valid, _, code = check_powerbi_url_health()
    if not is_valid:
        _set_pbi_error(code, PBI_ERROR_TEXT)
        return {"is_valid": False, "error_message": PBI_ERROR_TEXT, "http_status": code}
    _clear_pbi_error("Online")
    return {"is_valid": True, "error_message": "", "http_status": code}


@app.post("/api/trigger-crawl")
def trigger_crawl(background_tasks: BackgroundTasks):
    if crawl_state["is_crawling"]:
        return {"status": "already_running", "message": "Crawl is already in progress"}

    is_valid, _, code = check_powerbi_url_health()
    if not is_valid:
        _set_pbi_error(code, PBI_ERROR_TEXT)
        return {"status": "url_error", "message": PBI_ERROR_TEXT}

    _clear_pbi_error(status=None)
    background_tasks.add_task(run_crawler_task)
    return {"status": "triggered", "message": "Crawl triggered successfully"}


# --- POS CONFIGURATION ---

class PosConfigItem(BaseModel):
    pos_code: str
    is_active: bool
    pos_name: Optional[str] = None


class PosConfigRequest(BaseModel):
    configs: list[PosConfigItem]


@app.get("/api/pos-config")
def get_pos_configs():
    conn = get_connection(with_db=True)
    try:
        with conn.cursor() as cursor:
            cursor.execute(f"""
                SELECT c.pos_code, c.pos_name, c.is_active, c.pos_type, c.updated_at, COUNT(d.item_code)
                FROM pos_config c
                LEFT JOIN detailed_report_staging d ON c.pos_code = d.pos_code AND d.{PROVINCE_SQL}
                GROUP BY c.pos_code, c.pos_name, c.is_active, c.pos_type, c.updated_at
                ORDER BY c.is_active DESC, c.pos_name ASC
            """)
            return [
                {
                    "pos_code": r[0],
                    "pos_name": r[1],
                    "is_active": bool(r[2]),
                    "pos_type": r[3] or "OTHER",
                    "updated_at": r[4].strftime("%Y-%m-%d %H:%M:%S") if r[4] else None,
                    "item_count": r[5] or 0,
                }
                for r in cursor.fetchall()
            ]
    except Exception as e:
        logger.error(f"Error fetching pos config: {e}")
        return []
    finally:
        conn.close()


@app.post("/api/pos-config")
def update_pos_configs(req: PosConfigRequest):
    if not req.configs:
        return {"status": "ok", "updated": 0}
    conn = get_connection(with_db=True, autocommit=False)
    try:
        with conn.cursor() as cursor:
            for item in req.configs:
                code = item.pos_code.strip()
                is_act = 1 if item.is_active else 0
                new_name = item.pos_name.strip() if item.pos_name else None
                if new_name:
                    cursor.execute(
                        "UPDATE pos_config SET is_active = %s, pos_name = %s, updated_at = GETDATE() WHERE pos_code = %s",
                        (is_act, new_name, code),
                    )
                    cursor.execute(
                        "UPDATE detailed_report_staging SET pos_name = %s WHERE pos_code = %s",
                        (new_name, code),
                    )
                else:
                    cursor.execute(
                        "UPDATE pos_config SET is_active = %s, updated_at = GETDATE() WHERE pos_code = %s",
                        (is_act, code),
                    )
        conn.commit()
        return {"status": "ok", "updated": len(req.configs)}
    except Exception as e:
        conn.rollback()
        logger.error(f"Error updating pos config: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# --- DASHBOARD DATA ENDPOINTS ---

@app.get("/api/filters")
def get_filters():
    conn = get_connection(with_db=True)
    try:
        with conn.cursor() as cursor:
            cursor.execute(f"""
                SELECT DISTINCT pos_name FROM detailed_report_staging
                WHERE {PROVINCE_SQL} AND pos_name IS NOT NULL AND {ACTIVE_POS_SQL}
                ORDER BY pos_name
            """)
            pos_names = [r[0] for r in cursor.fetchall() if r[0]]

            cursor.execute(f"""
                SELECT DISTINCT status_name FROM detailed_report_staging
                WHERE {PROVINCE_SQL} AND status_name IS NOT NULL ORDER BY status_name
            """)
            status_names = [r[0] for r in cursor.fetchall() if r[0]]

            cursor.execute(f"""
                SELECT DISTINCT loai_ton, {LOAI_TON_SORT_SQL} AS sort_order
                FROM detailed_report_staging
                WHERE {PROVINCE_SQL} AND loai_ton IS NOT NULL ORDER BY sort_order ASC
            """)
            loai_tons = [r[0] for r in cursor.fetchall() if r[0]]

            cursor.execute(f"""
                SELECT DISTINCT nhom_kh FROM detailed_report_staging
                WHERE {PROVINCE_SQL} AND nhom_kh IS NOT NULL ORDER BY nhom_kh
            """)
            nhom_khs = [r[0] for r in cursor.fetchall() if r[0]]

            return {
                "pos_names": pos_names,
                "status_names": status_names,
                "loai_tons": loai_tons,
                "nhom_khs": nhom_khs,
            }
    except Exception as e:
        logger.error(f"Error fetching filters: {e}")
        return {"pos_names": [], "status_names": [], "loai_tons": [], "nhom_khs": []}
    finally:
        conn.close()


@app.get("/api/summary")
def get_summary(nhom_kh: str = ""):
    conn = get_connection(with_db=True)
    try:
        clauses = [PROVINCE_SQL, ACTIVE_POS_SQL]
        params = []
        _add_csv_filter(clauses, params, "nhom_kh", nhom_kh)
        where_sql = " AND ".join(clauses)

        with conn.cursor() as cursor:
            cursor.execute(
                f"SELECT COUNT(*), SUM(cod_amount), SUM(weight) FROM detailed_report_staging WHERE {where_sql}",
                tuple(params),
            )
            kpis = cursor.fetchone()
            total_qty = kpis[0] if kpis and kpis[0] is not None else 0
            total_cod = float(kpis[1]) if kpis and kpis[1] is not None else 0.0
            total_weight = float(kpis[2]) if kpis and kpis[2] is not None else 0.0

            cursor.execute(
                f"""
                SELECT pos_name, loai_ton, COUNT(*), SUM(cod_amount)
                FROM detailed_report_staging
                WHERE {where_sql} AND pos_name IS NOT NULL AND loai_ton IS NOT NULL
                GROUP BY pos_name, loai_ton ORDER BY pos_name
                """,
                tuple(params),
            )
            matrix_data = {}
            for pos, category, qty, cod in cursor.fetchall():
                matrix_data.setdefault(pos, {})[category] = {"qty": qty, "cod": float(cod or 0.0)}

            return {
                "total_qty": total_qty,
                "total_cod": total_cod,
                "total_weight": total_weight,
                "matrix": matrix_data,
            }
    except Exception as e:
        logger.error(f"Error fetching summary: {e}")
        return {"total_qty": 0, "total_cod": 0.0, "total_weight": 0.0, "matrix": {}}
    finally:
        conn.close()


@app.get("/api/bckt-summary")
def get_bckt_summary():
    conn = get_connection(with_db=True)
    try:
        with conn.cursor() as cursor:
            cursor.execute(f"""
                SELECT pos_name, pos_code, loai_ton, COUNT(*), SUM(cod_amount)
                FROM detailed_report_staging
                WHERE {PROVINCE_SQL} AND {BCKT_POS_SQL}
                GROUP BY pos_name, pos_code, loai_ton ORDER BY pos_name
            """)
            summary_dict = {}
            for raw_pos, code, cat, qty, raw_cod in cursor.fetchall():
                pos = raw_pos.strip()
                cod = float(raw_cod or 0.0)
                entry = summary_dict.setdefault(pos, {
                    "pos_name": pos, "pos_code": code, "total_qty": 0, "total_cod": 0.0, "matrix": {},
                })
                entry["matrix"][cat] = {"qty": qty, "cod": cod}
                entry["total_qty"] += qty
                entry["total_cod"] += cod

            cursor.execute(f"""
                SELECT item_code, pos_name, pos_code, loai_ton, status_name, cod_amount, weight, nhom_kh, postman_name
                FROM detailed_report_staging
                WHERE {PROVINCE_SQL} AND {BCKT_POS_SQL}
                ORDER BY cod_amount DESC, pos_name ASC
            """)
            items_list = [
                {
                    "item_code": r[0], "pos_name": r[1], "pos_code": r[2], "loai_ton": r[3],
                    "status_name": r[4], "cod_amount": float(r[5] or 0.0), "weight": float(r[6] or 0.0),
                    "nhom_kh": r[7], "postman_name": r[8],
                }
                for r in cursor.fetchall()
            ]
            return {
                "bckt_summary": list(summary_dict.values()),
                "bckt_items": items_list,
                "total_bckt_qty": len(items_list),
                "total_bckt_cod": sum(i["cod_amount"] for i in items_list),
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
    codes_only: bool = False,
):
    conn = get_connection(with_db=True)
    try:
        where_str, params = _build_detailed_where(search, pos_name, loai_ton, status_name, nhom_kh)

        if codes_only:
            with conn.cursor() as cursor:
                cursor.execute(f"SELECT DISTINCT item_code FROM detailed_report_staging WHERE {where_str}", tuple(params))
                codes = [r[0] for r in cursor.fetchall() if r[0]]
            return {"total": len(codes), "codes": codes, "rows": [{"item_code": c} for c in codes]}

        order_by = _build_order_by(sort_col, sort_dir)
        safe_page = max(1, page)
        safe_size = max(1, page_size)
        offset = (safe_page - 1) * safe_size

        with conn.cursor() as cursor:
            cursor.execute(f"SELECT COUNT(*) FROM detailed_report_staging WHERE {where_str}", tuple(params))
            total_records = cursor.fetchone()[0]

            cursor.execute(
                f"""
                SELECT item_code, pos_code, pos_name, dk1, status_name, loai_ton, nhom_kh,
                       cod_amount, weight, color_code, updated_at, postman_name
                FROM detailed_report_staging
                WHERE {where_str}
                ORDER BY {order_by}
                OFFSET %s ROWS FETCH NEXT %s ROWS ONLY
                """,
                tuple(params + [offset, safe_size]),
            )
            formatted_rows = [
                {
                    "item_code": r[0], "pos_code": r[1], "pos_name": r[2], "dk1": r[3],
                    "status_name": r[4], "loai_ton": r[5], "nhom_kh": r[6],
                    "cod_amount": float(r[7] or 0.0), "weight": float(r[8] or 0.0),
                    "color_code": r[9],
                    "updated_at": r[10].strftime("%Y-%m-%d %H:%M:%S") if r[10] else None,
                    "postman_name": r[11],
                }
                for r in cursor.fetchall()
            ]
        return {"total": total_records, "page": safe_page, "page_size": safe_size, "rows": formatted_rows}
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
    sort_dir: str = "asc",
):
    conn = get_connection(with_db=True)
    try:
        where_str, params = _build_detailed_where(search, pos_name, loai_ton, status_name, nhom_kh)
        order_by = _build_order_by(sort_col, sort_dir)

        with conn.cursor() as cursor:
            cursor.execute(
                f"""
                SELECT item_code, pos_code, pos_name, dk1, status_name, loai_ton, nhom_kh,
                       cod_amount, weight, updated_at, postman_name
                FROM detailed_report_staging
                WHERE {where_str}
                ORDER BY {order_by}
                """,
                tuple(params),
            )
            wb = Workbook()
            ws = wb.active
            ws.append([
                "Mã bưu gửi", "Mã bưu cục", "Bưu cục Phát", "DK1", "Thời gian tồn",
                "Trạng thái", "Nhóm KH", "Bưu tá", "COD", "Trọng lượng", "Thời gian quét",
            ])
            for r in cursor.fetchall():
                ws.append([
                    r[0], r[1], r[2], r[3], r[5], r[4], r[6], r[10],
                    float(r[7]) if r[7] else 0.0,
                    float(r[8]) if r[8] else 0.0,
                    r[9].strftime("%Y-%m-%d %H:%M:%S") if r[9] else "",
                ])
            return _xlsx_response(wb, "report_ton.xlsx")
    except Exception as e:
        logger.error(f"Error exporting data: {e}")
        wb = Workbook()
        ws = wb.active
        ws.title = "Error"
        ws.append(["Error", str(e)])
        return _xlsx_response(wb, "report_error.xlsx")
    finally:
        conn.close()


@app.get("/api/history")
def get_history():
    conn = get_connection(with_db=True)
    try:
        with conn.cursor() as cursor:
            cursor.execute(f"""
                SELECT snapshot_date, COUNT(*), SUM(cod_amount)
                FROM daily_snapshot
                WHERE {PROVINCE_SQL}
                GROUP BY snapshot_date ORDER BY snapshot_date ASC
            """)
            return [
                {
                    "date": r[0].strftime("%Y-%m-%d") if hasattr(r[0], "strftime") else str(r[0]),
                    "qty": r[1],
                    "cod": float(r[2] or 0.0),
                }
                for r in cursor.fetchall()
            ]
    except Exception as e:
        logger.error(f"Error fetching history data: {e}")
        return []
    finally:
        conn.close()


# --- INVENTORY COMPARISON & TREND ANALYTICS (TAB THỐNG KÊ) ---

@app.get("/api/inventory-comparison")
def get_inventory_comparison(
    target_date: Optional[str] = None,
    pos_code: Optional[str] = None,
    nhom_kh: Optional[str] = None,
):
    conn = get_connection(with_db=True)
    try:
        today_date = datetime.now().date()
        base_dt = _parse_date(target_date)
        d_t = base_dt
        d_t1 = base_dt - timedelta(days=1)
        d_t5 = base_dt - timedelta(days=5)
        d_t7 = base_dt - timedelta(days=7)
        d_t14 = base_dt - timedelta(days=14)
        is_base_today = d_t == today_date

        extra_sql = ""
        params_filter = []
        if pos_code and pos_code.strip():
            extra_sql += " AND pos_code = %s"
            params_filter.append(pos_code.strip())
        if nhom_kh and nhom_kh.strip():
            extra_sql += " AND nhom_kh = %s"
            params_filter.append(nhom_kh.strip())

        src_table = "detailed_report_staging" if is_base_today else "daily_snapshot"
        date_cond = "" if is_base_today else " AND snapshot_date = %s"
        base_params = ([] if is_base_today else [str(d_t)]) + params_filter

        with conn.cursor() as cursor:
            cursor.execute(
                f"SELECT COUNT(*), COALESCE(SUM(cod_amount), 0), COALESCE(SUM(weight), 0) "
                f"FROM {src_table} WHERE {PROVINCE_SQL} {date_cond} {extra_sql}",
                tuple(base_params),
            )
            row_t = cursor.fetchone()
            qty_t = row_t[0] or 0
            cod_t = float(row_t[1] or 0.0)
            weight_t = float(row_t[2] or 0.0)

            hist_dates = [str(d_t1), str(d_t5), str(d_t7), str(d_t14)]
            cursor.execute(
                f"""
                SELECT snapshot_date, COUNT(*), COALESCE(SUM(cod_amount), 0), COALESCE(SUM(weight), 0)
                FROM daily_snapshot
                WHERE {PROVINCE_SQL} AND snapshot_date IN (%s, %s, %s, %s) {extra_sql}
                GROUP BY snapshot_date
                """,
                tuple(hist_dates + params_filter),
            )
            hist_rows = {str(r[0]): {"qty": r[1], "cod": float(r[2]), "weight": float(r[3])} for r in cursor.fetchall()}

            def calc_milestone(dt_obj, label):
                item = hist_rows.get(str(dt_obj), {"qty": 0, "cod": 0.0})
                q, c = item["qty"], item["cod"]
                diff_q = qty_t - q
                return {
                    "date": str(dt_obj),
                    "label": label,
                    "qty": q,
                    "cod": c,
                    "diff_qty": diff_q,
                    "pct_qty": round(diff_q / q * 100, 1) if q > 0 else 0.0,
                    "diff_cod": cod_t - c,
                }

            milestones = {
                "t": {"date": str(d_t), "label": f"Ngày chọn ({d_t.strftime('%d/%m/%Y')})", "qty": qty_t, "cod": cod_t, "weight": weight_t},
                "t1": calc_milestone(d_t1, f"Hôm qua ({d_t1.strftime('%d/%m/%Y')})"),
                "t5": calc_milestone(d_t5, f"5 ngày trước ({d_t5.strftime('%d/%m/%Y')})"),
                "t7": calc_milestone(d_t7, f"7 ngày trước ({d_t7.strftime('%d/%m/%Y')})"),
                "t14": calc_milestone(d_t14, f"14 ngày trước ({d_t14.strftime('%d/%m/%Y')})"),
            }

            # 14-day trend line
            trend_dates = [base_dt - timedelta(days=i) for i in range(13, -1, -1)]
            trend_strs = [str(d) for d in trend_dates]
            placeholders = ", ".join(["%s"] * len(trend_strs))
            cursor.execute(
                f"""
                SELECT snapshot_date, COUNT(*), COALESCE(SUM(cod_amount), 0)
                FROM daily_snapshot
                WHERE {PROVINCE_SQL} AND snapshot_date IN ({placeholders}) {extra_sql}
                GROUP BY snapshot_date ORDER BY snapshot_date ASC
                """,
                tuple(trend_strs + params_filter),
            )
            trend_dict = {str(r[0]): {"qty": r[1], "cod": float(r[2])} for r in cursor.fetchall()}
            timeline_trend = [
                {"date": str(d), "label": d.strftime("%d/%m"), "qty": qty_t, "cod": cod_t}
                if d == today_date and is_base_today
                else {"date": str(d), "label": d.strftime("%d/%m"), **trend_dict.get(str(d), {"qty": 0, "cod": 0.0})}
                for d in trend_dates
            ]

            # Age breakdown
            cursor.execute(
                f"SELECT loai_ton, COUNT(*), COALESCE(SUM(cod_amount), 0) "
                f"FROM {src_table} WHERE {PROVINCE_SQL} AND loai_ton IS NOT NULL {date_cond} {extra_sql} GROUP BY loai_ton",
                tuple(base_params),
            )
            raw_age = {r[0]: {"qty": r[1], "cod": float(r[2] or 0.0)} for r in cursor.fetchall()}
            age_breakdown = [{"loai_ton": a, **raw_age[a]} for a in AGE_ORDER if a in raw_age]
            age_breakdown.extend({"loai_ton": a, **v} for a, v in raw_age.items() if a not in AGE_ORDER)

            # Top 10 postmen
            cursor.execute(
                f"""
                SELECT TOP 10 postman_name, MAX(pos_name), COUNT(*) AS qty,
                       COALESCE(SUM(cod_amount), 0),
                       SUM(CASE WHEN status_name = N'Phát không thành công' THEN 1 ELSE 0 END)
                FROM {src_table}
                WHERE {PROVINCE_SQL} AND postman_name IS NOT NULL AND LTRIM(RTRIM(postman_name)) != '' {date_cond} {extra_sql}
                GROUP BY postman_name ORDER BY qty DESC
                """,
                tuple(base_params),
            )
            top_postmen = [
                {"postman_name": r[0], "pos_name": r[1] or "", "qty": r[2], "cod_total": float(r[3] or 0.0), "failed_qty": r[4] or 0}
                for r in cursor.fetchall()
            ]

            # Customer groups & operational status
            cursor.execute(
                f"SELECT nhom_kh, COUNT(*) AS qty, COALESCE(SUM(cod_amount), 0) "
                f"FROM {src_table} WHERE {PROVINCE_SQL} AND nhom_kh IS NOT NULL {date_cond} {extra_sql} "
                f"GROUP BY nhom_kh ORDER BY qty DESC",
                tuple(base_params),
            )
            customer_groups = [{"nhom_kh": r[0], "qty": r[1], "cod_total": float(r[2] or 0.0)} for r in cursor.fetchall()]

            cursor.execute(
                f"SELECT status_name, COUNT(*) AS qty, COALESCE(SUM(cod_amount), 0) "
                f"FROM {src_table} WHERE {PROVINCE_SQL} AND status_name IS NOT NULL {date_cond} {extra_sql} "
                f"GROUP BY status_name ORDER BY qty DESC",
                tuple(base_params),
            )
            status_breakdown = [{"status_name": r[0], "qty": r[1], "cod_total": float(r[2] or 0.0)} for r in cursor.fetchall()]

            critical_age_qty = sum(i["qty"] for i in age_breakdown if "≥7" in i["loai_ton"] or "≥14" in i["loai_ton"])
            on_delivery_qty = sum(i["qty"] for i in status_breakdown if "bưu tá" in i["status_name"].lower())
            failed_delivery_qty = sum(i["qty"] for i in status_breakdown if "không thành công" in i["status_name"].lower())

            # Per-POS comparison matrix (parameterized for date T too)
            sub_t_sql = (
                f"SELECT 'T' AS src, pos_code, cod_amount FROM detailed_report_staging WHERE {PROVINCE_SQL}"
                if is_base_today
                else f"SELECT 'T' AS src, pos_code, cod_amount FROM daily_snapshot WHERE {PROVINCE_SQL} AND snapshot_date = %s"
            )
            matrix_params = ([] if is_base_today else [str(d_t)]) + hist_dates
            cursor.execute(
                f"""
                SELECT c.pos_code, c.pos_name, c.pos_type,
                       SUM(CASE WHEN d.src = 'T' THEN 1 ELSE 0 END) AS qty_t,
                       SUM(CASE WHEN d.src = 'T1' THEN 1 ELSE 0 END),
                       SUM(CASE WHEN d.src = 'T5' THEN 1 ELSE 0 END),
                       SUM(CASE WHEN d.src = 'T7' THEN 1 ELSE 0 END),
                       SUM(CASE WHEN d.src = 'T14' THEN 1 ELSE 0 END),
                       SUM(CASE WHEN d.src = 'T' THEN d.cod_amount ELSE 0 END)
                FROM pos_config c
                LEFT JOIN (
                    {sub_t_sql}
                    UNION ALL SELECT 'T1', pos_code, cod_amount FROM daily_snapshot WHERE {PROVINCE_SQL} AND snapshot_date = %s
                    UNION ALL SELECT 'T5', pos_code, cod_amount FROM daily_snapshot WHERE {PROVINCE_SQL} AND snapshot_date = %s
                    UNION ALL SELECT 'T7', pos_code, cod_amount FROM daily_snapshot WHERE {PROVINCE_SQL} AND snapshot_date = %s
                    UNION ALL SELECT 'T14', pos_code, cod_amount FROM daily_snapshot WHERE {PROVINCE_SQL} AND snapshot_date = %s
                ) d ON c.pos_code = d.pos_code
                WHERE c.is_active = 1
                GROUP BY c.pos_code, c.pos_name, c.pos_type
                ORDER BY qty_t DESC
                """,
                tuple(matrix_params),
            )
            pos_matrix = []
            for p_code, p_name, p_type, q_t, q_t1, q_t5, q_t7, q_t14, c_t in cursor.fetchall():
                q_t, q_t1, q_t5, q_t7, q_t14 = q_t or 0, q_t1 or 0, q_t5 or 0, q_t7 or 0, q_t14 or 0
                diff_1 = q_t - q_t1
                pct_1 = round(diff_1 / q_t1 * 100, 1) if q_t1 > 0 else 0.0
                if diff_1 < 0:
                    status_text, status_type = "Giảm tốt", "success"
                elif diff_1 == 0:
                    status_text, status_type = "Ổn định", "neutral"
                elif diff_1 > 100 or pct_1 > 20:
                    status_text, status_type = "Tăng cao", "danger"
                else:
                    status_text, status_type = "Tăng nhẹ", "warning"
                pos_matrix.append({
                    "pos_code": p_code, "pos_name": p_name, "pos_type": p_type or "BCP",
                    "qty_t": q_t, "qty_t1": q_t1, "diff_t1": diff_1, "pct_t1": pct_1,
                    "qty_t5": q_t5, "diff_t5": q_t - q_t5,
                    "qty_t7": q_t7, "diff_t7": q_t - q_t7,
                    "qty_t14": q_t14, "diff_t14": q_t - q_t14,
                    "cod_t": float(c_t or 0.0),
                    "status_text": status_text, "status_type": status_type,
                })

            return {
                "base_date": str(d_t),
                "is_base_today": is_base_today,
                "milestones": milestones,
                "kpi_summary": {
                    "total_qty": qty_t,
                    "total_cod": cod_t,
                    "total_weight": weight_t,
                    "on_delivery_qty": on_delivery_qty,
                    "failed_delivery_qty": failed_delivery_qty,
                    "critical_age_qty": critical_age_qty,
                    "diff_t1": milestones["t1"]["diff_qty"],
                    "pct_t1": milestones["t1"]["pct_qty"],
                    "diff_cod_t1": milestones["t1"]["diff_cod"],
                },
                "timeline_trend": timeline_trend,
                "age_breakdown": age_breakdown,
                "top_postmen": top_postmen,
                "customer_groups": customer_groups,
                "status_breakdown": status_breakdown,
                "pos_matrix": pos_matrix,
            }
    except Exception as e:
        logger.error(f"Error fetching inventory comparison: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@app.get("/api/thongke/drilldown")
def get_thongke_drilldown(
    target_date: Optional[str] = None,
    pos_code: Optional[str] = None,
    postman_name: Optional[str] = None,
    loai_ton: Optional[str] = None,
    status_name: Optional[str] = None,
    nhom_kh: Optional[str] = None,
    search: Optional[str] = None,
    page: int = 1,
    limit: int = 50,
):
    conn = get_connection(with_db=True)
    try:
        _, src_table, where_clause, params = _build_drilldown_query(
            target_date, pos_code, postman_name, loai_ton, status_name, nhom_kh, search
        )
        safe_page = max(1, page)
        safe_limit = min(max(1, limit), 200)
        offset = (safe_page - 1) * safe_limit

        with conn.cursor() as cursor:
            cursor.execute(f"SELECT COUNT(*) FROM {src_table} {where_clause}", tuple(params))
            total_count = cursor.fetchone()[0] or 0

            cursor.execute(
                f"""
                SELECT item_code, pos_code, pos_name, postman_name, loai_ton, status_name, nhom_kh, cod_amount, weight, updated_at
                FROM {src_table} {where_clause}
                ORDER BY cod_amount DESC, item_code ASC
                OFFSET %s ROWS FETCH NEXT %s ROWS ONLY
                """,
                tuple(params) + (offset, safe_limit),
            )
            items = [
                {
                    "item_code": r[0], "pos_code": r[1], "pos_name": r[2],
                    "postman_name": r[3] or "Chưa phân tuyến", "loai_ton": r[4] or "",
                    "status_name": r[5] or "", "nhom_kh": r[6] or "",
                    "cod_amount": float(r[7] or 0.0), "weight": float(r[8] or 0.0),
                    "updated_at": r[9].strftime("%d/%m/%Y %H:%M") if r[9] else "",
                }
                for r in cursor.fetchall()
            ]
        return {
            "total": total_count,
            "page": safe_page,
            "limit": safe_limit,
            "total_pages": (total_count + safe_limit - 1) // safe_limit,
            "items": items,
        }
    except Exception as e:
        logger.error(f"Error in thongke drilldown: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@app.get("/api/thongke/drilldown/export")
def export_thongke_drilldown(
    target_date: Optional[str] = None,
    pos_code: Optional[str] = None,
    postman_name: Optional[str] = None,
    loai_ton: Optional[str] = None,
    status_name: Optional[str] = None,
    nhom_kh: Optional[str] = None,
    search: Optional[str] = None,
):
    conn = get_connection(with_db=True)
    try:
        base_dt, src_table, where_clause, params = _build_drilldown_query(
            target_date, pos_code, postman_name, loai_ton, status_name, nhom_kh, search
        )
        with conn.cursor() as cursor:
            cursor.execute(
                f"""
                SELECT TOP 10000 item_code, pos_code, pos_name, postman_name, loai_ton, status_name, nhom_kh, cod_amount, weight, updated_at
                FROM {src_table} {where_clause}
                ORDER BY cod_amount DESC, item_code ASC
                """,
                tuple(params),
            )
            rows = cursor.fetchall()

        wb = Workbook()
        ws = wb.active
        ws.title = "ChiTietHangTon"
        headers = [
            "STT", "Mã bưu gửi", "Mã BC", "Tên bưu cục", "Bưu tá phát",
            "Tuổi tồn", "Trạng thái", "Nhóm KH", "Tiền COD (đ)", "Khối lượng (kg)", "Cập nhật",
        ]
        ws.append(headers)
        _style_header_row(ws, 1, len(headers), fill_hex="0D9488", border_color="CBD5E1")
        border = _thin_border("CBD5E1")

        for idx, r in enumerate(rows, start=1):
            ws.append([
                idx, r[0], r[1], r[2], r[3] or "Chưa phân tuyến", r[4] or "", r[5] or "", r[6] or "",
                float(r[7] or 0.0), float(r[8] or 0.0), r[9].strftime("%d/%m/%Y %H:%M") if r[9] else "",
            ])
            row_num = idx + 1
            for col_idx in range(1, len(headers) + 1):
                c = ws.cell(row=row_num, column=col_idx)
                c.border = border
                if col_idx in (1, 2, 3):
                    c.alignment = Alignment(horizontal="center")
                elif col_idx in (9, 10):
                    c.alignment = Alignment(horizontal="right")
                    c.number_format = "#,##0" if col_idx == 9 else "#,##0.00"

        _autofit_columns(ws, min_w=10, max_w=35)
        return _xlsx_response(wb, f"Chi_tiet_buu_gui_ton_{base_dt}.xlsx")
    except Exception as e:
        logger.error(f"Error exporting thongke drilldown: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@app.get("/api/inventory-comparison/export")
def export_inventory_comparison(
    target_date: Optional[str] = None,
    pos_code: Optional[str] = None,
    nhom_kh: Optional[str] = None,
):
    data = get_inventory_comparison(target_date=target_date, pos_code=pos_code, nhom_kh=nhom_kh)
    wb = Workbook()
    title_font = Font(name="Calibri", size=14, bold=True, color="047857")
    border = _thin_border("D1D5DB")

    # Sheet 1: Tổng hợp & So sánh
    ws1 = wb.active
    ws1.title = "Tổng Hợp & So Sánh"
    ws1.append(["BÁO CÁO SO SÁNH & XU HƯỚNG TỒN BƯU GỬI - BĐT LÂM ĐỒNG"])
    ws1.cell(row=1, column=1).font = title_font
    ws1.append([f"Ngày cơ sở đối chiếu: {data['base_date']}"])
    ws1.append([])
    ws1.append(["Mốc thời gian", "Ngày đối chiếu", "Sản lượng tồn (đơn)", "Tổng COD (đ)", "Chênh lệch so với T (đơn)", "Tỷ lệ tăng/giảm (%)"])
    _style_header_row(ws1, 4, 6, fill_hex="047857", border_color="D1D5DB")

    m = data["milestones"]
    milestone_rows = [
        ("Ngày chọn (T)", m["t"]["date"], m["t"]["qty"], m["t"]["cod"], 0, "0.0%"),
        ("Hôm qua (T-1)", m["t1"]["date"], m["t1"]["qty"], m["t1"]["cod"], m["t1"]["diff_qty"], f"{m['t1']['pct_qty']:+0.1f}%"),
        ("5 ngày trước (T-5)", m["t5"]["date"], m["t5"]["qty"], m["t5"]["cod"], m["t5"]["diff_qty"], f"{m['t5']['pct_qty']:+0.1f}%"),
        ("7 ngày trước (T-7)", m["t7"]["date"], m["t7"]["qty"], m["t7"]["cod"], m["t7"]["diff_qty"], f"{m['t7']['pct_qty']:+0.1f}%"),
        ("14 ngày trước (T-14)", m["t14"]["date"], m["t14"]["qty"], m["t14"]["cod"], m["t14"]["diff_qty"], f"{m['t14']['pct_qty']:+0.1f}%"),
    ]
    for r in milestone_rows:
        ws1.append(list(r))
        for col_idx in range(1, 7):
            c = ws1.cell(row=ws1.max_row, column=col_idx)
            c.border = border
            if col_idx in (3, 4, 5):
                c.number_format = "#,##0"
                c.alignment = Alignment(horizontal="right")

    # Sheet 2: Ma trận Bưu cục
    ws2 = wb.create_sheet(title="Ma Trận Bưu Cục")
    ws2.append(["MA TRẬN ĐỐI CHIẾU HÀNG TỒN CHI TIẾT THEO BƯU CỤC"])
    ws2.cell(row=1, column=1).font = title_font
    ws2.append([f"Ngày cơ sở: {data['base_date']}"])
    ws2.append([])
    headers_pos = [
        "STT", "Mã BC", "Tên bưu cục", "Loại BC", "Tồn ngày T (đơn)", "Hôm qua T-1",
        "Chênh lệch T-1", "% Biến động T-1", "5N trước T-5", "7N trước T-7", "14N trước T-14", "COD T (đ)", "Đánh giá",
    ]
    ws2.append(headers_pos)
    _style_header_row(ws2, 4, len(headers_pos), fill_hex="047857", border_color="D1D5DB")

    fill_green = PatternFill(start_color="D1FAE5", end_color="D1FAE5", fill_type="solid")
    fill_red = PatternFill(start_color="FEE2E2", end_color="FEE2E2", fill_type="solid")

    for idx, p in enumerate(data["pos_matrix"], start=1):
        ws2.append([
            idx, p["pos_code"], p["pos_name"], p["pos_type"], p["qty_t"], p["qty_t1"],
            p["diff_t1"], f"{p['pct_t1']:+0.1f}%", p["qty_t5"], p["qty_t7"], p["qty_t14"], p["cod_t"], p["status_text"],
        ])
        for col_idx in range(1, len(headers_pos) + 1):
            c = ws2.cell(row=ws2.max_row, column=col_idx)
            c.border = border
            if col_idx in (5, 6, 7, 9, 10, 11, 12):
                c.number_format = "#,##0"
                c.alignment = Alignment(horizontal="right")
            if col_idx == 7 and p["diff_t1"] != 0:
                c.fill = fill_green if p["diff_t1"] < 0 else fill_red

    _autofit_columns(ws1, min_w=12)
    _autofit_columns(ws2, min_w=12)
    return _xlsx_response(wb, f"BaoCao_SoSanhTon_{data['base_date'].replace('-', '')}.xlsx")


# --- AUTHENTICATION & USER MANAGEMENT ---

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
    try:
        return jwt.decode(authorization.split(" ")[1], JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except Exception:
        raise HTTPException(status_code=403, detail="Token không hợp lệ hoặc đã hết hạn.")


def require_admin(current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Từ chối truy cập. Quyền Admin được yêu cầu.")
    return current_user


@app.get("/api/auth/login-captcha")
def get_login_captcha():
    try:
        r = requests.get(f"{DINHVI_BACKEND_URL}/api/auth/login-captcha", timeout=15)
        if r.status_code == 200:
            return r.json()
        raise HTTPException(status_code=r.status_code, detail="Không thể lấy captcha từ Node.js")
    except HTTPException:
        raise
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
            cursor.execute(
                "SELECT id, username, password_hash, role, concurrency_limit, vnpost_cookie FROM users WHERE username = %s",
                (username,),
            )
            row = cursor.fetchone()
            if not row:
                raise HTTPException(status_code=400, detail="Tài khoản không tồn tại.")

            user_id, db_username, db_password_hash, db_role, db_concurrency_limit, db_cookie = row

            if db_password_hash in FIRST_LOGIN_MARKERS:
                hashed = _hash_password(password)
                cursor.execute(
                    "UPDATE users SET password_hash = %s, vnpost_username = %s, vnpost_password = %s WHERE id = %s",
                    (hashed, username, password, user_id),
                )
                logger.info(f"First login complete for '{username}' — password initialized.")
            else:
                try:
                    is_correct = bcrypt.checkpw(password.encode("utf-8"), db_password_hash.encode("utf-8"))
                except Exception:
                    is_correct = False
                if not is_correct:
                    raise HTTPException(status_code=400, detail="Mật khẩu không chính xác.")

                cursor.execute(
                    "UPDATE users SET vnpost_username = %s, vnpost_password = %s WHERE id = %s",
                    (username, password, user_id),
                )

                if req.captchaSolution and req.initialFields and req.initialCookies:
                    try:
                        node_res = requests.post(
                            f"{DINHVI_BACKEND_URL}/api/auth/login",
                            json={
                                "username": username,
                                "password": password,
                                "captchaSolution": req.captchaSolution,
                                "initialFields": req.initialFields,
                                "initialCookies": req.initialCookies,
                            },
                            timeout=15,
                        )
                        if node_res.status_code == 200:
                            cursor.execute("SELECT vnpost_cookie FROM users WHERE username = %s", (username,))
                            sql_row = cursor.fetchone()
                            if sql_row and sql_row[0]:
                                db_cookie = sql_row[0]
                    except Exception as e:
                        logger.warning(f"Login optional captcha VNPost refresh error for '{username}': {e}")

            token = jwt.encode(
                {"id": user_id, "username": db_username, "role": db_role},
                JWT_SECRET,
                algorithm=JWT_ALGORITHM,
            )
            return {
                "token": token,
                "user": {
                    "id": user_id,
                    "username": db_username,
                    "role": db_role,
                    "hasVnpostCookie": bool(db_cookie),
                    "vnpostUsername": db_username,
                    "concurrency_limit": db_concurrency_limit,
                },
            }
    finally:
        conn.close()


@app.post("/api/admin/import-users")
def admin_import_users(req: ImportUsersRequest, _admin: dict = Depends(require_admin)):
    conn = get_connection(with_db=True)
    success_count = 0
    try:
        with conn.cursor() as cursor:
            for user_item in req.users:
                username = user_item.username.strip()
                if not username:
                    continue
                cursor.execute("SELECT COUNT(*) FROM users WHERE username = %s", (username,))
                if cursor.fetchone()[0] > 0:
                    continue

                hashed = _hash_password(user_item.password) if (user_item.password and user_item.password.strip()) else "BCCP_PENDING"
                vn_user = user_item.vnpost_username.strip() if user_item.vnpost_username else None
                vn_pass = user_item.vnpost_password or None
                cursor.execute(
                    """
                    INSERT INTO users (username, password_hash, role, concurrency_limit, vnpost_username, vnpost_password)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    """,
                    (username, hashed, user_item.role, user_item.concurrency_limit, vn_user, vn_pass),
                )
                success_count += 1
        return {"message": f"Đồng bộ thành công {success_count} tài khoản từ BCCP."}
    finally:
        conn.close()


@app.get("/api/auth/me")
def auth_me(current_user: dict = Depends(get_current_user)):
    conn = get_connection(with_db=True)
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT id, username, role, concurrency_limit, vnpost_cookie FROM users WHERE id = %s",
                (current_user["id"],),
            )
            row = cursor.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Không tìm thấy người dùng.")
            return {
                "id": row[0],
                "username": row[1],
                "role": row[2],
                "hasVnpostCookie": bool(row[4]),
                "vnpostUsername": row[1],
                "concurrencyLimit": row[3] or 3,
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
                cursor.execute("UPDATE users SET password_hash = %s WHERE id = %s", (_hash_password(req.password), user_id))
            if req.vnpost_cookie is not None:
                cursor.execute("UPDATE users SET vnpost_cookie = %s WHERE id = %s", (json.dumps([req.vnpost_cookie.strip()]), user_id))
            if req.vnpost_username is not None and req.vnpost_password is not None:
                cursor.execute(
                    "UPDATE users SET vnpost_username = %s, vnpost_password = %s WHERE id = %s",
                    (req.vnpost_username.strip(), req.vnpost_password, user_id),
                )
        return {"message": "Cập nhật cấu hình thành công."}
    finally:
        conn.close()


@app.get("/api/admin/users")
def admin_get_users(_admin: dict = Depends(require_admin)):
    conn = get_connection(with_db=True)
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT id, username, role, concurrency_limit, created_at, vnpost_username, vnpost_password "
                "FROM users ORDER BY username"
            )
            return [
                {
                    "id": r[0],
                    "username": r[1],
                    "role": r[2],
                    "concurrency_limit": r[3] or 3,
                    "created_at": r[4].strftime("%Y-%m-%d %H:%M:%S") if r[4] else None,
                    "vnpost_username": r[5] or "",
                    "vnpost_password": r[6] or "",
                }
                for r in cursor.fetchall()
            ]
    finally:
        conn.close()


@app.post("/api/admin/users")
def admin_create_user(req: UserCreate, _admin: dict = Depends(require_admin)):
    username = req.username.strip()
    conn = get_connection(with_db=True)
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT COUNT(*) FROM users WHERE username = %s", (username,))
            if cursor.fetchone()[0] > 0:
                raise HTTPException(status_code=400, detail="Tài khoản này đã tồn tại.")

            vn_user = req.vnpost_username.strip() if req.vnpost_username else None
            vn_pass = req.vnpost_password or None
            cursor.execute(
                """
                INSERT INTO users (username, password_hash, role, concurrency_limit, vnpost_username, vnpost_password)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (username, _hash_password(req.password), req.role, req.concurrency_limit or 3, vn_user, vn_pass),
            )
        return {"message": "Tạo tài khoản thành công."}
    finally:
        conn.close()


@app.put("/api/admin/users/{user_id}")
def admin_update_user(user_id: int, req: UserUpdate, _admin: dict = Depends(require_admin)):
    conn = get_connection(with_db=True)
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT id FROM users WHERE id = %s", (user_id,))
            if not cursor.fetchone():
                raise HTTPException(status_code=404, detail="Không tìm thấy tài khoản.")

            updates = []
            params = []
            if req.username is not None:
                updates.append("username = %s")
                params.append(req.username.strip())
            if req.role is not None:
                updates.append("role = %s")
                params.append(req.role)
            if req.concurrency_limit is not None:
                updates.append("concurrency_limit = %s")
                params.append(req.concurrency_limit)
            if req.password is not None and req.password.strip():
                updates.append("password_hash = %s")
                params.append(_hash_password(req.password))
            if req.vnpost_username is not None:
                updates.append("vnpost_username = %s")
                params.append(req.vnpost_username.strip() or None)
            if req.vnpost_password is not None:
                updates.append("vnpost_password = %s")
                params.append(req.vnpost_password if req.vnpost_password.strip() else None)

            if updates:
                params.append(user_id)
                cursor.execute(f"UPDATE users SET {', '.join(updates)} WHERE id = %s", tuple(params))
        return {"message": "Cập nhật tài khoản thành công."}
    finally:
        conn.close()


@app.delete("/api/admin/users/{user_id}")
def admin_delete_user(user_id: int, current_user: dict = Depends(require_admin)):
    if current_user["id"] == user_id:
        raise HTTPException(status_code=400, detail="Bạn không thể tự xóa tài khoản của chính mình.")
    conn = get_connection(with_db=True)
    try:
        with conn.cursor() as cursor:
            cursor.execute("DELETE FROM users WHERE id = %s", (user_id,))
        return {"message": "Xóa tài khoản thành công."}
    finally:
        conn.close()


# --- PROXY TO DINHVI NODE.JS BACKEND ---

async def _proxy_dinhvi(target_path: str, request: Request, timeout: int = 120):
    headers = dict(request.headers)
    headers.pop("host", None)
    try:
        resp = requests.request(
            method=request.method,
            url=f"{DINHVI_BACKEND_URL}{target_path}",
            headers=headers,
            data=await request.body(),
            params=dict(request.query_params),
            timeout=timeout,
        )
        return Response(content=resp.content, status_code=resp.status_code, headers=dict(resp.headers))
    except Exception as e:
        logger.error(f"Proxy to Node.js backend failed for {target_path}: {e}")
        raise HTTPException(status_code=500, detail=f"Lỗi kết nối Node.js backend: {e}")


@app.api_route("/api/vnpost/{path:path}", methods=["GET", "POST", "PUT", "DELETE"])
async def proxy_vnpost(path: str, request: Request):
    return await _proxy_dinhvi(f"/api/vnpost/{path}", request, timeout=120)


@app.api_route("/api/export", methods=["POST"])
async def proxy_export(request: Request):
    return await _proxy_dinhvi("/api/export", request, timeout=300)


@app.api_route("/api/merge-and-save", methods=["POST"])
async def proxy_merge_and_save(request: Request):
    return await _proxy_dinhvi("/api/merge-and-save", request, timeout=120)


# --- STATIC FRONTEND FALLBACK ---

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
    if os.getenv("NO_AUTO_BROWSER") == "1":
        return
    time.sleep(2)
    webbrowser.open("http://localhost:8000")


@app.on_event("startup")
def startup_event():
    try:
        init_db()
    except Exception as e:
        logger.error(f"Error during startup DB initialization: {e}")
    threading.Thread(target=scheduler_thread, daemon=True).start()


if __name__ == "__main__":
    threading.Thread(target=open_browser_delayed, daemon=True).start()
    uvicorn.run(app, host="0.0.0.0", port=8000)
