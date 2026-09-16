const effectAckService = require('../services/effectAck.service');

function registerSocketHandlers(io) {
  const monitorNamespace = io.of('/monitor');
  const gameNamespace = io.of('/game');

  monitorNamespace.on('connection', (socket) => {
    console.log(`[monitor] Client connected: ${socket.id}`);

    socket.on('disconnect', () => {
      console.log(`[monitor] Client disconnected: ${socket.id}`);
    });
  });

  gameNamespace.on('connection', (socket) => {
    console.log(`[game] Client connected: ${socket.id}`);

    // BR-EFF-03: Game Client acks every EffectCommand/CLEAR_ALL_EFFECTS it
    // receives so the Monitor can show whether it actually got applied.
    socket.on('EFFECT_ACK', (ack) => {
      effectAckService.recordAck(ack);
    });

    socket.on('disconnect', () => {
      console.log(`[game] Client disconnected: ${socket.id}`);
    });
  });
}

module.exports = registerSocketHandlers;
