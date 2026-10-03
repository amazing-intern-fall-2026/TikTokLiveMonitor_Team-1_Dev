# TikTok Live Monitor

Theo dõi phòng live TikTok theo thời gian thực (chat, quà, lượt vào), chạy Rule Engine
và phát hiệu ứng (`EFFECT_COMMAND`) sang Game Client qua Socket.IO.

```
tiktok-live-monitor/
├── frontend/     # React (Vite) – dashboard cho Operator
├── backend/      # Node.js + Express + Socket.IO
├── database/     # schema.sql, seed.sql (PostgreSQL)
├── docs/         # api contract, token spec, hướng dẫn tích hợp Game
├── .env.example  # biến môi trường cho docker compose
└── docker-compose.yml
```

## Yêu cầu

| Cách chạy | Cần cài |
|-----------|---------|
| Docker (khuyến nghị) | Docker Desktop / Docker Engine có Compose v2 |
| Thủ công | Node.js 20+, PostgreSQL 16 |

## Chạy bằng Docker Compose (1 lệnh)

```bash
cp .env.example .env        # lần đầu; Windows PowerShell: Copy-Item .env.example .env
docker compose up --build
```

Compose dựng cả 3 service và đợi theo thứ tự nhờ healthcheck:
`db` (healthy) → `backend` (healthy) → `frontend`.

| Service | URL | Ghi chú |
|---------|-----|---------|
| Frontend | http://localhost:5173 | Đăng nhập bằng `ADMIN_USERNAME` / `ADMIN_PASSWORD` trong `.env` |
| Backend | http://localhost:5000 | `GET /health` |
| PostgreSQL | `localhost:5432` | user/pass `postgres`/`postgres`, DB `tiktok_live_monitor` |

- **Schema & seed tự chạy**: `database/schema.sql` và `database/seed.sql` được mount vào
  `/docker-entrypoint-initdb.d/`, Postgres chạy chúng **một lần** khi volume `db_data` còn trống
  (seed gồm 1 live stream mẫu và 4 rule mẫu). Muốn nạp lại từ đầu:
  `docker compose down -v && docker compose up --build`.
- **Secrets**: `.env.example` chứa giá trị dev chạy được ngay. Đổi `ADMIN_PASSWORD`, `JWT_SECRET`,
  `GAME_CLIENT_SECRET`, `USER_ID_PEPPER` trước khi đưa lên môi trường thật. `USER_ID_PEPPER` không
  được đổi giữa chừng (các hash cũ sẽ không khớp lại cùng một user).
- **Cổng 5432 bị chiếm** (đã có Postgres trên máy): đặt `DB_PORT=5433` trong `.env`.
- **`VITE_BACKEND_URL`** được nhúng vào bundle frontend lúc build (trình duyệt gọi backend trực tiếp);
  đổi giá trị thì chạy lại với `--build`.
- `EULER_API_KEY` (tùy chọn) nâng giới hạn ký WebSocket TikTok so với pool ẩn danh.
- **`CORS_ORIGINS`**: những origin trình duyệt được gọi backend (REST + Socket.IO). Mặc định là
  `http://localhost:5173,http://127.0.0.1:5173`. Nếu mở dashboard/overlay từ máy khác hoặc cổng
  khác thì thêm origin đó, nếu không trình duyệt sẽ chặn request. Game Client và script Node
  không bị ảnh hưởng.
- **Khoá đăng nhập**: một IP nhập sai `AUTH_MAX_FAILURES` lần (mặc định 5) vào `/api/auth/login`
  hoặc `/api/auth/game-token` sẽ nhận 429 trong `AUTH_LOCKOUT_MINUTES` phút (mặc định 15), kể cả khi
  sau đó nhập đúng. Muốn mở khoá ngay thì khởi động lại backend.
- Xem log: `docker compose logs -f backend`. Dừng: `docker compose down`.

## Chạy thủ công (không Docker)

1. Tạo DB và nạp dữ liệu:

   ```bash
   createdb -U postgres tiktok_live_monitor
   psql -U postgres -d tiktok_live_monitor -f database/schema.sql
   psql -U postgres -d tiktok_live_monitor -f database/seed.sql
   ```

