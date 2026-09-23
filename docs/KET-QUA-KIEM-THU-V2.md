> **Quy trình hiện hành:** Line Manager chỉ nhận email thông báo khi Requestor chọn gửi, không có chức năng phê duyệt. Requestor được thêm email ngăn cách bằng dấu `;`. Đơn chuyển thẳng đến Admin. Các mô tả duyệt Line Manager bên dưới thuộc phiên bản trước; xem README.md để thao tác hiện tại.

# Kết quả kiểm thử PROCUREMENT SMILE v2 — 17/09/2026

Môi trường: Windows, Node.js 24.14.0, SQLite, ExcelJS 4.4.0, Microsoft MSAL Node, Chrome headless qua Playwright.

## Cập nhật đăng nhập chỉ bằng email

Theo yêu cầu mới, Requestor nhập email @cj.net và truy cập ngay, không xác minh Microsoft. Bộ kiểm thử hiện tại gồm **13 tests, 0 fail**: `node --test --test-isolation=none test/email-login.test.js test/mail.test.js test/procurement-v2.test.js`.

Đã kiểm tra chuẩn hóa email, đăng nhập lại dùng cùng hồ sơ/đơn hàng, nhật ký theo tài khoản, chặn domain khác, chặn truy cập đơn email khác, chặn tài khoản bị khóa và ngăn phiên email nhận quyền Admin sau khi được cấp quyền. Chrome đã chạy thành công toàn bộ quy trình bằng đăng nhập email khi Microsoft chưa cấu hình; không có lỗi JavaScript. Các kiểm thử Microsoft bên dưới chỉ áp dụng cho luồng Microsoft tùy chọn của Admin.

## Backend/API

Lệnh `node --test --test-isolation=none test/mail.test.js test/procurement-v2.test.js` đã đạt **12 tests, 0 fail** (một bài tổng, mười nhóm nghiệp vụ và một bài kiểm tra Graph transport):

1. Microsoft provider contract, PKCE/state, kiểm tra domain, chống giả email, phân quyền và CSRF Origin.
2. Nạp file thật một lần: đúng số lượng, không bịa email/VAT.
3. Sequence kho/ngày, Việt Nam qua ranh giới ngày UTC, nhiều request tạo đơn đồng thời, Admin bị chặn tạo đơn.
4. Ordering Template thật, STT formula, file mẫu tải về, lỗi dòng/cột, không gộp kho.
5. Submit/approval, đúng sender/recipients, manager xem dữ liệu an toàn, không duyệt sai người, không duyệt hai lần.
6. FORM PO thật: thêm dòng, merge/footer, border, công thức tổng/VAT và cached value; tách vendor; snapshot bất biến; khóa dữ liệu sau PO.
7. Thiếu manager, sửa tuyến, ghi nhận dòng thiếu sản phẩm, từ chối và chặn bỏ qua phê duyệt.
8. Cấp đồng Admin đủ quyền, thu hồi áp dụng vào session đang mở, giữ Admin chính, chặn Admin tạo đơn.
9. Email UNKNOWN không tự gửi lại, retry cần xác nhận, event key không tạo email trùng, audit.
10. Import atomic, phát hiện xung đột giữa các dòng trước khi commit và giữ lỗi đúng số dòng.

Graph transport được kiểm tra với HTTP giả lập: gửi bằng object ID đã xác minh, đúng người nhận, lưu Sent Items, xử lý 202/403/503 và timeout. Test email/identity dùng adapter inject trong bộ nhớ; không có endpoint bypass Microsoft trong server production. Không gửi tới hộp thư thật.

## Trình duyệt

Script `.tools/browser-check/v2.mjs` đã hoàn tất:

- Đăng nhập Requestor qua provider giả lập cùng luồng state/cookie/callback.
- Tạo mặt hàng, preview, gửi yêu cầu.
- Đổi tài khoản Line Manager, đọc và phê duyệt.
- Admin chính đăng nhập mật khẩu; không có link tạo đơn.
- Admin tiếp nhận, xác nhận đủ dữ liệu, tạo FORM PO và gọi mail transport giả lập đúng vendor.
- Cấp đồng Admin từ giao diện.
- Mở tất cả trang danh mục/import/email/setup/báo cáo/nhật ký/hướng dẫn.
- Màn hình 390px không tràn chiều ngang toàn trang; menu mobile và điều hướng hoạt động.
- Không có lỗi JavaScript hoặc console ở lần chạy cuối.

Ảnh:

- [Đăng nhập](screenshots-v2/01-login.png)
- [Dashboard Requestor](screenshots-v2/02-requestor-dashboard.png)
- [Review yêu cầu](screenshots-v2/03-request-review.png)
- [Line Manager phê duyệt](screenshots-v2/04-manager-approval.png)
- [Dashboard Admin](screenshots-v2/05-admin-dashboard.png)
- [PO và email](screenshots-v2/06-po-email.png)
- [Phân quyền](screenshots-v2/07-accounts.png)
- [Mobile](screenshots-v2/08-mobile.png)

Các screenshot workflow là dữ liệu kiểm thử và mail mô phỏng, không phải bằng chứng email thật đã gửi.

## Kiểm tra trên DB hiện có

- Tạo backup VACUUM INTO trước migration.
- Đăng nhập Admin chính bằng mật khẩu đã yêu cầu thành công trên server thật localhost.
- Giữ nguyên **6 đơn hiện có**.
- Xác nhận Entra/Mail chưa cấu hình, 16 kho thiếu manager, 11 vendor thiếu email, 375 giá pending.
- Xóa mật khẩu bootstrap plaintext khỏi `.env` sau xác minh; hash trong DB vẫn hoạt động.

## Chưa kiểm thử được

SSO/MFA/Conditional Access trên tenant thật, gửi/nhận mail thật, hostname HTTPS, message trace, Microsoft Excel UI/print preview và tải nhiều người dùng. Các mục này cần IT và bộ phận mua hàng nghiệm thu với cấu hình/dữ liệu đã được xác nhận.
