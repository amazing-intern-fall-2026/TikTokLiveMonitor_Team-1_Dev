# JSON Contract — TikTok LIVE Monitor → Game Team

Tài liệu mô tả định dạng dữ liệu (Envelope) mà Backend gửi cho team Game
qua **Socket.io**, để team Game bắt sự kiện và trigger hiệu ứng lên
nhân vật trong game.

> **Cập nhật 13/09:** đồng bộ theo `wrapEnvelope()` (commit `6d5bae1`,
> nhánh `Tai-dev`/`dev`) — đổi field `event` → `type`, gộp `user`/`payload`
> thành object lồng nhau đúng SRS mục 4.1–4.5, đổi `createTime` (epoch) →
> `receivedAt` (ISO 8601), bổ sung `roomId`.
>
> **Cập nhật 16/09:** `liveStream.service.js` (kết nối live thật) đã
> dùng lại `wrapEnvelope()` từ commit `a91e790` — cả luồng mock lẫn luồng
> live thật giờ phát cùng một shape Envelope, ghi chú "chưa đồng bộ" ở
> trên đã lỗi thời, không còn đúng.

## Kết nối

- Giao thức: Socket.io (WebSocket)
- Server: `http://<backend-host>:5000`
- Team Game lắng nghe (subscribe) các event theo tên bên dưới trên
  cùng một socket connection.

## Quy ước chung (Envelope — SRS mục 4.1)

Mọi event broadcast qua Socket.io đều có chung khung Envelope:

| Field | Type | Mô tả |
|---|---|---|
| `eventId` | string (UUID v4) | Sinh mỗi event (`crypto.randomUUID()`) — Game/FE dùng chống trigger trùng khi replay buffer |
| `sessionId` | string | Sinh 1 lần khi backend khởi động, giữ nguyên trong suốt phiên theo dõi hiện tại (v1.0 chỉ theo dõi 1 phòng live tại 1 thời điểm — SRS AS-01) |
| `roomId` | string | Phòng live đang theo dõi (tương ứng `room`/username TikTok) |
| `type` | string enum | `COMMENT` \| `GIFT` \| `JOIN` |
| `receivedAt` | string (ISO 8601) | Thời điểm backend nhận/xử lý event, dạng `new Date().toISOString()` |
| `seq` | number | Số nguyên tăng dần bắt đầu từ 1, đếm theo tiến trình backend hiện tại — dùng phát hiện event rớt/lệch thứ tự |
| `user` | object | `{ userId, uniqueId, nickname }` — thông tin người thực hiện hành động |
| `payload` | object | Dữ liệu riêng theo từng `type`, xem chi tiết ở mỗi mục bên dưới |
| `sourceTimestamp` | string (ISO 8601), optional | Chỉ có nếu phân biệt được thời điểm TikTok phát sinh vs thời điểm backend nhận |

> **Trạng thái hiện tại (16/09):** `wrapEnvelope()` (`backend/src/utils/envelope.js`)
> đã áp dụng cho cả 3 endpoint mock test-events **và** luồng live thật
> qua `liveStream.service.js` — mọi event CHAT/GIFT/MEMBER_JOIN, dù mock
> hay live, đều có đủ `eventId`/`sessionId`/`seq`.

---

## 1. Event `CHAT` (`type: "COMMENT"`) — Bình luận

Phát khi có người xem gửi bình luận trong phòng live.

```json
{
  "eventId": "b3f1c2e4-...-uuid",
  "sessionId": "session_1757754869000",
  "roomId": "tiktok_username",
  "type": "COMMENT",
  "receivedAt": "2026-09-13T07:54:29.123Z",
  "seq": 42,
  "user": {
    "userId": "1234567890123456789",
    "uniqueId": "viewer_unique_id",
    "nickname": "Viewer Nickname"
  },
  "payload": {
    "text": "nội dung bình luận",
    "textNormalized": "noi dung binh luan",
    "length": 19,
    "containsKeywords": []
  }
}
```

| Field (trong `payload`) | Type | Mô tả |
|---|---|---|
| `text` | string | Nội dung bình luận gốc |
| `textNormalized` | string | Bản đã chuẩn hoá: bỏ dấu tiếng Việt, bỏ emoji, lowercase, gộp khoảng trắng — dùng để match từ khoá (BR-CM-01) |
| `length` | number | Độ dài `text` |
| `containsKeywords` | array | Danh sách từ khoá khớp được (hiện backend trả mảng rỗng — logic lọc từ khoá thực tế **chưa** implement, xem mục 5) |

**Gợi ý cho Game:** dùng `textNormalized`/`containsKeywords` để match lệnh điều khiển nhân vật, dùng `user.nickname` để hiển thị tên người gửi lên màn hình.

---

## 2. Event `GIFT` (`type: "GIFT"`) — Quà tặng

Phát khi có người xem tặng quà (bao gồm combo quà đang được gộp).

```json
{
  "eventId": "c4a2d3f5-...-uuid",
  "sessionId": "session_1757754869000",
  "roomId": "tiktok_username",
  "type": "GIFT",
  "receivedAt": "2026-09-13T07:54:30.456Z",
  "seq": 43,
  "user": {
    "userId": "1234567890123456789",
    "uniqueId": "viewer_unique_id",
    "nickname": "Viewer Nickname"
  },
  "payload": {
    "giftId": 5655,
    "giftName": "Rose",
    "giftImageUrl": "https://p16-webcast.tiktokcdn.com/img/.../rose~tplv-obj.png",
    "unitDiamondValue": 1,
    "repeatCount": 10,
    "totalDiamondValue": 10,
    "isStreakable": true,
    "isStreakFinished": true,
    "giftTier": "SMALL"
  }
}
```

