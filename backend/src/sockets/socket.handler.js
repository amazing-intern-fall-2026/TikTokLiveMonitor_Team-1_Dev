const effectAckService = require('../services/effectAck.service');
const { makeLogger } = require('../utils/logger');

const monitorLog = makeLogger('socket/monitor');
const gameLog = makeLogger('socket/game');

function registerSocketHandlers(io) {
  const monitorNamespace = io.of('/monitor');
  const gameNamespace = io.of('/game');

  monitorNamespace.on('connection', (socket) => {
    monitorLog.info('Client connected', { socketId: socket.id });

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
