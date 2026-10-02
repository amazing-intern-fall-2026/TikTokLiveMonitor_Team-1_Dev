const effectCommandRepository = require('../repositories/effectCommand.repository');
const effectAckRepository = require('../repositories/effectAck.repository');
const effectLog = require('./effectLog.service');
const { makeLogger } = require('../utils/logger');

const logger = makeLogger('EffectAck');

/**
 * BR-EFF-03: records an EffectAck { commandId, status, reason? } from the
 * Game Client, linking it back to the effect_commands row it acks. Best-
 * effort/fire-and-forget by design (same rationale as every other DB write
 * in this codebase) -- an ack the backend fails to log must never affect
 * the live Socket.IO relay or crash anything.
 */
async function recordAck({ commandId, status, reason }) {
  if (!commandId || !status) {
    logger.warn('Ignoring malformed ack (missing commandId/status)', { commandId, status });
    return;
  }
  // [CLAUDE EDIT 2026-10-02] Thêm kiểm tra enum: contract v1.0 FROZEN chỉ cho APPLIED|REJECTED|EXPIRED.
  if (!ACK_STATUSES.has(status)) {
    logger.warn('Ignoring ack with unknown status', { commandId, status });
    return;
  }

  // Dashboard first, DB second: the Effect log must keep working even when Postgres is down.
  effectLog.update(commandId, status, reason);

  // [CLAUDE EDIT 2026-10-02] Code gốc của TaiXN (540930d), giữ lại để tham khảo.
  // Lý do sửa: (1) ack chỉ ghi effect_acks, effect_commands.status đứng yên ở SENT nên báo cáo phiên
  // không biết effect nào thực sự chạy (BR-EFF-03); (2) dòng effect_commands được INSERT sau khi
  // broadcast, ack về nhanh hơn INSERT thì tra không thấy và ack bị bỏ -> tra lại vài lần.
  // try {
  //   const command = await effectCommandRepository.findByCommandId(commandId);
  //   if (!command) {
  //     logger.warn('No effect_commands row found for commandId', { commandId });
  //     return;
  //   }
  //   await effectAckRepository.create({ effectCommandId: command.id, status, message: reason ?? null });
  // } catch (err) {
  //   logger.error('Failed to record ack', { commandId, error: err.message });
  // }
  try {
    const command = await findCommandWithRetry(commandId);
    if (!command) {
      logger.warn('No effect_commands row found for commandId', { commandId });
      return;
    }
    await effectAckRepository.create({ effectCommandId: command.id, status, message: reason ?? null });
    const updated = await effectCommandRepository.updateStatusFromAck(command.id, status);
    if (!updated) {
      logger.info('Ack did not change command status (already final)', { commandId, current: command.status, ack: status });
    }
  } catch (err) {
    logger.error('Failed to record ack', { commandId, error: err.message });
  }
}

const ACK_STATUSES = new Set(['APPLIED', 'REJECTED', 'EXPIRED']);
// Waits between lookups when the ack beat the effect_commands INSERT (~1s total).
const LOOKUP_RETRY_DELAYS_MS = [50, 150, 300, 500];
// Extra time past a command's deadline before it counts as unacknowledged.
const ACK_GRACE_MS = 5000;
const NO_ACK_SWEEP_INTERVAL_MS = 5000;

let sweepTimer = null;

async function findCommandWithRetry(commandId) {
  let command = await effectCommandRepository.findByCommandId(commandId);
  for (const delayMs of LOOKUP_RETRY_DELAYS_MS) {
    if (command) {
      return command;
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    command = await effectCommandRepository.findByCommandId(commandId);
  }
  return command;
}

/** BR-EFF-03: SENT commands past their deadline with no ack -> NO_ACK. `sessionId` scopes it to one session. */
async function sweepUnacked(sessionId = null) {
  const count = await effectCommandRepository.markUnackedAsNoAck({ graceMs: ACK_GRACE_MS, sessionId });
  if (count > 0) {
    logger.warn(`Marked ${count} effect command(s) NO_ACK (Game sent no EFFECT_ACK)`, { sessionId });
  }
  return count;
}

/** Starts the periodic NO_ACK sweep. Call once at server startup. */
function init() {
  if (sweepTimer) {
    return;
  }
  sweepTimer = setInterval(() => {
    effectLog.sweepNoAck(ACK_GRACE_MS);
    sweepUnacked().catch((err) => logger.error('NO_ACK sweep failed', { error: err.message }));
  }, NO_ACK_SWEEP_INTERVAL_MS);
  sweepTimer.unref();
}

module.exports = { recordAck, sweepUnacked, init };
