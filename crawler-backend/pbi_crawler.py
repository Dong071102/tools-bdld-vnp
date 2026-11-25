import base64
import json
import logging
import os
import urllib.parse
import uuid

import requests

from database import save_detailed_data

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

PBI_API_BASE = "https://wabi-east-asia-a-primary-api.analysis.windows.net/public/reports"
DEFAULT_URL = f"{PBI_API_BASE}/querydata?synchronous=true"
DEFAULT_RESOURCE_KEY = "e5064578-8933-4fac-abfc-81691efc421d"
DEFAULT_ACCESS_TOKEN = "eyJrIjoiZTUwNjQ1NzgtODkzMy00ZmFjLWFiZmMtODE2OTFlZmM0MjFkIiwidCI6IjRkNmQ2N2FlLTViNTUtNDJhYy05ZGFhLTkzOTk3Yzc3YTg3YSIsImMiOjEwfQ=="
DEFAULT_MODEL_ID = 3195541

_CACHED_MODEL_ID = None
_CACHED_RESOURCE_KEY = None

EXCLUDED_POS_NAMES = [
    "'[EMS] BCP Cầu Giấy'", "'[EMS] BCP Thanh Xuân'", "'[EMS] Bưu cục Đội phát hàng'",
    "'[EMS] Bưu cục Đội phát Q1'", "'[EMS] Giao dịch Tân Xuân'", "'BCP EMS Đống Đa'",
    "'BCP EMS Hồng Hà'", "'BCP EMS Phú Nhuận'", "'EMS KHL Cầu Giấy'",
    "'EMS Nam Từ Liêm'", "'Giao dịch EMS Hai Bà Trưng 2'", "'[TW] KT cục BĐTW Hà Nội'",
]

EXCLUDED_PROVINCES_34 = [
    "null", "'BĐTT KD Bình Chánh'", "'BĐTT KD Bình Dương'", "'BĐTT KD Chợ Lớn'",
    "'BĐTT KD Chương Mỹ'", "'BĐTT KD Củ Chi'", "'BĐTT KD Đông Anh'", "'BĐTT KD Gia Định'",
    "'BĐTT KD Hà Đông'", "'BĐTT KD Hoàn Kiếm'", "'BĐTT KD Long Biên'", "'BĐTT KD Nam Sài Gòn'",
    "'BĐTT KD Phú Thọ'", "'BĐTT KD Sài Gòn'", "'BĐTT KD Sơn Tây'", "'BĐTT KD Thanh Trì'",
    "'BĐTT KD Thủ Đức'", "'BĐTT KD Từ Liêm'", "'Công ty PHBC'",
    "'Công ty vận chuyển kho vận'", "'Không xác định'", "'BĐTT KD Bà Rịa Vũng Tàu'",
]

DEFAULT_DSR_SCHEMA = [
    {"N": "G0", "T": 1, "DN": "D0"},
    {"N": "G1", "T": 1, "DN": "D1"},
    {"N": "G2", "T": 1, "DN": "D2"},
    {"N": "G3", "T": 1, "DN": "D3"},
    {"N": "G4", "T": 1, "DN": "D4"},
    {"N": "G5", "T": 1, "DN": "D5"},
    {"N": "G6", "T": 1, "DN": "D6"},
    {"N": "G7", "T": 3},
    {"N": "G8", "T": 1, "DN": "D7"},
    {"N": "M0", "T": 3},
    {"N": "M1", "T": 1, "DN": "D8"},
    {"N": "G9", "T": 1, "DN": "D9"},
]


class PowerBIUrlError(Exception):
    """Raised when the Power BI URL or credentials are invalid, expired, or unreachable."""
    def __init__(self, message, status_code=None, raw_response=None):
        super().__init__(message)
        self.status_code = status_code
        self.raw_response = raw_response


