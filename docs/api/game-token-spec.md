# Đặc tả Token cho namespace `/game` (NFR-SEC-02)
**Người soạn:** Huy Hào | **Ngày:** 17/09/2026
**Bàn giao cho:** Nguyễn Thiên Tài, code Thứ Năm
**Yêu cầu gốc:** NFR-SEC-02 — "Kênh WebSocket sang Game Client dùng token
phiên, có thời hạn"

---

## 1. Quyết định thiết kế: tái dùng hạ tầng JWT đã có, không tạo cơ chế mới

Repo đã có sẵn JWT cho Operator (`auth.controller.js`, `jsonwebtoken`,
`JWT_SECRET` trong `env.js`). Token cho `/game` nên **dùng chung
`JWT_SECRET`**, chỉ khác ở `role` claim — tránh phải quản lý 2 khoá bí
mật, 2 cơ chế verify khác nhau trong cùng 1 backend.

## 2. Nơi cấp token

**Endpoint mới:** `POST /api/auth/game-token`

Game Client không phải người dùng có username/password như Operator —
đây là **machine-to-machine**, nên dùng mô hình **shared secret** (giống
tinh thần `ADMIN_USERNAME`/`ADMIN_PASSWORD` hiện tại, nhưng riêng cho
Game):

```
POST /api/auth/game-token
Content-Type: application/json

{ "clientSecret": "<giá trị GAME_CLIENT_SECRET, cấp thủ công cho team Game>" }
```

Response thành công:
```json
{ "token": "eyJhbGciOi...", "tokenType": "Bearer", "expiresIn": "24h" }
```

Response thất bại (sai secret): `401 { "message": "Sai client secret" }`

**Biến môi trường mới cần thêm** (`.env`, `.env.example`, theo đúng pattern
`ADMIN_USERNAME`/`ADMIN_PASSWORD` đang có):
```
GAME_CLIENT_SECRET=<chuỗi ngẫu nhiên ≥32 ký tự, cấp thủ công cho team Game qua kênh riêng — KHÔNG gửi qua chat/email thường>
GAME_TOKEN_EXPIRES_IN=24h
```

## 3. Format token

JWT chuẩn (`jsonwebtoken`), ký bằng `JWT_SECRET` hiện có — **tái dùng
đúng khoá**, không tạo `GAME_JWT_SECRET` riêng (giảm số lượng secret cần
quản lý).

Payload:
```json
{
  "sub": "game-client",
  "role": "game_client",
  "iat": 1234567890,
  "exp": 1234654290
}
```

| Claim | Giá trị | Ghi chú |
|---|---|---|
| `sub` | `"game-client"` cố định | Không có khái niệm nhiều Game Client khác nhau ở v1.0 (giống Operator — 1 credential dùng chung) |
| `role` | `"game_client"` | Dùng để phân biệt với JWT của Operator (`role: "operator"`) — **quan trọng**: không cho phép Operator JWT dùng để connect `/game`, và ngược lại, dù dùng chung `JWT_SECRET` |
| `exp` | theo `GAME_TOKEN_EXPIRES_IN` (mặc định 24h) | Ngắn hơn JWT Operator (8h) hay dài hơn tuỳ quyết định — đề xuất 24h vì Game Client thường là 1 tiến trình chạy dài suốt buổi live, không muốn bị văng giữa chừng như Operator (Operator có UI để login lại dễ dàng, Game Client thì không nên bị gián đoạn) |

## 4. Cách `socket.handler.js` verify khi client connect

Dùng cơ chế **Socket.io middleware xác thực lúc handshake**
(`namespace.use()`), không xác thực sau khi đã connect — để từ chối kết
nối **trước khi** vào được namespace, tránh lộ bất kỳ thông tin gì cho
client chưa xác thực.

### Phía Game Client (khi connect)
```js
const socket = io(`${SERVER_URL}/game`, {
  transports: ['websocket'],
  auth: { token: gameToken }, // token lấy từ POST /api/auth/game-token
});
```

### Phía Backend (`socket.handler.js`) — code mẫu cụ thể để Tài dùng

```js
const jwt = require('jsonwebtoken');
const { jwtSecret } = require('../config/env');

function registerSocketHandlers(io) {
  const monitorNamespace = io.of('/monitor');
  const gameNamespace = io.of('/game');

  // NFR-SEC-02: /game yêu cầu token hợp lệ, xác thực NGAY lúc handshake
  // (trước khi lọt vào 'connection' event) — reject sớm, không tốn tài
  // nguyên xử lý cho client chưa xác thực.
  gameNamespace.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error('MISSING_TOKEN'));
    }

    try {
      const payload = jwt.verify(token, jwtSecret);
      if (payload.role !== 'game_client') {
        return next(new Error('WRONG_ROLE')); // chặn JWT của Operator dùng nhầm ở đây
      }
      socket.gameClientPayload = payload; // lưu lại nếu cần dùng sau (vd. logging)
      next();
    } catch (err) {
      // jwt.verify tự throw khi hết hạn (TokenExpiredError) hoặc sai chữ ký
      return next(new Error('INVALID_OR_EXPIRED_TOKEN'));
    }
  });

  gameNamespace.on('connection', (socket) => {
    gameLog.info('Client connected', { socketId: socket.id });
    // ... phần còn lại giữ nguyên như code hiện tại
  });
}
```

**Phía Game Client cần biết:** nếu handshake bị `next(new Error(...))`,
Socket.io tự động phát event `connect_error` cho client với
`error.message` đúng là chuỗi đã truyền (`MISSING_TOKEN`,
`WRONG_ROLE`, `INVALID_OR_EXPIRED_TOKEN`) — Game Client nên bắt event
này để biết chính xác lý do bị từ chối, ví dụ:
```js
socket.on('connect_error', (err) => {
  console.error('Kết nối /game bị từ chối:', err.message);
});
```

## 5. Việc KHÔNG nằm trong phạm vi hôm nay (nêu rõ để không bị hiểu nhầm là đã làm)

- **Không có cơ chế refresh token** — khi token hết hạn (24h), Game
  Client tự gọi lại `POST /api/auth/game-token` để lấy token mới, rồi tự
  reconnect Socket.io với token mới. Không có luồng "refresh token" riêng
  ở v1.0.
- **Không thu hồi (revoke) token trước hạn** — nếu `GAME_CLIENT_SECRET`
  bị lộ, cách xử lý duy nhất ở v1.0 là **đổi `GAME_CLIENT_SECRET` trong
  env** (khiến token cũ vẫn hợp lệ đến khi hết hạn tự nhiên — vì JWT tự
  chứa thông tin, không tra cứu DB — nhưng client mới không lấy được
  token mới bằng secret cũ). Chấp nhận độ trễ tối đa 24h này ở v1.0.
- **`GAME_CLIENT_SECRET` là 1 giá trị dùng chung**, không phân biệt được
  nhiều instance Game Client khác nhau (giống hạn chế của Operator auth
  hiện tại) — nếu sau này cần nhiều Game Client riêng biệt với quyền
  khác nhau, cần thiết kế lại, ngoài phạm vi v1.0.

## 6. Cần cập nhật `docs/api/game-integration-guide.md` sau khi code xong

Sau khi Tài code xong Thứ Năm, cần bổ sung vào `game-integration-guide.md`
mục 1 (Kết nối): bước gọi `POST /api/auth/game-token` trước khi connect
Socket.io, và cách xử lý `connect_error`. **Việc này thuộc task riêng,
không tự làm trong tài liệu đặc tả này.**