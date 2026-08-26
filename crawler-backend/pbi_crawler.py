import requests
import json
import uuid
import logging
import os
import base64
import urllib.parse
from database import save_detailed_data

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

# Default Power BI fallback credentials (Updated to new report link)
DEFAULT_URL = "https://wabi-east-asia-a-primary-api.analysis.windows.net/public/reports/querydata?synchronous=true"
DEFAULT_RESOURCE_KEY = "6998fa41-e774-4882-8eb0-da7152cd5ff3"
DEFAULT_ACCESS_TOKEN = "eyJrIjoiNjk5OGZhNDEtZTc3NC00ODgyLThlYjAtZGE3MTUyY2Q1ZmYzIiwidCI6IjRkNmQ2N2FlLTViNTUtNDJhYy05ZGFhLTkzOTk3Yzc3YTg3YSIsImMiOjEwfQ=="

def get_pbi_credentials():
    """
    Retrieve Power BI credentials dynamically from environment variables.
    If POWERBI_URL is set (e.g. https://app.powerbi.com/view?r=eyJr...),
    it automatically extracts ACCESS_TOKEN and decodes RESOURCE_KEY from it.
    """
    pbi_url_env = os.environ.get("POWERBI_URL")
    resource_key = os.environ.get("POWERBI_RESOURCE_KEY")
    access_token = os.environ.get("POWERBI_ACCESS_TOKEN")

    if pbi_url_env:
        try:
            clean_url = urllib.parse.unquote(pbi_url_env.strip())
            parsed = urllib.parse.urlparse(clean_url)
            query_params = urllib.parse.parse_qs(parsed.query)
            if "r" in query_params:
                access_token = query_params["r"][0].strip()
                logger.info("Extracted POWERBI_ACCESS_TOKEN from POWERBI_URL environment variable.")
        except Exception as e:
            logger.warning(f"Could not parse POWERBI_URL: {e}")

    if access_token and not resource_key:
        try:
            clean_token = urllib.parse.unquote(access_token).strip()
            padded_token = clean_token + '=' * (-len(clean_token) % 4)
            decoded_bytes = base64.b64decode(padded_token)
            token_json = json.loads(decoded_bytes.decode('utf-8'))
            if "k" in token_json:
                resource_key = token_json["k"]
                logger.info(f"Extracted POWERBI_RESOURCE_KEY ({resource_key}) from access token.")
        except Exception as e:
            logger.warning(f"Could not decode resource_key from access token: {e}")

    final_url = os.environ.get("POWERBI_QUERY_URL", DEFAULT_URL)
    final_resource_key = resource_key or DEFAULT_RESOURCE_KEY
    final_access_token = access_token or DEFAULT_ACCESS_TOKEN

    return final_url, final_resource_key, final_access_token

