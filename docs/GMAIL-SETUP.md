# Gửi PO qua Gmail trung gian

Website dùng hộp thư có sẵn **prc.cjgmd@gmail.com** làm Gmail trung gian. Cần cấu hình mật khẩu ứng dụng trên máy trước khi gửi thật. Đơn hàng và email chờ gửi vẫn được lưu.

## 1. Đăng nhập hộp thư có sẵn

1. Mở Gmail và đăng nhập **prc.cjgmd@gmail.com**.
2. Kiểm tra đang dùng đúng tài khoản trước khi tạo mật khẩu ứng dụng. Không cần tạo hộp thư mới.
3. Tự giữ mật khẩu; không gửi trong hội thoại.

## 2. Tạo mật khẩu ứng dụng

1. Mở [Bảo mật tài khoản Google](https://myaccount.google.com/security), bật **Xác minh 2 bước**.
2. Mở [Mật khẩu ứng dụng](https://myaccount.google.com/apppasswords).
3. Tạo mật khẩu cho tên `PROCUREMENT SMILE`, giữ mã 16 ký tự để nhập trực tiếp trên máy chạy website.

Nếu không có mục này, xem điều kiện tài khoản trong [hướng dẫn chính thức của Google](https://support.google.com/accounts/answer/185833?hl=vi). Không dùng mật khẩu đăng nhập Gmail thông thường thay thế.

## 3. Kết nối website

1. Mở thư mục `D:\ThuCNU\CODE\cj-purchase-ordering`.
2. Nhấp đúp **SETUP-GMAIL.cmd**.
3. Nhấn Enter để dùng `prc.cjgmd@gmail.com`, hoặc nhập địa chỉ bạn thực sự đã tạo.
4. Nhập mật khẩu ứng dụng. Ký tự được ẩn khi nhập.
5. Công cụ kiểm tra đăng nhập SMTP; bước kiểm tra này không gửi email. Chỉ khi thành công mới lưu cấu hình vào `.env` và bật gửi thư. Không chia sẻ file `.env`.
6. Dừng website bằng **Ctrl+C** trong cửa sổ đang chạy, rồi nhấp đúp **START-WEBSITE.cmd**.
7. Mở `http://127.0.0.1:3000`, đăng nhập Admin, xem **Thiết lập hệ thống** và **Trung tâm email**.

Sau khi khởi động lại, thư đang chờ cấu hình sẽ được hệ thống thử gửi tự động. Hãy kiểm tra địa chỉ nhận và nội dung các PO đang chờ trước khi bật kết nối.

## 4. Cách thư được gửi

Khi Requestor xác nhận yêu cầu mới, hệ thống tự tạo email cho tất cả Admin đang có quyền và đang hoạt động. Không cần tích chọn gửi Line Manager. Admin bị thu hồi quyền không nằm trong danh sách gửi tự động; danh sách được kiểm tra lại trước khi gửi thư đang chờ. Đơn cũ không tự tạo thêm thông báo hồi tố.

Ô chọn gửi thêm chỉ dành cho Line Manager và các địa chỉ bổ sung, ngăn cách bằng dấu `;`. Thiếu email Line Manager không chặn email Admin. Admin đã nhận trong nhóm tự động không nhận thêm bản trùng trong nhóm tùy chọn. Xem loại **Thông báo tự động cho Admin** trong Trung tâm email để kiểm tra kết quả.

- **From:** Gmail trung gian đã cấu hình.
- **Reply-To:** email Requestor cho thông báo yêu cầu; email Admin phát hành cho PO. Khi người nhận bấm trả lời, thư trả lời hướng về địa chỉ này.
- **Người nhận:** Line Manager/Admin và email bổ sung theo yêu cầu; PO gửi đến email nhà cung cấp đã lưu.
- **Đính kèm PO:** file đã phát hành, giữ nguyên nội dung và tên file.

Gửi qua Gmail không yêu cầu Entra/Microsoft. Cơ chế đăng nhập Requestor và quyền Admin giữ nguyên.

## 5. Kiểm tra kết quả và xử lý lỗi

- **Chờ cấu hình gửi mail:** chưa bật gửi hoặc thiếu mật khẩu ứng dụng; chạy lại công cụ cấu hình.
- **Máy chủ email đã tiếp nhận:** máy chủ chấp nhận thư, chưa chứng minh người nhận đã nhận hoặc đọc. Kiểm tra hộp thư người nhận, Spam và thư báo lỗi trả về Gmail.
- **Chấp nhận một phần:** xem chi tiết, kiểm tra địa chỉ bị từ chối rồi gửi lại. Hệ thống chỉ thử những người nhận chưa được chấp nhận.
- **Không rõ kết quả:** kiểm tra thư đã gửi trước khi xác nhận gửi lại, tránh trùng PO.
- **Gửi thất bại:** kiểm tra thông báo trong chi tiết email; sửa địa chỉ/cấu hình rồi dùng chức năng gửi lại. Không tạo PO mới chỉ để thử gửi lại.

Kết nối dùng `smtp.gmail.com`, cổng 465 với TLS theo [tài liệu Gmail](https://developers.google.com/workspace/gmail/imap/imap-smtp). Kiểm thử phần mềm dùng máy chủ giả lập; chỉ có thể xác minh gửi thật sau khi hộp thư và mật khẩu ứng dụng được thiết lập.
