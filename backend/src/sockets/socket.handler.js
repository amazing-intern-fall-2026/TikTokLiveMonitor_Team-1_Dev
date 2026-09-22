const effectAckService = require('../services/effectAck.service');
const ruleEngine = require('../services/RuleEngine.service');
const { makeLogger } = require('../utils/logger');

const monitorLog = makeLogger('socket/monitor');
const gameLog = makeLogger('socket/game');

function registerSocketHandlers(io) {
  const monitorNamespace = io.of('/monitor');
  const gameNamespace = io.of('/game');

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
