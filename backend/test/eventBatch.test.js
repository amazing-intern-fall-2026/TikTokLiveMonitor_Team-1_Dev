process.env.USER_ID_PEPPER = 'test-pepper-event-batch';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const db = require('../src/config/db');
const users = require('../src/repositories/appUser.repository');
const events = require('../src/repositories/event.repository');
const raw = require('../src/repositories/rawLiveEvent.repository');
const batch = require('../src/services/eventBatch.service');
const persisted = [];
users.bulkUpsert = async () => new Map([['u', 1]]);
events.bulkInsertEvents = async (_client, rows) => rows.map((_, i) => i + 1);
events.bulkInsertCommentPayloads = async () => {};
raw.bulkCreate = async (_client, rows) => { persisted.push(...rows.map(row => row.eventId)); };
const item = id => ({ sessionId: 1, eventType: 'CHAT', user: { userId: 'u' }, extra: { comment: 'test' }, envelope: { eventId: id, type: 'CHAT' } });
const client = () => ({ query: async () => {}, release() {} });

test('final flush waits for an in-flight commit and drains newly queued events', async () => {
  persisted.length = 0;
  let resolveConnect;
  let connects = 0;
  db.pool.connect = () => {
    connects++;
    return connects === 1 ? new Promise(resolve => { resolveConnect = resolve; }) : Promise.resolve(client());
  };
  batch.enqueue(item('first'));
  const writing = batch.flush();
  batch.enqueue(item('second'));
  let finished = false;
  const closing = batch.flush().then(() => { finished = true; });
  await new Promise(setImmediate);
  assert.equal(finished, false);
  assert.equal(connects, 1);
  resolveConnect(client());
  await Promise.all([writing, closing]);
  assert.deepEqual(persisted, ['first', 'second']);
  assert.equal(connects, 2);
});

test('connection failure retains events in order for a later retry', async () => {
  persisted.length = 0;
  db.pool.connect = async () => { throw new Error('DB unavailable'); };
  batch.enqueue(item('retry'));
  await assert.rejects(batch.flush(), /DB unavailable/);
  batch.enqueue(item('new'));
  db.pool.connect = async () => client();
  await batch.flush();
  assert.deepEqual(persisted, ['retry', 'new']);
});

test('transaction failure rolls back, releases the client and retains the batch', async () => {
  persisted.length = 0;
  const queries = [];
  let released = false;
  db.pool.connect = async () => ({ query: async sql => {
    queries.push(sql);
    if (sql === 'BEGIN') throw new Error('transaction failed');
  }, release() { released = true; } });
  batch.enqueue(item('transaction-retry'));
  await assert.rejects(batch.flush(), /transaction failed/);
  assert.deepEqual(queries, ['BEGIN', 'ROLLBACK']);
  assert.equal(released, true);
  db.pool.connect = async () => client();
  await batch.flush();
  assert.deepEqual(persisted, ['transaction-retry']);
});

test('automatic size-triggered flush handles connection rejection and retries', async () => {
  persisted.length = 0;
  db.pool.connect = async () => { throw new Error('background DB unavailable'); };
  for (let i = 0; i < 100; i++) batch.enqueue(item(`background-${i}`));
  await new Promise(setImmediate);
  db.pool.connect = async () => client();
  await batch.flush();
  assert.equal(persisted.length, 100);
  assert.equal(new Set(persisted).size, 100);
});
