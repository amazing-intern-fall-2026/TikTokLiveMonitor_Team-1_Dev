const effectCommandRepository = require('../repositories/effectCommand.repository');
const effectAckRepository = require('../repositories/effectAck.repository');

/**
 * BR-EFF-03: records an EffectAck { commandId, status, reason? } from the
 * Game Client, linking it back to the effect_commands row it acks. Best-
 * effort/fire-and-forget by design (same rationale as every other DB write
 * in this codebase) -- an ack the backend fails to log must never affect
 * the live Socket.IO relay or crash anything.
 */
async function recordAck({ commandId, status, reason }) {
  if (!commandId || !status) {
    console.error('[EffectAck] Ignoring malformed ack (missing commandId/status):', { commandId, status });
    return;
  }

  try {
    const command = await effectCommandRepository.findByCommandId(commandId);
    if (!command) {
      console.error(`[EffectAck] No effect_commands row found for commandId=${commandId}`);
      return;
    }
    await effectAckRepository.create({ effectCommandId: command.id, status, message: reason ?? null });
  } catch (err) {
    console.error('[EffectAck] Failed to record ack:', err.message);
  }
}

module.exports = { recordAck };
