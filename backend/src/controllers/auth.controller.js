const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { adminUsername, adminPassword, jwtSecret, jwtExpiresIn } = require('../config/env');
const { makeLogger } = require('../utils/logger');

const logger = makeLogger('auth');

/**
 * Constant-time string comparison. Hashing both sides first (instead of
 * manually padding) normalizes length -- crypto.timingSafeEqual throws if
 * its two buffers differ in length, which a plain user-supplied password
 * almost always would versus the configured one.
 */
function safeEqual(a, b) {
  const hashA = crypto.createHash('sha256').update(String(a)).digest();
  const hashB = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

/**
 * NFR-SEC-01: single shared operator credential (no multi-user accounts
 * system exists), configured via ADMIN_USERNAME/ADMIN_PASSWORD env vars.
 * Issues a JWT with an expiry (JWT_EXPIRES_IN, default 8h) on success.
 */
async function login(req, res) {
  if (!adminUsername || !adminPassword || !jwtSecret) {
    logger.error('Auth is not configured (ADMIN_USERNAME/ADMIN_PASSWORD/JWT_SECRET missing from env)');
    return res.status(500).json({ message: 'Server chưa cấu hình xác thực' });
  }

  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ message: 'Thiếu username hoặc password' });
  }

  const validUsername = safeEqual(username, adminUsername);
  const validPassword = safeEqual(password, adminPassword);
  if (!validUsername || !validPassword) {
    logger.warn('Failed login attempt', { username });
    return res.status(401).json({ message: 'Sai username hoặc password' });
  }

  const token = jwt.sign({ sub: username, role: 'operator' }, jwtSecret, { expiresIn: jwtExpiresIn });
  logger.info('Operator logged in', { username });
  res.json({ token, tokenType: 'Bearer', expiresIn: jwtExpiresIn });
}

module.exports = { login };
