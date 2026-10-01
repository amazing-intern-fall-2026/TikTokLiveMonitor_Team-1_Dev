const jwt = require('jsonwebtoken');
const effectAckService = require('../services/effectAck.service');
const ruleEngine = require('../services/RuleEngine.service');
const { jwtSecret } = require('../config/env');
const { makeLogger } = require('../utils/logger');

const monitorLog = makeLogger('socket/monitor');
const gameLog = makeLogger('socket/game');

function registerSocketHandlers(io) {
  const monitorNamespace = io.of('/monitor');
  const gameNamespace = io.of('/game');

  // NFR-SEC-02: /game requires a valid game_client JWT (from POST
  // /api/auth/game-token), checked at handshake time -- before 'connection'
  // fires -- so an unauthenticated client is rejected without ever entering
  // the namespace. See docs/api/game-token-spec.md.
  gameNamespace.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error('MISSING_TOKEN'));
    }

    try {
      const payload = jwt.verify(token, jwtSecret);
      if (payload.role !== 'game_client') {
        return next(new Error('WRONG_ROLE'));
      }
      socket.gameClientPayload = payload;
      next();
    } catch (err) {
      return next(new Error('INVALID_OR_EXPIRED_TOKEN'));
    }
  });

  monitorNamespace.on('connection', (socket) => {
    monitorLog.info('Client connected', { socketId: socket.id });

    // NFR-REL-03: resync this client's progress bars right away instead of
    // waiting for the next contributing event -- sent only to this socket,
    // since already-connected clients are already in sync.
    for (const progress of ruleEngine.getProgressSnapshot()) {
      socket.emit('RULE_PROGRESS', progress);
    }

    socket.on('disconnect', () => {
      monitorLog.info('Client disconnected', { socketId: socket.id });
    });
  });

  gameNamespace.on('connection', (socket) => {
    gameLog.info('Client connected', { socketId: socket.id });

    // BR-EFF-03: Game Client acks every EffectCommand/CLEAR_ALL_EFFECTS it
    // receives so the Monitor can show whether it actually got applied.
    socket.on('EFFECT_ACK', (ack) => {
      effectAckService.recordAck(ack);
    });

    socket.on('disconnect', () => {
      gameLog.info('Client disconnected', { socketId: socket.id });
    });
  });
}

module.exports = registerSocketHandlers;
