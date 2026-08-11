import requests
import json
import uuid

URL = "https://wabi-east-asia-a-primary-api.analysis.windows.net/public/reports/querydata?synchronous=true"
ACCESS_TOKEN = "eyJrIjoiNDEyZmJjN2YtYmVjMC00YjMyLWE2YTQtNzkyNWQ4YzBlYjlkIiwidCI6IjRkNmQ2N2FlLTViNTUtNDJhYy05ZGFhLTkzOTk3Yzc3YTg3YSIsImMiOjEwfQ=="
RESOURCE_KEY = "412fbc7f-bec0-4b32-a6a4-7925d8c0eb9d"

def test_column(col_name):
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
        "queries": [{"Query": {"Commands": [{"SemanticQueryDataShapeCommand": {"Query": {
            "Version": 2,
            "From": [{"Name": "i", "Entity": "ItemStock", "Type": 0}],
            "Select": [{"Column": {"Expression": {"SourceRef": {"Source": "i"}}, "Property": col_name}, "Name": f"ItemStock.{col_name}"}],
            "Binding": {"Primary": {"Groupings": [{"Projections": [0]}]},"DataReduction": {"DataVolume": 3,"Primary": {"Window": {"Count": 1}}}}
        }}}]},"ApplicationContext": {"DatasetId": "0f546f92-c359-4b9b-881e-f5aa52e65e16","Sources": [{"ReportId": "5cfe4140-b883-4e4f-bdcb-f9f3ffa2ed41", "VisualId": "1"}]}}]}
    
    r = requests.post(URL, headers=headers, json=payload)
    if r.status_code == 200:
        data = r.json()
        print(f"[{col_name}] 200: {json.dumps(data)}")
    else:
        print(f"[{col_name}] HTTP {r.status_code}: {r.text}")

test_column("PostManName")
