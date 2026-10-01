/**
 * NFR-PERF-01 latency benchmark + AC-08 (kill-switch) acceptance test, run
 * against a live backend with the real auth stack on (operator JWT on the
 * REST routes, game_client JWT on the /game socket handshake).
 *
 * Usage (backend + Postgres already running, e.g. `docker compose up`):
 *   ADMIN_USERNAME=operator ADMIN_PASSWORD=... GAME_CLIENT_SECRET=... \
 *     node scripts/bench-perf-ac08.js [--url=http://localhost:5000] [--events=300] \
 *       [--rate=20] [--effects=40] [--p95-ms=2000] [--skip-ac08] [--skip-perf]
 *
 * Needs NODE_ENV != production on the backend (uses POST /api/test-events/*).
 * It creates one temporary rule and deletes it on exit.
 *
 * NFR-PERF-01 metrics (all measured on one clock, so no skew):
 *   A. event -> dashboard : POST /test-events/chat sent -> CHAT received on /monitor
 *   B. event -> game      : triggering chat sent        -> EFFECT_COMMAND received on /game
 * The p95 threshold (--p95-ms, default 2000) is an ASSUMED target: the SRS
 * wording of NFR-PERF-01 is not in the repo -- pass the real number if it differs.
 *
 * Exit code 0 = everything passed, 1 = any check failed.
 */
'use strict';

const { io } = require('socket.io-client');

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .filter((a) => a.startsWith('--'))
    .map((a) => {
      const [k, v] = a.slice(2).split('=');
      return [k, v ?? true];
    }),
);
const URL = args.url || process.env.BACKEND_URL || 'http://localhost:5000';
const EVENTS = Number(args.events || 300);
const RATE = Number(args.rate || 20); // events/second for metric A
const EFFECTS = Number(args.effects || 40);
const P95_LIMIT_MS = Number(args['p95-ms'] || 2000);
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'operator';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const GAME_CLIENT_SECRET = process.env.GAME_CLIENT_SECRET || '';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
}

