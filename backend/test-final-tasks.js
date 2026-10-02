// [CLAUDE EDIT 2026-10-02] appUser.repository.js (NFR-SEC-04) dừng ngay khi thiếu pepper;
// đặt giá trị test để file chạy được trong `npm test` (và CI) mà không cần .env.
process.env.USER_ID_PEPPER = process.env.USER_ID_PEPPER || 'test-pepper-0123456789abcdef0123456789abcdef';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { reportToCsv } = require('./src/controllers/sessionReport.controller');

test('CSV excludes legacy/future contributor identity fields and preserves totals', () => {
  const report = { session_id: 'session-test', total_comments: 3, generated_at: new Date('2026-10-01T00:00:00Z'),
    top_contributors: { topGifters: [{ userId: 'raw-id-123', tiktok_user_id: 'raw-id-123', username: 'secret-handle', nickname: 'secret-name', total_diamonds: '100', nested: { userId: 'nested-id' } }],
      topCommenters: [{ userId: 'raw-id-123', username: 'secret-handle', comment_count: '3' }] } };
  const csv = reportToCsv(report);
  for (const identity of ['raw-id-123', 'secret-handle', 'secret-name', 'nested-id', 'userId', 'username', 'nickname', 'tiktok_user_id']) assert.ok(!csv.includes(identity), identity);
  assert.ok(csv.includes('2026-10-01T00:00:00.000Z'));
  assert.ok(csv.includes('""total_diamonds"":100'));
  assert.ok(csv.includes('""comment_count"":3'));
  assert.equal(report.top_contributors.topGifters[0].username, 'secret-handle');
});

test('CSV supports reports without contributor arrays', () => {
  assert.ok(reportToCsv({ top_contributors: null }).includes('""topGifters"":[]'));
});

// Replace only external connector/DB dependencies; exercise the production
// lifecycle and the real Socket.IO namespace snapshot publisher.
const connector = require('tiktok-live-connector');
let current;
class FakeConnection extends EventEmitter {
  constructor() { super(); current = this; this.calls = 0; }
  async connect() { this.calls++; return { roomId: 'test-room' }; }
  disconnect() { this.emit(connector.ControlEvent.DISCONNECTED); }
}
require.cache[require.resolve('tiktok-live-connector')].exports = { ...connector, TikTokLiveConnection: FakeConnection };
require('./src/repositories/liveStream.repository').findOrCreateByHostUsername = async () => ({ id: 1 });
require('./src/repositories/session.repository').create = async () => ({ id: 1 });
require('./src/repositories/session.repository').markDisconnected = async () => {};
require('./src/services/eventBatch.service').flush = async () => {};
require('./src/services/sessionReport.service').generateReport = async () => {};
const sockets = require('./src/sockets/socket.service');
const emitted = [];
sockets.initializeSocket({ of: () => ({ emit: (event, data) => emitted.push({ event, ...data }) }) });
const live = require('./src/services/liveStream.service');

test('LIVE drop publishes reconnecting; STREAM_END cancels retry and retains ended snapshot', async () => {
  await live.connectToLiveStream('demo_host');
  assert.equal(sockets.getLiveStatus().status, 'CONNECTED');
  current.emit(connector.ControlEvent.DISCONNECTED);
  assert.equal(sockets.getLiveStatus().status, 'RECONNECTING');
  current.emit(connector.WebcastEvent.STREAM_END);
  await new Promise(setImmediate);
  assert.equal(sockets.getLiveStatus().status, 'ENDED');
  assert.equal(live.getCurrentSessionId(), null);
  assert.equal(current.calls, 1);
  // [CLAUDE EDIT 2026-10-02] Code gốc của hao (aaf880c), giữ lại để tham khảo.
  // Lý do sửa: `emitted` gom mọi event của /monitor; ROOM_STATUS (FR-08, 861203d) cũng mang
  // status RECONNECTING nên đếm ra 2. Ý test là LIVE_STATUS RECONNECTING chỉ phát 1 lần.
  // assert.equal(emitted.filter((item) => item.status === 'RECONNECTING').length, 1);
  assert.equal(emitted.filter((item) => item.event === 'LIVE_STATUS' && item.status === 'RECONNECTING').length, 1);
});

test('explicit disconnect publishes DISCONNECTED without scheduling reconnect', async () => {
  await live.connectToLiveStream('demo_host');
  await live.disconnectCurrentLiveStream();
  assert.equal(sockets.getLiveStatus().status, 'DISCONNECTED');
  assert.equal(sockets.getLiveStatus().username, null);
  assert.equal(current.calls, 1);
});
