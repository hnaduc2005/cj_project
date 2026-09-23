# Deploy với Neon PostgreSQL, Render và Vercel

Vercel phục vụ giao diện trong `public` và chuyển `/api/*` sang Render. Render chạy backend Node.js; toàn bộ dữ liệu nghiệp vụ, tài liệu đính kèm và hàng đợi mail nằm trong Neon PostgreSQL. Không cần Render Persistent Disk. `DATABASE_URL` được dùng thay cho `DB_PATH` khi có mặt.

## 1. Chuyển dữ liệu SQLite hiện có sang Neon

**Làm bước này trước khi cho Render chạy app**, vì app sẽ tự tạo schema khi kết nối vào một database trống; công cụ nhập chỉ nhận Neon database còn trống. Dừng các thao tác ghi trên app SQLite cũ trong thời gian chuyển và giữ file SQLite gốc làm bản dự phòng. Chưa có dữ liệu trên Render nên nguồn cần chuyển là `data/purchase.sqlite` ở máy hiện tại.

1. Tạo Neon project và một database/branch mới, để schema `public` trống. Trong Neon Dashboard > **Connect**, lấy PostgreSQL connection string dạng `postgresql://...?...sslmode=require`. Dùng **direct connection** cho quá trình nhập. Không dán URL này vào GitHub, Vercel hay tài liệu.
2. Tạo file `.env.neon` trong thư mục ứng dụng, chỉ một dòng `DATABASE_URL=postgresql://...`. File này đã được `.gitignore` bỏ qua. Nếu nguồn SQLite ở nơi khác, đặt thêm `SQLITE_SOURCE_PATH=...`.
3. Tại thư mục chứa `package.json`, chạy:

   ```powershell
   npm ci
   npm run migrate:neon
   npm run migrate:neon -- --apply
   ```

   Lệnh không có `--apply` chỉ kiểm tra SQLite và đếm từng bảng. Lệnh có `--apply` tạo một snapshot SQLite nhất quán trong `data/`, yêu cầu Neon trống, chuyển 16 bảng cùng index trong một transaction, rồi đối chiếu số dòng và SHA-256 nội dung từng bảng trước khi commit. Nếu lỗi, transaction được rollback; snapshot vẫn được giữ để kiểm tra. Không chạy lại `--apply` trên database đã nhập xong.
4. Giữ nguyên file SQLite gốc và snapshot backup cho đến khi xác nhận web chạy đúng. Không đưa chúng lên repository hoặc nơi công khai. Sau khi bắt đầu ghi trên Neon, SQLite cũ không còn cập nhật; không thể rollback về nó mà không mất các thay đổi mới.

## 2. Tạo backend trên Render

Push code mới lên GitHub private, rồi tạo **New > Blueprint** từ repository có `render.yaml` ở root. Blueprint tạo một web service `cj-purchase-ordering-api`, gói Free, một instance, không có disk. Có thể nâng cấp gói trả phí sau; Render Free có thể ngủ khi không có truy cập.

Nhập các biến được yêu cầu khi tạo Blueprint:

| Biến | Giá trị |
| --- | --- |
| `DATABASE_URL` | URL Neon **của database vừa nhập dữ liệu**, không phải database/branch mới |
| `APP_URL` | URL production của Vercel, ví dụ `https://ten-du-an.vercel.app`, không có `/` cuối; nếu chưa có, tạm dùng `https://temporary.invalid` rồi sửa sau |
| `MAIL_ENABLED` | `false` đến khi đăng nhập, dữ liệu và email thử đều đạt |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD` | Chỉ điền khi dùng Gmail relay; App Password không phải mật khẩu Gmail thông thường |
| `BOOTSTRAP_ADMIN_PASSWORD` | Dùng cho database mới chưa có admin; khi chuyển SQLite, tài khoản/mật khẩu cũ đã được giữ nguyên |

`NODE_ENV=production`, `HOST=0.0.0.0` và `MAIL_PROVIDER=GMAIL` đã có trong Blueprint. **Không đặt `DB_PATH`** trên Render; Render tự cấp `PORT`. Nếu dùng Microsoft Entra, đặt thêm `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`, `ENTRA_CLIENT_SECRET` trong Render Environment. Không cần đặt các biến này nếu không dùng Entra.

Chờ build/deploy hoàn tất và ghi lại URL Render. Nếu service hiện có đã tạo bằng cấu hình SQLite, hãy xóa biến `DB_PATH` và disk cũ một cách có kiểm tra sau khi xác nhận Neon đã đủ dữ liệu; với service mới theo Blueprint này thì không có disk.

## 3. Tạo frontend trên Vercel

Import cùng GitHub repository vào Vercel. Chọn root là thư mục có `vercel.json`, preset **Other**. `vercel.json` hiện đưa `/api/*` tới `https://cj-project.onrender.com`. Nếu URL Render thực tế khác, sửa `destination` trong `vercel.json` rồi deploy lại Vercel. Không cần `DATABASE_URL` trên Vercel: chỉ Render truy cập Neon.

Sau khi Vercel cấp URL production, đặt `APP_URL` trên Render bằng đúng URL đó (không có `/` cuối), lưu và redeploy. Vercel Preview URL khác `APP_URL` sẽ không dùng được để đăng nhập/gửi request ghi. Nếu dùng Entra, callback cần đăng ký theo URL production: `https://<vercel-host>/api/auth/microsoft/callback`.

## 4. Kiểm tra trước khi bật mail

1. Truy cập `https://<vercel-host>/api/auth/config` và xác nhận HTTP 200.
2. Đăng nhập admin cũ. Kiểm tra tài khoản, danh mục, đơn hàng, tài liệu/đính kèm và số lượng dữ liệu khớp với báo cáo của lệnh chuyển.
3. Tạo một yêu cầu thử; redeploy Render rồi xác nhận nó vẫn còn trên Neon.
4. Gửi email thử đến địa chỉ do bạn kiểm soát. Chỉ sau khi kiểm tra xong mới đổi `MAIL_ENABLED=true` trên Render.

Session đăng nhập lưu trong RAM nên Render restart có thể yêu cầu đăng nhập lại. Đăng nhập Requestor hiện kiểm tra email `@cj.net` nhưng không chứng thực chủ hộp thư; chỉ mở cho người dùng tin cậy hoặc đặt thêm lớp kiểm soát truy cập trước khi công khai. Neon là nguồn dữ liệu chính sau cutover; tạo kế hoạch backup riêng cho Neon.

Tài liệu chính thức: [Neon connection string](https://neon.com/docs/connect/connect-from-any-app), [Render Blueprint](https://render.com/docs/blueprint-spec), [Render Free](https://render.com/docs/free), [Vercel rewrites](https://vercel.com/docs/routing/rewrites).