def crawl_lamdong_data():
    """
    Crawl detailed inventory data for 'BĐT Lâm Đồng' from Power BI API,
    decode it from the DSR format, and save it to the SQL Server database.
    """
    logger.info("Starting Power BI crawl for BĐT Lâm Đồng with exact dashboard filters...")
    
    url, resource_key, access_token = get_pbi_credentials()

    headers = {
        "Accept": "application/json, text/plain, */*",
        "Content-Type": "application/json;charset=UTF-8",
        "Referer": "https://app.powerbi.com/",
        "X-PowerBI-User-Access-Token": access_token,
        "X-PowerBI-ResourceKey": resource_key,
        "RequestId": str(uuid.uuid4()),
        "ActivityId": str(uuid.uuid4()),
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }

    payload = {
        "version": "1.0.0",
        "queries": [
            {
                "Query": {
                    "Commands": [
                        {
                            "SemanticQueryDataShapeCommand": {
                                "Query": {
                                    "Version": 2,
                                    "From": [
                                        {"Name": "i", "Entity": "ItemStock", "Type": 0}
                                    ],
                                    "Select": [
                                        {"Column": {"Expression": {"SourceRef": {"Source": "i"}}, "Property": "Tỉnh Tồn_34"}, "Name": "ItemStock.Tỉnh Tồn_34"},
                                        {"Column": {"Expression": {"SourceRef": {"Source": "i"}}, "Property": "POSCode"}, "Name": "ItemStock.POSCode"},
                                        {"Column": {"Expression": {"SourceRef": {"Source": "i"}}, "Property": "POSName"}, "Name": "ItemStock.POSName"},
                                        {"Column": {"Expression": {"SourceRef": {"Source": "i"}}, "Property": "DK1"}, "Name": "ItemStock.DK1"},
                                        {"Column": {"Expression": {"SourceRef": {"Source": "i"}}, "Property": "ItemCode"}, "Name": "ItemStock.ItemCode"},
                                        {"Column": {"Expression": {"SourceRef": {"Source": "i"}}, "Property": "StatusName"}, "Name": "ItemStock.StatusName"},
                                        {"Column": {"Expression": {"SourceRef": {"Source": "i"}}, "Property": "PTC Category_Ngay_"}, "Name": "ItemStock.PTC Category_2"},
                                        {"Column": {"Expression": {"SourceRef": {"Source": "i"}}, "Property": "CODAmount"}, "Name": "Sum(ItemStock.CODAmount)"},
                                        {"Aggregation": {"Expression": {"Column": {"Expression": {"SourceRef": {"Source": "i"}}, "Property": "TL_2"}}, "Function": 0}, "Name": "Sum(ItemStock.TL_2)"},
                                        {"Measure": {"Expression": {"SourceRef": {"Source": "i"}}, "Property": "Màu Cột Matrix_2"}, "Name": "ItemStock.Màu Cột Matrix_2"},
                                        {"Column": {"Expression": {"SourceRef": {"Source": "i"}}, "Property": "Nhóm_KH"}, "Name": "ItemStock.Nhóm_KH"},
                                        {"Column": {"Expression": {"SourceRef": {"Source": "i"}}, "Property": "PostManName"}, "Name": "ItemStock.PostManName"}
                                    ],
                                    "Where": [
                                        # Filter 0: StatusName In
                                        {
                                            "Condition": {
                                                "In": {
                                                    "Expressions": [
                                                        {"Column": {"Expression": {"SourceRef": {"Source": "i"}}, "Property": "StatusName"}}
                                                    ],
                                                    "Values": [
                                                        [{"Literal": {"Value": "'Đã giao cho bưu tá'"}}],
                                                        [{"Literal": {"Value": "'Đã phân tuyến'"}}],
                                                        [{"Literal": {"Value": "'Đã xác nhận đến'"}}],
                                                        [{"Literal": {"Value": "'Phát không thành công'"}}],
                                                        [{"Literal": {"Value": "'Vu hồi về bưu cục'"}}]
                                                    ]
                                                }
                                            }
                                        },
                                        # Filter 1: DK1 In
                                        {
                                            "Condition": {
                                                "In": {
                                                    "Expressions": [
                                                        {"Column": {"Expression": {"SourceRef": {"Source": "i"}}, "Property": "DK1"}}
                                                    ],
                                                    "Values": [
                                                        [{"Literal": {"Value": "'LM'"}}]
                                                    ]
                                                }
                                            }
                                        },
                                        # Filter 2: POSName Not In
                                        {
                                            "Condition": {
                                                "Not": {
                                                    "Expression": {
                                                        "In": {
                                                            "Expressions": [
                                                                {"Column": {"Expression": {"SourceRef": {"Source": "i"}}, "Property": "POSName"}}
                                                            ],
                                                            "Values": [
                                                                [{"Literal": {"Value": "'[EMS] BCP Cầu Giấy'"}}],
                                                                [{"Literal": {"Value": "'[EMS] BCP Thanh Xuân'"}}],
                                                                [{"Literal": {"Value": "'[EMS] Bưu cục Đội phát hàng'"}}],
                                                                [{"Literal": {"Value": "'[EMS] Bưu cục Đội phát Q1'"}}],
                                                                [{"Literal": {"Value": "'[EMS] Giao dịch Tân Xuân'"}}],
                                                                [{"Literal": {"Value": "'BCP EMS Đống Đa'"}}],
                                                                [{"Literal": {"Value": "'BCP EMS Hồng Hà'"}}],
                                                                [{"Literal": {"Value": "'BCP EMS Phú Nhuận'"}}],
                                                                [{"Literal": {"Value": "'EMS KHL Cầu Giấy'"}}],
                                                                [{"Literal": {"Value": "'EMS Nam Từ Liêm'"}}],
                                                                [{"Literal": {"Value": "'Giao dịch EMS Hai Bà Trưng 2'"}}],
                                                                [{"Literal": {"Value": "'[TW] KT cục BĐTW Hà Nội'"}}]
                                                            ]
                                                        }
                                                    }
                                                }
                                            }
                                        },
                                        # Filter 3: Tỉnh Tồn Not In
                                        {
                                            "Condition": {
                                                "Not": {
                                                    "Expression": {
                                                        "In": {
                                                            "Expressions": [
                                                                {"Column": {"Expression": {"SourceRef": {"Source": "i"}}, "Property": "Tỉnh Tồn"}}
                                                            ],
                                                            "Values": [
                                                                [{"Literal": {"Value": "'Công ty vận chuyển kho vận'"}}],
                                                                [{"Literal": {"Value": "'Không xác định'"}}]
                                                            ]
                                                        }
                                                    }
                                                }
                                            }
                                        },
                                        # Filter 4: Tỉnh Tồn_34 Not In null
                                        {
                                            "Condition": {
                                                "Not": {
                                                    "Expression": {
                                                        "In": {
                                                            "Expressions": [
                                                                {"Column": {"Expression": {"SourceRef": {"Source": "i"}}, "Property": "Tỉnh Tồn_34"}}
                                                            ],
                                                            "Values": [
                                                                [{"Literal": {"Value": "null"}}]
                                                            ]
                                                        }
                                                    }
                                                }
                                            }
                                        },
                                        # Filter 5: Tỉnh Tồn_34 Not In other entities
                                        {
                                            "Condition": {
                                                "Not": {
                                                    "Expression": {
                                                        "In": {
                                                            "Expressions": [
                                                                {"Column": {"Expression": {"SourceRef": {"Source": "i"}}, "Property": "Tỉnh Tồn_34"}}
                                                            ],
                                                            "Values": [
                                                                [{"Literal": {"Value": "null"}}],
                                                                [{"Literal": {"Value": "'BĐTT KD Bình Chánh'"}}],
                                                                [{"Literal": {"Value": "'BĐTT KD Bình Dương'"}}],
                                                                [{"Literal": {"Value": "'BĐTT KD Chợ Lớn'"}}],
                                                                [{"Literal": {"Value": "'BĐTT KD Chương Mỹ'"}}],
                                                                [{"Literal": {"Value": "'BĐTT KD Củ Chi'"}}],
                                                                [{"Literal": {"Value": "'BĐTT KD Đông Anh'"}}],
                                                                [{"Literal": {"Value": "'BĐTT KD Gia Định'"}}],
                                                                [{"Literal": {"Value": "'BĐTT KD Hà Đông'"}}],
                                                                [{"Literal": {"Value": "'BĐTT KD Hoàn Kiếm'"}}],
                                                                [{"Literal": {"Value": "'BĐTT KD Long Biên'"}}],
                                                                [{"Literal": {"Value": "'BĐTT KD Nam Sài Gòn'"}}],
                                                                [{"Literal": {"Value": "'BĐTT KD Phú Thọ'"}}],
                                                                [{"Literal": {"Value": "'BĐTT KD Sài Gòn'"}}],
                                                                [{"Literal": {"Value": "'BĐTT KD Sơn Tây'"}}],
                                                                [{"Literal": {"Value": "'BĐTT KD Thanh Trì'"}}],
                                                                [{"Literal": {"Value": "'BĐTT KD Thủ Đức'"}}],
                                                                [{"Literal": {"Value": "'BĐTT KD Từ Liêm'"}}],
                                                                [{"Literal": {"Value": "'Công ty PHBC'"}}],
                                                                [{"Literal": {"Value": "'Công ty vận chuyển kho vận'"}}],
                                                                [{"Literal": {"Value": "'Không xác định'"}}],
                                                                [{"Literal": {"Value": "'BĐTT KD Bà Rịa Vũng Tàu'"}}]
                                                            ]
                                                        }
                                                    }
                                                }
                                            }
                                        },
                                        # Filter 6: PTC Category_Ngay Not In (<1 day etc)
                                        {
                                            "Condition": {
                                                "Not": {
                                                    "Expression": {
                                                        "In": {
                                                            "Expressions": [
                                                                {"Column": {"Expression": {"SourceRef": {"Source": "i"}}, "Property": "PTC Category_Ngay_"}}
                                                            ],
                                                            "Values": [
                                                                [{"Literal": {"Value": "'<1 ngày'"}}],
                                                                [{"Literal": {"Value": "'≥1 ngày'"}}],
                                                                [{"Literal": {"Value": "'≥1.5 ngày'"}}],
                                                                [{"Literal": {"Value": "'≥2 ngày'"}}]
                                                            ]
                                                        }
                                                    }
                                                }
                                            }
                                        },
                                        # Custom filter added to target ONLY 'BĐT Lâm Đồng'
                                        {
                                            "Condition": {
                                                "In": {
                                                    "Expressions": [
                                                        {"Column": {"Expression": {"SourceRef": {"Source": "i"}}, "Property": "Tỉnh Tồn_34"}}
                                                    ],
                                                    "Values": [
                                                        [{"Literal": {"Value": "'BĐT Lâm Đồng'"}}]
                                                    ]
                                                }
                                            }
                                        }
                                    ]
                                },
                                "Binding": {
                                    "Primary": {
                                        "Groupings": [{"Projections": [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]}]
                                    },
                                    "DataReduction": {
                                        "DataVolume": 3,
                                        "Primary": {"Window": {"Count": 50000}}
                                    },
                                    "SuppressedJoinPredicates": [9],
                                    "Version": 1
                                }
                            }
                        }
                    ]
                },
                "QueryId": "",
                "ApplicationContext": {
                    "DatasetId": "0f546f92-c359-4b9b-881e-f5aa52e65e16",
                    "Sources": [
                        {"ReportId": "5cfe4140-b883-4e4f-bdcb-f9f3ffa2ed41", "VisualId": "1d659223c46a549b16d3"}
                    ]
                }
            }
        ],
        "cancelQueries": [],
        "modelId": 2539655
    }

    try:
        response = requests.post(url, headers=headers, json=payload, timeout=60)
        if response.status_code != 200:
            logger.error(f"Failed to fetch data from Power BI. Status code: {response.status_code}, Response: {response.text}")
            return False
            
        body = response.json()
        results = body.get("results", [])
        if not results:
            logger.warning("No results returned in Power BI response.")
            return False
            
        res_data = results[0].get("result", {}).get("data", {})
        dsr = res_data.get("dsr", {})
        ds_list = dsr.get("DS", [])
        if not ds_list:
            logger.warning("No DS object found in Power BI response dsr.")
            return False
            
        ds = ds_list[0]
        value_dicts = ds.get("ValueDicts", {})
        ph = ds.get("PH", [])
        if not ph:
            logger.warning("No PH object found in Power BI response DS.")
            return False
            
        dm0 = ph[0].get("DM0", [])
        logger.info(f"Successfully retrieved {len(dm0)} compressed rows from Power BI.")
        
        # Decode the rows using the Power BI DSR decompression algorithm
        decoded_rows = []
        current_row = [None] * 12
        current_schema = [
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
            {"N": "G9", "T": 1, "DN": "D9"}
        ]
        
        for item in dm0:
            if "S" in item:
                current_schema = item["S"]
                
            r_mask = item.get("R", 0)
            o_mask = item.get("Ø", 0)
            c_vals = item.get("C", [])
            
            new_row = [None] * 12
            c_idx = 0
            
            for col_idx in range(12):
                is_inherited = (r_mask & (1 << col_idx)) != 0
                is_null = (o_mask & (1 << col_idx)) != 0
                
                if is_inherited:
                    new_row[col_idx] = current_row[col_idx]
                elif is_null:
                    new_row[col_idx] = None
                else:
                    if c_idx < len(c_vals):
                        val = c_vals[c_idx]
                        schema_col = current_schema[col_idx] if col_idx < len(current_schema) else None
                        if schema_col and "DN" in schema_col:
                            dict_name = schema_col["DN"]
                            dict_vals = value_dicts.get(dict_name, [])
                            if isinstance(val, int) and val < len(dict_vals):
                                new_row[col_idx] = dict_vals[val]
                            else:
                                new_row[col_idx] = val
                        else:
                            new_row[col_idx] = val
                        c_idx += 1
                    else:
                        new_row[col_idx] = None
                        
            current_row = new_row
            
            # Map values to dict keys based on Power BI schema order (G0-G9, M0-M1)
            row_dict = {
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
                "color_code": new_row[11]
            }
            
            if row_dict["province_ton"] == 'BĐT Lâm Đồng' and row_dict["item_code"]:
                decoded_rows.append(row_dict)
        
        logger.info(f"Decompressed and verified {len(decoded_rows)} rows for BĐT Lâm Đồng.")
        
        # Save to database
        if decoded_rows:
            save_detailed_data(decoded_rows)
            logger.info("Crawl and database save completed successfully.")
            return True
        else:
            logger.warning("No valid Lâm Đồng rows decoded.")
            return False
            
    except Exception as e:
        logger.error(f"Error during crawl process: {e}")
        raise e

if __name__ == "__main__":
    crawl_lamdong_data()
