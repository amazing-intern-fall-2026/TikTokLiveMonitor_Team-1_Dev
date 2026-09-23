# Quy tắc ẩn danh hoá `userId` — Tuân thủ Nghị định 13/2023/NĐ-CP
**Người soạn:** Huy Hào | **Ngày:** 17/09/2026
**Phạm vi:** NFR-SEC-04, NFR-SEC-06
**Trạng thái:** Đề xuất kỹ thuật — **cần Pháp chế rà soát trước khi vận
hành thương mại** (đúng như NFR-SEC-06 yêu cầu, tài liệu này không thay
thế bước đó)

---

## 1. Vấn đề cần giải quyết

`tiktok_user_id` (định danh nội bộ TikTok của khán giả) hiện đang lưu
**nguyên văn (plaintext)** trong cột `app_users.tiktok_user_id`
(`database/schema.sql`). Đây là dữ liệu định danh cá nhân theo Nghị định
13/2023/NĐ-CP — cần được xử lý để giảm thiểu rủi ro nếu dữ liệu bị lộ,
theo đúng tinh thần NFR-SEC-04 ("chỉ lưu trong phạm vi log phiên") và
nguyên tắc giảm thiểu dữ liệu (data minimization) của Nghị định.

## 2. Lưu ý minh bạch về thuật ngữ (quan trọng, đọc trước khi triển khai)

Yêu cầu dùng "băm SHA-256" — cần nói rõ để Pháp chế không hiểu nhầm mức
độ bảo vệ:

- **Băm (hashing) thuần, không có khoá bí mật** = có thể bị dò ngược
  bằng **rainbow table** nếu không gian giá trị đầu vào nhỏ/đoán được.
  `tiktok_user_id` là chuỗi số có cấu trúc phần nào đoán được (không phải
  ngẫu nhiên hoàn toàn) → **băm SHA-256 trần KHÔNG đủ an toàn** để gọi là
  "ẩn danh hoá" đúng nghĩa, chỉ là "giả danh hoá" (pseudonymization) yếu.
- **Giải pháp đề xuất: HMAC-SHA256 với khoá bí mật (pepper) phía server**
  thay vì SHA-256 trần. Đây vẫn là "họ hàng" SHA-256 (dùng SHA-256 làm
  hàm băm lõi trong cấu trúc HMAC) nhưng thêm khoá bí mật khiến việc dò
  ngược bằng rainbow table **bất khả thi nếu không có khoá** — đáp ứng
  đúng tinh thần yêu cầu, đồng thời an toàn hơn nhiều so với SHA-256 trần.
- Về bản chất pháp lý: đây vẫn là **pseudonymization** (có thể phục hồi
  nếu có khoá + truy cập hệ thống), không phải **anonymization tuyệt đối**
  (không thể phục hồi trong mọi trường hợp) — cần Pháp chế xác nhận mức
  độ này có đáp ứng yêu cầu Nghị định 13 cho mục đích cụ thể của hệ thống
  hay không, trước khi vận hành thương mại.

## 3. Phạm vi áp dụng

| Field | Xử lý | Lý do |
|---|---|---|
| `tiktok_user_id` | **Băm bằng HMAC-SHA256** trước khi lưu | Định danh bền vững nhất — cho phép truy vết 1 người qua nhiều phiên/nhiều buổi live nếu lộ, rủi ro cao nhất |
| `username` (uniqueId, @handle) | **Chưa quyết định trong tài liệu này** — đề xuất giữ nguyên plaintext vì cần thiết cho hiển thị Monitor UI và báo cáo (FR-36 "top người tương tác"), nhưng đây là dữ liệu định danh trực tiếp → cần Pháp chế quyết định | Ngoài phạm vi yêu cầu hôm nay (chỉ nói rõ userId), nêu ra để không bị bỏ sót |
| `nickname` | Tương tự `username` — chưa quyết định, cần Pháp chế | — |

**Phạm vi hôm nay chỉ xử lý `tiktok_user_id`** theo đúng yêu cầu được
giao; 2 field còn lại nêu ra như rủi ro tồn đọng, không tự ý xử lý để
tránh phá vỡ FR-36 (báo cáo cần hiển thị tên người tương tác) khi chưa
có quyết định chính thức.

## 4. Thiết kế kỹ thuật

### 4.1 Công thức băm
```
hashed_user_id = HMAC-SHA256(key = SERVER_PEPPER, message = tiktok_user_id)
```
- `SERVER_PEPPER`: chuỗi bí mật ngẫu nhiên ≥32 byte, lưu trong biến môi
  trường (`.env`, KHÔNG commit vào repo), tương tự cách `EULER_API_KEY`
  đang được xử lý.
- Kết quả: chuỗi hex 64 ký tự, thay thế trực tiếp giá trị lưu trong cột
  `app_users.tiktok_user_id` — **không cần đổi schema**, không cần cột
  mới, không breaking với `UNIQUE` constraint hiện có (hash vẫn
  deterministic — cùng 1 `tiktok_user_id` luôn ra cùng 1 hash, nên
  `ON CONFLICT (tiktok_user_id)` trong `appUser.repository.js` vẫn hoạt
  động đúng).

