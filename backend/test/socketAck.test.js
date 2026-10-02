'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const path = require('node:path');

// Exercise the actual socket callback with a service rejection: the callback
// must consume it instead of leaving an unhandled rejection that kills Node.
test('socket EFFECT_ACK handler logs unexpected service rejection', async () => {
  const errors = [];
  const stub = (relative, exports) => {
    const file = require.resolve(path.resolve(__dirname, '../src', relative));
    require.cache[file] = { id: file, filename: file, loaded: true, exports };
  };
  stub('services/effectAck.service.js', { recordAck: async () => { throw new Error('unexpected failure'); } });
  stub('services/RuleEngine.service.js', { getProgressSnapshot: () => [] });
  stub('sockets/socket.service.js', { getLiveStatus: () => ({ status: 'DISCONNECTED' }) });
  stub('config/env.js', { jwtSecret: 'socket-test-secret' });
  stub('utils/logger.js', { makeLogger: () => ({ info() {}, error: (message, meta) => errors.push({ message, meta }) }) });
  const monitor = new EventEmitter();
  const game = new EventEmitter();
  game.use = () => {};
  require('../src/sockets/socket.handler')({ of: (name) => name === '/game' ? game : monitor });
  const socket = new EventEmitter();
  socket.id = 'test-game';
  game.emit('connection', socket);
  socket.emit('EFFECT_ACK', null);
  await new Promise(setImmediate);
  assert.deepEqual(errors, [{ message: 'Failed to handle EFFECT_ACK', meta: { socketId: 'test-game', error: 'unexpected failure' } }]);
});
