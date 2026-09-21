# RFC — Interface Contract v1.0 (ĐÓNG BĂNG / FROZEN)
**Trạng thái:** 🔒 FROZEN kể từ 17/09/2026
**Phạm vi:** `EffectCommand`, `EffectCommand (CLEAR_ALL_EFFECTS)`, `EffectAck`
**Người ban hành:** Huy Hào | **Nguồn:** SRS mục 6.4, BR-EFF-01→04
**Đối chiếu code:** đã verify 100% khớp `RuleEngine.service.js` (hàm
`fireRule()`, `dispatchNext()`) và `effect.controller.js` (`killSwitch()`)
trên `main`, commit tính đến 17/09/2026.

---

## 1. Vì sao "đóng băng" (chính sách thay đổi)

Kể từ thời điểm này, `EffectCommand` và `EffectAck` là hợp đồng cố định
giữa Backend và Game Client. Quy tắc thay đổi:

| Loại thay đổi | Ví dụ | Được phép? |
|---|---|---|
| **Breaking** | Xoá field bắt buộc, đổi tên field, đổi kiểu dữ liệu, đổi enum values đã công bố | ❌ Cấm trong v1.x — phải bump lên **v2.0**, thông báo Game team trước ≥3 ngày |
| **Non-breaking** | Thêm field optional mới, thêm giá trị enum mới (Game không nhận ra thì bỏ qua an toàn), sửa mô tả/comment | ✅ Cho phép, bump **v1.x** (patch), ghi vào mục "Lịch sử thay đổi" cuối file |
| **Giá trị enum còn treo (`effectCode`, `target`)** | Bổ sung danh mục cụ thể sau khi Dev Game trả lời OQ-01/OQ-02 | ✅ Cho phép — đây là non-breaking vì *shape* của field (`type: string`) không đổi, chỉ *tập giá trị hợp lệ* được làm rõ thêm |

**Không ai được tự ý sửa field trong JSON Schema bên dưới** khi đang code
— mọi thay đổi phải qua Huy Hào ban hành bản mới, kèm thông báo trong
`open-questions-devgame.md` hoặc kênh chat chung nếu ảnh hưởng Game team.

---

