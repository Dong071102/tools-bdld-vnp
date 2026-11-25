import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDatabase, run, get, all } from './database.js';
import {
  getLoginState,
  loginToVnpost,
  exportBatchFromVnpost,
  updateCookies,
  cookieMapToString
} from './vnpost-client.js';
import { mergeExcelBuffers } from './excel-helper.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'vnpost-excel-exporter-jwt-secret-key-2026-dynamic-secure';
const BATCH_SIZE = 500;
const MAX_SESSIONS = 5;
const TRACE_URL = 'https://bccp.vnpost.vn/BCCP.aspx?act=TraceListv2';

app.use(cors());
app.use(express.json({ limit: '100mb' }));

initDatabase()
  .then(() => console.log('Database initialized successfully.'))
  .catch(err => console.error('Database initialization failed:', err));

// --- SHARED HELPERS ---

function parseCookiesArray(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [raw];
  } catch {
    return [raw];
  }
}

function formatCookiesObj(cookiesObj) {
  return Object.entries(cookiesObj).map(([k, v]) => `${k}=${v}`).join('; ');
}

async function checkVnpostCookieActive(cookieStr) {
  if (!cookieStr) return false;
  const formatted = cookieMapToString(updateCookies(cookieStr, {}));
  try {
    const response = await fetch(TRACE_URL, {
      headers: {
        Cookie: formatted,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      signal: AbortSignal.timeout(8000)
    });
    const html = await response.text();
    return !(html.includes('btnLogin') || html.includes('txtUser') || html.includes('txtUsername'));
  } catch {
    return false;
  }
}

async function sendCaptchaState(res, errorMessage) {
  try {
    const state = await getLoginState();
    res.json({ fields: state.fields, cookies: state.cookies, captchaImage: state.captchaImage });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: errorMessage });
  }
}

function sendMergedExcel(res, merged) {
  const timestamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
  const fileName = `DanhSachBuuGui_Gop_${timestamp}.${merged.extension}`;
  const mime = merged.extension === 'xlsx'
    ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    : 'application/vnd.ms-excel;charset=utf-8';
  res.setHeader('Content-Type', mime);
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
  return res.send(Buffer.from(merged.buffer));
}

function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization || req.query.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Không tìm thấy mã Token xác thực.' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Token không hợp lệ hoặc đã hết hạn.' });
    req.user = user;
    next();
  });
}

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Từ chối truy cập. Quyền Admin được yêu cầu.' });
  }
  next();
}

// --- AUTHENTICATION ENDPOINTS ---

app.get('/api/auth/login-captcha', (req, res) =>
  sendCaptchaState(res, 'Không thể kết nối đến VNPost để lấy Captcha.')
);

