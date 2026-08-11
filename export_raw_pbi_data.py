import requests
import json
import uuid
import csv
import sys

URL = "https://wabi-east-asia-a-primary-api.analysis.windows.net/public/reports/querydata?synchronous=true"
RESOURCE_KEY = "412fbc7f-bec0-4b32-a6a4-7925d8c0eb9d"
ACCESS_TOKEN = "eyJrIjoiNDEyZmJjN2YtYmVjMC00YjMyLWE2YTQtNzkyNWQ4YzBlYjlkIiwidCI6IjRkNmQ2N2FlLTViNTUtNDJhYy05ZGFhLTkzOTk3Yzc3YTg3YSIsImMiOjEwfQ=="

def get_raw_data():
    headers = {
        "Accept": "application/json, text/plain, */*",
        "Content-Type": "application/json;charset=UTF-8",
        "Referer": "https://app.powerbi.com/",
        "X-PowerBI-User-Access-Token": ACCESS_TOKEN,
        "X-PowerBI-ResourceKey": RESOURCE_KEY,
        "RequestId": str(uuid.uuid4()),
        "ActivityId": str(uuid.uuid4()),
        "User-Agent": "Mozilla/5.0"
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
                                        {"Column": {"Expression": {"SourceRef": {"Source": "i"}}, "Property": "PTC Category_Ngay"}, "Name": "ItemStock.PTC Category_2"},
                                        {"Column": {"Expression": {"SourceRef": {"Source": "i"}}, "Property": "CODAmount"}, "Name": "Sum(ItemStock.CODAmount)"},
                                        {"Aggregation": {"Expression": {"Column": {"Expression": {"SourceRef": {"Source": "i"}}, "Property": "TL_2"}}, "Function": 0}, "Name": "Sum(ItemStock.TL_2)"},
                                        {"Measure": {"Expression": {"SourceRef": {"Source": "i"}}, "Property": "Màu Cột Matrix_2"}, "Name": "ItemStock.Màu Cột Matrix_2"}
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
                                        }
                                        # NOTE: Removed all other restrictive filters to get raw data
                                    ]
                                },
                                "Binding": {
                                    "Primary": {
                                        "Groupings": [{"Projections": [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]}]
                                    },
                                    "DataReduction": {
                                        "DataVolume": 3,
                                        "Primary": {"Window": {"Count": 100000}}
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

    print("Fetching raw data from Power BI...")
    response = requests.post(URL, headers=headers, json=payload, timeout=60)
    if response.status_code != 200:
        print(f"Failed. Code: {response.status_code}")
        return

    body = response.json()
    results = body.get("results", [])
    if not results:
        print("No results")
        return
        
    res_data = results[0].get("result", {}).get("data", {})
    dsr = res_data.get("dsr", {})
    ds_list = dsr.get("DS", [])
    if not ds_list:
        print("No DS object")
        return
        
    ds = ds_list[0]
    value_dicts = ds.get("ValueDicts", {})
    ph = ds.get("PH", [])
    if not ph:
        print("No PH object")
        return
        
    dm0 = ph[0].get("DM0", [])
    print(f"Retrieved {len(dm0)} compressed rows. Decompressing...")
    
    decoded_rows = []
    current_row = [None] * 10
    current_schema = [
        {"N": "G0", "T": 1, "DN": "D0"},
        {"N": "G1", "T": 1, "DN": "D1"},
        {"N": "G2", "T": 1, "DN": "D2"},
        {"N": "G3", "T": 1, "DN": "D3"},
        {"N": "G4", "T": 1, "DN": "D4"},
        {"N": "G5", "T": 1, "DN": "D5"},
        {"N": "G6", "T": 1, "DN": "D6"},
        {"N": "G7", "T": 3},
        {"N": "M0", "T": 3},
        {"N": "M1", "T": 1, "DN": "D7"}
    ]
    
    for item in dm0:
        if "S" in item:
            current_schema = item["S"]
            
        r_mask = item.get("R", 0)
        o_mask = item.get("Ø", 0)
        c_vals = item.get("C", [])
        
        new_row = [None] * 10
        c_idx = 0
        
        for col_idx in range(10):
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
        
        row_dict = {
            "province_ton": new_row[0],
            "pos_code": new_row[1],
            "pos_name": new_row[2],
            "dk1": new_row[3],
            "item_code": new_row[4],
            "status_name": new_row[5],
            "loai_ton": new_row[6],
            "cod_amount": float(new_row[7]) if new_row[7] is not None else 0.0,
            "weight": float(new_row[8]) if new_row[8] is not None else 0.0,
            "color_code": new_row[9]
        }
        # DO NOT FILTER AT ALL - Raw data
        decoded_rows.append(row_dict)

    if decoded_rows:
        keys = decoded_rows[0].keys()
        filename = 'raw_pbi_data.csv'
        with open(filename, 'w', newline='', encoding='utf-8-sig') as output_file:
            dict_writer = csv.DictWriter(output_file, fieldnames=keys)
            dict_writer.writeheader()
            dict_writer.writerows(decoded_rows)
        print(f"Exported {len(decoded_rows)} raw rows to {filename}")

if __name__ == "__main__":
    get_raw_data()
