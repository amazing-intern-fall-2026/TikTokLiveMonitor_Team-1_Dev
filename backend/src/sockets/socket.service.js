let io;

function initializeSocket(socketServer) {
  io = socketServer;
}

function broadcastEvent(event, data) {
  if (!io) {
    throw new Error('Socket.io is not initialized');
  }

  io.emit(event, data);
}

module.exports = {
  initializeSocket,
  broadcastEvent
};