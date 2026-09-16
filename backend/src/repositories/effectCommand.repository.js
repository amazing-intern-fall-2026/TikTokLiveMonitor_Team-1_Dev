const db = require('../config/db');

/**
 * Logs an effect command that was dispatched to the game engine. rule_id and
 * event_id are both nullable for manually-triggered commands (e.g. the kill
 * switch, FR-30) that aren't tied to a specific rule or live event.
 */
function create({ ruleId = null, eventId = null, payload, status = 'SENT' }) {
  return db
    .query(
      'INSERT INTO effect_commands (rule_id, event_id, payload, status, sent_at) VALUES ($1, $2, $3, $4, NOW()) RETURNING *',
      [ruleId, eventId, payload, status]
    )
    .then((result) => result.rows[0]);
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

module.exports = { create, findByCommandId };
