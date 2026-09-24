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

/**
 * FR-09: persists the streamer's avatar URL and the TikTok-reported LIVE
 * start time once known (see liveStream.service.js's roomInfo extraction).
 * Both are best-effort/nullable -- only the fields actually resolved are
 * written, so a partial extraction never clobbers a previously known value.
 */
function updateProfile(id, { avatarUrl, liveStartedAt } = {}) {
  return db.query(
    'UPDATE live_streams SET avatar_url = COALESCE($2, avatar_url), live_started_at = COALESCE($3, live_started_at) WHERE id = $1',
    [id, avatarUrl ?? null, liveStartedAt ?? null]
  );
}

module.exports = { findAll, findById, create, findOrCreateByHostUsername, updateViewerCount, updateProfile };