async function http(method, path, { token, body } = {}) {
  const res = await fetch(`${URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

function connectSocket(namespace, auth) {
  return new Promise((resolve, reject) => {
    const socket = io(`${URL}${namespace}`, { transports: ['websocket'], auth, reconnection: false });
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', (err) => {
      socket.close();
      reject(err);
    });
  });
}

function pct(sorted, p) {
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)];
}
function stats(samples) {
  const s = [...samples].sort((a, b) => a - b);
  return {
    n: s.length,
    min: s[0],
    avg: Math.round(s.reduce((a, b) => a + b, 0) / s.length),
    p50: pct(s, 50),
    p95: pct(s, 95),
    p99: pct(s, 99),
    max: s[s.length - 1],
  };
}
const fmt = (st) => `n=${st.n} min=${st.min} avg=${st.avg} p50=${st.p50} p95=${st.p95} p99=${st.p99} max=${st.max} (ms)`;

// Unique user per call by default: BR-CM-03 counts the same user + keyword within 5s only once,
// which would otherwise silently swallow most triggering chats.
let userSeq = 0;
const sendChat = (comment, user = `bench_user_${Date.now()}_${userSeq++}`) =>
  http('POST', '/api/test-events/chat', { body: { comment, userId: user, uniqueId: user } });

async function main() {
  if (!ADMIN_PASSWORD || !GAME_CLIENT_SECRET) {
    console.error('Set ADMIN_PASSWORD and GAME_CLIENT_SECRET (and ADMIN_USERNAME if not "operator").');
    process.exit(1);
  }

  console.log(`\nTarget: ${URL}\n\n== Auth setup ==`);
  const login = await http('POST', '/api/auth/login', { body: { username: ADMIN_USERNAME, password: ADMIN_PASSWORD } });
  check('operator login returns a JWT', login.status === 200 && !!login.json.token, `HTTP ${login.status}`);
  const gameTok = await http('POST', '/api/auth/game-token', { body: { clientSecret: GAME_CLIENT_SECRET } });
  check('game-token returns a JWT', gameTok.status === 200 && !!gameTok.json.token, `HTTP ${gameTok.status}`);
  if (!login.json.token || !gameTok.json.token) process.exit(1);
  const opToken = login.json.token;
  const gameToken = gameTok.json.token;

  // Temp rule: 1 matching chat fires an effect, no cooldown.
  const ruleRes = await http('POST', '/api/rules', {
    token: opToken,
    body: {
      name: 'bench-ac08-temp',
      eventType: 'CHAT',
      condition: {
        condition: { keywords: ['benchfire'], matchMode: 'ANY' },
        threshold: { metric: 'EVENT_COUNT', value: 1, window: { type: 'ROLLING', seconds: 5 } },
      },
      effect: { effectCode: 'BENCH', polarity: 'BUFF', target: 'ALL_CHARACTERS', magnitude: 1, durationMs: 1000, priority: 1, cooldownMs: 0 },
      isActive: true,
    },
  });
  const ruleId = ruleRes.json?.id ?? ruleRes.json?.rule?.id ?? ruleRes.json?.data?.id;
  check('temp bench rule created (POST /api/rules, operator token)', ruleRes.status === 201 && ruleId != null, `HTTP ${ruleRes.status}`);
  if (ruleId == null) process.exit(1);
  await sleep(300); // RuleEngine hot-reload

  const monitors = await Promise.all([1, 2, 3].map(() => connectSocket('/monitor')));
  const game = await connectSocket('/game', { token: gameToken });

  const gameEvents = [];
  game.on('EFFECT_COMMAND', (c) => gameEvents.push({ type: 'EFFECT_COMMAND', at: Date.now(), c }));
  game.on('CLEAR_ALL_EFFECTS', (c) => gameEvents.push({ type: 'CLEAR_ALL_EFFECTS', at: Date.now(), c }));

  try {
    if (!args['skip-perf']) await perf(monitors, gameEvents);
    if (!args['skip-ac08']) await ac08(opToken, gameToken, gameEvents);
  } finally {
    await http('POST', '/api/effects/resume', { token: opToken });
    await http('DELETE', `/api/rules/${ruleId}`, { token: opToken });
    monitors.forEach((m) => m.close());
    game.close();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${failed.length ? 'FAILED' : 'ALL PASSED'}: ${results.length - failed.length}/${results.length} checks`);
  process.exit(failed.length ? 1 : 0);
}

async function perf(monitors, gameEvents) {
  console.log(`\n== NFR-PERF-01 (p95 <= ${P95_LIMIT_MS} ms assumed) ==`);

  // A. event -> /monitor, fanned out to 3 dashboards.
  const sentAt = new Map();
  const latA = [];
  monitors[0].on('CHAT', (env) => {
    const t0 = sentAt.get(env.payload?.text);
    if (t0) latA.push(Date.now() - t0);
  });
  const interval = 1000 / RATE;
  const sends = [];
  for (let i = 0; i < EVENTS; i++) {
    const text = `bench-A-${i}`;
    sentAt.set(text, Date.now());
    sends.push(sendChat(text, `u${i % 50}`));
    await sleep(interval);
  }
  await Promise.all(sends);
  await sleep(500);
  const a = latA.length ? stats(latA) : null;
  check(`A. event -> /monitor received all ${EVENTS}`, latA.length === EVENTS, `got ${latA.length}`);
  check(`A. event -> /monitor p95 <= ${P95_LIMIT_MS} ms`, !!a && a.p95 <= P95_LIMIT_MS, a ? fmt(a) : 'no samples');

  // B. triggering chat -> EFFECT_COMMAND on /game, spaced past the 3/s dispatch throttle.
  gameEvents.length = 0;
  const latB = [];
  for (let i = 0; i < EFFECTS; i++) {
    const before = gameEvents.length;
    const t0 = Date.now();
    await sendChat(`benchfire ${i}`);
    const deadline = t0 + 3000;
    while (gameEvents.length === before && Date.now() < deadline) await sleep(2);
    if (gameEvents.length > before) latB.push(gameEvents[before].at - t0);
    await sleep(400);
  }
  check(`B. event -> /game received all ${EFFECTS} EFFECT_COMMANDs`, latB.length === EFFECTS, `got ${latB.length}`);
  if (latB.length) {
    const b = stats(latB);
    check(`B. event -> /game p95 <= ${P95_LIMIT_MS} ms`, b.p95 <= P95_LIMIT_MS, fmt(b));
  }
}

