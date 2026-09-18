const { Pool } = require('pg');
const { databaseUrl } = require('./env');
const { makeLogger } = require('../utils/logger');

const logger = makeLogger('db');

/**
 * Lazily connects on first query, so requiring this module (or starting the
 * server) never fails just because DATABASE_URL is missing/unreachable --
 * callers are expected to handle query rejections themselves.
 */
const pool = new Pool({ connectionString: databaseUrl || undefined });

pool.on('error', (err) => {
  logger.error('Unexpected Postgres pool error', { error: err.message });
});

function query(text, params) {
  return pool.query(text, params);
}

module.exports = { pool, query };
