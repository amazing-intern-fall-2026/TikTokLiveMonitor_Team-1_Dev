# Bảng trạng thái FR / BR / NFR sau Tuần 3 (cập nhật 28/09/2026)

> **Bản cũ (Tuần 3).** Đã được thay bằng [fr-br-status-cuoi-v1.0.md](fr-br-status-cuoi-v1.0.md) (02/10/2026). Giữ lại để xem lịch sử; nhiều mục "Chưa làm"/"Partial" ở dưới nay đã xong.

**Phạm vi & cách lập:** SRS gốc không nằm trong repo, nên bảng này chỉ gồm các
mã yêu cầu **xuất hiện trong code, tài liệu và báo cáo tuần**, và trạng thái
được xác định bằng cách đọc code trên `main` (+ nhánh này), không dựa vào lời
báo cáo. Mô tả ngắn ở cột 2 là điều code đang làm, không phải nguyên văn SRS.
Các mã SRS không xuất hiện ở đây cần đối chiếu thủ công với SRS trước khi
kết luận "Chưa làm".

Quy ước: **Done** = đã có code chạy được và có bằng chứng; **Partial** = có
một phần, phần còn thiếu ghi rõ; **Chưa làm** = không có code.

## FR

| Mã | Điều code đang làm | Trạng thái | Ghi chú / bằng chứng |
|---|---|---|---|
| FR-01 | Kết nối phòng LIVE theo @username | Done | `POST /api/livestream/connect`, `api.connectRoom` |
| FR-06 | Reconnect backoff + jitter, tối đa 5 lần | Done | `liveStream.service.js`, báo cáo Thứ Tư (Đạt) |
| FR-08 | Phân biệt "LIVE kết thúc" và "mất mạng tạm thời" | **Chưa làm** | Task Thứ Năm của Đạt chưa có kết quả; không có xử lý stream-end trong code |
| FR-09 | Avatar streamer + thời điểm bắt đầu phiên lên Dashboard | **Chưa làm** | Không có `avatar` trong backend/frontend |
| FR-15 | Bộ lọc feed theo tab Comment/Gift/Join | Done (chờ merge) | Làm ngày 28/09 trên nhánh `Hao-dev`, lint + build pass |
| FR-19 | Chống trùng event theo `eventId` (LRU) | Done | `eventDedup.service.js`, tích hợp `processEvent` |
| FR-21 | Thanh tiến độ mục tiêu rule realtime + đồng hồ cooldown | Done | `RuleProgressSection.jsx`, `RULE_PROGRESS` |
| FR-22 | Màn quản lý rule | **Partial** | UI có nhưng dữ liệu là `INITIAL_RULES` cứng trong `RulesPage.jsx`; không có API CRUD rule ở backend, chỉnh sửa không lưu |
| FR-23 | Tiến độ mục tiêu hiển thị 0% khi chưa có event | Done | Báo cáo Thứ Ba (Đức Tài) |
| FR-29 | Giới hạn 3 EffectCommand/giây | Done | Chu kỳ phát ~333ms; benchmark 10/10 mẫu |
| FR-30 | Lưu lịch sử EffectCommand | Done | `effectCommand.repository.js`, bảng `effect_commands` |
| FR-31 | Bộ mock event để test | Done | `/api/test-events/*` + nút mock trên Dashboard |
| FR-32 | Tạm dừng effect (không xoá effect đang chạy) | Done | `test-ac08-kill-switch-pause.js` 8/8 pass |
| FR-33 | Kill Switch xoá mọi effect ngay | Done | `CLEAR_ALL_EFFECTS` tới `/game` ~40–330ms (< 1s) |
| FR-35/36 | Ghi event thô, tổng hợp báo cáo phiên | Done | `AsyncEventBatcher`, `session_reports` |
| FR-37 | Xuất báo cáo phiên CSV/JSON | **Partial** | Backend `GET /api/sessions/:id/export` xong; **chưa có nút tải CSV trên frontend** |
| FR-38 | Lịch sử phiên | **Partial** | Có dữ liệu ở backend; **chưa có modal Lịch sử phiên** |
| FR-40 | Ghi log lệnh điều khiển | Done | Kill switch ghi `effect_commands` (best-effort) |

## BR

| Mã | Trạng thái | Ghi chú |
|---|---|---|
| BR-EFF-01/02/04 | Done | Contract v1.0 đóng băng; `expiresAt` = `issuedAt` + 5s (hiện cố định) |
| BR-EFF-03 | Done | Game ack `APPLIED/REJECTED/EXPIRED`, mock đã mô phỏng cả 3 |
| BR-CM-03 | Done | Anti-spam theo user+keyword 5s (đã kiểm chứng khi benchmark) |
| BR-GF-04 | Done | `giftTier` cấu hình JSON, đổi không cần restart |
| BR-JN-02 | Done | Gom batch JOIN, tối đa 1 dòng/giây |
| BR-JN-04 | Done | `isBacklog` cho JOIN 10s đầu |
| BR-GF-01 | **Partial** | Task điều tra `repeatEnd` (Đạt) chưa có kết luận: lỗi code hay giới hạn nền tảng |
| BR-DATA-01 | Done | `giftImageUrl` optional, ẩn `<img>` khi thiếu |

## NFR / rủi ro

| Mã | Trạng thái | Ghi chú |
|---|---|---|
| NFR-PERF-01 | Done | p50 153ms / p95 305ms / max 305ms (10 mẫu, localhost, Docker). Chưa đo qua mạng thật |
| NFR-PERF-05 | Done | Ảo hoá 3 cột feed (`VirtualList.jsx`), cap 200 item |
| NFR-REL-03 | Done | STATE_SYNC gửi snapshot khi `/monitor` connect |
| NFR-USA-02 | Done | Nút Tạm dừng/Kill Switch trên sticky header |
| NFR-SEC-01 | **Partial** | `POST /api/login` + `requireAuth` có; **`requireAuth` chưa gắn route nào, `LoginPage` chưa gọi `/api/login`**. Frontend đã gửi `Authorization: Bearer` và tự logout khi 401 (28/09) nhưng chưa có token thật để gửi |
| NFR-SEC-02 | **Chưa làm** | Chỉ có spec; xem `tuan-3-dieu-chinh-bao-cao.md`. `/game` đang mở hoàn toàn |
| NFR-SEC-04/06 | **Partial** | Chính sách HMAC-SHA256 đã viết; **code chưa làm** (`appUser.repository.js` không có HMAC, không có `USER_ID_PEPPER`) — task Thứ Sáu của Đạt chưa xong |
| RSK-01 | **Partial** | Mới chuẩn bị biến `.env`, chưa nối proxy vào connector |

## Tóm tắt

Tính theo từng mã: Done 27 · Partial 8 · Chưa làm 3 (FR-08, FR-09, NFR-SEC-02). Rủi ro cao nhất
là cụm **bảo mật** (NFR-SEC-01/02/04/06): tài liệu đã có nhưng code chưa theo kịp.