2. Backend:

   ```bash
   cd backend
   cp .env.example .env     # điền JWT_SECRET, ADMIN_PASSWORD, GAME_CLIENT_SECRET, USER_ID_PEPPER
   npm install
   npm run dev              # http://localhost:5000
   ```

3. Frontend:

   ```bash
   cd frontend
   npm install
   npm run dev              # http://localhost:5173
   ```

## Xác thực

- **Operator** (dashboard, REST): `POST /api/auth/login` → JWT `role=operator`, gửi kèm
  `Authorization: Bearer <token>`. Các route kill-switch/pause/resume, connect/disconnect livestream,
  rules, sessions đều yêu cầu token này; token `game_client` bị từ chối (403).
- **Game Client** (`/game` Socket.IO): `POST /api/auth/game-token` với `GAME_CLIENT_SECRET` →
  JWT `role=game_client`, truyền qua `auth: { token }` khi handshake. Chi tiết:
  [docs/api/game-token-spec.md](docs/api/game-token-spec.md),
  [docs/api/game-integration-guide.md](docs/api/game-integration-guide.md).
- Giả lập Game Client: `GAME_TOKEN=<jwt> node backend/mock-game-client/index.js` (xem
  [Bàn giao cho team Game](#bàn-giao-cho-team-game)).

## Bàn giao cho team Game

Phần này đủ để team Game tự kết nối, nhận hiệu ứng và test mà không cần hỏi lại team Backend.
Backend **chỉ phát lệnh**; game quyết định hiệu ứng trông thế nào. Mọi chi tiết sâu hơn nằm ở các tài liệu
được liên kết ở cuối phần.

### 1. Game Client cần làm gì (tóm tắt)

1. Lấy token: `POST /api/auth/game-token` với `clientSecret`.
2. Kết nối Socket.IO v4 tới namespace **`/game`**, truyền token ở `auth: { token }`.
3. Lắng nghe **2 event**: `EFFECT_COMMAND` (áp hiệu ứng) và `CLEAR_ALL_EFFECTS` (xoá hết hiệu ứng ngay).
4. Với **mỗi** lệnh nhận được, gửi lại `EFFECT_ACK` (kể cả khi bỏ qua).
5. Khử trùng theo `commandId`, bỏ qua lệnh quá `expiresAt`.

### 2. Chuẩn bị môi trường để test

Cần backend chạy (`docker compose up --build`, xem [Chạy bằng Docker Compose](#chạy-bằng-docker-compose-1-lệnh)).
Xin team Backend giá trị `GAME_CLIENT_SECRET` qua kênh riêng. Ở môi trường dev nó là giá trị trong `.env`
(`.env.example` có sẵn giá trị dev). **Không commit secret hay token.**

| Việc | Giá trị |
|------|---------|
| URL backend (dev) | `http://localhost:5000` |
| Socket.IO namespace | `http://localhost:5000/game` (transport `websocket`) |
| Lấy token | `POST http://localhost:5000/api/auth/game-token` |
| Body | `{ "clientSecret": "<GAME_CLIENT_SECRET>" }` |
| Response 200 | `{ "token": "...", "tokenType": "Bearer", "expiresIn": "24h" }` |
| Lỗi | `400` thiếu `clientSecret` · `401` sai secret · `429` sai quá nhiều lần (khoá IP 15 phút) |

> Endpoint token là `/api/auth/game-token` với `clientSecret`. Bản cũ của guide từng ghi `/api/game/token`
> (không tồn tại), đã sửa ngày 03/10/2026.

### 3. Mẫu client tối thiểu (JavaScript, đã khớp backend thật)

```js
const { io } = require('socket.io-client');

const SERVER = 'http://localhost:5000';
const seen = new Set(); // khử trùng theo commandId (BR-EFF-01)

async function getToken() {
  const res = await fetch(`${SERVER}/api/auth/game-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientSecret: process.env.GAME_CLIENT_SECRET }),
  });
  if (!res.ok) throw new Error(`game-token ${res.status}`);
  return (await res.json()).token;
}

