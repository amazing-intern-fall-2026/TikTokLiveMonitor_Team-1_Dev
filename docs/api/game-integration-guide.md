# Game Integration Guide v1.0 — Kết nối Game Client vào `/game`

Tài liệu hướng dẫn team Game Client kết nối vào namespace Socket.io
`/game`, nhận lệnh hiệu ứng (`EFFECT_COMMAND` / `CLEAR_ALL_EFFECTS`), và
trả `EFFECT_ACK` đúng chuẩn (BR-EFF-03). Có sẵn implementation mẫu chạy
được ngay tại `backend/mock-game-client.js` — mọi ví dụ dưới đây đã được
test thật với implementation mẫu đó, không phải code lý thuyết.

> **Vì sao có namespace riêng `/game`:** Backend tách `/monitor` (feed +
> telemetry cho Web Dashboard) và `/game` (lệnh hiệu ứng cho Game Client)
> thành 2 namespace Socket.io độc lập — 2 client không thấy traffic của
> nhau. Xem `docs/api/json-contract.md` cho các event trên `/monitor`
> (`CHAT`/`GIFT`/`MEMBER_JOIN`) — tài liệu này chỉ nói về `/game`.

---

## 1. Kết nối

- Giao thức: Socket.io v4 (WebSocket), namespace path `/game`
- Server: `http://<backend-host>:5000/game`
- Không cần xác thực ở v1.0 (chưa có token phiên — xem mục 6)

### JavaScript (Node.js / browser — dùng `socket.io-client`)

```js
const { io } = require('socket.io-client');
const socket = io('http://localhost:5000/game', { transports: ['websocket'] });

socket.on('connect', () => {
  console.log('Connected to /game as', socket.id);
});
```

### C# (.NET — dùng thư viện `SocketIOClient`)

Cài package: `dotnet add package SocketIOClient`

```csharp
using SocketIOClient;

var socket = new SocketIOClient.SocketIO("http://localhost:5000/game");

socket.OnConnected += (sender, e) =>
{
    Console.WriteLine($"Connected to /game as {socket.Id}");
};

await socket.ConnectAsync();
```

Implementation mẫu đầy đủ, đã chạy thật với backend (không phải code lý
thuyết): `backend/mock-game-client.js`.

---

## 2. Nhận lệnh hiệu ứng — event `EFFECT_COMMAND`

Backend phát event này khi Rule Engine xác định đủ ngưỡng kích hoạt
(SRS mục 6.4). Tối đa **3 lệnh/giây** được phát sang `/game` (FR-29,
throttle chống nghẽn — xem `backend/src/services/RuleEngine.service.js`).

```json
{
  "commandId": "275cee07-56b1-4c21-9fee-80b90cf6eb9e",
  "sessionId": "session_1789574363464",
  "ruleId": 1,
  "effectCode": "HEAL_HP",
  "polarity": "BUFF",
  "target": "ALL_CHARACTERS",
  "magnitude": 1.2,
  "durationMs": 8000,
  "priority": 5,
  "issuedAt": "2026-09-16T15:59:48.011Z",
  "expiresAt": "2026-09-16T15:59:53.011Z",
  "trigger": {
    "source": "COMMENT",
    "summary": "Rule \"Bao comment - HEAL\" threshold reached",
    "topContributor": { "uniqueId": "d3", "nickname": "Test User" }
  }
}
```

