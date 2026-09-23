# Kiểm thử công cụ mới — 18/09/2026

## Backend

Bộ kiểm thử hiện hành gồm 22 bài (tính cả bài tổng), dùng DB riêng, không sửa dữ liệu thật:

- Quyền Requestor/Admin, nhật ký, email-only login, dữ liệu Excel và chống trùng mã PO.
- Format PO dùng tên Phòng Ban/địa điểm, ngày Việt Nam và hậu tố 001/002/003.
- Requestor đề nghị kho; kho pending bị ẩn; chỉ Admin được duyệt; chặn duyệt hai lần và yêu cầu trùng.
- Chọn Phòng Ban tự lấy kho; chặn giả mạo kho và phòng ban không hoạt động.
- Tạo nhanh sản phẩm, nhà cung cấp và giá trong một transaction; lỗi VAT không để lại bản ghi dở.
- So sánh tổng gồm VAT, vô hiệu hóa giá hết hiệu lực; API báo giá chỉ cho Admin.
- Admin có thể chọn giá cao hơn vì nhu cầu; đúng NCC/giá được chốt vào PO; không sửa sau phát hành.
- Giữ luồng thông báo không phê duyệt, retry email an toàn và migration đơn cũ.

## Chrome

Script kiểm tra: `.tools/browser-check/procurement.mjs`.

- Requestor gửi yêu cầu tạo kho và tạo đơn chỉ chọn Phòng Ban.
- Admin bấm các ô Tổng quan, lọc trạng thái/mã, thấy đơn chờ giá nổi bật.
- Tìm sản phẩm không dấu, tạo NCC và báo giá ngay trong modal, tích chọn giá, áp dụng và phát hành PO.
- Hoàn tất đơn: biến mất khỏi Yêu cầu gần đây, xuất hiện ở danh mục hoàn tất.
- Duyệt kho, xem địa điểm mới ACTIVE, chỉnh danh mục và bảng giá.
- Kiểm tra đúng thứ tự chín cột bảng giá và dropdown NCC ở form sửa.
- Tạo sản phẩm hoàn toàn mới, giá mới và áp dụng ngay trong đơn.
- Mobile 390px không tràn ngang toàn trang; không có lỗi JavaScript/console.

Ảnh minh họa tại `docs/screenshots-tools` là dữ liệu giả lập. Email dùng transport giả lập; không khẳng định đã gửi/nhận email thật.

## Sửa lỗi đối chiếu và báo giá

- Cuộn/cuộn, khoảng trắng và Unicode tương đương được nhận đúng; vẫn chặn Cuộn/Thùng.
- Báo giá thiếu NCC có thể tìm/chọn NCC ngay ở cửa sổ bổ sung. Cập nhật đúng giá cũ, không tạo bản ghi trùng.
- VAT chưa nhập không hiển thị tổng gồm VAT. Hiển thị lý do thiếu thông tin riêng từng báo giá.
- Kiểm thử Chrome đã tái hiện giá thiếu NCC/VAT/ngày hiệu lực và lưu sửa thành công.
