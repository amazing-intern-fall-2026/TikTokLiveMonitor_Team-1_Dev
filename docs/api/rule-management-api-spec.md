# Đặc tả API quản lý Rule (FR-21, FR-22) — v1.0

**Người soạn:** Huy Hào · **Ngày:** 29/09/2026 · **Bàn giao:** Nguyễn Thiên
Tài (code backend CRUD + hot-reload) và Ngô Đức Tài (nối `RulesPage.jsx`) —
trước 10h Thứ Ba 29/09.

Mục đích: thay hardcode `INITIAL_RULES` trong `RulesPage.jsx` bằng CRUD thật
trên bảng `rules` (đã có sẵn ở `database/schema.sql`), không đổi shape JSONB
`condition`/`effect` hiện tại (RuleEngine đọc thẳng 2 cột này, đổi shape sẽ
gãy toàn bộ rule đã seed).

## 1. Base path & xác thực

`/api/rules` — theo AC-W4-03 (đã có backend), **mọi route dưới đây yêu cầu**
`Authorization: Bearer <jwt_token>` (Operator), trả `401` nếu thiếu/sai như
mọi route quản trị khác.

## 2. Resource shape (request/response dùng chung)

```json
{
  "id": 5,
  "name": "Bao comment - HEAL",
  "eventType": "CHAT",
  "isActive": true,
  "condition": {
    "keywords": ["heal"],
    "matchMode": "ANY"
  },
  "threshold": {
    "metric": "EVENT_COUNT",
    "value": 3,
    "window": { "type": "ROLLING", "seconds": 30 }
  },
  "effect": {
    "effectCode": "HEAL_HP",
    "polarity": "BUFF",
    "target": "ALL_CHARACTERS",
    "magnitude": 1.2,
    "durationMs": 8000,
    "priority": 5,
    "cooldownMs": 10000,
    "maxTriggersPerSession": 5,
    "resetMode": "RESET_ZERO"
  },
  "createdAt": "2026-09-01T10:00:00.000Z",
  "updatedAt": "2026-09-29T08:00:00.000Z"
}
```

Đối chiếu với cột DB: `condition` + `threshold` ở trên gộp lại thành đúng 1
cột JSONB `condition` (`{"condition": {...}, "threshold": {...}}` — xem
`seed.sql`); `effect` ở trên map thẳng vào cột JSONB `effect`. API tách
`condition`/`threshold` ra 2 field riêng ở tầng HTTP cho dễ đọc/validate,
tầng repository gộp lại đúng shape cột khi ghi DB — **không đổi shape cột
JSONB hiện có**, RuleEngine không cần sửa gì để đọc rule mới tạo qua API.

## 3. Endpoints

### `GET /api/rules`
Trả toàn bộ rule (kể cả `isActive: false`), không phân trang (số lượng rule
nhỏ, không cần). Query tuỳ chọn: `?eventType=CHAT|GIFT|JOIN` để lọc.
→ `200`, mảng object theo shape mục 2, sắp theo `id` tăng dần.

### `GET /api/rules/:id`
→ `200` object theo shape mục 2. Không tồn tại hoặc đã xoá mềm
(`deleted_at IS NOT NULL`) → `404 { "message": "Rule not found" }`.

### `POST /api/rules`
Body: object theo shape mục 2, **không có** `id`/`createdAt`/`updatedAt`
(server tự sinh). `isActive` mặc định `true` nếu bỏ trống.
→ `201`, trả object đầy đủ vừa tạo (có `id`).
→ `400` nếu validation lỗi (mục 4).

### `PUT /api/rules/:id`
Body: toàn bộ object theo shape mục 2 (không phải partial — client luôn gửi
đủ, khớp cách `RulesPage.jsx` đang sửa cả form rồi lưu 1 lần).
→ `200`, trả object sau khi cập nhật, `updatedAt` mới.
→ `404` nếu rule không tồn tại; `400` nếu validation lỗi.
→ **Side effect bắt buộc:** RuleEngine phải hot-reload rule này ngay (không
đợi restart) — xem mục 6.

