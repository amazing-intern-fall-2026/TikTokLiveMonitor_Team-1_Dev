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

module.exports = { create };