async function ac08(opToken, gameToken, gameEvents) {
  console.log('\n== AC-08: kill-switch with auth on ==');
  const noAuth = await http('POST', '/api/effects/kill-switch');
  check('kill-switch without token -> 401', noAuth.status === 401, `HTTP ${noAuth.status}`);
  const gameRole = await http('POST', '/api/effects/kill-switch', { token: gameToken });
  check(
    'kill-switch with a game_client token -> rejected (not operator)',
    gameRole.status === 401 || gameRole.status === 403,
    `HTTP ${gameRole.status}`,
  );

  await connectSocket('/game').then(
    (s) => { s.close(); check('/game without token rejected', false); },
    (e) => check('/game without token rejected (MISSING_TOKEN)', e.message === 'MISSING_TOKEN', e.message),
  );
  await connectSocket('/game', { token: opToken }).then(
    (s) => { s.close(); check('/game with operator token rejected', false); },
    (e) => check('/game with operator token rejected (WRONG_ROLE)', e.message === 'WRONG_ROLE', e.message),
  );

  // Start un-paused, then queue a burst so commands are still pending when we kill.
  await http('POST', '/api/effects/resume', { token: opToken });
  await sleep(500);
  gameEvents.length = 0;
  await Promise.all(Array.from({ length: 12 }, (_, i) => sendChat(`benchfire burst ${i}`)));
  await sleep(150);

  const tKill = Date.now();
  const kill = await http('POST', '/api/effects/kill-switch', { token: opToken });
  check('kill-switch with operator token -> 200', kill.status === 200, `HTTP ${kill.status}`);
  const deadline = Date.now() + 2000;
  while (!gameEvents.some((e) => e.type === 'CLEAR_ALL_EFFECTS') && Date.now() < deadline) await sleep(2);
  const clear = gameEvents.find((e) => e.type === 'CLEAR_ALL_EFFECTS');
  check(
    'game receives CLEAR_ALL_EFFECTS <= 1000 ms after the click',
    !!clear && clear.at - tKill <= 1000,
    clear ? `${clear.at - tKill} ms` : 'never received',
  );

  // BR-EFF-04 / AC-08: nothing new may reach the game until the operator re-enables.
  const afterClearIdx = gameEvents.indexOf(clear) + 1;
  await Promise.all(Array.from({ length: 5 }, (_, i) => sendChat(`benchfire after ${i}`)));
  await sleep(3000);
  const leaked = gameEvents.slice(afterClearIdx).filter((e) => e.type === 'EFFECT_COMMAND');
  check('no EFFECT_COMMAND after kill-switch until operator resumes', leaked.length === 0, `${leaked.length} leaked`);

  const status = await http('GET', '/api/effects/status', { token: opToken });
  check('effects report paused after kill-switch', status.json.paused === true, JSON.stringify(status.json));

  // Operator re-enable -> effects flow again.
  await http('POST', '/api/effects/resume', { token: opToken });
  const before = gameEvents.length;
  await sendChat('benchfire resumed');
  await sleep(1000);
  check('EFFECT_COMMAND flows again after resume', gameEvents.slice(before).some((e) => e.type === 'EFFECT_COMMAND'));
}

main().catch((err) => {
  console.error('[FATAL]', err);
  process.exit(1);
});
