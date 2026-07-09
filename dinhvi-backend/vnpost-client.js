const BASE_URL = 'https://bccp.vnpost.vn';
const LOGIN_URL = `${BASE_URL}/Login.aspx`;
const TRACE_URL = `${BASE_URL}/BCCP.aspx?act=TraceListv2`;

// Helper to parse Set-Cookie headers or semicolon-separated Cookie strings
export function updateCookies(setCookieHeader, existingCookieMap = {}) {
  if (!setCookieHeader) return existingCookieMap;
  const cookieStrings = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
  const directives = ['path', 'domain', 'expires', 'secure', 'httponly', 'samesite', 'max-age'];

  for (const cookieStr of cookieStrings) {
    const parts = cookieStr.split(';');
    for (const part of parts) {
      const eqIdx = part.indexOf('=');
      if (eqIdx === -1) continue;
      const key = part.substring(0, eqIdx).trim();
      const val = part.substring(eqIdx + 1).trim();
      
      if (key && !directives.includes(key.toLowerCase())) {
        existingCookieMap[key] = val;
      }
    }
  }
  return existingCookieMap;
}

export function cookieMapToString(cookieMap) {
  return Object.entries(cookieMap)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

// Regex-based HTML Parser for ASP.NET fields
function parseAspNetFields(html) {
  const fields = {};
  
  // Extract inputs
  const inputRegex = /<input\s+([^>]*)\/?>/gi;
  const nameRegex = /name=["']([^"']+)["']/i;
  const valueRegex = /value=["']([^"']*)["']/i;
  const typeRegex = /type=["']([^"']+)["']/i;
  const checkedRegex = /checked/i;

  let match;
  while ((match = inputRegex.exec(html)) !== null) {
    const attrs = match[1];
    const nameMatch = nameRegex.exec(attrs);
    if (!nameMatch) continue;
    const name = nameMatch[1];

    const typeMatch = typeRegex.exec(attrs);
    const type = typeMatch ? typeMatch[1].toLowerCase() : '';

    if (['submit', 'button', 'image', 'reset'].includes(type)) continue;
    if ((type === 'checkbox' || type === 'radio') && !checkedRegex.test(attrs)) continue;

    const valMatch = valueRegex.exec(attrs);
    const value = valMatch ? valMatch[1] : '';

    fields[name] = value;
  }

  // Extract textareas
  const textareaRegex = /<textarea\s+[^>]*name=["']([^"']+)["'][^>]*>([\s\S]*?)<\/textarea>/gi;
  while ((match = textareaRegex.exec(html)) !== null) {
    fields[match[1]] = match[2].trim();
  }

  // Extract select values
  const selectRegex = /<select\s+[^>]*name=["']([^"']+)["'][^>]*>([\s\S]*?)<\/select>/gi;
  const selectedOptionRegex = /<option\s+[^>]*selected[^>]*value=["']([^"']*)["']/i;
  const fallbackOptionRegex = /<option\s+[^>]*value=["']([^"']*)["']/i;
  
  while ((match = selectRegex.exec(html)) !== null) {
    const name = match[1];
    const optionsHtml = match[2];
    const selectedMatch = selectedOptionRegex.exec(optionsHtml);
    if (selectedMatch) {
      fields[name] = selectedMatch[1];
    } else {
      const fallbackMatch = fallbackOptionRegex.exec(optionsHtml);
      fields[name] = fallbackMatch ? fallbackMatch[1] : '';
    }
  }

  return fields;
}

// Step 1: Load login page and get form fields + captcha
export async function getLoginState() {
  const cookieMap = {};
  const response = await fetch(LOGIN_URL, {
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    }
  });

  const setCookies = response.headers.getSetCookie();
  updateCookies(setCookies, cookieMap);

  const html = await response.text();
  const fields = parseAspNetFields(html);

  // Search for Captcha image in HTML using regex
  const imgRegex = /<img\s+([^>]+)\/?>/gi;
  const srcRegex = /src=["']([^"']+)["']/i;
  const idRegex = /id=["']([^"']+)["']/i;
  let captchaUrl = null;

  let imgMatch;
  while ((imgMatch = imgRegex.exec(html)) !== null) {
    const attrs = imgMatch[1];
    const srcMatch = srcRegex.exec(attrs);
    if (!srcMatch) continue;
    const src = srcMatch[1];
    
    const idMatch = idRegex.exec(attrs);
    const id = idMatch ? idMatch[1] : '';

    if (src.toLowerCase().includes('captcha') || id.toLowerCase().includes('captcha') || src.toLowerCase().includes('image.axd')) {
      if (src.startsWith('data:') || src.startsWith('http')) {
        captchaUrl = src;
      } else {
        captchaUrl = `${BASE_URL}/${src.replace(/^\//, '')}`;
      }
      break;
    }
  }

  let captchaImgBase64 = null;
  if (captchaUrl) {
    if (captchaUrl.startsWith('data:')) {
      captchaImgBase64 = captchaUrl;
    } else {
      try {
        const imgResponse = await fetch(captchaUrl, {
          headers: {
            'Cookie': cookieMapToString(cookieMap),
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
        if (imgResponse.ok) {
          const buffer = await imgResponse.arrayBuffer();
          captchaImgBase64 = `data:${imgResponse.headers.get('content-type') || 'image/jpeg'};base64,${Buffer.from(buffer).toString('base64')}`;
        }
      } catch (err) {
        console.error('Failed to load captcha image:', err);
      }
    }
  }

  return {
    fields,
    cookies: cookieMap,
    captchaImage: captchaImgBase64
  };
}

// Step 2: Attempt Login to VNPost
export async function loginToVnpost(username, password, captchaSolution, initialFields, initialCookies) {
  const cookieMap = { ...initialCookies };
  const form = new URLSearchParams();

  for (const [name, value] of Object.entries(initialFields)) {
    form.set(name, value);
  }

  // Default exact field names for VNPost Login
  let userField = 'ctl00$MainContent$txtUser';
  let passField = 'ctl00$MainContent$txtPassword';
  let captchaField = 'ctl00$MainContent$txtcaptcha';
  let submitField = 'ctl00$MainContent$btnLogin';

  // Strict fallback auto-detection in case the field names change
  if (initialFields[userField] === undefined) {
    for (const key of Object.keys(initialFields)) {
      const lowerKey = key.toLowerCase();
      if ((lowerKey.includes('user') || lowerKey.includes('txtuser')) && !lowerKey.includes('btn') && !lowerKey.includes('button')) {
        userField = key;
      }
      if (lowerKey.includes('password') || lowerKey.includes('txtpassword') || lowerKey.includes('txtpass')) {
        passField = key;
      }
      if (lowerKey.includes('captcha') || lowerKey.includes('txtcaptcha')) {
        captchaField = key;
      }
      if (lowerKey.includes('btnlogin') || lowerKey.includes('btnsubmit')) {
        submitField = key;
      }
    }
  }

  form.set(userField, username);
  form.set(passField, password);
  if (captchaSolution) {
    form.set(captchaField, captchaSolution);
  }
  form.set(submitField, 'Đăng nhập');

  let response = await fetch(LOGIN_URL, {
    method: 'POST',
    headers: {
      'Cookie': cookieMapToString(cookieMap),
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Origin': BASE_URL,
      'Referer': LOGIN_URL,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8'
    },
    body: form.toString(),
    redirect: 'manual'
  });

  updateCookies(response.headers.getSetCookie(), cookieMap);

  // Follow redirects manually to gather all cookies set along the chain
  let redirectCount = 0;
  while ((response.status === 302 || response.status === 301) && redirectCount < 5) {
    redirectCount++;
    const location = response.headers.get('location');
    if (!location) break;

    const nextUrl = location.startsWith('http') ? location : `${BASE_URL}/${location.replace(/^\//, '')}`;
    response = await fetch(nextUrl, {
      method: 'GET',
      headers: {
        'Cookie': cookieMapToString(cookieMap),
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8'
      },
      redirect: 'manual'
    });

    updateCookies(response.headers.getSetCookie(), cookieMap);
  }

  const html = await response.text();

  // If login is successful, the page will contain a logout link (act=Logout) or the username input field will be gone
  if (html.includes('act=Logout') || html.includes('Logout') || !html.includes(userField)) {
    return {
      success: true,
      cookies: cookieMap
    };
  }

  // Look for label error e.g., id="ctl00_MainContent_lblError" or id="lblError"
  const errorLabelRegex = /<(span|div)\s+[^>]*id=["'](?:ctl00_MainContent_lblError|lblError)["'][^>]*>([\s\S]*?)<\/span>/i;
  const errMatch = errorLabelRegex.exec(html);
  const errorMsg = errMatch ? errMatch[2].replace(/<[^>]*>/g, '').trim() : 'Đăng nhập VNPost không thành công (Sai tài khoản/mật khẩu hoặc Captcha)';

  return {
    success: false,
    error: errorMsg
  };
}

// Step 3: Query and export a batch of codes
export async function exportBatchFromVnpost(codes, cookieStringOrMap) {
  const cookieMap = typeof cookieStringOrMap === 'string'
    ? updateCookies(cookieStringOrMap, {})
    : { ...cookieStringOrMap };

  const cookiesStr = cookieMapToString(cookieMap);

  // 1. Get ASP.NET fields from TraceListv2 page
  const getResponse = await fetch(TRACE_URL, {
    method: 'GET',
    headers: {
      'Cookie': cookiesStr,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    }
  });

  if (!getResponse.ok) {
    throw new Error(`BCCP VNPost trả về mã HTTP ${getResponse.status}. Kiểm tra lại Cookie.`);
  }

  const getHtml = await getResponse.text();
  if (getHtml.includes('btnLogin') || getHtml.includes('txtUsername')) {
    throw new Error('Phiên đăng nhập VNPost hết hạn hoặc không hợp lệ. Vui lòng cập nhật lại Cookie hoặc tài khoản.');
  }

  const fields = parseAspNetFields(getHtml);
  
  // 2. Perform POST to export Excel
  const form = new URLSearchParams();
  for (const [name, value] of Object.entries(fields)) {
    if (value !== undefined && value !== null) form.set(name, value);
  }

  form.set("ctl00$MainContent$ctl00$txtInput", codes.join("\r\n"));
  form.set("ctl00$MainContent$ctl00$btnExportV2", "Xuất file Excel v2");

  const postResponse = await fetch(TRACE_URL, {
    method: 'POST',
    headers: {
      'Cookie': cookiesStr,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Origin': BASE_URL,
      'Referer': TRACE_URL,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8'
    },
    body: form.toString()
  });

  if (!postResponse.ok) {
    throw new Error(`VNPost trả HTTP ${postResponse.status} khi xuất dữ liệu.`);
  }

  const buffer = await postResponse.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  // Validate response is indeed Excel binary (not HTML login redirect or error)
  const headBytes = bytes.slice(0, Math.min(bytes.length, 1024));
  let headStr = '';
  if (headBytes[0] === 0xff && headBytes[1] === 0xfe) headStr = new TextDecoder("utf-16le").decode(headBytes);
  else if (headBytes[0] === 0xfe && headBytes[1] === 0xff) headStr = new TextDecoder("utf-16be").decode(headBytes);
  else headStr = new TextDecoder("utf-8").decode(headBytes);

  if (/^\s*<!doctype html|^\s*<html|<form\b|<title\b/i.test(headStr)) {
    const errorLabelRegex = /<(span|div)\s+[^>]*id=["'](?:ctl00_MainContent_lblError|lblError)["'][^>]*>([\s\S]*?)<\/span>/i;
    const errMatch = errorLabelRegex.exec(headStr);
    const err = errMatch ? errMatch[2].replace(/<[^>]*>/g, '').trim() : 'Lỗi không xác định từ VNPost.';
    throw new Error(`VNPost báo lỗi: ${err}`);
  }

  return bytes;
}
