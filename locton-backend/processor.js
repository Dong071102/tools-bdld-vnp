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
 * Trọng số thời gian tồn để sắp xếp giảm dần (≥14 ngày > ≥7 ngày > ≥5 ngày > ≥3 ngày)
 */
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

/**
 * Sắp xếp danh sách bưu gửi theo thứ tự ưu tiên:
 * 1. Thời gian tồn giảm dần (≥14N > ≥7N > ≥5N > ≥3N)
 * 2. Tiền COD giảm dần
 * 3. Mã bưu cục giảm dần
 */
export function sortLoctonRows(rows) {
  return [...rows].sort((a, b) => {
    // 1. Thời gian tồn giảm dần
    const tgA = getThoiGianTonWeight(a['Thời gian tồn']);
    const tgB = getThoiGianTonWeight(b['Thời gian tồn']);
    if (tgB !== tgA) return tgB - tgA;

    // 2. Tiền COD giảm dần
    const codA = Number(a['COD'] || a['Tiền COD'] || 0);
    const codB = Number(b['COD'] || b['Tiền COD'] || 0);
    if (codB !== codA) return codB - codA;

    // 3. Mã bưu cục giảm dần
    const bcA = String(a['Mã bưu cục'] || a['Mã BC phát'] || a['Mã BC'] || '');
    const bcB = String(b['Mã bưu cục'] || b['Mã BC phát'] || b['Mã BC'] || '');
    return bcB.localeCompare(bcA, undefined, { numeric: true });
  });
}

/**
 * Kiểm tra mã bưu cục trong Vị trí cuối cùng có đầu 2 số là 64, 67, 80 hoặc thuộc địa bàn các tỉnh này
 */
export function hasTargetBcPrefix(vt) {
  if (!vt) return false;
  const s = String(vt).trim();
  // 1. Chứa mã số bắt đầu bằng 64, 67 hoặc 80
  if (/^(64|67|80)/.test(s)) return true;
  if (/(?:^|[^\d])(64|67|80)(?:\d{4}|\d{2}|[^\d]|$)/.test(s)) return true;

  // 2. Chứa tên bưu cục/địa danh thuộc Lâm Đồng (67), Đắk Nông (64), Bình Thuận (80)
  const lower = s.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd');
  const targetLocations = [
    'lam dong', 'da lat', 'bao loc', 'duc trong', 'di linh', 'don duong', 
    'lam ha', 'bao lam', 'cat tien', 'da huoai', 'da teh', 'dam rong',
    'dak nong', 'dac nong', 'gia nghia', 'dak r lap', 'dak mil', 'cu jut', 'krong no',
    'binh thuan', 'phan thiet', 'la gi', 'ham thuan', 'bac binh', 'tuy phong'
  ];
  for (const loc of targetLocations) {
    if (lower.includes(loc)) return true;
  }
  return false;
}

/**
 * Kiểm tra trạng thái có phải là "Đã xác nhận đi" (bao gồm [BĐ8]) hoặc "Đã đóng chuyến thư đi"
 */
export function isSpecialTransitStatus(status) {
  if (!status) return false;
  const s = String(status).trim().toLowerCase();
  return s.includes('xác nhận đi') || s.includes('xac nhan di') || 
         s.includes('đóng chuyến thư') || s.includes('dong chuyen thu');
}

