const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

module.exports = {
  port: process.env.PORT || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || '',
  eulerApiKey: process.env.EULER_API_KEY || '',
  // NFR-SEC-01: single shared operator credential, configured via env --
  // there is no multi-user/DB-backed account system, so there's nothing to
  // bcrypt-hash against; auth.controller.js compares directly (timing-safe).
  adminUsername: process.env.ADMIN_USERNAME || '',
  adminPassword: process.env.ADMIN_PASSWORD || '',
  jwtSecret: process.env.JWT_SECRET || '',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
};
