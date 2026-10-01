const jwt = require('jsonwebtoken');
const { jwtSecret } = require('../config/env');

/**
 * NFR-SEC-01: verifies the Bearer JWT issued by POST /api/auth/login and
 * attaches the decoded payload as req.user. Applied to the operator-facing
 * sensitive routes (effects kill-switch/pause/resume, livestream connect/
 * disconnect, sessions, POST /live-streams) -- read-only/dev-only endpoints
 * (GET routes, /test-events, /monitor and /game socket namespaces) are left
 * unauthenticated or gated separately.
 */
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ message: 'Thiếu token xác thực' });
  }

  try {
    const payload = jwt.verify(token, jwtSecret);
    // NFR-SEC-02: login and game-token share JWT_SECRET (only `role` differs),
    // so the signature alone does not prove an operator -- without this check a
    // game_client token could hit the kill-switch, rules CRUD, etc.
    if (payload.role !== 'operator') {
      return res.status(403).json({ message: 'Token không có quyền operator' });
    }
    req.user = payload;
    next();
  } catch (err) {
    res.status(401).json({ message: 'Token không hợp lệ hoặc đã hết hạn' });
  }
}

module.exports = { requireAuth };
