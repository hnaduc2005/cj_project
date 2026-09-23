> TÀI LIỆU LỊCH SỬ PHIÊN BẢN 1. Bản hiện tại là PROCUREMENT SMILE v2; xem README.md và các tài liệu có hậu tố V2.

# Phạm vi bàn giao và nghiệm thu UAT

## Cách sử dụng tài liệu nguồn

File Word được dùng làm đặc tả sản phẩm, dữ liệu, UX và nghiệp vụ. Những nội dung triển khai, tích hợp Microsoft, thông báo email, workbook chưa được cung cấp là yêu cầu sản phẩm cần cấu hình/đầu vào thật; không phải chỉ thị để tự gửi thông báo, truy cập tài khoản hay xuất bản hệ thống của công ty.

## Đối chiếu tiêu chí MVP

| Tiêu chí | Kết quả và giới hạn |
|---|---|
| AC-01 Một đơn/một kho | Có: kho bắt buộc ở API; đổi kho sau Submit bị từ chối. |
| AC-02 Nhập tay | Có: NCC, tên gốc, ĐVT, số lượng, ghi chú. |
| AC-03 Excel preview | Có với mẫu UAT phẳng; cần mapping khi có Ordering Template thật. |
| AC-04 Đối chiếu master | Có: tên chính xác/chuẩn hóa + NCC + ĐVT + hiệu lực giá, alias được duyệt. |
| AC-05 Xanh/vàng/đỏ | Có: MATCHED, NEED_REVIEW, MISSING_PRODUCT/MISSING_PRICE. Gợi ý gần đúng hiện dựa trên chuỗi chứa nhau. |
| AC-06 Giữ dòng đỏ | Có: dữ liệu thiếu master/giá không ngăn gửi; lỗi tên/ĐVT/số lượng phải sửa. |
| AC-07 Requester không lấy giá | Có: allowlist trường API, kiểm tra role server-side, ownership theo session. |
| AC-08 Admin thấy giá | Có: đơn giá/VAT/thành tiền và tổng; đơn thiếu giá hiển thị tổng từng phần. |
| AC-09 Nhập/cập nhật master | Có: 5 loại danh mục, Excel/CSV, mapping, preview, cập nhật theo code, transaction, export. |
| AC-10 Xử lý thiếu/alias | Có: tạo danh mục rồi map dòng; alias lưu khi được Admin duyệt. |
| AC-11 Snapshot | Có: chốt khi tạo PO, file lưu nguyên bản, giá master mới không thay đổi PO cũ. |
| AC-12 Không gộp kho | Có: mỗi header có 1 warehouse_id; file nhiều kho bị từ chối. |
| AC-13 Theo PO Form thật | Chưa hoàn tất vì workbook chưa được cung cấp. Có PO tạm ghi rõ UAT, tách NCC. |
| AC-14 Audit/import batch | Có: đăng nhập, master trước/sau, import, alias, trạng thái, PO; batch thành công có thống kê. |

## Thiết kế dữ liệu và quyền truy cập

- `users`: tài khoản, role và password hash scrypt.
- `masters`: UUID + kind + code duy nhất theo kind; dữ liệu trường từng loại được xác thực tại server. Quan hệ code sản phẩm/NCC trong bảng giá được kiểm tra tại API; chưa dùng FK vật lý riêng cho từng loại master.
- `orders`: FK tới kho và người tạo, trạng thái, thời gian, thông tin nhận hàng đã sao chép.
- `items`: FK tới đơn, giữ tên gốc, mã chuẩn sau khi resolve, số lượng/ĐVT.
- `snapshots`: một bản chốt bất biến cho mỗi dòng hàng khi tạo PO.
- `documents`: file PO xlsx theo từng supplier của một order, lưu BLOB.
- `attachments`: file yêu cầu gốc khi tạo đơn Excel.
- `audit`, `imports`, `notifications`: nhật ký và thông báo trong ứng dụng.

Các trường mở rộng của master/item/header được lưu JSON trong SQLite để bản MVP gọn, không phải schema quan hệ chuẩn hóa đầy đủ của hệ thống production.

