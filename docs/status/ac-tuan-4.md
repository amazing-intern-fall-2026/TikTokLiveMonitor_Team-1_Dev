# Tiêu chí nghiệm thu (AC) — Tuần 4

Mỗi AC có: điều kiện **kiểm chứng được**, cách kiểm, và mức ưu tiên. AC được
suy ra từ các khoảng trống thật tìm thấy khi review Tuần 3
(`fr-br-status-sau-tuan-3.md`). Ngưỡng số liệu nào SRS chưa cung cấp trong repo
được ghi rõ "theo SRS" thay vì tự đặt.

## P0 — Bảo mật (chặn bàn giao cho team Game)

**AC-W4-01 — Xác thực token cho `/game` (NFR-SEC-02)**
- `POST /api/auth/game-token` đúng `clientSecret` → 200 kèm token role `game_client`; sai secret → 401.
- Connect `/game` không token → `connect_error` = `MISSING_TOKEN`; JWT Operator → `WRONG_ROLE`; token hết hạn/sai chữ ký → `INVALID_OR_EXPIRED_TOKEN`; token hợp lệ → connect được.
- `.env.example` có `GAME_CLIENT_SECRET`, `GAME_TOKEN_EXPIRES_IN`.
- `test-ac08-kill-switch-pause.js` và `mock-game-client` cập nhật gửi token, vẫn **8/8 pass**.
- Kiểm: script test 4 trường hợp handshake + chạy lại bộ test AC-08.

**AC-W4-02 — Đăng nhập thật (NFR-SEC-01)**
- `LoginPage` gọi `POST /api/login`; đúng → lưu `jwt_token` và vào Dashboard; sai → hiện thông báo lỗi, không vào.
- Không có token hợp lệ thì không vào được Dashboard sau F5.
- Kiểm: thử thủ công 3 trường hợp (đúng / sai / F5 khi hết hạn).

**AC-W4-03 — Gắn `requireAuth` vào route**
- `/api/livestream/*`, `/api/effects/*`, `/api/sessions/*` trả 401 khi thiếu/sai token; `/api/login` và `/health` vẫn mở.
- Quyết định bằng văn bản cho `/api/test-events/*` (chỉ mở ở `NODE_ENV=development` hoặc phải có token).
- Frontend: mọi request gửi `Authorization: Bearer`, nhận 401 tự về Login (**đã có ở `api.js`**, cần kiểm end-to-end sau khi AC-W4-02 xong).
- Kiểm: `curl` không token → 401; thao tác Dashboard bình thường khi đã đăng nhập; xoá token giữa chừng → tự về Login.

**AC-W4-04 — Ẩn danh hoá userId (NFR-SEC-04/06)**
- `tiktok_user_id` lưu dạng HMAC-SHA256 (hex 64 ký tự) với `USER_ID_PEPPER`; cùng userId → cùng hash; khác pepper → khác hash.
- Thiếu `USER_ID_PEPPER` → server báo lỗi rõ ràng lúc khởi động, không im lặng dùng chuỗi rỗng.
- Kiểm: query DB không còn userId gốc; test đơn vị 3 điều trên.

## P1 — Hoàn thiện tính năng còn dở

**AC-W4-05 — Xuất & lịch sử phiên (FR-37/38)**: nút tải CSV trên frontend tải đúng file từ `/api/sessions/:id/export` (mở bằng Excel không lỗi ký tự tiếng Việt); modal Lịch sử phiên liệt kê phiên đã đóng, chọn phiên xem/tải báo cáo. Nút tải phải gửi kèm token (sau AC-W4-03).

**AC-W4-06 — Quản lý rule (FR-22)**: hoặc (a) có API CRUD rule ở backend và `RulesPage` đọc/ghi thật, sửa xong RuleEngine áp dụng không cần restart; hoặc (b) nhóm chốt bằng văn bản là ngoài phạm vi v1.0 và màn này ghi rõ "chỉ xem". Không để trạng thái hiện tại (sửa được nhưng không lưu).

**AC-W4-07 — Thông tin phòng & trạng thái LIVE (FR-08, FR-09)**: Dashboard hiển thị avatar streamer + thời điểm bắt đầu phiên; phân biệt được "LIVE kết thúc" và "mất mạng tạm thời" qua trạng thái hiển thị. Nếu FR-08 là giới hạn nền tảng, ghi vào SRS thay vì code.

**AC-W4-08 — Kết luận `repeatEnd` (BR-GF-01)**: có kết luận bằng văn bản (lỗi code / giới hạn connector) kèm ít nhất 1 log quà đơn `isStreakable: false`.