### `PATCH /api/rules/:id/enable`
Body: `{ "isActive": true }` hoặc `{ "isActive": false }` — endpoint riêng
cho việc bật/tắt nhanh 1 rule từ UI (không cần gửi lại cả form).
→ `200`, trả `{ "id": 5, "isActive": false }`.
→ `404` nếu không tồn tại; `400` nếu thiếu/sai kiểu `isActive`.
→ Cũng phải hot-reload như `PUT`.

### `DELETE /api/rules/:id`
Xoá mềm (set `deleted_at = NOW()`, giữ nguyên `rule_counters`/
`effect_commands` đã tham chiếu `rule_id` này — không xoá cứng, tránh vỡ
FK và mất lịch sử báo cáo phiên cũ).
→ `204` không body.
→ `404` nếu không tồn tại hoặc đã xoá trước đó.
→ Hot-reload: gỡ rule khỏi RuleEngine ngay.

## 4. Validation (400 khi vi phạm)

Áp dụng cho `POST` và `PUT` (không áp dụng hết cho `PATCH .../enable`, chỉ
validate `isActive` là boolean).

| Field | Điều kiện | Mã lỗi (`error`) |
|---|---|---|
| `name` | string, 1–255 ký tự, không rỗng sau khi trim | `NAME_REQUIRED` |
| `eventType` | phải thuộc `CHAT`, `GIFT`, `JOIN` | `INVALID_EVENT_TYPE` |
| `condition.matchMode` | nếu có `keywords` thì bắt buộc, thuộc `ANY`/`ALL` | `INVALID_MATCH_MODE` |
| `condition.keywords` | mảng string, chỉ áp dụng khi `eventType=CHAT`; nếu `eventType` khác mà vẫn gửi `keywords` không lỗi (bị RuleEngine bỏ qua) nhưng nên cảnh báo ở response `warnings` | — |
| `threshold.metric` | thuộc `EVENT_COUNT`, `DIAMOND_VALUE`, `UNIQUE_USER_COUNT` | `INVALID_METRIC` |
| `threshold.value` | số, > 0 | `THRESHOLD_VALUE_INVALID` |
| `threshold.window.type` | thuộc `ROLLING`, `SESSION` | `INVALID_WINDOW_TYPE` |
| `threshold.window.seconds` | bắt buộc nếu `window.type=ROLLING`, số nguyên > 0, khuyến nghị ≤ 300 (không chặn cứng, chỉ cảnh báo) | `WINDOW_SECONDS_REQUIRED` |
| `effect.effectCode` | string không rỗng (enum cụ thể do Dev Game cấp, hiện chưa closed-list ở BE — xem `interface-contract-v1.0-FROZEN.md` mục "Giá trị enum còn treo") | `EFFECT_CODE_REQUIRED` |
| `effect.polarity` | phải thuộc `BUFF`, `DEBUFF`, `NEUTRAL` (closed enum, đã FROZEN ở contract) | `INVALID_POLARITY` |
| `effect.magnitude` | số, > 0 | `MAGNITUDE_INVALID` |
| `effect.durationMs` | số nguyên, > 0, ≤ 60000 (chặn rule vô tình khoá buff/debuff quá 1 phút) | `DURATION_OUT_OF_RANGE` |
| `effect.priority` | số nguyên, 1–10 | `PRIORITY_OUT_OF_RANGE` |
| **`effect.cooldownMs`** | số nguyên, ≥ 0. **BR-RULE-01:** nếu `threshold.window.type=ROLLING`, khuyến nghị (không chặn cứng) `cooldownMs ≥ threshold.window.seconds * 1000` — nhỏ hơn window sẽ gây hiện tượng "bắn ngay ở event đầu burst kế tiếp" đã phát hiện khi đo NFR-PERF-01 tuần trước (xem `benchmark-effect-latency.js`, comment giải thích ROLLING window không tự xoá history khi bắn). Vi phạm khuyến nghị này trả `201`/`200` bình thường kèm `warnings: ["COOLDOWN_SHORTER_THAN_WINDOW"]`, không chặn tạo/sửa. | `COOLDOWN_INVALID` (chỉ khi < 0 hoặc không phải số) |
| `effect.maxTriggersPerSession` | optional; nếu có: số nguyên > 0. Không giới hạn (bắn không đếm) nếu bỏ trống | `MAX_TRIGGERS_INVALID` |
| `effect.resetMode` | phải thuộc `RESET_ZERO`, `SUBTRACT_THRESHOLD` | `INVALID_RESET_MODE` |
| `effect.target` | string không rỗng (enum cụ thể chờ Dev Game, tương tự `effectCode`) | `TARGET_REQUIRED` |

