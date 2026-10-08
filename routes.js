// routes/data.js
const express = require('express');
const router = express.Router();
const pool = require('./db');

// Daftar tabel yang diizinkan (whitelist untuk keamanan)
const TABEL_VALID = ['ca_suspend', 'ca_etf', 'ca_uma'];

// ============================================
// GET /data/:tabel  → Ambil semua data dari tabel
// ============================================
router.get('/:tabel', async (req, res) => {
  const { tabel } = req.params;

  if (!TABEL_VALID.includes(tabel)) {
    return res.status(400).json({
      status: 'error',
      message: `Tabel '${tabel}' tidak diizinkan. Pilihan: ${TABEL_VALID.join(', ')}`
    });
  }

  try {
    // Pagination opsional
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;

    const [rows] = await pool.query(
      `SELECT * FROM \`${tabel}\` LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM \`${tabel}\``
    );

    res.json({
      tabel,
      data: rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      status: 'error',
      message: err.message
    });
  }
});

// ============================================
// GET /data/:tabel/:id  → Ambil satu baris by ID
// ============================================
router.get('/:tabel/:id', async (req, res) => {
  const { tabel, id } = req.params;

  if (!TABEL_VALID.includes(tabel)) {
    return res.status(400).json({ status: 'error', message: 'Tabel tidak diizinkan' });
  }

  try {
    // Coba kolom 'id' dulu. Kalau tidak ada, error akan memberi tahu.
    const [rows] = await pool.query(
      `SELECT * FROM \`${tabel}\` WHERE id = ? LIMIT 1`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: `Data dengan id ${id} tidak ditemukan di ${tabel}`
      });
    }

    res.json({ status: 'success', tabel, data: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// ============================================
// GET /data/:tabel/search?q=keyword
// ============================================
router.get('/:tabel/search', async (req, res) => {
  const { tabel } = req.params;
  const { q, kolom } = req.query;

  if (!TABEL_VALID.includes(tabel)) {
    return res.status(400).json({ status: 'error', message: 'Tabel tidak diizinkan' });
  }

  if (!q) {
    return res.status(400).json({ status: 'error', message: 'Parameter q wajib diisi' });
  }

  try {
    if (kolom) {
      // Cari di kolom tertentu
      const [rows] = await pool.query(
        `SELECT * FROM \`${tabel}\` WHERE \`${kolom}\` LIKE ? LIMIT 100`,
        [`%${q}%`]
      );
      return res.json({ status: 'success', tabel, kolom, keyword: q, data: rows });
    }

    // Kalau kolom tidak ditentukan, cari di semua kolom teks
    const [kolomList] = await pool.query(`DESCRIBE \`${tabel}\``);
    const kolomString = kolomList
      .filter(k => /char|text/i.test(k.Type))
      .map(k => `\`${k.Field}\` LIKE ?`);

    if (kolomString.length === 0) {
      return res.status(400).json({ status: 'error', message: 'Tidak ada kolom teks untuk dicari' });
    }

    const params = kolomString.map(() => `%${q}%`);
    const [rows] = await pool.query(
      `SELECT * FROM \`${tabel}\` WHERE ${kolomString.join(' OR ')} LIMIT 100`,
      params
    );

    res.json({ status: 'success', tabel, keyword: q, data: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

module.exports = router;