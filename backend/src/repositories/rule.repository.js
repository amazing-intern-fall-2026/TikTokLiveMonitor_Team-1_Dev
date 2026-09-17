const db = require('../config/db');

function findActive() {
  return db
    .query('SELECT * FROM rules WHERE is_active = TRUE AND deleted_at IS NULL ORDER BY id')
    .then((result) => result.rows);
}

module.exports = { findActive };
