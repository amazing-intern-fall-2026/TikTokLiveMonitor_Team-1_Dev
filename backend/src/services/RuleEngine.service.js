const crypto = require('crypto');
const { normalizeText } = require('../utils/text');
const ruleRepository = require('../repositories/rule.repository');
const effectCommandRepository = require('../repositories/effectCommand.repository');
const { broadcastEvent, broadcastGameCommand } = require('../sockets/socket.service');
const { makeLogger } = require('../utils/logger');
const eventDedup = require('./eventDedup.service');
const effectLog = require('./effectLog.service');

const logger = makeLogger('RuleEngine');

/**
 * Envelope `type` (SRS 4.1: COMMENT | JOIN | GIFT) vs. the `rules.event_type`
 * column, which was migrated using the raw Socket.IO channel names
 * (CHAT | GIFT | JOIN) instead -- translate rather than rename the column,
 * since nothing else depends on renaming it.
 */
const ENVELOPE_TYPE_TO_RULE_EVENT_TYPE = { COMMENT: 'CHAT', GIFT: 'GIFT', JOIN: 'JOIN' };

const ANTI_SPAM_WINDOW_MS = 5000; // BR-CM-03: same user+keyword within 5s counts once
const COMMAND_EXPIRY_MS = 5000; // BR-EFF-02: how long an EffectCommand stays valid after issuedAt
const MAX_EFFECTS_PER_SECOND = 3; // FR-29
const DISPATCH_INTERVAL_MS = Math.floor(1000 / MAX_EFFECTS_PER_SECOND);

/**
 * Active rules, cached in RAM so processEvent() never hits Postgres. Loaded
 * at startup (init()) and re-read by reload() whenever the Rule CRUD API
 * (rule.controller.js) changes a rule, so edits take effect without a restart
 * (NFR-MNT-01: effectCode changes are config, not code).
 */
let activeRules = [];

/**
 * In-RAM threshold counters, keyed by `${ruleId}:${envelope.sessionId}` --
 * envelope.sessionId (not the numeric DB sessions.id) is used because mock
 * events from /api/test-events/* have no DB session at all, and the engine
 * must work identically for both. Each entry:
 *   { total, totalValue, uniqueUsers: Set, history: [{ts,userId,value}],
 *     cooldownUntil, triggerCount }
 * `history` is only populated for ROLLING-window rules (see accumulate()).
 */
const counters = new Map();

/** BR-CM-03 anti-spam log: `${ruleId}:${userId}:${keyword}` -> last-seen timestamp. */
const throttleLog = new Map();

/** Pending EffectCommands, drained at MAX_EFFECTS_PER_SECOND (FR-29). */
const effectQueue = [];
let dispatchTimer = null;

/**
 * FR-32: "Tạm dừng effect" -- while true, events are still received,
 * accumulated into counters and broadcast to /monitor as usual (so
 * Operator keeps seeing the feed + progress bars), but no rule is allowed
 * to actually fire an EffectCommand. See evaluateThreshold(), the single
 * gate point. NOT the same as FR-33 kill switch (effect.controller.js),
 * which clears effects already running on the Game Client -- pause only
 * stops *new* effects from being queued.
 */
let effectsPaused = false;

/** FR-32: toggles the pause flag and tells /monitor immediately so every open dashboard reflects it without polling. */
function setEffectsPaused(paused) {
  effectsPaused = Boolean(paused);
  broadcastEvent('EFFECT_PAUSE_STATE', { paused: effectsPaused, issuedAt: new Date().toISOString() });
  logger.info(`Effects ${effectsPaused ? 'paused' : 'resumed'} by operator`);
  return effectsPaused;
}

/**
 * FR-33 / AC-08: drops every EffectCommand still waiting in the dispatch
 * queue and returns how many were dropped. Without this, commands queued
 * before the kill switch (drained at 3/s) would keep reaching the Game
 * Client right after CLEAR_ALL_EFFECTS.
 */
function clearEffectQueue() {
  const dropped = effectQueue.length;
  effectQueue.length = 0;
  return dropped;
}

function isEffectsPaused() {
  return effectsPaused;
}

/** Monotonic id so that if two reloads overlap, only the most recently *started* one may publish its result. */
let reloadSeq = 0;

/** Same rule definition? Compared by content so a no-op PUT doesn't wipe running progress. */
function sameRule(a, b) {
  return (
    a.name === b.name &&
    a.event_type === b.event_type &&
    JSON.stringify(a.condition) === JSON.stringify(b.condition) &&
    JSON.stringify(a.effect) === JSON.stringify(b.effect)
  );
}

/**
 * Drops runtime state tied to rules that were removed, disabled or edited.
 * Edited rules restart from zero (their old progress was measured against
 * the old threshold/condition); unchanged rules keep counters and cooldowns.
 */