def _pbi_headers(resource_key, access_token, with_json=False):
    headers = {
        "Accept": "application/json, text/plain, */*",
        "Referer": "https://app.powerbi.com/",
        "X-PowerBI-User-Access-Token": access_token,
        "X-PowerBI-ResourceKey": resource_key,
        "RequestId": str(uuid.uuid4()),
        "ActivityId": str(uuid.uuid4()),
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    }
    if with_json:
        headers["Content-Type"] = "application/json;charset=UTF-8"
    return headers


def _models_url(resource_key):
    return f"{PBI_API_BASE}/{resource_key}/modelsAndExploration?preferReturn=representation"


def _col(prop, name=None):
    expr = {"Column": {"Expression": {"SourceRef": {"Source": "i"}}, "Property": prop}}
    if name:
        expr["Name"] = name
    return expr


def _in_filter(prop, values, negate=False):
    cond = {"In": {"Expressions": [_col(prop)], "Values": [[{"Literal": {"Value": v}}] for v in values]}}
    return {"Condition": {"Not": {"Expression": cond}} if negate else cond}


def _cache_model_id(resp, resource_key):
    global _CACHED_MODEL_ID, _CACHED_RESOURCE_KEY
    models = resp.json().get("models", [])
    if models and "id" in models[0]:
        _CACHED_MODEL_ID = models[0]["id"]
        _CACHED_RESOURCE_KEY = resource_key
        return _CACHED_MODEL_ID
    return None


def get_pbi_credentials():
    """Retrieve Power BI credentials from env vars (auto-extracting token/key from POWERBI_URL)."""
    pbi_url_env = os.environ.get("POWERBI_URL")
    resource_key = os.environ.get("POWERBI_RESOURCE_KEY")
    access_token = os.environ.get("POWERBI_ACCESS_TOKEN")

    if pbi_url_env:
        try:
            parsed = urllib.parse.urlparse(urllib.parse.unquote(pbi_url_env.strip()))
            query_params = urllib.parse.parse_qs(parsed.query)
            if "r" in query_params:
                access_token = query_params["r"][0].strip()
                logger.info("Extracted POWERBI_ACCESS_TOKEN from POWERBI_URL environment variable.")
        except Exception as e:
            logger.warning(f"Could not parse POWERBI_URL: {e}")

    if access_token and not resource_key:
        try:
            clean_token = urllib.parse.unquote(access_token).strip()
            padded = clean_token + "=" * (-len(clean_token) % 4)
            token_json = json.loads(base64.b64decode(padded).decode("utf-8"))
            if "k" in token_json:
                resource_key = token_json["k"]
                logger.info(f"Extracted POWERBI_RESOURCE_KEY ({resource_key}) from access token.")
        except Exception as e:
            logger.warning(f"Could not decode resource_key from access token: {e}")

    return (
        os.environ.get("POWERBI_QUERY_URL", DEFAULT_URL),
        resource_key or DEFAULT_RESOURCE_KEY,
        access_token or DEFAULT_ACCESS_TOKEN,
    )


def get_report_model_id(resource_key, access_token):
    """Discover the modelId from Power BI for resource_key, falling back to cache or DEFAULT_MODEL_ID."""
    if _CACHED_MODEL_ID and _CACHED_RESOURCE_KEY == resource_key:
        return _CACHED_MODEL_ID
    try:
        resp = requests.get(_models_url(resource_key), headers=_pbi_headers(resource_key, access_token), timeout=10)
        if resp.status_code == 200:
            discovered = _cache_model_id(resp, resource_key)
            if discovered is not None:
                logger.info(f"Dynamically discovered modelId: {discovered} for resourceKey: {resource_key}")
                return discovered
    except Exception as e:
        logger.warning(f"Error discovering modelId from Power BI: {e}")
    return DEFAULT_MODEL_ID