async function main() {
  const socket = io(`${SERVER}/game`, {
    transports: ['websocket'],
    // Hàm: được gọi lại mỗi lần (re)connect, nên token luôn mới, kể cả sau khi hết hạn 24h.
    auth: (cb) => getToken().then((token) => cb({ token })),
  });

  socket.on('connect', () => console.log('connected', socket.id));
  // MISSING_TOKEN | WRONG_ROLE | INVALID_OR_EXPIRED_TOKEN
  socket.on('connect_error', (err) => console.error('rejected:', err.message));

  socket.on('EFFECT_COMMAND', (cmd) => {
    if (seen.has(cmd.commandId)) return;           // trùng -> bỏ qua
    seen.add(cmd.commandId);

    if (Date.now() > new Date(cmd.expiresAt).getTime()) {   // BR-EFF-02
      return socket.emit('EFFECT_ACK', { commandId: cmd.commandId, status: 'EXPIRED', reason: 'late on arrival' });
    }
    const ok = applyEffect(cmd);                   // <-- logic của game
    socket.emit('EFFECT_ACK', ok
      ? { commandId: cmd.commandId, status: 'APPLIED' }
      : { commandId: cmd.commandId, status: 'REJECTED', reason: 'nhân vật đang chết' });
  });

  socket.on('CLEAR_ALL_EFFECTS', (cmd) => {
    clearAllEffects();                             // <-- logic của game, làm NGAY
    socket.emit('EFFECT_ACK', { commandId: cmd.commandId, status: 'APPLIED' });
  });
}
main();
```

Game viết bằng Unity/C#: dùng thư viện `SocketIOClient` (v4). Gửi `Auth = new { token = ... }` ở options, namespace
`/game` nằm trong URL. Mẫu C# trong `docs/api/game-integration-guide.md` mục 2 và 4 **chưa được test thật** với backend,
hãy tự kiểm chứng và báo lại nếu có lệch.

### 4. Payload nhận được

**`EFFECT_COMMAND`**

```json
{
  "commandId": "275cee07-56b1-4c21-9fee-80b90cf6eb9e",
  "sessionId": "session_1789574363464",
  "ruleId": 1,
  "effectCode": "HEAL_HP",
  "polarity": "BUFF",
  "target": "ALL_CHARACTERS",
  "magnitude": 1.2,
  "durationMs": 8000,
  "priority": 5,
  "issuedAt": "2026-09-16T15:59:48.011Z",
  "expiresAt": "2026-09-16T15:59:53.011Z",
  "trigger": { "source": "COMMENT", "summary": "...", "topContributor": { "uniqueId": "d3", "nickname": "Test User" } }
}
```

**`CLEAR_ALL_EFFECTS`** (Kill Switch): `{ "commandId": "...", "type": "CLEAR_ALL_EFFECTS", "issuedAt": "..." }`

**`EFFECT_ACK`** (game gửi lên): `{ "commandId": "...", "status": "APPLIED" | "REJECTED" | "EXPIRED", "reason": "tuỳ chọn" }`

Hợp đồng đã **đóng băng** từ 17/09/2026 (không đổi/xoá field trong v1.x), schema đầy đủ ở
[interface-contract-v1.0-FROZEN.md](docs/api/interface-contract-v1.0-FROZEN.md).

### 5. Quy tắc bắt buộc với game

| Quy tắc | Chi tiết |
|---------|----------|
| Khử trùng (BR-EFF-01) | Nhận lại cùng `commandId` thì bỏ qua |
| Hết hạn (BR-EFF-02) | `expiresAt` = `issuedAt` + **5 giây** cố định. Nhận khi đã quá hạn thì **không áp**, ack `EXPIRED` |
| Ack mọi lệnh (BR-EFF-03) | Gửi trong vòng `expiresAt` + 5 giây (với `CLEAR_ALL_EFFECTS`: `issuedAt` + 10 giây), nếu không backend ghi `NO_ACK`. Ack đến muộn vẫn được nhận. Ack đầu tiên được giữ |
| Kill Switch (BR-EFF-04) | Nhận `CLEAR_ALL_EFFECTS` thì huỷ hết hiệu ứng đang chạy và trả nhân vật về trạng thái gốc. Sau đó backend tự **tạm dừng** effect mới cho tới khi Operator bấm Tiếp tục, game không cần tự xử lý việc này |
| `REJECTED` vs `EXPIRED` | `EXPIRED` = lệnh đến trễ. `REJECTED` = đến kịp nhưng game không áp được (đang chết, cutscene...). `reason` được hiển thị nguyên văn cho Operator, nên viết dễ hiểu |
| Tốc độ | Backend phát tối đa **3 lệnh/giây**, ưu tiên `priority` cao trước. Game không cần tự giới hạn thêm |
| Phạm vi | Lệnh được phát tới **mọi** client đang ở `/game`. Chưa có phòng/room riêng. Đừng mở nhiều game client cùng lúc ở production, mỗi client đều nhận và ack |
| Token | Hết hạn sau 24h (`GAME_TOKEN_EXPIRES_IN`). Backend chỉ kiểm tra lúc handshake, socket đang mở không bị ngắt khi token hết hạn. Khi reconnect phải lấy token mới (mẫu ở mục 3 đã làm sẵn) |
| Status ngoài enum | Ack có `status` ngoài `APPLIED/REJECTED/EXPIRED` hoặc `commandId` sai định dạng bị backend bỏ qua |

### 6. Danh mục hiệu ứng (`effectCode`) hiện có

Danh mục chính thức **do team Game chốt** (OQ-01/OQ-02 trong
[open-questions-devgame.md](docs/api/open-questions-devgame.md) vẫn chưa có phản hồi). Backend không giới hạn cứng
`effectCode`/`target`: Operator tạo rule trên dashboard và gõ mã tuỳ ý, nên **mã nào game không hiểu thì hãy ack
`REJECTED` với `reason` rõ ràng**, đừng im lặng.

4 rule mẫu trong `database/seed.sql` (đây là toàn bộ mã game sẽ gặp khi chạy dữ liệu mẫu):

| `effectCode` | `polarity` | `target` | `magnitude` | `durationMs` | Kích hoạt khi |
|--------------|-----------|----------|-------------|--------------|---------------|
| `HEAL_HP` | BUFF | ALL_CHARACTERS | 1.2 | 8000 | 3 comment chứa "heal" trong 30 giây |
| `SLOW_DOWN` | DEBUFF | ALL_CHARACTERS | 0.7 | 8000 | 3 comment chứa "slow" trong 30 giây |
| `POWER_UP` | BUFF | ALL_CHARACTERS | 1.5 | 15000 | Cộng dồn 100 kim cương quà tặng |
| `SHIELD` | BUFF | ALL_CHARACTERS | 1 | 10000 | 3 người xem khác nhau vào phòng |

`polarity` chỉ nhận `BUFF | DEBUFF` khi tạo rule (enum `NEUTRAL` có trong hợp đồng nhưng rule hiện chưa tạo được).
`target` gợi ý trong hợp đồng: `ALL_CHARACTERS`, `RANDOM_ONE`, `LEADING_CHARACTER`, `LAST_CHARACTER`, `SPECIFIC`.
`magnitude` là hệ số (1.2 = tăng 20%, 0.7 = giảm 30%), cách hiểu cụ thể do game quyết định, hãy chốt với Operator.

**Việc team Game cần làm:** gửi lại danh sách `effectCode` + `target` + khoảng `magnitude`/`durationMs` hợp lệ để team
Backend đưa vào hợp đồng và để Operator chọn đúng khi tạo rule.

### 7. Cách test (không cần TikTok live thật)

**Bước 1. Chạy mock game client để xem luồng chuẩn** (tự ack, ngẫu nhiên 20% `REJECTED`):

```bash
cd backend/mock-game-client && npm install
curl -s -X POST http://localhost:5000/api/auth/game-token -H "Content-Type: application/json" \
  -d '{"clientSecret":"<GAME_CLIENT_SECRET>"}'