| Field | Type | Mô tả |
|---|---|---|
| `commandId` | string (UUID) | Định danh duy nhất — **dùng để khử trùng** (BR-EFF-01): nhận lại cùng `commandId` thì bỏ qua |
| `sessionId` | string | Phiên giám sát đang tạo ra lệnh này |
| `ruleId` | number \| null | ID rule đã kích hoạt (`null` nếu lệnh phát thủ công, vd. kill switch — xem mục 3) |
| `effectCode` | string | Mã hiệu ứng — **danh mục do team Game định nghĩa, cần xác nhận trước** (xem `docs/api/open-questions-devgame.md`, OQ-01). v1.0 hiện dùng tạm các mã ví dụ trong SRS mục 6.3 (`HEAL_HP`, `SLOW_DOWN`, `POWER_UP`, `SHIELD`, …) |
| `polarity` | string enum | `BUFF` \| `DEBUFF` \| `NEUTRAL` |
| `target` | string enum | `ALL_CHARACTERS` \| `RANDOM_ONE` \| `LEADING_CHARACTER` \| `LAST_CHARACTER` \| `SPECIFIC` |
| `magnitude` | number | Độ mạnh hiệu ứng (vd. hệ số nhân tốc độ/máu) |
| `durationMs` | number | Thời lượng hiệu ứng nên áp dụng trên nhân vật |
| `priority` | number | Ưu tiên xử lý nếu Game tự có hàng đợi riêng (backend đã tự sắp theo priority trước khi gửi) |
| `issuedAt` | string (ISO 8601) | Thời điểm backend phát lệnh |
| `expiresAt` | string (ISO 8601) | **Xem mục 4 — bắt buộc kiểm tra trước khi áp hiệu ứng** |
| `trigger` | object | Ngữ cảnh kích hoạt — `source` (COMMENT/GIFT/JOIN), `summary` (mô tả người), `topContributor` (ai là người tạo ra sự kiện cuối cùng khớp ngưỡng) |

---

## 3. Lệnh khẩn cấp — event `CLEAR_ALL_EFFECTS`

Phát khi Operator bấm nút "Dừng khẩn cấp" (`POST /api/effects/kill-switch`
— FR-33, BR-EFF-04). Game phải **hủy toàn bộ hiệu ứng đang chạy ngay lập
tức** và trả nhân vật về trạng thái cơ bản.

```json
{
  "commandId": "cd6d06e4-eb6b-4abe-a5fe-9c73167357f4",
  "type": "CLEAR_ALL_EFFECTS",
  "issuedAt": "2026-09-16T15:51:16.855Z"
}
```

Không có `ruleId`/`effect`-related fields vì đây là lệnh thủ công, không
gắn với rule nào (xem bảng `effect_commands.rule_id` — cột này nullable
đúng cho trường hợp này). **Đo thật (AC-08):** thời điểm mock game client
nhận được lệnh trùng khít với `issuedAt` (chênh lệch dưới 1 mili-giây) —
tốc độ phát lệnh khẩn cấp không phải điểm nghẽn.

> **Giới hạn hiện tại, team Game cần biết:** AC-08 đầy đủ còn yêu cầu
> "không effect mới nào được phát cho tới khi Operator bật lại" — cơ chế
> tạm dừng (pause state) này **chưa được xây ở backend**. Sau khi
> `CLEAR_ALL_EFFECTS` được phát, nếu Rule Engine tiếp tục tích đủ ngưỡng
> một rule khác, lệnh `EFFECT_COMMAND` mới vẫn sẽ được gửi bình thường.
> Đây là việc còn tồn đọng (thuộc FR-32), không phải bug.

---

## 4. Xử lý lệnh trễ — `expiresAt` (BR-EFF-02)

**Quy tắc:** nếu thời điểm Game Client **nhận được** lệnh đã trễ hơn
`expiresAt`, Game phải **bỏ qua, không áp hiệu ứng** — tránh hiệu ứng
"trễ" xuất hiện đột ngột gây khó hiểu cho khán giả đang xem trực tiếp.

Backend đã tự lọc phần lớn trường hợp này trước khi gửi (một lệnh nằm
trong hàng đợi quá lâu do throttle 3/giây sẽ bị bỏ, đánh dấu `EXPIRED`,
không bao giờ rời khỏi backend — xem `dispatchNext()` trong
`RuleEngine.service.js`). Nhưng **độ trễ mạng giữa lúc backend gửi và
lúc Game thực sự nhận được** nằm ngoài khả năng kiểm soát của backend —
nên Game Client **vẫn phải tự kiểm tra lại** `expiresAt` khi nhận, đúng
theo BR-EFF-02, không được tin tưởng tuyệt đối rằng backend đã lọc hết.

### JavaScript

```js
socket.on('EFFECT_COMMAND', handleCommand);
socket.on('CLEAR_ALL_EFFECTS', handleCommand);

function handleCommand(command) {
  const receivedAt = new Date();
  const isExpired = command.expiresAt && receivedAt.getTime() > new Date(command.expiresAt).getTime();

  if (isExpired) {
    // Không áp effect. Vẫn phải ack lại để Monitor biết là bị bỏ qua.
    socket.emit('EFFECT_ACK', {
      commandId: command.commandId,
      status: 'EXPIRED',
      reason: 'expiresAt already passed on arrival',
    });
    return;
  }

  applyEffectToCharacter(command); // logic riêng của Game
  socket.emit('EFFECT_ACK', { commandId: command.commandId, status: 'APPLIED' });
}
```