def check_powerbi_url_health():
    """Probe Power BI modelsAndExploration endpoint. Returns (is_valid, error_message, status_code)."""
    _, resource_key, access_token = get_pbi_credentials()
    try:
        resp = requests.get(_models_url(resource_key), headers=_pbi_headers(resource_key, access_token), timeout=10)
        if resp.status_code == 200:
            _cache_model_id(resp, resource_key)
            return True, "", 200
        if resp.status_code in (401, 403, 404):
            return (
                False,
                f"Mã lỗi HTTP {resp.status_code}: URL báo cáo Power BI không tồn tại hoặc đã bị gỡ bỏ chia sẻ công khai.",
                resp.status_code,
            )
        return False, f"Mã lỗi HTTP {resp.status_code}: Máy chủ Power BI phản hồi lỗi ({resp.status_code}).", resp.status_code
    except Exception as e:
        return False, f"Không thể kết nối đến URL máy chủ Power BI ({e}).", None


def build_lamdong_payload(model_id):
    """Build the Power BI SemanticQueryDataShapeCommand payload for BĐT Lâm Đồng."""
    return {
        "version": "1.0.0",
        "queries": [
            {
                "Query": {
                    "Commands": [
                        {
                            "SemanticQueryDataShapeCommand": {
                                "Query": {
                                    "Version": 2,
                                    "From": [{"Name": "i", "Entity": "ItemStock", "Type": 0}],
                                    "Select": [
                                        _col("Tỉnh Tồn_34", "ItemStock.Tỉnh Tồn_34"),
                                        _col("POSCode", "ItemStock.POSCode"),
                                        _col("POSName", "ItemStock.POSName"),
                                        _col("DK1", "ItemStock.DK1"),
                                        _col("ItemCode", "ItemStock.ItemCode"),
                                        _col("StatusName", "ItemStock.StatusName"),
                                        _col("PTC Category_Ngay_", "ItemStock.PTC Category_2"),
                                        _col("CODAmount", "Sum(ItemStock.CODAmount)"),
                                        {"Aggregation": {"Expression": _col("TL_2"), "Function": 0}, "Name": "Sum(ItemStock.TL_2)"},
                                        {"Measure": {"Expression": {"SourceRef": {"Source": "i"}}, "Property": "Màu Cột Matrix_2"}, "Name": "ItemStock.Màu Cột Matrix_2"},
                                        _col("Nhóm_KH", "ItemStock.Nhóm_KH"),
                                        _col("PostManName", "ItemStock.PostManName"),
                                    ],
                                    "Where": [
                                        _in_filter("StatusName", [
                                            "'Đã giao cho bưu tá'", "'Đã phân tuyến'", "'Đã xác nhận đến'",
                                            "'Phát không thành công'", "'Vu hồi về bưu cục'",
                                        ]),
                                        _in_filter("DK1", ["'LM'"]),
                                        _in_filter("POSName", EXCLUDED_POS_NAMES, negate=True),
                                        _in_filter("Tỉnh Tồn", ["'Công ty vận chuyển kho vận'", "'Không xác định'"], negate=True),
                                        _in_filter("Tỉnh Tồn_34", ["null"], negate=True),
                                        _in_filter("Tỉnh Tồn_34", EXCLUDED_PROVINCES_34, negate=True),
                                        _in_filter("Tỉnh Tồn_34", ["'BĐT Lâm Đồng'"]),
                                    ],
                                },
                                "Binding": {
                                    "Primary": {"Groupings": [{"Projections": list(range(12))}]},
                                    "DataReduction": {"DataVolume": 3, "Primary": {"Window": {"Count": 50000}}},
                                    "SuppressedJoinPredicates": [9],
                                    "Version": 1,
                                },
                            }
                        }
                    ]
                },
                "QueryId": "",
                "ApplicationContext": {
                    "DatasetId": "0f546f92-c359-4b9b-881e-f5aa52e65e16",
                    "Sources": [{"ReportId": "5cfe4140-b883-4e4f-bdcb-f9f3ffa2ed41", "VisualId": "1d659223c46a549b16d3"}],
                },
            }
        ],
        "cancelQueries": [],
        "modelId": model_id,
    }


