> **Quy trình hiện hành:** Line Manager chỉ nhận email thông báo khi Requestor chọn gửi, không có chức năng phê duyệt. Requestor được thêm email ngăn cách bằng dấu `;`. Đơn chuyển thẳng đến Admin. Các mô tả duyệt Line Manager bên dưới thuộc phiên bản trước; xem README.md để thao tác hiện tại.

# Phạm vi phiên bản 2 và nghiệm thu

## Yêu cầu bổ sung và kết quả

| Yêu cầu | Triển khai |
|---|---|
| Requestor @cj.net tự truy cập | Microsoft Entra code flow + PKCE; xác minh tenant và Graph identity; tự tạo tài khoản, không cần Admin duyệt đăng ký |
| Chỉ xem đơn đúng email | Session lấy user ID từ DB, kiểm tra ownership ở API; sửa ID không vượt quyền |
| Admin chính được chỉ định | Đã khởi tạo uyenthu.cu@cj.net bằng mật khẩu yêu cầu, scrypt hash; không công khai password trong frontend |
| Mã đơn theo kho/ngày | PO - KHO - DD.MM.YYYY - 001; sequence kho/ngày Việt Nam trong transaction; số không tái sử dụng |
| Tuyến quản lý từ WH List | manager_email snapshot khi gửi; trạng thái PENDING_APPROVAL; chỉ manager đúng email quyết định; không tự duyệt |
| Gửi đề xuất từ Requestor | Outbox gửi Graph từ mailbox Requestor đến manager + các Admin active, nội dung không có giá |
| Admin xác nhận và xuất FORM PO | Chặn thiếu dữ liệu; dùng workbook thật, thêm dòng trên 5, giữ merge/border/formula, chốt giá |
| Gửi PO trực tiếp vendor | Xác nhận tạo PO đồng thời tạo sự kiện email từ Admin xác nhận; một vendor một file/recipient |
| Cấp đồng Admin | Thêm email @cj.net; đủ quyền quản trị, xử lý, giá, PO, quyền tài khoản; thu hồi áp dụng ngay |
| Admin không tạo đơn | Bỏ điều hướng/CTA/form; API preview/create/submit cũng từ chối Admin |
| Giao diện CJ | Dùng 4 asset thật đã cung cấp; tên/slogan yêu cầu; thiết kế responsive và nền mờ |
| Hướng dẫn từ đầu | README mới, hướng dẫn riêng cho IT Microsoft 365, bản mapping Excel và kịch bản UAT |

## Giải thích các quyết định

- Việc chỉ nhập email mà không xác minh cho phép bất kỳ ai mạo danh email khác. SSO vẫn cho mọi nhân viên @cj.net tự truy cập, đồng thời bảo đảm danh tính sở hữu đơn.
- Số thứ tự 001 và mã vendor ở filename là phần mở rộng cần thiết để không trùng kho/ngày hoặc hai PO vendor trong một đơn.
- Năm dùng YYYY. Ngày mã là ngày cấp lúc lưu đơn đầu tiên; ngày phát hành PO được điền riêng tại B5.
- Admin chính được bảo vệ khỏi bị thu hồi, các Admin khác không có hạn chế chức năng so với nhau.
- Quản lý là trách nhiệm theo đơn, không tự trở thành Admin. API phê duyệt riêng không có giá, kể cả khi người được chỉ định đồng thời là Admin.
- Dữ liệu thiếu email/VAT/ngày hiệu lực không được suy đoán. Cần Admin xác nhận bằng dữ liệu thật.
- Tên nguồn “VPP Anh Phước” được đối chiếu Alias “Anh Phước” sau khi bỏ tiền tố nghiệp vụ VPP; không dùng fuzzy để âm thầm gán vendor khác.

## Luồng mới

```text
DRAFT → PENDING_APPROVAL → SUBMITTED → PROCESSING → PRICE_COMPLETED
             │                            │                │
             └→ REJECTED                  └→ WAITING_FOR_PRICE
                                                           │
                                                           ▼
                                                       PO_CREATED
                                                           │
                                  Microsoft nhận đủ email vendor
                                                           ▼
                                                  SENT_TO_SUPPLIER
                                                           │
                                                           ▼
                                                       COMPLETED
```

Admin được hủy trước phát hành PO, giữ lịch sử. Sau PO_CREATED không sửa mặt hàng/giao nhận/giá chốt/file. Quy trình amendment sau phát hành chưa thuộc luồng hiện tại.

## Dữ liệu và migration

