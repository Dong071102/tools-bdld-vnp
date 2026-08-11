import requests
import json
import uuid

URL = "https://wabi-east-asia-a-primary-api.analysis.windows.net/public/reports/querydata?synchronous=true"
RESOURCE_KEY = "412fbc7f-bec0-4b32-a6a4-7925d8c0eb9d"
ACCESS_TOKEN = "eyJrIjoiNDEyZmJjN2YtYmVjMC00YjMyLWE2YTQtNzkyNWQ4YzBlYjlkIiwidCI6IjRkNmQ2N2FlLTViNTUtNDJhYy05ZGFhLTkzOTk3Yzc3YTg3YSIsImMiOjEwfQ=="

def test_nhom_kh():
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-PowerBI-User-Access-Token": ACCESS_TOKEN,
        "X-PowerBI-ResourceKey": RESOURCE_KEY,
        "RequestId": str(uuid.uuid4()),
        "ActivityId": str(uuid.uuid4())
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
                                    "From": [{"Name": "i", "Entity": "ItemStock", "Type": 0}],
                                    "Select": [
                                        {"Column": {"Expression": {"SourceRef": {"Source": "i"}}, "Property": "Nhóm_KH"}, "Name": "ItemStock.Nhóm_KH"}
                                    ]
                                },
                                "Binding": {
                                    "Primary": {"Groupings": [{"Projections": [0]}]},
                                    "DataReduction": {"DataVolume": 3, "Primary": {"Window": {"Count": 10}}}
                                }
                            }
                        }
                    ]
                },
                "ApplicationContext": {
                    "DatasetId": "0f546f92-c359-4b9b-881e-f5aa52e65e16",
                    "Sources": [{"ReportId": "5cfe4140-b883-4e4f-bdcb-f9f3ffa2ed41", "VisualId": "1d659223c46a549b16d3"}]
                }
            }
        ]
    }
    
    # Let's also try "Nhóm KH" or "Nhom_KH" if the first one fails
    properties_to_test = ["Nhóm_KH", "Nhóm KH", "Nhom_KH", "Nhom KH"]
    
    for prop in properties_to_test:
        payload["queries"][0]["Query"]["Commands"][0]["SemanticQueryDataShapeCommand"]["Query"]["Select"][0]["Column"]["Property"] = prop
        payload["queries"][0]["Query"]["Commands"][0]["SemanticQueryDataShapeCommand"]["Query"]["Select"][0]["Name"] = f"ItemStock.{prop}"
        
        print(f"Testing property: {prop}...")
        r = requests.post(URL, headers=headers, json=payload, timeout=10)
        print(f"Status: {r.status_code}")
        if r.status_code == 200:
            print(f"Success! The property '{prop}' is valid.")
            print(json.dumps(r.json(), indent=2)[:500])
            break

if __name__ == "__main__":
    test_nhom_kh()