/**
 * Quyết định bưu gửi có bị loại trừ (vào Bảng 2) hay giữ lại hàng tồn (Bảng 1).
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

export function isKnownVnpostStatus(text) {
  if (!text || typeof text !== 'string') return false;
  const s = text.trim().toLowerCase();
  if (s.length < 3 || s.length > 100) return false;
  const statusKeywords = [
    'phát thành công', 'phat thanh cong',
    'chưa phát', 'chua phat',
    'phát không thành công', 'phat khong thanh cong',
    'xác nhận đi', 'xac nhan di',
    'đóng chuyến thư', 'dong chuyen thu',
    'chuyến thư đi', 'chuyen thu di',
    'tới bưu cục nhận', 'toi buu cuc nhan',
    'đến bưu cục', 'den buu cuc',
    'giao bưu tá', 'giao buu ta',
    'thu tiền', 'thu tien',
    'chuyển tiếp', 'chuyen tiep',
    'nhập khai thác', 'nhap khai thac',
    'xuất khai thác', 'xuat khai thac',
    'mất bưu gửi', 'mat buu gui',
    'trả tiền', 'tra tien',
    'từ chối nhận', 'tu choi nhan',
    'lưu kho', 'luu kho',
    'hẹn phát', 'hen phat',
    'chờ phát', 'cho phat',
    'chờ xử lý', 'cho xu ly',
    'đang phát', 'dang phat',
    'chuyển hoàn', 'chuyen hoan',
    'kết thúc', 'ket thuc',
    'hủy', 'huy'
  ];
  return statusKeywords.some(kw => s.includes(kw));
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
    const wbDinhVi = XLSX.read(dinhViBufferOrData, { 
      type: 'buffer', 
      cellFormula: false,
      cellHTML: false,
      cellNF: false,
      cellStyles: false
    });
    const wsDinhVi = wbDinhVi.Sheets['DanhSach'] || wbDinhVi.Sheets[wbDinhVi.SheetNames[0]];
    if (wsDinhVi) {
      const rawRows = XLSX.utils.sheet_to_json(wsDinhVi, { header: 1, defval: '' });
      let colSoHieu = 1;      // Cột B (mặc định)
      let colTrangThai = 24;  // Cột Y (mặc định)
      let colViTri = 23;      // Cột X (mặc định)
      let headerRowIdx = -1;

      // Quét tìm hàng header thực sự trong 15 dòng đầu tiên
      for (let r = 0; r < Math.min(15, rawRows.length); r++) {
        const row = rawRows[r] || [];
        const isHeader = row.some(cell => {
          const s = String(cell || '').trim().toLowerCase();
          return (s.includes('số hiệu') || s.includes('so hieu') || s.includes('mã bưu gửi') || s.includes('mã bg') || s.includes('itemcode')) && !s.includes('khách hàng');
        });
        if (isHeader) {
          headerRowIdx = r;
          break;
        }
      }

      if (headerRowIdx !== -1) {
        const hRow = rawRows[headerRowIdx] || [];
        // 1. Xác định cột Số hiệu
        for (let c = 0; c < hRow.length; c++) {
          const s = String(hRow[c] || '').trim().toLowerCase();
          if ((s.includes('số hiệu') || s.includes('so hieu') || s.includes('mã bưu gửi') || s.includes('mã bg') || s.includes('itemcode')) && !s.includes('khách hàng')) {
            colSoHieu = c;
            break;
          }
        }

        // 2. Xác định cột Trạng thái cuối cùng (theo thứ tự ưu tiên)
        let foundTT = false;
        for (let c = 0; c < hRow.length; c++) {
          const s = String(hRow[c] || '').trim().toLowerCase();
          if (s.includes('trạng thái cuối cùng') || s.includes('trang thai cuoi cung')) {
            colTrangThai = c;
            foundTT = true;
            break;
          }
        }
        if (!foundTT) {
          for (let c = 0; c < hRow.length; c++) {
            const s = String(hRow[c] || '').trim().toLowerCase();
            if (s.includes('trạng thái hiện tại') || s.includes('trang thai hien tai') || s.includes('tên trạng thái')) {
              colTrangThai = c;
              foundTT = true;
              break;
            }
          }
        }
        if (!foundTT) {
          for (let c = 0; c < hRow.length; c++) {
            const s = String(hRow[c] || '').trim().toLowerCase();
            if ((s.includes('trạng thái') || s.includes('status')) && !s.includes('mã') && !s.includes('code') && !s.includes('ngày') && !s.includes('giờ') && !s.includes('trước')) {
              colTrangThai = c;
              foundTT = true;
              break;
            }
          }
        }

        // 3. Xác định cột Vị trí cuối cùng (theo thứ tự ưu tiên)
        let foundVT = false;
        for (let c = 0; c < hRow.length; c++) {
          const s = String(hRow[c] || '').trim().toLowerCase();
          if (s.includes('vị trí cuối cùng') || s.includes('vi tri cuoi cung')) {
            colViTri = c;
            foundVT = true;
            break;
          }
        }
        if (!foundVT) {
          for (let c = 0; c < hRow.length; c++) {
            const s = String(hRow[c] || '').trim().toLowerCase();
            if (s.includes('vị trí hiện tại') || s.includes('vi tri hien tai') || s.includes('bưu cục phát hiện tại') || s.includes('đơn vị cuối cùng') || s.includes('bưu cục cuối cùng')) {
              colViTri = c;
              foundVT = true;
              break;
            }
          }
        }
        if (!foundVT) {
          for (let c = 0; c < hRow.length; c++) {
            const s = String(hRow[c] || '').trim().toLowerCase();
            if ((s.startsWith('vị trí') || s.startsWith('vi tri') || s.includes('đơn vị hiện tại')) && !s.includes('mã') && !s.includes('code')) {
              colViTri = c;
              foundVT = true;
              break;
            }
          }
        }
      }

      const dataStartRow = headerRowIdx !== -1 ? headerRowIdx + 1 : 1;

      for (let r = dataStartRow; r < rawRows.length; r++) {
        const row = rawRows[r] || [];
        const soHieu = String(row[colSoHieu] || '').trim();
        if (!soHieu) continue;

        let ttCuoiCung = String(row[colTrangThai] || '').trim();
        let vtCuoiCung = String(row[colViTri] || '').trim();

        // Fallback 1: Nếu tt rỗng, kiểm tra các cột ứng viên chuẩn
        if (!ttCuoiCung) {
          const candidates = [24, 25, 23, 22, 26, 21];
          for (const c of candidates) {
            if (c < row.length && c !== colSoHieu) {
              const cellVal = String(row[c] || '').trim();
              if (isKnownVnpostStatus(cellVal)) {
                ttCuoiCung = cellVal;
                if (!vtCuoiCung && c > 0) {
                  vtCuoiCung = String(row[c - 1] || '').trim();
                }
                break;
              }
            }
          }
        }

        // Fallback 2: Quét tất cả các ô trong dòng tìm trạng thái VNPost
        if (!ttCuoiCung) {
          for (let c = 0; c < row.length; c++) {
            if (c === colSoHieu) continue;
            const cellVal = String(row[c] || '').trim();
            if (isKnownVnpostStatus(cellVal)) {
              ttCuoiCung = cellVal;
              if (!vtCuoiCung && c > 0) {
                const neighbor = String(row[c - 1] || '').trim();
                if (hasTargetBcPrefix(neighbor) || neighbor.length > 3) {
                  vtCuoiCung = neighbor;
                }
              }
              break;
            }
          }
        }

        // Fallback cho vị trí
        if (!vtCuoiCung) {
          if (colTrangThai > 0 && row[colTrangThai - 1]) {
            const neighbor = String(row[colTrangThai - 1]).trim();
            if (hasTargetBcPrefix(neighbor) || neighbor.length > 3) {
              vtCuoiCung = neighbor;
            }
          } else if (row[23]) {
            vtCuoiCung = String(row[23]).trim();
          }
        }

        dinhViMap.set(soHieu, {
          tt: ttCuoiCung,
          vt: vtCuoiCung
        });
      }
    }
  }

  // 3. Thực hiện INNER JOIN và tách thành 2 bảng
  let rawBang1 = []; // Danh sách bưu gửi tồn (Chưa phát thành công)
  let rawBang2 = []; // Danh sách bg trạng thái khác (Đã phát/loại trừ)

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

    const maBCHangTon = String(getVal(item, ['Mã bưu cục', 'POSCode', 'pos_code', 'MaBC'], '')).trim();
    const tenBCHangTon = String(getVal(item, ['Bưu cục Phát', 'POSName', 'pos_name', 'TenBC'], '')).trim();

    // Xác định vị trí hiệu lực
    let effectiveLocation = vtcc;
    if (!effectiveLocation && hasTargetBcPrefix(maBCHangTon)) {
      effectiveLocation = tenBCHangTon ? `${maBCHangTon} - ${tenBCHangTon}` : maBCHangTon;
    }

    let isExcluded = isExcludedStatus(ttcc);
    let trangThaiLuu = ttcc;

    if (isSpecialTransitStatus(ttcc)) {
      if (hasTargetBcPrefix(effectiveLocation) || hasTargetBcPrefix(vtcc)) {
        isExcluded = false; // Bảng 1 (Hàng tồn)
        const loc = effectiveLocation || vtcc;
        trangThaiLuu = loc ? `${ttcc} - ${loc}` : ttcc;
      } else {
        isExcluded = true; // Bảng 2 (Trạng thái khác)
        if (vtcc) {
          trangThaiLuu = `${ttcc} - ${vtcc}`;
        }
      }
    }

    const codVal = Number(getVal(item, ['COD', 'cod_amount', 'Tiền COD', 'CODAmount'], 0)) || 0;
    const trongLuongVal = Number(getVal(item, ['Trọng lượng', 'weight', 'TL', 'TL_2'], 0)) || 0;

    const rowData = {
      'Mã bưu gửi': maBG,
      'Mã bưu cục': maBCHangTon,
      'Bưu cục Phát': tenBCHangTon,
      'DK1': String(getVal(item, ['DK1', 'dk1'], '')).trim(),
      'Thời gian tồn': String(getVal(item, ['Thời gian tồn', 'loai_ton', 'PTC Category_Ngay_'], '')).trim(),
      'Trạng thái cuối cùng': trangThaiLuu,
      'Vị trí cuối cùng': effectiveLocation || vtcc,
      'Nhóm KH': String(getVal(item, ['Nhóm KH', 'nhom_kh', 'Nhóm_KH'], '')).trim(),
      'Bưu tá': String(getVal(item, ['Bưu tá', 'postman_name', 'PostManName'], '')).trim(),
      'COD': codVal,
      'Trọng lượng': trongLuongVal,
      'Thời gian quét': String(getVal(item, ['Thời gian quét', 'updated_at', 'NgayGioQuet'], '')).trim()
    };

    if (isExcluded) {
      rawBang2.push(rowData);
    } else {
      rawBang1.push(rowData);
    }
  }

  // Sắp xếp theo: Thời gian tồn giảm dần -> COD giảm dần -> Mã bưu cục giảm dần
  const bang1 = sortLoctonRows(rawBang1);
  const bang2 = sortLoctonRows(rawBang2);

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
