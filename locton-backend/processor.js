import * as XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEFAULT_CONFIG = {
  excludeStatuses: [
    '[BĐ8]Đã tới bưu cục nhận',
    '[BĐ8]Đã xác nhận đi',
    'Đã đóng chuyến thư đi',
    'Đã thu tiền khách hàng',
    'Đã thu tiền khách hàng (QR)',
    'Đã thu tiền bưu tá',
    'Mất bưu gửi',
    'Đã phát thành công',
    'Phát thành công',
    'Trả tiền cho người gửi',
    'Đã trả tiền'
  ],
  excludeBC: ['640000', '641190', '641430', '670000', '671040', '671640', '673300', '674169', '674790']
};

const TARGET_LOCATIONS = [
  'lam dong', 'da lat', 'bao loc', 'duc trong', 'di linh', 'don duong',
  'lam ha', 'bao lam', 'cat tien', 'da huoai', 'da teh', 'dam rong',
  'dak nong', 'dac nong', 'gia nghia', 'dak r lap', 'dak mil', 'cu jut', 'krong no',
  'binh thuan', 'phan thiet', 'la gi', 'ham thuan', 'bac binh', 'tuy phong'
];

const STATUS_KEYWORDS = [
  'phát thành công', 'phat thanh cong', 'chưa phát', 'chua phat',
  'phát không thành công', 'phat khong thanh cong', 'xác nhận đi', 'xac nhan di',
  'đóng chuyến thư', 'dong chuyen thu', 'chuyến thư đi', 'chuyen thu di',
  'tới bưu cục nhận', 'toi buu cuc nhan', 'đến bưu cục', 'den buu cuc',
  'giao bưu tá', 'giao buu ta', 'thu tiền', 'thu tien', 'chuyển tiếp', 'chuyen tiep',
  'nhập khai thác', 'nhap khai thac', 'xuất khai thác', 'xuat khai thac',
  'mất bưu gửi', 'mat buu gui', 'trả tiền', 'tra tien', 'từ chối nhận', 'tu choi nhan',
  'lưu kho', 'luu kho', 'hẹn phát', 'hen phat', 'chờ phát', 'cho phat',
  'chờ xử lý', 'cho xu ly', 'đang phát', 'dang phat', 'chuyển hoàn', 'chuyen hoan',
  'kết thúc', 'ket thuc', 'hủy', 'huy'
];

const AGE_BUCKETS = {
  '≥3 ngày': ['SL Tồn 3N', 'Tiền COD 3N'],
  '≥5 ngày': ['SL Tồn 5N', 'Tiền COD 5N'],
  '≥7 ngày': ['SL Tồn 7N', 'Tiền COD 7N'],
  '≥14 ngày': ['SL Tồn 14N', 'Tiền COD 14N']
};

const SUMMARY_NUMERIC_FIELDS = [
  'SL Tồn 3N', 'Tiền COD 3N', 'SL Tồn 5N', 'Tiền COD 5N',
  'SL Tồn 7N', 'Tiền COD 7N', 'SL Tồn 14N', 'Tiền COD 14N',
  'Tổng tồn', 'Tổng tiền COD'
];

function loadConfig() {
  for (const p of [path.join(__dirname, 'config.json'), path.join(__dirname, '../config.json')]) {
    if (fs.existsSync(p)) {
      try {
        return JSON.parse(fs.readFileSync(p, 'utf-8'));
      } catch (err) {
        console.warn('Không thể đọc config từ:', p, err);
      }
    }
  }
  return DEFAULT_CONFIG;
}

const config = loadConfig();
export const EXCLUDE_STATUSES = new Set((config.excludeStatuses || []).map(s => String(s).trim()));
export const EXCLUDE_BC = new Set((config.excludeBC || []).map(b => String(b).trim()));