### 4.2 Điểm áp dụng — chỉ 1 chỗ cần sửa
File `backend/src/repositories/appUser.repository.js`, hàm `upsert()` —
băm `tiktokUserId` **ngay trước khi insert**, trước khi build câu SQL:

```js
const crypto = require('crypto');

const PEPPER = process.env.USER_ID_PEPPER;
if (!PEPPER) {
  throw new Error('USER_ID_PEPPER env var is required to pseudonymize tiktok_user_id');
}

function hashUserId(tiktokUserId) {
  return crypto.createHmac('sha256', PEPPER).update(String(tiktokUserId)).digest('hex');
}

function upsert({ tiktokUserId, username, nickname }) {
  const hashedId = hashUserId(tiktokUserId);
  return db.query(
    `INSERT INTO app_users (tiktok_user_id, username, nickname)
     VALUES ($1, $2, $3)
     ON CONFLICT (tiktok_user_id) DO UPDATE SET
       username = EXCLUDED.username, nickname = EXCLUDED.nickname, last_seen_at = NOW()
     RETURNING *`,
    [hashedId, username, nickname]
  ).then((result) => result.rows[0]);
}
```

**Không đổi gì ở tầng in-memory (`RuleEngine.service.js`)** — logic
`isFirstJoinInSession`/đếm `uniqueUsers` trong Rule Engine tiếp tục dùng
`tiktok_user_id` gốc (plaintext) từ `envelope.user.userId` trong RAM,
vì đây là dữ liệu tạm thời phục vụ tính toán ngay lúc live, không persist
xuống đĩa lâu dài — không thuộc phạm vi "kho lưu trữ dữ liệu" mà NFR-SEC-04
nhắm tới. Chỉ khi **ghi xuống Postgres** mới cần băm.

### 4.3 Vì sao không cần job "xoá sau 30 ngày" riêng cho userId
Vì hash được tạo **ngay từ lúc ghi**, dữ liệu đã ở dạng giả danh hoá kể
từ thời điểm 0 — không đợi đến ngày 30 mới ẩn danh hoá `tiktok_user_id`
như NFR-SEC-04 mô tả ở mức tối thiểu ("...sau đó tự động xoá hoặc ẩn
danh hoá"). Đây là cách tiếp cận **chặt hơn yêu cầu tối thiểu**, giảm
thời gian dữ liệu nhạy cảm tồn tại ở dạng đọc được xuống gần như 0.

Vẫn cần 1 job riêng (ngoài phạm vi tài liệu này) để **xoá toàn bộ dòng dữ
liệu** (`app_users`, `events`, các bảng payload liên quan) sau 30 ngày,
đáp ứng phần "thời hạn lưu tối đa 30 ngày" của NFR-SEC-04 — đây là việc
retention/cleanup job, khác với việc băm.

## 5. Rủi ro & giới hạn cần Pháp chế xác nhận

1. **Mức độ "ẩn danh hoá" có đạt chuẩn Nghị định 13 hay không** — như đã
   nói ở mục 2, đây là pseudonymization (có thể phục hồi nếu có
   `SERVER_PEPPER` + quyền truy cập hệ thống), không phải anonymization
   tuyệt đối.
2. **`username`/`nickname` chưa xử lý** — vẫn là dữ liệu định danh trực
   tiếp lưu plaintext, cần quyết định riêng (có thể chấp nhận được nếu
   Pháp chế xác định mục đích sử dụng — hiển thị vận hành/báo cáo — là
   hợp lý và có cơ sở pháp lý, nhưng cần xác nhận chính thức, không tự
   quyết).
3. **Xoay vòng `SERVER_PEPPER`:** nếu đổi pepper, mọi hash cũ sẽ không
   khớp hash mới của cùng 1 user → mất khả năng nhận diện "đã từng vào
   phòng chưa" giữa các lần đổi pepper. Đề xuất: **không xoay vòng**
   pepper trong vòng đời dữ liệu (khớp với chu kỳ xoá 30 ngày ở mục 4.3)
   — chỉ đổi khi nghi ngờ pepper bị lộ, chấp nhận đánh đổi mất tính liên
   tục nhận diện user cũ.
4. **`app_users.username`** — đã kiểm tra: KHÔNG có `UNIQUE` constraint
   trong schema hiện tại, chỉ `tiktok_user_id` mới có → không có xung đột
   với logic `ON CONFLICT (tiktok_user_id)` khi triển khai hash.

## 6. Việc cần làm tiếp

- [ ] Gửi tài liệu này cho Pháp chế (hoặc người phụ trách OQ-08 trong
      SRS) — xác nhận mức pseudonymization này có đạt yêu cầu Nghị định
      13 cho mục đích sử dụng cụ thể của hệ thống hay không
- [ ] Đạt/Tài code đoạn hash vào `appUser.repository.js`, thêm
      `USER_ID_PEPPER` vào `.env.example` (không có giá trị thật, chỉ
      placeholder — giống cách `EULER_API_KEY` đang làm)
- [ ] Quyết định riêng cho `username`/`nickname` (ngoài phạm vi hôm nay)
- [ ] Xây dựng job xoá dữ liệu sau 30 ngày (retention job) — việc khác,
      chưa nằm trong phạm vi tài liệu này