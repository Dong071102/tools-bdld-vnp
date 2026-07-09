import fs from 'fs';
import readline from 'readline';

const BASE_URL = 'https://bccp.vnpost.vn';
const LOGIN_URL = `${BASE_URL}/Login.aspx`;

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
  console.log('Fetching Login page...');
  const cookieMap = {};
  let res = await fetch(LOGIN_URL, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    }
  });

  updateCookies(res.headers.getSetCookie(), cookieMap);
  const html = await res.text();
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
      captchaUrl = src.startsWith('data:') ? src : `${BASE_URL}/${src.replace(/^\//, '')}`;
      break;
    }
  }

  if (!captchaUrl) {
    console.log('Captcha not found.');
    return;
  }

  let imgBuffer;
  if (captchaUrl.startsWith('data:')) {
    imgBuffer = Buffer.from(captchaUrl.split(',')[1], 'base64');
  } else {
    const imgRes = await fetch(captchaUrl, {
      headers: {
        'Cookie': cookieMapToString(cookieMap),
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    imgBuffer = Buffer.from(await imgRes.arrayBuffer());
  }

  fs.writeFileSync('captcha.png', imgBuffer);
  console.log('Saved captcha.png');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question('Captcha answer: ', async (answer) => {
    rl.close();
    console.log('Submitting login for lamdong...');

    const form = new URLSearchParams();
    for (const [name, val] of Object.entries(fields)) {
      form.set(name, val);
    }
    form.set('ctl00$MainContent$txtUser', 'lamdong');
    form.set('ctl00$MainContent$txtPassword', 'Lamdong@2026');
    form.set('ctl00$MainContent$txtcaptcha', answer.trim());
    form.set('ctl00$MainContent$btnLogin', 'Đăng nhập');

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

    console.log(`Initial POST Response: ${response.status}`);
    updateCookies(response.headers.getSetCookie(), cookieMap);

    let redirectCount = 0;
    while ((response.status === 302 || response.status === 301) && redirectCount < 10) {
      redirectCount++;
      const location = response.headers.get('location');
      if (!location) break;
      const nextUrl = location.startsWith('http') ? location : `${BASE_URL}/${location.replace(/^\//, '')}`;
      console.log(`Redirecting to: ${nextUrl}`);
      
      response = await fetch(nextUrl, {
        method: 'GET',
        headers: {
          'Cookie': cookieMapToString(cookieMap),
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Referer': LOGIN_URL
        },
        redirect: 'manual'
      });

      console.log(`Response status: ${response.status}`);
      updateCookies(response.headers.getSetCookie(), cookieMap);
    }

    const finalHtml = await response.text();
    fs.writeFileSync('final_page.html', finalHtml);
    console.log('Saved final_page.html');
    console.log('Final Cookies:', JSON.stringify(cookieMap));
    
    // Check if the final page has username input field
    if (finalHtml.includes('ctl00$MainContent$txtUser') || finalHtml.includes('ctl00_MainContent_txtUser')) {
      console.log('LOGIN FAILED: Username input field still exists.');
      const errorLabelRegex = /<(span|div)\s+[^>]*id=["'](?:ctl00_MainContent_lblError|lblError)["'][^>]*>([\s\S]*?)<\/span>/i;
      const errMatch = errorLabelRegex.exec(finalHtml);
      if (errMatch) {
        console.log('Error message on page:', errMatch[2].replace(/<[^>]*>/g, '').trim());
      } else {
        console.log('No error message found on page, but username input field is still present.');
      }
    } else {
      console.log('LOGIN SUCCESS! Username input field is gone!');
      // Check if BCCP is accessible
      console.log('Testing BCCP page access...');
      const bccpRes = await fetch(`${BASE_URL}/BCCP.aspx?act=TraceListv2`, {
        headers: {
          'Cookie': cookieMapToString(cookieMap),
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      const bccpHtml = await bccpRes.text();
      fs.writeFileSync('bccp_page.html', bccpHtml);
      console.log('Saved bccp_page.html');
      if (bccpHtml.includes('ctl00$MainContent$ctl00$btnExportV2') || bccpHtml.includes('btnExportV2')) {
        console.log('BCCP Page test success! Export button found.');
      } else {
        console.log('BCCP Page test failed! Export button not found.');
      }
    }
  });
}

runTest();