Requester chỉ xem đơn của chính mình, kể cả nếu sửa ID trong URL. Admin có quyền xử lý tất cả đơn trong UAT. Giá không được đưa vào bundle frontend, catalog Requester, API đơn, xuất yêu cầu hay notifications. Tài khoản Admin mẫu là tài khoản riêng để thử nghiệm, không phải ranh giới bảo mật cho một bản triển khai công khai.

Nội dung do người dùng nhập được escape trước khi đưa vào HTML. Cookie HttpOnly/SameSite=Strict, kiểm tra Origin trên request thay đổi dữ liệu, CSP cùng nguồn. Cookie chưa bật Secure vì bản này chỉ chạy HTTP localhost; production phải bật HTTPS và Secure cùng SSO.

Giá VND được tính bằng số JavaScript, làm tròn tiền trước thuế và VAT mỗi dòng về đồng. Giới hạn giá/số lượng ở MVP không thay thế kiểu Decimal chuẩn cho trường hợp tài chính lớn. Production nên chuyển sang Decimal hoặc integer minor units với giới hạn tổng được thỏa thuận.

## Luồng trạng thái

```text
DRAFT -> SUBMITTED -> PROCESSING -> PRICE_COMPLETED -> PO_CREATED
                         |                 |               |
                         v                 v               v
                  WAITING_FOR_PRICE   PROCESSING     SENT_TO_SUPPLIER
                         |                                 |
                         +-> PRICE_COMPLETED               v
                                                       COMPLETED
```

Admin có thể CANCELLED trước PO_CREATED. UI ưu tiên luồng đi tiếp; API có các nhánh quay lại PROCESSING từ WAITING_FOR_PRICE/PRICE_COMPLETED. Đơn phát hành PO không có hard delete/revision tự động.

## Kịch bản nghiệm thu thủ công

1. Tạo một đơn có 1 mặt hàng có giá và 1 mặt hàng chưa có master, gửi được cả hai.
2. Dùng Requester thứ hai thử URL của đơn đầu: bị từ chối.
3. Dùng DevTools Network kiểm tra API Requester: không có unit_price, total, quotation hoặc snapshots.
4. Nhập Excel có hai mã kho: hiện đúng dòng sai; chưa lưu đơn.
5. Nhập Excel số lượng 0, text hoặc công thức: hiện lỗi dòng/cột/cách sửa.
6. Tạo 2 đơn cùng sản phẩm ở 2 kho: luôn giữ 2 mã đơn và 2 bộ thông tin nhận.
7. Admin bổ sung sản phẩm/giá, map dòng gốc, duyệt alias; yêu cầu mới dùng tên đó khớp đúng.
8. Thử tạo PO trước đủ giá: bị chặn.
9. Đơn có 2 NCC: tạo 2 workbook, mỗi workbook chỉ có hàng của đúng NCC và đúng kho.
10. Sửa Price Master sau phát hành: tổng và workbook cũ không đổi.
11. Import hai sản phẩm có cùng tên/ĐVT nhưng khác mã trong cùng batch: rollback toàn bộ.
12. Kiểm tra mobile, tìm kiếm, bộ lọc, phân trang, trạng thái rỗng, thông báo lỗi.
13. Dừng máy chủ, mở lại: dữ liệu vẫn còn; cần đăng nhập lại.
14. Với PO Form thật: kiểm tra merge/print area/border/formula và ký duyệt kết quả trước sử dụng thực.

## Các bước tiếp theo trước production

1. Nhận các workbook chính thức và brand asset; lập mapping và viết kiểm thử bằng workbook đó.
2. Chốt môi trường hosting, Entra tenant, quyền theo phòng ban/kho, quy trình phê duyệt, đơn vị tiền và làm tròn.
3. Tách/migrate dữ liệu sang schema quan hệ chuẩn hóa và DB tập trung phù hợp số người dùng.
4. Kết nối SSO; bỏ tài khoản/password mẫu, thêm session store và quản trị quyền.
5. Chống zip bomb/giới hạn giải nén, worker cho Excel, antivirus nếu nhận file từ nhiều nguồn.
6. HTTPS, cookie Secure, giám sát, backup/restore đã diễn tập, kiểm thử tải và rà soát bảo mật.
7. Hoàn thiện email được ủy quyền, báo giá đính kèm, revision PO và báo cáo lịch sử trạng thái.
8. Chạy UAT với người yêu cầu, mua hàng và quản trị hệ thống trước go-live.
