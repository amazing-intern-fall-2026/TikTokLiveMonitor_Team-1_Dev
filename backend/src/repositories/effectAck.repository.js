const db = require('../config/db');

/** BR-EFF-03: one row per EffectAck the Game Client sends back for a given effect_commands.id. */
function create({ effectCommandId, status, message = null }) {
  return db
    .query(
      'INSERT INTO effect_acks (effect_command_id, status, message) VALUES ($1, $2, $3) RETURNING *',
      [effectCommandId, status, message]
    )
    .then((result) => result.rows[0]);
}

module.exports = { create };
