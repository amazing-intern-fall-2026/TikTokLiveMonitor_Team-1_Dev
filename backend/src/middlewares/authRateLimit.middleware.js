const { authMaxFailures, authLockoutMinutes } = require('../config/env');
const { makeLogger } = require('../utils/logger');

const logger = makeLogger('authRateLimit');

// Above this many tracked IPs, expired entries are pruned on the next request.
const PRUNE_THRESHOLD = 1000;

/**
 * NFR-SEC-01: brute-force guard for the credential endpoints. Counts only
 * FAILED attempts (401) per client IP; a success (2xx) clears that IP's
 * count, so an operator who logs in normally is never locked out. Once an IP
 * reaches `maxFailures` within `windowMs` it gets 429 + Retry-After until the
 * window that started with its first failure expires.
 *
 * In-memory on purpose: one backend process, and a restart clearing the
 * counters is acceptable for this threat model. `req.ip` is the socket peer
 * address (no trust proxy) -- the browser calls the backend directly.
 */
function createAuthRateLimit({ maxFailures = authMaxFailures, windowMs = authLockoutMinutes * 60 * 1000, now = Date.now } = {}) {
  const failures = new Map(); // ip -> { count, firstAt }

  function prune(at) {
    for (const [ip, entry] of failures) {
      if (at - entry.firstAt >= windowMs) failures.delete(ip);
    }
  }

  return function authRateLimit(req, res, next) {
    const ip = req.ip;
    const at = now();
    if (failures.size > PRUNE_THRESHOLD) prune(at);

    let entry = failures.get(ip);
    if (entry && at - entry.firstAt >= windowMs) {
      failures.delete(ip);
      entry = undefined;
    }
    if (entry && entry.count >= maxFailures) {
      const retryAfterSec = Math.ceil((entry.firstAt + windowMs - at) / 1000);
      res.set('Retry-After', String(retryAfterSec));
      return res.status(429).json({ message: `Đăng nhập sai quá nhiều lần, thử lại sau ${Math.ceil(retryAfterSec / 60)} phút` });
    }

    res.on('finish', () => {
      if (res.statusCode === 401) {
        const current = failures.get(ip) ?? { count: 0, firstAt: now() };
        current.count += 1;
        failures.set(ip, current);
        if (current.count === maxFailures) {
          logger.warn('Auth locked for IP after repeated failures', { ip, path: req.originalUrl, failures: current.count });
        }
      } else if (res.statusCode >= 200 && res.statusCode < 300) {
        failures.delete(ip);
      }
    });
    next();
  };
}

module.exports = { createAuthRateLimit };
