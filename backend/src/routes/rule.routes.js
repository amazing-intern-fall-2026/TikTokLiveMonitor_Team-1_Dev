const express = require('express');
const router = express.Router();
const db = require('../config/db');

// Lấy danh sách rules chưa bị soft-delete
router.get('/', async (req, res, next) => {
  try {
    const result = await db.query('SELECT * FROM rules WHERE deleted_at IS NULL ORDER BY id ASC');
    res.json({ success: true, data: result.rows });
  } catch (err) {
    next(err);
  }
});

// Tạo mới hoặc cập nhật Rule (Mapping COMMENT -> CHAT theo check constraint của DB)
router.post('/', async (req, res, next) => {
  try {
    let { name, eventType, condition, effect, isActive } = req.body;
    if (!name || !eventType) {
      return res.status(400).json({ success: false, message: 'Tên rule và Event Type là bắt buộc.' });
    }

    // Chuẩn hóa khớp CHECK constraint: IN ('CHAT', 'GIFT', 'JOIN')
    const normalizedType = eventType.toUpperCase() === 'COMMENT' ? 'CHAT' : eventType.toUpperCase();

    const result = await db.query(
      `INSERT INTO rules (name, event_type, condition, effect, is_active, updated_at) 
       VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING *`,
      [name, normalizedType, JSON.stringify(condition || {}), JSON.stringify(effect || {}), isActive ?? true]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// Bật/tắt trạng thái rule (FR-22)
router.patch('/:id/toggle', async (req, res, next) => {
  try {
    const { id } = req.params;
    const ruleRes = await db.query('SELECT is_active FROM rules WHERE id = $1', [id]);
    if (ruleRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy Rule.' });
    }

    const nextState = !ruleRes.rows[0].is_active;
    const updateRes = await db.query(
      'UPDATE rules SET is_active = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [nextState, id]
    );

    res.json({ success: true, data: updateRes.rows[0] });
  } catch (err) {
    next(err);
  }
});

// Soft delete
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      'UPDATE rules SET deleted_at = NOW() WHERE id = $1 RETURNING id',
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy Rule.' });
    }
    res.json({ success: true, message: 'Đã xóa Rule thành công.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
