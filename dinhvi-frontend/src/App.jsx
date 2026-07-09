import React, { useState, useEffect, useRef } from 'react';

const API_BASE = window.location.origin.includes('5000') 
  ? window.location.origin 
  : 'http://localhost:5000';

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [user, setUser] = useState(null);
  const [currentTab, setCurrentTab] = useState('dashboard');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  // Auth Form State
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [captchaState, setCaptchaState] = useState(null);
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [loadingCaptcha, setLoadingCaptcha] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);

  // Fetch profile on token change
  useEffect(() => {
    if (token) {
      localStorage.setItem('token', token);
      fetchUserProfile();
    } else {
      localStorage.removeItem('token');
      setUser(null);
      loadLoginCaptcha();
    }
  }, [token]);

  const loadLoginCaptcha = async () => {
    setLoadingCaptcha(true);
    setCaptchaAnswer('');
    try {
      const res = await fetch(`${API_BASE}/api/auth/login-captcha`);
      const data = await res.json();
      if (res.ok) {
        setCaptchaState(data);
      } else {
        setError(data.error || 'Không thể tải Captcha từ máy chủ VNPost.');
      }
    } catch (err) {
      setError('Lỗi kết nối máy chủ khi lấy Captcha.');
    } finally {
      setLoadingCaptcha(false);
    }
  };

  const fetchUserProfile = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/me`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data);
      } else {
        // Token expired
        setToken('');
      }
    } catch (err) {
      console.error(err);
      setToken('');
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!usernameInput || !passwordInput || !captchaState) return;
    setLoginLoading(true);
    setError('');

    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          username: usernameInput, 
          password: passwordInput,
          captchaSolution: captchaAnswer,
          initialFields: captchaState.fields,
          initialCookies: captchaState.cookies
        })
      });
      const data = await res.json();
      if (res.ok) {
        setToken(data.token);
        setUser(data.user);
        setUsernameInput('');
        setPasswordInput('');
        setCaptchaAnswer('');
        setCaptchaState(null);
      } else {
        setError(data.error || 'Đăng nhập thất bại.');
        loadLoginCaptcha();
      }
    } catch (err) {
      setError('Không thể kết nối đến máy chủ.');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = () => {
    setToken('');
    setCurrentTab('dashboard');
  };

  if (!token || !user) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-header">
            <div className="brand-logo" style={{margin: '0 auto 16px'}}>EX</div>
            <h1>EXCEL EXPORTER</h1>
            <p>Đăng nhập bằng tài khoản VNPost BCCP</p>
          </div>
          {error && <div className="alert alert-danger">{error}</div>}
          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label className="form-label">Tài khoản VNPost</label>
              <input 
                type="text" 
                className="input-field" 
                placeholder="Tên đăng nhập VNPost" 
                value={usernameInput}
                onChange={e => setUsernameInput(e.target.value)}
                required
                disabled={loginLoading}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Mật khẩu VNPost</label>
              <input 
                type="password" 
                className="input-field" 
                placeholder="Mật khẩu VNPost" 
                value={passwordInput}
                onChange={e => setPasswordInput(e.target.value)}
                required
                disabled={loginLoading}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Mã xác nhận (Captcha)</label>
              <div className="captcha-container">
                <div className="captcha-img">
                  {captchaState?.captchaImage ? (
                    <img src={captchaState.captchaImage} alt="Captcha" />
                  ) : (
                    <span style={{color: '#ef4444', fontSize: '12px'}}>
                      {loadingCaptcha ? 'Đang tải...' : 'Không có ảnh'}
                    </span>
                  )}
                </div>
                <button type="button" className="refresh-captcha" onClick={loadLoginCaptcha} title="Tải lại Captcha" disabled={loadingCaptcha || loginLoading}>
                  🔄
                </button>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Giải captcha..."
                  value={captchaAnswer}
                  onChange={e => setCaptchaAnswer(e.target.value)}
                  style={{maxWidth: '140px'}}
                  required
                  disabled={loginLoading}
                />
              </div>
            </div>

            <button type="submit" className="btn btn-primary" style={{width: '100%', marginTop: '8px'}} disabled={loginLoading || !captchaState}>
              {loginLoading ? 'Đang xác thực VNPost...' : 'Đăng nhập'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* Mobile Top Bar */}
      <div className="mobile-header">
        <button className="mobile-menu-btn" onClick={() => setIsMobileMenuOpen(true)}>
          ☰
        </button>
        <div className="mobile-brand">
          <div className="brand-logo" style={{ width: '28px', height: '28px', fontSize: '14px' }}>EX</div>
          <span className="brand-name" style={{ fontSize: '16px' }}>VNPost Export</span>
        </div>
      </div>

      {/* Sidebar Overlay */}
      {isMobileMenuOpen && (
        <div className="sidebar-overlay" onClick={() => setIsMobileMenuOpen(false)}></div>
      )}

      <div className={`sidebar ${isMobileMenuOpen ? 'open' : ''}`}>
        {/* Mobile Close Button in Sidebar */}
        <div className="sidebar-mobile-header">
          <div className="brand-section" style={{ marginBottom: 0 }}>
            <div className="brand-logo">EX</div>
            <span className="brand-name">VNPost Export</span>
          </div>
          <button className="sidebar-close-btn" onClick={() => setIsMobileMenuOpen(false)}>
            &times;
          </button>
        </div>

        <div className="brand-section desktop-only">
          <div className="brand-logo">EX</div>
          <span className="brand-name">VNPost Export</span>
        </div>

        <div className="user-profile">
          <div className="user-name" title={user.username}>{user.username}</div>
          <span className={`user-role role-${user.role}`}>
            {user.role === 'admin' ? 'Quản trị viên' : 'Nhân viên'}
          </span>
        </div>

        <ul className="nav-menu">
          <li className={`nav-item ${currentTab === 'dashboard' ? 'active' : ''}`} onClick={() => { setCurrentTab('dashboard'); setIsMobileMenuOpen(false); }}>
            <span>🚀</span> Xuất Excel
          </li>
          <li className={`nav-item ${currentTab === 'history' ? 'active' : ''}`} onClick={() => { setCurrentTab('history'); setIsMobileMenuOpen(false); }}>
            <span>📊</span> Lịch sử xuất
          </li>
          <li className={`nav-item ${currentTab === 'settings' ? 'active' : ''}`} onClick={() => { setCurrentTab('settings'); setIsMobileMenuOpen(false); }}>
            <span>⚙️</span> Cấu hình VNPost
          </li>
          {user.role === 'admin' && (
            <li className={`nav-item ${currentTab === 'users' ? 'active' : ''}`} onClick={() => { setCurrentTab('users'); setIsMobileMenuOpen(false); }}>
              <span>👥</span> Quản lý tài khoản
            </li>
          )}
          <li className="nav-item logout" onClick={() => { handleLogout(); setIsMobileMenuOpen(false); }}>
            <span>🚪</span> Đăng xuất
          </li>
        </ul>
      </div>

      <div className="main-content">
        {currentTab === 'dashboard' && <DashboardView token={token} user={user} />}
        {currentTab === 'history' && <HistoryView token={token} user={user} />}
        {currentTab === 'settings' && <SettingsView token={token} user={user} onProfileUpdate={fetchUserProfile} />}
        {currentTab === 'users' && user.role === 'admin' && (
          <UsersView token={token} currentUser={user} onProfileUpdate={fetchUserProfile} />
        )}
      </div>
    </div>
  );
}

// --- VIEW COMPONENTS ---

function DashboardView({ token, user }) {
  const [inputVal, setInputVal] = useState('');
  const [badgeText, setBadgeText] = useState('0 mã');
  const [exportLoading, setExportLoading] = useState(false);
  const [progressBarWidth, setProgressBarWidth] = useState(0);
  const [exportBatches, setExportBatches] = useState([]);
  
  // Logs state
  const [logs, setLogs] = useState([]);
  const [latestHistoryId, setLatestHistoryId] = useState(null);
  const [latestFileName, setLatestFileName] = useState('');
  const terminalEndRef = useRef(null);

  // States for multi-session management and status in DashboardView
  const [sessions, setSessions] = useState([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [activeSessionToRefresh, setActiveSessionToRefresh] = useState(null);
  const [captchaState, setCaptchaState] = useState(null);
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [loadingCaptcha, setLoadingCaptcha] = useState(false);
  const [addingSession, setAddingSession] = useState(false);
  const [sessionAlert, setSessionAlert] = useState(null);

  const fetchSessionsStatus = async () => {
    setLoadingSessions(true);
    try {
      const res = await fetch(`${API_BASE}/api/vnpost/sessions-status`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingSessions(false);
    }
  };

  useEffect(() => {
    fetchSessionsStatus();
  }, []);

  const handleStartRefresh = async (index) => {
    setActiveSessionToRefresh(index);
    setCaptchaAnswer('');
    setCaptchaState(null);
    setSessionAlert(null);
    setLoadingCaptcha(true);
    try {
      const res = await fetch(`${API_BASE}/api/vnpost/session-captcha`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setCaptchaState(data);
      } else {
        setSessionAlert({ type: 'danger', text: data.error || 'Không thể lấy captcha.' });
      }
    } catch (err) {
      setSessionAlert({ type: 'danger', text: 'Lỗi kết nối VNPost khi lấy captcha.' });
    } finally {
      setLoadingCaptcha(false);
    }
  };

  const handleSessionFormSubmit = async (e) => {
    e.preventDefault();
    if (!captchaAnswer.trim() || !captchaState || activeSessionToRefresh === null) return;
    setAddingSession(true);
    setSessionAlert(null);
    try {
      const isAddMode = activeSessionToRefresh === 'add';
      const endpoint = isAddMode 
        ? `${API_BASE}/api/vnpost/add-session` 
        : `${API_BASE}/api/vnpost/refresh-session`;
        
      const bodyPayload = isAddMode 
        ? {
            captchaSolution: captchaAnswer,
            initialFields: captchaState.fields,
            initialCookies: captchaState.cookies
          }
        : {
            sessionIndex: activeSessionToRefresh,
            captchaSolution: captchaAnswer,
            initialFields: captchaState.fields,
            initialCookies: captchaState.cookies
          };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(bodyPayload)
      });
      const data = await res.json();
      if (res.ok) {
        setSessionAlert({ 
          type: 'success', 
          text: isAddMode 
            ? `Khởi tạo thành công thêm luồng kết nối phụ mới!` 
            : `Đã khôi phục hoạt động cho Luồng ${activeSessionToRefresh + 1}!` 
        });
        setCaptchaState(null);
        setCaptchaAnswer('');
        setActiveSessionToRefresh(null);
        fetchSessionsStatus();
      } else {
        setSessionAlert({ type: 'danger', text: data.error || (isAddMode ? 'Thêm luồng thất bại.' : 'Đăng nhập luồng thất bại.') });
        handleStartRefresh(activeSessionToRefresh); // Reload captcha on fail
      }
    } catch (err) {
      setSessionAlert({ type: 'danger', text: 'Lỗi kết nối máy chủ.' });
    } finally {
      setAddingSession(false);
    }
  };

  const SAMPLE_CODES = "CE991562158VN\nEA123456789VN\nCP987654321VN";

  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  const parseCodes = (text) => {
    const seen = new Set();
    return text
      .split(/[\s,;|]+/g)
      .map((item) => item.trim().toUpperCase())
      .filter(Boolean)
      .filter((item) => {
        if (seen.has(item)) return false;
        seen.add(item);
        return true;
      });
  };

  const handleInputChange = (e) => {
    const val = e.target.value;
    setInputVal(val);
    const codes = parseCodes(val);
    setBadgeText(`${codes.length} mã`);
  };

  const loadSample = () => {
    setInputVal(SAMPLE_CODES);
    setBadgeText(`3 mã`);
  };

  const clearInput = () => {
    setInputVal('');
    setBadgeText('0 mã');
    setLogs([]);
    setProgressBarWidth(0);
    setExportBatches([]);
    setLatestHistoryId(null);
  };

  const addLog = (message, kind = '') => {
    const timeStr = new Date().toLocaleTimeString('vi-VN');
    setLogs(prev => [...prev, { time: timeStr, text: message, kind }]);
  };

  const handleExport = async () => {
    const codes = parseCodes(inputVal);
    if (codes.length === 0) {
      alert('Vui lòng nhập ít nhất 1 mã bưu gửi.');
      return;
    }

    if (!user.hasVnpostCookie) {
      alert('Bạn chưa cấu hình Cookie VNPost. Vui lòng vào trang "Cấu hình VNPost" trước.');
      return;
    }

    // Filter active session indexes
    const activeSessionIndexes = sessions.filter(s => s.active).map(s => s.index);
    if (activeSessionIndexes.length === 0) {
      alert('Không tìm thấy luồng kết nối VNPost nào hoạt động. Vui lòng bấm vào nút luồng hết hạn màu đỏ ở trên và nhập Captcha để đăng nhập lại.');
      return;
    }

    setExportLoading(true);
    setLogs([]);
    setProgressBarWidth(5);
    setLatestHistoryId(null);
    addLog(`Khởi chạy tiến trình xuất cho ${codes.length} mã bưu gửi...`);

    const expiredCount = sessions.length - activeSessionIndexes.length;
    if (expiredCount > 0) {
      addLog(`⚠️ Cảnh báo: Phát hiện ${expiredCount} luồng bị hết hạn. Chỉ chạy trên ${activeSessionIndexes.length} luồng đang hoạt động.`, 'warning');
    }

    const batchSize = 500;
    const chunks = [];
    for (let i = 0; i < codes.length; i += batchSize) {
      chunks.push(codes.slice(i, i + batchSize));
    }
    const totalBatches = chunks.length;
    addLog(`Đã chia danh sách thành ${totalBatches} lô xử lý.`);

    // Khởi tạo trạng thái các lô bưu gửi để hiển thị checklist trực quan
    const initialBatches = chunks.map((chunk, idx) => ({
      id: idx,
      name: `Lô ${idx + 1}`,
      range: `${idx * batchSize + 1} - ${Math.min((idx + 1) * batchSize, codes.length)}`,
      status: 'pending',
      errorMsg: ''
    }));
    setExportBatches(initialBatches);

    const excelBuffers = new Array(totalBatches).fill(null);
    let successCount = 0;
    let hasError = false;

    // Triển khai Worker Pool tải song song các luồng hoạt động
    const concurrencyLimit = activeSessionIndexes.length;
    let nextIndex = 0;

    const downloadBatch = async (index, workerId) => {
      const batchCodes = chunks[index];
      // Cập nhật trạng thái lô sang 'processing' (Đang tải)
      setExportBatches(prev => prev.map(b => b.id === index ? { ...b, status: 'processing' } : b));
      addLog(`Đang tải lô ${index + 1}/${totalBatches} lên hệ thống VNPost...`, 'info');

      try {
        const res = await fetch(`${API_BASE}/api/export-batch`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ codes: batchCodes, sessionIndex: activeSessionIndexes[workerId] })
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `HTTP ${res.status}`);
        }

        const arrayBuffer = await res.arrayBuffer();
        excelBuffers[index] = arrayBuffer; // Đặt đúng index để giữ nguyên thứ tự dòng của file gộp
        successCount += batchCodes.length;
        
        // Cập nhật trạng thái lô sang 'success' (Thành công)
        setExportBatches(prev => prev.map(b => b.id === index ? { ...b, status: 'success' } : b));
        addLog(`Lô ${index + 1}/${totalBatches} tải về thành công.`, 'success');
        
        // Cập nhật phần trăm tiến trình thật dựa trên số luồng đã hoàn thành
        const completedCount = excelBuffers.filter(Boolean).length;
        setProgressBarWidth(Math.round(5 + (completedCount / totalBatches) * 80));
      } catch (err) {
        // Cập nhật trạng thái lô sang 'error' (Thất bại)
        setExportBatches(prev => prev.map(b => b.id === index ? { ...b, status: 'error', errorMsg: err.message } : b));
        addLog(`Lỗi tải lô ${index + 1}/${totalBatches}: ${err.message}`, 'error');
        if (err.message.includes('Cookie') || err.message.includes('hết hạn')) {
          hasError = true;
        }
      }
    };

    const worker = async (workerId) => {
      while (nextIndex < totalBatches && !hasError) {
        const currentIndex = nextIndex++;
        await downloadBatch(currentIndex, workerId);
      }
    };

    // Khởi chạy các luồng song song
    const workers = [];
    for (let i = 0; i < Math.min(concurrencyLimit, totalBatches); i++) {
      workers.push(worker(i));
    }

    await Promise.all(workers);

    const validBuffers = excelBuffers.filter(Boolean);

    if (hasError || validBuffers.length === 0) {
      setProgressBarWidth(0);
      addLog(`Tiến trình xuất dữ liệu bị hủy bỏ do lỗi hoặc không tải được lô nào.`, 'error');
      setExportLoading(false);
      return;
    }

    addLog(`Đang gộp và mã hóa ${validBuffers.length} lô dữ liệu...`, 'info');
    setProgressBarWidth(90);

    try {
      // Helper function to convert ArrayBuffer to Base64 for transfer
      const arrayBufferToBase64 = (buffer) => {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        return window.btoa(binary);
      };

      const base64Buffers = validBuffers.map(buf => arrayBufferToBase64(buf));

      const mergeRes = await fetch(`${API_BASE}/api/merge-and-save`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          buffers: base64Buffers,
          totalCodes: codes.length
        })
      });

      const mergeData = await mergeRes.json();

      if (mergeRes.ok) {
        setProgressBarWidth(100);
        setLatestHistoryId(mergeData.historyId);
        setLatestFileName(mergeData.fileName);
        addLog(`Hoàn tất! Xuất dữ liệu thành công ${successCount}/${codes.length} bưu gửi.`, 'success');
        
        // Tự động tải xuống file Excel
        window.open(`${API_BASE}/api/history/${mergeData.historyId}/download?authorization=Bearer ${token}`);
      } else {
        setProgressBarWidth(0);
        addLog(`Lỗi gộp dữ liệu: ${mergeData.error}`, 'error');
      }
    } catch (err) {
      setProgressBarWidth(0);
      addLog(`Lỗi kết nối gộp dữ liệu: ${err.message}`, 'error');
    } finally {
      setExportLoading(false);
    }
  };

  const handleDownload = () => {
    if (!latestHistoryId) return;
    window.open(`${API_BASE}/api/history/${latestHistoryId}/download?authorization=Bearer ${token}`);
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Xuất dữ liệu Excel VNPost</h1>
        <p className="page-subtitle">Nhập danh sách mã bưu gửi và xuất file Excel gộp định vị chi tiết</p>
      </div>

      {/* Sessions / Threads bar */}
      <div className="card" style={{ marginBottom: '20px', borderLeft: '4px solid #10b981', padding: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h3 style={{ fontSize: '15px', fontWeight: 600, margin: 0, color: 'var(--text-main)' }}>
              Trạng thái luồng kết nối VNPost ({loadingSessions ? 'Đang tải...' : `Hoạt động: ${sessions.filter(s => s.active).length}/${user.concurrencyLimit || 3}`})
            </h3>
            <p style={{ fontSize: '12px', color: '#9ca3af', margin: '4px 0 0 0' }}>
              Bấm vào luồng hết hạn màu đỏ <code>Hết hạn</code> để giải Captcha đăng nhập lại luồng đó.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            {loadingSessions ? (
              <span style={{ fontSize: '13px', color: '#9ca3af' }}>Đang kiểm tra trạng thái các luồng...</span>
            ) : sessions.length === 0 ? (
              <span style={{ fontSize: '13px', color: '#ef4444' }}>Chưa cấu hình phiên kết nối. Hãy vào trang Cài đặt.</span>
            ) : (
              <>
                {sessions.map((s) => (
                  <button
                    key={s.index}
                    className={`btn ${s.active ? 'btn-success' : 'btn-danger'}`}
                    style={{
                      padding: '6px 14px',
                      fontSize: '12px',
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontWeight: 600,
                      opacity: activeSessionToRefresh !== null && activeSessionToRefresh !== s.index ? 0.5 : 1
                    }}
                    onClick={() => !s.active && handleStartRefresh(s.index)}
                    disabled={exportLoading || (activeSessionToRefresh !== null && activeSessionToRefresh !== s.index)}
                    title={s.active ? 'Luồng hoạt động tốt' : 'Bấm để giải captcha khôi phục luồng này'}
                  >
                    {s.active ? '✅' : '⚠️'} Luồng {s.index + 1} {s.active ? '(Hoạt động)' : '(Hết hạn)'}
                  </button>
                ))}
                
                {sessions.length < (user.concurrencyLimit || 3) && (
                  <button
                    className="btn btn-secondary"
                    style={{
                      padding: '6px 14px',
                      fontSize: '12px',
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      borderColor: '#3b82f6',
                      color: '#3b82f6',
                      fontWeight: 600,
                      cursor: 'pointer',
                      opacity: activeSessionToRefresh !== null && activeSessionToRefresh !== 'add' ? 0.5 : 1
                    }}
                    onClick={() => handleStartRefresh('add')}
                    disabled={exportLoading || (activeSessionToRefresh !== null && activeSessionToRefresh !== 'add')}
                    title={`Khởi tạo luồng thứ ${sessions.length + 1}`}
                  >
                    ➕ Thêm luồng mới
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Captcha popup to refresh/add thread */}
        {activeSessionToRefresh !== null && (
          <form onSubmit={handleSessionFormSubmit} style={{
            background: activeSessionToRefresh === 'add' ? 'rgba(59, 130, 246, 0.03)' : 'rgba(239, 68, 68, 0.03)',
            border: activeSessionToRefresh === 'add' ? '1px dashed #3b82f6' : '1px dashed #ef4444',
            padding: '16px',
            borderRadius: '10px',
            marginTop: '16px'
          }}>
            <h4 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '8px', color: activeSessionToRefresh === 'add' ? '#2563eb' : '#ef4444' }}>
              {activeSessionToRefresh === 'add' 
                ? `Giải Captcha khởi tạo thêm luồng mới (Luồng thứ ${sessions.length + 1})`
                : `Giải Captcha khôi phục Luồng ${activeSessionToRefresh + 1}`
              }
            </h4>
            <p style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '12px' }}>
              {activeSessionToRefresh === 'add'
                ? 'Nhập mã bảo vệ dưới đây để tạo thêm 1 luồng kết nối tải song song (Không cần tài khoản/mật khẩu).'
                : 'Nhập mã bảo vệ của VNPost dưới đây để kích hoạt lại luồng kết nối này.'
              }
            </p>
            {sessionAlert && (
              <div className={`alert alert-${sessionAlert.type}`} style={{ padding: '8px 12px', fontSize: '13px', marginBottom: '12px' }}>
                {sessionAlert.text}
              </div>
            )}
            <div className="captcha-container" style={{ maxWidth: '350px' }}>
              <div className="captcha-img" style={{ background: '#fff', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {captchaState?.captchaImage ? (
                  <img src={captchaState.captchaImage} alt="Captcha" style={{ height: '34px' }} />
                ) : (
                  <span style={{ color: '#ef4444', fontSize: '12px' }}>{loadingCaptcha ? 'Đang tải...' : 'Không có ảnh'}</span>
                )}
              </div>
              <button type="button" className="refresh-captcha" onClick={() => handleStartRefresh(activeSessionToRefresh)} title="Tải lại Captcha" disabled={loadingCaptcha || addingSession}>
                🔄
              </button>
              <input
                type="text"
                className="input-field"
                placeholder="Giải captcha..."
                value={captchaAnswer}
                onChange={e => setCaptchaAnswer(e.target.value)}
                style={{ maxWidth: '120px', height: '34px', fontSize: '12px' }}
                required
                disabled={addingSession}
              />
            </div>
            <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
              <button type="submit" className="btn btn-primary" style={{ padding: '6px 14px', fontSize: '12px' }} disabled={addingSession || !captchaState}>
                {addingSession 
                  ? (activeSessionToRefresh === 'add' ? 'Đang tạo luồng...' : 'Đang khôi phục...') 
                  : (activeSessionToRefresh === 'add' ? 'Kích hoạt thêm luồng' : 'Xác nhận khôi phục')
                }
              </button>
              <button type="button" className="btn btn-secondary" style={{ padding: '6px 14px', fontSize: '12px' }} onClick={() => setActiveSessionToRefresh(null)} disabled={addingSession}>
                Hủy bỏ
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="dashboard-grid">
        <div className="card" style={{marginBottom: 0}}>
          <div className="form-group" style={{position: 'relative'}}>
            <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '8px'}}>
              <label className="form-label">Danh sách mã bưu gửi</label>
              <span className="badge badge-count">{badgeText}</span>
            </div>
            <textarea
              className="input-field"
              placeholder="Dán danh sách mã bưu gửi vào đây (phân tách bằng dấu xuống dòng, khoảng trắng hoặc dấu phẩy)..."
              value={inputVal}
              onChange={handleInputChange}
              style={{height: '280px'}}
              disabled={exportLoading}
            />
          </div>

          <div style={{display: 'flex', gap: '12px', marginTop: '16px'}}>
            <button className="btn btn-primary" onClick={handleExport} disabled={exportLoading || inputVal.trim() === ''}>
              {exportLoading ? 'Đang xuất...' : '🚀 Bắt đầu xuất'}
            </button>
            <button className="btn btn-secondary" onClick={loadSample} disabled={exportLoading}>
              Mẫu mã
            </button>
            <button className="btn btn-secondary" onClick={clearInput} disabled={exportLoading}>
              Xóa sạch
            </button>
            
            {latestHistoryId && (
              <button className="btn btn-primary" onClick={handleDownload} style={{marginLeft: 'auto', background: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)'}}>
                📥 Tải File Excel
              </button>
            )}
          </div>
        </div>

        <div>
          <div className="card" style={{height: '100%', display: 'flex', flexDirection: 'column', marginBottom: 0}}>
            <h3 style={{fontSize: '16px', fontWeight: 600, marginBottom: '16px'}}>Trạng thái xuất</h3>
            
            <div className="progress-container">
              <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px'}}>
                <span style={{color: exportLoading ? '#3b82f6' : '#9ca3af'}}>{exportLoading ? 'Đang chạy' : 'Sẵn sàng'}</span>
                <span>{progressBarWidth}%</span>
              </div>
              <div className="progress-track">
                <div className="progress-bar" style={{width: `${progressBarWidth}%`}}></div>
              </div>
            </div>

            {/* Checklist các lô bưu gửi trực quan */}
            {exportBatches.length > 0 && (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))',
                gap: '6px',
                marginTop: '10px',
                marginBottom: '15px',
                padding: '10px',
                background: 'rgba(15, 23, 42, 0.02)',
                border: '1px solid var(--border-glass)',
                borderRadius: '12px',
                maxHeight: '160px',
                overflowY: 'auto'
              }}>
                {exportBatches.map(b => {
                  let badgeBg = '#f1f5f9';
                  let badgeColor = '#64748b';
                  let statusIcon = '⬜'; // Pending
                  
                  if (b.status === 'processing') {
                    badgeBg = '#e0f2fe';
                    badgeColor = '#0284c7';
                    statusIcon = '🔄'; // Processing
                  } else if (b.status === 'success') {
                    badgeBg = '#d1fae5';
                    badgeColor = '#059669';
                    statusIcon = '✅'; // Success
                  } else if (b.status === 'error') {
                    badgeBg = '#fee2e2';
                    badgeColor = '#dc2626';
                    statusIcon = '❌'; // Failed
                  }

                  let titleText = `${b.name} (${b.range})`;
                  if (b.errorMsg) {
                    titleText += ` - Lỗi: ${b.errorMsg}`;
                  }
                  
                  return (
                    <div 
                      key={b.id} 
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '4px',
                        padding: '4px 6px',
                        borderRadius: '6px',
                        background: badgeBg,
                        color: badgeColor,
                        fontSize: '11px',
                        fontWeight: '600',
                        border: `1px solid ${b.status === 'pending' ? 'rgba(15, 23, 42, 0.05)' : 'transparent'}`,
                        transition: 'all 0.2s ease',
                        boxShadow: b.status === 'processing' ? '0 0 6px rgba(2, 132, 199, 0.15)' : 'none',
                        cursor: 'help'
                      }}
                      title={titleText}
                    >
                      <span style={{fontSize: '12px'}}>{statusIcon}</span>
                      <span style={{overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>{b.name}</span>
                    </div>
                  );
                })}
              </div>
            )}

            <label className="form-label" style={{marginTop: '10px'}}>Log xử lý thời gian thực</label>
            <div className="terminal">
              {logs.length === 0 ? (
                <div style={{color: '#4b5563', fontStyle: 'italic'}}>Chưa có hoạt động nào được ghi nhận. Nhập mã bưu gửi và bấm nút bắt đầu.</div>
              ) : (
                <ul>
                  {logs.map((log, idx) => (
                    <li key={idx} className={log.kind}>
                      {log.time} · {log.text}
                    </li>
                  ))}
                  <div ref={terminalEndRef} />
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function HistoryView({ token, user }) {
  const [historyList, setHistoryList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);

  // Detail Modal State
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedHistory, setSelectedHistory] = useState(null);
  const [detailItems, setDetailItems] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/history`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setHistoryList(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    setSearchLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/history/search?q=${encodeURIComponent(searchQuery)}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSearchLoading(false);
    }
  };

  const openDetails = async (historyItem) => {
    setSelectedHistory(historyItem);
    setDetailModalOpen(true);
    setDetailLoading(true);
    setDetailItems([]);

    try {
      const res = await fetch(`${API_BASE}/api/history/${historyItem.id}/items`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setDetailItems(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setDetailLoading(false);
    }
  };

  const downloadFile = (id) => {
    window.open(`${API_BASE}/api/history/${id}/download?authorization=Bearer ${token}`);
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Lịch sử xuất Excel</h1>
        <p className="page-subtitle">Xem lại lịch sử xuất file, tra cứu chi tiết thông tin bưu gửi đã lưu</p>
      </div>

      {/* Global search */}
      <div className="card">
        <h3 style={{fontSize: '16px', fontWeight: 600, marginBottom: '16px'}}>Tra cứu bưu gửi nhanh</h3>
        <form onSubmit={handleSearch} style={{display: 'flex', gap: '12px'}}>
          <input
            type="text"
            className="input-field"
            placeholder="Nhập mã bưu gửi để tìm kiếm nhanh trong toàn bộ lịch sử (Ví dụ: CE991562158VN)..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          <button type="submit" className="btn btn-primary" disabled={searchLoading}>
            {searchLoading ? 'Đang tìm...' : 'Tìm kiếm'}
          </button>
        </form>

        {searchResults.length > 0 && (
          <div className="search-results-list">
            <h4 style={{fontSize: '14px', fontWeight: 600, marginTop: '10px'}}>Kết quả tìm kiếm ({searchResults.length}):</h4>
            {searchResults.map((item, idx) => (
              <div key={idx} className="search-item-card">
                <div className="search-item-header">
                  <span className="search-item-code">{item.tracking_code}</span>
                  <span className="search-item-meta">
                    Xuất ngày: {new Date(item.export_time).toLocaleString('vi-VN')} {item.username && `(bởi ${item.username})`}
                  </span>
                </div>
                <div className="search-item-details">
                  {Object.entries(item.data).map(([key, val]) => (
                    <div key={key}>
                      <span className="search-item-prop">{key}: </span>
                      <span className="search-item-val">{val || '-'}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        {searchQuery && searchResults.length === 0 && !searchLoading && (
          <div style={{color: '#9ca3af', fontSize: '14px', marginTop: '15px', fontStyle: 'italic'}}>Không tìm thấy bưu gửi nào khớp với mã trên.</div>
        )}
      </div>

      {/* History table */}
      <div className="card">
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px'}}>
          <h3 style={{fontSize: '16px', fontWeight: 600}}>Danh sách các lần xuất</h3>
          <button className="btn btn-secondary" onClick={fetchHistory} disabled={loading}>
            🔄 Làm mới
          </button>
        </div>

        {loading ? (
          <div style={{textAlign: 'center', padding: '40px 0', color: '#9ca3af'}}>Đang tải dữ liệu...</div>
        ) : historyList.length === 0 ? (
          <div style={{textAlign: 'center', padding: '40px 0', color: '#9ca3af', fontStyle: 'italic'}}>Chưa có lịch sử xuất file nào.</div>
        ) : (
          <div className="table-responsive">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Thời gian</th>
                  {user.role === 'admin' && <th>Người xuất</th>}
                  <th>Mã gửi (Thành công)</th>
                  <th>Tên File</th>
                  <th>Trạng thái</th>
                  <th style={{textAlign: 'right'}}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {historyList.map((item) => (
                  <tr key={item.id}>
                    <td>{new Date(item.export_time).toLocaleString('vi-VN')}</td>
                    {user.role === 'admin' && <td style={{fontWeight: 500}}>{item.username}</td>}
                    <td>{item.total_codes} ({item.success_codes})</td>
                    <td style={{fontFamily: 'monospace', color: '#06b6d4'}}>{item.file_name}</td>
                    <td>
                      <span className={`badge`} style={{
                        background: item.status === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                        color: item.status === 'success' ? '#10b981' : '#ef4444',
                        border: item.status === 'success' ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid rgba(239, 68, 68, 0.2)'
                      }}>
                        {item.status === 'success' ? 'Thành công' : 'Thất bại'}
                      </span>
                    </td>
                    <td style={{textAlign: 'right'}}>
                      <div style={{display: 'inline-flex', gap: '8px'}}>
                        <button className="btn btn-secondary" style={{padding: '6px 12px', fontSize: '12px'}} onClick={() => openDetails(item)}>
                          🔍 Xem chi tiết
                        </button>
                        <button className="btn btn-primary" style={{padding: '6px 12px', fontSize: '12px'}} onClick={() => downloadFile(item.id)}>
                          📥 Tải về
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {detailModalOpen && selectedHistory && (
        <div className="modal-overlay" onClick={() => setDetailModalOpen(false)}>
          <div className="modal-container" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3 style={{fontSize: '18px', fontWeight: 700}}>Chi tiết lượt xuất - {selectedHistory.file_name}</h3>
                <p style={{fontSize: '13px', color: '#9ca3af', marginTop: '4px'}}>
                  Thời gian: {new Date(selectedHistory.export_time).toLocaleString('vi-VN')} · Tổng số: {selectedHistory.total_codes} mã
                </p>
              </div>
              <button className="modal-close" onClick={() => setDetailModalOpen(false)}>&times;</button>
            </div>
            
            <div className="modal-body">
              {detailLoading ? (
                <div style={{textAlign: 'center', padding: '40px 0', color: '#9ca3af'}}>Đang phân tích dữ liệu...</div>
              ) : detailItems.length === 0 ? (
                <div style={{textAlign: 'center', padding: '40px 0', color: '#9ca3af', fontStyle: 'italic'}}>Không có dữ liệu chi tiết bưu gửi.</div>
              ) : (
                <div className="table-responsive">
                  <table className="custom-table" style={{fontSize: '13px'}}>
                    <thead>
                      <tr>
                        <th>STT</th>
                        <th>Mã bưu gửi</th>
                        {/* Dynamic headers from first item */}
                        {Object.keys(detailItems[0]?.data || {}).filter(k => k.toLowerCase() !== 'stt' && k.toLowerCase() !== 'số hiệu' && k.toLowerCase() !== 'mã bưu gửi').slice(0, 5).map((key) => (
                          <th key={key}>{key}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {detailItems.map((item, idx) => (
                        <tr key={idx}>
                          <td>{idx + 1}</td>
                          <td style={{fontWeight: 700, color: '#06b6d4'}}>{item.trackingCode}</td>
                          {/* Dynamic values */}
                          {Object.entries(item.data).filter(([k]) => k.toLowerCase() !== 'stt' && k.toLowerCase() !== 'số hiệu' && k.toLowerCase() !== 'mã bưu gửi').slice(0, 5).map(([key, val], vidx) => (
                            <td key={vidx}>{val}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SettingsView({ token, user, onProfileUpdate }) {
  const [cookieInput, setCookieInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [alertInfo, setAlertInfo] = useState(null);

  // States for multi-session management
  const [sessionsData, setSessionsData] = useState({ count: 1, concurrencyLimit: 1 });
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [captchaState, setCaptchaState] = useState(null);
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [loadingCaptcha, setLoadingCaptcha] = useState(false);
  const [addingSession, setAddingSession] = useState(false);
  const [sessionAlert, setSessionAlert] = useState(null);

  const fetchSessions = async () => {
    setLoadingSessions(true);
    try {
      const res = await fetch(`${API_BASE}/api/vnpost/sessions`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setSessionsData(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingSessions(false);
    }
  };

  const loadCaptcha = async () => {
    setLoadingCaptcha(true);
    setCaptchaAnswer('');
    setCaptchaState(null);
    try {
      const res = await fetch(`${API_BASE}/api/vnpost/session-captcha`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setCaptchaState(data);
      } else {
        setSessionAlert({ type: 'danger', text: data.error || 'Không thể lấy captcha thêm luồng.' });
      }
    } catch (err) {
      setSessionAlert({ type: 'danger', text: 'Lỗi kết nối máy chủ VNPost khi lấy captcha.' });
    } finally {
      setLoadingCaptcha(false);
    }
  };

  const handleAddSession = async (e) => {
    e.preventDefault();
    if (!captchaAnswer.trim() || !captchaState) return;
    setAddingSession(true);
    setSessionAlert(null);
    try {
      const res = await fetch(`${API_BASE}/api/vnpost/add-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          captchaSolution: captchaAnswer,
          initialFields: captchaState.fields,
          initialCookies: captchaState.cookies
        })
      });
      const data = await res.json();
      if (res.ok) {
        setSessionAlert({ type: 'success', text: data.message });
        setCaptchaState(null);
        setCaptchaAnswer('');
        fetchSessions();
        onProfileUpdate();
      } else {
        setSessionAlert({ type: 'danger', text: data.error || 'Thêm phiên thất bại.' });
        loadCaptcha();
      }
    } catch (err) {
      setSessionAlert({ type: 'danger', text: 'Lỗi kết nối khi gửi yêu cầu thêm phiên.' });
    } finally {
      setAddingSession(false);
    }
  };

  const handleResetSessions = async () => {
    if (!window.confirm('Bạn có chắc muốn xóa tất cả các luồng phụ và đặt lại về 1 luồng duy nhất không?')) return;
    setLoadingSessions(true);
    setSessionAlert(null);
    try {
      const res = await fetch(`${API_BASE}/api/vnpost/reset-sessions`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setSessionAlert({ type: 'success', text: data.message });
        fetchSessions();
        onProfileUpdate();
      } else {
        setSessionAlert({ type: 'danger', text: data.error || 'Đặt lại thất bại.' });
      }
    } catch (err) {
      setSessionAlert({ type: 'danger', text: 'Lỗi kết nối máy chủ.' });
    } finally {
      setLoadingSessions(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  const saveCookie = async () => {
    if (!cookieInput.trim()) return;
    setLoading(true);
    setAlertInfo(null);

    try {
      const res = await fetch(`${API_BASE}/api/user/settings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ vnpost_cookie: cookieInput })
      });
      const data = await res.json();
      if (res.ok) {
        setAlertInfo({ type: 'success', text: 'Cấu hình Session Cookie thủ công thành công.' });
        setCookieInput('');
        fetchSessions();
        onProfileUpdate();
      } else {
        setAlertInfo({ type: 'danger', text: data.error });
      }
    } catch (err) {
      setAlertInfo({ type: 'danger', text: 'Không thể kết nối đến máy chủ.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{maxWidth: '800px'}}>
      <div className="page-header">
        <h1 className="page-title">Cấu hình hệ thống</h1>
        <p className="page-subtitle">Quản lý kết nối VNPost BCCP và tài khoản của bạn</p>
      </div>

      {alertInfo && (
        <div className={`alert alert-${alertInfo.type}`}>
          {alertInfo.text}
        </div>
      )}

      {/* Quản lý luồng tải song song (Sessions management) */}
      <div className="card" style={{borderLeft: '4px solid #3b82f6', marginBottom: '25px'}}>
        <h3 style={{fontSize: '16px', fontWeight: 600, marginBottom: '6px'}}>Cơ chế tải song song đa luồng</h3>
        <p style={{fontSize: '13px', color: '#9ca3af', marginBottom: '15px'}}>
          Để tránh việc các lô dữ liệu 500 mã bưu gửi bị xếp hàng chậm ở server VNPost, bạn có thể giải thêm Captcha để kết nối song song nhiều phiên làm việc độc lập.
        </p>

        {sessionAlert && (
          <div className={`alert alert-${sessionAlert.type}`} style={{padding: '8px 12px', fontSize: '13px', marginBottom: '15px'}}>
            {sessionAlert.text}
          </div>
        )}

        <div style={{
          background: 'rgba(15, 23, 42, 0.02)',
          border: '1px solid var(--border-glass)',
          padding: '16px',
          borderRadius: '10px',
          marginBottom: '15px'
        }}>
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
            <div>
              <div style={{fontSize: '15px', fontWeight: 700}}>
                Số phiên kết nối hoạt động: <span style={{color: '#3b82f6', fontSize: '18px'}}>{sessionsData.count}</span> / 5 luồng
              </div>
              <p style={{fontSize: '12px', color: '#6b7280', marginTop: '4px', marginBottom: 0}}>
                {sessionsData.count === 1 
                  ? 'Hiện tại hệ thống chỉ chạy 1 luồng (tuyến tính). Tải dữ liệu lớn sẽ lâu hơn.' 
                  : `Hệ thống đang chia đều các lô tải cho ${sessionsData.count} phiên kết nối song song độc lập. Tốc độ nhanh gấp ${sessionsData.count} lần!`
                }
              </p>
            </div>
            {sessionsData.count > 1 && (
              <button 
                className="btn btn-secondary" 
                style={{borderColor: '#ef4444', color: '#ef4444', padding: '6px 12px', fontSize: '12px'}} 
                onClick={handleResetSessions}
                disabled={loadingSessions || addingSession}
              >
                Đặt lại về 1 luồng
              </button>
            )}
          </div>
        </div>

        {captchaState ? (
          <form onSubmit={handleAddSession} style={{
            background: 'rgba(59, 130, 246, 0.03)',
            border: '1px dashed #3b82f6',
            padding: '16px',
            borderRadius: '10px',
            marginTop: '15px'
          }}>
            <h4 style={{fontSize: '14px', fontWeight: 700, marginBottom: '12px', color: '#2563eb'}}>
              Khởi tạo luồng tiếp theo (Phiên thứ {sessionsData.count + 1})
            </h4>
            <p style={{fontSize: '12px', color: '#64748b', marginBottom: '12px'}}>
              Giải mã xác nhận dưới đây để kết nối thêm 1 luồng tải độc lập (Không cần nhập tài khoản/mật khẩu).
            </p>
            <div className="form-group" style={{marginBottom: 0}}>
              <div className="captcha-container" style={{maxWidth: '350px'}}>
                <div className="captcha-img" style={{background: '#fff', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                  {captchaState.captchaImage ? (
                    <img src={captchaState.captchaImage} alt="Captcha" style={{height: '34px'}} />
                  ) : (
                    <span style={{color: '#ef4444', fontSize: '12px'}}>Không có ảnh</span>
                  )}
                </div>
                <button type="button" className="refresh-captcha" onClick={loadCaptcha} title="Tải lại Captcha" disabled={loadingCaptcha || addingSession}>
                  🔄
                </button>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Giải captcha..."
                  value={captchaAnswer}
                  onChange={e => setCaptchaAnswer(e.target.value)}
                  style={{maxWidth: '120px'}}
                  required
                  disabled={addingSession}
                />
              </div>
            </div>
            <div style={{marginTop: '12px', display: 'flex', gap: '10px'}}>
              <button type="submit" className="btn btn-primary" style={{padding: '6px 14px', fontSize: '13px'}} disabled={addingSession}>
                {addingSession ? 'Đang kết nối...' : 'Xác nhận thêm luồng'}
              </button>
              <button type="button" className="btn btn-secondary" style={{padding: '6px 14px', fontSize: '13px'}} onClick={() => setCaptchaState(null)} disabled={addingSession}>
                Hủy bỏ
              </button>
            </div>
          </form>
        ) : (
          sessionsData.count < 5 && (
            <button 
              className="btn btn-primary" 
              style={{padding: '8px 16px', fontSize: '13px'}} 
              onClick={loadCaptcha}
              disabled={loadingSessions}
            >
              ➕ Khởi tạo thêm luồng (Tăng tốc độ)
            </button>
          )
        )}
      </div>

      {/* VNPost Cookie configuration */}
      <div className="card">
        <h3 style={{fontSize: '16px', fontWeight: 600, marginBottom: '8px'}}>Ghi đè Session Cookie VNPost (Dự phòng)</h3>
        <p style={{fontSize: '13px', color: '#9ca3af', marginBottom: '20px'}}>
          Mặc định, hệ thống đã tự động lưu trữ cookie khi bạn đăng nhập tài khoản VNPost. Trong trường hợp phiên đăng nhập hết hạn hoặc bạn muốn cấu hình cookie đại lý khác, hãy dán cookie <strong>ASP.NET_SessionId</strong> vào đây.
        </p>
        
        <div className="form-group">
          <label className="form-label">Cookie Trạng thái (Ví dụ: ASP.NET_SessionId=xxxxx)</label>
          <textarea
            className="input-field"
            placeholder="Dán toàn bộ Cookie hoặc chỉ giá trị ASP.NET_SessionId vào đây..."
            value={cookieInput}
            onChange={e => setCookieInput(e.target.value)}
            style={{height: '80px'}}
          />
        </div>
        
        <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
          <button className="btn btn-primary" onClick={saveCookie} disabled={loading || !cookieInput.trim()}>
            {loading ? 'Đang lưu...' : 'Ghi đè Cookie'}
          </button>
          <span style={{marginLeft: '12px', fontSize: '13px', color: '#10b981'}}>
            ● Phiên VNPost hiện tại: <strong>{user.username}</strong>
          </span>
        </div>
      </div>
    </div>
  );
}

function UsersView({ token, currentUser, onProfileUpdate }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // Create user form
  const [newUsername, setNewUsername] = useState('');
  const [newRole, setNewRole] = useState('user');
  const [newConcurrency, setNewConcurrency] = useState(3);
  const [formLoading, setFormLoading] = useState(false);
  const [alertInfo, setAlertInfo] = useState(null);

  // Edit user state
  const [editingUser, setEditingUser] = useState(null);
  const [editRole, setEditRole] = useState('user');
  const [editConcurrency, setEditConcurrency] = useState(3);
  const [editPassword, setEditPassword] = useState('');

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/users`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!newUsername) return;

    setFormLoading(true);
    setAlertInfo(null);

    try {
      const res = await fetch(`${API_BASE}/api/admin/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          username: newUsername,
          role: newRole,
          concurrencyLimit: newConcurrency
        })
      });
      const data = await res.json();
      if (res.ok) {
        setAlertInfo({ type: 'success', text: `Phân quyền tài khoản VNPost ${newUsername} thành công.` });
        setNewUsername('');
        setNewRole('user');
        setNewConcurrency(3);
        fetchUsers();
      } else {
        setAlertInfo({ type: 'danger', text: data.error });
      }
    } catch (err) {
      setAlertInfo({ type: 'danger', text: 'Lỗi kết nối máy chủ.' });
    } finally {
      setFormLoading(false);
    }
  };

  const handleStartEdit = (u) => {
    setEditingUser(u);
    setEditRole(u.role);
    setEditConcurrency(u.concurrencyLimit || 3);
    setEditPassword('');
    setAlertInfo(null);
  };

  const handleCancelEdit = () => {
    setEditingUser(null);
    setAlertInfo(null);
  };

  const handleUpdateUser = async (e) => {
    e.preventDefault();
    if (!editingUser) return;

    setFormLoading(true);
    setAlertInfo(null);

    try {
      const res = await fetch(`${API_BASE}/api/admin/users/${editingUser.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          role: editRole,
          concurrencyLimit: editConcurrency,
          password: editPassword.trim() || undefined
        })
      });
      const data = await res.json();
      if (res.ok) {
        setAlertInfo({ type: 'success', text: `Cập nhật tài khoản "${editingUser.username}" thành công.` });
        
        // Nếu chỉnh sửa chính tài khoản đang đăng nhập, reload profile
        if (editingUser.id === currentUser.id) {
          await onProfileUpdate();
        }
        
        setEditingUser(null);
        fetchUsers();
      } else {
        setAlertInfo({ type: 'danger', text: data.error });
      }
    } catch (err) {
      setAlertInfo({ type: 'danger', text: 'Lỗi kết nối máy chủ.' });
    } finally {
      setFormLoading(false);
    }
  };

  const handleDeleteUser = async (id, username) => {
    if (!confirm(`Bạn có chắc chắn muốn xóa tài khoản "${username}"?`)) return;

    try {
      const res = await fetch(`${API_BASE}/api/admin/users/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        alert(data.message);
        fetchUsers();
      } else {
        alert(data.error);
      }
    } catch (err) {
      alert('Không thể kết nối đến máy chủ.');
    }
  };

  return (
    <div className="users-view-grid">
      <div>
        {editingUser ? (
          <div className="card">
            <h3 style={{fontSize: '16px', fontWeight: 600, marginBottom: '20px'}}>Cập nhật tài khoản</h3>
            {alertInfo && (
              <div className={`alert alert-${alertInfo.type}`} style={{padding: '10px', fontSize: '13px'}}>
                {alertInfo.text}
              </div>
            )}
            <form onSubmit={handleUpdateUser}>
              <div className="form-group">
                <label className="form-label">Tài khoản (VNPost)</label>
                <input
                  type="text"
                  className="input-field"
                  value={editingUser.username}
                  disabled
                />
              </div>
              <div className="form-group">
                <label className="form-label">Quyền hạn (Role)</label>
                <select 
                  className="input-field" 
                  value={editRole}
                  onChange={e => setEditRole(e.target.value)}
                  disabled={editingUser.username === 'admin'}
                >
                  <option value="user">Nhân viên (User)</option>
                  <option value="admin">Quản trị viên (Admin)</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Số luồng tải Excel (Threads)</label>
                <input
                  type="number"
                  className="input-field"
                  min="1"
                  max="20"
                  value={editConcurrency}
                  onChange={e => setEditConcurrency(parseInt(e.target.value, 10) || 3)}
                  required
                />
                {editConcurrency > 5 && (
                  <div className="alert alert-warning" style={{padding: '8px 12px', fontSize: '11px', marginTop: '8px', marginBottom: 0, lineHeight: 1.4}}>
                    ⚠️ Cảnh báo: Thiết lập số luồng lớn hơn 5 có thể khiến tài khoản VNPost bị khóa tạm thời hoặc bị đánh dấu Spam.
                  </div>
                )}
              </div>
              <div className="form-group">
                <label className="form-label">Mật khẩu mới (Bỏ trống nếu không đổi)</label>
                <input
                  type="password"
                  className="input-field"
                  placeholder="Nhập mật khẩu mới..."
                  value={editPassword}
                  onChange={e => setEditPassword(e.target.value)}
                />
              </div>
              <div style={{display: 'flex', gap: '8px', marginTop: '12px'}}>
                <button type="submit" className="btn btn-primary" style={{flexGrow: 1}} disabled={formLoading}>
                  Lưu
                </button>
                <button type="button" className="btn btn-secondary" style={{flexGrow: 1}} onClick={handleCancelEdit} disabled={formLoading}>
                  Hủy
                </button>
              </div>
            </form>
          </div>
        ) : (
          <div className="card">
            <h3 style={{fontSize: '16px', fontWeight: 600, marginBottom: '20px'}}>Phân quyền tài khoản VNPost</h3>
            {alertInfo && (
              <div className={`alert alert-${alertInfo.type}`} style={{padding: '10px', fontSize: '13px'}}>
                {alertInfo.text}
              </div>
            )}
            <form onSubmit={handleCreateUser}>
              <div className="form-group">
                <label className="form-label">Tài khoản VNPost</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Nhập chính xác username VNPost"
                  value={newUsername}
                  onChange={e => setNewUsername(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Quyền hạn (Role)</label>
                <select 
                  className="input-field" 
                  value={newRole}
                  onChange={e => setNewRole(e.target.value)}
                >
                  <option value="user">Nhân viên (User)</option>
                  <option value="admin">Quản trị viên (Admin)</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Số luồng tải Excel (Threads)</label>
                <input
                  type="number"
                  className="input-field"
                  min="1"
                  max="20"
                  value={newConcurrency}
                  onChange={e => setNewConcurrency(parseInt(e.target.value, 10) || 3)}
                  required
                />
                {newConcurrency > 5 && (
                  <div className="alert alert-warning" style={{padding: '8px 12px', fontSize: '11px', marginTop: '8px', marginBottom: 0, lineHeight: 1.4}}>
                    ⚠️ Cảnh báo: Thiết lập số luồng lớn hơn 5 có thể khiến tài khoản VNPost bị khóa tạm thời hoặc bị đánh dấu Spam.
                  </div>
                )}
              </div>
              <button type="submit" className="btn btn-primary" style={{width: '100%'}} disabled={formLoading}>
                {formLoading ? 'Đang liên kết...' : 'Phân quyền tài khoản'}
              </button>
            </form>
          </div>
        )}
      </div>

      <div>
        <div className="card">
          <h3 style={{fontSize: '16px', fontWeight: 600, marginBottom: '20px'}}>Danh sách tài khoản hệ thống</h3>
          
          {loading ? (
            <div style={{textAlign: 'center', padding: '30px 0', color: '#9ca3af'}}>Đang tải danh sách...</div>
          ) : (
            <div className="table-responsive">
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Tên tài khoản</th>
                    <th>Vai trò</th>
                    <th>Số luồng (Threads)</th>
                    <th>Ngày tạo</th>
                    <th style={{textAlign: 'right'}}>Hành động</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td style={{fontWeight: 600, fontSize: '15px'}}>{u.username}</td>
                      <td>
                        <span className={`user-role role-${u.role}`}>
                          {u.role === 'admin' ? 'Admin' : 'User'}
                        </span>
                      </td>
                      <td style={{fontWeight: 600, color: u.concurrencyLimit > 5 ? '#f59e0b' : 'inherit'}}>
                        {u.concurrencyLimit} luồng
                      </td>
                      <td style={{color: '#9ca3af'}}>{new Date(u.created_at).toLocaleDateString('vi-VN')}</td>
                      <td style={{textAlign: 'right'}}>
                        <div style={{display: 'inline-flex', gap: '8px'}}>
                          <button 
                            className="btn btn-secondary" 
                            style={{padding: '6px 12px', fontSize: '12px'}}
                            onClick={() => handleStartEdit(u)}
                            disabled={formLoading}
                          >
                            Sửa
                          </button>
                          <button 
                            className="btn btn-danger" 
                            style={{padding: '6px 12px', fontSize: '12px'}}
                            onClick={() => handleDeleteUser(u.id, u.username)}
                            disabled={u.username === 'admin' || u.id === currentUser.id || formLoading}
                          >
                            Xóa
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
