const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

module.exports = {
  port: process.env.PORT || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || '',
  eulerApiKey: process.env.EULER_API_KEY || '',
  // RSK-01: comma-separated rotating proxy pool, parsed and ready to consume
  // -- not yet wired into TikTokLiveConnection's webClientOptions/
  // wsClientOptions (needs a proxy-agent dependency once a provider is
  // chosen). See backend/.env.example for the format.
  tiktokProxyList: (process.env.TIKTOK_PROXY_LIST || '')
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean),
  tiktokProxyRotation: process.env.TIKTOK_PROXY_ROTATION || 'round-robin',
  // NFR-SEC-01: single shared operator credential, configured via env --
  // there is no multi-user/DB-backed account system, so there's nothing to
  // bcrypt-hash against; auth.controller.js compares directly (timing-safe).
  adminUsername: process.env.ADMIN_USERNAME || '',
  adminPassword: process.env.ADMIN_PASSWORD || '',
  jwtSecret: process.env.JWT_SECRET || '',
  // NFR-SEC-04/06: HMAC key for pseudonymizing tiktok_user_id. Required by
  // appUser.repository.js; do not rotate during the data's lifetime (policy 5.3).
  userIdPepper: process.env.USER_ID_PEPPER || '',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  // NFR-SEC-02: shared secret for the Game Client to mint a JWT (role
  // game_client) via POST /api/auth/game-token -- see
  // docs/api/game-token-spec.md. Reuses JWT_SECRET to sign, so no separate
  // signing key is configured here.
  gameClientSecret: process.env.GAME_CLIENT_SECRET || '',
  gameTokenExpiresIn: process.env.GAME_TOKEN_EXPIRES_IN || '24h',
  // NFR-SEC-04: max age (days) of per-viewer data before retention.service.js
  // deletes/scrubs it. 0 disables the job. Raw string here; the service
  // validates it so a typo is logged instead of silently keeping data forever.
  retentionDays: process.env.RETENTION_DAYS ?? '30',
  // Browser origins allowed to call the REST API and open Socket.IO from a
  // page (the dashboard / OBS overlay). Comma-separated; '*' allows any.
  // Non-browser clients (Game Client, scripts) send no Origin and are not
  // affected -- they are gated by JWT instead.
  corsOrigins: parseCorsOrigins(process.env.CORS_ORIGINS ?? 'http://localhost:5173,http://127.0.0.1:5173'),
  // Brute-force guard for POST /api/auth/login and /api/auth/game-token:
  // after this many failed attempts from one IP within the window, further
  // attempts get 429 until the window passes.
  authMaxFailures: Number.parseInt(process.env.AUTH_MAX_FAILURES || '5', 10),
  authLockoutMinutes: Number.parseInt(process.env.AUTH_LOCKOUT_MINUTES || '15', 10),
};

function parseCorsOrigins(raw) {
  const origins = raw.split(',').map((origin) => origin.trim()).filter(Boolean);
  return origins.includes('*') ? '*' : origins;
}
