const db = require('../config/db');

/** FR-36: persists one session's summary report. session_id is UNIQUE -- a session is only closed once. */
function create({
  sessionId,
  durationSeconds,
  totalComments,
  totalJoins,
  totalGifts,
  totalDiamonds,
  effectsTriggered,
  topContributors,
}) {
  return db
    .query(
      `INSERT INTO session_reports
         (session_id, duration_seconds, total_comments, total_joins, total_gifts, total_diamonds, effects_triggered, top_contributors)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        sessionId,
        durationSeconds,
        totalComments,
        totalJoins,
        totalGifts,
        totalDiamonds,
        JSON.stringify(effectsTriggered),
        JSON.stringify(topContributors),
      ]
    )
    .then((result) => result.rows[0]);
}

/** FR-38: re-read a past session's report without re-aggregating. */
function findBySessionId(sessionId) {
  return db
    .query('SELECT * FROM session_reports WHERE session_id = $1', [sessionId])
    .then((result) => result.rows[0]);
}

/** Session + basic info for computing duration/context, joined to its parent live_stream. */
function findSessionWithStream(sessionId) {
  return db
    .query(
      `SELECT s.*, ls.host_username, ls.title
       FROM sessions s
       JOIN live_streams ls ON ls.id = s.live_stream_id
       WHERE s.id = $1`,
      [sessionId]
    )
    .then((result) => result.rows[0]);
}

/** FR-36: event counts by type for one session. */
function countEventsByType(sessionId) {
  return db
    .query('SELECT event_type, COUNT(*) AS count FROM events WHERE session_id = $1 GROUP BY event_type', [sessionId])
    .then((result) => result.rows);
}

/** FR-36: total diamonds across every completed gift streak in one session. gift_payloads.diamond_count is the per-unit value, so the total is diamond_count * repeat_count. */
function sumDiamonds(sessionId) {
  return db
    .query(
      `SELECT COALESCE(SUM(gp.diamond_count * gp.repeat_count), 0) AS total
       FROM events e
       JOIN gift_payloads gp ON gp.event_id = e.id
       WHERE e.session_id = $1 AND gp.repeat_end = TRUE`,
      [sessionId]
    )
    .then((result) => Number(result.rows[0].total));
}

/** FR-18/FR-36: top gift-givers by total diamonds, for the session summary. */
function topGifters(sessionId, limit = 5) {
  return db
    .query(
      `SELECT au.username, au.nickname, SUM(gp.diamond_count * gp.repeat_count) AS total_diamonds
       FROM events e
       JOIN gift_payloads gp ON gp.event_id = e.id
       JOIN app_users au ON au.id = e.app_user_id
       WHERE e.session_id = $1 AND gp.repeat_end = TRUE
       GROUP BY au.id, au.username, au.nickname
       ORDER BY total_diamonds DESC
       LIMIT $2`,
      [sessionId, limit]
    )
    .then((result) => result.rows);
}

/** FR-18/FR-36: top commenters by comment count, for the session summary. */
function topCommenters(sessionId, limit = 5) {
  return db
    .query(
      `SELECT au.username, au.nickname, COUNT(*) AS comment_count
       FROM events e
       JOIN app_users au ON au.id = e.app_user_id
       WHERE e.session_id = $1 AND e.event_type = 'CHAT'
       GROUP BY au.id, au.username, au.nickname
       ORDER BY comment_count DESC
       LIMIT $2`,
      [sessionId, limit]
    )
    .then((result) => result.rows);
}

module.exports = {
  create,
  findBySessionId,
  findSessionWithStream,
  countEventsByType,
  sumDiamonds,
  topGifters,
  topCommenters,
};