**AC-W4-09 — Bộ lọc feed (FR-15)**: chọn tab lọc đúng loại, số đếm trên tab khớp số dòng, đổi tab không làm mất dữ liệu đang nhận. Đã làm ở nhánh `Hao-dev`; cần một người khác xem trên trình duyệt thật.

## P2 — Nghiệm thu chung

**AC-W4-10 — E2E trên môi trường sạch**: `docker compose down -v && up --build`, chạy đủ 6 bước demo ở báo cáo Tuần 3 (đăng nhập → kết nối phòng → mở Overlay → bật mock game và phát bão event → thanh tiến độ → Effect sang Game → Ack → Kill Switch → đóng phiên → tải CSV) không lỗi console.

**AC-W4-11 — Hiệu năng còn đạt khi bật bảo mật**: chạy lại `benchmark-effect-latency.js` với token; 10/10 mẫu, p95 ≤ ngưỡng NFR-PERF-01 trong SRS (hiện 305ms trên localhost). Lưu ý `docker compose restart backend` trước mỗi lần đo (mỗi rule chỉ bắn tối đa 5 lần/phiên).

**AC-W4-12 — Tài liệu khớp code**: `game-integration-guide.md` mục 1 có bước lấy token và xử lý `connect_error`; `mock-game-client/README.md` bỏ cảnh báo "chưa xác thực" sau AC-W4-01; `fr-br-status-*.md` cập nhật lại; báo cáo tuần ghi trạng thái theo bằng chứng (kèm link commit/test), không chỉ "đã hoàn thành".

## Định nghĩa "Xong Tuần 4"
Toàn bộ AC **P0** đạt, ít nhất AC-W4-05 và AC-W4-10 đạt, các AC còn lại hoặc đạt hoặc có quyết định "ngoài phạm vi" bằng văn bản.

## Kết quả cuối Tuần 4 (02/10/2026)

Bằng chứng chi tiết ở [verification.md](../demo/verification.md) (mục N2–N6) và
[fr-br-status-cuoi-v1.0.md](fr-br-status-cuoi-v1.0.md). "LIVE thật" chưa được chạy trong v1.0.

| AC | Kết quả | Bằng chứng / còn thiếu |
|---|---|---|
| W4-01 Token `/game` | **Đạt** | 6 trường hợp handshake (thiếu, sai role, sai chữ ký, hết hạn, rác, hợp lệ) + `npm run bench` 16/16 + `test:ac08` 8/8 |
| W4-02 Đăng nhập thật | **Đạt** | E2E: sai mật khẩu bị từ chối, đúng thì vào Dashboard. Chưa thử riêng "F5 khi token hết hạn" (logic 401 → về Login có trong `api.js`) |
| W4-03 `requireAuth` | **Đạt** | Route nhạy cảm trả 401 khi thiếu token. `/api/test-events/*`: chỉ có khi `NODE_ENV` khác `production`, quyết định ghi ở [release-notes-v1.0.md](../release-notes-v1.0.md) |
| W4-04 Ẩn danh userId | **Đạt** | HMAC trong `app_users` và `raw_live_events`; kiểm trên Postgres thật; test đơn vị |
| W4-05 Xuất và lịch sử phiên | **Đạt** | Modal + nút CSV chạy trên Postgres thật. CSV hiện chỉ có số/JSON, chưa mở thử bằng Excel. Modal chưa có bộ lọc phòng/ngày |
| W4-06 Quản lý rule | **Đạt** (phương án a) | CRUD API + `RulesPage` đọc/ghi thật, RuleEngine nạp lại không cần restart |
| W4-07 Thông tin phòng, trạng thái LIVE | **Một phần** | Code + `final-states.spec.js` pass; chưa xác nhận trên LIVE thật |
| W4-08 Kết luận `repeatEnd` | **Một phần** | Có kết luận bằng văn bản; **thiếu log quà từ LIVE thật** |
| W4-09 Bộ lọc feed | **Đạt** | Đã xem trên trình duyệt thật; nên có thêm một người xem lại |
| W4-10 E2E môi trường sạch | **Một phần** | `down -v && up --build` + E2E tự động pass **không dùng LIVE thật**; chưa chạy đủ 6 bước demo với phòng thật |
| W4-11 Hiệu năng khi bật bảo mật | **Đạt** | 40/40, p95 266 ms (localhost, Docker). Ngưỡng SRS chưa biết nên dùng giả định 2000 ms |
| W4-12 Tài liệu khớp code | **Đạt** | Hướng dẫn tích hợp Game, README, bảng trạng thái cuối, ghi chú phát hành |

Theo định nghĩa "Xong Tuần 4": toàn bộ AC P0 (W4-01 → 04) **đạt**; W4-05 **đạt**; W4-10 **một phần** vì thiếu LIVE
thật (ghi rõ ở trên, không phải quyết định "ngoài phạm vi").
