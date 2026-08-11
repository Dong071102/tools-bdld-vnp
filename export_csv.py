import requests
import csv
import sys

print("Fetching data from API...")
response = requests.get('http://localhost:8000/api/detailed?page_size=20000')

if response.status_code != 200:
    print(f"Failed to fetch data: HTTP {response.status_code}")
    sys.exit(1)

data = response.json()
rows = data.get('rows', [])

if rows:
    keys = rows[0].keys()
    filename = 'sync_data.csv'
    with open(filename, 'w', newline='', encoding='utf-8-sig') as output_file:
        dict_writer = csv.DictWriter(output_file, fieldnames=keys)
        dict_writer.writeheader()
        dict_writer.writerows(rows)
    print(f"Successfully exported {len(rows)} rows to {filename}")
else:
    print("No data found to export.")
