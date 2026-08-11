import json
import pbi_crawler

def mock_save(data):
    print(f"Mock save called with {len(data)} rows.")
    if len(data) > 0:
        print(f"First row: {data[0]}")
        print(f"Last row: {data[-1]}")
pbi_crawler.save_detailed_data = mock_save
pbi_crawler.crawl_lamdong_data()
