import json
import pbi_crawler

# Patch save_detailed_data to do nothing
def mock_save(data):
    print(f"Mock save called with {len(data)} rows.")
    if len(data) > 0:
        print(f"First row: {data[0]}")
pbi_crawler.save_detailed_data = mock_save

pbi_crawler.crawl_lamdong_data()
