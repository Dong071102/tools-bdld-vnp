import pymssql
conn = pymssql.connect(server='10.61.200.10', port=1433, user='sa', password='Sadmin123', database='caw_powerbi_db')
cursor = conn.cursor()
cursor.execute("SELECT DISTINCT loai_ton FROM detailed_report_staging")
rows = cursor.fetchall()
print("Distinct loai_ton:")
for r in rows:
    print(r)
