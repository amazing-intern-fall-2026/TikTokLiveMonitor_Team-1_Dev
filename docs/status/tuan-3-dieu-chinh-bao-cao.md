# Điều chỉnh báo cáo Tuần 3 theo kết quả review 25/09/2026

File `G1-Report_Báo_cáo_Tuần_3_.csv` gốc đã bị lỗi mã hoá từ trước (nhiều ký tự
tiếng Việt đã thành dấu `?` ngay trong byte của file, không khôi phục được),
nên **không ghi đè file CSV** — chỉ cần sửa tay đúng 1 dòng dưới đây.

## Dòng cần sửa: Thứ Tư (23/09/2026) — Nguyễn Thiên Tài

Dòng này gộp 2 việc nhưng chỉ ghi 1 trạng thái "Đã hoàn thành". Đối chiếu
code thật trên `main` (kể cả toàn bộ `git log --all`) cho thấy hai việc có
kết quả khác nhau:

| Việc trong dòng | Trạng thái cũ | Trạng thái đúng | Bằng chứng |
|---|---|---|---|
| Mở namespace `/game` có xác thực token (NFR-SEC-02) | Đã hoàn thành | **Chưa làm** | `socket.handler.js` không có `gameNamespace.use()`; không có `POST /api/auth/game-token`; `.env.example` không có `GAME_CLIENT_SECRET`; không commit nào ở mọi branch từng thêm các thứ này |
| Cài PAUSE_EFFECTS (FR-32) | Đã hoàn thành | **Đã hoàn thành** (giữ nguyên) | `test-ac08-kill-switch-pause.js` 8/8 pass |

### Nội dung thay vào các ô của dòng đó

- **Tiến độ hoàn thành:** Hoàn thành một phần (PAUSE_EFFECTS xong; token `/game` chưa làm)
- **Phần còn lại / Lý do chưa xong:** Chưa code xác thực token cho namespace `/game` (NFR-SEC-02): thiếu middleware `gameNamespace.use()`, endpoint `POST /api/auth/game-token`, biến `GAME_CLIENT_SECRET`. Hiện `/game` mở hoàn toàn. Đã phát hiện khi review 25/09, spec đầy đủ ở `docs/api/game-token-spec.md`.
- **Dự kiến hoàn thành:** đầu Tuần 4 (xem AC-W4-01 trong `docs/status/ac-tuan-4.md`)

## Hai điểm liên quan nên ghi chú thêm (không sửa trạng thái, chỉ để minh bạch)

1. **Thứ Hai — "Đăng nhập có JWT bảo vệ"** (mục Definition of Done): endpoint
   `POST /api/login` đã có, nhưng `LoginPage.jsx` **không gọi** endpoint này
   (chỉ kiểm tra ô nhập không rỗng rồi vào Dashboard, không nhận/lưu token) và
   `requireAuth` chưa gắn vào route nào. Nghĩa là đăng nhập hiện chỉ là màn
   hình, chưa bảo vệ thật. Xem AC-W4-02/03.
2. **Thứ Ba — token spec của Huy Hào:** ghi "bàn giao cho Tài code Thứ Năm"
   trong khi báo cáo Thứ Tư của Tài đã ghi hoàn thành — lệch mốc thời gian
   giữa hai bên, là một nguyên nhân khiến việc này bị bỏ sót.
