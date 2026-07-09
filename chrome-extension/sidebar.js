const BATCH_SIZE = 500;
const TRACE_URL = "https://bccp.vnpost.vn/BCCP.aspx?act=TraceListv2";
const SAMPLE_CODES = "CE991562158VN\nEA123456789VN\nCP987654321VN";

const els = {
  input: document.querySelector("#shipment-input"),
  badge: document.querySelector("#code-count-badge"),
  sample: document.querySelector("#sample-button"),
  clear: document.querySelector("#clear-button"),
  export: document.querySelector("#export-button"),
  download: document.querySelector("#download-button"),
  state: document.querySelector("#state-pill"),
  progress: document.querySelector("#progress-bar"),
  totalCodes: document.querySelector("#total-codes"),
  totalBatches: document.querySelector("#total-batches"),
  doneBatches: document.querySelector("#done-batches"),
  log: document.querySelector("#log-list"),
};

let latestBlobUrl = "";
let latestFileName = "";

els.input.addEventListener("input", refreshCounts);
els.sample.addEventListener("click", () => {
  els.input.value = SAMPLE_CODES;
  refreshCounts();
});
els.clear.addEventListener("click", () => {
  els.input.value = "";
  resetRunState();
  refreshCounts();
});
els.export.addEventListener("click", runExport);
els.download.addEventListener("click", () => {
  if (latestBlobUrl) downloadUrl(latestBlobUrl, latestFileName || makeFileName());
});

refreshCounts();

function parseCodes(text) {
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
}

function chunk(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

function refreshCounts() {
  const codes = parseCodes(els.input.value);
  const batches = Math.ceil(codes.length / BATCH_SIZE);
  els.badge.textContent = `${codes.length} mã`;
  els.totalCodes.textContent = String(codes.length);
  els.totalBatches.textContent = String(batches);
}

function resetRunState() {
  setState("idle", "Sẵn sàng");
  setProgress(0);
  els.doneBatches.textContent = "0";
  els.log.replaceChildren();
  els.download.disabled = true;
  if (latestBlobUrl) URL.revokeObjectURL(latestBlobUrl);
  latestBlobUrl = "";
  latestFileName = "";
}

async function runExport() {
  resetRunState();
  const codes = parseCodes(els.input.value);
  if (!codes.length) {
    setState("error", "Thiếu dữ liệu");
    addLog("Vui lòng nhập ít nhất 1 mã bưu gửi.", "error");
    return;
  }

  const batches = chunk(codes, BATCH_SIZE);
  els.totalBatches.textContent = String(batches.length);
  els.export.disabled = true;
  setState("running", "Đang xuất");
  addLog(`Bắt đầu xử lý ${codes.length} mã trong ${batches.length} batch.`);

  try {
    const excelBuffers = [];
    for (let index = 0; index < batches.length; index += 1) {
      const batchNumber = index + 1;
      addLog(`Batch ${batchNumber}/${batches.length}: gửi ${batches[index].length} mã...`);
      const buffer = await exportBatch(batches[index]);
      excelBuffers.push(buffer);
      els.doneBatches.textContent = String(batchNumber);
      setProgress(Math.round((batchNumber / batches.length) * 82));
      addLog(`Batch ${batchNumber}/${batches.length}: đã nhận Excel (${formatBytes(buffer.byteLength)}).`, "success");
    }

    addLog("Đang gộp dữ liệu Excel trong bộ nhớ...");
    const mergedResult = await mergeExcelBuffers(excelBuffers);
    latestFileName = makeFileName(mergedResult.extension);
    latestBlobUrl = URL.createObjectURL(new Blob([mergedResult.buffer], { type: mergedResult.mime }));
    setProgress(100);
    setState("done", "Hoàn tất");
    els.download.disabled = false;
    addLog(`Đã gộp xong. File sẵn sàng tải: ${latestFileName}`, "success");
    downloadUrl(latestBlobUrl, latestFileName);
  } catch (error) {
    console.error(error);
    setState("error", "Có lỗi");
    addLog(error.message || String(error), "error");
  } finally {
    els.export.disabled = false;
  }
}

async function exportBatch(codes) {
  const tab = await getBccpTab();
  const response = await sendExportMessage(tab.id, codes);
  if (!response?.ok) throw new Error(response?.error || "Không nhận được phản hồi từ tab VNPost.");
  return new Uint8Array(response.bytes).buffer;
}

async function getBccpTab() {
  if (!globalThis.chrome?.tabs?.query) {
    throw new Error("Chrome tabs API không khả dụng. Hãy reload extension trong chrome://extensions.");
  }
  const tabs = await chrome.tabs.query({ url: "https://bccp.vnpost.vn/*" });
  const tab = tabs.find((item) => item.url?.includes("/BCCP.aspx?act=TraceListv2")) || tabs[0];
  if (!tab?.id) {
    throw new Error("Hãy mở và đăng nhập bccp.vnpost.vn trên một tab, sau đó chạy lại extension.");
  }
  return tab;
}

async function sendExportMessage(tabId, codes) {
  try {
    return await chrome.tabs.sendMessage(tabId, { type: "VNPOST_EXPORT_BATCH", codes });
  } catch (error) {
    if (!globalThis.chrome?.scripting?.executeScript) throw error;
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
    return chrome.tabs.sendMessage(tabId, { type: "VNPOST_EXPORT_BATCH", codes });
  }
}

function looksLikeZip(buffer) {
  const bytes = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 4));
  return bytes[0] === 0x50 && bytes[1] === 0x4b;
}