GAME_TOKEN='<token>' node index.js http://localhost:5000
```

(PowerShell: `$env:GAME_TOKEN='<token>'; node index.js http://localhost:5000`.) Thấy
`connected to http://localhost:5000/game` là thành công.

**Bước 2. Bắn sự kiện giả** (chỉ chạy khi `NODE_ENV` khác `production`; có cả nút "MOCK DEV TOOLS" trên dashboard).
Rule "HEAL" cần 3 comment từ **3 người dùng khác nhau**:

```bash
for u in a b c; do
  curl -s -X POST http://localhost:5000/api/test-events/chat -H "Content-Type: application/json" \
    -d "{\"comment\":\"heal\",\"userId\":\"$u\"}" > /dev/null
done
# Quà 100 kim cương -> POWER_UP
curl -s -X POST http://localhost:5000/api/test-events/gift -H "Content-Type: application/json" \
  -d '{"diamondCount":100,"repeatCount":1}' > /dev/null
```

Game (hoặc mock) sẽ nhận `EFFECT_COMMAND`. Mở dashboard tại http://localhost:5173 để xem trạng thái lệnh chuyển
`SENT → APPLIED/REJECTED/EXPIRED`.

**Bước 3. Thử Kill Switch / Pause / Resume** (cần token **Operator** lấy từ `POST /api/auth/login`, không dùng token game):
`POST /api/effects/kill-switch`, `/pause`, `/resume`. Có thể bấm trực tiếp trên dashboard.

