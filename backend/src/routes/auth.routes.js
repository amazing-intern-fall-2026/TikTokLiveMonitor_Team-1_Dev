const { Router } = require('express');
const authController = require('../controllers/auth.controller');
const { createAuthRateLimit } = require('../middlewares/authRateLimit.middleware');

const router = Router();

// [CLAUDE EDIT 2026-10-02] Code gốc của TaiXN/Hdat-th, giữ lại để tham khảo.
// Lý do sửa: thêm giới hạn số lần thử sai (chống dò mật khẩu/secret); mỗi endpoint một bộ đếm
// riêng để Game Client gửi sai secret không khoá đăng nhập của Operator cùng IP.
// router.post('/login', authController.login);
// // NFR-SEC-02: machine-to-machine token for the /game Socket.io namespace --
// // see docs/api/game-token-spec.md.
// router.post('/game-token', authController.gameToken);
router.post('/login', createAuthRateLimit(), authController.login);
// NFR-SEC-02: machine-to-machine token for the /game Socket.io namespace --
// see docs/api/game-token-spec.md.
router.post('/game-token', createAuthRateLimit(), authController.gameToken);

module.exports = router;
