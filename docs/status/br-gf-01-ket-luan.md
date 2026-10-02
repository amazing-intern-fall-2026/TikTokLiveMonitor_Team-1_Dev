# Kết luận BR-GF-01 (`repeatEnd` / chốt combo quà) — 02/10/2026

Trả lời AC-W4-08: việc không thấy `repeatEnd: true` là **lỗi code** hay
**giới hạn connector/nền tảng**?

**Trả lời ngắn:** có cả hai. Hai lỗi code đã được sửa (mục 1, mục 4). Phần
còn lại là hành vi của TikTok, không sửa được phía ta (mục 2). Vẫn **thiếu
log LIVE thật** làm bằng chứng (mục 5).

## 1. Lỗi code: quà không combo bị "treo" vĩnh viễn — đã sửa 24/09 (861203d)

Code cũ gán `isStreakFinished = Boolean(repeatEnd)`. TikTok gửi quà không
combo **đúng một event với `repeatEnd = 0`** và không bao giờ gửi event
chốt. Vì vậy các quà này luôn bị coi là "combo đang chạy", và RuleEngine bỏ
qua chúng mãi mãi (`RuleEngine.service.js`: chỉ tính khi
`isStreakFinished !== false`).

Code hiện tại (`liveStream.service.js`):

```js
const isStreakable = Boolean(data.gift?.combo);
const isStreakFinished = !isStreakable || Boolean(data.repeatEnd);
```

Nghĩa là quà không combo được chốt ngay. Quà combo chỉ được chốt khi có
`repeatEnd`.

## 2. Giới hạn nền tảng: combo chỉ chốt sau khi người tặng ngừng bấm

Với quà combo, TikTok gửi nhiều event trung gian (`repeatEnd = 0`,
`repeatCount` tăng dần). Event chốt (`repeatEnd = 1`) chỉ đến **vài giây
sau** khi người tặng ngừng. Connector cũng mô tả hành vi này (README
`tiktok-live-connector`, mục `gift`). Phía ta không rút ngắn được. Hành vi
này đã ghi trong `docs/api/json-contract.md` (mục GIFT) để team Game biết.

Hệ quả cần chấp nhận: nếu kết nối rớt **giữa combo**, event chốt có thể bị
mất. Khi đó combo đó không được tính vào rule hay vào báo cáo. Đây là rủi ro
mạng/nền tảng; xử lý được thì cần đoán chốt theo timeout, việc này ngoài
phạm vi v1.0.

## 3. Lưu ý về trường dữ liệu của connector

README của connector (2.4.4) vẫn dùng ví dụ cũ `data.giftDetails?.giftType === 1`.
Bản 2.4.4 dùng proto v3 (`tiktok-live-proto/v3`). Ở đó **không có
`giftDetails`**; thông tin quà nằm trong `data.gift`, gồm `combo: boolean`
và `type: number`. Code dùng `gift.combo`. Chưa có dữ liệu thật để khẳng
định `combo` luôn khớp với `type === 1`. Vì vậy log debug
`Raw GIFT repeatEnd` nay ghi **cả hai** (`isStreakable` và `giftType`) để
đối chiếu khi chạy LIVE thật.

## 4. Lỗi code mới phát hiện 02/10: `total_gifts` đếm cả tick combo

Mỗi tick combo trung gian cũng được lưu thành một dòng `events` GIFT, với
`gift_payloads.repeat_end = FALSE`. `sumDiamonds` và `topGifters` đã lọc
`repeat_end = TRUE`, nhưng `countEventsByType` thì chưa. Kết quả là combo 3
quà bị đếm thành 3 "quà" trong `total_gifts` (báo cáo phiên, CSV,
`session_analytics_summary`).

Đã sửa trong `sessionReport.repository.js#countEventsByType`. Kiểm trên
Postgres thật với fixture (combo Rose ×3 + 1 Lion): `total_gifts` = 2
(code cũ cho 4), `total_diamonds` = 103.

## 5. Bằng chứng còn thiếu (làm ở N6 — nghiệm thu với LIVE thật)

AC-W4-08 yêu cầu ít nhất 1 log quà đơn `isStreakable: false`. Chưa có, vì
chưa chạy LIVE thật. Cách lấy:

```bash
# backend chạy với LOG_LEVEL=debug, kết nối 1 phòng đang LIVE có người tặng quà
docker compose logs backend | grep "Raw GIFT repeatEnd"
```

Điền vào bảng sau. Cần ít nhất 1 quà không combo và 1 combo (đủ các tick +
event chốt):

| Thời điểm | giftName | isStreakable (combo) | giftType | repeatCount | repeatEnd |
|---|---|---|---|---|---|
| _(chưa có)_ | | | | | |

Kỳ vọng: quà không combo có `isStreakable: false` và `repeatEnd: 0`, chỉ 1
dòng. Quà combo có nhiều dòng `repeatEnd: 0`, rồi 1 dòng `repeatEnd: 1` với
`repeatCount` cuối. Nếu thấy `combo` và `giftType` mâu thuẫn nhau, hoặc quà
không combo mà vẫn có event chốt riêng, thì phải xem lại mục 3 trước khi
demo.

## Trạng thái

| Hạng mục | Trạng thái |
|---|---|
| Xử lý quà không combo | Done (861203d) |
| `total_gifts` không đếm tick combo | Done (02/10) |
| Độ trễ chốt combo | Giới hạn nền tảng, đã ghi trong contract |
| Log LIVE thật làm bằng chứng | **Chưa có**, làm ở N6 |
