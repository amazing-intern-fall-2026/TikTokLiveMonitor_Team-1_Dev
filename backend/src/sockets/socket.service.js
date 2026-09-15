let monitorNamespace;
let gameNamespace;

/**
 * Splits the single Socket.IO server into two independent namespaces so a
 * Web Dashboard client and a Game Client never see each other's traffic:
 * - /monitor: CHAT/GIFT/MEMBER_JOIN envelopes for the web dashboard.
 * - /game: EffectCommand-style messages (e.g. CLEAR_ALL_EFFECTS) for the
 *   game engine.
 */
function initializeSocket(io) {
  monitorNamespace = io.of('/monitor');
  gameNamespace = io.of('/game');
}

function broadcastEvent(event, data) {
  if (!monitorNamespace) {
    throw new Error('Socket.io is not initialized');
  }

  monitorNamespace.emit(event, data);
}

function broadcastGameCommand(event, data) {
  if (!gameNamespace) {
    throw new Error('Socket.io is not initialized');
  }

  gameNamespace.emit(event, data);
}

module.exports = {
  initializeSocket,
  broadcastEvent,
  broadcastGameCommand,
};