Đoạn trên đã test thật qua `backend/mock-game-client.js` — bắn sự kiện
mock từ nút "MOCK DEV TOOLS" trên dashboard, quan sát: lệnh vẫn còn hạn
→ ack `APPLIED`; dựng thử timestamp `expiresAt` đã qua → đúng nhánh ack
`EXPIRED` (test logic 3 trường hợp biên: còn hạn / đã trễ / đúng thời
điểm hết hạn).

### C#

```csharp
public class EffectCommand
{
    public string CommandId { get; set; }
    public string ExpiresAt { get; set; }
    // ... các field khác giữ nguyên tên như JSON (dùng JsonPropertyName nếu cần map camelCase)
}

socket.On("EFFECT_COMMAND", response => HandleCommand(response.GetValue<EffectCommand>()));
socket.On("CLEAR_ALL_EFFECTS", response => HandleCommand(response.GetValue<EffectCommand>()));

async void HandleCommand(EffectCommand command)
{
    var receivedAt = DateTime.UtcNow;
    var isExpired = !string.IsNullOrEmpty(command.ExpiresAt)
        && receivedAt > DateTime.Parse(command.ExpiresAt).ToUniversalTime();

    if (isExpired)
    {
        // Không áp effect. Vẫn phải ack lại để Monitor biết là bị bỏ qua.
        await socket.EmitAsync("EFFECT_ACK", new
        {
            commandId = command.CommandId,
            status = "EXPIRED",
            reason = "expiresAt already passed on arrival"
        });
        return;
    }

    ApplyEffectToCharacter(command); // logic riêng của Game
    await socket.EmitAsync("EFFECT_ACK", new { commandId = command.CommandId, status = "APPLIED" });
}
```

*(Lưu ý: đoạn C# này chưa được test thật với backend như bản JavaScript
— team Game nên tự verify khi tích hợp thật, khác với cam kết "đã test
thật" của bản JS.)*

---

## 5. Trả kết quả — event `EFFECT_ACK` (BR-EFF-03)

Sau **mọi** `EFFECT_COMMAND`/`CLEAR_ALL_EFFECTS` nhận được (kể cả khi bỏ
qua vì hết hạn), Game Client emit ngược lại backend:

```json
{ "commandId": "275cee07-...", "status": "APPLIED" }
```

| Field | Type | Bắt buộc | Mô tả |
|---|---|---|---|
| `commandId` | string | Có | Phải trùng khớp `commandId` của lệnh đang ack |
| `status` | string enum | Có | `APPLIED` \| `REJECTED` \| `EXPIRED` |
| `reason` | string | Không | Lý do, nên có khi `status !== 'APPLIED'` |

Backend nhận qua `socket.handler.js` (namespace `/game`), tra ngược đúng
dòng `effect_commands` bằng `commandId`, ghi log vào bảng `effect_acks`
để Monitor hiển thị hiệu ứng đã áp thành công hay chưa. Đã test thật cả
2 trường hợp: ack cho `EFFECT_COMMAND` do Rule Engine tự fire (`rule_id`
được ghi) và ack cho `CLEAR_ALL_EFFECTS` do Operator bấm thủ công
(`rule_id` là `NULL`).

---

## 6. Việc còn mở (cần chốt thêm)

- [ ] Danh mục `effectCode` chính thức + tham số mỗi effect (magnitude/duration hợp lệ) — chờ Dev Game xác nhận (OQ-01, `open-questions-devgame.md`)
- [ ] Cơ chế tạm dừng effect sau `CLEAR_ALL_EFFECTS` (FR-32) — hiện chưa chặn effect mới phát sinh sau khi kill switch
- [ ] Token phiên cho kênh `/game` (NFR-SEC-02) — hiện chưa yêu cầu xác thực khi connect
- [ ] Ví dụ C# đã bổ sung (16/09) nhưng CHƯA test thật với backend như bản JavaScript — cần Game team tự verify khi tích hợp, hoặc team Backend test lại bằng 1 client C# mẫu trước khi coi là "đã kiểm chứng"