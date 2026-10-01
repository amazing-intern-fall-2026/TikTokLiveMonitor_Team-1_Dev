process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT:', err);
  process.exit(1);
});
process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION:', err);
  process.exit(1);
});

const { io } = require('socket.io-client');

const SERVER_URL = process.argv[2] || 'http://localhost:5000';
const AC08_LIMIT_MS = 1000;
const NO_EFFECT_GRACE_MS = 2500;
const AFTER_RESUME_TIMEOUT_MS = 2000;

const results = [];

function record(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? '✅ PASS' : '❌ FAIL'} - ${name}${detail ? ` (${detail})` : ''}`);
}

async function postJson(path, body) {
  const res = await fetch(`${SERVER_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  return res.json();
}

function sendBigGift() {
  return postJson('/api/test-events/gift', {
    diamondCount: 500,
    repeatCount: 1,
    isStreakable: false,
  });
}

function waitForEvent(socket, eventName, timeoutMs) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      socket.off(eventName, onEvent);
      resolve(null);
    }, timeoutMs);

    function onEvent(payload) {
      clearTimeout(timer);
      socket.off(eventName, onEvent);
      resolve(payload);
    }

    socket.on(eventName, onEvent);
  });
}

async function testKillSwitchLatency(gameSocket) {
  console.log('\n--- TEST 1: AC-08 - Kill Switch phải <= 1s ---');

  const waitClear = waitForEvent(gameSocket, 'CLEAR_ALL_EFFECTS', AC08_LIMIT_MS + 2000);
  const sentAt = process.hrtime.bigint();
  await postJson('/api/effects/kill-switch');
  const payload = await waitClear;
  const latencyMs = payload ? Number(process.hrtime.bigint() - sentAt) / 1_000_000 : null;

  if (!payload) {
    record('AC-08 Kill Switch nhận được CLEAR_ALL_EFFECTS', false, 'không nhận được sự kiện nào trên /game');
    return;
  }

  record(
    'AC-08 Kill Switch nhận được CLEAR_ALL_EFFECTS',
    true,
    `${latencyMs.toFixed(2)}ms, type=${payload.type}, commandId=${payload.commandId}`
  );
  record('AC-08 Độ trễ Kill Switch <= 1000ms', latencyMs <= AC08_LIMIT_MS, `${latencyMs.toFixed(2)}ms`);
}

async function testPauseBlocksNewEffects(gameSocket, monitorSocket) {
  console.log('\n--- TEST 2: PAUSE_EFFECTS phải chặn effect MỚI ---');

  const resumeAck1 = waitForEvent(monitorSocket, 'EFFECT_PAUSE_STATE', 2000);
  await postJson('/api/effects/resume');
  await resumeAck1;

  const pauseAck = waitForEvent(monitorSocket, 'EFFECT_PAUSE_STATE', 2000);
  await postJson('/api/effects/pause');
  const pauseState = await pauseAck;
  record('Bật pause phát EFFECT_PAUSE_STATE(paused=true) trên /monitor', !!pauseState && pauseState.paused === true, JSON.stringify(pauseState));

  const statusWhilePaused = await (await fetch(`${SERVER_URL}/api/effects/status`)).json();
  record('GET /api/effects/status phản ánh đúng paused=true', statusWhilePaused.paused === true, JSON.stringify(statusWhilePaused));

  const progressWhilePaused = waitForEvent(monitorSocket, 'RULE_PROGRESS', NO_EFFECT_GRACE_MS);
  const leakedEffect = waitForEvent(gameSocket, 'EFFECT_COMMAND', NO_EFFECT_GRACE_MS);

  await sendBigGift();

  const [progress, leaked] = await Promise.all([progressWhilePaused, leakedEffect]);

  record('Khi pause: sự kiện vẫn được cộng dồn/broadcast RULE_PROGRESS (không bị chặn thu thập)', !!progress, progress ? `current=${progress.current}` : 'không nhận được RULE_PROGRESS');
  record('Khi pause: KHÔNG có EFFECT_COMMAND nào được bắn ra dù đã đạt ngưỡng', leaked === null, leaked ? `lại nhận được: ${JSON.stringify(leaked)}` : 'không có leak, đúng như kỳ vọng');

  const resumeAck2 = waitForEvent(monitorSocket, 'EFFECT_PAUSE_STATE', 2000);
  await postJson('/api/effects/resume');
  const resumedState = await resumeAck2;
  record('Resume phát EFFECT_PAUSE_STATE(paused=false) trên /monitor', !!resumedState && resumedState.paused === false, JSON.stringify(resumedState));

  const fireAfterResume = waitForEvent(gameSocket, 'EFFECT_COMMAND', AFTER_RESUME_TIMEOUT_MS);
  await sendBigGift();
  const firedCommand = await fireAfterResume;

  record(
    'Sau resume: effect được bắn ra ngay ở sự kiện hợp lệ tiếp theo',
    !!firedCommand,
    firedCommand ? `effectCode=${firedCommand.effectCode}, commandId=${firedCommand.commandId}` : 'không nhận được EFFECT_COMMAND sau khi resume'
  );
}

async function main() {
  console.log(`Kết nối tới ${SERVER_URL} (/game và /monitor)...`);
  const gameSocket = io(`${SERVER_URL}/game`, { transports: ['websocket'] });
  const monitorSocket = io(`${SERVER_URL}/monitor`, { transports: ['websocket'] });

  gameSocket.on('EFFECT_COMMAND', (cmd) => gameSocket.emit('EFFECT_ACK', { commandId: cmd.commandId, status: 'APPLIED' }));
  gameSocket.on('CLEAR_ALL_EFFECTS', (cmd) => gameSocket.emit('EFFECT_ACK', { commandId: cmd.commandId, status: 'APPLIED' }));

  await Promise.all([
    new Promise((resolve) => gameSocket.on('connect', resolve)),
    new Promise((resolve) => monitorSocket.on('connect', resolve)),
  ]);
  console.log('Đã kết nối cả 2 namespace.\n');

  await testKillSwitchLatency(gameSocket);
  await testPauseBlocksNewEffects(gameSocket, monitorSocket);

  await postJson('/api/effects/resume');

  gameSocket.disconnect();
  monitorSocket.disconnect();

  console.log('\n=== KẾT QUẢ TỔNG HỢP ===');
  const failed = results.filter((r) => !r.pass);
  results.forEach((r) => console.log(`${r.pass ? 'PASS' : 'FAIL'} - ${r.name}`));
  console.log(`\n${results.length - failed.length}/${results.length} assertion pass.`);

  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('Test lỗi:', err.message);
  process.exit(1);
});