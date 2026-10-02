const { Router } = require('express');
const ruleController = require('../controllers/rule.controller');
const { requireAuth } = require('../middlewares/auth.middleware');

const router = Router();

// NFR-SEC-01: rules decide which effects fire on the live stream -- operator only
// (docs/api/rule-management-api-spec.md section 1).
router.use(requireAuth);

// FR-21/22, docs/api/rule-management-api-spec.md section 2: every write goes
// through ruleValidator, so a malformed rule can never reach RuleEngine.
router.get('/', ruleController.list);
router.post('/', ruleController.create);
router.get('/:id', ruleController.getById);
router.put('/:id', ruleController.update);
router.patch('/:id/enable', ruleController.setEnabled);
router.delete('/:id', ruleController.remove);

module.exports = router;

// [CLAUDE EDIT 2026-10-02] Code gốc của hao (3c140b4), giữ lại để tham khảo.
// Lý do sửa: khi merge b790d98 bản này thay mất bản controller (27355f1) đúng spec
// rule-management-api-spec.md: không validate body (lưu được rule thiếu condition.threshold,
// RuleEngine không bao giờ bắn), không có PUT /:id nên UI không sửa được rule, dùng
// /:id/toggle + {success,data} lệch spec. RulesPage.jsx/api.js đã chuyển sang API theo spec.
//
// const express = require('express');
// const router = express.Router();
// const db = require('../config/db');
// const ruleEngine = require('../services/RuleEngine.service');
// const { requireAuth } = require('../middlewares/auth.middleware');
//
// // NFR-SEC-01: rules decide which effects fire on the live stream -- operator only
// // (docs/api/rule-management-api-spec.md section 1).
// router.use(requireAuth);
//
// // Lấy danh sách rules chưa bị soft-delete
// router.get('/', async (req, res, next) => {
//   try {
//     const result = await db.query('SELECT * FROM rules WHERE deleted_at IS NULL ORDER BY id ASC');
//     res.json({ success: true, data: result.rows });
//   } catch (err) {
//     next(err);
//   }
// });
//
// // Tạo mới hoặc cập nhật Rule (Mapping COMMENT -> CHAT theo check constraint của DB)
// router.post('/', async (req, res, next) => {
//   try {
//     let { name, eventType, condition, effect, isActive } = req.body;
//     if (!name || !eventType) {
//       return res.status(400).json({ success: false, message: 'Tên rule và Event Type là bắt buộc.' });
//     }
//
//     // Chuẩn hóa khớp CHECK constraint: IN ('CHAT', 'GIFT', 'JOIN')
//     const normalizedType = eventType.toUpperCase() === 'COMMENT' ? 'CHAT' : eventType.toUpperCase();
//
//     const result = await db.query(
//       `INSERT INTO rules (name, event_type, condition, effect, is_active, updated_at) 
//        VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING *`,
//       [name, normalizedType, JSON.stringify(condition || {}), JSON.stringify(effect || {}), isActive ?? true]
//     );
//
//     await ruleEngine.reload();
//     res.status(201).json({ success: true, data: result.rows[0] });
//   } catch (err) {
//     next(err);
//   }
// });
//
// // Bật/tắt trạng thái rule (FR-22)
// router.patch('/:id/toggle', async (req, res, next) => {
//   try {
//     const { id } = req.params;
//     const ruleRes = await db.query('SELECT is_active FROM rules WHERE id = $1', [id]);
//     if (ruleRes.rows.length === 0) {
//       return res.status(404).json({ success: false, message: 'Không tìm thấy Rule.' });
//     }
//
//     const nextState = !ruleRes.rows[0].is_active;
//     const updateRes = await db.query(
//       'UPDATE rules SET is_active = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
//       [nextState, id]
//     );
//
//     await ruleEngine.reload();
//     res.json({ success: true, data: updateRes.rows[0] });
//   } catch (err) {
//     next(err);
//   }
// });
//
// // Soft delete
// router.delete('/:id', async (req, res, next) => {
//   try {
//     const { id } = req.params;
//     const result = await db.query(
//       'UPDATE rules SET deleted_at = NOW() WHERE id = $1 RETURNING id',
//       [id]
//     );
//     if (result.rows.length === 0) {
//       return res.status(404).json({ success: false, message: 'Không tìm thấy Rule.' });
//     }
//     await ruleEngine.reload();
//     res.json({ success: true, message: 'Đã xóa Rule thành công.' });
//   } catch (err) {
//     next(err);
//   }
// });
//
// module.exports = router;
