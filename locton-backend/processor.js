import * as XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadConfig() {
  const possiblePaths = [
    path.join(__dirname, 'config.json'),
    path.join(__dirname, '../config.json')
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      try {
        const raw = fs.readFileSync(p, 'utf-8');
        return JSON.parse(raw);
      } catch (err) {
        console.warn('Không thể đọc config từ:', p, err);
      }
    }
  }
  return {
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
    excludeBC: [
      '640000',
      '641190',
      '641430',
      '670000',
      '671040',
      '671640',
      '673300',
      '674169',
      '674790'
    ]
  };
}

const config = loadConfig();
export const EXCLUDE_STATUSES = new Set((config.excludeStatuses || []).map(s => String(s).trim()));
export const EXCLUDE_BC = new Set((config.excludeBC || []).map(b => String(b).trim()));

/**
 * Kiểm tra trạng thái có thuộc danh sách loại trừ (chuyển sang Bảng 2) hay không.
 */
export function isExcludedStatus(status) {
  if (!status) return false;
  const s = String(status).trim();
  if (EXCLUDE_STATUSES.has(s)) return true;

  const lower = s.toLowerCase();
  // Loại trừ "Phát thành công" / "Đã phát thành công", nhưng KHÔNG loại trừ "Phát không thành công"
  if (lower.includes('phát thành công') && !lower.includes('không')) {
    return true;
  }

  // Loại trừ các trạng thái đã thu tiền khách hàng / bưu tá
  if (lower.includes('thu tiền khách hàng') || lower.includes('thu tiền bưu tá')) {
    return true;
  }

  return false;
}

/**
 * Helper tìm giá trị của key theo danh sách tên cột có thể có
 */
function getVal(row, candidates, def = '') {
  for (const c of candidates) {
    if (row[c] !== undefined && row[c] !== null && String(row[c]).trim() !== '') {
      return row[c];
    }
  }
  return def;
}

/**
 * Xử lý dữ liệu từ buffer của 2 file Excel
 */