| Field (trong `payload`) | Type | Mô tả |
|---|---|---|
| `giftId` | number | ID quà tặng theo TikTok |
| `giftName` | string | Tên quà (vd: "Rose") |
| `giftImageUrl` | string \| undefined | URL icon quà (`giftDetails.giftImage.image_url` từ TikTok) — có thể `undefined` nếu TikTok không kèm ảnh |
| `unitDiamondValue` | number | Giá trị kim cương của **1 đơn vị** quà |
| `repeatCount` | number | Số lượng đã tặng trong combo |
| `totalDiamondValue` | number | = `unitDiamondValue * repeatCount` — backend **đã tính sẵn**, Game không cần tự nhân |
| `isStreakable` | boolean | Quà này có cơ chế combo hay không |
| `isStreakFinished` | boolean | `true` khi combo đã kết thúc — **Game chỉ nên trigger hiệu ứng khi `isStreakFinished === true`** |
| `giftTier` | string enum | `SMALL` (≤99 kim cương) \| `MEDIUM` (≤499) \| `LARGE` (≤1999) \| `EPIC` (>1999) — ngưỡng đọc động từ `backend/src/config/giftTiers.json`, chỉnh sửa không cần deploy lại (BR-GF-04) |

**Gợi ý cho Game:** map `giftId`/`giftTier` sang loại hiệu ứng (buff/debuff) theo bảng cấu hình riêng; dùng `totalDiamondValue` để tính độ mạnh hiệu ứng.

---

## 3. Event `MEMBER_JOIN` (`type: "JOIN"`) — Người vào phòng

```json
{
  "eventId": "d5b3e4a6-...-uuid",
  "sessionId": "session_1757754869000",
  "roomId": "tiktok_username",
  "type": "JOIN",
  "receivedAt": "2026-09-13T07:54:31.789Z",
  "seq": 44,
  "user": {
    "userId": "1234567890123456789",
    "uniqueId": "viewer_unique_id",
    "nickname": "Viewer Nickname"
  },
  "payload": {
    "isFirstJoinInSession": true,
    "joinCountInSession": 1,
    "isBacklog": false
  }
}
```

| Field (trong `payload`) | Type | Mô tả |
|---|---|---|
| `isFirstJoinInSession` | boolean | User này có phải lần đầu vào phòng trong phiên hiện tại không |
| `joinCountInSession` | number | Số lần user này đã join trong phiên |
| `isBacklog` | boolean | `true` nếu JOIN này đến trong vòng 10s đầu sau khi connect — TikTok replay các viewer đã ở sẵn trong phòng thay vì người mới vào thật (BR-JN-04) |

> **Giới hạn của kết nối ẩn danh (quan trọng — vẫn còn hiệu lực):** ở
> mock test-events, `isFirstJoinInSession`/`joinCountInSession` được set
> **thủ công qua request body** (mặc định `true`/`1`) để mô tả đúng shape
> dữ liệu mong muốn. Nhưng với **live thật**, `tiktok-live-connector` ở
> chế độ ẩn danh (event `ROOM_USER`) chỉ trả về **tổng `viewerCount`**,
> **không có** danh sách/thông tin từng người vừa vào phòng. Vì vậy:
> - Ở luồng live thật, backend **chưa thể** tự tính `isFirstJoinInSession`
>   hay `joinCountInSession` thật — đây vẫn là **giới hạn nền tảng**, cần
>   Dev Game xác nhận chấp nhận (xem OQ liên quan đã gửi).
> - Field `payload` ở mục này mô tả **shape mong muốn theo SRS**; giá trị
>   thật cho live case cần thêm giải pháp khác (vd. nâng cấp lên kết nối
>   có đăng nhập) mới lấy được.

---

## 4. Endpoint test (Mock) — dùng để Game team dev không cần chờ live thật

| Method | Endpoint | `type` broadcast |
|---|---|---|
| POST | `/api/test-events/chat` | `COMMENT` |
| POST | `/api/test-events/gift` | `GIFT` |
| POST | `/api/test-events/member-join` | `JOIN` |

Backend tự sinh `eventId`, `sessionId`, `seq`, `receivedAt` — body request chỉ cần các field nghiệp vụ. Ví dụ gọi test gift:

POST /api/test-events/gift
Content-Type: application/json

{
"room": "demo_room",
"userId": "test_user",
"uniqueId": "test_user",
"nickname": "Test User",
"giftId": 5655,
"giftName": "Rose",
"repeatCount": 1,
"isStreakFinished": true,
"diamondCount": 1
}


## 5. Việc còn mở (cần chốt thêm)

- [ ] Đồng bộ `wrapEnvelope()` vào `liveStream.service.js` (luồng live thật) — hiện chỉ mock đã dùng
- [ ] Logic lọc từ khoá thực tế cho `containsKeywords` (hiện luôn trả mảng rỗng)
- [ ] Bảng mapping `giftId`/`giftTier` → loại hiệu ứng game cụ thể (buff nào, debuff nào, độ mạnh) — chờ OQ-01/OQ-02
- [ ] Ngưỡng `viewerCount` nào thì trigger hiệu ứng đặc biệt (nếu có)
- [ ] Giải pháp cho `isFirstJoinInSession`/`joinCountInSession` ở luồng live thật (giới hạn kết nối ẩn danh)