**Bước 4. Test tự động:** `cd backend && ADMIN_PASSWORD=<...> npm run test:ac08` (kill-switch ≤ 1 giây, pause chặn
effect mới) và `npm run bench` (xem [Benchmark](#benchmark-nfr-perf-01-và-test-ac-08)).

### 8. Checklist nghiệm thu phía game

- [ ] Lấy được token và kết nối `/game`, bắt được `connect_error` và hiện lý do
- [ ] Reconnect tự lấy token mới (thử bằng cách tắt/bật backend)
- [ ] Nhận `EFFECT_COMMAND` và áp đúng `effectCode`, `target`, `magnitude`, `durationMs`
- [ ] Bỏ qua lệnh trùng `commandId`
- [ ] Bỏ qua lệnh quá `expiresAt` và ack `EXPIRED`
- [ ] Ack **mọi** lệnh, dashboard không còn dòng `NO_ACK`
- [ ] `effectCode` lạ thì ack `REJECTED` có `reason`
- [ ] `CLEAR_ALL_EFFECTS` xoá hết hiệu ứng ngay, sau đó không còn effect mới cho tới khi Operator Resume
- [ ] Nhiều hiệu ứng chồng nhau (3 lệnh/giây) không làm game giật hoặc crash
- [ ] Gửi lại danh sách `effectCode`/`target` chính thức cho team Backend (mục 6)

### 9. Giới hạn đã biết

- Mẫu C# chưa được test với backend thật.
- Không thu hồi token trước hạn. Nếu lộ secret, đổi `GAME_CLIENT_SECRET` và chấp nhận token cũ sống tới 24h.
- Một secret dùng chung, chưa phân biệt nhiều game client.
- `expiresAt` cố định 5 giây cho mọi effect.
- `ruleId` hiện luôn khác `null` (kích hoạt thủ công theo FR-30 chưa làm).

### Tài liệu liên quan

- [game-integration-guide.md](docs/api/game-integration-guide.md): hướng dẫn tích hợp chi tiết
- [game-token-spec.md](docs/api/game-token-spec.md): đặc tả token và handshake
- [interface-contract-v1.0-FROZEN.md](docs/api/interface-contract-v1.0-FROZEN.md): schema `EffectCommand`/`EffectAck`
- [backend/mock-game-client/README.md](backend/mock-game-client/README.md): cách chạy mock client
- [open-questions-devgame.md](docs/api/open-questions-devgame.md): các câu hỏi đang chờ team Game

## Bảo vệ dữ liệu người xem (NFR-SEC-04)

- `tiktok_user_id` lưu dạng HMAC-SHA256 (`USER_ID_PEPPER`). `raw_live_events` chỉ giữ
  `user.userIdHash` (cùng hash, nối được với `app_users`), không lưu userId/@handle/nickname gốc.
- **Retention**: job chạy mỗi ngày (lần đầu 1 phút sau khi khởi động) xoá `events` + payload,
  `raw_live_events` và `app_users` không còn event, quá `RETENTION_DAYS` ngày (mặc định 30, `0` = tắt).
  Effect log và báo cáo phiên được giữ lại nhưng xoá tên người xem (`topContributor`,
  `top_contributors`). Kết quả mỗi lần chạy ghi ở log `[retention]`.
- **DB tạo trước 02/10/2026** còn dữ liệu gốc: backup rồi chạy migration một lần (cùng
  `USER_ID_PEPPER` với backend; chạy lại an toàn, không đảo ngược được):

  ```bash
  docker compose exec db pg_dump -U postgres tiktok_live_monitor > backup.sql
  cd backend
  node scripts/pseudonymize-existing-data.js --dry-run
  node scripts/pseudonymize-existing-data.js
  ```

## Kiểm thử

```bash
cd backend
npm test                     # unit test (node:test), không cần DB/TikTok
npm run test:ac08            # AC-08 kill-switch/pause, cần backend đang chạy (xem dưới)
cd ../frontend
npx oxlint --deny-warnings   # CI coi warning là lỗi
npm run build
```

**E2E** (Playwright, cần stack đang chạy và `npm ci` ở thư mục gốc): `final-states.spec.js` cần cổng 5000
trống (nó tự dựng socket server giả, hãy `docker compose stop backend`); `full-flow.spec.js` cần backend thật,
xem [docs/demo/final-demo.md](docs/demo/final-demo.md).

**CI** (`.github/workflows/ci.yml`) chạy trên mỗi push/PR vào `main`/`dev`. Có 3 job:
`npm test` của backend, lint + build frontend, và nạp `schema.sql` + `seed.sql` vào Postgres 16.

### Benchmark NFR-PERF-01 và test AC-08

Cần backend đang chạy (kể cả Docker) với `NODE_ENV` khác `production`:

```bash
cd backend
ADMIN_PASSWORD=change_me GAME_CLIENT_SECRET=<secret trong .env> npm run bench
# tuỳ chọn: -- --url=http://localhost:5000 --events=300 --rate=20 --effects=40 --p95-ms=2000
```

Script tự đăng nhập, lấy game token, tạo 1 rule tạm (xoá khi xong) rồi đo:

- **A.** sự kiện → dashboard (`/monitor`) trên 300 sự kiện, 20 sự kiện/giây, 3 dashboard;
- **B.** sự kiện kích hoạt rule → `EFFECT_COMMAND` tới Game (`/game`);
- **AC-08:** kill-switch cần token operator, Game nhận `CLEAR_ALL_EFFECTS` ≤ 1 giây, không còn
  `EFFECT_COMMAND` nào cho đến khi Operator resume, resume xong effect chạy lại.

Ngưỡng p95 mặc định 2000 ms chỉ là **giả định** (nội dung NFR-PERF-01 trong SRS không có trong repo) –
truyền `--p95-ms` đúng theo SRS. Thoát code 0 nếu mọi kiểm tra đạt, 1 nếu có kiểm tra rớt.
`backend/load-test.js` là công cụ khác: đo độ trễ kết nối thật tới TikTok (`STREAMERS=a,b node load-test.js`).

## Demo cuối và nghiệm thu

- [Ghi chú phát hành v1.0](docs/release-notes-v1.0.md): giới hạn đã biết, việc còn lại, cách triển khai an toàn
- [Bảng trạng thái FR/BR/NFR (bản cuối)](docs/status/fr-br-status-cuoi-v1.0.md)
- [Kịch bản demo](docs/demo/final-demo.md)
- [Rà soát bảo mật CSV](docs/demo/csv-security-review.md)
- [Kết quả kiểm tra](docs/demo/verification.md)
