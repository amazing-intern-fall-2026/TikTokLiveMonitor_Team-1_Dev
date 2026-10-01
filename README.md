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
- Giả lập Game Client: `GAME_TOKEN=<jwt> node backend/mock-game-client.js`.

## Kiểm thử

```bash
cd backend
npm test                     # unit test RuleEngine (node:test)
```

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
