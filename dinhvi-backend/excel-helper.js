import { DOMParser } from 'xmldom';

const BATCH_SIZE = 500;

export function looksLikeZip(buffer) {
  const bytes = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 4));
  return bytes[0] === 0x50 && bytes[1] === 0x4b;
}

export async function mergeExcelBuffers(buffers) {
  if (buffers.length === 0) return null;
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
  return Array.from(doc.getElementsByTagName("row")).map((rowEl) => ({
    cells: Array.from(rowEl.getElementsByTagName("c")).map((cellEl) => readCell(cellEl, workbook.sharedStrings)),
  }));
}

function readCell(cellEl, sharedStrings) {
  const ref = cellEl.getAttribute("r") || "";
  const col = ref.replace(/[0-9]/g, "") || "A";
  const style = cellEl.getAttribute("s") || "";
  const type = cellEl.getAttribute("t") || "";
  const raw = cellEl.getElementsByTagName("v")[0]?.textContent || "";
  
  // Handle inline string
  let inline = "";
  const isEl = cellEl.getElementsByTagName("is")[0];
  if (isEl) {
    inline = Array.from(isEl.getElementsByTagName("t")).map((node) => node.textContent).join("");
  }

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
  return Array.from(doc.getElementsByTagName("si")).map((si) => 
    Array.from(si.getElementsByTagName("t")).map((t) => t.textContent).join("")
  );
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
  const rows = Array.from(doc.getElementsByTagName("tr"));
  return rows.map((row) => ({
    cells: Array.from(row.querySelectorAll("th,td")).map((cell, index) => ({
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

/**
 * Parses a merged Excel (either zip-xlsx or html-xls) and returns a list of items.
 * Each item has: trackingCode, data (object of headers to values)
 */
export async function parseExcelData(buffer, isXlsx) {
  let rows = [];
  if (isXlsx) {
    const workbook = await readXlsx(buffer);
    rows = extractRows(workbook).map(r => r.cells.map(c => c.value));
  } else {
    const html = decodeExcelBytes(buffer);
    rows = extractHtmlRows(html).map(r => r.cells.map(c => c.value));
  }

  if (rows.length === 0) return [];

  // Find header row and data rows
  // Header row is usually the one containing "Số hiệu" or "Mã bưu gửi" or "STT"
  let headerIndex = -1;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const rowStr = rows[i].map(c => String(c || '').toLowerCase()).join('|');
    if (rowStr.includes('số hiệu') || rowStr.includes('mã bưu gửi') || rowStr.includes('mã gửi') || rowStr.includes('stt')) {
      headerIndex = i;
      break;
    }
  }

  // Fallback header
  const headers = headerIndex !== -1 
    ? rows[headerIndex].map(h => String(h || '').trim())
    : rows[0].map((_, idx) => `Cột ${idx + 1}`);

  const startRow = headerIndex !== -1 ? headerIndex + 1 : 0;
  const items = [];
  const trackingPattern = /^[A-Z]{2}\d{9}[A-Z]{2}$/i;

  for (let i = startRow; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    // Detect tracking code in this row
    let trackingCode = null;
    for (const cell of row) {
      const valStr = String(cell || '').trim();
      if (trackingPattern.test(valStr)) {
        trackingCode = valStr.toUpperCase();
        break;
      }
    }

    if (!trackingCode) continue; // Skip non-data rows (signatures, summary labels, empty rows)

    // Build row object mapping headers to values
    const dataObj = {};
    headers.forEach((header, idx) => {
      const hName = header || `Cột ${idx + 1}`;
      dataObj[hName] = String(row[idx] || '').trim();
    });

    items.push({
      trackingCode,
      data: dataObj
    });
  }

  return items;
}
