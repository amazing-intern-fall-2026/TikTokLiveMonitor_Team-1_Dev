const db = require('../config/db');

function findActive() {
  return db
    .query('SELECT * FROM rules WHERE is_active = TRUE AND deleted_at IS NULL ORDER BY id')
    .then((result) => result.rows);
}

/** `isActive` (true/false) narrows the list; undefined returns every non-deleted rule. */
function findAll({ isActive } = {}) {
  const params = [];
  let filter = '';
  if (isActive !== undefined) {
    params.push(isActive);
    filter = ' AND is_active = $1';
  }
  return db
    .query(`SELECT * FROM rules WHERE deleted_at IS NULL${filter} ORDER BY id`, params)
    .then((result) => result.rows);
}

function findById(id) {
  return db
    .query('SELECT * FROM rules WHERE id = $1 AND deleted_at IS NULL', [id])
    .then((result) => result.rows[0]);
}

function create({ name, eventType, condition, effect, isActive = true }) {
  return db
    .query(
      `INSERT INTO rules (name, event_type, condition, effect, is_active)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [name, eventType, JSON.stringify(condition), JSON.stringify(effect), isActive]
    )
    .then((result) => result.rows[0]);
}

/** Full replace of the editable fields. `isActive` is left alone when undefined. */
function update(id, { name, eventType, condition, effect, isActive }) {
  return db
    .query(
      `UPDATE rules
       SET name = $2, event_type = $3, condition = $4, effect = $5,
           is_active = COALESCE($6, is_active), updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING *`,
      [id, name, eventType, JSON.stringify(condition), JSON.stringify(effect), isActive ?? null]
    )
    .then((result) => result.rows[0]);
}

function setActive(id, isActive) {
  return db
    .query('UPDATE rules SET is_active = $2, updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING *', [
      id,
      isActive,
    ])
    .then((result) => result.rows[0]);
}

/** Soft delete: effect_commands.rule_id still references the row for history. Returns true if a row was deleted. */
function softDelete(id) {
  return db
    .query('UPDATE rules SET deleted_at = NOW(), is_active = FALSE, updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL', [id])
    .then((result) => result.rowCount > 0);
}

module.exports = { findActive, findAll, findById, create, update, setActive, softDelete };
