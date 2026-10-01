# Review token spec (NFR-SEC-02) & PAUSE_EFFECTS (FR-32) — 25/09/2026

Review lại toàn bộ những gì đã "chốt" trong tuần liên quan tới 2 việc: (1)
đặc tả token cho `/game` do mình soạn Thứ Ba, (2) PAUSE_EFFECTS do Thiên
Tài code Thứ Tư. Đối chiếu tài liệu với code thật trên `main` (đã
`git fetch` + `git pull` lấy đúng bản mới nhất trước khi review, kiểm tra
luôn toàn bộ lịch sử git chứ không chỉ HEAD).

## 1. PAUSE_EFFECTS (FR-32) — ✅ Đúng như spec, đã verify bằng test thật

Code khớp hoàn toàn với thiết kế:
- `POST /api/effects/pause` / `/resume` → `RuleEngine.service.js#setEffectsPaused()`
- Khi paused: `evaluateThreshold()` chặn enqueue `EFFECT_COMMAND` mới, nhưng
  KHÔNG chặn thu thập/hiển thị dữ liệu (`RULE_PROGRESS` vẫn broadcast bình
  thường) — đúng ý đồ thiết kế ban đầu.
- Rule "đứng ở ngưỡng" lúc pause sẽ bắn ngay ở sự kiện hợp lệ tiếp theo sau
  resume, không cần tích luỹ lại từ đầu.
- `EFFECT_PAUSE_STATE` được broadcast trên `/monitor` ở cả 2 chiều
  pause/resume để dashboard đồng bộ ngay lập tức.

Verify bằng `backend/test-ac08-kill-switch-pause.js` chạy trên server +
Postgres thật: **8/8 assertion pass**, bao gồm cả độ trễ Kill Switch
(~40-330ms tuỳ lần đo, luôn dưới 1s — đạt AC-08) lẫn việc pause chặn effect
mới triệt để.

**Kết luận: không có gì cần sửa, tài liệu và code đã khớp nhau.**

## 2. Token spec cho `/game` (NFR-SEC-02) — ❌ CHƯA ĐƯỢC CODE, dù báo cáo ghi "đã hoàn thành"

Đây là phát hiện quan trọng nhất của lần review này.

**Những gì đã có:** `docs/api/game-token-spec.md` (mình soạn Thứ Ba) — đặc
tả đầy đủ, rõ ràng: tái dùng `JWT_SECRET` hiện có, endpoint mới
`POST /api/auth/game-token` (mô hình shared secret `GAME_CLIENT_SECRET`),
role claim `game_client` để phân biệt Operator, code mẫu cụ thể cho
`gameNamespace.use()` xác thực lúc handshake.

**Những gì THỰC SỰ có trong code (đã kiểm tra kỹ):**
- `backend/src/sockets/socket.handler.js` trên `main`: **không có bất kỳ
  `namespace.use()` middleware nào** cho `/game` — namespace này hoàn toàn
  mở, không xác thực.
- `backend/src/routes/auth.routes.js`: chỉ có 1 route `POST /` (login
  Operator) — **không có** `POST /api/auth/game-token`.
- `.env.example`: **không có** biến `GAME_CLIENT_SECRET` hay
  `GAME_TOKEN_EXPIRES_IN`.
- Đã kiểm tra `git log --all` (109 commit, toàn bộ branch kể cả `Tai-dev`,
  `dev`, `feat/frontend-dashboard`) — **không tìm thấy commit nào từng
  thêm** `gameNamespace.use`, `GAME_CLIENT_SECRET`, hay
  `/api/auth/game-token` ở bất kỳ thời điểm nào.

**Vấn đề:** báo cáo Thứ Tư (23/09) của Thiên Tài ghi task *"Mở namespace
/game có xác thực token (dùng spec Huy Hào Thứ Ba) trong socket.handler.js"*
với trạng thái **"Đã hoàn thành"** — nhưng việc này chưa từng được code, ở
bất kỳ branch nào. Không rõ đây là ghi nhầm trạng thái, hay có làm nhưng bị
mất do thao tác git (revert/checkout nhầm), hay đơn giản là bị quên giữa
lúc làm PAUSE_EFFECTS cùng ngày. Cần Thiên Tài xác nhận lại.

**Rủi ro thực tế nếu không xử lý trước demo/bàn giao:** namespace `/game`
hiện **ai cũng connect được** mà không cần bất kỳ thông tin xác thực nào —
đúng bằng đúng lỗ hổng mà NFR-SEC-02 được đặt ra để ngăn. Với demo nội bộ
thì chấp nhận được (mạng local, không public), nhưng khi giao cho team Game
thật hoặc deploy ra ngoài thì đây là lỗ hổng bảo mật thật, không phải rủi ro
lý thuyết.

**Đề xuất:**
1. Cập nhật lại báo cáo Thứ Tư của Thiên Tài — sửa mục này từ "Đã hoàn
   thành" thành "Chưa làm", tránh gây hiểu nhầm khi review dự án.
2. Thêm thành task riêng, ưu tiên cao, cho tuần sau — spec đã sẵn 100% ở
   `docs/api/game-token-spec.md` kèm code mẫu cụ thể, ước tính không mất
   nhiều thời gian để code đúng theo mẫu.
3. Đã chủ động chuẩn bị sẵn `mock-game-client/index.js` (đóng gói hôm nay)
   để gửi token qua biến môi trường `GAME_TOKEN` — khi nào backend code
   xong, Game team chỉ cần set biến môi trường, không cần sửa lại mock.
4. Đã ghi rõ cảnh báo này trong `mock-game-client/README.md` mục 5, để
   team Game không hiểu nhầm là kênh này đã được bảo vệ.

## 3. Việc đã làm hôm nay liên quan tới 2 mục trên

- Đóng gói `backend/mock-game-client/` (trước đây là 1 file lẻ
  `mock-game-client.js`) thành thư mục chuẩn có `package.json` riêng (chạy
  độc lập không cần clone cả monorepo) + `README.md` bàn giao đầy đủ cho
  Dev Game, gồm cả cảnh báo ở mục 2.
- File mock đã test lại bằng `node -c` (syntax) và chạy thật với server
  local — connect/nhận lệnh/gửi ack vẫn hoạt động đúng như bản gốc.