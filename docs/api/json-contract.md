# JSON Contract — TikTok LIVE Monitor → Game Team

Tài liệu mô tả định dạng dữ liệu (payload) mà Backend gửi cho team Game
qua **Socket.io**, để team Game bắt sự kiện và trigger hiệu ứng lên
nhân vật trong game.

## Kết nối

- Giao thức: Socket.io (WebSocket)
- Server: `http://<backend-host>:5000`
- Team Game lắng nghe (subscribe) các event theo tên bên dưới trên
  cùng một socket connection.

## Quy ước chung

- Mọi payload đều là JSON object.
- Trường `eventId`: UUID v4, sinh tại backend cho **mỗi event** khi extract từ
  connector — dùng để Game/FE chống trigger trùng (idempotency), đặc biệt
  quan trọng khi client bị mất kết nối socket và replay lại buffer.
- Trường `sessionId`: UUID v4, sinh tại backend **mỗi khi bắt đầu một phiên
  kết nối** (`connectToLiveStream` được gọi) tới 1 `room`; giữ nguyên cho đến
  khi phiên đó `DISCONNECTED`. Dùng để nhóm các event theo cùng một lần theo
  dõi live, tránh lẫn dữ liệu nếu operator disconnect rồi connect lại cùng
  room.
- Trường `seq`: số nguyên tăng dần (bắt đầu từ 1), reset về 1 mỗi khi có
  `sessionId` mới — dùng để Game/FE phát hiện event bị rớt hoặc tới sai thứ
  tự.
- Trường `room`: username TikTok (uniqueId) của phiên live đang theo dõi —
  dùng để phân biệt khi có nhiều phòng live được theo dõi song song.
- Trường `createTime`: timestamp (epoch millis).
- Các trường có thể `null` nếu TikTok không trả về dữ liệu tương ứng.

> **Trạng thái hiện tại (09/2026):** `eventId`, `sessionId`, `seq` được đặc
> tả ở đây theo yêu cầu chuẩn hoá Envelope (SRS mục 4.1) nhưng **chưa được
> sinh trong code** (`liveStream.service.js` hiện chưa có UUID/seq counter,
> chưa có khái niệm "phiên"). Đây là việc cần bổ sung ở backend trước khi
> Game team dựa vào các field này để chống trùng/chống lệch thứ tự.

---

## 1. Event `CHAT` — Bình luận

Phát khi có người xem gửi bình luận trong phòng live.

```json
{
  "event": "CHAT",
  "eventId": "b3f1c2e4-...-uuid",
  "sessionId": "7a9d0e21-...-uuid",
  "seq": 42,
  "room": "tiktok_username",
  "userId": "1234567890123456789",
  "username": "viewer_unique_id",
  "nickname": "Viewer Nickname",
  "comment": "nội dung bình luận",
  "createTime": 1735689600000
}
```

| Field | Type | Mô tả |
|---|---|---|
| eventId | string (UUID) | Định danh duy nhất của event — xem Quy ước chung |
| sessionId | string (UUID) | Định danh phiên kết nối hiện tại — xem Quy ước chung |
| seq | number | Số thứ tự event trong phiên — xem Quy ước chung |
| userId | string | ID nội bộ TikTok của người bình luận |
| username | string | uniqueId (@handle) của người bình luận |
| nickname | string | Tên hiển thị |
| comment | string | Nội dung bình luận |

**Gợi ý cho Game:** dùng `comment` để match từ khóa (ví dụ lệnh điều
khiển nhân vật), dùng `nickname` để hiển thị tên người gửi lên màn hình.

---

## 2. Event `GIFT` — Quà tặng

Phát khi có người xem tặng quà (bao gồm combo quà đang được gộp).

```json
{
  "event": "GIFT",
  "eventId": "c4a2d3f5-...-uuid",
  "sessionId": "7a9d0e21-...-uuid",
  "seq": 43,
  "room": "tiktok_username",
  "userId": "1234567890123456789",
  "username": "viewer_unique_id",
  "nickname": "Viewer Nickname",
  "giftId": 5655,
  "giftName": "Rose",
  "repeatCount": 3,
  "repeatEnd": false,
  "diamondCount": 1,
  "createTime": 1735689600000
}
```

