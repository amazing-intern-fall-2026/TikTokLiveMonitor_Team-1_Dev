const jwt = require('jsonwebtoken');
const { jwtSecret } = require('../config/env');

/**
 * NFR-SEC-01: verifies the Bearer JWT issued by POST /api/login and attaches
 * the decoded payload as req.user. Built and ready, but NOT yet applied to
 * any route -- which routes should require an operator login (connect/
 * disconnect? kill-switch? all of /api?) is a separate decision than
 * "build the login endpoint", left for the user to make explicitly rather
 * than silently locking down existing endpoints the team already tests
 * against unauthenticated (mock test-events, the /game and /monitor
 * namespaces, etc.).
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