function discardStateFor(staleRuleIds) {
  if (staleRuleIds.size === 0) {
    return;
  }
  const prefixes = [...staleRuleIds].map((id) => `${id}:`);
  const isStale = (key) => prefixes.some((p) => key.startsWith(p));
  for (const key of [...counters.keys()]) {
    if (isStale(key)) counters.delete(key);
  }
  for (const key of [...throttleLog.keys()]) {
    if (isStale(key)) throttleLog.delete(key);
  }
  // Commands already queued for a rule that no longer exists / is disabled must not fire.
  for (let i = effectQueue.length - 1; i >= 0; i--) {
    if (staleRuleIds.has(effectQueue[i].ruleId)) effectQueue.splice(i, 1);
  }
}

/**
 * Hot reload: re-reads the active rule set from Postgres and swaps it in
 * atomically. Never throws -- on a DB error the previous rule set stays
 * active (the change is already saved; the next reload picks it up) and
 * false is returned.
 */
async function reload() {
  const seq = ++reloadSeq;
  let rules;
  try {
    rules = await ruleRepository.findActive();
  } catch (err) {
    logger.error('Failed to reload rules, keeping the previous rule set', { error: err.message });
    return false;
  }
  if (seq !== reloadSeq) {
    return true; // a newer reload started meanwhile and will publish a fresher result
  }

  const nextById = new Map(rules.map((r) => [r.id, r]));
  const stale = new Set();
  for (const old of activeRules) {
    const next = nextById.get(old.id);
    if (!next || !sameRule(old, next)) {
      stale.add(old.id);
    }
  }
  discardStateFor(stale);

  activeRules = rules;
  logger.info(`Loaded ${activeRules.length} active rule(s)`);
  return true;
}

/** Loads the active rule set and starts the throttled dispatcher. Call once at server startup. */
async function init() {
  if (!(await reload())) {
    logger.error('Initial rule load failed, engine will run with 0 rules until the next reload');
  }

  if (!dispatchTimer) {
    dispatchTimer = setInterval(dispatchNext, DISPATCH_INTERVAL_MS);
  }
}

/**
 * Entry point: called once per CHAT/GIFT/MEMBER_JOIN envelope (real or
 * mock) right after it's broadcast to /monitor. Evaluates every active rule
 * whose event_type matches, accumulates thresholds, and enqueues an
 * EffectCommand for any rule that just crossed its threshold.
 *
 * @param {object} envelope
 * @param {number|null} [dbSessionId] the numeric `sessions.id` (not
 *   envelope.sessionId, which is a string and always present) -- only real
 *   connector events have one; mock events pass nothing, so any resulting
 *   effect_commands row simply has no session_id (FR-35/FR-36 apply to real
 *   sessions).
 */
function processEvent(envelope, dbSessionId = null) {
  const dbEventType = ENVELOPE_TYPE_TO_RULE_EVENT_TYPE[envelope.type];
  if (!dbEventType) {
    return;
  }

  // FR-19: a redelivered envelope (e.g. a connector-level retry) must not
  // be counted toward any rule's threshold a second time.
  if (eventDedup.isDuplicate(envelope.eventId)) {
    logger.debug('Duplicate eventId, skipping threshold accumulation', { eventId: envelope.eventId });
    return;
  }

  for (const rule of activeRules) {
    if (rule.event_type !== dbEventType) {
      continue;
    }

    const match = matchCondition(rule, envelope);
    if (!match.matched) {
      continue;
    }

    if (isThrottled(rule, envelope, match)) {
      continue;
    }

    const counter = accumulate(rule, envelope, match);
    broadcastProgress(rule, counter);
    evaluateThreshold(rule, envelope, counter, dbSessionId);
  }
}

/**
 * Checks the event against `rules.condition` (see the JSON shape documented
 * at the top of the seed data / README): { keywords, matchMode, userFilter }
 * for COMMENT rules, an optional { giftId, giftTier } for GIFT rules, no
 * fields at all for JOIN rules (every first-join event matches).
 * Returns { matched, matchedKeyword?, value } -- `value` is what gets
 * accumulated (1 for COMMENT/JOIN, totalDiamondValue for GIFT).
 */
