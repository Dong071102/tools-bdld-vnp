import requests
import json
import uuid

URL = "https://wabi-east-asia-a-primary-api.analysis.windows.net/public/reports/querydata?synchronous=true"
ACCESS_TOKEN = "eyJrIjoiNDEyZmJjN2YtYmVjMC00YjMyLWE2YTQtNzkyNWQ4YzBlYjlkIiwidCI6IjRkNmQ2N2FlLTViNTUtNDJhYy05ZGFhLTkzOTk3Yzc3YTg3YSIsImMiOjEwfQ=="
RESOURCE_KEY = "412fbc7f-bec0-4b32-a6a4-7925d8c0eb9d"

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
    "queries": [{
        "Query": {
            "Commands": [{
                "ConceptualSchema": {}
            }]
        },
        "ApplicationContext": {
            "DatasetId": "0f546f92-c359-4b9b-881e-f5aa52e65e16",
            "Sources": [{"ReportId": "5cfe4140-b883-4e4f-bdcb-f9f3ffa2ed41", "VisualId": "1"}]
        }
    }]
}

r = requests.post(URL, headers=headers, json=payload)
if r.status_code == 200:
    data = r.json()
    try:
        entities = data['results'][0]['result']['data']['schema']['entities']
        for ent in entities:
            if ent['name'] == 'ItemStock':
                print(f"--- Properties for {ent['name']} ---")
                for prop in ent['properties']:
                    print(f"- {prop['name']} (Type: {prop['type']})")
                print("=====================")
    except Exception as e:
        print("Could not parse schema:", e)
        print(json.dumps(data)[:500])
else:
    print(f"HTTP {r.status_code}")
