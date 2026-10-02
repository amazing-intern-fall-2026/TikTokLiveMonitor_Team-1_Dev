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
