const db = require('../config/db');

/** Analytics warehouse: one flat row per closed session (see schema.sql for how this differs from session_reports). */
function create({
  sessionId,
  liveStreamId,
  hostUsername,
  startedAt,
  endedAt,
  durationSeconds,
  totalEvents,
  totalComments,
  totalJoins,
  totalGifts,
  totalDiamonds,
  uniqueViewers,
  commentsPerMinute,
  diamondsPerMinute,
  totalEffectsTriggered,
}) {
  return db
    .query(
      `INSERT INTO session_analytics_summary
         (session_id, live_stream_id, host_username, started_at, ended_at, duration_seconds,
          total_events, total_comments, total_joins, total_gifts, total_diamonds, unique_viewers,
          comments_per_minute, diamonds_per_minute, total_effects_triggered)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING *`,
      [
        sessionId,
        liveStreamId,
        hostUsername,
        startedAt,
        endedAt,
        durationSeconds,
        totalEvents,
        totalComments,
        totalJoins,
        totalGifts,
        totalDiamonds,
        uniqueViewers,
        commentsPerMinute,
        diamondsPerMinute,
        totalEffectsTriggered,
      ]
    )
    .then((result) => result.rows[0]);
}

module.exports = { create };
