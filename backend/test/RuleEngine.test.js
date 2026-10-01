'use strict';

/**
 * Unit tests for RuleEngine.service.js (threshold, cooldown, ROLLING window,
 * PAUSE_EFFECTS, dedup, dispatch throttle, hot reload). Runs with node:test --
 * no extra dependency. The engine is a module-level singleton, so every test
 * gets a fresh copy (see loadEngine) with the DB repositories and the socket
 * layer replaced by in-memory stubs, and Date/setInterval under mock.timers so
 * time-based behavior is deterministic.
 */

const { describe, it, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const SRC = path.resolve(__dirname, '../src');
const resolveSrc = (rel) => require.resolve(path.join(SRC, rel));

const T0 = 1_700_000_000_000;
const DISPATCH_TICK_MS = 333; // 1000 / MAX_EFFECTS_PER_SECOND (3)

let stubs;
let engine;
let seq = 0;

/** Replaces a module in require.cache so the engine's own require() gets the stub. */
function stubModule(rel, exports) {
  const file = resolveSrc(rel);
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
}

/** Loads a fresh RuleEngine (and its dedup state) whose findActive() returns `rules`. */
async function loadEngine(rules) {
  stubs = {
    rules,
    monitorEvents: [], // broadcastEvent(event, data)
    gameCommands: [], // broadcastGameCommand(event, data)
    logged: [], // effectCommandRepository.create(...)
  };
  stubModule('repositories/rule.repository.js', {
    findActive: async () => {
      if (stubs.dbError) throw stubs.dbError;
      return stubs.rules;
    },
  });
  stubModule('repositories/effectCommand.repository.js', {
    create: async (row) => {
      stubs.logged.push(row);
    },
  });
  stubModule('sockets/socket.service.js', {
    broadcastEvent: (event, data) => stubs.monitorEvents.push({ event, data }),
    broadcastGameCommand: (event, data) => stubs.gameCommands.push({ event, data }),
  });
  delete require.cache[resolveSrc('services/RuleEngine.service.js')];
  delete require.cache[resolveSrc('services/eventDedup.service.js')];
  engine = require(resolveSrc('services/RuleEngine.service.js'));
  await engine.init();
}

/** Advances mocked time and lets the dispatcher (setInterval) run. */
const advance = (ms) => mock.timers.tick(ms);
/** Drains the throttled dispatch queue: enough ticks for a handful of commands. */
const drain = (ticks = 10) => advance(DISPATCH_TICK_MS * ticks);

let rid = 0;
function makeRule({ eventType = 'CHAT', inner = {}, threshold, effect = {}, name } = {}) {
  rid += 1;
  return {
    id: rid,
    name: name ?? `rule-${rid}`,
    event_type: eventType,
    condition: { condition: inner, threshold },
    effect: { effectCode: `FX_${rid}`, polarity: 'BUFF', target: 'ALL_CHARACTERS', magnitude: 1, durationMs: 1000, priority: 0, cooldownMs: 0, ...effect },
    is_active: true,
  };
}

function envelope(type, { user = 'u1', payload = {}, sessionId = 'sess-1', eventId } = {}) {
  seq += 1;
  return {
    eventId: eventId ?? `evt-${seq}`,
    type,
    sessionId,
    user: { userId: user, uniqueId: user, nickname: user },
    payload,
  };
}

const comment = (text, opts) => envelope('COMMENT', { ...opts, payload: { text, textNormalized: text.toLowerCase() } });
const gift = (diamonds, opts = {}) =>
  envelope('GIFT', { ...opts, payload: { totalDiamondValue: diamonds, isStreakFinished: opts.isStreakFinished ?? true, giftId: opts.giftId ?? 1 } });
const join = (user, first = true) => envelope('JOIN', { user, payload: { isFirstJoinInSession: first } });

const fired = (code) => stubs.gameCommands.filter((c) => c.data.effectCode === code);
const progressFor = (ruleId) => stubs.monitorEvents.filter((e) => e.event === 'RULE_PROGRESS' && e.data.ruleId === ruleId);

beforeEach(() => {
  mock.timers.enable({ apis: ['Date', 'setInterval', 'setTimeout'], now: T0 });
});

afterEach(() => {
  mock.timers.reset();
});

describe('threshold', () => {
  it('fires exactly when EVENT_COUNT reaches the threshold', async () => {
    const rule = makeRule({ inner: { keywords: ['go'] }, threshold: { metric: 'EVENT_COUNT', value: 3, window: { type: 'SESSION' } } });
    await loadEngine([rule]);

    engine.processEvent(comment('go', { user: 'a' }));
    engine.processEvent(comment('go', { user: 'b' }));
    drain();
    assert.equal(stubs.gameCommands.length, 0, 'must not fire below the threshold');

    engine.processEvent(comment('go', { user: 'c' }));
    drain();
    assert.equal(fired(rule.effect.effectCode).length, 1);
    const command = stubs.gameCommands[0];
    assert.equal(command.event, 'EFFECT_COMMAND');
    assert.equal(command.data.ruleId, rule.id);
    assert.equal(command.data.sessionId, 'sess-1');
  });

  it('broadcasts RULE_PROGRESS with current/target after each contributing event', async () => {
    const rule = makeRule({ inner: { keywords: ['go'] }, threshold: { metric: 'EVENT_COUNT', value: 3, window: { type: 'SESSION' } } });
    await loadEngine([rule]);

    engine.processEvent(comment('go', { user: 'a' }));
    engine.processEvent(comment('go', { user: 'b' }));

    const progress = progressFor(rule.id).map((e) => [e.data.current, e.data.target]);
    assert.deepEqual(progress, [[1, 3], [2, 3]]);
  });

  it('ignores events that do not match the keyword and rules of another event type', async () => {
    const rule = makeRule({ inner: { keywords: ['go'] }, threshold: { metric: 'EVENT_COUNT', value: 1 } });
    await loadEngine([rule]);

    engine.processEvent(comment('hello world'));
    engine.processEvent(join('x'));
    engine.processEvent(gift(100));

    assert.equal(progressFor(rule.id).length, 0);
    drain();
    assert.equal(stubs.gameCommands.length, 0);
  });

  it('matchMode ALL needs every keyword, ANY needs one', async () => {
    const all = makeRule({ inner: { keywords: ['a1', 'b2'], matchMode: 'ALL' }, threshold: { metric: 'EVENT_COUNT', value: 1 } });
    const any = makeRule({ inner: { keywords: ['a1', 'b2'], matchMode: 'ANY' }, threshold: { metric: 'EVENT_COUNT', value: 1 } });
    await loadEngine([all, any]);

    engine.processEvent(comment('only a1 here'));
    drain();
    assert.equal(fired(all.effect.effectCode).length, 0);
    assert.equal(fired(any.effect.effectCode).length, 1);

    engine.processEvent(comment('a1 and b2', { user: 'other' }));
    drain();
    assert.equal(fired(all.effect.effectCode).length, 1);
  });

  it('GIFT DIAMOND_VALUE sums totalDiamondValue and skips in-progress streaks (BR-GF-01/03)', async () => {
    const rule = makeRule({ eventType: 'GIFT', threshold: { metric: 'DIAMOND_VALUE', value: 100, window: { type: 'SESSION' } } });
    await loadEngine([rule]);

    engine.processEvent(gift(60));
    engine.processEvent(gift(500, { isStreakFinished: false })); // combo animation only -- not counted
    drain();
    assert.equal(stubs.gameCommands.length, 0);

    engine.processEvent(gift(50));
    drain();
    assert.equal(fired(rule.effect.effectCode).length, 1);
  });

  it('SUBTRACT_THRESHOLD keeps the overflow, RESET_ZERO clears it', async () => {
    const keep = makeRule({ eventType: 'GIFT', threshold: { metric: 'DIAMOND_VALUE', value: 100, window: { type: 'SESSION' } }, effect: { resetMode: 'SUBTRACT_THRESHOLD' } });
    const reset = makeRule({ eventType: 'GIFT', threshold: { metric: 'DIAMOND_VALUE', value: 100, window: { type: 'SESSION' } }, effect: { resetMode: 'RESET_ZERO' } });
    await loadEngine([keep, reset]);

    engine.processEvent(gift(150));

    const snapshot = Object.fromEntries(engine.getProgressSnapshot().map((p) => [p.ruleId, p.current]));
    assert.equal(snapshot[keep.id], 50);
    assert.equal(snapshot[reset.id], 0);
  });

  it('JOIN UNIQUE_USER_COUNT counts distinct first-time joiners only (BR-JN-01)', async () => {
    const rule = makeRule({ eventType: 'JOIN', threshold: { metric: 'UNIQUE_USER_COUNT', value: 3, window: { type: 'SESSION' } } });
    await loadEngine([rule]);

    engine.processEvent(join('a'));
    engine.processEvent(join('a')); // same viewer again
    engine.processEvent(join('b', false)); // not their first join
    drain();
    assert.equal(stubs.gameCommands.length, 0);

    engine.processEvent(join('b'));
    engine.processEvent(join('c'));
    drain();
    assert.equal(fired(rule.effect.effectCode).length, 1);
  });

  it('keeps separate progress per session', async () => {
    const rule = makeRule({ inner: { keywords: ['go'] }, threshold: { metric: 'EVENT_COUNT', value: 2, window: { type: 'SESSION' } } });
    await loadEngine([rule]);

    engine.processEvent(comment('go', { user: 'a', sessionId: 'room-1' }));
    engine.processEvent(comment('go', { user: 'b', sessionId: 'room-2' }));
    drain();
    assert.equal(stubs.gameCommands.length, 0);

    engine.processEvent(comment('go', { user: 'c', sessionId: 'room-1' }));
    drain();
    assert.equal(stubs.gameCommands.length, 1);
    assert.equal(stubs.gameCommands[0].data.sessionId, 'room-1');
  });
});

describe('dedup and anti-spam', () => {
  it('counts a redelivered eventId only once (FR-19)', async () => {
    const rule = makeRule({ threshold: { metric: 'EVENT_COUNT', value: 2, window: { type: 'SESSION' } } });
    await loadEngine([rule]);

    const evt = comment('hello', { user: 'a', eventId: 'same-id' });
    engine.processEvent(evt);
    engine.processEvent(evt);
    drain();
    assert.equal(stubs.gameCommands.length, 0);
    assert.equal(progressFor(rule.id).length, 1);
  });

  it('same user + same keyword within 5s counts once, again after the window (BR-CM-03)', async () => {
    const rule = makeRule({ inner: { keywords: ['go'] }, threshold: { metric: 'EVENT_COUNT', value: 10, window: { type: 'SESSION' } } });
    await loadEngine([rule]);

    engine.processEvent(comment('go', { user: 'spammer' }));
    advance(2000);
    engine.processEvent(comment('go', { user: 'spammer' }));
    assert.equal(progressFor(rule.id).length, 1, 'second comment inside 5s is ignored');

    advance(4000); // 6s after the first
    engine.processEvent(comment('go', { user: 'spammer' }));
    assert.equal(progressFor(rule.id).length, 2);
  });
});

describe('cooldown and trigger cap', () => {
  it('blocks re-firing during cooldownMs and fires again after it', async () => {
    const rule = makeRule({ threshold: { metric: 'EVENT_COUNT', value: 1, window: { type: 'SESSION' } }, effect: { cooldownMs: 10000 } });
    await loadEngine([rule]);

    engine.processEvent(comment('x', { user: 'a' }));
    drain();
    assert.equal(fired(rule.effect.effectCode).length, 1);

    advance(3000);
    engine.processEvent(comment('x', { user: 'b' })); // threshold met again, but cooling down
    drain();
    assert.equal(fired(rule.effect.effectCode).length, 1);
    assert.equal(progressFor(rule.id).at(-1).data.onCooldown, true);

    advance(10000);
    engine.processEvent(comment('x', { user: 'c' }));
    drain();
    assert.equal(fired(rule.effect.effectCode).length, 2);
  });

  it('stops after maxTriggersPerSession', async () => {
    const rule = makeRule({ threshold: { metric: 'EVENT_COUNT', value: 1, window: { type: 'SESSION' } }, effect: { maxTriggersPerSession: 2 } });
    await loadEngine([rule]);

    for (const user of ['a', 'b', 'c', 'd']) {
      engine.processEvent(comment('x', { user }));
    }
    drain();
    assert.equal(fired(rule.effect.effectCode).length, 2);
  });
});

describe('ROLLING window', () => {
  const rolling = (seconds, value = 3) => ({ metric: 'EVENT_COUNT', value, window: { type: 'ROLLING', seconds } });

  it('fires when enough events land inside the window', async () => {
    const rule = makeRule({ threshold: rolling(10) });
    await loadEngine([rule]);

    engine.processEvent(comment('x', { user: 'a' }));
    advance(3000);
    engine.processEvent(comment('x', { user: 'b' }));
    advance(3000);
    engine.processEvent(comment('x', { user: 'c' }));
    drain();
    assert.equal(fired(rule.effect.effectCode).length, 1);
  });

  it('drops events older than the window so a slow trickle never fires', async () => {
    const rule = makeRule({ threshold: rolling(10) });
    await loadEngine([rule]);

    engine.processEvent(comment('x', { user: 'a' })); // t=0
    advance(6000);
    engine.processEvent(comment('x', { user: 'b' })); // t=6
    advance(6000);
    engine.processEvent(comment('x', { user: 'c' })); // t=12 -> t=0 has expired, only 2 inside
    advance(DISPATCH_TICK_MS); // one dispatch tick (keeps the mocked clock close to t=12)
    assert.equal(stubs.gameCommands.length, 0);
    assert.equal(progressFor(rule.id).at(-1).data.current, 2);

    advance(1000);
    engine.processEvent(comment('x', { user: 'd' })); // t~13.3 -> t=6, 12, 13.3 are inside the 10s window
    advance(DISPATCH_TICK_MS);
    assert.equal(fired(rule.effect.effectCode).length, 1);
  });

  it('contrast: a SESSION window never expires old events', async () => {
    const rule = makeRule({ threshold: { metric: 'EVENT_COUNT', value: 3, window: { type: 'SESSION' } } });
    await loadEngine([rule]);

    engine.processEvent(comment('x', { user: 'a' }));
    advance(60000);
    engine.processEvent(comment('x', { user: 'b' }));
    advance(60000);
    engine.processEvent(comment('x', { user: 'c' }));
    drain();
    assert.equal(fired(rule.effect.effectCode).length, 1);
  });
});

describe('PAUSE_EFFECTS (FR-32)', () => {
  it('queues no effect while paused, but still accumulates and broadcasts progress', async () => {
    const rule = makeRule({ threshold: { metric: 'EVENT_COUNT', value: 2, window: { type: 'SESSION' } } });
    await loadEngine([rule]);

    engine.setEffectsPaused(true);
    assert.equal(engine.isEffectsPaused(), true);
    assert.ok(stubs.monitorEvents.some((e) => e.event === 'EFFECT_PAUSE_STATE' && e.data.paused === true));

    engine.processEvent(comment('x', { user: 'a' }));
    engine.processEvent(comment('x', { user: 'b' }));
    engine.processEvent(comment('x', { user: 'c' }));
    drain();

    assert.equal(stubs.gameCommands.length, 0);
    assert.deepEqual(progressFor(rule.id).map((e) => e.data.current), [1, 2, 3]);
  });

  it('a rule already at its threshold fires on the first qualifying event after resume', async () => {
    const rule = makeRule({ threshold: { metric: 'EVENT_COUNT', value: 2, window: { type: 'SESSION' } } });
    await loadEngine([rule]);

    engine.setEffectsPaused(true);
    engine.processEvent(comment('x', { user: 'a' }));
    engine.processEvent(comment('x', { user: 'b' })); // at threshold while paused
    drain();
    assert.equal(stubs.gameCommands.length, 0);

    engine.setEffectsPaused(false);
    assert.equal(engine.isEffectsPaused(), false);
    assert.ok(stubs.monitorEvents.some((e) => e.event === 'EFFECT_PAUSE_STATE' && e.data.paused === false));

    engine.processEvent(comment('x', { user: 'c' }));
    drain();
    assert.equal(fired(rule.effect.effectCode).length, 1);
  });

  it('does not recall commands that were already queued before the pause', async () => {
    const rule = makeRule({ threshold: { metric: 'EVENT_COUNT', value: 1, window: { type: 'SESSION' } } });
    await loadEngine([rule]);

    engine.processEvent(comment('x', { user: 'a' })); // queued, not yet dispatched
    engine.setEffectsPaused(true);
    drain();
    assert.equal(fired(rule.effect.effectCode).length, 1);
  });
});

describe('dispatch queue (FR-29)', () => {
  it('sends at most one command per tick, highest priority first, and logs each as SENT', async () => {
    const low = makeRule({ threshold: { metric: 'EVENT_COUNT', value: 1 }, effect: { priority: 1 } });
    const high = makeRule({ threshold: { metric: 'EVENT_COUNT', value: 1 }, effect: { priority: 9 } });
    await loadEngine([low, high]);

    engine.processEvent(comment('x'));
    assert.equal(stubs.gameCommands.length, 0, 'nothing is sent before the first tick');

    advance(DISPATCH_TICK_MS);
    assert.equal(stubs.gameCommands.length, 1);
    assert.equal(stubs.gameCommands[0].data.effectCode, high.effect.effectCode);

    advance(DISPATCH_TICK_MS);
    assert.equal(stubs.gameCommands.length, 2);
    assert.equal(stubs.gameCommands[1].data.effectCode, low.effect.effectCode);
    assert.deepEqual(stubs.logged.map((l) => l.status), ['SENT', 'SENT']);
  });

  it('sets expiresAt 5s after issuedAt and never forwards dbSessionId to the Game Client', async () => {
    const rule = makeRule({ threshold: { metric: 'EVENT_COUNT', value: 1 } });
    await loadEngine([rule]);

    engine.processEvent(comment('x'), 42);
    drain();

    const { data } = stubs.gameCommands[0];
    assert.equal(new Date(data.expiresAt) - new Date(data.issuedAt), 5000);
    assert.equal('dbSessionId' in data, false);
    assert.equal(stubs.logged[0].sessionId, 42);
  });
});

describe('hot reload', () => {
  it('picks up a newly added rule without restarting', async () => {
    await loadEngine([]);
    engine.processEvent(comment('x'));
    drain();
    assert.equal(stubs.gameCommands.length, 0);

    const rule = makeRule({ threshold: { metric: 'EVENT_COUNT', value: 1 } });
    stubs.rules = [rule];
    assert.equal(await engine.reload(), true);

    engine.processEvent(comment('y', { user: 'b' }));
    drain();
    assert.equal(fired(rule.effect.effectCode).length, 1);
  });

  it('stops firing a rule once it is removed from the active set', async () => {
    const rule = makeRule({ threshold: { metric: 'EVENT_COUNT', value: 1 } });
    await loadEngine([rule]);

    stubs.rules = [];
    await engine.reload();
    engine.processEvent(comment('x'));
    drain();
    assert.equal(stubs.gameCommands.length, 0);
  });

  it('discards already-queued commands of a rule that was disabled', async () => {
    const rule = makeRule({ threshold: { metric: 'EVENT_COUNT', value: 1 } });
    await loadEngine([rule]);

    engine.processEvent(comment('x')); // queued, not dispatched yet
    stubs.rules = [];
    await engine.reload();
    drain();
    assert.equal(stubs.gameCommands.length, 0);
  });

  it('resets progress of an edited rule but keeps it for unchanged ones', async () => {
    const edited = makeRule({ threshold: { metric: 'EVENT_COUNT', value: 5, window: { type: 'SESSION' } } });
    const untouched = makeRule({ threshold: { metric: 'EVENT_COUNT', value: 5, window: { type: 'SESSION' } } });
    await loadEngine([edited, untouched]);

    engine.processEvent(comment('x', { user: 'a' }));
    engine.processEvent(comment('x', { user: 'b' }));

    stubs.rules = [
      { ...edited, condition: { ...edited.condition, threshold: { metric: 'EVENT_COUNT', value: 9, window: { type: 'SESSION' } } } },
      JSON.parse(JSON.stringify(untouched)), // same content, new object (as a fresh DB read would be)
    ];
    await engine.reload();

    const snapshot = Object.fromEntries(engine.getProgressSnapshot().map((p) => [p.ruleId, p]));
    assert.equal(snapshot[edited.id].current, 0);
    assert.equal(snapshot[edited.id].target, 9);
    assert.equal(snapshot[untouched.id].current, 2);
  });

  it('keeps the previous rule set when the DB read fails, and reports it', async () => {
    const rule = makeRule({ threshold: { metric: 'EVENT_COUNT', value: 1 } });
    await loadEngine([rule]);

    stubs.dbError = new Error('db down');
    assert.equal(await engine.reload(), false);
    stubs.dbError = null;

    engine.processEvent(comment('x'));
    drain();
    assert.equal(fired(rule.effect.effectCode).length, 1, 'the old rule still works');
  });
});
