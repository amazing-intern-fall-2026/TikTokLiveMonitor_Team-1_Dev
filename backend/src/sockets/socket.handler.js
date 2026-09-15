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

    socket.on('disconnect', () => {
      console.log(`[game] Client disconnected: ${socket.id}`);
    });
  });
}

module.exports = registerSocketHandlers;
