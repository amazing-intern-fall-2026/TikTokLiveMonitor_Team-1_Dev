'use strict';

/** Unit tests for effectLog.service.js: the dashboard's Effect log (BR-EFF-03). */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const SRC = path.resolve(__dirname, '../src');
const resolveSrc = (rel) => require.resolve(path.join(SRC, rel));

let broadcasts;
let effectLog;

function load({ broadcastThrows = false } = {}) {
  broadcasts = [];
  const file = resolveSrc('sockets/socket.service.js');
  require.cache[file] = {
    id: file,
    filename: file,
    loaded: true,
    exports: {
      broadcastEvent: (event, data) => {
        if (broadcastThrows) throw new Error('Socket.io is not initialized');
        broadcasts.push({ event, data });
      },
    },
  };
  delete require.cache[resolveSrc('services/effectLog.service.js')];
  effectLog = require(resolveSrc('services/effectLog.service.js'));
}

const T0 = Date.parse('2026-10-02T10:00:00.000Z');
const command = (id, extra = {}) => ({
  commandId: id,
  ruleId: 3,
  effectCode: 'HEAL_HP',
  issuedAt: new Date(T0).toISOString(),
  expiresAt: new Date(T0 + 5000).toISOString(),
  trigger: { summary: 'Rule "Heal" threshold reached' },
  ...extra,
});

describe('effectLog', () => {
  beforeEach(() => load());

  it('record() stores a SENT entry and broadcasts EFFECT_STATUS without internal fields', () => {
    effectLog.record(command('c1'));
    assert.equal(broadcasts.length, 1);
    assert.equal(broadcasts[0].event, 'EFFECT_STATUS');
    assert.deepEqual(
      { ...broadcasts[0].data, updatedAt: undefined },
      {
        commandId: 'c1',
        kind: 'EFFECT',
        effectCode: 'HEAL_HP',
        ruleId: 3,
        summary: 'Rule "Heal" threshold reached',
        status: 'SENT',
        reason: null,
        issuedAt: new Date(T0).toISOString(),
        updatedAt: undefined,
      }
    );
  });

  it('labels the kill switch and records an in-queue EXPIRED as final', () => {
    effectLog.record({ commandId: 'k1', type: 'CLEAR_ALL_EFFECTS', issuedAt: new Date(T0).toISOString() });
    effectLog.record(command('c2'), 'EXPIRED');
    const [expired, kill] = effectLog.getRecent();
    assert.equal(kill.kind, 'KILL_SWITCH');
    assert.equal(kill.effectCode, 'CLEAR_ALL_EFFECTS');
    assert.equal(expired.status, 'EXPIRED');
    assert.equal(effectLog.update('c2', 'APPLIED'), false, 'EXPIRED is final');
  });

  it('update() applies the first ack, ignores later ones, and ignores unknown commands', () => {
    effectLog.record(command('c1'));
    assert.equal(effectLog.update('c1', 'REJECTED', 'busy'), true);
    assert.equal(effectLog.update('c1', 'APPLIED'), false);
    assert.equal(effectLog.update('nope', 'APPLIED'), false);
    const [entry] = effectLog.getRecent();
    assert.equal(entry.status, 'REJECTED');
    assert.equal(entry.reason, 'busy');
    assert.equal(broadcasts.filter((b) => b.data.commandId === 'c1').length, 2);
  });

  it('sweepNoAck() marks only overdue SENT commands, and a late ack still corrects NO_ACK', () => {
    effectLog.record(command('c1'));
    effectLog.record(command('c2', { expiresAt: new Date(T0 + 60_000).toISOString() }));
    assert.equal(effectLog.sweepNoAck(5000, T0 + 10_000), 0, 'still inside expiresAt + grace');
    assert.equal(effectLog.sweepNoAck(5000, T0 + 10_001), 1);
    assert.equal(effectLog.sweepNoAck(5000, T0 + 10_002), 0, 'already NO_ACK');
    const byId = Object.fromEntries(effectLog.getRecent().map((e) => [e.commandId, e.status]));
    assert.deepEqual(byId, { c1: 'NO_ACK', c2: 'SENT' });
    assert.equal(effectLog.update('c1', 'APPLIED'), true);
  });

  it('a command without expiresAt (kill switch) gets a 5s ack window', () => {
    effectLog.record({ commandId: 'k1', type: 'CLEAR_ALL_EFFECTS', issuedAt: new Date(T0).toISOString() });
    assert.equal(effectLog.sweepNoAck(0, T0 + 5000), 0);
    assert.equal(effectLog.sweepNoAck(0, T0 + 5001), 1);
  });

  it('keeps only the newest 50 entries and returns them newest first', () => {
    for (let i = 0; i < 60; i++) effectLog.record(command(`c${i}`));
    const all = effectLog.getRecent(100);
    assert.equal(all.length, 50);
    assert.equal(all[0].commandId, 'c59');
    assert.equal(all[49].commandId, 'c10');
    assert.equal(effectLog.getRecent(3).length, 3);
  });

  it('still records when Socket.IO is not initialized', () => {
    load({ broadcastThrows: true });
    effectLog.record(command('c1'));
    assert.equal(effectLog.getRecent().length, 1);
  });

  it('ignores a command without commandId', () => {
    effectLog.record({ effectCode: 'X' });
    assert.equal(effectLog.getRecent().length, 0);
  });
});
