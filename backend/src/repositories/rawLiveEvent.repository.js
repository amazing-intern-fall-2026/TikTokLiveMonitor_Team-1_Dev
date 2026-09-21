const db = require('../config/db');

/**
 * Stores the full Envelope verbatim. event_id is UNIQUE -- a re-insert with
 * the same eventId throws a unique-violation (code 23505), which callers
 * should treat as "already stored", not a real failure (FR-19 DB-level
 * backstop, see schema.sql).
 */
function create({ eventId, sessionId = null, eventType, rawPayload }) {
  return db
    .query(
      'INSERT INTO raw_live_events (event_id, session_id, event_type, raw_payload) VALUES ($1, $2, $3, $4) RETURNING *',
      [eventId, sessionId, eventType, rawPayload]
    )
    .then((result) => result.rows[0]);
}

module.exports = { create };
