const TRACE_URL = 'https://bccp.vnpost.vn/BCCP.aspx?act=TraceListv2';
const COOKIE = 'ASP.NET_SessionId=31dwxv5pmgcf4kpao5q33cgr; __Host-SRVNAME=B4';

async function run() {
  const res = await fetch(TRACE_URL, {
    headers: {
      'Cookie': COOKIE,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    }
  });

  console.log('Status:', res.status);
  const html = await res.text();
  console.log('HTML Length:', html.length);
  if (html.includes('btnExportV2') || html.includes('ctl00$MainContent$ctl00$btnExportV2')) {
    console.log('COOKIE IS VALID! Export button found.');
  } else {
    console.log('COOKIE IS INVALID! Export button not found.');
    if (html.includes('btnLogin') || html.includes('txtUser')) {
      console.log('Redirected to Login page.');
    }
  }
}

run();