export function getThoiGianTonWeight(tg) {
  if (!tg) return 0;
  const s = String(tg).toLowerCase();
  if (s.includes('14')) return 14;
  if (s.includes('7')) return 7;
  if (s.includes('5')) return 5;
  if (s.includes('3')) return 3;
  const match = s.match(/\d+/);
  return match ? parseInt(match[0], 10) : 0;
}

export function sortLoctonRows(rows) {
  return [...rows].sort((a, b) => {
    const tgDiff = getThoiGianTonWeight(b['Thời gian tồn']) - getThoiGianTonWeight(a['Thời gian tồn']);
    if (tgDiff !== 0) return tgDiff;
    const codDiff = Number(b['COD'] || b['Tiền COD'] || 0) - Number(a['COD'] || a['Tiền COD'] || 0);
    if (codDiff !== 0) return codDiff;
    const bcA = String(a['Mã bưu cục'] || a['Mã BC phát'] || a['Mã BC'] || '');
    const bcB = String(b['Mã bưu cục'] || b['Mã BC phát'] || b['Mã BC'] || '');
    return bcB.localeCompare(bcA, undefined, { numeric: true });
  });
}

export function hasTargetBcPrefix(vt) {
  if (!vt) return false;
  const s = String(vt).trim();
  if (/^(64|67|80)/.test(s) || /(?:^|[^\d])(64|67|80)(?:\d{4}|\d{2}|[^\d]|$)/.test(s)) return true;
  const norm = s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
  return TARGET_LOCATIONS.some(loc => norm.includes(loc));
}

export function isSpecialTransitStatus(status) {
  if (!status) return false;
  const s = String(status).trim().toLowerCase();
  return s.includes('xác nhận đi') || s.includes('xac nhan di') || s.includes('đóng chuyến thư') || s.includes('dong chuyen thu');
}

export function isExcludedStatus(status) {
  if (!status) return false;
  const s = String(status).trim();
  if (EXCLUDE_STATUSES.has(s)) return true;
  const lower = s.toLowerCase();
  if (lower.includes('phát thành công') && !lower.includes('không')) return true;
  return lower.includes('thu tiền khách hàng') || lower.includes('thu tiền bưu tá');
}

export function shouldExcludeItem(status, location) {
  if (isSpecialTransitStatus(status)) return !hasTargetBcPrefix(location);
  return isExcludedStatus(status);
}

export function isKnownVnpostStatus(text) {
  if (!text || typeof text !== 'string') return false;
  const s = text.trim().toLowerCase();
  return s.length >= 3 && s.length <= 100 && STATUS_KEYWORDS.some(kw => s.includes(kw));
}

function getVal(row, candidates, def = '') {
  for (const c of candidates) {
    if (row[c] !== undefined && row[c] !== null && String(row[c]).trim() !== '') return row[c];
  }
  return def;
}

function findColumnByPriority(headerRow, matchers, fallback) {
  for (const matchFn of matchers) {
    const idx = headerRow.findIndex(cell => matchFn(String(cell || '').trim().toLowerCase()));
    if (idx !== -1) return idx;
  }
  return fallback;
}

export function extractPostmanFromBcPhat(text) {
  if (!text) return '';
  const m = String(text).match(/(?:Bưu|Buu)\s*(?:tá|ta)\s*:\s*(.*?)(?:\.\s*[ĐÐD]T\s*:|[ĐÐD]T\s*:|$)/i);
  return m ? m[1].replace(/\.+$/, '').trim() : '';
}

