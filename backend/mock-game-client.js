// Standalone stand-in for the real Game Client (which doesn't exist yet).
// Connects to the /game namespace, prints every effect it receives, and
// immediately acks it back -- BR-EFF-03: Game Client gửi lại EffectAck
// { commandId, status: APPLIED|REJECTED|EXPIRED, reason } để Monitor hiển
// thị effect đã áp thành công hay chưa.
//
// Usage: node mock-game-client.js [serverUrl]  (default http://localhost:5000)

const { io } = require('socket.io-client');

const SERVER_URL = process.argv[2] || 'http://localhost:5000';
const socket = io(`${SERVER_URL}/game`, { transports: ['websocket'] });

function handleCommand(eventName, command) {
  const receivedAt = new Date();
  console.log(`\n[${receivedAt.toISOString()}] <<< ${eventName}`);
  console.log(JSON.stringify(command, null, 2));

  const ack = { commandId: command.commandId, status: 'APPLIED' };
  socket.emit('EFFECT_ACK', ack);
  console.log(`[${new Date().toISOString()}] >>> EFFECT_ACK`, JSON.stringify(ack));
}

socket.on('connect', () => {
  console.log(`[mock-game-client] connected to ${SERVER_URL}/game as ${socket.id}`);
});

socket.on('disconnect', (reason) => {
  console.log(`[mock-game-client] disconnected: ${reason}`);
});

socket.on('EFFECT_COMMAND', (command) => handleCommand('EFFECT_COMMAND', command));
socket.on('CLEAR_ALL_EFFECTS', (command) => handleCommand('CLEAR_ALL_EFFECTS', command));
