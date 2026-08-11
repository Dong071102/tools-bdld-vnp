import requests
import json
import uuid

URL = "https://wabi-east-asia-a-primary-api.analysis.windows.net/public/reports/querydata?synchronous=true"
RESOURCE_KEY = "412fbc7f-bec0-4b32-a6a4-7925d8c0eb9d"
ACCESS_TOKEN = "eyJrIjoiNDEyZmJjN2YtYmVjMC00YjMyLWE2YTQtNzkyNWQ4YzBlYjlkIiwidCI6IjRkNmQ2N2FlLTViNTUtNDJhYy05ZGFhLTkzOTk3Yzc3YTg3YSIsImMiOjEwfQ=="

def test_add_nhom_kh():
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
                                        {"Measure": {"Expression": {"SourceRef": {"Source": "i"}}, "Property": "Màu Cột Matrix_2"}, "Name": "ItemStock.Màu Cột Matrix_2"},
                                        {"Column": {"Expression": {"SourceRef": {"Source": "i"}}, "Property": "Nhóm_KH"}, "Name": "ItemStock.Nhóm_KH"}
                                    ],
                                    "Where": [
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
                                        "Groupings": [{"Projections": [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]}]
                                    },
                                    "DataReduction": {
                                        "DataVolume": 3,
                                        "Primary": {"Window": {"Count": 10}}
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

    r = requests.post(URL, headers=headers, json=payload, timeout=10)
    print("Status code:", r.status_code)
    if r.status_code == 200:
        data = r.json()
        print("Success! Schema returned:")
        res_data = data["results"][0]["result"]["data"]["dsr"]["DS"][0]["PH"][0]["DM0"]
        if "S" in res_data[0]:
            print(json.dumps(res_data[0]["S"], indent=2))
    else:
        print(r.text)

if __name__ == "__main__":
    test_add_nhom_kh()
