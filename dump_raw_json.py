import requests
import json
import uuid

URL = "https://wabi-east-asia-a-primary-api.analysis.windows.net/public/reports/querydata?synchronous=true"
RESOURCE_KEY = "412fbc7f-bec0-4b32-a6a4-7925d8c0eb9d"
ACCESS_TOKEN = "eyJrIjoiNDEyZmJjN2YtYmVjMC00YjMyLWE2YTQtNzkyNWQ4YzBlYjlkIiwidCI6IjRkNmQ2N2FlLTViNTUtNDJhYy05ZGFhLTkzOTk3Yzc3YTg3YSIsImMiOjEwfQ=="

def get_raw_unprocessed_data():
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

    # Same payload as the original crawler
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
                                        {
                                            "Condition": {
                                                "Not": {
                                                    "Expression": {
                                                        "In": {
                                                            "Expressions": [
                                                                {"Column": {"Expression": {"SourceRef": {"Source": "i"}}, "Property": "PTC Category_Ngay"}}
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
                                        "Groupings": [{"Projections": [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]}]
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

    print("Fetching raw unprocessed data from Power BI...")
    response = requests.post(URL, headers=headers, json=payload, timeout=60)
    
    if response.status_code != 200:
        print(f"Failed. Code: {response.status_code}")
        return

    filename = 'raw_pbi_response.json'
    with open(filename, 'w', encoding='utf-8') as f:
        # Write exact raw JSON content
        json.dump(response.json(), f, ensure_ascii=False, indent=2)
    
    print(f"Exported raw JSON response to {filename}")

if __name__ == "__main__":
    get_raw_unprocessed_data()
