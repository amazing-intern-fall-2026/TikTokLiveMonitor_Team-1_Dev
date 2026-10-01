# Mock Game Client — bàn giao cho team Dev Game

Đây là bản giả lập **đứng thay cho Game Client thật** (game thật chưa tồn tại
ở thời điểm này). Team Game dùng nó để: (1) hiểu rõ contract mình cần code,
(2) test thử luồng nhận lệnh hiệu ứng trước khi có game thật.

## 1. Yêu cầu & cài đặt

- Node.js >= 18 (cần `fetch` built-in nếu sau này bạn tự viết script gọi API khác).
- Cài dependency (chỉ 1 package, `socket.io-client`):
  ```bash
  cd mock-game-client
  npm install
  ```

## 2. Chạy

```bash
GAME_TOKEN='<token>' node index.js http://localhost:5000
```
Tham số đầu tiên là URL backend, mặc định `http://localhost:5000` nếu bỏ trống:
```bash
GAME_TOKEN='<token>' node index.js
```

Kết nối thành công sẽ thấy:
```
[mock-game-client] connected to http://localhost:5000/game as <socketId>
```

## 3. Nó làm gì

Đứng thay vai trò **Game thật**, lắng nghe 2 loại lệnh trên namespace
`/game` và luôn tự động gửi lại `EFFECT_ACK` (bắt buộc theo BR-EFF-03, để
Dashboard biết lệnh có thật sự được áp dụng hay không):

| Lệnh nhận vào | Khi nào | Hành động mock làm |
|---|---|---|
| `EFFECT_COMMAND` | Rule Engine phát hiệu ứng (đủ ngưỡng bão comment/quà/join) | In log, quyết định APPLIED / REJECTED / EXPIRED (xem bảng dưới), gửi lại `EFFECT_ACK` |
| `CLEAR_ALL_EFFECTS` | Operator bấm **Kill Switch** | Tương tự — coi như 1 lệnh cần ack |

**3 trạng thái ack có thể gửi lại** (field `status` trong `EFFECT_ACK`):

| status | Khi nào mock trả về | Ý nghĩa nghiệp vụ |
|---|---|---|
| `APPLIED` | Mặc định, không rơi vào 2 trường hợp dưới | Game đã áp hiệu ứng thành công |
| `EXPIRED` | `receivedAt > command.expiresAt` (lệnh tới trễ, hiện `expiresAt` luôn = `issuedAt + 5s`, xem Interface Contract v1.0) | Lỗi **thời gian** — lệnh tới quá trễ, Game chủ động không áp để tránh hiệu ứng "giật cục" xuất hiện sai lúc |
| `REJECTED` | Ngẫu nhiên 20% (`REJECT_PROBABILITY` trong `index.js`), giả lập nhân vật đang chết/cutscene | Từ chối vì **lý do nghiệp vụ** dù lệnh vẫn còn hạn — khác hẳn `EXPIRED` |

Game thật khi code cần tự quyết định khi nào trả `REJECTED` (busy/animation
lock/...) và khi nào `EXPIRED` (so sánh `expiresAt`) — 2 file `index.js` là
ví dụ tham khảo, không phải yêu cầu bắt buộc phải giống hệt logic ngẫu nhiên
20% này.

## 4. Contract đầy đủ — đọc trước khi code Game thật

File này chỉ là ví dụ chạy được, **không phải tài liệu contract chính
thức**. Trước khi code Game thật, đọc:

- `docs/api/interface-contract-v1.0-FROZEN.md` — JSON Schema chính thức,
  đã đóng băng, cho `EffectCommand`, `EffectCommand_KillSwitch`, `EffectAck`.
  Đối chiếu 100% với code backend thật, không phải tài liệu lý thuyết.
- `docs/api/game-integration-guide.md` — hướng dẫn tích hợp tổng quan
  (cách connect, các lệnh sẽ nhận, mục 6 có ghi chú về Kill Switch/Pause).

## 5. Xác thực token cho `/game` (NFR-SEC-02)

Backend đã có `POST /api/auth/game-token` và middleware JWT trên `/game`.
Cấu hình `JWT_SECRET`, `GAME_CLIENT_SECRET` và tùy chọn
`GAME_TOKEN_EXPIRES_IN` (mặc định `24h`) trong môi trường backend.

1. Gọi `POST http://localhost:5000/api/auth/game-token` với JSON
   `{ "clientSecret": "<GAME_CLIENT_SECRET của backend>" }`.
2. Lấy trường `token` trong response và chạy:

```bash
GAME_TOKEN='<token>' node index.js http://localhost:5000
```

PowerShell:

```powershell
$env:GAME_TOKEN = '<token>'
node index.js http://localhost:5000
```

Mock gửi `auth: { token: GAME_TOKEN }` tại handshake. Backend từ chối
`MISSING_TOKEN`, `INVALID_OR_EXPIRED_TOKEN`, hoặc `WRONG_ROLE` (token
Operator không dùng cho Game). Khi token hết hạn, lấy token mới trước khi
kết nối lại; mock chưa tự động cấp/refresh token. Middleware kiểm tra tại
handshake, chưa tự ngắt socket đang mở khi token hết hạn.
Không commit token hoặc client secret. Contract: `docs/api/game-token-spec.md`.

## 6. Việc KHÔNG nằm trong phạm vi mock này

- Không giả lập độ trễ mạng thật (LAN/internet) — chạy trên cùng máy với
  backend sẽ cho độ trễ thấp hơn thực tế đáng kể (xem kết quả benchmark
  NFR-PERF-01: p95 ≈ 305ms đo trên localhost).
- Không giả lập nhiều Game Client đồng thời — 1 process = 1 kết nối.
- Không tự động reconnect có backoff — nếu mất kết nối, dùng lại tham số
  mặc định reconnect của `socket.io-client` (thường tự nối lại được nếu
  backend còn sống, nhưng chưa test kỹ backoff pattern trong bộ này).
