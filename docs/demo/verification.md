# Kết quả kiểm tra — 01/10/2026

- Clone từ repository được yêu cầu; thay đổi local, chưa push.
- `node --test backend/test-final-tasks.js`: 4/4 pass (CSV + lifecycle với connector/DB giả lập).
- `npm run build --prefix frontend`: pass.
- `npm run lint --prefix frontend`: exit 0; 3 warning có sẵn trong RulesPage
  (set-state-in-effect và exhaustive-deps), không phải lint sạch warning.
- Test UI `tests/e2e/final-states.spec.js`: đã chuẩn bị; chưa xác nhận pass
  vì môi trường tải Chromium trả archive lỗi. Cần chạy trên máy có browser.
- Chưa chạy TikTok LIVE thật hoặc nghiệm thu report với PostgreSQL thật.

## Benchmark NFR-PERF-01 và AC-08 — 02/10/2026

Môi trường: `docker compose down -v && docker compose up -d --build --wait` (stack sạch, schema/seed
tự nạp), đã bật auth middleware và token `/game`. Lệnh:
`ADMIN_PASSWORD=... GAME_CLIENT_SECRET=... npm run bench` (trong `backend/`). Kết quả: **16/16 check pass**.

| Hạng mục | Kết quả |
|---|---|
| A. Sự kiện → dashboard `/monitor` (300 sự kiện, 20/s) | nhận 300/300; p50 4 ms, p95 5 ms, max 9 ms |
| B. Sự kiện → Game `EFFECT_COMMAND` (40 effect) | nhận 40/40; p50 257 ms, p95 266 ms, max 269 ms |
| Kill-switch không token | 401 |
| Kill-switch với token `game_client` | 403 |
| `/game` không token / token operator | `MISSING_TOKEN` / `WRONG_ROLE` |
| Kill-switch với token operator | 200; Game nhận `CLEAR_ALL_EFFECTS` sau 5 ms (ngưỡng ≤ 1000 ms) |
| Sau kill-switch | 0 `EFFECT_COMMAND` lọt ra; chạy lại bình thường sau resume |

- Ngưỡng p95 ≤ 2000 ms là **giả định** của script (nội dung NFR-PERF-01 không có trong repo); truyền
  `--p95-ms` nếu SRS ghi khác.
- `node backend/test-ac08-kill-switch-pause.js`: 8/8 pass (kill-switch 8,4 ms; pause chặn effect mới,
  resume cho chạy lại).
- `npm test --prefix backend`: 25/25 pass.
- Không phát sinh bug cần sửa. Đo trên localhost, chưa có TikTok LIVE thật.

## NFR-SEC-04: raw payload, migration, retention — 02/10/2026

- `npm test --prefix backend`: 35/35 pass. Có 10 test mới trong `test/retention.test.js` cho
  sanitizer và thứ tự xoá/batch của retention.
- Chạy trên Postgres 16 thật (container tạm, `schema.sql` + `seed.sql`) với fixture mô phỏng dữ liệu
  cũ. Fixture gồm: 2 app_users plaintext, trong đó 1 user trùng với một dòng đã hash; raw payload
  plaintext; event/effect/report 40 ngày tuổi và 1–2 ngày tuổi.
  - Migration `--dry-run` báo 2 raw + 2 app_users và không đổi gì. Chạy thật: 2 raw đã migrate,
    1 user hash tại chỗ, 1 user được gộp (event trỏ sang dòng hash, giữ first_seen sớm nhất và
    last_seen muộn nhất). Chạy lại báo 0/0. Không còn userId/@handle gốc trong `raw_live_events`.
  - `runRetention({ days: 30, batchSize: 2 })`: xoá 3 event cũ (qua 2 lô) cùng payload, 1 raw, 1
    app_user. Effect log cũ còn nhưng `event_id = NULL` và đã bỏ `topContributor`. Báo cáo phiên
    cũ còn số liệu, `top_contributors = {}`. Dữ liệu mới không bị đụng. Chạy lần 2 báo 0 ở mọi bước.
- Khởi động server: `RETENTION_DAYS=30` thì lên lịch job, `0` thì log cảnh báo đã tắt, `abc` thì log
  lỗi và không chạy job.

## BR-EFF-03: trạng thái effect theo ACK, BR-GF-01 — 02/10/2026

- `npm test --prefix backend`: 44/44 pass. Có 9 test mới trong `test/effectAck.test.js`.
- Chạy với backend + Postgres 16 thật (container tạm) và một game client giả lập. Client ack lần
  lượt APPLIED, REJECTED, EXPIRED, không ack, và ack APPLIED cho kill-switch:

  | Lệnh | Ack của Game | `effect_commands.status` | Dòng `effect_acks` |
  |---|---|---|---|
  | EFFECT 1 | APPLIED (ngay lập tức), sau đó ack trùng REJECTED | APPLIED (giữ ack đầu) | 2 |
  | EFFECT 2 | REJECTED, sau đó ack status lạ `ACKED` | REJECTED (`ACKED` bị bỏ qua) | 1 |
  | EFFECT 3 | EXPIRED | EXPIRED | 1 |
  | EFFECT 4 | không ack | NO_ACK (sweep ~10 giây sau `expiresAt`) | 0 |
  | CLEAR_ALL_EFFECTS | APPLIED | APPLIED | 1 |

  Log backend không có dòng `No effect_commands row found`: ack về ngay sau broadcast vẫn khớp được.
- `generateReport` trên fixture (combo Rose ×3 = 2 tick + 1 event chốt, 1 Lion, 2 chat, 1 effect quá
  hạn chưa ack): `total_gifts` = 2 (code cũ ra 4), `total_diamonds` = 103, effect quá hạn hiện
  `NO_ACK` trong `effects_triggered`.
- `node --test backend/test-final-tasks.js` (cần `USER_ID_PEPPER`): 3/4. Test "LIVE drop publishes
  reconnecting…" fail (`2 !== 1`) **cả trên code trước thay đổi này**, nên không phải do N3. Chuyển
  sang N4.
- Kết luận BR-GF-01: `docs/status/br-gf-01-ket-luan.md`. Còn thiếu log LIVE thật.

## Contract trạng thái bổ sung

Socket.IO `/monitor`, event `LIVE_STATUS`:
`{ status, username, message }` với status CONNECTED, RECONNECTING, ENDED,
ERROR, DISCONNECTED. Broadcast khi lifecycle đổi; gửi snapshot cho socket
mới/reconnect. Khi STREAM_END, giữ snapshot ENDED và hủy retry.

Frontend phân biệt mất kênh monitor (socketError) với trạng thái connector
TikTok. Socket connect không tự biến một LIVE đã kết thúc thành CONNECTED.

## Đường dẫn tài liệu

- `final-demo.md`: runbook, lời dẫn, checklist và phương án dự phòng.
- `csv-security-review.md`: phát hiện, sửa CSV và các gap NFR-SEC-04.
- `../../backend/mock-game-client/README.md`: mục 5 xác thực JWT đã cập nhật.