- Sao lưu DB nhất quán bằng VACUUM INTO trước nâng cấp.
- Giữ nguyên 6 đơn hiện có, các file và audit cũ.
- Không đổi số đơn lịch sử, không gán đơn người cũ sang email mới.
- Vô hiệu tài khoản demo @cj.local, ngừng dùng master demo v1.
- Nạp 16 kho, 11 vendor, 374 sản phẩm và 375 dòng giá chờ xác nhận từ file nguồn.
- Chỉ nạp file nguồn một lần qua marker company_data_v2, tránh restart ghi đè thay đổi Admin.
- Bổ sung account_flags, order_sequences, approvals và outbox; các khóa/FK và dữ liệu cũ được giữ.

## Nghiệm thu vận hành với công ty

1. IT điền cấu hình thật và consent/giới hạn Mail.Send Application trên đúng mailbox.
2. Dùng 2 Requestor thật, kiểm tra login @cj.net, MFA, ownership, sửa URL và API không lộ giá.
3. Dùng 2 kho, tạo nhiều đơn đồng thời trong cùng ngày; không trùng mã, không gộp kho.
4. Đối chiếu email From Requestor, To Manager + Admin; không có giá.
5. Manager sai email không đọc/duyệt; đúng người duyệt được; Requestor không tự duyệt.
6. Từ chối phải có lý do và không cho Admin bỏ qua để tạo PO.
7. Admin không có công cụ tạo đơn, gọi API trực tiếp cũng bị từ chối.
8. Cấp đồng Admin bằng email, xác minh tất cả quyền; thu hồi ngay trong khi phiên còn mở.
9. Bổ sung VAT/ngày hiệu lực/vendor, đối chiếu alias; chặn thiếu giá/email/người nhận.
10. Mở PO thật bằng Microsoft Excel: thử 1, 5, 6 và nhiều dòng; kiểm tra merge, border, tổng, VAT, print layout và thông tin scope/nhận hàng.
11. Đơn hai vendor sinh hai file; đối chiếu từng file và recipient. Vendor không nhận hàng/giá của vendor khác.
12. Sửa giá master sau phát hành không làm thay đổi PO cũ.
13. Kiểm tra Graph 202 và message trace. Thử 403/timeout, restart giữa lúc gửi; retry không tự gây gửi trùng.
14. Kiểm tra public APP_URL HTTPS dùng được từ máy của người nhận email, không phải localhost.
15. Diễn tập backup/restore và hết hạn client secret.

## Giới hạn kỹ thuật và trạng thái bàn giao

- Entra integration/Mail.Send đã có mã và kiểm thử bằng adapter mô phỏng. Chưa gọi tenant/mailbox thật vì chưa có thông số cấu hình trong môi trường này.
- Nhận HTTP 202 không chứng minh delivered/read. Không có callback message trace trong bản này.
- Không thể bảo đảm exactly-once qua một API ngoài có timeout; UNKNOWN yêu cầu người có quyền kiểm tra Sent Items trước khi retry.
- Chạy một instance với SQLite. Session/OAuth state trong bộ nhớ; restart yêu cầu login lại. Multi-instance cần DB/session/worker dùng chung và cơ chế lease.
- Chưa có amendment/revision của PO đã gửi, approval nhiều cấp, đa tiền tệ, file báo giá upload hoặc đổi/reset mật khẩu trên UI.
- Hiện chỉ VND; mỗi dòng làm tròn cơ sở và VAT về đồng, tổng PO vượt Number safe integer bị chặn. Tài chính cần xác nhận cách làm tròn trước go-live.
- Parser giới hạn file/dòng/cột; hardening upload với worker, chống zip-bomb sâu, antivirus, tải lớn và giám sát cần IT nghiệm thu trước mở rộng.
- Nguồn PO gốc không có giá trị ở các ô scope nâng cao. Department/purpose được điền từ yêu cầu, các trường scope chưa khai báo giữ trống; không tự bịa nội dung.
- Đơn mẫu/lịch sử v1 không có approval snapshot mới. Dùng để đối chiếu lịch sử, không tự bỏ qua tuyến duyệt v2 cho đơn mới.
# Cập nhật yêu cầu đăng nhập

Requestor hiện truy cập chỉ bằng email @cj.net, không cần Entra/Microsoft/mật khẩu. Cùng email (không phân biệt hoa thường) dùng cùng hồ sơ, đơn hàng và nhật ký. Mọi mô tả Requestor bắt buộc SSO trong bản phạm vi ban đầu bên dưới được thay thế bằng quy tắc này. Tài khoản Admin vẫn yêu cầu đăng nhập quản trị; gửi email thật vẫn cần kết nối mail.
