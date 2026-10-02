'use strict';

/**
 * Unit tests for effectAck.service.js (BR-EFF-03): an EFFECT_ACK updates
 * effect_commands.status, unknown statuses are ignored, an ack that beats the
 * effect_commands INSERT is retried, and the NO_ACK sweep. Repositories are
 * replaced by in-memory stubs via require.cache, same as RuleEngine.test.js.
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const SRC = path.resolve(__dirname, '../src');
const resolveSrc = (rel) => require.resolve(path.join(SRC, rel));

let stubs;
let service;

function stubModule(rel, exports) {
  const file = resolveSrc(rel);
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
}

/** `rows` = effect_commands rows by commandId; `appearAfter` = lookups that miss before a row is "inserted". */
function loadService({ rows = {}, appearAfter = 0 } = {}) {
  stubs = { rows, lookups: 0, acks: [], statusUpdates: [], sweeps: [] };
  stubModule('repositories/effectCommand.repository.js', {
    findByCommandId: async (commandId) => {
      stubs.lookups += 1;
      return stubs.lookups > appearAfter ? stubs.rows[commandId] : undefined;
    },
    updateStatusFromAck: async (id, status) => {
      stubs.statusUpdates.push({ id, status });
      const row = Object.values(stubs.rows).find((r) => r.id === id);
      if (!row || !['SENT', 'NO_ACK'].includes(row.status)) {
        return undefined;
      }
      row.status = status;
      return row;
    },
    markUnackedAsNoAck: async (args) => {
      stubs.sweeps.push(args);
      return 2;
    },
  });
  stubModule('repositories/effectAck.repository.js', {
    create: async (row) => stubs.acks.push(row),
  });
  delete require.cache[resolveSrc('services/effectAck.service.js')];
  service = require(resolveSrc('services/effectAck.service.js'));
}

describe('effectAck.recordAck (BR-EFF-03)', () => {
  beforeEach(() => loadService({ rows: { c1: { id: 11, status: 'SENT' } } }));

  for (const status of ['APPLIED', 'REJECTED', 'EXPIRED']) {
    it(`logs the ack and moves the command SENT -> ${status}`, async () => {
      await service.recordAck({ commandId: 'c1', status, reason: 'r' });
      assert.deepEqual(stubs.acks, [{ effectCommandId: 11, status, message: 'r' }]);
      assert.equal(stubs.rows.c1.status, status);
    });
  }

  it('keeps the first ack when a duplicate arrives, but still logs the duplicate', async () => {
    await service.recordAck({ commandId: 'c1', status: 'APPLIED' });
    await service.recordAck({ commandId: 'c1', status: 'REJECTED' });
    assert.equal(stubs.rows.c1.status, 'APPLIED');
    assert.equal(stubs.acks.length, 2);
  });

  it('lets a late ack correct a NO_ACK timeout', async () => {
    stubs.rows.c1.status = 'NO_ACK';
    await service.recordAck({ commandId: 'c1', status: 'APPLIED' });
    assert.equal(stubs.rows.c1.status, 'APPLIED');
  });

  it('ignores malformed acks and statuses outside the frozen enum', async () => {
    await service.recordAck({ commandId: 'c1' });
    await service.recordAck({ status: 'APPLIED' });
    await service.recordAck({ commandId: 'c1', status: 'ACKED' });
    assert.equal(stubs.lookups, 0);
    assert.equal(stubs.acks.length, 0);
    assert.equal(stubs.rows.c1.status, 'SENT');
  });

  it('ignores null, absent, primitive and array payloads without rejecting', async () => {
    for (const payload of [null, undefined, false, 42, 'ACK', [], ['c1', 'APPLIED']]) {
      await assert.doesNotReject(() => service.recordAck(payload));
    }
    assert.equal(stubs.lookups, 0);
    assert.equal(stubs.acks.length, 0);
    assert.equal(stubs.rows.c1.status, 'SENT');
  });

  it('rejects wrong field types before looking up or changing a command', async () => {
    for (const payload of [
      { commandId: 1, status: 'APPLIED' },
      { commandId: {}, status: 'APPLIED' },
      { commandId: '   ', status: 'APPLIED' },
      { commandId: 'c1', status: [] },
      { commandId: 'c1', status: 'APPLIED', reason: {} },
      { commandId: 'c1', status: 'APPLIED', reason: null },
    ]) {
      await assert.doesNotReject(() => service.recordAck(payload));
    }
    assert.equal(stubs.lookups, 0);
    assert.equal(stubs.acks.length, 0);
    assert.equal(stubs.rows.c1.status, 'SENT');
  });

  it('retries the lookup when the ack arrives before the command row is inserted', async () => {
    loadService({ rows: { c1: { id: 11, status: 'SENT' } }, appearAfter: 2 });
    await service.recordAck({ commandId: 'c1', status: 'APPLIED' });
    assert.equal(stubs.lookups, 3);
    assert.equal(stubs.rows.c1.status, 'APPLIED');
  });

  it('gives up (without throwing) on an unknown commandId', async () => {
    await service.recordAck({ commandId: 'nope', status: 'APPLIED' });
    assert.equal(stubs.lookups, 5);
    assert.equal(stubs.acks.length, 0);
  });
});

describe('effectAck.sweepUnacked', () => {
  beforeEach(() => loadService());

  it('marks overdue SENT commands NO_ACK, globally or for one session', async () => {
    assert.equal(await service.sweepUnacked(), 2);
    assert.equal(await service.sweepUnacked(42), 2);
    assert.deepEqual(stubs.sweeps.map((s) => s.sessionId), [null, 42]);
    assert.ok(stubs.sweeps.every((s) => s.graceMs > 0));
  });
});
