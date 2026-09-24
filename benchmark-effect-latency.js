// NFR-PERF-01: đo p50/p95/max độ trễ từ "comment thứ 3 khớp rule" (thời điểm
// Rule Engine đủ điều kiện fire) tới lúc mock game client nhận được
// EFFECT_COMMAND tương ứng trên namespace /game.
//
// LƯU Ý QUAN TRỌNG (bug đã sửa so với bản nháp ban đầu): rule "heal"/"slow"
// dùng threshold EVENT_COUNT=3 trong ROLLING window 30s, nhưng BR-CM-03
// (anti-spam) chặn CÙNG một user gửi CÙNG một keyword quá 1 lần mỗi 5 giây.
// Nếu cả 3 comment trong 1 burst dùng chung userId mặc định ("test_user"),
// RuleEngine.service.js#isThrottled() sẽ bỏ qua comment thứ 2 và thứ 3, rule
// KHÔNG BAO GIỜ đạt threshold=3 -> không có EFFECT_COMMAND nào được phát ra
// để đo (đã verify thực tế: gửi 3 comment cùng user chỉ thấy RULE_PROGRESS
// current=1, không tăng). Đây đúng là hành vi "bão comment" trong đời thực
// (nhiều khán giả khác nhau cùng gõ 1 từ khoá), nên bản sửa dưới đây cho mỗi
// comment trong burst 1 userId khác nhau.
//
// Chạy: node benchmark-effect-latency.js [serverUrl]
// Yêu cầu: server đang chạy, DB đã seed rule "heal"/"slow" (is_active=TRUE).

process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT:', err);
  process.exit(1);
});
process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION:', err);
  process.exit(1);
});
console.log('Script bắt đầu chạy...');

const { io } = require('socket.io-client');

const SERVER_URL = process.argv[2] || 'http://localhost:5000';
const KEYWORDS = ['heal', 'slow']; // khớp 2 rule đã seed, không đổi tuỳ tiện
const TRIGGERS_PER_KEYWORD = 5; // = maxTriggersPerSession của mỗi rule

const pendingFireTimestamps = []; // các mốc thời gian gửi comment thứ 3 (comment kích hoạt)
const latencies = [];
let burstCounter = 0; // để sinh userId duy nhất cho mỗi burst, tránh đụng anti-spam giữa các burst

function percentile(arr, p) {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

async function postChat(comment, userId) {
  await fetch(`${SERVER_URL}/api/test-events/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ comment, userId }),
  });
}

async function fireCommentBurst(keyword) {
  burstCounter += 1;
  // 3 user KHÁC NHAU trong cùng 1 burst -- mô phỏng đúng "bão comment" thật
  // (nhiều khán giả), đồng thời né anti-spam BR-CM-03 (chặn theo user+keyword).
  const u1 = `bench_${burstCounter}_a`;
  const u2 = `bench_${burstCounter}_b`;
  const u3 = `bench_${burstCounter}_c`;

  // 2 comment "khởi động" trước, không tính giờ (chưa đủ ngưỡng)
  await postChat(keyword, u1);
  await postChat(keyword, u2);

  // Comment thứ 3 là comment THỰC SỰ kích hoạt rule -- đây là mốc "sinh event"
  const fireTime = process.hrtime.bigint();
  pendingFireTimestamps.push(fireTime);
  await postChat(keyword, u3);
}

async function main() {
  const socket = io(`${SERVER_URL}/game`, { transports: ['websocket'] });

  socket.on('connect', () => {
    console.log(`Connected to ${SERVER_URL}/game — bắt đầu benchmark...\n`);
  });

  socket.on('EFFECT_COMMAND', (command) => {
    const receivedAt = process.hrtime.bigint();
    socket.emit('EFFECT_ACK', { commandId: command.commandId, status: 'APPLIED' });

    const fireTime = pendingFireTimestamps.shift();
    if (fireTime === undefined) return;
    const latencyMs = Number(receivedAt - fireTime) / 1_000_000;
    latencies.push(latencyMs);
    console.log(`  -> nhận EFFECT_COMMAND (${command.effectCode}), độ trễ = ${latencyMs.toFixed(2)}ms`);
  });

  await new Promise((resolve) => socket.on('connect', resolve));

  for (const keyword of KEYWORDS) {
    console.log(`\n--- Rule "${keyword}" (${TRIGGERS_PER_KEYWORD} lần, cách nhau >10s để qua cooldown) ---`);
    for (let i = 0; i < TRIGGERS_PER_KEYWORD; i++) {
      await fireCommentBurst(keyword);
      await new Promise((r) => setTimeout(r, 11_000)); // chờ qua cooldownMs=10000 + biên an toàn 1s
    }
  }

  await new Promise((r) => setTimeout(r, 1000)); // đợi ack cuối cùng xử lý xong

  console.log('\n=== KẾT QUẢ (NFR-PERF-01) ===');
  console.log(`Số mẫu thu được: ${latencies.length} / ${KEYWORDS.length * TRIGGERS_PER_KEYWORD} kỳ vọng`);
  if (latencies.length === 0) {
    console.log('KHÔNG có mẫu nào — kiểm tra lại rule "heal"/"slow" có is_active=TRUE trong DB không.');
  } else {
    console.log(`p50: ${percentile(latencies, 50).toFixed(2)}ms`);
    console.log(`p95: ${percentile(latencies, 95).toFixed(2)}ms`);
    console.log(`max: ${Math.max(...latencies).toFixed(2)}ms`);
  }

  socket.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('Benchmark lỗi:', err.message);
  process.exit(1);
});