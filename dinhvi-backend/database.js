import sql from 'mssql';

let pool;

export async function initDatabase() {
  const host = process.env.DB_HOST || '10.61.202.116';
  const user = process.env.DB_USER || 'sa';
  const password = process.env.DB_PASSWORD || 'Sadmin123';
  const dbName = process.env.DB_NAME || 'dinhvi_bccp';
  const port = parseInt(process.env.DB_PORT || '1433', 10);

  console.log(`[Database] Đang kết nối tới SQL Server ${host}:${port} (master)...`);

  // 1. Connect to master to check/create the target database
  const masterConfig = {
    user,
    password,
    server: host,
    port,
    database: 'master',
    options: {
      encrypt: false,
      trustServerCertificate: true
    }
  };

  try {
    let tempPool = await sql.connect(masterConfig);
    await tempPool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.databases WHERE name = '${dbName}')
      BEGIN
        CREATE DATABASE [${dbName}];
      END
    `);
    await sql.close();
    console.log(`[Database] Đã xác minh/tạo thành công cơ sở dữ liệu [${dbName}].`);
  } catch (err) {
    console.error(`[Database] Lỗi khi tạo database [${dbName}] trên master:`, err.message);
    // Try to close connection just in case
    try { await sql.close(); } catch (_) {}
  }

  // 2. Connect to the target database
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

  pool = await sql.connect(dbConfig);
  console.log(`[Database] Đang khởi tạo cấu trúc bảng trong [${dbName}]...`);

  // 3. Create tables in target database
  await pool.request().query(`
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
  await pool.request().query(`
    IF NOT EXISTS (
        SELECT * FROM sys.columns 
        WHERE object_id = OBJECT_ID(N'[dbo].[users]') AND name = 'concurrency_limit'
    )
    BEGIN
        ALTER TABLE [dbo].[users] ADD concurrency_limit INT DEFAULT 3;
    END
  `);

  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[export_history]') AND type in (N'U'))
    BEGIN
      CREATE TABLE [dbo].[export_history] (
        id INT IDENTITY(1,1) PRIMARY KEY,
        user_id INT NOT NULL,
        export_time DATETIME DEFAULT GETDATE(),
        total_codes INT NOT NULL,
        success_codes INT NOT NULL,
        file_name VARCHAR(255) NOT NULL,
        file_data_blob VARBINARY(MAX),
        status VARCHAR(50) NOT NULL,
        FOREIGN KEY (user_id) REFERENCES [dbo].[users](id) ON DELETE CASCADE
      );
    END
  `);

  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[exported_items]') AND type in (N'U'))
    BEGIN
      CREATE TABLE [dbo].[exported_items] (
        id INT IDENTITY(1,1) PRIMARY KEY,
        history_id INT NOT NULL,
        tracking_code VARCHAR(100) NOT NULL,
        data_json NVARCHAR(MAX) NOT NULL,
        FOREIGN KEY (history_id) REFERENCES [dbo].[export_history](id) ON DELETE CASCADE
      );
    END
  `);

  console.log(`[Database] Đồng bộ các bảng SQL Server thành công.`);
}

// Helper to prepare request and translate ? to named parameters (@p1, @p2, ...)
function prepareRequest(querySql, params) {
  let paramIndex = 0;
  // Replace ? placeholders with @p1, @p2, ...
  const translatedSql = querySql.replace(/\?/g, () => {
    paramIndex++;
    return `@p${paramIndex}`;
  });

  const request = pool.request();
  for (let i = 0; i < params.length; i++) {
    request.input(`p${i + 1}`, params[i]);
  }

  return { request, translatedSql };
}

// Helper to run query (insert/update/delete)
export async function run(sqlStr, params = []) {
  let { request, translatedSql } = prepareRequest(sqlStr, params);
  
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
  const { request, translatedSql } = prepareRequest(sqlStr, params);
  const result = await request.query(translatedSql);
  return result.recordset[0] || null;
}

// Helper to get all rows
export async function all(sqlStr, params = []) {
  const { request, translatedSql } = prepareRequest(sqlStr, params);
  const result = await request.query(translatedSql);
  return result.recordset;
}
