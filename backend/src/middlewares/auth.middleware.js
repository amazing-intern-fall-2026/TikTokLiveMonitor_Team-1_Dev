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
    req.user = jwt.verify(token, jwtSecret);
    next();
  } catch (err) {
    res.status(401).json({ message: 'Token không hợp lệ hoặc đã hết hạn' });
  }
}

module.exports = { requireAuth };
