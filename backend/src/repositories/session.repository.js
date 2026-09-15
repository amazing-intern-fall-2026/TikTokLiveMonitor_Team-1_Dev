const db = require('../config/db');

function create(liveStreamId) {
  return db
    .query('INSERT INTO sessions (live_stream_id) VALUES ($1) RETURNING *', [liveStreamId])
    .then((result) => result.rows[0]);
}

function markDisconnected(id, { status = 'disconnected', reason } = {}) {
  return db.query(
    'UPDATE sessions SET disconnected_at = NOW(), status = $2, disconnect_reason = $3 WHERE id = $1',
    [id, status, reason ?? null]
  );
}

module.exports = { create, markDisconnected };