app.post('/api/auth/login', async (req, res) => {
  const { username, password, captchaSolution, initialFields, initialCookies } = req.body;
  if (!username || !password || !initialFields || !initialCookies) {
    return res.status(400).json({ error: 'Vui lòng nhập tài khoản VNPost, mật khẩu và giải captcha.' });
  }

  try {
    const cleanUser = username.trim();
    const vnResult = await loginToVnpost(cleanUser, password, captchaSolution, initialFields, initialCookies);
    if (!vnResult.success) {
      return res.status(400).json({ error: vnResult.error || 'Đăng nhập VNPost thất bại.' });
    }

    const cookiesStr = formatCookiesObj(vnResult.cookies);
    const userCountRow = await get(`SELECT COUNT(*) as count FROM users WHERE username != 'admin'`);
    let user = await get(`SELECT * FROM users WHERE username = ?`, [cleanUser]);

    if (!user) {
      if (userCountRow.count !== 0) {
        return res.status(403).json({ error: 'Tài khoản VNPost này chưa được phân quyền truy cập. Vui lòng liên hệ Quản trị viên.' });
      }
      const hash = await bcrypt.hash('vnpost-auth-placeholder', 10);
      const insertResult = await run(
        `INSERT INTO users (username, password_hash, role, vnpost_cookie, vnpost_username, vnpost_password, concurrency_limit) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [cleanUser, hash, 'admin', JSON.stringify([cookiesStr]), cleanUser, password, 1]
      );
      user = { id: insertResult.id, username: cleanUser, role: 'admin', concurrency_limit: 1 };
      console.log(`Đã đăng ký tài khoản Admin đầu tiên từ VNPost: ${cleanUser}`);
    } else {
      const cookiesArray = parseCookiesArray(user.vnpost_cookie);
      cookiesArray[0] = cookiesStr;
      await run(
        `UPDATE users SET vnpost_cookie = ?, vnpost_username = ?, vnpost_password = ? WHERE id = ?`,
        [JSON.stringify(cookiesArray), cleanUser, password, user.id]
      );
    }

    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET);
    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        hasVnpostCookie: true,
        vnpostUsername: user.username,
        concurrencyLimit: user.concurrency_limit || 3
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Lỗi hệ thống khi xử lý đăng nhập.' });
  }
});

app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const user = await get(
      `SELECT id, username, role, vnpost_cookie, vnpost_username, concurrency_limit FROM users WHERE id = ?`,
      [req.user.id]
    );
    if (!user) return res.status(404).json({ error: 'Không tìm thấy thông tin tài khoản.' });
    res.json({
      id: user.id,
      username: user.username,
      role: user.role,
      hasVnpostCookie: !!user.vnpost_cookie,
      vnpostUsername: user.vnpost_username || '',
      concurrencyLimit: user.concurrency_limit || 3
    });
  } catch {
    res.status(500).json({ error: 'Lỗi hệ thống.' });
  }
});

// --- ADMIN USER MANAGEMENT ---

app.get('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const users = await all(`SELECT id, username, role, concurrency_limit, created_at FROM users ORDER BY created_at DESC`);
    res.json(users.map(u => ({
      id: u.id,
      username: u.username,
      role: u.role,
      concurrencyLimit: u.concurrency_limit || 3,
      created_at: u.created_at
    })));
  } catch {
    res.status(500).json({ error: 'Lỗi hệ thống khi tải danh sách người dùng.' });
  }
});

app.post('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
  const { username, role, concurrencyLimit } = req.body;
  if (!username || !role) {
    return res.status(400).json({ error: 'Vui lòng cung cấp đầy đủ thông tin: username, role.' });
  }
  try {
    const cleanUser = username.trim();
    if (await get(`SELECT id FROM users WHERE username = ?`, [cleanUser])) {
      return res.status(400).json({ error: 'Tài khoản VNPost này đã tồn tại trong hệ thống.' });
    }
    const hash = await bcrypt.hash('vnpost-auth-placeholder', 10);
    const limit = concurrencyLimit || 3;
    const result = await run(
      `INSERT INTO users (username, password_hash, role, concurrency_limit) VALUES (?, ?, ?, ?)`,
      [cleanUser, hash, role, limit]
    );
    res.status(201).json({
      id: result.id,
      username: cleanUser,
      role,
      concurrencyLimit: limit,
      message: 'Phân quyền tài khoản thành công.'
    });
  } catch {
    res.status(500).json({ error: 'Lỗi hệ thống khi tạo tài khoản.' });
  }
});

app.put('/api/admin/users/:id', authenticateToken, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { password, role, concurrencyLimit } = req.body;
  try {
    const user = await get(`SELECT id, username FROM users WHERE id = ?`, [id]);
    if (!user) return res.status(404).json({ error: 'Không tìm thấy tài khoản.' });
    if (user.username === 'admin' && role && role !== 'admin') {
      return res.status(400).json({ error: 'Không thể thay đổi quyền quản trị tối cao (admin).' });
    }

    const updates = [];
    const params = [];
    if (password) {
      updates.push('password_hash = ?');
      params.push(await bcrypt.hash(password, 10));
    }
    if (role) {
      updates.push('role = ?');
      params.push(role);
    }
    if (concurrencyLimit !== undefined) {
      updates.push('concurrency_limit = ?');
      params.push(concurrencyLimit);
    }
    if (updates.length > 0) {
      params.push(id);
      await run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);
    }
    res.json({ message: 'Cập nhật tài khoản thành công.' });
  } catch {
    res.status(500).json({ error: 'Lỗi hệ thống khi cập nhật.' });
  }
});

app.delete('/api/admin/users/:id', authenticateToken, requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const user = await get(`SELECT id, username FROM users WHERE id = ?`, [id]);
    if (!user) return res.status(404).json({ error: 'Không tìm thấy tài khoản.' });
    if (user.username === 'admin' || user.id === req.user.id) {
      return res.status(400).json({ error: 'Không thể xóa tài khoản Admin mặc định hoặc tài khoản chính bạn đang dùng.' });
    }
    await run(`DELETE FROM users WHERE id = ?`, [id]);
    res.json({ message: 'Xóa tài khoản thành công.' });
  } catch {
    res.status(500).json({ error: 'Lỗi hệ thống khi xóa tài khoản.' });
  }
});

// --- MULTI-SESSION MANAGEMENT ---

app.get('/api/vnpost/sessions', authenticateToken, async (req, res) => {
  try {
    const user = await get(`SELECT vnpost_cookie, concurrency_limit FROM users WHERE username = ?`, [req.user.username]);
    if (!user) return res.status(404).json({ error: 'Không tìm thấy tài khoản.' });
    res.json({
      count: parseCookiesArray(user.vnpost_cookie).length,
      concurrencyLimit: user.concurrency_limit || 1
    });
  } catch {
    res.status(500).json({ error: 'Lỗi tải danh sách phiên kết nối.' });
  }
});

app.get('/api/vnpost/session-captcha', authenticateToken, (req, res) =>
  sendCaptchaState(res, 'Không thể tải Captcha từ máy chủ VNPost.')
);

async function upsertVnpostSession(req, res, { requireValidIndex = false }) {
  const { captchaSolution, initialFields, initialCookies, sessionIndex, password } = req.body;
  const username = req.user.username;

  let idx = null;
  if (requireValidIndex) {
    idx = parseInt(sessionIndex, 10);
    if (isNaN(idx) || idx < 0 || idx >= MAX_SESSIONS) {
      return res.status(400).json({ error: 'Chỉ số luồng không hợp lệ (0-4).' });
    }
  } else if (sessionIndex !== undefined && sessionIndex !== null) {
    idx = parseInt(sessionIndex, 10);
  }

  if (!captchaSolution || !initialFields || !initialCookies) {
    return res.status(400).json({ error: 'Thiếu dữ liệu giải Captcha VNPost.' });
  }

  try {
    const user = await get(`SELECT vnpost_username, vnpost_password, vnpost_cookie FROM users WHERE username = ?`, [username]);
    const vnUsername = user?.vnpost_username || username;
    const vnPassword = password || user?.vnpost_password;
    if (!vnUsername || !vnPassword) {
      return res.status(400).json({ error: 'Bạn cần cấu hình tài khoản và mật khẩu VNPost trước hoặc đăng nhập lại.' });
    }

    const result = await loginToVnpost(vnUsername, vnPassword, captchaSolution, initialFields, initialCookies);
    if (!result.success) {
      return res.status(400).json({ error: result.error || 'Đăng nhập luồng thất bại.' });
    }

    const newCookieStr = formatCookiesObj(result.cookies);
    const cookiesArray = parseCookiesArray(user?.vnpost_cookie);

    if (requireValidIndex) {
      while (cookiesArray.length <= idx) cookiesArray.push('');
      cookiesArray[idx] = newCookieStr;
    } else if (idx === 0 || cookiesArray.length === 0 || !cookiesArray[0]) {
      cookiesArray[0] = newCookieStr;
    } else if (idx !== null && !isNaN(idx) && idx >= 0) {
      while (cookiesArray.length <= idx) cookiesArray.push('');
      cookiesArray[idx] = newCookieStr;
    } else {
      cookiesArray.push(newCookieStr);
    }

    if (cookiesArray.length > MAX_SESSIONS) {
      return res.status(400).json({ error: `Đã đạt giới hạn tối đa ${MAX_SESSIONS} luồng tải song song.` });
    }

    await run(
      `UPDATE users SET vnpost_cookie = ?, vnpost_username = ?, vnpost_password = ? WHERE username = ?`,
      [JSON.stringify(cookiesArray), vnUsername, vnPassword, username]
    );

    res.json({
      success: true,
      count: cookiesArray.length,
      message: requireValidIndex
        ? `Đã khôi phục và kết nối lại Luồng ${idx + 1} thành công!`
        : 'Khởi tạo thành công phiên kết nối!'
    });
  } catch (err) {
    console.error('[Session Upsert Error]:', err);
    res.status(500).json({ error: 'Lỗi hệ thống khi kết nối luồng VNPost.' });
  }
}

app.post('/api/vnpost/add-session', authenticateToken, (req, res) =>
  upsertVnpostSession(req, res, { requireValidIndex: false })
);

app.post('/api/vnpost/refresh-session', authenticateToken, (req, res) =>
  upsertVnpostSession(req, res, { requireValidIndex: true })
);

app.post('/api/vnpost/reset-sessions', authenticateToken, async (req, res) => {
  const username = req.user.username || req.user.sub || req.user.id;
  if (!username) {
    return res.status(400).json({ error: 'Không tìm thấy thông tin tài khoản người dùng từ Token.' });
  }
  try {
    await run(`UPDATE users SET vnpost_cookie = ? WHERE username = ?`, [JSON.stringify([]), username]);
    res.json({ success: true, message: 'Đã đặt lại tất cả các luồng kết nối thành công.' });
  } catch (err) {
    console.error('[Reset Sessions Error]:', err);
    res.status(500).json({ error: 'Lỗi hệ thống khi đặt lại luồng: ' + err.message });
  }
});

app.get('/api/vnpost/sessions-status', authenticateToken, async (req, res) => {
  const username = req.user.username || req.user.sub || req.user.id;
  if (!username) {
    return res.status(400).json({ error: 'Không tìm thấy thông tin tài khoản người dùng từ Token.' });
  }
  try {
    const user = await get(`SELECT vnpost_cookie FROM users WHERE username = ?`, [username]);
    const cookiesArray = parseCookiesArray(user?.vnpost_cookie);
    if (cookiesArray.length === 0) {
      return res.json({ sessions: [{ index: 0, active: false }] });
    }
    const sessions = await Promise.all(
      cookiesArray.map(async (cookieStr, index) => ({ index, active: await checkVnpostCookieActive(cookieStr) }))
    );
    res.json({ sessions });
  } catch (err) {
    console.error('[Sessions Status Error]:', err);
    res.status(500).json({ error: 'Lỗi hệ thống khi kiểm tra trạng thái luồng.' });
  }
});

// --- SETTINGS & VNPOST LOGIN ---

app.post('/api/user/settings', authenticateToken, async (req, res) => {
  const { vnpost_cookie, vnpost_username, vnpost_password, password } = req.body;
  const username = req.user.username;
  try {
    if (password) {
      await run(`UPDATE users SET password_hash = ? WHERE username = ?`, [await bcrypt.hash(password, 10), username]);
    }
    if (vnpost_cookie !== undefined) {
      await run(`UPDATE users SET vnpost_cookie = ? WHERE username = ?`, [JSON.stringify([vnpost_cookie.trim()]), username]);
    }
    if (vnpost_username !== undefined && vnpost_password !== undefined) {
      await run(`UPDATE users SET vnpost_username = ?, vnpost_password = ? WHERE username = ?`, [vnpost_username.trim(), vnpost_password, username]);
    }
    res.json({ message: 'Cập nhật cấu hình thành công.' });
  } catch {
    res.status(500).json({ error: 'Lỗi hệ thống khi cập nhật cài đặt.' });
  }
});

app.get('/api/vnpost/login-state', authenticateToken, (req, res) =>
  sendCaptchaState(res, 'Không thể kết nối tới VNPost để lấy thông tin Captcha.')
);

app.post('/api/vnpost/login', authenticateToken, async (req, res) => {
  const { username, password, captchaSolution, initialFields, initialCookies } = req.body;
  if (!username || !password || !initialFields || !initialCookies) {
    return res.status(400).json({ error: 'Thiếu dữ liệu đăng nhập VNPost.' });
  }
  try {
    const result = await loginToVnpost(username, password, captchaSolution, initialFields, initialCookies);
    if (!result.success) return res.json({ success: false, error: result.error });

    const user = await get(`SELECT vnpost_cookie, concurrency_limit FROM users WHERE username = ?`, [req.user.username]);
    const cookiesArray = parseCookiesArray(user?.vnpost_cookie);
    cookiesArray[0] = formatCookiesObj(result.cookies);
    await run(
      `UPDATE users SET vnpost_cookie = ?, vnpost_username = ?, vnpost_password = ?, concurrency_limit = ? WHERE username = ?`,
      [JSON.stringify(cookiesArray), username, password, user?.concurrency_limit || cookiesArray.length || 1, req.user.username]
    );
    res.json({ success: true, message: 'Đăng nhập VNPost thành công và đã lưu phiên làm việc.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Có lỗi xảy ra khi xử lý đăng nhập với VNPost.' });
  }
});

// --- EXPORT ENDPOINTS ---

app.post('/api/export', authenticateToken, async (req, res) => {
  const { codes } = req.body;
  if (!Array.isArray(codes) || codes.length === 0) {
    return res.status(400).json({ error: 'Danh sách mã gửi trống.' });
  }
  const cleanCodes = [...new Set(codes.map(c => String(c).trim().toUpperCase()).filter(Boolean))];
  if (cleanCodes.length === 0) {
    return res.status(400).json({ error: 'Không tìm thấy mã bưu gửi nào hợp lệ.' });
  }

  try {
    const user = await get(`SELECT vnpost_cookie FROM users WHERE username = ?`, [req.user.username]);
    if (!user?.vnpost_cookie) {
      return res.status(400).json({ error: 'Bạn chưa cấu hình Cookie VNPost hoặc phiên đã hết hạn. Hãy vào phần Cài đặt.' });
    }

    const cookiesArray = parseCookiesArray(user.vnpost_cookie);
    const primaryCookie = cookiesArray[0] || user.vnpost_cookie;
    const excelBuffers = [];

    for (let i = 0; i < cleanCodes.length; i += BATCH_SIZE) {
      const batchCodes = cleanCodes.slice(i, i + BATCH_SIZE);
      try {
        excelBuffers.push(await exportBatchFromVnpost(batchCodes, primaryCookie));
      } catch (err) {
        console.error(`[Export] Lỗi tải lô ${Math.floor(i / BATCH_SIZE) + 1}:`, err.message);
        if (err.message.includes('Phiên đăng nhập VNPost hết hạn')) {
          return res.status(401).json({ error: err.message });
        }
      }
    }

    if (excelBuffers.length === 0) {
      return res.status(500).json({ error: 'Tất cả các lô xuất dữ liệu đều thất bại từ VNPost.' });
    }
    const merged = await mergeExcelBuffers(excelBuffers);
    if (!merged) return res.status(500).json({ error: 'Gộp dữ liệu Excel thất bại.' });
    return sendMergedExcel(res, merged);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Lỗi xử lý xuất Excel.' });
  }
});

app.post('/api/export-batch', authenticateToken, async (req, res) => {
  const { codes, sessionIndex } = req.body;
  if (!Array.isArray(codes) || codes.length === 0) {
    return res.status(400).json({ error: 'Không tìm thấy mã bưu gửi nào hợp lệ.' });
  }
  try {
    const user = await get(`SELECT vnpost_cookie FROM users WHERE id = ?`, [req.user.id]);
    if (!user?.vnpost_cookie) {
      return res.status(400).json({ error: 'Bạn chưa cấu hình Cookie VNPost hoặc phiên đã hết hạn. Hãy vào phần Cài đặt.' });
    }
    const cookiesArray = parseCookiesArray(user.vnpost_cookie);
    const idx = parseInt(sessionIndex, 10) || 0;
    const selectedCookie = cookiesArray.length > 0 ? cookiesArray[idx % cookiesArray.length] : user.vnpost_cookie;

    const buffer = await exportBatchFromVnpost(codes, selectedCookie);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(Buffer.from(buffer));
  } catch (err) {
    console.error('[Export Batch Error]:', err.message);
    res.status(500).json({ error: err.message || 'Lỗi tải lô từ VNPost.' });
  }
});

app.post('/api/merge-and-save', authenticateToken, async (req, res) => {
  const { buffers } = req.body;
  if (!Array.isArray(buffers) || buffers.length === 0) {
    return res.status(400).json({ error: 'Không có dữ liệu lô Excel nào để gộp.' });
  }
  try {
    const merged = await mergeExcelBuffers(buffers.map(b64 => Buffer.from(b64, 'base64')));
    if (!merged) return res.status(500).json({ error: 'Gộp dữ liệu Excel thất bại.' });
    return sendMergedExcel(res, merged);
  } catch (err) {
    console.error('[Merge Error]:', err.message);
    res.status(500).json({ error: err.message || 'Lỗi gộp dữ liệu Excel.' });
  }
});

// Static fallback for standalone mode
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendDistPath = path.join(__dirname, '../frontend/dist');
app.use(express.static(frontendDistPath));
app.get('*', (req, res) => res.sendFile(path.join(frontendDistPath, 'index.html')));

// Keep-alive worker every 5 minutes
async function keepSessionsAlive() {
  try {
    const users = await all(`SELECT id, username, vnpost_cookie FROM users WHERE vnpost_cookie IS NOT NULL`);
    for (const user of users) {
      const cookiesArray = parseCookiesArray(user.vnpost_cookie);
      for (let i = 0; i < cookiesArray.length; i++) {
        if (!cookiesArray[i]) continue;
        const ok = await checkVnpostCookieActive(cookiesArray[i]);
        console.log(`[Keep-Alive] Phiên ${i + 1}/${cookiesArray.length} (${user.username}): ${ok ? 'OK' : 'Hết hạn'}`);
      }
    }
  } catch (err) {
    console.error('[Keep-Alive] Lỗi tiến trình Keep-Alive:', err);
  }
}

setInterval(keepSessionsAlive, 5 * 60 * 1000);

app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
