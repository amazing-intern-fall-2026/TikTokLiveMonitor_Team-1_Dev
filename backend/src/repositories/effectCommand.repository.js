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

module.exports = { create, findByCommandId, findBySessionId };