function setState(kind, text) {
  els.state.className = `state-pill ${kind}`;
  els.state.textContent = text;
}

function setProgress(percent) {
  els.progress.style.width = `${Math.max(0, Math.min(100, percent))}%`;
}

function addLog(message, kind = "") {
  const item = document.createElement("li");
  if (kind) item.className = kind;
  item.textContent = `${new Date().toLocaleTimeString("vi-VN")} · ${message}`;
  els.log.prepend(item);
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function makeFileName(extension = "xlsx") {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15);
  return `DanhSachBuuGui_Gop_${stamp}.${extension}`;
}

function downloadUrl(url, filename) {
  if (globalThis.chrome?.downloads?.download) {
    chrome.downloads.download({ url, filename, saveAs: true });
    return;
  }
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
}

async function mergeExcelBuffers(buffers) {
  if (buffers.length === 1) {
    const isZip = looksLikeZip(buffers[0]);
    return {
      buffer: buffers[0],
      extension: isZip ? "xlsx" : "xls",
      mime: isZip ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "application/vnd.ms-excel;charset=utf-8",
    };
  }

  if (buffers.every(looksLikeZip)) {
    return {
      buffer: await mergeXlsxBuffers(buffers),
      extension: "xlsx",
      mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    };
  }

  return {
    buffer: mergeHtmlExcelBuffers(buffers),
    extension: "xls",
    mime: "application/vnd.ms-excel;charset=utf-8",
  };
}

async function mergeXlsxBuffers(buffers) {
  if (buffers.length === 1) return buffers[0];
  const workbooks = [];
  for (const buffer of buffers) workbooks.push(await readXlsx(buffer));

  const first = workbooks[0];
  const mergedRows = [];
  let firstSignature = "";
  for (let i = 0; i < workbooks.length; i += 1) {
    const rows = extractRows(workbooks[i]);
    const start = i === 0 ? 0 : findDataStart(rows, firstSignature);
    if (i === 0) firstSignature = rowSignature(rows.find((row) => row.cells.some((cell) => cell.value)) || { cells: [] });
    mergedRows.push(...rows.slice(start));
  }

  first.entries.set("xl/worksheets/sheet1.xml", stringToBytes(buildSheetXml(mergedRows)));
  return writeZip(first.entries);
}

