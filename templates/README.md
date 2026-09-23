# Workbook công ty — mapping phiên bản 2

Các file ở đây là bản sao file người dùng cung cấp, không phải mẫu UAT tự dựng.

## Ordering template.xlsx → ordering-template.xlsx

Sheet `FORM ORDER`:

| Ô/vùng | Dữ liệu |
|---|---|
| B1 | Nội dung / ghi chú yêu cầu |
| B2 | Phòng ban |
| B3 | Mục đích sử dụng |
| A4/B4 | Nhãn KHO và mã kho: được bổ sung vào hàng trống của mẫu |
| Dòng 5 | Header gốc tiếng Việt |
| Dòng 6 trở đi | STT, NCC, tên hàng, ĐVT, SL, ghi chú |

Mẫu tải về đã xóa mặt hàng ví dụ, ghi mã kho. Cho phép formula ở cột STT của mẫu, từ chối formula các cột nghiệp vụ. Bỏ các dòng đuôi chỉ được định dạng, nhưng báo lỗi dòng trống xen giữa dữ liệu.

## FORM PO.xlsx → po-form.xlsx

Sheet `FORM PO`, dùng workbook gốc qua ExcelJS:

| Ô/vùng | Dữ liệu |
|---|---|
| B4 | Mã PO hệ thống; thay công thức placeholder cũ |
| B5 | Ngày phát hành theo giờ Việt Nam |
| B7:D7 | Supplier |
| B8/D8 | Contact / Phone |
| B9/D9 | Payment / Delivery terms |
| B10:D10 | Tên kho |
| B11:D11 | Địa chỉ giao |
| B14/D14 | Department / Project nếu có |
| B15/D15 | Tóm tắt mặt hàng / Quantity-UOM |
| B16/D16 | Purpose / Cost allocation nếu có |
| B17/D17 | Expected benefit / Usage period nếu có |
| Dòng 19 | Header gốc |
| A20:H24 | 5 dòng gốc: STT, tên, ĐVT, SL, giá, VAT%, Amount, ghi chú |
| Dòng 25 | Total, merge A:F và G:H |
| Dòng 28 | Receiver/phone, vendor email, warranty, ghi chú |
| Dòng 30 | Người yêu cầu / Admin xác nhận |

Nhiều hơn 5 dòng: thêm trước total, dịch merge/footer/ghi chú/chữ ký xuống đúng offset. Amount = ROUND(Qty*Price,0) + ROUND(ROUND(Qty*Price,0)*VAT/100,0), có cached result. Tổng SUM có cached result và yêu cầu Excel recalc khi mở. VND, print area động, A4 landscape, fit 1 page width. Các giá trị scope chưa có giữ trống.

Một order nhiều vendor được lọc trước khi điền workbook; mỗi vendor không có dữ liệu của vendor khác. File lưu BLOB trong DB cùng snapshot, lần tải sau không tính lại từ master.

## WH List.xlsx và Vendor List.xlsx

Nạp một lần lúc nâng cấp. Mã tạo từ tên kho/Alias vendor. `master-import.js` nhận header gốc và gợi ý mapping khi nhập lại; có thể dùng master export có code để cập nhật chắc chắn.

## Items list.xlsx

Nạp một lần: tên/ĐVT → mã sản phẩm chuẩn, giữ đơn giá và supplier gốc. VAT/hiệu lực chưa có nên các giá INACTIVE chờ Admin xác nhận. Nguồn có 375 dòng, 374 sản phẩm chuẩn, 30 dòng chưa xác định được supplier.

Thay file trong thư mục templates không tự nhập lại dữ liệu sau marker migration. Dùng giao diện import/master để cập nhật. Nếu bố cục FORM PO/Ordering thay đổi, cập nhật mapping trong `lib/excel.js` và chạy kiểm thử workbook trước khi áp dụng.
