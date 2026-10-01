// Standalone stand-in for the real Game Client (which doesn't exist yet).
// Connects to the /game namespace, prints every effect it receives, and
// acks it back -- BR-EFF-03: Game Client gửi lại EffectAck
// { commandId, status: APPLIED|REJECTED|EXPIRED, reason } để Monitor hiển
// thị effect đã áp thành công hay chưa.
//
// Simulates a character occasionally being "busy" (death animation /
// cutscene) and rejecting an otherwise-valid command with status
// REJECTED -- see REJECT_PROBABILITY below to tune or disable this.
//
// Usage: GAME_TOKEN=<jwt from POST /api/auth/game-token> node index.js
// [serverUrl] (default http://localhost:5000). NFR-SEC-02: /game now
// rejects the handshake without a valid game_client token -- see
// docs/api/game-token-spec.md.

const { io } = require('socket.io-client');

const SERVER_URL = process.argv[2] || 'http://localhost:5000';
const GAME_TOKEN = process.env.GAME_TOKEN || '';

if (!GAME_TOKEN) {
  console.warn('[mock-game-client] GAME_TOKEN env var not set -- handshake will be rejected (MISSING_TOKEN). ' +
    'Get one via POST /api/auth/game-token with your GAME_CLIENT_SECRET.');
}

const socket = io(`${SERVER_URL}/game`, {
  transports: ['websocket'],
  auth: { token: GAME_TOKEN },
});

// Giả lập nhân vật đôi lúc đang chết/cutscene, không nhận hiệu ứng được.
// REJECTED khác EXPIRED: EXPIRED là lỗi thời gian (lệnh đến trễ), REJECTED
// là Game từ chối vì lý do NGHIỆP VỤ dù lệnh vẫn còn hạn (BR-EFF-03).
// Xác suất 20%, đổi tuỳ ý khi cần test kịch bản khác.
const REJECT_PROBABILITY = 0.2;
const REJECT_REASONS = [
  'Character is currently in a death animation, cannot apply effect',
  'Character is in a cutscene, input locked',
];

function isCharacterBusy() {
  return Math.random() < REJECT_PROBABILITY;
}

function handleCommand(eventName, command) {
  const receivedAt = new Date();
  console.log(`\n[${receivedAt.toISOString()}] <<< ${eventName}`);
  console.log(JSON.stringify(command, null, 2));

  // BR-EFF-02: if the command already expired in transit, don't apply it --
  // a "late" effect flickering onto a character after the moment has passed
  // would just confuse the audience. Ack EXPIRED instead of APPLIED so the
  // Monitor can show that too.
  let ack;
  if (command.expiresAt && receivedAt.getTime() > new Date(command.expiresAt).getTime()) {
    ack = { commandId: command.commandId, status: 'EXPIRED', reason: 'expiresAt already passed on arrival' };
  } else if (isCharacterBusy()) {
    const reason = REJECT_REASONS[Math.floor(Math.random() * REJECT_REASONS.length)];
    ack = { commandId: command.commandId, status: 'REJECTED', reason };
  } else {
    ack = { commandId: command.commandId, status: 'APPLIED' };
  }

  socket.emit('EFFECT_ACK', ack);
  console.log(`[${new Date().toISOString()}] >>> EFFECT_ACK`, JSON.stringify(ack));
}

socket.on('connect', () => {
  console.log(`[mock-game-client] connected to ${SERVER_URL}/game as ${socket.id}`);
});

socket.on('disconnect', (reason) => {
  console.log(`[mock-game-client] disconnected: ${reason}`);
});

// Xem docs/api/game-token-spec.md mục 4 -- handshake bị từ chối sẽ báo
// lỗi ở đây (MISSING_TOKEN / WRONG_ROLE / INVALID_OR_EXPIRED_TOKEN)
// thay vì bắn 'connect'.
socket.on('connect_error', (err) => {
  console.error(`[mock-game-client] connection rejected: ${err.message}`);
});

socket.on('EFFECT_COMMAND', (command) => handleCommand('EFFECT_COMMAND', command));
socket.on('CLEAR_ALL_EFFECTS', (command) => handleCommand('CLEAR_ALL_EFFECTS', command));