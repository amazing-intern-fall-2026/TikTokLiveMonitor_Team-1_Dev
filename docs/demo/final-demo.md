# Kịch bản demo cuối — TikTok LIVE Monitor

Thời lượng mục tiêu: 10–12 phút. Người trình bày: Operator; người hỗ trợ:
điều khiển tài khoản LIVE và quan sát log Game. Dùng dữ liệu demo và che
mật khẩu/token khi chia sẻ màn hình.

## Chuẩn bị trước buổi demo

- Node.js 22.12+ hoặc 24 (frontend Vite 8), PostgreSQL 16; cài dependency
  bằng `npm ci` trong backend/frontend và `npm install` trong mock-game-client.
- Tạo DB sạch dành cho demo từ `database/schema.sql`, `database/seed.sql`;
  không reset DB đang có dữ liệu thật.
- Copy `backend/.env.example` thành `.env`, cấu hình DATABASE_URL,
  ADMIN_USERNAME/ADMIN_PASSWORD, JWT_SECRET, GAME_CLIENT_SECRET.
  Nếu dùng Docker Compose, đặt secret trong môi trường hoặc `.env` ở root.
- Chạy backend, frontend bằng `npm run dev` ở từng thư mục; kiểm tra `/health`.
- Dùng một TikTok handle đang LIVE được phép demo. Thử trước kết nối;
  Euler signing/rate limit có thể khiến phần LIVE thật không hoạt động.
- Lấy token qua POST `/api/auth/game-token` với JSON `clientSecret`, chạy
  `GAME_TOKEN='<token>' node index.js http://localhost:5000` trong
  `backend/mock-game-client` (PowerShell: xem README mục 5).
- Mock có xác suất REJECTED 20%; đây là kết quả nghiệp vụ hợp lệ, không
  hứa rằng mọi hiệu ứng đều APPLIED. Chọn log minh họa phù hợp.
- Có sẵn một phiên đã đóng và CSV mới tải; quay video dự phòng sau khi
  chạy thử thành công, chưa có video đính kèm trong lần bàn giao này.

## Kịch bản và lời dẫn

| Thời gian | Thao tác | Kết quả cần thấy / lời dẫn |
| --- | --- | --- |
| 0–1 phút | Giới thiệu, đăng nhập Operator | “Hệ thống biến tương tác TikTok LIVE thành lệnh hiệu ứng có ACK từ Game.” |
| 1–2 phút | Quan sát khi chưa kết nối; nhập handle LIVE | Empty state hướng dẫn kết nối; header chuyển sang LIVE Connected @handle. |
| 2–4 phút | Gửi comment/quà/join thật hoặc MOCK DEV TOOLS | Feed và chỉ số tăng; bộ lọc từng loại hoạt động; dữ liệu mô phỏng được giới thiệu rõ. |
| 4–5 phút | Với seed: 3 chat HEAL từ các user khác nhau trong 30s hoặc quà đạt ngưỡng | RULE_PROGRESS và log EFFECT_COMMAND, EFFECT_ACK; dải **⚡ Effect** cạnh các tab lọc đếm theo trạng thái (Áp dụng / Từ chối / Hết hạn / Không ACK), tab **⚡ Effect** liệt kê từng lệnh kèm rule kích hoạt và lý do từ chối; thẻ Comments/Diamonds hiện tốc độ "/ phút" (60 giây gần nhất); giải thích cooldown/dedup khi không phát lệnh tiếp. Nút mock có thể dùng cùng user nên cần kiểm tra anti-spam. |
| 5–6 phút | Tạm dừng effect, gửi thêm tương tác; tiếp tục | Feed tiếp tục nhận, lệnh effect mới bị chặn lúc pause; resume cho phép phát lại. |
| 6–7 phút | Kill Switch | Log CLEAR_ALL_EFFECTS và ACK; tab ⚡ Effect hiện dòng 🚨 KILL SWITCH chuyển Chờ ACK → Đã áp dụng; “Dừng khẩn cấp khác với pause lệnh mới.” |
| 7–8 phút | Ngắt mạng phía connector TikTok rồi phục hồi | Header “Đang kết nối lại”; dữ liệu cũ còn; về Connected khi connector khôi phục. Ngắt đường browser → backend chỉ chứng minh reconnect kênh monitor, phải nói rõ. |
| 8–9 phút | Host kết thúc LIVE | Header “LIVE đã kết thúc”, không retry phiên đã kết thúc; thử F5 để xác nhận snapshot. |
| 9–10 phút | Mở Lịch sử phiên, tải CSV | Phiên đã đóng xuất hiện sau khi report được tạo; CSV chỉ có thứ hạng và tổng tương tác trong top_contributors. |
| 10–11 phút | Nêu bảo mật và giới hạn | `/game` yêu cầu JWT game_client; CSV giảm định danh; DB retention và rà soát pháp lý chưa hoàn tất. |

## Tình huống lỗi và phương án dự phòng

- Handle offline/sai: thông báo lỗi, có thể sửa input và thử lại.
- Backend mất kết nối: header reconnect, alert và feed cũ còn; khi phục
  hồi, LIVE_STATUS snapshot lấy trạng thái connector thật, không tự cho rằng LIVE đang chạy.
- Lịch sử lỗi: alert + Thử lại; không hiển thị lỗi thành “chưa có phiên”.
- TikTok/signing không truy cập được: demo MOCK DEV TOOLS cho feed/effect
  nếu seed/rule đã tải; không tuyên bố đã chứng minh LIVE thật hoặc report
  persistence bằng mock. Dùng test fixture CSV và video phiên đã chạy trước.
- Chưa có report: đóng phiên và chờ ghi hoàn tất, kiểm tra log/DB; không
  tải CSV của một phiên đang chạy.

## Checklist nghiệm thu và bằng chứng

- [ ] Ảnh header Connected → Reconnecting → Connected → Ended.
- [ ] Ảnh empty state; lỗi handle; lịch sử lỗi và retry thành công.
- [ ] Log /game: thiếu/sai/hết hạn token bị từ chối, token hợp lệ kết nối.
- [ ] Log EFFECT_COMMAND/ACK, pause/resume, CLEAR_ALL_EFFECTS/ACK.
- [ ] CSV thực tế từ Postgres không có định danh contributor; tổng khớp report.
- [ ] Record video dự phòng, ghi commit và cấu hình môi trường (không ghi secret).

## Kiểm tra code

```bash
node --test backend/test-final-tasks.js
npm run build --prefix frontend
npm run lint --prefix frontend
# Trong một terminal khác:
npm run dev --prefix frontend
# Test UI dùng máy chủ Socket.IO fixture trên cổng 5000: dừng backend thật trước.
npx playwright install chromium
npx playwright test tests/e2e/final-states.spec.js --workers=1
```

Test UI mới không cần TikTok/Postgres: kiểm tra header theo socket thật,
feed giữ lại, snapshot khi reload, empty/error state và retry lịch sử.
Test E2E `full-flow.spec.js` cũ phụ thuộc LIVE thật và vẫn kết nối /game
không token; chưa dùng nó làm bằng chứng nghiệm thu lần này.