function findBcPhatCol(hRow, subRow, colSoHieu, colTrangThai) {
  const norm = cell => String(cell || '').trim().toLowerCase();
  const isBcPhat = s => s.includes('bưu cục phát') || s.includes('buu cuc phat');
  const hasSubHeader = subRow.length > 0 && !norm(subRow[colSoHieu]);

  const kqIdx = hRow.findIndex(c => {
    const s = norm(c);
    return s.includes('kết quả hiện tại') || s.includes('ket qua hien tai');
  });
  if (kqIdx !== -1 && hasSubHeader) {
    for (let c = kqIdx; c < subRow.length; c++) {
      if (c > kqIdx && norm(hRow[c]) !== '') break;
      if (isBcPhat(norm(subRow[c]))) return c;
    }
  }
  for (const row of hasSubHeader ? [subRow, hRow] : [hRow]) {
    for (let c = row.length - 1; c >= 0; c--) {
      if (isBcPhat(norm(row[c]))) return c;
    }
  }
  return colTrangThai > 0 ? colTrangThai - 1 : 23;
}

function parseDinhViInput(dinhViBufferOrData) {
  const dinhViMap = new Map();
  if (!dinhViBufferOrData) return dinhViMap;

  if (!Buffer.isBuffer(dinhViBufferOrData) && typeof dinhViBufferOrData === 'object') {
    const entries = dinhViBufferOrData instanceof Map ? dinhViBufferOrData.entries() : Object.entries(dinhViBufferOrData);
    for (const [k, v] of entries) {
      dinhViMap.set(
        String(k).trim(),
        v && typeof v === 'object'
          ? {
              tt: String(v.tt || v.trangThai || v['Trạng thái cuối cùng'] || '').trim(),
              vt: String(v.vt || v.viTri || v['Vị trí cuối cùng'] || '').trim(),
              bt: String(v.bt || v.buuTa || extractPostmanFromBcPhat(v.bcPhat || v['Bưu cục phát'] || '')).trim()
            }
          : { tt: String(v).trim(), vt: '', bt: '' }
      );
    }
    return dinhViMap;
  }

  const wb = XLSX.read(dinhViBufferOrData, { type: 'buffer', cellFormula: false, cellHTML: false, cellNF: false, cellStyles: false });
  const ws = wb.Sheets['DanhSach'] || wb.Sheets[wb.SheetNames[0]];
  if (!ws) return dinhViMap;

  const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const isSoHieuCol = s => (s.includes('số hiệu') || s.includes('so hieu') || s.includes('mã bưu gửi') || s.includes('mã bg') || s.includes('itemcode')) && !s.includes('khách hàng');

  let headerRowIdx = -1;
  for (let r = 0; r < Math.min(15, rawRows.length); r++) {
    if ((rawRows[r] || []).some(cell => isSoHieuCol(String(cell || '').trim().toLowerCase()))) {
      headerRowIdx = r;
      break;
    }
  }

  let colSoHieu = 1;
  let colTrangThai = 24;
  let colViTri = 23;
  let colBcPhat = 23;
  if (headerRowIdx !== -1) {
    const hRow = rawRows[headerRowIdx] || [];
    const subRow = rawRows[headerRowIdx + 1] || [];
    colSoHieu = findColumnByPriority(hRow, [isSoHieuCol], colSoHieu);
    colTrangThai = findColumnByPriority(hRow, [
      s => s.includes('trạng thái cuối cùng') || s.includes('trang thai cuoi cung'),
      s => s.includes('trạng thái hiện tại') || s.includes('trang thai hien tai') || s.includes('tên trạng thái'),
      s => (s.includes('trạng thái') || s.includes('status')) && !s.includes('mã') && !s.includes('code') && !s.includes('ngày') && !s.includes('giờ') && !s.includes('trước')
    ], colTrangThai);
    colViTri = findColumnByPriority(hRow, [
      s => s.includes('vị trí cuối cùng') || s.includes('vi tri cuoi cung'),
      s => s.includes('vị trí hiện tại') || s.includes('vi tri hien tai') || s.includes('bưu cục phát hiện tại') || s.includes('đơn vị cuối cùng') || s.includes('bưu cục cuối cùng'),
      s => (s.startsWith('vị trí') || s.startsWith('vi tri') || s.includes('đơn vị hiện tại')) && !s.includes('mã') && !s.includes('code')
    ], colViTri);
    colBcPhat = findBcPhatCol(hRow, subRow, colSoHieu, colTrangThai);
  }

  for (let r = headerRowIdx !== -1 ? headerRowIdx + 1 : 1; r < rawRows.length; r++) {
    const row = rawRows[r] || [];
    const soHieu = String(row[colSoHieu] || '').trim();
    if (!soHieu) continue;

    let tt = String(row[colTrangThai] || '').trim();
    let vt = String(row[colViTri] || '').trim();
    const bt = extractPostmanFromBcPhat(row[colBcPhat]);

    if (!tt) {
      const scanOrder = [24, 25, 23, 22, 26, 21, ...row.map((_, i) => i)];
      for (const c of scanOrder) {
        if (c < 0 || c >= row.length || c === colSoHieu) continue;
        const cellVal = String(row[c] || '').trim();
        if (isKnownVnpostStatus(cellVal)) {
          tt = cellVal;
          if (!vt && c > 0) {
            const neighbor = String(row[c - 1] || '').trim();
            if (hasTargetBcPrefix(neighbor) || neighbor.length > 3) vt = neighbor;
          }
          break;
        }
      }
    }

    if (!vt) {
      const neighbor = colTrangThai > 0 ? String(row[colTrangThai - 1] || '').trim() : '';
      if (neighbor && (hasTargetBcPrefix(neighbor) || neighbor.length > 3)) vt = neighbor;
      else if (row[23]) vt = String(row[23]).trim();
    }

    dinhViMap.set(soHieu, { tt, vt, bt });
  }
  return dinhViMap;
}

