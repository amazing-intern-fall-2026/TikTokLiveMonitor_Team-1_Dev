# Câu hỏi chốt với Dev Game — TikTok LIVE Monitor

**Người gửi:** Huy Hào (đại diện team Ingestion/Backend — Monitor)
**Ngày:** 11/09/2026
**Mục đích:** 3 câu hỏi dưới đây đang **block** việc thiết kế Rule Engine
và `EffectCommand` contract (mục 6 SRS) — cần Dev Game xác nhận sớm để
team có thể tiếp tục vẽ ERD phần Rule Engine (Nguyễn Thiên Tài) và hoàn
thiện contract cuối cùng.

---

## Câu hỏi 1 (OQ-01) — Danh mục `effectCode` & tham số

Danh mục `effectCode` cụ thể mà game hỗ trợ gồm những gì? Với mỗi
effect, các tham số đi kèm là gì (ví dụ: `magnitude` — độ mạnh,
`duration` — thời lượng hiệu lực, hoặc tham số khác nếu có)?

*Vì sao cần:* Đây là input trực tiếp để định nghĩa `EffectCommand`
contract (mục 6.4 SRS) — team Backend/Rule Engine cần biết trước cấu
trúc payload lệnh hiệu ứng để implement, và team FE (Ngô Đức Tài) cần
để thiết kế màn quản lý Rule (FR-21, FR-22).

## Câu hỏi 2 (OQ-02) — Đối tượng nhận effect

Game hiện có bao nhiêu nhân vật? Khi một effect được trigger, nó áp
dụng cho:
- (a) tất cả nhân vật cùng lúc,
- (b) một nhân vật được chọn ngẫu nhiên, hay
- (c) một nhân vật được khán giả/operator chỉ định?

*Vì sao cần:* Quyết định cấu trúc field `effect.target` trong
`EffectCommand`, ảnh hưởng trực tiếp đến logic Rule Engine (map
event → effect → target).

## Câu hỏi 3 (OQ-04) — Nền tảng game & giao thức tích hợp

Game chạy trên nền tảng nào — web, Unity desktop, hay mobile? Câu trả
lời sẽ quyết định giao thức tích hợp giữa Backend và Game (Socket.io
hiện tại có phù hợp trực tiếp không, hay cần thêm lớp trung gian).

*Vì sao cần:* Ảnh hưởng đến mục 6.4 (contract `EffectCommand`) và
NFR-PERF-01 (yêu cầu độ trễ) — cần biết trước khi chốt giao thức
broadcast cuối cùng.

---

## Deadline mong muốn

Team rất mong nhận phản hồi trước **T6 (13/09)** để kịp tổng hợp vào
bản SRS v1.1 và không làm chậm tiến độ vẽ ERD Rule Engine (đang chờ ở
task của Nguyễn Thiên Tài, dự kiến hoàn thành T6).

Nếu một số câu chưa chốt được ngay, xin cho biết mốc thời gian dự kiến
để team chủ động sắp xếp lại kế hoạch.