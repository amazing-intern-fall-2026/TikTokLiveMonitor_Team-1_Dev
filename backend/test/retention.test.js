'use strict';

/**
 * Unit tests for NFR-SEC-04 data protection: the raw_live_events sanitizer
 * (rawLiveEvent.repository.js) and the retention job (retention.service.js).
 * The retention SQL is exercised against a fake pool that records queries;
 * end-to-end behavior against real Postgres is covered by the manual run in
 * docs/demo/verification.md.
 */

process.env.USER_ID_PEPPER = process.env.USER_ID_PEPPER || 'test-pepper-0123456789abcdef0123456789abcdef';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { sanitizeRawPayload, bulkCreate } = require('../src/repositories/rawLiveEvent.repository');
const { hashUserId } = require('../src/repositories/appUser.repository');
const { runRetention, parseRetentionDays } = require('../src/services/retention.service');

const envelope = () => ({
  eventId: crypto.randomUUID(),
  type: 'COMMENT',
  roomId: 'room1',
  user: { userId: '7012345678901234567', uniqueId: 'viewer_handle', nickname: 'Viewer Name' },
  payload: { text: 'heal', textNormalized: 'heal' },
  seq: 1,
});

describe('sanitizeRawPayload (NFR-SEC-04)', () => {
  it('replaces user with only the HMAC of userId', () => {
    const input = envelope();
    const out = sanitizeRawPayload(input);
    assert.deepEqual(out.user, { userIdHash: hashUserId('7012345678901234567') });
    assert.match(out.user.userIdHash, /^[0-9a-f]{64}$/);
  });

  it('keeps every non-user field and does not mutate the input', () => {
    const input = envelope();
    const out = sanitizeRawPayload(input);
    assert.equal(out.eventId, input.eventId);
    assert.deepEqual(out.payload, input.payload);
    assert.equal(input.user.uniqueId, 'viewer_handle');
  });

  it('never lets plaintext identity or extra user fields through', () => {
    const input = envelope();
    input.user.avatarUrl = 'https://example.com/a.png';
    const serialized = JSON.stringify(sanitizeRawPayload(input));
    for (const leaked of ['7012345678901234567', 'viewer_handle', 'Viewer Name', 'avatarUrl']) {
      assert.ok(!serialized.includes(leaked), `raw payload still contains ${leaked}`);
    }
  });

  it('leaves envelopes without a user untouched and hashes a missing userId to null', () => {
    const noUser = { ...envelope(), user: null };
    assert.equal(sanitizeRawPayload(noUser), noUser);
    assert.deepEqual(sanitizeRawPayload({ ...envelope(), user: { uniqueId: 'x' } }).user, { userIdHash: null });
  });

  it('bulkCreate writes the sanitized payload', async () => {
    const calls = [];
    const client = { query: async (text, values) => calls.push({ text, values }) };
    await bulkCreate(client, [{ eventId: 'e1', sessionId: 1, eventType: 'COMMENT', rawPayload: envelope() }]);
    assert.equal(calls.length, 1);
    assert.ok(!JSON.stringify(calls[0].values).includes('viewer_handle'));
  });
});

describe('parseRetentionDays', () => {
  it('accepts whole days and 0, rejects anything else', () => {
    assert.equal(parseRetentionDays('30'), 30);
    assert.equal(parseRetentionDays(' 7 '), 7);
    assert.equal(parseRetentionDays('0'), 0);
    for (const bad of ['', '-1', '1.5', 'abc', '30d']) {
      assert.equal(parseRetentionDays(bad), null, bad);
    }
  });
});

/**
 * Fake pg pool: `select events` returns the next queued page of ids, every
 * DELETE/UPDATE returns `rowCounts[n]` (by regex) or 0.
 */
function fakePool({ eventPages = [], rawDeletes = [], rowCounts = {} } = {}) {
  const log = [];
  const handle = async (text, values) => {
    const sql = text.replace(/\s+/g, ' ').trim();
    log.push({ sql, values });
    if (/^DELETE FROM raw_live_events/.test(sql)) {
      return { rowCount: rawDeletes.shift() ?? 0 };
    }
    if (/^SELECT id FROM events/.test(sql)) {
      const ids = eventPages.shift() ?? [];
      return { rows: ids.map((id) => ({ id })), rowCount: ids.length };
    }
    for (const [pattern, count] of Object.entries(rowCounts)) {
      if (new RegExp(pattern).test(sql)) {
        return { rowCount: count, rows: [] };
      }
    }
    return { rowCount: 0, rows: [] };
  };
  return {
    log,
    query: handle,
    connect: async () => ({ query: handle, release: () => {} }),
  };
}

describe('runRetention (NFR-SEC-04)', () => {
  it('rejects a non-positive or non-integer day count', async () => {
    for (const days of [0, -1, 1.5, undefined]) {
      await assert.rejects(runRetention({ days, pool: fakePool() }));
    }
  });

  it('removes payloads and unlinks effect_commands before deleting each events batch', async () => {
    const pool = fakePool({ eventPages: [[1, 2]] });
    const counts = await runRetention({ days: 30, pool, batchSize: 10 });
    assert.equal(counts.events, 2);

    const order = pool.log.map((q) => q.sql);
    const idx = (re) => order.findIndex((sql) => re.test(sql));
    const deleteEvents = idx(/^DELETE FROM events/);
    assert.ok(deleteEvents > 0);
    for (const re of [/^DELETE FROM comment_payloads/, /^DELETE FROM gift_payloads/, /^DELETE FROM join_payloads/, /^UPDATE effect_commands SET event_id = NULL/]) {
      const at = idx(re);
      assert.ok(at >= 0 && at < deleteEvents, `${re} must run before DELETE FROM events`);
    }
    assert.deepEqual(pool.log[deleteEvents].values, [[1, 2]]);
    assert.ok(order[deleteEvents + 1] === 'COMMIT');
  });

  it('keeps draining in batches until a short batch', async () => {
    const pool = fakePool({ eventPages: [[1, 2], [3, 4], [5]], rawDeletes: [2, 2, 0] });
    const counts = await runRetention({ days: 30, pool, batchSize: 2 });
    assert.equal(counts.events, 5);
    assert.equal(counts.rawEvents, 4);
    assert.equal(pool.log.filter((q) => /^DELETE FROM events/.test(q.sql)).length, 3);
  });

  it('scrubs viewer names from effect logs and reports instead of deleting them', async () => {
    const pool = fakePool({
      rowCounts: { '^DELETE FROM app_users': 4, '^UPDATE effect_commands SET payload': 3, '^UPDATE session_reports': 1 },
    });
    const counts = await runRetention({ days: 30, pool });
    assert.deepEqual(counts, { rawEvents: 0, events: 0, appUsers: 4, effectCommandsScrubbed: 3, sessionReportsScrubbed: 1 });
    assert.ok(!pool.log.some((q) => /DELETE FROM (effect_commands|session_reports|sessions)/.test(q.sql)));
    for (const q of pool.log.filter((entry) => entry.values?.length)) {
      assert.equal(q.values[0], 30, `${q.sql} must use the configured day count`);
    }
  });
});
