# Triển khai website lên máy chủ

Hướng dẫn triển khai tách frontend trên Vercel và backend/SQLite trên Render: [RENDER-VERCEL.md](./RENDER-VERCEL.md).

Trạng thái: đã chuẩn bị cấu hình, chưa triển khai hoặc kiểm thử Docker vì máy hiện tại không có Docker. Cần xác định VPS/máy chủ, quyền truy cập và tên miền trước khi chạy. Không có URL công khai cho đến khi triển khai và kiểm tra thành công.

Đăng nhập Requestor hiện chỉ kiểm tra đuôi email, không xác minh chủ hộp thư. Người nhập cùng email sẽ có cùng quyền xem hồ sơ Requestor đó. HTTPS không thay đổi cơ chế này.

## Triển khai bằng Docker trên máy chủ Linux

1. Chuẩn bị máy chủ có Docker Compose và tên miền/subdomain do bạn quản lý. Trỏ DNS về máy chủ. Cổng 80/443 phải đến được Caddy để cấp chứng chỉ; xem [hướng dẫn chính thức Caddy](https://caddyserver.com/docs/quick-starts/reverse-proxy).
2. Sao lưu SQLite bằng VACUUM INTO, hoặc dừng web trước khi sao chép dữ liệu. Chuyển source, templates và bản dữ liệu hiện hành lên máy chủ qua kết nối riêng. Đặt SQLite tại `data/purchase.sqlite`. Không dùng DB rỗng vì bản nạp lần đầu chưa chứa danh mục đã cập nhật trên máy hiện tại.
3. Cho user UID 1000 của container quyền ghi thư mục data và SQLite. Chỉ một bản app chạy trên DB này. Dừng bản web cũ khi chuyển chính thức để tránh hai hàng đợi email hoạt động độc lập.
4. Trong thư mục deploy tạo `.env` chứa `PUBLIC_DOMAIN=ten-mien-cua-ban`. Chỉ nhập hostname, không có https:// hoặc đường dẫn.
5. Tạo `production.env` từ mẫu, điền mật khẩu ứng dụng Gmail trực tiếp trên máy chủ. Giữ MAIL_ENABLED=false trong lúc kiểm tra. Nếu dùng Entra, sao chép cấu hình Entra và đổi callback sang URL HTTPS mới. Không công khai các file env.
6. Từ thư mục deploy chạy `docker compose up -d --build`. Xem log qua `docker compose logs --tail=100 app proxy`.
7. Kiểm tra URL HTTPS bằng một thiết bị ngoài mạng máy chủ: đăng nhập Admin/Requestor, số lượng danh mục/đơn, tải mẫu Excel và tải PO cũ. Cookie phải có Secure. Máy chủ phải kết nối được Gmail SMTP cổng 465.
8. Sau khi chuyển hẳn từ bản cũ, bật MAIL_ENABLED=true rồi chạy `docker compose up -d`. Xem Trung tâm email; thư chờ cấu hình có thể được gửi tự động.

Dữ liệu được mount từ thư mục data của máy chủ, không nằm trong lớp tạm của container. Cần sao lưu định kỳ sang nơi lưu riêng. Phiên đăng nhập hiện lưu trong bộ nhớ: khởi động lại sẽ yêu cầu đăng nhập lại. Các biến trong `environment` của Compose ưu tiên hơn `env_file`; xem [Docker Compose](https://docs.docker.com/compose/how-tos/environment-variables/envvars-precedence/).
