# Rà soát CSV — NFR-SEC-04

Ngày: 01/10/2026. Phạm vi: `GET /api/sessions/:sessionId/export?format=csv`.

## Kết quả và giải pháp

Truy vấn `topGifters`/`topCommenters` hiện không SELECT userId, nhưng SELECT
username/nickname và đưa nguyên dữ liệu đó vào JSONB `top_contributors`.
CSV trước thay đổi serialize JSONB trực tiếp: vẫn lộ định danh trực tiếp,
và có thể lộ userId nếu báo cáo cũ hoặc schema tương lai bổ sung trường đó.

Bản sửa dùng danh sách trường cho phép tại thời điểm xuất CSV:

| Dữ liệu | CSV sau sửa |
| --- | --- |
| userId, tiktok_user_id, username, nickname, dữ liệu lồng trong contributor | Không xuất |
| topGifters | rank (thứ hạng trong nhóm), total_diamonds dạng số |
| topCommenters | rank (thứ hạng trong nhóm), comment_count dạng số |
| Tổng hợp phiên, danh sách effect theo schema hiện có, generated_at | Giữ nguyên |

Thứ hạng không phải mã giả danh của một người; không dùng để nối danh tính
qua hai nhóm hoặc hai phiên. Tổng tương tác và thứ hạng vẫn đáp ứng nhu cầu
báo cáo. Chuyển đổi không sửa dữ liệu lưu trong DB. Báo cáo cũ được bảo vệ
ở trường contributor khi tải CSV mới; CSV đã tải trước đó cần xử lý riêng.

## Minh chứng chạy lại

```bash
npm ci --prefix backend
node --test backend/test-final-tasks.js
```

Test đưa userId gốc, tên, handle và định danh lồng vào một báo cáo rồi
kiểm tra tất cả không xuất hiện trong CSV; tổng diamonds/comments và
ISO timestamp vẫn còn. Kiểm tra thêm báo cáo không có contributor.

Khi nghiệm thu thực tế: đóng một phiên LIVE có tương tác; chờ report xuất
hiện trong Lịch sử phiên; tải CSV; parse ô JSON `top_contributors` và đối
chiếu bảng trên với DB. Test fixture không thay thế nghiệm thu Postgres.

## Những phần chưa đủ để đóng toàn bộ NFR-SEC-04

- `appUser.repository.bulkUpsert` vẫn lưu tiktok_user_id gốc; chính sách
  HMAC trong `docs/api/userid-pseudonymization-policy.md` mới là đề xuất.
- Raw event payload, username/nickname trong DB và JSON export/report
  chưa được xử lý bởi thay đổi CSV này.
- Chưa chứng minh job retention tối đa 30 ngày theo yêu cầu dự án.
- Số liệu/thời gian vẫn có khả năng bị liên kết với nguồn khác. Không gọi
  CSV này là bằng chứng ẩn danh tuyệt đối hoặc chứng nhận tuân thủ pháp luật.

Bước tiếp theo: thống nhất giả danh ở tầng ghi DB (giữ map id gốc → id DB
cho event batch), xử lý raw payload + migration dữ liệu cũ, retention cho
các bảng liên quan và backup, rồi nghiệm thu pháp lý NFR-SEC-06.

## Căn cứ pháp lý cần cập nhật

SRS đang viện dẫn NĐ 13/2023. Tại ngày rà soát, nguồn cơ quan nhà nước
nêu NĐ 356/2025 thay thế NĐ 13/2023; cần rà soát SRS và chính sách theo
khung hiện hành trước khi kết luận tuân thủ:
https://dnieza.dongnai.gov.vn/Pages/newsdetail.aspx?CatId=116&NewsId=4786

Nguồn NĐ 13 gốc: https://vanban.chinhphu.vn/?docid=207759&pageid=27160