async function readXlsx(buffer) {
  const entries = await unzip(buffer);
  return {
    entries,
    sheetXml: bytesToString(entries.get("xl/worksheets/sheet1.xml")),
    sharedStrings: parseSharedStrings(bytesToString(entries.get("xl/sharedStrings.xml") || new Uint8Array())),
  };
}

function extractRows(workbook) {
  const doc = new DOMParser().parseFromString(workbook.sheetXml, "application/xml");
  return [...doc.querySelectorAll("sheetData > row")].map((rowEl) => ({
    cells: [...rowEl.querySelectorAll("c")].map((cellEl) => readCell(cellEl, workbook.sharedStrings)),
  }));
}

function readCell(cellEl, sharedStrings) {
  const ref = cellEl.getAttribute("r") || "";
  const col = ref.replace(/[0-9]/g, "") || "A";
  const style = cellEl.getAttribute("s") || "";
  const type = cellEl.getAttribute("t") || "";
  const raw = cellEl.querySelector("v")?.textContent || "";
  const inline = [...cellEl.querySelectorAll("is t")].map((node) => node.textContent).join("");
  let value = raw;
  if (type === "s") value = sharedStrings[Number(raw)] || "";
  if (type === "inlineStr") value = inline;
  return { col, style, type, value };
}

function findDataStart(rows, firstSignature) {
  let skipped = 0;
  for (const row of rows) {
    const sig = rowSignature(row);
    if (!sig || sig === firstSignature || sig.includes("STT|") || sig.includes("Mã")) skipped += 1;
    else break;
    if (skipped >= 8) break;
  }
  return skipped;
}

function rowSignature(row) {
  return row.cells.map((cell) => String(cell.value || "").trim()).filter(Boolean).join("|");
}

function buildSheetXml(rows) {
  const rowXml = rows
    .map((row, rowIndex) => {
      const r = rowIndex + 1;
      const cells = row.cells
        .map((cell) => {
          const ref = `${cell.col}${r}`;
          const style = cell.style ? ` s="${escapeXml(cell.style)}"` : "";
          const value = String(cell.value ?? "");
          if (value !== "" && !Number.isNaN(Number(value)) && !/^0\d+/.test(value) && cell.type !== "s") {
            return `<c r="${ref}"${style}><v>${escapeXml(value)}</v></c>`;
          }
          return `<c r="${ref}" t="inlineStr"${style}><is><t>${escapeXml(value)}</t></is></c>`;
        })
        .join("");
      return `<row r="${r}">${cells}</row>`;
    })
    .join("");
  const lastCol = rows.reduce((max, row) => Math.max(max, ...row.cells.map((cell) => colNumber(cell.col))), 1);
  const dimension = `A1:${colName(lastCol)}${Math.max(rows.length, 1)}`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><dimension ref="${dimension}"/><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="15"/><sheetData>${rowXml}</sheetData></worksheet>`;
}

function escapeXml(value) {
  return String(value).replace(/[<>&"]/g, (ch) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[ch]);
}

function parseSharedStrings(xml) {
  if (!xml) return [];
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  return [...doc.querySelectorAll("si")].map((si) => [...si.querySelectorAll("t")].map((t) => t.textContent).join(""));
}

function mergeHtmlExcelBuffers(buffers) {
  const allRows = [];
  let firstSignature = "";
  for (let index = 0; index < buffers.length; index += 1) {
    const html = decodeExcelBytes(buffers[index]);
    const rows = extractHtmlRows(html);
    if (!rows.length) throw new Error(`Batch ${index + 1}: không tìm thấy bảng dữ liệu trong byte Excel.`);
    if (index === 0) {
      firstSignature = rowSignature({ cells: rows[0].cells });
      allRows.push(...rows);
    } else {
      allRows.push(...rows.slice(findDataStart(rows, firstSignature)));
    }
  }
  return stringToBytes(buildHtmlWorkbook(allRows)).buffer;
}

function decodeExcelBytes(buffer) {
  const bytes = new Uint8Array(buffer);
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  if (/<html|<table|<tr|<xml/i.test(utf8)) return utf8;
  const windows1258 = new TextDecoder("windows-1258", { fatal: false }).decode(bytes);
  if (/<html|<table|<tr|<xml/i.test(windows1258)) return windows1258;
  const preview = [...bytes.slice(0, 16)].map((b) => b.toString(16).padStart(2, "0")).join(" ");
  throw new Error(`Byte trả về không phải XLSX ZIP hoặc Excel HTML. 16 byte đầu: ${preview}`);
}

function extractHtmlRows(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const rows = [...doc.querySelectorAll("tr")];
  return rows.map((row) => ({
    cells: [...row.querySelectorAll("th,td")].map((cell, index) => ({
      col: colName(index + 1),
      style: "",
      type: "inlineStr",
      value: cell.textContent.replace(/\s+/g, " ").trim(),
    })),
  }));
}

function buildHtmlWorkbook(rows) {
  const tableRows = rows
    .map((row) => `<tr>${row.cells.map((cell) => `<td>${escapeXml(cell.value ?? "")}</td>`).join("")}</tr>`)
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="content-type" content="application/vnd.ms-excel; charset=UTF-8"><style>td{mso-number-format:'\\@';white-space:nowrap;border:.5pt solid #d9e2f3;padding:4px;font-family:Arial;font-size:10pt}</style></head><body><table>${tableRows}</table></body></html>`;
}