**Response lỗi validation (400), gộp mọi field sai trong 1 lần trả** (không
trả lỗi từng field một, để form ở FE hiện hết lỗi cùng lúc):
```json
{
  "message": "Dữ liệu rule không hợp lệ",
  "errors": [
    { "field": "effect.durationMs", "code": "DURATION_OUT_OF_RANGE", "detail": "Phải > 0 và ≤ 60000" },
    { "field": "threshold.value", "code": "THRESHOLD_VALUE_INVALID", "detail": "Phải là số > 0" }
  ]
}
```

## 5. Mã lỗi chung (không riêng validation)

| HTTP | `message` | Khi nào |
|---|---|---|
| 401 | Thiếu/sai token xác thực | Thiếu header hoặc token hết hạn/sai |
| 404 | Rule not found | `:id` không tồn tại hoặc đã xoá mềm |
| 409 | Rule name already exists | Trùng `name` với rule khác còn sống (nếu team quyết định `name` là duy nhất — xem mục 7, câu hỏi mở) |
| 500 | Internal server error | Lỗi không lường trước (ghi log, không lộ chi tiết ra response) |

## 6. Hot-reload cho RuleEngine

`RuleEngine.service.js` hiện chỉ load rule 1 lần lúc khởi động
(`Loaded N active rule(s)` ở log). Cần thêm hàm kiểu
`reloadRule(ruleId)` / `removeRule(ruleId)` được gọi ngay sau khi
`POST`/`PUT`/`PATCH .../enable`/`DELETE` ghi DB thành công — **không** đọc
lại toàn bộ bảng `rules` mỗi lần đổi 1 rule (tốn kém, và có thể đá văng
counter đang chạy dở của các rule khác). Rule đang có `rule_counters`
running dở khi bị `PUT`/tắt: giữ nguyên counter hiện tại, chỉ áp điều kiện/
effect mới cho các event tới sau — không cần reset counter (đổi hành vi này
sau nếu QA phát hiện bất thường).

## 7. Câu hỏi còn mở, cần Tài + Đức Tài xác nhận trước khi code

1. `name` có bắt buộc duy nhất không? Đề xuất: **có** (409 nếu trùng), vì
   UI danh sách rule dựa vào tên để phân biệt, trùng tên gây nhầm khi thao
   tác. Nếu không đồng ý, bỏ luôn mã lỗi 409 ở mục 5.
2. Xoá rule đang có hiệu lực ngay giữa lúc rule đó "đứng ở ngưỡng" (đã tích
   đủ counter, đang chờ điều kiện tiếp theo) — có cần cảnh báo Operator
   trước khi xoá không, hay xoá thẳng? Đề xuất: xoá thẳng, vì đây thao tác
   admin có chủ đích.
3. `effectCode`/`target` hiện là closed-list phía game nhưng backend không
   validate theo whitelist cụ thể (chỉ check non-empty string) — có nên
   thêm whitelist cứng ở backend khi Dev Game trả lời xong OQ-01/OQ-02
   không, hay để tự do cho linh hoạt thêm effect mới không cần sửa code?
