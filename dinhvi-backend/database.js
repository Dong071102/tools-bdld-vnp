import sql from 'mssql';

let pool = null;
let connecting = null;

export async function getPool() {
  if (pool?.connected) return pool;
  if (connecting) return connecting;

  const host = process.env.DB_HOST || process.env.DB_SERVER;
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD;
  const dbName = process.env.DB_NAME || 'caw_powerbi_db';
  const port = parseInt(process.env.DB_PORT || '1433', 10);

  if (!host || !user || !password) {
    throw new Error('Thiếu biến môi trường SQL Server (DB_HOST/DB_SERVER, DB_USER, DB_PASSWORD).');
  }

  const dbConfig = {
    user,
    password,
    server: host,
    port,
    database: dbName,
    pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
    options: { encrypt: false, trustServerCertificate: true }
  };

  connecting = (async () => {
    try {
      const nextPool = new sql.ConnectionPool(dbConfig);
      await nextPool.connect();
      pool = nextPool;
      console.log(`[Database] Đã kết nối thành công tới SQL Server ${host}:${port}/${dbName}`);
      return pool;
    } catch (err) {
      console.error(`[Database] Lỗi kết nối SQL Server ${host}:${port}/${dbName}:`, err.message);
      throw err;
    } finally {
      connecting = null;
    }
  })();

  return connecting;
}

export async function initDatabase() {
  const activePool = await getPool();
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

  await activePool.request().query(`
    IF NOT EXISTS (
      SELECT * FROM sys.columns
      WHERE object_id = OBJECT_ID(N'[dbo].[users]') AND name = 'concurrency_limit'
    )
    BEGIN
      ALTER TABLE [dbo].[users] ADD concurrency_limit INT DEFAULT 3;
    END
  `);

  console.log('[Database] Đồng bộ các bảng SQL Server thành công.');
}

async function prepareRequest(querySql, params) {
  const activePool = await getPool();
  let paramIndex = 0;
  const translatedSql = querySql.replace(/\?/g, () => `@p${++paramIndex}`);
  const request = activePool.request();
  params.forEach((val, i) => request.input(`p${i + 1}`, val));
  return { request, translatedSql };
}

export async function run(sqlStr, params = []) {
  let { request, translatedSql } = await prepareRequest(sqlStr, params);
  const isInsert = sqlStr.trim().toUpperCase().startsWith('INSERT');
  if (isInsert) translatedSql += '; SELECT SCOPE_IDENTITY() AS insertId;';
  const result = await request.query(translatedSql);
  return {
    id: isInsert ? (result.recordset?.[0]?.insertId || null) : null,
    changes: result.rowsAffected?.[0] || 0
  };
}

export async function get(sqlStr, params = []) {
  const { request, translatedSql } = await prepareRequest(sqlStr, params);
  const result = await request.query(translatedSql);
  return result.recordset[0] || null;
}

export async function all(sqlStr, params = []) {
  const { request, translatedSql } = await prepareRequest(sqlStr, params);
  const result = await request.query(translatedSql);
  return result.recordset;
}
