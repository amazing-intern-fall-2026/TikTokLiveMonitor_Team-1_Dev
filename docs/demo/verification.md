# Kết quả kiểm tra — 01/10/2026

- Clone từ repository được yêu cầu; thay đổi local, chưa push.
- `node --test backend/test-final-tasks.js`: 4/4 pass (CSV + lifecycle với connector/DB giả lập).
- `npm run build --prefix frontend`: pass.
- `npm run lint --prefix frontend`: exit 0; 3 warning có sẵn trong RulesPage
  (set-state-in-effect và exhaustive-deps), không phải lint sạch warning.
- Test UI `tests/e2e/final-states.spec.js`: đã chuẩn bị; chưa xác nhận pass
  vì môi trường tải Chromium trả archive lỗi. Cần chạy trên máy có browser.
- Chưa chạy TikTok LIVE thật hoặc nghiệm thu report với PostgreSQL thật.

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