| Field | Type | Mô tả |
|---|---|---|
| eventId | string (UUID) | Định danh duy nhất của event — xem Quy ước chung |
| sessionId | string (UUID) | Định danh phiên kết nối hiện tại — xem Quy ước chung |
| seq | number | Số thứ tự event trong phiên — xem Quy ước chung |
| giftId | number | ID quà tặng theo TikTok |
| giftName | string | Tên quà (vd: "Rose") |
| repeatCount | number | Số lượng đã tặng trong combo hiện tại (tăng dần khi user giữ combo) |
| repeatEnd | boolean | `true` khi combo đã kết thúc — **Game chỉ nên trigger hiệu ứng khi `repeatEnd === true`** để tránh trigger lặp lại nhiều lần trong 1 combo |
| diamondCount | number | Giá trị quy đổi kim cương của **1 đơn vị** quà (tổng giá trị = `diamondCount * repeatCount`) |

**Gợi ý cho Game:** map `giftId`/`giftName` sang loại hiệu ứng
(buff/debuff) theo bảng cấu hình riêng của team Game; dùng
`diamondCount * repeatCount` để tính độ mạnh của hiệu ứng.

---

## 3. Event `MEMBER_JOIN` — Người vào phòng / Cập nhật viewer

Phát khi có cập nhật số lượng người xem (bao gồm khi có người mới vào phòng).

```json
{
  "event": "MEMBER_JOIN",
  "eventId": "d5b3e4a6-...-uuid",
  "sessionId": "7a9d0e21-...-uuid",
  "seq": 44,
  "room": "tiktok_username",
  "viewerCount": 1024,
  "createTime": 1735689600000
}
```

| Field | Type | Mô tả |
|---|---|---|
| eventId | string (UUID) | Định danh duy nhất của event — xem Quy ước chung |
| sessionId | string (UUID) | Định danh phiên kết nối hiện tại — xem Quy ước chung |
| seq | number | Số thứ tự event trong phiên — xem Quy ước chung |
| viewerCount | number | Tổng số người đang xem tại thời điểm phát event |

> **Giới hạn của kết nối ẩn danh (quan trọng):** ở chế độ không đăng nhập,
> `tiktok-live-connector` bắt event `ROOM_USER` chỉ trả về **tổng số viewer
> hiện tại**, **không** trả về danh sách/thông tin từng người vừa vào phòng
> (không có username, nickname, userId của người mới join). Vì vậy:
> - Event `MEMBER_JOIN` hiện tại là **cập nhật viewer count tổng**, không
>   phải "1 event = 1 người vào phòng".
> - Game **không thể** dựa vào event này để biết chính xác *ai* vừa vào,
>   và **không thể** implement logic phân biệt "lần đầu vào phiên"
>   (tương đương `isFirstJoinInSession` phía FE) chỉ từ dữ liệu backend gửi.
> - Nếu Game cần trigger hiệu ứng theo *từng người* vào phòng (thay vì theo
>   ngưỡng viewerCount), đây là **giới hạn nền tảng** cần được Dev Game xác
>   nhận chấp nhận, chứ không phải lỗi/thiếu sót có thể fix bằng code phía
>   backend với giải pháp kết nối ẩn danh hiện tại.

---

## 4. Endpoint test (Mock) — dùng để Game team dev không cần chờ live thật

| Method | Endpoint | Broadcast event |
|---|---|---|
| POST | `/api/test-events/chat` | `CHAT` |
| POST | `/api/test-events/gift` | `GIFT` |
| POST | `/api/test-events/member-join` | `MEMBER_JOIN` |

Body của mỗi request test nên theo đúng format field ở trên (trừ
`createTime`, do backend tự gán). Ví dụ gọi test gift:

```
POST /api/test-events/gift
Content-Type: application/json

{
  "room": "demo_room",
  "username": "test_user",
  "nickname": "Test User",
  "giftId": 5655,
  "giftName": "Rose",
  "repeatCount": 1,
  "repeatEnd": true,
  "diamondCount": 1
}
```

## 5. Việc còn mở (cần chốt thêm với team Game)

- [ ] Bảng mapping `giftId` → loại hiệu ứng game cụ thể (buff nào, debuff nào, độ mạnh)
- [ ] Ngưỡng `viewerCount` nào thì trigger hiệu ứng đặc biệt (nếu có)
- [ ] Có cần lọc/chặn từ ngữ không phù hợp trong `comment` trước khi gửi cho Game không