function matchCondition(rule, envelope) {
  const condition = rule.condition?.condition || {};
  const payload = envelope.payload || {};

  if (envelope.type === 'COMMENT') {
    if (condition.userFilter === 'EXCLUDE_MODERATOR' && envelope.user?.isModerator) {
      return { matched: false };
    }

    const keywords = condition.keywords;
    if (!keywords || keywords.length === 0) {
      // No keyword filter configured -> any comment matches (SRS R-03).
      return { matched: true, value: 1 };
    }

    const text = payload.textNormalized || '';
    const matchMode = condition.matchMode || 'ANY';
    const hits = keywords.filter((kw) => text.includes(normalizeText(String(kw))));
    const matched = matchMode === 'ALL' ? hits.length === keywords.length : hits.length > 0;
    return matched ? { matched: true, value: 1, matchedKeyword: hits[0] } : { matched: false };
  }

  if (envelope.type === 'GIFT') {
    // BR-GF-01: intermediate streak events (isStreakFinished === false) only
    // update the combo animation on the monitor feed -- never count here.
    if (payload.isStreakFinished === false) {
      return { matched: false };
    }
    if (condition.giftId !== undefined && String(condition.giftId) !== String(payload.giftId)) {
      return { matched: false };
    }
    if (condition.giftTier && condition.giftTier !== payload.giftTier) {
      return { matched: false };
    }
    // BR-GF-03: threshold is measured in diamonds, never gift count.
    return { matched: true, value: Number(payload.totalDiamondValue) || 0 };
  }

  if (envelope.type === 'JOIN') {
    // BR-JN-01: only a viewer's first join in the session counts.
    if (!payload.isFirstJoinInSession) {
      return { matched: false };
    }
    return { matched: true, value: 1 };
  }

  return { matched: false };
}

/** BR-CM-03: same user + same matched keyword within 5s counts once toward the threshold. */
function isThrottled(rule, envelope, match) {
  if (envelope.type !== 'COMMENT' || !match.matchedKeyword) {
    return false;
  }
  const key = `${rule.id}:${envelope.user?.userId}:${match.matchedKeyword}`;
  const now = Date.now();
  const lastSeen = throttleLog.get(key);
  if (lastSeen !== undefined && now - lastSeen < ANTI_SPAM_WINDOW_MS) {
    return true; // within the window — don't extend it
  }
  throttleLog.set(key, now); // new window starts from this event
  return false;
}

/** Adds this event's contribution to the rule's counter and returns the updated counter. */
function accumulate(rule, envelope, match) {
  const key = `${rule.id}:${envelope.sessionId}`;
  let counter = counters.get(key);
  if (!counter) {
    counter = { total: 0, totalValue: 0, uniqueUsers: new Set(), history: [], cooldownUntil: 0, triggerCount: 0 };
    counters.set(key, counter);
  }

  const threshold = rule.condition?.threshold || {};
  const userId = envelope.user?.userId;

  if (threshold.window?.type === 'ROLLING') {
    const windowMs = (threshold.window.seconds || 60) * 1000;
    const cutoff = Date.now() - windowMs;
    counter.history.push({ ts: Date.now(), userId, value: match.value });
    counter.history = counter.history.filter((h) => h.ts >= cutoff);
    counter.total = counter.history.length;
    counter.totalValue = counter.history.reduce((sum, h) => sum + h.value, 0);
    counter.uniqueUsers = new Set(counter.history.map((h) => h.userId));
  } else {
    // SESSION window: accumulate for the lifetime of the session, no pruning.
    counter.total += 1;
    counter.totalValue += match.value;
    if (userId) {
      counter.uniqueUsers.add(userId);
    }
  }

  return counter;
}

/**
 * FR-23: pushes the rule's current progress toward its threshold to
 * /monitor after every contributing event, so the dashboard can render a
 * live progress bar per rule instead of only finding out once it fires.
 */
function broadcastProgress(rule, counter) {
  const threshold = rule.condition?.threshold || {};
  broadcastEvent('RULE_PROGRESS', {
    ruleId: rule.id,
    ruleName: rule.name,
    metric: threshold.metric || 'EVENT_COUNT',
    current: metricValue(rule, counter),
    target: threshold.value ?? null,
    onCooldown: Date.now() < counter.cooldownUntil,
  });
}

/** Reads the metric this rule actually thresholds on (SRS 6.2: threshold.metric). */
function metricValue(rule, counter) {
  const metric = rule.condition?.threshold?.metric;
  if (metric === 'UNIQUE_USER_COUNT') return counter.uniqueUsers.size;
  if (metric === 'DIAMOND_VALUE') return counter.totalValue;
  return counter.total; // EVENT_COUNT (default)
}

/** Fires the rule (enqueues an EffectCommand) if its threshold is met and it isn't on cooldown / already maxed out. */
function evaluateThreshold(rule, envelope, counter, dbSessionId) {
  const threshold = rule.condition?.threshold || {};
  const now = Date.now();

  if (metricValue(rule, counter) < (threshold.value ?? Infinity)) {
    return;
  }
  // FR-32: threshold met but effects paused -- do NOT fire, and deliberately
  // do NOT reset/cooldown the counter either (mirrors the cooldown branch
  // below): once resumed, a rule that was sitting at 100% while paused
  // should fire on the very next qualifying event, not wait to re-accumulate.
  if (effectsPaused) {
    return;
  }
  if (now < counter.cooldownUntil) {
    return;
  }
  const effect = rule.effect || {};
  if (effect.maxTriggersPerSession && counter.triggerCount >= effect.maxTriggersPerSession) {
    return;
  }

  fireRule(rule, envelope, counter, threshold, effect, dbSessionId);
}

