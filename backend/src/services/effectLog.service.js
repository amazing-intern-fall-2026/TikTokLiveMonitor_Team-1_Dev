const socketService = require('../sockets/socket.service');
const { makeLogger } = require('../utils/logger');

const logger = makeLogger('effectLog');

const MAX_ENTRIES = 50;
// A command without expiresAt (CLEAR_ALL_EFFECTS) gets the same ack window
// effectCommand.repository.js#markUnackedAsNoAck uses for its NO_ACK sweep.
const FALLBACK_ACK_WINDOW_MS = 5000;
const KILL_SWITCH_TYPE = 'CLEAR_ALL_EFFECTS';
const OPEN_STATUSES = new Set(['SENT', 'NO_ACK']);

/**
 * BR-EFF-03 on the dashboard: the last MAX_ENTRIES effect commands and where
 * each one stands (SENT -> APPLIED | REJECTED | EXPIRED | NO_ACK), kept in
 * memory and pushed to /monitor as EFFECT_STATUS. Same transition rule as
 * effectCommandRepository.updateStatusFromAck, so the dashboard agrees with
 * the DB: only SENT/NO_ACK can still change, the first ack wins, a late ack
 * still corrects NO_ACK. In memory on purpose -- it also works when Postgres
 * is down, and the durable record is effect_commands/effect_acks.
 *
 * Map insertion order = issue order, so the oldest entry is always first.
 */
const items = new Map(); // commandId -> { entry, deadlineMs }

function publish(entry) {
  try {
    socketService.broadcastEvent('EFFECT_STATUS', entry);
  } catch (err) {
    // Socket.IO not initialized (unit tests / startup): the log still updates.
    logger.debug('EFFECT_STATUS not broadcast', { error: err.message });
  }
}

/** Registers a freshly sent (or already-EXPIRED-in-queue) command and tells every dashboard. */
function record(command, status = 'SENT') {
  if (!command?.commandId) {
    return;
  }
  const issuedAt = command.issuedAt ?? new Date().toISOString();
  const expiresMs = command.expiresAt ? Date.parse(command.expiresAt) : NaN;
  const entry = {
    commandId: command.commandId,
    kind: command.type === KILL_SWITCH_TYPE ? 'KILL_SWITCH' : 'EFFECT',
    effectCode: command.effectCode ?? command.type ?? null,
    ruleId: command.ruleId ?? null,
    summary: command.trigger?.summary ?? null,
    status,
    reason: null,
    issuedAt,
    updatedAt: new Date().toISOString(),
  };
  items.set(entry.commandId, {
    entry,
    deadlineMs: Number.isNaN(expiresMs) ? Date.parse(issuedAt) + FALLBACK_ACK_WINDOW_MS : expiresMs,
  });
  while (items.size > MAX_ENTRIES) {
    items.delete(items.keys().next().value);
  }
  publish(entry);
}

/** Applies a Game ack. Resolves true if the entry changed (false: unknown command, or status already final). */
function update(commandId, status, reason = null) {
  const item = items.get(commandId);
  if (!item || !OPEN_STATUSES.has(item.entry.status)) {
    return false;
  }
  item.entry = { ...item.entry, status, reason: reason ?? null, updatedAt: new Date().toISOString() };
  publish(item.entry);
  return true;
}

/** SENT commands whose ack window (+ graceMs) has passed become NO_ACK. Returns how many changed. */
function sweepNoAck(graceMs, nowMs = Date.now()) {
  let changed = 0;
  for (const item of items.values()) {
    if (item.entry.status === 'SENT' && nowMs > item.deadlineMs + graceMs) {
      item.entry = { ...item.entry, status: 'NO_ACK', updatedAt: new Date(nowMs).toISOString() };
      publish(item.entry);
      changed += 1;
    }
  }
  return changed;
}

/** Newest first -- sent to a /monitor client right after it connects (NFR-REL-03). */
function getRecent(limit = 20) {
  return [...items.values()].slice(-limit).reverse().map((item) => item.entry);
}

function clear() {
  items.clear();
}

module.exports = { record, update, sweepNoAck, getRecent, clear };
