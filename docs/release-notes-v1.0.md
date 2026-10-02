# TikTok LIVE Monitor v1.0 — ghi chú phát hành (02/10/2026)

Theo dõi một phòng TikTok LIVE theo thời gian thực (chat, quà, lượt vào), chạy Rule Engine và gửi
`EFFECT_COMMAND` sang Game Client qua Socket.IO, có ACK, tạm dừng và Kill Switch cho Operator.

- Chạy nhanh: [README](../README.md) (`cp .env.example .env && docker compose up --build`).
- Trạng thái từng yêu cầu: [fr-br-status-cuoi-v1.0.md](status/fr-br-status-cuoi-v1.0.md).
- Bằng chứng kiểm thử: [demo/verification.md](demo/verification.md). Kịch bản demo: [demo/final-demo.md](demo/final-demo.md).

## Trạng thái một câu

Hệ thống chạy trọn vẹn trên stack Docker sạch và qua các test tự động, **nhưng chưa được chạy với một phòng
TikTok LIVE đang phát thật**, chưa có rà soát pháp lý, và chưa đối chiếu với SRS gốc (file không có trong repo).

## Có gì trong v1.0

- **Dữ liệu LIVE:** kết nối theo @username, reconnect có backoff, phân biệt LIVE kết thúc và mất mạng, avatar +
  giờ bắt đầu, feed 3 cột có ảo hoá và bộ lọc, chỉ số tổng và theo phút.
- **Rule Engine:** rule lưu DB, sửa trên UI, nạp lại không cần restart; ngưỡng theo số lần / người dùng khác nhau /
  kim cương; cooldown, cửa sổ trượt, chống spam, chống trùng event; tối đa 3 effect/giây.
- **Effect:** ACK từ Game cập nhật trạng thái (`APPLIED`/`REJECTED`/`EXPIRED`, hoặc `NO_ACK` khi quá hạn), hiển thị
  trên Dashboard; Tạm dừng và Kill Switch.
- **Báo cáo:** mỗi phiên đóng sinh báo cáo; lịch sử phiên; tải CSV/JSON.
- **Bảo mật:** đăng nhập Operator (JWT), JWT riêng cho Game Client, khoá IP sau 5 lần sai, CORS theo cấu hình,
  userId lưu dạng HMAC, xoá/làm sạch dữ liệu người xem sau 30 ngày.

## Cách triển khai an toàn

1. Đổi mọi secret trong `.env`: `ADMIN_PASSWORD`, `JWT_SECRET`, `GAME_CLIENT_SECRET`, `USER_ID_PEPPER`
   (không đổi `USER_ID_PEPPER` giữa chừng).
2. **Đặt `NODE_ENV=production`.** `docker-compose.yml` mặc định `development` để demo, và ở chế độ này
   `/api/test-events/*` (tạo chat/quà/join giả) **mở, không cần token**. Production tắt hẳn các route đó
   (và các nút MOCK trên dashboard sẽ không dùng được). Đây là quyết định cho AC-W4-03.
3. Đặt `CORS_ORIGINS` đúng địa chỉ dashboard/overlay thật.
4. Nên đặt `EULER_API_KEY` (xem RSK-01 bên dưới).
5. DB tạo trước 02/10/2026: backup, rồi chạy `backend/scripts/pseudonymize-existing-data.js` một lần.

## Giới hạn đã biết

| # | Giới hạn | Ảnh hưởng / hướng xử lý |
|---|---|---|
| 1 | Chỉ theo dõi **một phòng** tại một thời điểm (AS-01) | Đổi phòng thì ngắt phòng cũ |
| 2 | RSK-01: proxy cho TikTok chưa nối | Nhiều kết nối từ một IP có thể bị Euler/TikTok giới hạn. Dùng `EULER_API_KEY` |
| 3 | Quà combo chỉ chốt sau khi người tặng ngừng; rớt mạng giữa combo thì mất event chốt | Combo đó không vào rule và báo cáo. Giới hạn nền tảng ([br-gf-01-ket-luan.md](status/br-gf-01-ket-luan.md)) |
| 4 | Danh sách Effect trên Dashboard nằm trong RAM (50 lệnh gần nhất) | Mất khi restart backend; lịch sử đầy đủ vẫn ở `effect_commands`/`effect_acks` |
| 5 | Bộ đếm khoá đăng nhập nằm trong RAM, tính theo IP | Reset khi restart. Sau reverse proxy mọi người dùng chung một IP, cần cấu hình `trust proxy` |
| 6 | `username`/`nickname` người xem vẫn plaintext trong `app_users` tối đa `RETENTION_DAYS` ngày; bản backup DB không nằm trong retention | NFR-SEC-04 còn Partial, chờ quyết định của Pháp chế |
| 7 | API rule chưa trả `warnings: ["COOLDOWN_SHORTER_THAN_WINDOW"]` như spec | BR-RULE-01 Partial. Không chặn chức năng |
| 8 | Modal Lịch sử phiên chưa có bộ lọc phòng/ngày | API đã hỗ trợ; FR-38 Partial |
| 9 | `expiresAt` cố định 5 giây sau `issuedAt` | Đổi công thức là breaking change với Game ([contract](api/interface-contract-v1.0-FROZEN.md)) |
| 10 | Benchmark chỉ đo trên localhost/Docker, ngưỡng p95 2000 ms là giả định | Cần đo lại qua mạng thật và theo ngưỡng của SRS |

