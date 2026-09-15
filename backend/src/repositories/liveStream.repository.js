const db = require('../config/db');

function findAll() {
  return db
    .query('SELECT * FROM live_streams WHERE deleted_at IS NULL ORDER BY id DESC')
    .then((result) => result.rows);
}

function findById(id) {
  return db
    .query('SELECT * FROM live_streams WHERE id = $1 AND deleted_at IS NULL', [id])
    .then((result) => result.rows[0]);
}

function create({ hostUsername, host_username: hostUsernameSnake, title } = {}) {
  return db
    .query('INSERT INTO live_streams (host_username, title) VALUES ($1, $2) RETURNING *', [
      hostUsername ?? hostUsernameSnake,
      title ?? null,
    ])
    .then((result) => result.rows[0]);
}

/**
 * Finds the most recent (non-deleted) live_stream row for a host username,
 * or creates one if this is the first time we've seen them connect.
 */
async function findOrCreateByHostUsername(hostUsername) {
  const existing = await db.query(
    'SELECT * FROM live_streams WHERE host_username = $1 AND deleted_at IS NULL ORDER BY id DESC LIMIT 1',
    [hostUsername]
  );
  if (existing.rows[0]) {
    return existing.rows[0];
  }
  return create({ hostUsername });
}

function updateViewerCount(id, viewerCount) {
  return db.query('UPDATE live_streams SET viewer_count = $2 WHERE id = $1', [id, viewerCount]);
}

module.exports = { findAll, findById, create, findOrCreateByHostUsername, updateViewerCount };
