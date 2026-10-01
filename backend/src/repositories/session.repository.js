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

/**
 * FR-38: paginated session list, newest first. Filters (all optional):
 * hostUsername / liveStreamId (the "room"), from / to (inclusive YYYY-MM-DD
 * range on connected_at). Joins session_reports for the summary, which is
 * NULL for sessions still running.
 */
async function findPage({ hostUsername, liveStreamId, from, to, limit, offset }) {
  const where = ['s.deleted_at IS NULL'];
  const params = [];
  const add = (sql, value) => {
    params.push(value);
    where.push(sql.replace('?', `$${params.length}`));
  };
  if (hostUsername) add('ls.host_username = ?', hostUsername);
  if (liveStreamId) add('s.live_stream_id = ?', liveStreamId);
  if (from) add('s.connected_at >= ?::date', from);
  if (to) add("s.connected_at < (?::date + INTERVAL '1 day')", to);
  const whereSql = where.join(' AND ');

  const [rows, count] = await Promise.all([
    db.query(
      `SELECT s.id, s.live_stream_id, ls.host_username, ls.title, s.status, s.disconnect_reason,
              s.connected_at, s.disconnected_at,
              sr.duration_seconds, sr.total_comments, sr.total_joins, sr.total_gifts, sr.total_diamonds
       FROM sessions s
       JOIN live_streams ls ON ls.id = s.live_stream_id
       LEFT JOIN session_reports sr ON sr.session_id = s.id
       WHERE ${whereSql}
       ORDER BY s.connected_at DESC, s.id DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    ),
    db.query(
      `SELECT COUNT(*) AS count FROM sessions s JOIN live_streams ls ON ls.id = s.live_stream_id WHERE ${whereSql}`,
      params
    ),
  ]);
  return { rows: rows.rows, total: Number(count.rows[0].count) };
}

module.exports = { create, markDisconnected, findPage };