export function processExcelFiles(hangtonBuffer, dinhViBufferOrData) {
  // 1. Đọc file hangton.xlsx (header ở dòng 1)
  const wbHangton = XLSX.read(hangtonBuffer, { 
    type: 'buffer',
    cellFormula: false,
    cellHTML: false,
    cellNF: false,
    cellStyles: false
  });
  const sheetNameHangton = wbHangton.SheetNames[0];
  const wsHangton = wbHangton.Sheets[sheetNameHangton];
  const hangtonRows = XLSX.utils.sheet_to_json(wsHangton, { defval: '' });

  // 2. Tạo Map ánh xạ dinh_vi: Số hiệu BG -> Trạng thái cuối cùng
  const dinhViMap = new Map();

  if (dinhViBufferOrData instanceof Map) {
    for (const [k, v] of dinhViBufferOrData.entries()) {
      dinhViMap.set(String(k).trim(), String(v).trim());
    }
  } else if (dinhViBufferOrData && typeof dinhViBufferOrData === 'object' && !Buffer.isBuffer(dinhViBufferOrData)) {
    for (const [k, v] of Object.entries(dinhViBufferOrData)) {
      dinhViMap.set(String(k).trim(), String(v).trim());
    }
  } else if (dinhViBufferOrData) {
    // Đọc buffer tối ưu
    const wbDinhVi = XLSX.read(dinhViBufferOrData, { 
      type: 'buffer', 
      cellFormula: false,
      cellHTML: false,
      cellNF: false,
      cellStyles: false,
      cellText: false
    });
    const wsDinhVi = wbDinhVi.Sheets['DanhSach'] || wbDinhVi.Sheets[wbDinhVi.SheetNames[0]];
    if (wsDinhVi && wsDinhVi['!ref']) {
      const range = XLSX.utils.decode_range(wsDinhVi['!ref']);
      // Duyệt trực tiếp qua cột B (index 1: Số hiệu BG) và cột Y (index 24: Trạng thái cuối cùng)
      for (let r = 2; r <= range.e.r; r++) {
        const cellB = wsDinhVi[XLSX.utils.encode_cell({ r, c: 1 })];
        if (cellB && cellB.v) {
          const soHieu = String(cellB.v).trim();
          const cellY = wsDinhVi[XLSX.utils.encode_cell({ r, c: 24 })];
          const ttCuoiCung = cellY && cellY.v !== undefined && cellY.v !== null ? String(cellY.v).trim() : '';
          dinhViMap.set(soHieu, ttCuoiCung);
        }
      }
    }
  }

  // 3. Thực hiện INNER JOIN và tách thành 2 bảng
  const bang1 = []; // Danh sách bưu gửi tồn (Chưa phát thành công)
  const bang2 = []; // Danh sách bg trạng thái khác (Đã phát/loại trừ)

  for (const item of hangtonRows) {
    const rawMaBG = getVal(item, ['Mã bưu gửi', 'Số hiệu bưu gửi', 'ItemCode', 'item_code', 'MaBG']);
    const maBG = rawMaBG ? String(rawMaBG).trim() : '';
    if (!maBG || !dinhViMap.has(maBG)) {
      continue;
    }

    const ttcc = dinhViMap.get(maBG);
    const codVal = Number(getVal(item, ['COD', 'cod_amount', 'Tiền COD', 'CODAmount'], 0)) || 0;
    const trongLuongVal = Number(getVal(item, ['Trọng lượng', 'weight', 'TL', 'TL_2'], 0)) || 0;

    const rowData = {
      'Mã bưu gửi': maBG,
      'Mã bưu cục': String(getVal(item, ['Mã bưu cục', 'POSCode', 'pos_code', 'MaBC'], '')).trim(),
      'Bưu cục Phát': String(getVal(item, ['Bưu cục Phát', 'POSName', 'pos_name', 'TenBC'], '')).trim(),
      'DK1': String(getVal(item, ['DK1', 'dk1'], '')).trim(),
      'Thời gian tồn': String(getVal(item, ['Thời gian tồn', 'loai_ton', 'PTC Category_Ngay_'], '')).trim(),
      'Trạng thái cuối cùng': ttcc,
      'Nhóm KH': String(getVal(item, ['Nhóm KH', 'nhom_kh', 'Nhóm_KH'], '')).trim(),
      'Bưu tá': String(getVal(item, ['Bưu tá', 'postman_name', 'PostManName'], '')).trim(),
      'COD': codVal,
      'Trọng lượng': trongLuongVal,
      'Thời gian quét': String(getVal(item, ['Thời gian quét', 'updated_at', 'NgayGioQuet'], '')).trim()
    };

    if (isExcludedStatus(ttcc)) {
      bang2.push(rowData);
    } else {
      bang1.push(rowData);
    }
  }

  // 4. Tổng hợp Bảng 3: "Tổng tồn các BC" từ Bảng 1
  const groups = new Map();

  for (const row of bang1) {
    const maBC = row['Mã bưu cục'];
    if (EXCLUDE_BC.has(maBC)) {
      continue;
    }

    const bcPhat = row['Bưu cục Phát'] || 'Chưa xác định';
    const key = `${maBC}___${bcPhat}`;

    if (!groups.has(key)) {
      groups.set(key, {
        'Mã bưu cục': maBC,
        'Bưu cục Phát': bcPhat,
        'SL Tồn 3N': 0,
        'Tiền COD 3N': 0,
        'SL Tồn 5N': 0,
        'Tiền COD 5N': 0,
        'SL Tồn 7N': 0,
        'Tiền COD 7N': 0,
        'SL Tồn 14N': 0,
        'Tiền COD 14N': 0,
        'Tổng tồn': 0,
        'Tổng tiền COD': 0
      });
    }

    const g = groups.get(key);
    const tgt = row['Thời gian tồn'];
    const cod = row['COD'];

    if (tgt === '≥3 ngày') {
      g['SL Tồn 3N'] += 1;
      g['Tiền COD 3N'] += cod;
    } else if (tgt === '≥5 ngày') {
      g['SL Tồn 5N'] += 1;
      g['Tiền COD 5N'] += cod;
    } else if (tgt === '≥7 ngày') {
      g['SL Tồn 7N'] += 1;
      g['Tiền COD 7N'] += cod;
    } else if (tgt === '≥14 ngày') {
      g['SL Tồn 14N'] += 1;
      g['Tiền COD 14N'] += cod;
    }

    g['Tổng tồn'] += 1;
    g['Tổng tiền COD'] += cod;
  }

  const bang3List = Array.from(groups.values());

  // Sắp xếp giảm dần theo Tổng tồn
  bang3List.sort((a, b) => b['Tổng tồn'] - a['Tổng tồn']);

  // Dòng tổng toàn bộ: Mã bưu cục "67", Bưu cục Phát "Lâm Đồng"
  const rowTongLamDong = {
    'Mã bưu cục': '67',
    'Bưu cục Phát': 'Lâm Đồng',
    'SL Tồn 3N': 0,
    'Tiền COD 3N': 0,
    'SL Tồn 5N': 0,
    'Tiền COD 5N': 0,
    'SL Tồn 7N': 0,
    'Tiền COD 7N': 0,
    'SL Tồn 14N': 0,
    'Tiền COD 14N': 0,
    'Tổng tồn': 0,
    'Tổng tiền COD': 0
  };

  for (const item of bang3List) {
    rowTongLamDong['SL Tồn 3N'] += item['SL Tồn 3N'];
    rowTongLamDong['Tiền COD 3N'] += item['Tiền COD 3N'];
    rowTongLamDong['SL Tồn 5N'] += item['SL Tồn 5N'];
    rowTongLamDong['Tiền COD 5N'] += item['Tiền COD 5N'];
    rowTongLamDong['SL Tồn 7N'] += item['SL Tồn 7N'];
    rowTongLamDong['Tiền COD 7N'] += item['Tiền COD 7N'];
    rowTongLamDong['SL Tồn 14N'] += item['SL Tồn 14N'];
    rowTongLamDong['Tiền COD 14N'] += item['Tiền COD 14N'];
    rowTongLamDong['Tổng tồn'] += item['Tổng tồn'];
    rowTongLamDong['Tổng tiền COD'] += item['Tổng tiền COD'];
  }

  const bang3 = [rowTongLamDong, ...bang3List];

  return {
    bang1,
    bang2,
    bang3,
    stats: {
      hangtonTotal: hangtonRows.length,
      dinhViTotal: dinhViMap.size,
      bang1Count: bang1.length,
      bang2Count: bang2.length,
      bang3Count: bang3List.length
    }
  };
}

/**
 * Tạo buffer file Excel gồm 3 sheets
 */
export function generateExcelWorkbook(bang1, bang2, bang3) {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Tổng tồn các BC
  const ws3 = XLSX.utils.json_to_sheet(bang3);
  XLSX.utils.book_append_sheet(wb, ws3, 'Tổng tồn các BC');

  // Sheet 2: Danh sách bưu gửi tồn (Bảng 1)
  const ws1 = XLSX.utils.json_to_sheet(bang1);
  XLSX.utils.book_append_sheet(wb, ws1, 'Danh sách bưu gửi tồn');

  // Sheet 3: Danh sách bg trạng thái khác (Bảng 2)
  const ws2 = XLSX.utils.json_to_sheet(bang2);
  XLSX.utils.book_append_sheet(wb, ws2, 'Danh sách bg trạng thái khác');

  // Tối ưu độ rộng cột
  [ws3, ws1, ws2].forEach(ws => {
    if (!ws['!ref']) return;
    const range = XLSX.utils.decode_range(ws['!ref']);
    const colWidths = [];
    for (let C = range.s.c; C <= range.e.c; ++C) {
      colWidths.push({ wch: 18 });
    }
    ws['!cols'] = colWidths;
  });

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

export const processFiles = processExcelFiles;
