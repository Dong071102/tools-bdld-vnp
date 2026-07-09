chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "OPEN_VNPOST_PANEL") {
    chrome.runtime.sendMessage({ type: "OPEN_VNPOST_PANEL_FROM_PAGE" });
    sendResponse({ ok: true });
    return false;
  }

  if (message?.type !== "VNPOST_EXPORT_BATCH") return false;

  exportBatchFromPage(message.codes)
    .then((bytes) => sendResponse({ ok: true, bytes: Array.from(bytes) }))
    .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));

  return true;
});

async function exportBatchFromPage(codes) {
  const traceUrl = new URL("/BCCP.aspx?act=TraceListv2", location.origin).href;
  const fields = await getOnlineFields(traceUrl);

  const form = new URLSearchParams();
  for (const [name, value] of Object.entries(fields)) {
    if (value !== undefined && value !== null) form.set(name, value);
  }
  
  // browsers use CRLF (\r\n) for line breaks in textareas when submitting forms
  form.set("ctl00$MainContent$ctl00$txtInput", codes.join("\r\n"));
  form.set("ctl00$MainContent$ctl00$btnExportV2", "Xuất file Excel v2");

  const response = await fetch(traceUrl, {
    method: "POST",
    credentials: "include",
    referrer: traceUrl,
    referrerPolicy: "strict-origin-when-cross-origin",
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
      "accept-language": "en-US,en;q=0.9,vi;q=0.8",
      "cache-control": "max-age=0",
      "content-type": "application/x-www-form-urlencoded",
      origin: location.origin,
      referer: traceUrl,
      priority: "u=0, i",
      "sec-fetch-dest": "document",
      "sec-fetch-mode": "navigate",
      "sec-fetch-site": "same-origin",
      "sec-fetch-user": "?1",
      "upgrade-insecure-requests": "1",
    },
    body: form.toString(),
  });

  if (!response.ok) throw new Error(`VNPost trả HTTP ${response.status}`);
  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const preview = decodePreview(bytes);
  if (/^\s*<!doctype html|^\s*<html|<form\b|<title\b/i.test(preview)) {
    throw new Error(`VNPost đang trả HTML, không phải byte Excel. Đầu response: ${preview.replace(/\s+/g, " ").slice(0, 240)}`);
  }
  return bytes;
}

async function getOnlineFields(traceUrl) {
  const isTraceListPage = location.href.includes("/BCCP.aspx?act=TraceListv2");
  const liveFields = isTraceListPage ? readFieldsFromDocument(document) : {};
  if (liveFields.__VIEWSTATE) return liveFields;

  const response = await fetch(traceUrl, {
    method: "GET",
    credentials: "include",
    headers: { accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" },
  });
  if (!response.ok) throw new Error(`Không tải được form VNPost: HTTP ${response.status}`);
  const html = await response.text();
  const doc = new DOMParser().parseFromString(html, "text/html");
  const fields = readFieldsFromDocument(doc);
  if (!fields.__VIEWSTATE) throw new Error("Không lấy được __VIEWSTATE online từ trang VNPost.");
  return fields;
}

function readFieldsFromDocument(doc) {
  const fields = {};
  for (const el of doc.querySelectorAll("input[name], textarea[name], select[name]")) {
    const name = el.getAttribute("name");
    if (!name) continue;
    
    // Exclude submit and button elements to avoid triggering incorrect ASP.NET actions
    const type = el.getAttribute("type") || "";
    if (type === "submit" || type === "button" || type === "image" || type === "reset") {
      continue;
    }
    
    if (el.matches('input[type="checkbox"], input[type="radio"]') && !el.checked) {
      continue;
    }
    
    fields[name] = el.value || "";
  }
  return fields;
}

function decodePreview(bytes) {
  const head = bytes.slice(0, Math.min(bytes.length, 1024));
  if (head[0] === 0xff && head[1] === 0xfe) return new TextDecoder("utf-16le").decode(head);
  if (head[0] === 0xfe && head[1] === 0xff) return new TextDecoder("utf-16be").decode(head);
  return new TextDecoder("utf-8").decode(head);
}

function installFloatingLauncher() {
  if (document.getElementById("vnpost-exporter-launcher")) return;

  const button = document.createElement("button");
  button.id = "vnpost-exporter-launcher";
  button.type = "button";
  button.title = "Mở VNPost Excel Exporter";
  button.setAttribute("aria-label", "Mở VNPost Excel Exporter");
  button.innerHTML = `<span>Xuất V2</span>`;

  const style = document.createElement("style");
  style.id = "vnpost-exporter-launcher-style";
  style.textContent = `
    #vnpost-exporter-launcher {
      position: fixed;
      right: 18px;
      top: 45%;
      z-index: 2147483647;
      width: 82px;
      min-height: 46px;
      border: 1px solid rgba(255,255,255,.48);
      border-radius: 18px;
      background: linear-gradient(145deg, rgba(12,132,89,.96), rgba(20,184,166,.94));
      box-shadow: 0 18px 45px rgba(5, 75, 62, .34), inset 0 1px 0 rgba(255,255,255,.35);
      color: #fff;
      cursor: pointer;
      display: grid;
      place-items: center;
      padding: 10px 12px;
      font: 800 13px/1.15 Arial, sans-serif;
      letter-spacing: .15px;
      transition: transform .18s ease, box-shadow .18s ease, filter .18s ease;
    }
    #vnpost-exporter-launcher:hover {
      transform: translateX(-4px) scale(1.04);
      box-shadow: 0 22px 55px rgba(5, 75, 62, .42), 0 0 0 5px rgba(20,184,166,.14);
      filter: saturate(1.08);
    }
    #vnpost-exporter-launcher:active { transform: translateX(-2px) scale(.98); }
    #vnpost-exporter-launcher span {
      color: #ecfeff;
      text-shadow: 0 1px 2px rgba(0,0,0,.22);
      white-space: nowrap;
    }
  `;

  button.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "OPEN_VNPOST_PANEL_FROM_PAGE" });
  });

  document.documentElement.appendChild(style);
  document.body.appendChild(button);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", installFloatingLauncher, { once: true });
} else {
  installFloatingLauncher();
}
