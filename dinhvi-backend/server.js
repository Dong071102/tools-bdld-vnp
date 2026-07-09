import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import path from 'path';
import { fileURLToPath } from 'url';
import { 
  initDatabase, 
  run, 
  get, 
  all 
} from './database.js';
import { 
  getLoginState, 
  loginToVnpost, 
  exportBatchFromVnpost,
  updateCookies,
  cookieMapToString
} from './vnpost-client.js';
import { 
  mergeExcelBuffers, 
  parseExcelData, 
  looksLikeZip 
} from './excel-helper.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-123';
const BATCH_SIZE = 500;

app.use(cors());
app.use(express.json({ limit: '100mb' }));

// Initialize database
initDatabase().then(() => {
  console.log('Database initialized successfully.');
}).catch(err => {
  console.error('Database initialization failed:', err);
});

// Middleware for authentication
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'] || req.query.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) return res.status(401).json({ error: 'Không tìm thấy mã Token xác thực.' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Token không hợp lệ hoặc đã hết hạn.' });
    req.user = user;
    next();
  });
}

// Middleware for Admin permission
async function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Từ chối truy cập. Quyền Admin được yêu cầu.' });
  }
  next();
}

// --- AUTHENTICATION ENDPOINTS ---

// Get VNPost login captcha state (public, used by login screen)
app.get('/api/auth/login-captcha', async (req, res) => {
  try {
    const state = await getLoginState();
    res.json({
      fields: state.fields,
      cookies: state.cookies,
      captchaImage: state.captchaImage
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Không thể kết nối đến VNPost để lấy Captcha.' });
  }
});

// Login via VNPost
app.post('/api/auth/login', async (req, res) => {
  const { username, password, captchaSolution, initialFields, initialCookies } = req.body;
  
  if (!username || !password || !initialFields || !initialCookies) {
    return res.status(400).json({ error: 'Vui lòng nhập tài khoản VNPost, mật khẩu và giải captcha.' });
  }

  try {
    // 1. Verify credentials with VNPost
    const vnResult = await loginToVnpost(username.trim(), password, captchaSolution, initialFields, initialCookies);
    if (!vnResult.success) {
      return res.status(400).json({ error: vnResult.error || 'Đăng nhập VNPost thất bại.' });
    }

    const cookiesStr = Object.entries(vnResult.cookies).map(([k, v]) => `${k}=${v}`).join('; ');

    // 2. Check if users table is empty (ignore default 'admin' if any)
    const userCountRow = await get(`SELECT COUNT(*) as count FROM users WHERE username != 'admin'`);
    const isFirstUser = userCountRow.count === 0;

    let user = await get(`SELECT * FROM users WHERE username = ?`, [username.trim()]);
    
    if (!user) {
      if (isFirstUser) {
        // Auto-register first login as admin
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash('vnpost-auth-placeholder', salt);
        const insertResult = await run(
          `INSERT INTO users (username, password_hash, role, vnpost_cookie, vnpost_username, vnpost_password, concurrency_limit) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [username.trim(), hash, 'admin', JSON.stringify([cookiesStr]), username.trim(), password, 1]
        );
        user = {
          id: insertResult.id,
          username: username.trim(),
          role: 'admin',
          vnpost_cookie: JSON.stringify([cookiesStr]),
          vnpost_username: username.trim(),
          concurrency_limit: 1
        };
        console.log(`Đã đăng ký tài khoản Admin đầu tiên từ VNPost: ${username.trim()}`);
      } else {
        return res.status(403).json({ error: 'Tài khoản VNPost này chưa được phân quyền truy cập. Vui lòng liên hệ Quản trị viên.' });
      }
    } else {
      // Parse existing cookies to preserve them, only updating the primary (first) cookie
      let cookiesArray = [];
      if (user.vnpost_cookie) {
        try {
          cookiesArray = JSON.parse(user.vnpost_cookie);
          if (!Array.isArray(cookiesArray)) {
            cookiesArray = [user.vnpost_cookie];
          }
        } catch (e) {
          cookiesArray = [user.vnpost_cookie];
        }
      }

      if (cookiesArray.length > 0) {
        cookiesArray[0] = cookiesStr;
      } else {
        cookiesArray.push(cookiesStr);
      }

      // User exists, update session cookies and password, preserve concurrency limit and other threads
      await run(
        `UPDATE users SET vnpost_cookie = ?, vnpost_username = ?, vnpost_password = ? WHERE id = ?`,
        [JSON.stringify(cookiesArray), username.trim(), password, user.id]
      );
    }

    // 3. Generate JWT (no expiration for internal users)
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      JWT_SECRET
    );

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

// Get current user profile
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const user = await get(`SELECT id, username, role, vnpost_cookie, vnpost_username, concurrency_limit FROM users WHERE id = ?`, [req.user.id]);
    if (!user) return res.status(404).json({ error: 'Không tìm thấy thông tin tài khoản.' });
    
    res.json({
      id: user.id,
      username: user.username,
      role: user.role,
      hasVnpostCookie: !!user.vnpost_cookie,
      vnpostUsername: user.vnpost_username || '',
      concurrencyLimit: user.concurrency_limit || 3
    });
  } catch (err) {
    res.status(500).json({ error: 'Lỗi hệ thống.' });
  }
});

// --- ADMIN USER MANAGEMENT ENDPOINTS ---

// List all users
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
  } catch (err) {
    res.status(500).json({ error: 'Lỗi hệ thống khi tải danh sách người dùng.' });
  }
});

// Create new user (VNPost Username, Role, and ConcurrencyLimit)
app.post('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
  const { username, role, concurrencyLimit } = req.body;
  if (!username || !role) {
    return res.status(400).json({ error: 'Vui lòng cung cấp đầy đủ thông tin: username, role.' });
  }

  try {
    const userExists = await get(`SELECT * FROM users WHERE username = ?`, [username.trim()]);
    if (userExists) {
      return res.status(400).json({ error: 'Tài khoản VNPost này đã tồn tại trong hệ thống.' });
    }

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash('vnpost-auth-placeholder', salt);

    const result = await run(
      `INSERT INTO users (username, password_hash, role, concurrency_limit) VALUES (?, ?, ?, ?)`,
      [username.trim(), hash, role, concurrencyLimit || 3]
    );

    res.status(201).json({
      id: result.id,
      username: username.trim(),
      role,
      concurrencyLimit: concurrencyLimit || 3,
      message: 'Phân quyền tài khoản thành công.'
    });
  } catch (err) {
    res.status(500).json({ error: 'Lỗi hệ thống khi tạo tài khoản.' });
  }
});

// Update user (change role, password, or concurrency limit)
app.put('/api/admin/users/:id', authenticateToken, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { password, role, concurrencyLimit } = req.body;

  try {
    const user = await get(`SELECT * FROM users WHERE id = ?`, [id]);
    if (!user) return res.status(404).json({ error: 'Không tìm thấy tài khoản.' });

    if (user.username === 'admin' && role && role !== 'admin') {
      return res.status(400).json({ error: 'Không thể thay đổi quyền quản trị tối cao (admin).' });
    }

    if (password) {
      const salt = await bcrypt.genSalt(10);
      const hash = await bcrypt.hash(password, salt);
      await run(`UPDATE users SET password_hash = ? WHERE id = ?`, [hash, id]);
    }

    if (role) {
      await run(`UPDATE users SET role = ? WHERE id = ?`, [role, id]);
    }

    if (concurrencyLimit !== undefined) {
      await run(`UPDATE users SET concurrency_limit = ? WHERE id = ?`, [concurrencyLimit, id]);
    }

    res.json({ message: 'Cập nhật tài khoản thành công.' });
  } catch (err) {
    res.status(500).json({ error: 'Lỗi hệ thống khi cập nhật.' });
  }
});

// Delete user
app.delete('/api/admin/users/:id', authenticateToken, requireAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const user = await get(`SELECT * FROM users WHERE id = ?`, [id]);
    if (!user) return res.status(404).json({ error: 'Không tìm thấy tài khoản.' });

    if (user.username === 'admin' || user.id === req.user.id) {
      return res.status(400).json({ error: 'Không thể xóa tài khoản Admin mặc định hoặc tài khoản chính bạn đang dùng.' });
    }

    await run(`DELETE FROM users WHERE id = ?`, [id]);
    res.json({ message: 'Xóa tài khoản thành công.' });
  } catch (err) {
    res.status(500).json({ error: 'Lỗi hệ thống khi xóa tài khoản.' });
  }
});

// --- MULTI-SESSION MANAGEMENT ENDPOINTS ---

// Lấy danh sách số phiên hoạt động hiện tại
app.get('/api/vnpost/sessions', authenticateToken, async (req, res) => {
  const username = req.user.username;
  try {
    const user = await get(`SELECT vnpost_cookie, concurrency_limit FROM users WHERE username = ?`, [username]);
    if (!user) return res.status(404).json({ error: 'Không tìm thấy tài khoản.' });

    let cookiesArray = [];
    if (user.vnpost_cookie) {
      try {
        cookiesArray = JSON.parse(user.vnpost_cookie);
        if (!Array.isArray(cookiesArray)) {
          cookiesArray = [user.vnpost_cookie];
        }
      } catch (e) {
        cookiesArray = [user.vnpost_cookie];
      }
    }

    res.json({
      count: cookiesArray.length,
      concurrencyLimit: user.concurrency_limit || 1
    });
  } catch (err) {
    res.status(500).json({ error: 'Lỗi tải danh sách phiên kết nối.' });
  }
});

// Lấy Captcha để phục vụ kết nối thêm luồng phiên mới
app.get('/api/vnpost/session-captcha', authenticateToken, async (req, res) => {
  try {
    const state = await getLoginState();
    res.json({
      fields: state.fields,
      cookies: state.cookies,
      captchaImage: state.captchaImage
    });
  } catch (err) {
    res.status(500).json({ error: 'Không thể tải Captcha từ máy chủ VNPost.' });
  }
});

// Thêm một luồng phiên kết nối mới bằng cách giải captcha
app.post('/api/vnpost/add-session', authenticateToken, async (req, res) => {
  const { captchaSolution, initialFields, initialCookies } = req.body;
  const username = req.user.username;

  if (!captchaSolution || !initialFields || !initialCookies) {
    return res.status(400).json({ error: 'Thiếu dữ liệu giải Captcha VNPost.' });
  }

  try {
    // Lấy thông tin tài khoản mật khẩu đã lưu
    const user = await get(`SELECT vnpost_username, vnpost_password, vnpost_cookie FROM users WHERE username = ?`, [username]);
    if (!user || !user.vnpost_username || !user.vnpost_password) {
      return res.status(400).json({ error: 'Bạn cần cấu hình tài khoản và mật khẩu VNPost trước hoặc đăng nhập lại.' });
    }

    // Đăng nhập luồng mới
    const result = await loginToVnpost(user.vnpost_username, user.vnpost_password, captchaSolution, initialFields, initialCookies);
    if (!result.success) {
      return res.status(400).json({ error: result.error || 'Đăng nhập luồng mới thất bại.' });
    }

    // Định dạng Cookie mới thành chuỗi
    const newCookieStr = Object.entries(result.cookies).map(([k, v]) => `${k}=${v}`).join('; ');

    // Parse danh sách cookie hiện tại
    let cookiesArray = [];
    if (user.vnpost_cookie) {
      try {
        cookiesArray = JSON.parse(user.vnpost_cookie);
        if (!Array.isArray(cookiesArray)) {
          cookiesArray = [user.vnpost_cookie];
        }
      } catch (e) {
        cookiesArray = [user.vnpost_cookie];
      }
    }

    // Thêm cookie mới
    cookiesArray.push(newCookieStr);

    if (cookiesArray.length > 5) {
      return res.status(400).json({ error: 'Đã đạt giới hạn tối đa 5 luồng tải song song.' });
    }

    // Cập nhật DB
    await run(
      `UPDATE users SET vnpost_cookie = ? WHERE username = ?`,
      [JSON.stringify(cookiesArray), username]
    );

    res.json({
      success: true,
      count: cookiesArray.length,
      message: `Khởi tạo thành công phiên kết nối thứ ${cookiesArray.length}!`
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Lỗi hệ thống khi thêm luồng phiên mới.' });
  }
});

// Đặt lại số luồng về 1
app.post('/api/vnpost/reset-sessions', authenticateToken, async (req, res) => {
  const username = req.user.username;
  try {
    const user = await get(`SELECT vnpost_cookie FROM users WHERE username = ?`, [username]);
    if (!user || !user.vnpost_cookie) {
      return res.status(400).json({ error: 'Không tìm thấy phiên kết nối nào.' });
    }

    let cookiesArray = [];
    try {
      cookiesArray = JSON.parse(user.vnpost_cookie);
      if (!Array.isArray(cookiesArray)) {
        cookiesArray = [user.vnpost_cookie];
      }
    } catch (e) {
      cookiesArray = [user.vnpost_cookie];
    }

    const firstCookie = cookiesArray[0] || '';
    await run(
      `UPDATE users SET vnpost_cookie = ? WHERE username = ?`,
      [JSON.stringify([firstCookie]), username]
    );

    res.json({
      success: true,
      message: 'Đã đặt lại về 1 luồng kết nối thành công.'
    });
  } catch (err) {
    res.status(500).json({ error: 'Lỗi hệ thống khi đặt lại luồng.' });
  }
});

// Lấy trạng thái hoạt động thực tế của từng luồng phiên kết nối
app.get('/api/vnpost/sessions-status', authenticateToken, async (req, res) => {
  const username = req.user.username;
  try {
    const user = await get(`SELECT vnpost_cookie FROM users WHERE username = ?`, [username]);
    if (!user || !user.vnpost_cookie) {
      return res.json({ sessions: [] });
    }

    let cookiesArray = [];
    try {
      cookiesArray = JSON.parse(user.vnpost_cookie);
      if (!Array.isArray(cookiesArray)) {
        cookiesArray = [user.vnpost_cookie];
      }
    } catch (e) {
      cookiesArray = [user.vnpost_cookie];
    }

    const sessions = [];
    const checkPromises = cookiesArray.map(async (cookieStr, idx) => {
      if (!cookieStr) {
        return { index: idx, active: false };
      }

      const cookieMap = updateCookies(cookieStr, {});
      const cookiesStrFormatted = cookieMapToString(cookieMap);

      try {
        const response = await fetch('https://bccp.vnpost.vn/BCCP.aspx?act=TraceListv2', {
          headers: {
            'Cookie': cookiesStrFormatted,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
          }
        });
        const html = await response.text();
        const active = !(html.includes('btnLogin') || html.includes('txtUser') || html.includes('txtUsername'));
        return { index: idx, active };
      } catch (err) {
        return { index: idx, active: false };
      }
    });

    const results = await Promise.all(checkPromises);
    res.json({ sessions: results });
  } catch (err) {
    console.error('[Sessions Status Error]:', err);
    res.status(500).json({ error: 'Lỗi hệ thống khi kiểm tra trạng thái luồng.' });
  }
});

// Đăng nhập lại một luồng cụ thể thông qua Captcha
app.post('/api/vnpost/refresh-session', authenticateToken, async (req, res) => {
  const { sessionIndex, captchaSolution, initialFields, initialCookies } = req.body;
  const username = req.user.username;

  const idx = parseInt(sessionIndex, 10);
  if (isNaN(idx) || idx < 0 || idx >= 5) {
    return res.status(400).json({ error: 'Chỉ số luồng không hợp lệ (0-4).' });
  }

  if (!captchaSolution || !initialFields || !initialCookies) {
    return res.status(400).json({ error: 'Thiếu thông tin giải Captcha.' });
  }

  try {
    const user = await get(`SELECT vnpost_username, vnpost_password, vnpost_cookie FROM users WHERE username = ?`, [username]);
    if (!user || !user.vnpost_username || !user.vnpost_password) {
      return res.status(400).json({ error: 'Không tìm thấy thông tin tài khoản VNPost đã cấu hình.' });
    }

    const result = await loginToVnpost(user.vnpost_username, user.vnpost_password, captchaSolution, initialFields, initialCookies);
    if (!result.success) {
      return res.status(400).json({ error: result.error || 'Đăng nhập luồng thất bại.' });
    }

    const newCookieStr = Object.entries(result.cookies).map(([k, v]) => `${k}=${v}`).join('; ');

    let cookiesArray = [];
    if (user.vnpost_cookie) {
      try {
        cookiesArray = JSON.parse(user.vnpost_cookie);
        if (!Array.isArray(cookiesArray)) {
          cookiesArray = [user.vnpost_cookie];
        }
      } catch (e) {
        cookiesArray = [user.vnpost_cookie];
      }
    }

    while (cookiesArray.length <= idx) {
      cookiesArray.push('');
    }
    cookiesArray[idx] = newCookieStr;

    await run(
      `UPDATE users SET vnpost_cookie = ? WHERE username = ?`,
      [JSON.stringify(cookiesArray), username]
    );

    res.json({
      success: true,
      message: `Đã khôi phục và kết nối lại Luồng ${idx + 1} thành công!`
    });
  } catch (err) {
    console.error('[Refresh Session Error]:', err);
    res.status(500).json({ error: 'Lỗi hệ thống khi đăng nhập lại luồng.' });
  }
});

// --- SETTINGS & CONFIGURATION ENDPOINTS ---

// Save user settings (Cookie, VNPost accounts)
app.post('/api/user/settings', authenticateToken, async (req, res) => {
  const { vnpost_cookie, vnpost_username, vnpost_password, password } = req.body;
  const username = req.user.username;

  try {
    if (password) {
      const salt = await bcrypt.genSalt(10);
      const hash = await bcrypt.hash(password, salt);
      await run(`UPDATE users SET password_hash = ? WHERE username = ?`, [hash, username]);
    }

    if (vnpost_cookie !== undefined) {
      await run(`UPDATE users SET vnpost_cookie = ? WHERE username = ?`, [JSON.stringify([vnpost_cookie.trim()]), username]);
    }

    if (vnpost_username !== undefined && vnpost_password !== undefined) {
      await run(
        `UPDATE users SET vnpost_username = ?, vnpost_password = ? WHERE username = ?`,
        [vnpost_username.trim(), vnpost_password, username]
      );
    }

    res.json({ message: 'Cập nhật cấu hình thành công.' });
  } catch (err) {
    res.status(500).json({ error: 'Lỗi hệ thống khi cập nhật cài đặt.' });
  }
});

// Get VNPost login state (retrieve captcha image)
app.get('/api/vnpost/login-state', authenticateToken, async (req, res) => {
  try {
    const state = await getLoginState();
    // Cache the fields and cookies in session/temp storage is not strictly needed
    // since we return them to the client to send back upon login.
    res.json({
      fields: state.fields,
      cookies: state.cookies,
      captchaImage: state.captchaImage
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Không thể kết nối tới VNPost để lấy thông tin Captcha.' });
  }
});

// Login and save VNPost cookie to user account
app.post('/api/vnpost/login', authenticateToken, async (req, res) => {
  const { username, password, captchaSolution, initialFields, initialCookies } = req.body;
  const reqUsername = req.user.username;

  if (!username || !password || !initialFields || !initialCookies) {
    return res.status(400).json({ error: 'Thiếu dữ liệu đăng nhập VNPost.' });
  }

  try {
    const result = await loginToVnpost(username, password, captchaSolution, initialFields, initialCookies);
    if (result.success) {
      // Format cookies as string
      const cookiesStr = Object.entries(result.cookies).map(([k, v]) => `${k}=${v}`).join('; ');
      
      // Parse existing cookies to preserve them, only updating the primary (first) cookie
      let cookiesArray = [];
      const user = await get(`SELECT vnpost_cookie, concurrency_limit FROM users WHERE username = ?`, [reqUsername]);
      if (user && user.vnpost_cookie) {
        try {
          cookiesArray = JSON.parse(user.vnpost_cookie);
          if (!Array.isArray(cookiesArray)) {
            cookiesArray = [user.vnpost_cookie];
          }
        } catch (e) {
          cookiesArray = [user.vnpost_cookie];
        }
      }

      if (cookiesArray.length > 0) {
        cookiesArray[0] = cookiesStr;
      } else {
        cookiesArray.push(cookiesStr);
      }

      const newConcurrencyLimit = (user && user.concurrency_limit) || cookiesArray.length || 1;

      // Save cookie & credentials and update database
      await run(
        `UPDATE users SET vnpost_cookie = ?, vnpost_username = ?, vnpost_password = ?, concurrency_limit = ? WHERE username = ?`,
        [JSON.stringify(cookiesArray), username, password, newConcurrencyLimit, reqUsername]
      );
      res.json({ success: true, message: 'Đăng nhập VNPost thành công và đã lưu phiên làm việc.' });
    } else {
      res.json({ success: false, error: result.error });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Có lỗi xảy ra khi xử lý đăng nhập với VNPost.' });
  }
});

// --- EXPORT PROCESS ENDPOINT ---

// Helper chunk array
function chunkArray(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

// Process Export
app.post('/api/export', authenticateToken, async (req, res) => {
  const { codes } = req.body;
  const username = req.user.username;

  if (!codes || !Array.isArray(codes) || codes.length === 0) {
    return res.status(400).json({ error: 'Danh sách mã gửi trống.' });
  }

  // Parse and clean codes
  const seen = new Set();
  const cleanCodes = codes
    .map(c => String(c).trim().toUpperCase())
    .filter(Boolean)
    .filter(c => {
      if (seen.has(c)) return false;
      seen.add(c);
      return true;
    });

  if (cleanCodes.length === 0) {
    return res.status(400).json({ error: 'Không tìm thấy mã bưu gửi nào hợp lệ.' });
  }

  try {
    // 1. Get VNPost cookie from DB
    const user = await get(`SELECT vnpost_cookie FROM users WHERE username = ?`, [username]);
    if (!user || !user.vnpost_cookie) {
      return res.status(400).json({ error: 'Bạn chưa cấu hình Cookie VNPost hoặc phiên đã hết hạn. Hãy vào phần Cài đặt.' });
    }

    const chunks = chunkArray(cleanCodes, BATCH_SIZE);
    const excelBuffers = [];
    let successCount = 0;

    console.log(`Bắt đầu xuất ${cleanCodes.length} mã trong ${chunks.length} lô cho user: ${req.user.username}`);

    // Tải tuần tự từng lô để tránh nghẽn hàng đợi phiên (Session Lock) của máy chủ IIS VNPost
    for (let index = 0; index < chunks.length; index++) {
      const batchCodes = chunks[index];
      console.log(`[Export] Đang tải lô ${index + 1}/${chunks.length}...`);
      try {
        const buffer = await exportBatchFromVnpost(batchCodes, user.vnpost_cookie);
        excelBuffers.push(buffer);
        successCount += batchCodes.length;
        console.log(`[Export] Lô ${index + 1}/${chunks.length} tải thành công.`);
      } catch (err) {
        console.error(`[Export] Lỗi tải lô ${index + 1}/${chunks.length}:`, err.message);
        if (err.message.includes('Phiên đăng nhập VNPost hết hạn')) {
          return res.status(401).json({ error: err.message });
        }
      }
    }

    if (excelBuffers.length === 0) {
      return res.status(500).json({ error: 'Tất cả các lô xuất dữ liệu đều thất bại từ VNPost.' });
    }

    console.log(`[Export] Đang gộp ${excelBuffers.length} file Excel...`);
    // 2. Merge buffers
    const merged = await mergeExcelBuffers(excelBuffers);
    if (!merged) {
      return res.status(500).json({ error: 'Gộp dữ liệu Excel thất bại.' });
    }

    const timestamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15);
    const fileName = `DanhSachBuuGui_Gop_${timestamp}.${merged.extension}`;

    console.log(`[Export] Đang lưu lịch sử vào SQL Server...`);
    // 3. Save to export_history
    const fileBuffer = Buffer.from(merged.buffer);
    const historyResult = await run(
      `INSERT INTO export_history (user_id, total_codes, success_codes, file_name, file_data_blob, status) VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, cleanCodes.length, successCount, fileName, fileBuffer, 'success']
    );

    const historyId = historyResult.id;

    console.log(`[Export] Gửi phản hồi cho client. Đang phân tích lưu chi tiết chạy ngầm...`);
    // 4. Parse spreadsheet content and save into exported_items in background (non-blocking)
    parseExcelData(merged.buffer, merged.extension === 'xlsx')
      .then(parsedItems => {
        // Run bulk insert asynchronously
        return saveExportedItemsToDb(historyId, parsedItems);
      })
      .catch(parseErr => {
        console.error('Lỗi phân tích hoặc lưu dữ liệu bưu gửi:', parseErr);
      });

    res.json({
      success: true,
      historyId,
      fileName,
      totalCodes: cleanCodes.length,
      successCodes: successCount,
      message: `Đã xử lý xong. Xuất thành công ${successCount}/${cleanCodes.length} mã.`
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Lỗi xử lý xuất Excel.' });
  }
});

// Endpoint xuất dữ liệu theo lô đơn lẻ
app.post('/api/export-batch', authenticateToken, async (req, res) => {
  const { codes, sessionIndex } = req.body;
  const userId = req.user.id;

  if (!codes || !Array.isArray(codes) || codes.length === 0) {
    return res.status(400).json({ error: 'Không tìm thấy mã bưu gửi nào hợp lệ.' });
  }

  try {
    const user = await get(`SELECT vnpost_cookie FROM users WHERE id = ?`, [userId]);
    if (!user || !user.vnpost_cookie) {
      return res.status(400).json({ error: 'Bạn chưa cấu hình Cookie VNPost hoặc phiên đã hết hạn. Hãy vào phần Cài đặt.' });
    }

    let selectedCookie = user.vnpost_cookie;
    if (user.vnpost_cookie) {
      try {
        const cookiesArray = JSON.parse(user.vnpost_cookie);
        if (Array.isArray(cookiesArray) && cookiesArray.length > 0) {
          const idx = parseInt(sessionIndex, 10) || 0;
          selectedCookie = cookiesArray[idx % cookiesArray.length];
        }
      } catch (e) {
        // Không phải mảng JSON, sử dụng trực tiếp làm chuỗi cookie đơn
      }
    }

    const buffer = await exportBatchFromVnpost(codes, selectedCookie);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(Buffer.from(buffer));
  } catch (err) {
    console.error('[Export Batch Error]:', err.message);
    res.status(500).json({ error: err.message || 'Lỗi tải lô từ VNPost.' });
  }
});

// Endpoint gộp các lô Excel và lưu lịch sử
app.post('/api/merge-and-save', authenticateToken, async (req, res) => {
  const { buffers, totalCodes } = req.body;
  const userId = req.user.id;

  if (!buffers || !Array.isArray(buffers) || buffers.length === 0) {
    return res.status(400).json({ error: 'Không có dữ liệu lô Excel nào để gộp.' });
  }

  try {
    console.log(`[Merge] Nhận yêu cầu gộp ${buffers.length} lô cho user: ${req.user.username}`);
    const excelBuffers = buffers.map(b64 => Buffer.from(b64, 'base64'));
    const merged = await mergeExcelBuffers(excelBuffers);
    if (!merged) {
      return res.status(500).json({ error: 'Gộp dữ liệu Excel thất bại.' });
    }

    const timestamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15);
    const fileName = `DanhSachBuuGui_Gop_${timestamp}.${merged.extension}`;

    // Lưu vào lịch sử
    const fileBuffer = Buffer.from(merged.buffer);
    const historyResult = await run(
      `INSERT INTO export_history (user_id, total_codes, success_codes, file_name, file_data_blob, status) VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, totalCodes, totalCodes, fileName, fileBuffer, 'success']
    );

    const historyId = historyResult.id;

    // Lưu chi tiết bưu gửi chạy ngầm dưới nền
    parseExcelData(merged.buffer, merged.extension === 'xlsx')
      .then(parsedItems => {
        return saveExportedItemsToDb(historyId, parsedItems);
      })
      .catch(parseErr => {
        console.error('[Merge] Lỗi phân tích lưu chi tiết chạy ngầm:', parseErr);
      });

    res.json({
      success: true,
      historyId,
      fileName
    });
  } catch (err) {
    console.error('[Merge Error]:', err.message);
    res.status(500).json({ error: err.message || 'Lỗi gộp dữ liệu Excel.' });
  }
});

// --- HISTORY & QUERY ENDPOINTS ---

// Get export history
app.get('/api/history', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const isAdmin = req.user.role === 'admin';

  try {
    let list;
    if (isAdmin) {
      list = await all(`
        SELECT h.id, h.export_time, h.total_codes, h.success_codes, h.file_name, h.status, u.username 
        FROM export_history h
        JOIN users u ON h.user_id = u.id
        ORDER BY h.export_time DESC
      `);
    } else {
      list = await all(`
        SELECT id, export_time, total_codes, success_codes, file_name, status 
        FROM export_history 
        WHERE user_id = ?
        ORDER BY export_time DESC
      `, [userId]);
    }
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: 'Lỗi tải lịch sử.' });
  }
});

// Download past Excel
app.get('/api/history/:id/download', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const isAdmin = req.user.role === 'admin';

  try {
    const history = await get(`SELECT * FROM export_history WHERE id = ?`, [id]);
    if (!history) return res.status(404).json({ error: 'Không tìm thấy bản ghi lịch sử.' });

    // Validate ownership
    if (!isAdmin && history.user_id !== userId) {
      return res.status(403).json({ error: 'Từ chối truy cập.' });
    }

    if (!history.file_data_blob) {
      return res.status(404).json({ error: 'Không tìm thấy tệp đính kèm trong database.' });
    }

    const fileBuffer = history.file_data_blob;
    const isZip = looksLikeZip(fileBuffer);
    const mime = isZip ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "application/vnd.ms-excel;charset=utf-8";

    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', `attachment; filename="${history.file_name}"`);
    res.send(fileBuffer);
  } catch (err) {
    res.status(500).json({ error: 'Lỗi tải tệp.' });
  }
});

// Search detail items in history
app.get('/api/history/search', authenticateToken, async (req, res) => {
  const { q } = req.query;
  const userId = req.user.id;
  const isAdmin = req.user.role === 'admin';

  if (!q) return res.json([]);

  try {
    let items;
    if (isAdmin) {
      items = await all(`
        SELECT i.tracking_code, i.data_json, h.export_time, h.file_name, u.username
        FROM exported_items i
        JOIN export_history h ON i.history_id = h.id
        JOIN users u ON h.user_id = u.id
        WHERE i.tracking_code LIKE ?
        ORDER BY h.export_time DESC
        LIMIT 100
      `, [`%${q.trim().toUpperCase()}%`]);
    } else {
      items = await all(`
        SELECT i.tracking_code, i.data_json, h.export_time, h.file_name
        FROM exported_items i
        JOIN export_history h ON i.history_id = h.id
        WHERE h.user_id = ? AND i.tracking_code LIKE ?
        ORDER BY h.export_time DESC
        LIMIT 100
      `, [userId, `%${q.trim().toUpperCase()}%`]);
    }

    // Map JSON strings back to objects
    const result = items.map(item => ({
      ...item,
      data: JSON.parse(item.data_json)
    }));

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Lỗi tìm kiếm bưu gửi.' });
  }
});

// Detail items for a single export history
app.get('/api/history/:id/items', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const isAdmin = req.user.role === 'admin';

  try {
    const history = await get(`SELECT user_id FROM export_history WHERE id = ?`, [id]);
    if (!history) return res.status(404).json({ error: 'Không tìm thấy bản ghi lịch sử.' });

    if (!isAdmin && history.user_id !== userId) {
      return res.status(403).json({ error: 'Từ chối truy cập.' });
    }

    const items = await all(`SELECT tracking_code, data_json FROM exported_items WHERE history_id = ?`, [id]);
    const result = items.map(item => ({
      trackingCode: item.tracking_code,
      data: JSON.parse(item.data_json)
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Lỗi tải chi tiết.' });
  }
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve static assets from React build folder in production
const frontendDistPath = path.join(__dirname, '../frontend/dist');
app.use(express.static(frontendDistPath));

// Fallback all non-API routes to index.html for React SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendDistPath, 'index.html'));
});

// --- KEEP-ALIVE SESSION WORKER ---
async function keepSessionsAlive() {
  try {
    const users = await all(`SELECT id, username, vnpost_cookie FROM users WHERE vnpost_cookie IS NOT NULL`);
    if (users.length === 0) return;

    console.log(`[Keep-Alive] Đang kiểm tra và duy trì phiên VNPost cho ${users.length} tài khoản...`);
    for (const user of users) {
      let cookiesArray = [];
      try {
        cookiesArray = JSON.parse(user.vnpost_cookie);
        if (!Array.isArray(cookiesArray)) {
          cookiesArray = [user.vnpost_cookie];
        }
      } catch (e) {
        cookiesArray = [user.vnpost_cookie];
      }

      for (let i = 0; i < cookiesArray.length; i++) {
        const cookieStr = cookiesArray[i];
        if (!cookieStr) continue;

        const cookieMap = updateCookies(cookieStr, {});
        const cookiesStrFormatted = cookieMapToString(cookieMap);

        try {
          const res = await fetch('https://bccp.vnpost.vn/BCCP.aspx?act=TraceListv2', {
            headers: {
              'Cookie': cookiesStrFormatted,
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            }
          });
          const html = await res.text();
          if (html.includes('btnLogin') || html.includes('txtUser') || html.includes('txtUsername')) {
            console.log(`[Keep-Alive] ⚠️ Phiên ${i + 1}/${cookiesArray.length} của user ${user.username} đã hết hiệu lực từ phía VNPost.`);
          } else {
            console.log(`[Keep-Alive] ✅ Phiên ${i + 1}/${cookiesArray.length} của user ${user.username} vẫn hoạt động bình thường.`);
          }
        } catch (err) {
          console.error(`[Keep-Alive] Lỗi ping phiên ${i + 1}/${cookiesArray.length} cho user ${user.username}:`, err.message);
        }
      }
    }
  } catch (err) {
    console.error('[Keep-Alive] Lỗi tiến trình Keep-Alive:', err);
  }
}

// Chạy Keep-Alive định kỳ mỗi 5 phút (300,000 ms) để đảm bảo không bị timeout
setInterval(keepSessionsAlive, 5 * 60 * 1000);

// Hỗ trợ lưu chi tiết bưu gửi hàng loạt theo lô (Bulk Insert) lên SQL Server để tránh nghẽn mạng
async function saveExportedItemsToDb(historyId, parsedItems) {
  const BATCH_INSERT_SIZE = 400;
  for (let i = 0; i < parsedItems.length; i += BATCH_INSERT_SIZE) {
    const chunk = parsedItems.slice(i, i + BATCH_INSERT_SIZE);
    
    const valuePlaceholders = [];
    const params = [];
    
    for (const item of chunk) {
      valuePlaceholders.push('(?, ?, ?)');
      params.push(historyId, item.trackingCode, JSON.stringify(item.data));
    }
    
    const sql = `INSERT INTO exported_items (history_id, tracking_code, data_json) VALUES ${valuePlaceholders.join(', ')}`;
    try {
      await run(sql, params);
    } catch (err) {
      console.error('[Database] Lỗi chèn dữ liệu bưu gửi chi tiết:', err);
    }
  }
  console.log(`[Database] Đã lưu thành công ${parsedItems.length} bưu gửi chi tiết.`);
}

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