async function unzip(buffer) {
  const bytes = new Uint8Array(buffer);
  const eocd = findEocd(bytes);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const entries = new Map();

  for (let i = 0; i < count; i += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) throw new Error("ZIP central directory không hợp lệ.");
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const fileNameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = bytesToString(bytes.slice(offset + 46, offset + 46 + fileNameLength));
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.slice(dataStart, dataStart + compressedSize);
    const data = method === 0 ? compressed : await inflateRaw(compressed);
    entries.set(name, data);
    offset += 46 + fileNameLength + extraLength + commentLength;
  }
  return entries;
}

function findEocd(bytes) {
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 66000); i -= 1) {
    if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 0x05 && bytes[i + 3] === 0x06) return i;
  }
  throw new Error("Không tìm thấy EOCD trong file XLSX.");
}

async function inflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function writeZip(entries) {
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const [name, data] of entries) {
    const nameBytes = stringToBytes(name);
    const crc = crc32(data);
    const local = new Uint8Array(30 + nameBytes.length);
    const view = new DataView(local.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(8, 0, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, data.length, true);
    view.setUint32(22, data.length, true);
    view.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    chunks.push(local, data);

    const cd = new Uint8Array(46 + nameBytes.length);
    const cdv = new DataView(cd.buffer);
    cdv.setUint32(0, 0x02014b50, true);
    cdv.setUint16(4, 20, true);
    cdv.setUint16(6, 20, true);
    cdv.setUint16(10, 0, true);
    cdv.setUint32(16, crc, true);
    cdv.setUint32(20, data.length, true);
    cdv.setUint32(24, data.length, true);
    cdv.setUint16(28, nameBytes.length, true);
    cdv.setUint32(42, offset, true);
    cd.set(nameBytes, 46);
    central.push(cd);
    offset += local.length + data.length;
  }
  const centralSize = central.reduce((sum, item) => sum + item.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.size, true);
  ev.setUint16(10, entries.size, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  return concatBytes([...chunks, ...central, eocd]);
}

function concatBytes(parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out.buffer;
}

const CRC_TABLE = new Uint32Array(256).map((_, index) => {
  let c = index;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function bytesToString(bytes) {
  return new TextDecoder("utf-8").decode(bytes);
}

function stringToBytes(text) {
  return new TextEncoder().encode(text);
}

function colNumber(col) {
  return [...col].reduce((sum, ch) => sum * 26 + ch.charCodeAt(0) - 64, 0);
}

function colName(num) {
  let out = "";
  while (num > 0) {
    const rem = (num - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    num = Math.floor((num - 1) / 26);
  }
  return out || "A";
}
