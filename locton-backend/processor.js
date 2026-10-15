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
 * Kiểm tra mã bưu cục trong Vị trí cuối cùng có đầu 2 số là 64, 67, 80 hay không.
 */
export function hasTargetBcPrefix(vt) {
  if (!vt) return false;
  const s = String(vt).trim();
  // 1. Bắt đầu bằng 64, 67 hoặc 80 (vd: "670000", "641190 - Gia Nghĩa", "800000")
  if (/^(64|67|80)/.test(s)) return true;
  // 2. Chứa mã bưu cục (2-6 chữ số) có tiền tố 64, 67, 80 sau ký tự phân cách (vd: "BCKT (670000)", "Bưu điện 641190")
  if (/(?:^|[^\d])(64|67|80)(?:\d{4}|\d{2}|[^\d]|$)/.test(s)) return true;
  return false;
}

/**
 * Kiểm tra trạng thái có phải là "[BĐ8]Đã xác nhận đi" hoặc "Đã đóng chuyến thư đi"
 */
export function isSpecialTransitStatus(status) {
  if (!status) return false;
  const s = String(status).trim();
  const lower = s.toLowerCase();
  if (s.includes('[BĐ8]Đã xác nhận đi') || s.includes('Đã xác nhận đi') || lower.includes('đã xác nhận đi') || lower.includes('da xac nhan di')) {
    return true;
  }
  if (s.includes('Đã đóng chuyến thư đi') || lower.includes('đã đóng chuyến thư đi') || lower.includes('da dong chuyen thu di')) {
    return true;
  }
  return false;
}

/**
 * Quyết định bưu gửi có bị loại trừ (vào Bảng 2) hay giữ lại hàng tồn (Bảng 1).
 * Đối với "[BĐ8]Đã xác nhận đi" hoặc "Đã đóng chuyến thư đi":
 * - Vị trí cuối cùng ở bc có đầu 2 số 64, 67, 80 -> giữ lại hàng tồn (Bảng 1).
 * - Nếu không có -> vào bảng bg trạng thái khác (Bảng 2).
 */