## 2. JSON Schema — `game-effect-contract.schema.json`

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://tiktok-live-monitor/schemas/game-effect-contract-v1.json",
  "title": "TikTok LIVE Monitor — Game Effect Interface Contract",
  "version": "1.0.0",
  "status": "FROZEN",
  "frozenAt": "2026-09-17",
  "description": "Hợp đồng dữ liệu ĐÃ ĐÓNG BĂNG giữa Backend (Rule Engine) và Game Client qua namespace Socket.io /game. Nguồn: SRS mục 6.4 (EffectCommand), BR-EFF-01→04.",
  "definitions": {
    "EffectCommand": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "commandId", "sessionId", "ruleId", "effectCode", "polarity",
        "target", "magnitude", "durationMs", "priority",
        "issuedAt", "expiresAt", "trigger"
      ],
      "properties": {
        "commandId": {
          "type": "string", "format": "uuid",
          "description": "UUID v4, sinh mới cho mỗi lệnh. BR-EFF-01: Game Client BẮT BUỘC khử trùng theo field này."
        },
        "sessionId": {
          "type": "string",
          "description": "sessionId dạng chuỗi từ Envelope (không phải sessions.id numeric trong DB — 2 khái niệm khác nhau, xem ghi chú mục 3)."
        },
        "ruleId": {
          "type": ["integer", "null"],
          "description": "ID rule đã trigger. NULL cho lệnh không qua Rule Engine (hiện tại: không có trường hợp nào — kill-switch dùng type CLEAR_ALL_EFFECTS riêng, xem định nghĩa EffectCommand_KillSwitch)."
        },
        "effectCode": {
          "type": "string",
          "description": "Mã hiệu ứng. Danh mục CHÍNH THỨC đang chờ Dev Game xác nhận (OQ-01) — field có mặt và ổn định, chỉ TẬP GIÁ TRỊ chưa chốt."
        },
        "polarity": {
          "type": "string",
          "enum": ["BUFF", "DEBUFF", "NEUTRAL"],
          "description": "Đã FROZEN — 3 giá trị này là closed enum, thêm giá trị mới phải bump version."
        },
        "target": {
          "type": "string",
          "description": "Đối tượng nhận effect. Giá trị CHÍNH THỨC đang chờ Dev Game xác nhận (OQ-02)."
        },
        "magnitude": { "type": "number" },
        "durationMs": { "type": "integer", "minimum": 0 },
        "priority": {
          "type": "integer",
          "description": "Mặc định 0 nếu rule không cấu hình. Backend tự sắp effectQueue giảm dần theo priority trước khi dispatch."
        },
        "issuedAt": { "type": "string", "format": "date-time" },
        "expiresAt": {
          "type": "string", "format": "date-time",
          "description": "issuedAt + 5000ms CỐ ĐỊNH trong code hiện tại (COMMAND_EXPIRY_MS, chưa cấu hình theo rule). Game Client PHẢI so sánh receivedAt với field này (BR-EFF-02)."
        },
        "trigger": {
          "type": "object",
          "additionalProperties": false,
          "required": ["source", "summary"],
          "properties": {
            "source": { "type": "string", "enum": ["COMMENT", "GIFT", "JOIN"] },
            "summary": { "type": "string" },
            "topContributor": {
              "type": "object",
              "properties": {
                "uniqueId": { "type": ["string", "null"] },
                "nickname": { "type": ["string", "null"] }
              }
            }
          }
        }
      }
    },
    "EffectCommand_KillSwitch": {
      "type": "object",
      "additionalProperties": false,
      "required": ["commandId", "type", "issuedAt"],
      "properties": {
        "commandId": { "type": "string", "format": "uuid" },
        "type": { "const": "CLEAR_ALL_EFFECTS" },
        "issuedAt": { "type": "string", "format": "date-time" }
      },
      "description": "FR-33/BR-EFF-04. Phát trên cùng event EFFECT_COMMAND hay kênh riêng? → Backend hiện dùng event Socket.io riêng tên 'CLEAR_ALL_EFFECTS', không phải 'EFFECT_COMMAND' — Game Client phải lắng nghe CẢ HAI event name."
    },
    "EffectAck": {
      "type": "object",
      "additionalProperties": false,
      "required": ["commandId", "status"],
      "properties": {
        "commandId": { "type": "string", "format": "uuid" },
        "status": {
          "type": "string",
          "enum": ["APPLIED", "REJECTED", "EXPIRED"],
          "description": "Đã FROZEN — closed enum."
        },
        "reason": { "type": ["string", "null"] }
      }
    }
  }
}
```

---

## 3. Ghi chú triển khai quan trọng (không phải schema, nhưng bắt buộc đọc)

1. **`sessionId` (string) ≠ `sessions.id` (số nguyên trong Postgres).**
   `sessionId` trong mọi payload gửi cho Game/Monitor là chuỗi sinh từ
   `envelope.js` (`session_<timestamp>`). `dbSessionId` (numeric) chỉ dùng
   nội bộ backend để ghi log, **không bao giờ xuất hiện trong payload gửi
   ra ngoài** (`dispatchNext()` cố tình destructure bỏ field này trước khi
   broadcast). Game Client không cần và không nên quan tâm đến
   `dbSessionId`.
2. **`ruleId` thực tế hiện tại KHÔNG BAO GIỜ null** — vì FR-30 (kích hoạt
   thủ công tuỳ ý) chưa code, mọi `EFFECT_COMMAND` hiện tại đều xuất phát
   từ 1 rule thật. Field vẫn khai báo nullable để tương thích ngược khi
   FR-30 được code sau này.
3. **`CLEAR_ALL_EFFECTS` là 1 Socket.io event riêng**, không phải 1 giá
   trị đặc biệt gửi qua event `EFFECT_COMMAND`. Game Client phải đăng ký
   lắng nghe **cả 2 event name**: `EFFECT_COMMAND` và `CLEAR_ALL_EFFECTS`
   (xem `docs/api/game-integration-guide.md` mục 2–3 để có code mẫu).
4. **`expiresAt` hiện cố định 5 giây sau `issuedAt`** cho mọi effect,
   không phân biệt theo rule/effectCode. Nếu sau này cần thời hạn khác
   nhau theo từng loại effect, đây là **breaking change tiềm ẩn** (thêm
   field `expiryMs` vào cấu hình rule không breaking, nhưng đổi công thức
   tính `expiresAt` mặc định có thể ảnh hưởng hành vi Game Client đang
   giả định cố định 5s) — cần bàn trước khi đổi.

---

## 4. Lịch sử thay đổi

| Version | Ngày | Thay đổi |
|---|---|---|
| 1.0.0 | 17/09/2026 | Đóng băng lần đầu. Đối chiếu 100% với code thật trên `main`. |