function fireRule(rule, envelope, counter, threshold, effect, dbSessionId) {
  counter.cooldownUntil = Date.now() + (effect.cooldownMs || 0);
  counter.triggerCount += 1;
  // Only SESSION-window counters need an explicit reset -- a ROLLING window
  // recomputes total/totalValue/uniqueUsers from `history` on every
  // accumulate() call, so resetting those fields here would just be
  // overwritten by the next event anyway; cooldownMs already prevents an
  // immediate re-trigger while the window naturally slides.
  if (threshold.window?.type !== 'ROLLING') {
    resetCounter(counter, threshold, effect);
  }

  const issuedAt = new Date();
  const command = {
    commandId: crypto.randomUUID(),
    sessionId: envelope.sessionId,
    dbSessionId,
    ruleId: rule.id,
    effectCode: effect.effectCode,
    polarity: effect.polarity,
    target: effect.target,
    magnitude: effect.magnitude,
    durationMs: effect.durationMs,
    priority: effect.priority ?? 0,
    issuedAt: issuedAt.toISOString(),
    expiresAt: new Date(issuedAt.getTime() + COMMAND_EXPIRY_MS).toISOString(),
    trigger: {
      source: envelope.type,
      summary: `Rule "${rule.name}" threshold reached`,
      topContributor: { uniqueId: envelope.user?.uniqueId, nickname: envelope.user?.nickname },
    },
  };

  effectQueue.push(command);
  logger.info(`Rule fired`, { ruleName: rule.name, ruleId: rule.id, effectCode: command.effectCode });
}

/** SRS resetMode: RESET_ZERO clears the counter, SUBTRACT_THRESHOLD keeps the overflow (fair for big GIFT spenders, BR-RULE-01). */
function resetCounter(counter, threshold, effect) {
  if (effect.resetMode === 'SUBTRACT_THRESHOLD') {
    counter.total = Math.max(0, counter.total - (threshold.value || 0));
    counter.totalValue = Math.max(0, counter.totalValue - (threshold.value || 0));
  } else {
    counter.total = 0;
    counter.totalValue = 0;
    counter.uniqueUsers.clear();
  }
  counter.history = [];
}

/** FR-29: pops at most one command per tick (MAX_EFFECTS_PER_SECOND overall), highest priority first, skipping anything already expired. */
function dispatchNext() {
  while (effectQueue.length > 0) {
    effectQueue.sort((a, b) => b.priority - a.priority);
    const { dbSessionId, ...command } = effectQueue.shift();

    if (new Date(command.expiresAt).getTime() < Date.now()) {
      logCommand(command, 'EXPIRED', dbSessionId);
      continue; // an expired command doesn't consume this tick's dispatch slot
    }

    broadcastGameCommand('EFFECT_COMMAND', command);
    logCommand(command, 'SENT', dbSessionId);
    return;
  }
}

function logCommand(command, status, dbSessionId) {
  effectLog.record(command, status); // dashboard Effect log (BR-EFF-03), before the best-effort DB write
  effectCommandRepository
    .create({ ruleId: command.ruleId, sessionId: dbSessionId, payload: command, status })
    .catch((err) => logger.error('Failed to log effect command', { error: err.message, commandId: command.commandId }));
}

/**
 * NFR-REL-03: called when a /monitor client connects/reconnects, so it can
 * be sent every active rule's current progress immediately instead of
 * showing a stale/empty progress bar until the next contributing event.
 * v1.0 only ever monitors one LIVE room at a time (SRS AS-01, see
 * envelope.js), so at most one counter entry exists per ruleId -- no
 * session id is needed to pick the right one.
 */
function getProgressSnapshot() {
  return activeRules.map((rule) => {
    const key = [...counters.keys()].find((k) => k.startsWith(`${rule.id}:`));
    const counter = key ? counters.get(key) : { total: 0, totalValue: 0, uniqueUsers: new Set(), cooldownUntil: 0 };
    const threshold = rule.condition?.threshold || {};
    return {
      ruleId: rule.id,
      ruleName: rule.name,
      metric: threshold.metric || 'EVENT_COUNT',
      current: metricValue(rule, counter),
      target: threshold.value ?? null,
      onCooldown: Date.now() < counter.cooldownUntil,
    };
  });
}

module.exports = {
  init,
  reload,
  processEvent,
  getProgressSnapshot,
  setEffectsPaused,
  isEffectsPaused,
  clearEffectQueue,
};
