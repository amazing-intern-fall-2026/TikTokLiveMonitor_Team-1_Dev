# Bảng trạng thái FR / BR / NFR — bản cuối v1.0 (02/10/2026)

Thay thế [fr-br-status-sau-tuan-3.md](fr-br-status-sau-tuan-3.md) (28/09). Trạng thái ghi theo **bằng
chứng đã chạy**, không theo báo cáo. Bằng chứng nằm ở [verification.md](../demo/verification.md) (mục N2–N6).

**Giới hạn của bảng này:** file SRS gốc **không nằm trong repo**. Bảng chỉ gồm các mã xuất hiện trong code,
tài liệu và báo cáo tuần. Cột "điều code đang làm" là mô tả theo code, không phải nguyên văn SRS, và nghĩa
của một số mã (ví dụ FR-30) suy ra từ comment nên có thể lệch SRS. Các mã không có ở đây (liệt kê ở cuối) **chưa
được đối chiếu**, không có nghĩa là đã làm hay bị bỏ.

**Quy ước.** **Done** = có code chạy và có bằng chứng. **Done\*** = Done về code/test, nhưng chưa kiểm
được với **TikTok LIVE thật**. **Partial** = còn thiếu phần ghi rõ. **Chưa làm** = không có code.
"LIVE thật" chưa được chạy trong v1.0 (cần tài khoản đang LIVE được phép theo dõi).

## FR

| Mã | Điều code đang làm | Trạng thái | Bằng chứng / ghi chú |
|---|---|---|---|
| FR-01 | Kết nối phòng LIVE theo @username | Done\* | `POST /api/livestream/connect`; đường lỗi chạy thật từ Docker (N6). Chưa nối được phòng đang LIVE |
| FR-03 | Quản lý phiên: mỗi lần kết nối là một dòng `sessions`, đóng phiên thì sinh báo cáo | Done | Dựng phiên trên Postgres thật (N6). `sessionId` dạng chuỗi trong envelope là bộ đếm theo tiến trình, khác `sessions.id` |
| FR-05 | Báo lý do kết nối thất bại | Done | 400 sai định dạng / 404 không tìm thấy / 409 không phát trực tiếp, chạy thật (N6). Nhánh rate-limit chữ ký chưa kích hoạt được |
| FR-06 | Reconnect backoff + jitter, tối đa 5 lần | Done\* | `test-final-tasks.js`. Chưa thử rớt mạng thật |
| FR-08 | Phân biệt "LIVE kết thúc" với "mất mạng tạm thời" | Done\* | `LIVE_STATUS` + `ROOM_STATUS`; `final-states.spec.js` pass (N6). Chưa thử host tắt LIVE thật |
| FR-09 | Avatar streamer + giờ bắt đầu LIVE | Done\* | Tên trường đọc từ `roomInfo` đoán theo tài liệu connector; log debug sẵn để đối chiếu khi chạy LIVE thật |
| FR-13 | Giới hạn feed 200 mục | Done | `MAX_FEED_ITEMS` |
| FR-15 | Bộ lọc feed theo Bình luận / Quà / Hoạt động | Done | Dashboard; số đếm trên tab khớp số dòng. Nên có thêm một người xem lại |
| FR-17 | Số comment/kim cương theo phút | Done | Dashboard: cửa sổ trượt 60 giây (N5). Báo cáo phiên: trung bình cả phiên (`session_analytics_summary`) |
| FR-18 | Top người tặng / top bình luận trong báo cáo | Done | Báo cáo trên Postgres thật (N6). CSV chỉ có thứ hạng + số |
| FR-19 | Chống trùng event | Done | LRU trong RAM + `UNIQUE(event_id)` ở DB |
| FR-21 | Thanh tiến độ rule + đồng hồ cooldown | Done | `RuleProgressSection`, `RULE_PROGRESS` |
| FR-22 | Quản lý rule | Done | CRUD API theo spec + `RulesPage` đọc/ghi thật, RuleEngine nạp lại không cần restart (N4). Còn thiếu: chưa trả `warnings` (xem BR-RULE-01) |
| FR-23 | Tiến độ hiển thị 0% khi chưa có event | Done | Báo cáo Tuần 3 |
| FR-29 | Giới hạn 3 EffectCommand/giây | Done | Chu kỳ phát ~333 ms; benchmark 40/40 |
| FR-30 | Lưu lịch sử EffectCommand | Done | `effect_commands`. **Cần SRS:** `interface-contract-v1.0-FROZEN.md` dùng FR-30 cho "kích hoạt thủ công tuỳ ý", việc này **chưa làm** |
| FR-31 | Bộ mock event | Done | `/api/test-events/*` + nút mock. Chỉ có khi `NODE_ENV` khác `production` |
| FR-32 | Tạm dừng effect | Done | `test:ac08` 8/8 |
| FR-33 | Kill Switch | Done | `CLEAR_ALL_EFFECTS` tới Game sau 7 ms; E2E bấm từ UI |
| FR-35/36 | Ghi event, tổng hợp báo cáo phiên | Done | Dựng phiên trên Postgres thật: 6 chat, 2 join, 2 quà, 503 💎 (N6) |
| FR-37 | Xuất báo cáo CSV/JSON | Done | Nút CSV trên UI tải đúng file; CSV 0 chuỗi định danh (N6) |
| FR-38 | Lịch sử phiên | Partial | Danh sách phân trang + tải báo cáo chạy. **UI chưa có bộ lọc phòng/ngày** (API đã hỗ trợ `room`, `dateFrom`, `dateTo`) |
| FR-40 | Ghi log lệnh điều khiển | Done | Kill switch ghi `effect_commands`; log có cấu trúc |

