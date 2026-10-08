// index.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const pool = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEYS = {
  [process.env.API_KEY_RAHASIA]: 'rahasia',
  [process.env.API_KEY_TAUFIK]:  'taufik',
};

// buang entry yang undefined / kosong
Object.keys(API_KEYS).forEach(k => {
  if (!k || k === 'undefined' || k.trim() === '') delete API_KEYS[k];
});

// ============================================
// Validasi ENV saat start (biar tidak error substring)
// ============================================
if (Object.keys(API_KEYS).length === 0) {
  console.error('❌ Tidak ada API_KEY yang diset di file .env');
  console.error('   Contoh:');
  console.error('   API_KEY_RAHASIA=rahasia123');
  console.error('   API_KEY_TAUFIK=taufik123');
  process.exit(1);
}

app.use(cors());
app.use(express.json());

// ============================================
// Middleware API Key
// ============================================
function checkApiKey(req, res, next) {
  const key = req.query.apiKey || req.headers['x-api-key'];

  if (!key) {
    return res.status(401).json({
      success: false,
      error: 'API key tidak dikirim. Gunakan ?apiKey=xxx atau header x-api-key'
    });
  }

  const user = API_KEYS[key];

  if (!user) {
    return res.status(401).json({
      success: false,
      error: 'API key salah'
    });
  }

  req.user = user;  // <-- bisa dipakai di handler, mis. req.user = 'rahasia' / 'taufik'
  next();
}

// ============================================
// Cek koneksi DB saat server start
// ============================================
(async () => {
  try {
    await pool.query('SELECT 1');
    console.log('✅ Terhubung ke database cpca');
    console.log('🔑 API Key aktif:', Object.keys(API_KEYS).map(k => k.substring(0, 8) + '...').join(', '));
  } catch (err) {
    console.error('❌ Gagal koneksi DB:', err.message);
    process.exit(1);
  }
})();

// ============================================
// ENDPOINT ala IQPlus: /api/v1/news/today
// ============================================
app.get('/api/v1/news/today', checkApiKey, async (req, res) => {
  try {
    const includeStory = req.query.include_story === '1';
    const stockCode = req.query.stock_code;

    let sql = `
      SELECT
        id            AS news_id,
        date          AS date,
        NULL          AS time,
        code          AS stock_code,
        company       AS headline,
        letter_number AS story
      FROM ca_uma
      WHERE 1=1
    `;
    const params = [];

    if (stockCode) {
      sql += ' AND code = ?';
      params.push(stockCode.toUpperCase());
    }
    if (req.query.today === '1') {
      sql += ' AND DATE(date) = CURDATE()';
    }

    sql += ' ORDER BY date DESC, id DESC LIMIT 100';

    const [rows] = await pool.query(sql, params);

    res.json(rows.map(r => ({
      news_id: String(r.news_id ?? ''),
      date: formatDate(r.date),
      time: r.time || '00:00:00',
      stock_code: r.stock_code || 'EKOM',
      headline: (r.headline || '').toUpperCase(),
      ...(includeStory ? { story: r.story || '' } : {})
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ============================================
// Detail berita by id
// ============================================
app.get('/api/v1/news/:id', checkApiKey, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM ca_uma WHERE id = ? LIMIT 1',
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Not found' });
    }
    const r = rows[0];
    res.json([{
      news_id: String(r.id),
      date: formatDate(r.date),
      time: '00:00:00',
      stock_code: r.code || 'EKOM',
      headline: (r.company || '').toUpperCase(),
      story: r.letter_number || ''
    }]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ============================================
// Generic tabel (array langsung)
// ============================================
const TABEL_VALID = ['ca_uma', 'ca_suspend', 'ca_etf'];

app.get('/api/v1/cpca', checkApiKey, async (req, res) => {
  const { table } = req.query;
  if (!table || !TABEL_VALID.includes(table)) {
    return res.status(400).json({
      success: false,
      error: `Parameter 'table' wajib & salah satu dari: ${TABEL_VALID.join(', ')}`
    });
  }
  try {
    const [rows] = await pool.query(`SELECT * FROM \`${table}\``);
  // ✅ Response dengan info tabel
    res.json({
      success: true,
      table: table,
      total: rows.length,
      data: rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ============================================
// Endpoint lama (dari routes.js) - SUDAH DIPROTEKSI API KEY
// ============================================
app.use('/data', checkApiKey, require('./routes'));

// ============================================
// Helper
// ============================================
function formatDate(d) {
  if (!d) return null;
  const dt = new Date(d);
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// ============================================
// Root
// ============================================
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server berjalan di http://localhost:${PORT}`);
});