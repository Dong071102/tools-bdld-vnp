import sql from 'mssql';

let pool = null;

// Hàm lấy pool kết nối an toàn, tự động kết nối lại nếu chưa có hoặc bị ngắt
export async function getPool() {
  if (pool && pool.connected) {
    return pool;
  }

  const host = process.env.DB_HOST || process.env.DB_SERVER || '10.61.200.10';
  const user = process.env.DB_USER || 'sa';
  const password = process.env.DB_PASSWORD || 'Sadmin123';
  const dbName = process.env.DB_NAME || 'caw_powerbi_db';
  const port = parseInt(process.env.DB_PORT || '1433', 10);

  const dbConfig = {
    user,
    password,
    server: host,
    port,
    database: dbName,
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000
    },
    options: {
      encrypt: false,
      trustServerCertificate: true
    }
  };

  try {
    pool = new sql.ConnectionPool(dbConfig);
    await pool.connect();
    console.log(`[Database] Đã kết nối thành công tới SQL Server ${host}:${port}/${dbName}`);
    return pool;
  } catch (err) {
    console.error(`[Database] Lỗi kết nối SQL Server ${host}:${port}/${dbName}:`, err.message);
    throw err;
  }
}

export async function initDatabase() {
  const activePool = await getPool();
  console.log(`[Database] Đang khởi tạo cấu trúc bảng trong [caw_powerbi_db]...`);

  // 3. Create tables in target database
  await activePool.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[users]') AND type in (N'U'))
    BEGIN
      CREATE TABLE [dbo].[users] (
        id INT IDENTITY(1,1) PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL,
        vnpost_cookie NVARCHAR(MAX),
        vnpost_username VARCHAR(255),
        vnpost_password VARCHAR(255),
        concurrency_limit INT DEFAULT 3,
        created_at DATETIME DEFAULT GETDATE()
      );
    END
  `);

  // Tự động nâng cấp thêm cột concurrency_limit nếu database đã tồn tại trước đó
  await activePool.request().query(`
    IF NOT EXISTS (
        SELECT * FROM sys.columns 
        WHERE object_id = OBJECT_ID(N'[dbo].[users]') AND name = 'concurrency_limit'
    )
    BEGIN
        ALTER TABLE [dbo].[users] ADD concurrency_limit INT DEFAULT 3;
    END
  `);

  console.log(`[Database] Đồng bộ các bảng SQL Server thành công.`);
}

// Helper to prepare request and translate ? to named parameters (@p1, @p2, ...)
async function prepareRequest(querySql, params) {
  const activePool = await getPool();
  let paramIndex = 0;
  // Replace ? placeholders with @p1, @p2, ...
  const translatedSql = querySql.replace(/\?/g, () => {
    paramIndex++;
    return `@p${paramIndex}`;
  });

  const request = activePool.request();
  for (let i = 0; i < params.length; i++) {
    request.input(`p${i + 1}`, params[i]);
  }

  return { request, translatedSql };
}

// Helper to run query (insert/update/delete)
export async function run(sqlStr, params = []) {
  let { request, translatedSql } = await prepareRequest(sqlStr, params);
  
  const isInsert = sqlStr.trim().toUpperCase().startsWith('INSERT');
  if (isInsert) {
    // Append SELECT SCOPE_IDENTITY() to get insert ID in SQL Server
    translatedSql += '; SELECT SCOPE_IDENTITY() AS insertId;';
    const result = await request.query(translatedSql);
    const insertId = result.recordset[0]?.insertId || null;
    return {
      id: insertId,
      changes: result.rowsAffected[0] || 0
    };
  } else {
    const result = await request.query(translatedSql);
    return {
      id: null,
      changes: result.rowsAffected[0] || 0
    };
  }
}

// Helper to get single row
export async function get(sqlStr, params = []) {
  const { request, translatedSql } = await prepareRequest(sqlStr, params);
  const result = await request.query(translatedSql);
  return result.recordset[0] || null;
}

// Helper to get all rows
export async function all(sqlStr, params = []) {
  const { request, translatedSql } = await prepareRequest(sqlStr, params);
  const result = await request.query(translatedSql);
  return result.recordset;
}
