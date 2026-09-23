> TÀI LIỆU LỊCH SỬ PHIÊN BẢN 1. Bản hiện tại là PROCUREMENT SMILE v2; xem README.md và các tài liệu có hậu tố V2.

# Kết quả kiểm thử — 17/09/2026

Môi trường: Windows, Node.js 24.14.0, ExcelJS 4.4.0, Chrome có sẵn trên máy. Kiểm thử dùng DB SQLite riêng trong bộ nhớ, không dùng dữ liệu thật.

## API và nghiệp vụ

Lệnh đã chạy:

```text
node --test --test-isolation=none test/workflow.test.js
```

Kết quả: **7 tests pass, 0 fail** (một bài kiểm thử tổng và sáu nhóm con).

- Đăng nhập, chặn truy cập chưa xác thực, phân quyền Admin, chặn Origin khác.
- Requester không nhận các trường giá, VAT, tổng, báo giá, snapshot, tài liệu PO và lịch sử giá; không truy cập đơn của tài khoản khác.
- Một đơn một kho, giữ dòng thiếu dữ liệu, kiểm tra số lượng, khóa nội dung sau Submit.
- Đọc Excel thật, preview, ghi nhận file gốc, header, lỗi đúng dòng/cột và chặn nhiều kho.
- Matching chính xác, gợi ý cần xác minh, thiếu giá, map sản phẩm và duyệt alias.
- Máy trạng thái, chặn PO khi thiếu dữ liệu, tạo PO theo từng NCC và đúng kho.
- Mở workbook PO bằng ExcelJS để kiểm tra nội dung từng NCC; sửa master không thay đổi tổng/snapshot cũ.
- Mapping cột import, mã trùng, xung đột giữa dòng trong một batch, rollback, nhật ký và batch bị từ chối.

## Trình duyệt thật

Kiểm thử tự động bằng Playwright với Chrome headless đã hoàn tất:

- Đăng nhập Requester, tạo yêu cầu thủ công gồm dòng xanh và dòng đỏ, xem trước, gửi.
- Đăng nhập Admin, tiếp nhận xử lý đơn vừa tạo, tạo sản phẩm mới qua biểu mẫu.
- Mở danh sách cần xử lý, nhập danh mục, báo cáo, nhật ký và hướng dẫn.
- Tải template Excel qua API, chọn file bằng trình duyệt, preview và lưu nháp.
- Màn hình 390px: không tràn chiều ngang toàn trang, mở menu và điều hướng danh sách.
- **Không có lỗi JavaScript hoặc console** trong lần chạy cuối.

Ảnh giao diện được lưu tại:

- [Tổng quan desktop](screenshots/01-dashboard.png)
- [Kiểm tra yêu cầu trước khi gửi](screenshots/02-review.png)
- [Admin xử lý đơn](screenshots/03-admin-order.png)
- [Giao diện di động](screenshots/04-mobile.png)

Script kiểm thử trình duyệt tại `../../.tools/browser-check/check.mjs` sử dụng Chrome của máy hiện tại và dependency Playwright trong `.tools`; không phải dependency để chạy website. Bộ kiểm thử API nằm trong thư mục `test` của dự án và chạy được bằng `npm.cmd test` sau cài Node.

Chưa xác nhận: workbook công ty chưa được cung cấp, SSO, gửi email, deployment nhiều người dùng, khả năng tải lớn và đối chiếu trực quan PO với Microsoft Excel. Kết quả này là kiểm thử kỹ thuật cho UAT, không thay thế nghiệm thu nghiệp vụ của công ty.
