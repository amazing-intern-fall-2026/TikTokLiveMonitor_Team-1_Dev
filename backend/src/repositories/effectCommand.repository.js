const db = require('../config/db');

/**
 * Logs an effect command that was dispatched to the game engine. rule_id and
 * event_id are both nullable for manually-triggered commands (e.g. the kill
 * switch, FR-30) that aren't tied to a specific rule or live event. sessionId
 * is separate from eventId so the session's effect log (FR-35/FR-36) can be
 * queried even for commands with no triggering event (the kill switch).
 */
function create({ ruleId = null, eventId = null, sessionId = null, payload, status = 'SENT' }) {
  return db
    .query(
      'INSERT INTO effect_commands (rule_id, event_id, session_id, payload, status, sent_at) VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING *',
      [ruleId, eventId, sessionId, payload, status]
    )
    .then((result) => result.rows[0]);
}

/** FR-35/FR-36: the full effect log for one session, in the order they fired. */
function findBySessionId(sessionId) {
  return db
    .query('SELECT * FROM effect_commands WHERE session_id = $1 ORDER BY id', [sessionId])
    .then((result) => result.rows);
}

/**
 * Looks up the effect_commands row whose payload carries this commandId (the
 * UUID the Game Client actually sees -- effect_commands.id is our own
 * internal PK, never sent to the client) so an incoming EffectAck can be
 * linked back to it.
 */
function findByCommandId(commandId) {
  return db
    .query("SELECT * FROM effect_commands WHERE payload->>'commandId' = $1 ORDER BY id DESC LIMIT 1", [commandId])
    .then((result) => result.rows[0]);
}

/**
 * BR-EFF-03: moves a command to the Game's reported outcome (APPLIED |
 * REJECTED | EXPIRED). Only from SENT or NO_ACK: the first ack wins over a
 * duplicate, and a late ack still corrects an earlier NO_ACK timeout (the
 * Game is the source of truth for what actually ran). Resolves to the
 * updated row, or undefined if the status was already final.
 */
function updateStatusFromAck(id, status) {
  return db
    .query(
      `UPDATE effect_commands SET status = $2
       WHERE id = $1 AND status IN ('SENT', 'NO_ACK')
       RETURNING *`,
      [id, status]
    )
    .then((result) => result.rows[0]);
}

/**
 * BR-EFF-03: marks SENT commands the Game never acked as NO_ACK once their
 * deadline has passed -- expiresAt (5s after issue) for an EFFECT_COMMAND,
 * sent_at + 5s for a CLEAR_ALL_EFFECTS (it has no expiresAt) -- plus
 * `graceMs` for the ack's own trip back. Optionally scoped to one session
 * (used right before that session's report is generated). Resolves to the
 * number of rows changed.
 */
function markUnackedAsNoAck({ graceMs, sessionId = null }) {
  return db
    .query(
      `UPDATE effect_commands SET status = 'NO_ACK'
       WHERE status = 'SENT'
         AND ($2::int IS NULL OR session_id = $2)
         AND COALESCE((payload->>'expiresAt')::timestamptz, sent_at::timestamptz + interval '5 seconds')
             < NOW() - make_interval(secs => $1::double precision / 1000)`,
      [graceMs, sessionId]
    )
    .then((result) => result.rowCount);
}

module.exports = { create, findByCommandId, findBySessionId, updateStatusFromAck, markUnackedAsNoAck };