function emptyPosSummary(maBC, bcPhat) {
  const row = { 'Mã bưu cục': maBC, 'Bưu cục Phát': bcPhat };
  for (const field of SUMMARY_NUMERIC_FIELDS) row[field] = 0;
  return row;
}

export function processExcelFiles(hangtonBuffer, dinhViBufferOrData) {
  const wbHangton = XLSX.read(hangtonBuffer, { type: 'buffer', cellFormula: false, cellHTML: false, cellNF: false, cellStyles: false });
  const hangtonRows = XLSX.utils.sheet_to_json(wbHangton.Sheets[wbHangton.SheetNames[0]], { defval: '' });
  const dinhViMap = parseDinhViInput(dinhViBufferOrData);

  const rawBang1 = [];
  const rawBang2 = [];

  for (const item of hangtonRows) {
    const maBG = String(getVal(item, ['Mã bưu gửi', 'Số hiệu bưu gửi', 'ItemCode', 'item_code', 'MaBG'])).trim();
    if (!maBG || !dinhViMap.has(maBG)) continue;

    const dvInfo = dinhViMap.get(maBG);
    const ttcc = dvInfo?.tt || '';
    const vtcc = dvInfo?.vt || '';

    const maBCHangTon = String(getVal(item, ['Mã bưu cục', 'POSCode', 'pos_code', 'MaBC'])).trim();
    const tenBCHangTon = String(getVal(item, ['Bưu cục Phát', 'POSName', 'pos_name', 'TenBC'])).trim();

    let effectiveLocation = vtcc;
    if (!effectiveLocation && hasTargetBcPrefix(maBCHangTon)) {
      effectiveLocation = tenBCHangTon ? `${maBCHangTon} - ${tenBCHangTon}` : maBCHangTon;
    }

    let isExcluded = isExcludedStatus(ttcc);
    let trangThaiLuu = ttcc;
    if (isSpecialTransitStatus(ttcc)) {
      if (hasTargetBcPrefix(effectiveLocation) || hasTargetBcPrefix(vtcc)) {
        isExcluded = false;
        const loc = effectiveLocation || vtcc;
        trangThaiLuu = loc ? `${ttcc} - ${loc}` : ttcc;
      } else {
        isExcluded = true;
        if (vtcc) trangThaiLuu = `${ttcc} - ${vtcc}`;
      }
    }

    const rawBuuTa = String(getVal(item, ['Bưu tá phát', 'Bưu tá', 'postman_name', 'PostManName', 'Người ký nhận', 'Người nhận', 'Nguoi nhan'])).trim();
    const isMissingBuuTa = !rawBuuTa || rawBuuTa === '-' || rawBuuTa.toLowerCase() === 'chưa phân tuyến';
    const buuTaPhat = isMissingBuuTa ? (dvInfo?.bt || rawBuuTa) : rawBuuTa;

    const rowData = {
      'Mã bưu gửi': maBG,
      'Mã bưu cục': maBCHangTon,
      'Bưu cục Phát': tenBCHangTon,
      DK1: String(getVal(item, ['DK1', 'dk1'])).trim(),
      'Thời gian tồn': String(getVal(item, ['Thời gian tồn', 'loai_ton', 'PTC Category_Ngay_'])).trim(),
      'Trạng thái cuối cùng': trangThaiLuu,
      'Vị trí cuối cùng': effectiveLocation || vtcc,
      'Nhóm KH': String(getVal(item, ['Nhóm KH', 'nhom_kh', 'Nhóm_KH'])).trim(),
      'Bưu tá phát': buuTaPhat,
      COD: Number(getVal(item, ['COD', 'cod_amount', 'Tiền COD', 'CODAmount'], 0)) || 0,
      'Trọng lượng': Number(getVal(item, ['Trọng lượng', 'weight', 'TL', 'TL_2'], 0)) || 0,
      'Thời gian quét': String(getVal(item, ['Thời gian quét', 'updated_at', 'NgayGioQuet'])).trim()
    };

    (isExcluded ? rawBang2 : rawBang1).push(rowData);
  }

  const bang1 = sortLoctonRows(rawBang1);
  const bang2 = sortLoctonRows(rawBang2);

  const groups = new Map();
  for (const row of bang1) {
    const maBC = row['Mã bưu cục'];
    if (EXCLUDE_BC.has(maBC)) continue;
    const bcPhat = row['Bưu cục Phát'] || 'Chưa xác định';
    const key = `${maBC}___${bcPhat}`;
    if (!groups.has(key)) groups.set(key, emptyPosSummary(maBC, bcPhat));

    const g = groups.get(key);
    const bucket = AGE_BUCKETS[row['Thời gian tồn']];
    if (bucket) {
      g[bucket[0]] += 1;
      g[bucket[1]] += row['COD'];
    }
    g['Tổng tồn'] += 1;
    g['Tổng tiền COD'] += row['COD'];
  }

  const bang3List = Array.from(groups.values()).sort((a, b) => b['Tổng tồn'] - a['Tổng tồn']);
  const rowTongLamDong = emptyPosSummary('67', 'Lâm Đồng');
  for (const item of bang3List) {
    for (const field of SUMMARY_NUMERIC_FIELDS) rowTongLamDong[field] += item[field];
  }

  return {
    bang1,
    bang2,
    bang3: [rowTongLamDong, ...bang3List],
    stats: {
      hangtonTotal: hangtonRows.length,
      dinhViTotal: dinhViMap.size,
      bang1Count: bang1.length,
      bang2Count: bang2.length,
      bang3Count: bang3List.length
    }
  };
}

export function generateExcelWorkbook(bang1, bang2, bang3) {
  const wb = XLSX.utils.book_new();
  const sheets = [
    ['Tổng tồn các BC', bang3],
    ['Danh sách bưu gửi tồn', bang1],
    ['Danh sách bg trạng thái khác', bang2]
  ];
  for (const [name, data] of sheets) {
    const ws = XLSX.utils.json_to_sheet(data);
    if (ws['!ref']) {
      const range = XLSX.utils.decode_range(ws['!ref']);
      ws['!cols'] = Array.from({ length: range.e.c - range.s.c + 1 }, () => ({ wch: 18 }));
    }
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

export const processFiles = processExcelFiles;
