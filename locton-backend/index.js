import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { processFiles, generateExcelWorkbook, EXCLUDE_STATUSES, EXCLUDE_BC } from './processor.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 } // 25MB max to protect against OOM
});

// Router helper to mount routes at both root and /api/locton
const router = express.Router();

// Health check
router.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'locton-backend', timestamp: new Date().toISOString() });
});

// Config
router.get('/config', (req, res) => {
  res.json({
    excludeStatuses: Array.from(EXCLUDE_STATUSES),
    excludeBC: Array.from(EXCLUDE_BC)
  });
});

// Xử lý lọc tồn
router.post('/process', upload.fields([
  { name: 'hangton', maxCount: 1 },
  { name: 'dinh_vi', maxCount: 1 },
  { name: 'dinhvi', maxCount: 1 }
]), async (req, res) => {
  try {
    const files = req.files || {};
    const hangtonFile = files['hangton'] ? files['hangton'][0] : null;
    const dinhViFile = (files['dinh_vi'] ? files['dinh_vi'][0] : null) || (files['dinhvi'] ? files['dinhvi'][0] : null);

    if (!hangtonFile) {
      return res.status(400).json({ success: false, message: 'Thiếu file Hàng tồn (hangton.xlsx)' });
    }

    let dinhViInput = null;
    if (dinhViFile) {
      dinhViInput = dinhViFile.buffer;
    } else if (req.body && req.body.dinh_vi_json) {
      try {
        dinhViInput = typeof req.body.dinh_vi_json === 'string'
          ? JSON.parse(req.body.dinh_vi_json)
          : req.body.dinh_vi_json;
      } catch (e) {
        return res.status(400).json({ success: false, message: 'dinh_vi_json không hợp lệ: ' + e.message });
      }
    }

    if (!dinhViInput) {
      return res.status(400).json({ success: false, message: 'Thiếu file Định vị hoặc dữ liệu định vị (dinh_vi.xlsx)' });
    }

    const result = processFiles(hangtonFile.buffer, dinhViInput);

    return res.json({
      success: true,
      data: {
        bang1: result.bang1,
        bang2: result.bang2,
        bang3: result.bang3
      },
      stats: result.stats
    });
  } catch (err) {
    console.error('Lỗi xử lý lọc tồn:', err);
    return res.status(500).json({ success: false, message: 'Lỗi xử lý file: ' + err.message });
  }
});

// Xuất Excel
router.post('/export', async (req, res) => {
  try {
    const { bang1, bang2, bang3 } = req.body;
    if (!bang1 || !bang2 || !bang3) {
      return res.status(400).json({ success: false, message: 'Thiếu dữ liệu bang1, bang2, bang3 để xuất Excel' });
    }

    const buffer = generateExcelWorkbook(bang1, bang2, bang3);
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `Loc_ton_${dateStr}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(buffer);
  } catch (err) {
    console.error('Lỗi xuất file Excel:', err);
    return res.status(500).json({ success: false, message: 'Lỗi xuất file: ' + err.message });
  }
});

// Mount at both '/' and '/api/locton'
app.use('/api/locton', router);
app.use('/', router);

// Error handling middleware (e.g. Multer limit error)
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ success: false, message: 'File tải lên vượt quá giới hạn cho phép (tối đa 25MB)' });
    }
    return res.status(400).json({ success: false, message: `Lỗi tải file: ${err.message}` });
  }
  if (err) {
    return res.status(500).json({ success: false, message: err.message || 'Lỗi máy chủ' });
  }
  next();
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Locton backend service running on port ${PORT}`);
});