def decode_dsr_rows(dm0, value_dicts):
    """Decode Power BI DSR compressed rows into normalized Lâm Đồng dicts."""
    decoded_rows = []
    current_row = [None] * 12
    current_schema = DEFAULT_DSR_SCHEMA

    for item in dm0:
        if "S" in item:
            current_schema = item["S"]

        r_mask = item.get("R", 0)
        o_mask = item.get("Ø", 0)
        c_vals = item.get("C", [])
        new_row = [None] * 12
        c_idx = 0

        for col_idx in range(12):
            if r_mask & (1 << col_idx):
                new_row[col_idx] = current_row[col_idx]
            elif o_mask & (1 << col_idx):
                new_row[col_idx] = None
            elif c_idx < len(c_vals):
                val = c_vals[c_idx]
                schema_col = current_schema[col_idx] if col_idx < len(current_schema) else None
                if schema_col and "DN" in schema_col:
                    dict_vals = value_dicts.get(schema_col["DN"], [])
                    new_row[col_idx] = dict_vals[val] if isinstance(val, int) and val < len(dict_vals) else val
                else:
                    new_row[col_idx] = val
                c_idx += 1

        current_row = new_row
        if new_row[0] == "BĐT Lâm Đồng" and new_row[4]:
            decoded_rows.append({
                "province_ton": new_row[0],
                "pos_code": new_row[1],
                "pos_name": new_row[2],
                "dk1": new_row[3],
                "item_code": new_row[4],
                "status_name": new_row[5],
                "loai_ton": new_row[6],
                "cod_amount": float(new_row[7]) if new_row[7] is not None else 0.0,
                "nhom_kh": new_row[8],
                "postman_name": new_row[9],
                "weight": float(new_row[10]) if new_row[10] is not None else 0.0,
                "color_code": new_row[11],
            })

    return decoded_rows


def crawl_lamdong_data():
    """Crawl inventory data for 'BĐT Lâm Đồng' from Power BI API and save to SQL Server."""
    logger.info("Starting Power BI crawl for BĐT Lâm Đồng with exact dashboard filters...")
    url, resource_key, access_token = get_pbi_credentials()
    model_id = get_report_model_id(resource_key, access_token)

    try:
        response = requests.post(
            url,
            headers=_pbi_headers(resource_key, access_token, with_json=True),
            json=build_lamdong_payload(model_id),
            timeout=60,
        )
        if response.status_code != 200:
            logger.error(f"Failed to fetch data from Power BI. Status: {response.status_code}")
            raise PowerBIUrlError(
                f"Mã lỗi HTTP {response.status_code}: URL báo cáo Power BI không hợp lệ hoặc đã bị gỡ bỏ chia sẻ công khai.",
                status_code=response.status_code,
                raw_response=response.text,
            )

        results = response.json().get("results", [])
        ds_list = results[0].get("result", {}).get("data", {}).get("dsr", {}).get("DS", []) if results else []
        ph = ds_list[0].get("PH", []) if ds_list else []
        if not ph:
            logger.warning("No PH/DS/results object found in Power BI response.")
            return False

        dm0 = ph[0].get("DM0", [])
        logger.info(f"Successfully retrieved {len(dm0)} compressed rows from Power BI.")
        decoded_rows = decode_dsr_rows(dm0, ds_list[0].get("ValueDicts", {}))
        logger.info(f"Decompressed and verified {len(decoded_rows)} rows for BĐT Lâm Đồng.")

        if not decoded_rows:
            logger.warning("No valid Lâm Đồng rows decoded.")
            return False

        save_detailed_data(decoded_rows)
        logger.info("Crawl and database save completed successfully.")
        return True

    except PowerBIUrlError:
        raise
    except requests.exceptions.RequestException as re_err:
        logger.error(f"Network error during crawl process: {re_err}")
        raise PowerBIUrlError(f"Lỗi kết nối mạng đến URL Power BI ({re_err}).", raw_response=str(re_err))
    except Exception as e:
        logger.error(f"Error during crawl process: {e}")
        raise


if __name__ == "__main__":
    crawl_lamdong_data()
