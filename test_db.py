import pymssql
conn = pymssql.connect(server='10.61.200.10', port=1433, user='sa', password='Sadmin123', database='caw_powerbi_db')
cursor = conn.cursor()
cursor.execute("SELECT COUNT(*), COUNT(nhom_kh) FROM detailed_report_staging")
row = cursor.fetchone()
print(f"Total rows: {row[0]}, Non-null nhom_kh rows: {row[1]}")

cursor.execute("SELECT DISTINCT nhom_kh FROM detailed_report_staging")
rows = cursor.fetchall()
print("Distinct nhom_kh:")
for r in rows:
    print(r)
