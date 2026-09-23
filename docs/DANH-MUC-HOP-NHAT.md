# Sản phẩm & đơn giá

Đã gộp hai tab Sản phẩm và Bảng giá thành **Sản phẩm & đơn giá**. Bảng gồm 9 cột: Mã sản phẩm, Mã nhà cung cấp, Tên sản phẩm, Đơn vị tính, Đơn giá, VAT, Hiệu lực từ, Hiệu lực đến, Trạng thái.

Đã nạp 478 dòng từ bản `Items list.xlsx` mới nhất và đánh lại số thứ tự toàn danh sách từ 1 đến 478. Mã đầu: `NCC-NAM-PHAT-1`; mã cuối: `NCC-KHANG-LONG-478`. Các dòng Excel trùng tên vẫn được giữ riêng theo thứ tự khi reset. Dữ liệu danh mục cũ được ngừng sử dụng; đơn và PO lịch sử không bị xóa.

## Thêm và sửa

1. Admin → Danh mục & bảng giá → Sản phẩm & đơn giá → Thêm bản ghi.
2. Chọn nhà cung cấp. Hệ thống lấy mã NCC đã có; không cần nhập mã sản phẩm.
3. Điền tên hàng, đơn vị tính, đơn giá, VAT, thời hạn và trạng thái rồi lưu.
4. Sản phẩm mới được cấp số tiếp theo. Muốn sửa giá, bấm Sửa tại dòng hiện có.

Mỗi mã sản phẩm gắn với một NCC. Muốn đổi NCC, tạo dòng mới. Tab Nhà cung cấp cũng tự cấp mã khi thêm hồ sơ mới.

## Nhập Excel

1. Chọn Nhập dữ liệu Excel → Sản phẩm & đơn giá.
2. Chọn file Item List hoặc file xuất từ danh mục (tối đa 20 MB).
3. Kiểm tra ánh xạ cột. Có thể dùng cột Mã nhà cung cấp hoặc Tên nhà cung cấp; hệ thống tự tìm hồ sơ tương ứng.
4. Kiểm tra bản xem trước và xác nhận nhập. Nếu có lỗi, sửa trước; toàn bộ đợt nhập được giữ nguyên khi không hợp lệ.

Khi cập nhật, nên **xuất danh mục hiện tại và giữ cột Mã sản phẩm**. Điều này phân biệt được các dòng trùng tên. Bỏ trống mã khi thêm mới; nếu không có mã, hệ thống tìm theo NCC, tên và đơn vị. Ngày hỗ trợ ngày Excel, YYYY-MM-DD và DD/MM/YYYY. VAT hỗ trợ 8, 8% hoặc 0.08; ngày kết thúc “đang cung cấp” được hiểu là không giới hạn.

Mã NCC mới chưa có hồ sơ được tạo với tên tạm là chính mã đó, email trống và đánh dấu cần bổ sung. Admin phải hoàn thiện tên/email tại Nhà cung cấp trước khi gửi PO. Không tự suy đoán địa chỉ email.

Bản sao lưu trước reset nằm tại `data/backups/unified-1789992258478/purchase.sqlite`. Báo cáo mã sau reset: [UNIFIED-CATALOG-RESET.json](UNIFIED-CATALOG-RESET.json). Không chạy lại script reset trong các lần cập nhật thông thường; dùng chức năng nhập trên website.