## Việc còn lại cần người (mình không tự làm được)

1. **Chạy với một phòng TikTok LIVE thật** (tài khoản được phép theo dõi): feed thật, quà combo, kết thúc LIVE,
   report của phiên thật. Điền log vào bảng ở [br-gf-01-ket-luan.md](status/br-gf-01-ket-luan.md) và xác nhận tên trường
   avatar/giờ bắt đầu (FR-09).
2. **Rà soát pháp lý** (NFR-SEC-06) — xem mục dưới.
3. **Đối chiếu SRS gốc**: các mã FR/BR/NFR liệt kê ở cuối bảng trạng thái chưa được kiểm; riêng FR-30 cần xác nhận nghĩa
   ("lưu lịch sử" hay "kích hoạt thủ công").
4. Ảnh chụp các trạng thái header và video demo dự phòng.
5. Cân nhắc bổ sung: bộ lọc cho Lịch sử phiên, cảnh báo cooldown của rule, nối proxy (các mục 2, 7, 8 ở trên).

## Căn cứ pháp lý (cần cập nhật SRS)

SRS và các tài liệu cũ viện dẫn **Nghị định 13/2023/NĐ-CP**. Theo các nguồn tra cứu ngày 02/10/2026,
**Nghị định 356/2025/NĐ-CP** (ban hành 31/12/2025, hiệu lực từ 01/01/2026) hướng dẫn Luật Bảo vệ dữ liệu
cá nhân 2025 và thay thế Nghị định 13/2023. Việc cần làm: sửa căn cứ trong SRS, và để Pháp chế đối chiếu lại các
điểm đã nêu ở [userid-pseudonymization-policy.md](api/userid-pseudonymization-policy.md) (HMAC mới là giả danh hoá,
không phải ẩn danh tuyệt đối; thời hạn lưu 30 ngày; `username`/`nickname`) với khung mới. **Tài liệu này không kết
luận hệ thống tuân thủ pháp luật.**

Nguồn: [Nghị định 356/2025/NĐ-CP (thuvienphapluat.vn)](https://thuvienphapluat.vn/van-ban/Quyen-dan-su/Nghi-dinh-356-2025-ND-CP-huong-dan-Luat-Bao-ve-du-lieu-ca-nhan-687428.aspx),
[bản tóm tắt của EY Vietnam](https://www.ey.com/vi_vn/technical/tax/tax-and-law-updates/nghi-dinh-so-356-2025-nd-cp-quy-dinh-chi-tiet-mot-so-dieu-va-bien-phap-thi-hanh-luat-bao-ve-du-lieu-ca-nhan).

## Thay đổi chính trong Tuần 4

| Việc | Nội dung |
|---|---|
| Bảo mật (N2) | `raw_live_events` chỉ giữ `userIdHash`; job retention; migration dữ liệu cũ |
| Effect (N3) | ACK cập nhật trạng thái lệnh, `NO_ACK`; sửa `total_gifts` đếm cả tick combo; kết luận BR-GF-01 |
| Hardening (N4) | API rule theo spec và `RulesPage` dùng được; CORS theo cấu hình; khoá IP; CI GitHub Actions |
| Dashboard (N5) | Effect log với trạng thái ACK; chỉ số theo phút |
| Nghiệm thu (N6) | Stack Docker sạch, benchmark 16/16, AC-08 8/8, E2E viết lại; sửa log connector |
| Tài liệu (N7) | Bảng trạng thái cuối, ghi chú phát hành này |