## BR

| Mã | Trạng thái | Ghi chú |
|---|---|---|
| BR-CM-01 | Done | Chuẩn hoá chữ (bỏ dấu, emoji, lowercase) để khớp từ khoá |
| BR-CM-03 | Done | Chống spam user + từ khoá trong 5 giây |
| BR-DATA-01 | Done | `giftImageUrl` tuỳ chọn, thiếu thì ẩn `<img>` |
| BR-EFF-01/02/04 | Done | Contract v1.0 đóng băng; `expiresAt` = `issuedAt` + 5 s (cố định) |
| BR-EFF-03 | Done | ACK cập nhật `effect_commands.status`; quá hạn thì `NO_ACK`; hiển thị trên Dashboard (N3, N5). `NO_ACK` là trạng thái nội bộ của backend, không nằm trong enum ACK đã đóng băng |
| BR-GF-01 | Done\* | Lỗi quà không combo đã sửa; `total_gifts` không còn đếm tick combo (N3). Độ trễ chốt combo là giới hạn nền tảng. **Thiếu log LIVE thật** ([br-gf-01-ket-luan.md](br-gf-01-ket-luan.md)) |
| BR-GF-03 | Done | Ngưỡng tính theo kim cương, không theo số quà |
| BR-GF-04 | Done | `giftTier` đọc từ JSON, đổi không cần restart |
| BR-GF-05 | Done | Cảnh báo khi quà thiếu giá trị kim cương |
| BR-JN-01/02/04 | Done | Chỉ tính lần vào đầu tiên; gom JOIN tối đa 1 dòng/giây; đánh dấu `isBacklog` |
| BR-RULE-01 | Partial | `resetMode` hoạt động. Spec nói API trả `warnings: ["COOLDOWN_SHORTER_THAN_WINDOW"]` khi cooldown < cửa sổ ROLLING, **code chưa làm** |

## NFR / rủi ro

| Mã | Trạng thái | Ghi chú |
|---|---|---|
| NFR-MNT-01 | Done | `effectCode` là cấu hình, không phải code |
| NFR-PERF-01 | Done | Docker, localhost: sự kiện → dashboard p95 9 ms; sự kiện → Game p95 266 ms (N6). **Ngưỡng 2000 ms là giả định** (nội dung SRS không có trong repo); chưa đo qua mạng thật |
| NFR-PERF-05 | Done | `VirtualList`, tối đa 200 mục/cột |
| NFR-REL-03 | Done | Snapshot khi kết nối lại: `LIVE_STATUS`, `RULE_PROGRESS`, `EFFECT_HISTORY` |
| NFR-SEC-01 | Done | Đăng nhập thật, JWT cho route nhạy cảm, khoá IP sau 5 lần sai, CORS theo `CORS_ORIGINS` (N4) |
| NFR-SEC-02 | Done | `/game` cần JWT `game_client`; 6 trường hợp token kiểm chứng (N6) |
| NFR-SEC-04 | Partial | `tiktok_user_id` là HMAC; `raw_live_events` chỉ giữ hash; job xoá/làm sạch sau `RETENTION_DAYS` (mặc định 30); có migration cho dữ liệu cũ (N2). **Còn:** `username`/`nickname` vẫn plaintext trong `app_users` tối đa 30 ngày; bản backup DB không nằm trong retention |
| NFR-SEC-06 | **Chưa đóng** | Phần kỹ thuật đã có, nhưng **chưa có rà soát pháp lý** (xem [release-notes-v1.0.md](../release-notes-v1.0.md), mục căn cứ pháp lý) |
| NFR-USA-02 | Done | Nút Tạm dừng / Kill Switch trên header cố định |
| RSK-01 | **Chưa làm** | Mới đọc biến `TIKTOK_PROXY_LIST`, **chưa nối proxy vào connector**. Rủi ro bị giới hạn khi nhiều kết nối từ một IP vẫn còn; nên đặt `EULER_API_KEY` |

## Tóm tắt

Tính theo từng mã (49 mã: 24 FR, 15 BR, 10 NFR/rủi ro): **Done 44** (trong đó **Done\* 5** chờ LIVE thật:
FR-01, FR-06, FR-08, FR-09, BR-GF-01) · **Partial 3** (FR-38, BR-RULE-01, NFR-SEC-04) · **Chưa làm / chưa đóng 2**
(RSK-01, NFR-SEC-06). Một mã (FR-30) cần SRS để biết đúng nghĩa.

## Mã chưa được đối chiếu với SRS

Không xuất hiện trong repo, nên **chưa xác minh**: trong dải FR-01 → FR-40 là FR-02, FR-04, FR-07,
FR-10 → FR-12, FR-14, FR-16, FR-20, FR-24 → FR-28, FR-34, FR-39; cùng mọi BR/NFR/OQ/AS khác mà SRS có nhưng
repo không nhắc tới. Khi có file SRS, đối chiếu từng mã trước khi kết luận dự án "đủ SRS".