export function shouldExcludeItem(status, location) {
  if (isSpecialTransitStatus(status)) {
    if (hasTargetBcPrefix(location)) {
      return false; // Hàng tồn -> Bảng 1
    }
    return true; // Trạng thái khác -> Bảng 2
  }
  return isExcludedStatus(status);
}

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

  // 2. Tạo Map ánh xạ dinh_vi: Số hiệu BG -> { tt, vt }
  const dinhViMap = new Map();

  if (dinhViBufferOrData instanceof Map) {
    for (const [k, v] of dinhViBufferOrData.entries()) {
      if (typeof v === 'object' && v !== null) {
        dinhViMap.set(String(k).trim(), {
          tt: String(v.tt || v.trangThai || v['Trạng thái cuối cùng'] || '').trim(),
          vt: String(v.vt || v.viTri || v['Vị trí cuối cùng'] || '').trim()
        });
      } else {
        dinhViMap.set(String(k).trim(), { tt: String(v).trim(), vt: '' });
      }
    }
  } else if (dinhViBufferOrData && typeof dinhViBufferOrData === 'object' && !Buffer.isBuffer(dinhViBufferOrData)) {
    for (const [k, v] of Object.entries(dinhViBufferOrData)) {
      if (typeof v === 'object' && v !== null) {
        dinhViMap.set(String(k).trim(), {
          tt: String(v.tt || v.trangThai || v['Trạng thái cuối cùng'] || '').trim(),
          vt: String(v.vt || v.viTri || v['Vị trí cuối cùng'] || '').trim()
        });
      } else {
        dinhViMap.set(String(k).trim(), { tt: String(v).trim(), vt: '' });
      }
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
      
      let colSoHieu = 1;      // Cột B
      let colTrangThai = 24;  // Cột Y
      let colViTri = 23;      // Cột X
      let dataStartRow = 2;   // Dòng 3

      // Quét tự động header từ dòng 0 đến dòng 4
      for (let r = range.s.r; r <= Math.min(range.s.r + 4, range.e.r); r++) {
        for (let c = range.s.c; c <= range.e.c; c++) {
          const cell = wsDinhVi[XLSX.utils.encode_cell({ r, c })];
          if (cell && cell.v !== undefined && cell.v !== null) {
            const val = String(cell.v).trim().toLowerCase();
            if (val.includes('trạng thái cuối cùng') || val.includes('trang thai cuoi cung')) {
              colTrangThai = c;
              dataStartRow = Math.max(dataStartRow, r + 1);
            } else if (
              val.includes('vị trí cuối cùng') || val.includes('vi tri cuoi cung') ||
              val.includes('bưu cục phát hiện tại') || val.includes('đơn vị cuối cùng') ||
              val.startsWith('vị trí') || val.startsWith('vi tri')
            ) {
              colViTri = c;
              dataStartRow = Math.max(dataStartRow, r + 1);
            } else if ((val === 'số hiệu' || val === 'so hieu' || val.includes('mã bưu gửi') || val.includes('itemcode') || val === 'số hiệu bưu gửi') && !val.includes('khách hàng')) {
              colSoHieu = c;
              dataStartRow = Math.max(dataStartRow, r + 1);
            }
          }
        }
      }

      for (let r = dataStartRow; r <= range.e.r; r++) {
        const cellB = wsDinhVi[XLSX.utils.encode_cell({ r, c: colSoHieu })];
        if (cellB && cellB.v) {
          const soHieu = String(cellB.v).trim();
          if (!soHieu) continue;

          const cellTT = wsDinhVi[XLSX.utils.encode_cell({ r, c: colTrangThai })];
          const ttCuoiCung = cellTT && cellTT.v !== undefined && cellTT.v !== null ? String(cellTT.v).trim() : '';

          const cellVT = wsDinhVi[XLSX.utils.encode_cell({ r, c: colViTri })];
          const vtCuoiCung = cellVT && cellVT.v !== undefined && cellVT.v !== null ? String(cellVT.v).trim() : '';

          dinhViMap.set(soHieu, {
            tt: ttCuoiCung,
            vt: vtCuoiCung
          });
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

    const dvInfo = dinhViMap.get(maBG);
    let ttcc = '';
    let vtcc = '';
    if (typeof dvInfo === 'object' && dvInfo !== null) {
      ttcc = dvInfo.tt || dvInfo.trangThai || '';
      vtcc = dvInfo.vt || dvInfo.viTri || '';
    } else {
      ttcc = String(dvInfo || '').trim();
    }

    const codVal = Number(getVal(item, ['COD', 'cod_amount', 'Tiền COD', 'CODAmount'], 0)) || 0;
    const trongLuongVal = Number(getVal(item, ['Trọng lượng', 'weight', 'TL', 'TL_2'], 0)) || 0;

    const rowData = {
      'Mã bưu gửi': maBG,
      'Mã bưu cục': String(getVal(item, ['Mã bưu cục', 'POSCode', 'pos_code', 'MaBC'], '')).trim(),
      'Bưu cục Phát': String(getVal(item, ['Bưu cục Phát', 'POSName', 'pos_name', 'TenBC'], '')).trim(),
      'DK1': String(getVal(item, ['DK1', 'dk1'], '')).trim(),
      'Thời gian tồn': String(getVal(item, ['Thời gian tồn', 'loai_ton', 'PTC Category_Ngay_'], '')).trim(),
      'Trạng thái cuối cùng': ttcc,
      'Vị trí cuối cùng': vtcc,
      'Nhóm KH': String(getVal(item, ['Nhóm KH', 'nhom_kh', 'Nhóm_KH'], '')).trim(),
      'Bưu tá': String(getVal(item, ['Bưu tá', 'postman_name', 'PostManName'], '')).trim(),
      'COD': codVal,
      'Trọng lượng': trongLuongVal,
      'Thời gian quét': String(getVal(item, ['Thời gian quét', 'updated_at', 'NgayGioQuet'], '')).trim()
    };

    if (shouldExcludeItem(ttcc, vtcc)) {
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
