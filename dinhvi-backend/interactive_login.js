import fs from 'fs';
import readline from 'readline';

const BASE_URL = 'https://bccp.vnpost.vn';
const LOGIN_URL = `${BASE_URL}/Login.aspx`;

// Helper to parse Set-Cookie
function updateCookies(setCookieHeader, existingCookieMap = {}) {
  if (!setCookieHeader) return existingCookieMap;
  const cookies = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
  for (const cookieStr of cookies) {
    const parts = cookieStr.split(';')[0].split('=');
    if (parts.length >= 2) {
      const key = parts[0].trim();
      const val = parts.slice(1).join('=').trim();
      if (key) existingCookieMap[key] = val;
    }
  }
  return existingCookieMap;
}

function cookieMapToString(cookieMap) {
  return Object.entries(cookieMap)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

function parseAspNetFields(html) {
  const fields = {};
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
  return fields;
}

async function runTest() {
  console.log('--- STEP 1: GET LOGIN PAGE ---');
  const cookieMap = {};
  const response = await fetch(LOGIN_URL, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    }
  });

  updateCookies(response.headers.getSetCookie(), cookieMap);
  const html = await response.text();
  const fields = parseAspNetFields(html);

  // Find captcha
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

  if (!captchaUrl) {
    console.log('Captcha image NOT found in HTML.');
    return;
  }

  console.log('Captcha URL found:', captchaUrl.substring(0, 100) + '...');

  let imgBuffer;
  if (captchaUrl.startsWith('data:')) {
    const base64Data = captchaUrl.split(',')[1];
    imgBuffer = Buffer.from(base64Data, 'base64');
  } else {
    const imgUrl = captchaUrl.startsWith('http') ? captchaUrl : `${BASE_URL}/${captchaUrl.replace(/^\//, '')}`;
    const imgRes = await fetch(imgUrl, {
      headers: {
        'Cookie': cookieMapToString(cookieMap),
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    imgBuffer = Buffer.from(await imgRes.arrayBuffer());
  }

  fs.writeFileSync('captcha.png', imgBuffer);
  console.log('Captcha image written to captcha.png');

  // Read answer from console
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.question('Please open captcha.png and type the answer: ', async (answer) => {
    rl.close();
    console.log('Answer entered:', answer);

    console.log('--- STEP 2: POST LOGIN PAGE ---');
    const form = new URLSearchParams();
    for (const [name, val] of Object.entries(fields)) {
      form.set(name, val);
    }
    form.set('ctl00$MainContent$txtUser', 'lamdong');
    form.set('ctl00$MainContent$txtPassword', 'Lamdong@2026');
    form.set('ctl00$MainContent$txtcaptcha', answer.trim());
    form.set('ctl00$MainContent$btnLogin', 'Đăng nhập');

    const postResponse = await fetch(LOGIN_URL, {
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
      redirect: 'manual' // prevent auto redirect so we can inspect status
    });

    console.log('Response status:', postResponse.status);
    console.log('Redirect location:', postResponse.headers.get('location'));
    updateCookies(postResponse.headers.getSetCookie(), cookieMap);
    console.log('Cookies after post:', JSON.stringify(cookieMap));

    const postHtml = await postResponse.text();
    console.log('Response HTML length:', postHtml.length);
    
    const errorLabelRegex = /<(span|div)\s+[^>]*id=["'](?:ctl00_MainContent_lblError|lblError)["'][^>]*>([\s\S]*?)<\/span>/i;
    const errMatch = errorLabelRegex.exec(postHtml);
    if (errMatch) {
      console.log('Login failed message:', errMatch[2].replace(/<[^>]*>/g, '').trim());
    } else {
      console.log('No error message found in HTML.');
      if (postResponse.status === 302 || postResponse.headers.get('location')) {
        console.log('SUCCESS! Redirected to:', postResponse.headers.get('location'));
      }
    }
  });
}

runTest();
