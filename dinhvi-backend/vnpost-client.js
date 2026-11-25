const BASE_URL = 'https://bccp.vnpost.vn';
const LOGIN_URL = `${BASE_URL}/Login.aspx`;
const TRACE_URL = `${BASE_URL}/BCCP.aspx?act=TraceListv2`;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const HTML_ACCEPT = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';
const COOKIE_DIRECTIVES = new Set(['path', 'domain', 'expires', 'secure', 'httponly', 'samesite', 'max-age']);
const ERROR_LABEL_RE = /<(span|div)\s+[^>]*id=["'](?:ctl00_MainContent_lblError|lblError)["'][^>]*>([\s\S]*?)<\/(?:span|div)>/i;

function extractVnpostError(html, fallback) {
  const match = ERROR_LABEL_RE.exec(html);
  const msg = match ? match[2].replace(/<[^>]*>/g, '').trim() : '';
  return msg || fallback;
}

export function updateCookies(setCookieHeader, existingCookieMap = {}) {
  if (!setCookieHeader) return existingCookieMap;
  const cookieStrings = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
  for (const cookieStr of cookieStrings) {
    for (const part of cookieStr.split(';')) {
      const eqIdx = part.indexOf('=');
      if (eqIdx === -1) continue;
      const key = part.slice(0, eqIdx).trim();
      const val = part.slice(eqIdx + 1).trim();
      if (key && !COOKIE_DIRECTIVES.has(key.toLowerCase())) {
        existingCookieMap[key] = val;
      }
    }
  }
  return existingCookieMap;
}

export function cookieMapToString(cookieMap) {
  return Object.entries(cookieMap).map(([k, v]) => `${k}=${v}`).join('; ');
}

function parseAspNetFields(html) {
  const fields = {};
  const nameRe = /name=["']([^"']+)["']/i;
  const valueRe = /value=["']([^"']*)["']/i;
  const typeRe = /type=["']([^"']+)["']/i;

  let match;
  const inputRe = /<input\s+([^>]*)\/?>/gi;
  while ((match = inputRe.exec(html)) !== null) {
    const attrs = match[1];
    const nameMatch = nameRe.exec(attrs);
    if (!nameMatch) continue;
    const type = (typeRe.exec(attrs)?.[1] || '').toLowerCase();
    if (['submit', 'button', 'image', 'reset'].includes(type)) continue;
    if ((type === 'checkbox' || type === 'radio') && !/checked/i.test(attrs)) continue;
    fields[nameMatch[1]] = valueRe.exec(attrs)?.[1] || '';
  }

  const textareaRe = /<textarea\s+[^>]*name=["']([^"']+)["'][^>]*>([\s\S]*?)<\/textarea>/gi;
  while ((match = textareaRe.exec(html)) !== null) {
    fields[match[1]] = match[2].trim();
  }

  const selectRe = /<select\s+[^>]*name=["']([^"']+)["'][^>]*>([\s\S]*?)<\/select>/gi;
  const selectedOptRe = /<option\s+[^>]*selected[^>]*value=["']([^"']*)["']/i;
  const fallbackOptRe = /<option\s+[^>]*value=["']([^"']*)["']/i;
  while ((match = selectRe.exec(html)) !== null) {
    const optionsHtml = match[2];
    fields[match[1]] = (selectedOptRe.exec(optionsHtml) || fallbackOptRe.exec(optionsHtml))?.[1] || '';
  }

  return fields;
}

export async function getLoginState() {
  const cookieMap = {};
  const response = await fetch(LOGIN_URL, {
    method: 'GET',
    headers: { 'User-Agent': UA, Accept: HTML_ACCEPT },
    signal: AbortSignal.timeout(15000)
  });

  updateCookies(response.headers.getSetCookie(), cookieMap);
  const html = await response.text();
  const fields = parseAspNetFields(html);

  const imgRe = /<img\s+([^>]+)\/?>/gi;
  const srcRe = /src=["']([^"']+)["']/i;
  const idRe = /id=["']([^"']+)["']/i;
  let captchaUrl = null;
  let imgMatch;
  while ((imgMatch = imgRe.exec(html)) !== null) {
    const attrs = imgMatch[1];
    const src = srcRe.exec(attrs)?.[1];
    if (!src) continue;
    const id = idRe.exec(attrs)?.[1] || '';
    const lowerSrc = src.toLowerCase();
    if (lowerSrc.includes('captcha') || id.toLowerCase().includes('captcha') || lowerSrc.includes('image.axd')) {
      captchaUrl = src.startsWith('data:') || src.startsWith('http') ? src : `${BASE_URL}/${src.replace(/^\//, '')}`;
      break;
    }
  }

  let captchaImage = null;
  if (captchaUrl) {
    if (captchaUrl.startsWith('data:')) {
      captchaImage = captchaUrl;
    } else {
      try {
        const imgResponse = await fetch(captchaUrl, {
          headers: { Cookie: cookieMapToString(cookieMap), 'User-Agent': UA },
          signal: AbortSignal.timeout(10000)
        });
        if (imgResponse.ok) {
          const buffer = await imgResponse.arrayBuffer();
          const ct = imgResponse.headers.get('content-type') || 'image/jpeg';
          captchaImage = `data:${ct};base64,${Buffer.from(buffer).toString('base64')}`;
        }
      } catch (err) {
        console.error('Failed to load captcha image:', err);
      }
    }
  }

  return { fields, cookies: cookieMap, captchaImage };
}

export async function loginToVnpost(username, password, captchaSolution, initialFields, initialCookies) {
  const cookieMap = { ...initialCookies };
  const form = new URLSearchParams(initialFields);

  let userField = 'ctl00$MainContent$txtUser';
  let passField = 'ctl00$MainContent$txtPassword';
  let captchaField = 'ctl00$MainContent$txtcaptcha';
  let submitField = 'ctl00$MainContent$btnLogin';

  if (initialFields[userField] === undefined) {
    for (const key of Object.keys(initialFields)) {
      const k = key.toLowerCase();
      if ((k.includes('user') || k.includes('txtuser')) && !k.includes('btn') && !k.includes('button')) userField = key;
      if (k.includes('password') || k.includes('txtpassword') || k.includes('txtpass')) passField = key;
      if (k.includes('captcha') || k.includes('txtcaptcha')) captchaField = key;
      if (k.includes('btnlogin') || k.includes('btnsubmit')) submitField = key;
    }
  }

  form.set(userField, username);
  form.set(passField, password);
  if (captchaSolution) form.set(captchaField, captchaSolution);
  form.set(submitField, 'Đăng nhập');

  let response = await fetch(LOGIN_URL, {
    method: 'POST',
    headers: {
      Cookie: cookieMapToString(cookieMap),
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': UA,
      Origin: BASE_URL,
      Referer: LOGIN_URL,
      Accept: HTML_ACCEPT
    },
    body: form.toString(),
    redirect: 'manual',
    signal: AbortSignal.timeout(20000)
  });

  updateCookies(response.headers.getSetCookie(), cookieMap);

  for (let redirects = 0; (response.status === 302 || response.status === 301) && redirects < 5; redirects++) {
    const location = response.headers.get('location');
    if (!location) break;
    const nextUrl = location.startsWith('http') ? location : `${BASE_URL}/${location.replace(/^\//, '')}`;
    response = await fetch(nextUrl, {
      method: 'GET',
      headers: { Cookie: cookieMapToString(cookieMap), 'User-Agent': UA, Accept: HTML_ACCEPT },
      redirect: 'manual',
      signal: AbortSignal.timeout(15000)
    });
    updateCookies(response.headers.getSetCookie(), cookieMap);
  }

  const html = await response.text();
  if (html.includes('act=Logout') || html.includes('Logout') || !html.includes(userField)) {
    return { success: true, cookies: cookieMap };
  }

  return {
    success: false,
    error: extractVnpostError(html, 'Đăng nhập VNPost không thành công (Sai tài khoản/mật khẩu hoặc Captcha)')
  };
}

export async function exportBatchFromVnpost(codes, cookieStringOrMap) {
  const cookieMap = typeof cookieStringOrMap === 'string'
    ? updateCookies(cookieStringOrMap, {})
    : { ...cookieStringOrMap };
  const cookiesStr = cookieMapToString(cookieMap);

  const getResponse = await fetch(TRACE_URL, {
    method: 'GET',
    headers: { Cookie: cookiesStr, 'User-Agent': UA, Accept: HTML_ACCEPT },
    signal: AbortSignal.timeout(20000)
  });
  if (!getResponse.ok) {
    throw new Error(`BCCP VNPost trả về mã HTTP ${getResponse.status}. Kiểm tra lại Cookie.`);
  }

  const getHtml = await getResponse.text();
  if (getHtml.includes('btnLogin') || getHtml.includes('txtUsername')) {
    throw new Error('Phiên đăng nhập VNPost hết hạn hoặc không hợp lệ. Vui lòng cập nhật lại Cookie hoặc tài khoản.');
  }

  const fields = parseAspNetFields(getHtml);
  const form = new URLSearchParams();
  for (const [name, value] of Object.entries(fields)) {
    if (value !== undefined && value !== null) form.set(name, value);
  }
  form.set('ctl00$MainContent$ctl00$txtInput', codes.join('\r\n'));
  form.set('ctl00$MainContent$ctl00$btnExportV2', 'Xuất file Excel v2');

  const postResponse = await fetch(TRACE_URL, {
    method: 'POST',
    headers: {
      Cookie: cookiesStr,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': UA,
      Origin: BASE_URL,
      Referer: TRACE_URL,
      Accept: HTML_ACCEPT
    },
    body: form.toString(),
    signal: AbortSignal.timeout(60000)
  });
  if (!postResponse.ok) {
    throw new Error(`VNPost trả HTTP ${postResponse.status} khi xuất dữ liệu.`);
  }

  const bytes = new Uint8Array(await postResponse.arrayBuffer());
  const headBytes = bytes.slice(0, Math.min(bytes.length, 1024));
  const encoding = (headBytes[0] === 0xff && headBytes[1] === 0xfe)
    ? 'utf-16le'
    : (headBytes[0] === 0xfe && headBytes[1] === 0xff ? 'utf-16be' : 'utf-8');
  const headStr = new TextDecoder(encoding).decode(headBytes);

  if (/^\s*<!doctype html|^\s*<html|<form\b|<title\b/i.test(headStr)) {
    throw new Error(`VNPost báo lỗi: ${extractVnpostError(headStr, 'Lỗi không xác định từ VNPost.')}`);
  }

  return bytes;
}
