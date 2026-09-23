# Triển khai trên Render và Vercel

Kiến trúc triển khai:

- Vercel phục vụ thư mục `public` và giữ URL mà người dùng truy cập.
- Mọi request `/api/*` được Vercel rewrite sang backend Render.
- Render chạy Node.js, mail worker và SQLite.
- SQLite nằm trên Render Persistent Disk tại `/app/data`; không chạy nhiều hơn một instance.

## 1. Điều kiện trước khi bắt đầu

1. Đưa **chính thư mục ứng dụng này** lên một GitHub repository private, sao cho `package.json`, `Dockerfile`, `render.yaml` và `vercel.json` nằm ở root của repository. Không commit `.env`, `deploy/production.env`, file SQLite hoặc mật khẩu.
2. Có tài khoản Vercel và Render kết nối được với repository đó.
3. Dùng Render web service trả phí vì Persistent Disk không có trên web service miễn phí.
4. Chọn một URL production duy nhất cho người dùng, ví dụ `https://cj-purchase-ordering.vercel.app` hoặc tên miền riêng. Giá trị này phải khớp chính xác với `APP_URL` trên Render.
5. Chuẩn bị Gmail App Password và một mật khẩu bootstrap admin mạnh. Nếu chuyển database hiện tại thì mật khẩu admin đã được lưu trong database; biến bootstrap chỉ được dùng khi chưa có admin chính.

Hướng dẫn bên dưới giả định root của GitHub repository là thư mục ứng dụng. Nếu dùng monorepo, Vercel phải đặt Root Directory tới thư mục ứng dụng; đồng thời phải đưa một `render.yaml` đã điều chỉnh `dockerfilePath` và `dockerContext` lên root của repository. Cách ít lỗi nhất cho lần deploy đầu là dùng repository riêng cho ứng dụng.

## 2. Tạo backend trên Render

1. Trong Render Dashboard chọn **New > Blueprint**.
2. Kết nối GitHub repository và chọn file `render.yaml`.
3. Xác nhận service `cj-purchase-ordering-api`, region Singapore, một instance và Persistent Disk 1 GB.
4. Khi Blueprint hỏi các biến có `sync: false`, nhập:

   | Biến | Giá trị lúc tạo |
   | --- | --- |
   | `DB_PATH` | `/app/data/purchase.sqlite` |
   | `APP_URL` | URL Vercel production nếu đã biết; nếu chưa biết dùng tạm `https://temporary.invalid` |
   | `MAIL_ENABLED` | `false` |
   | `GMAIL_USER` | Địa chỉ Gmail relay |
   | `GMAIL_APP_PASSWORD` | Gmail App Password, không phải mật khẩu Gmail thường |
   | `BOOTSTRAP_ADMIN_PASSWORD` | Mật khẩu mạnh, duy nhất |

5. Tạo Blueprint và chờ Docker build hoàn tất.
6. Ghi lại URL Render, ví dụ `https://cj-purchase-ordering-api.onrender.com`.
7. Kiểm tra `https://<render-host>/` trả về trang đăng nhập. Chưa bật gửi mail.

Không tự khai báo `PORT`: Render cung cấp biến này và server đã đọc `process.env.PORT`. `HOST=0.0.0.0` đã có trong Blueprint.

## 3. Tạo frontend trên Vercel

1. Trong Vercel chọn **Add New > Project** và import cùng GitHub repository.
2. Chọn Root Directory như phần 1. Framework Preset có thể để **Other**.
3. `vercel.json` trong repository đã đặt `outputDirectory=public` và rewrite `/api/*` sang `https://cj-project.onrender.com`. Không cần biến môi trường trên Vercel. Nếu đổi hostname Render, sửa `destination` trong `vercel.json` và deploy lại.
4. Deploy. Ghi lại URL production chính xác mà Vercel cấp. Lưu ý Preview URL vẫn không thể POST/đăng nhập vì backend chỉ chấp nhận Origin đúng bằng `APP_URL` production.

## 4. Hoàn tất liên kết hai nền tảng

1. Quay lại Render > service > **Environment**.
2. Đặt `APP_URL` bằng URL Vercel production chính xác, ví dụ:

   ```text
   https://cj-purchase-ordering.vercel.app
   ```

   Không có dấu `/` cuối.

3. Save và redeploy Render.
4. Chỉ truy cập ứng dụng qua URL Vercel khi kiểm thử nghiệp vụ. Không trộn URL Render và Vercel trong cùng một phiên đăng nhập.
5. Nếu dùng Microsoft Entra ID, thêm `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`, `ENTRA_CLIENT_SECRET` trên Render và đăng ký callback:

   ```text
   https://<vercel-production-host>/api/auth/microsoft/callback
   ```

## 5. Chọn dữ liệu production

### Phương án A: khởi tạo database mới

Giữ `DB_PATH=/app/data/purchase.sqlite`. Lần chạy đầu server tạo schema, admin chính từ `BOOTSTRAP_ADMIN_PASSWORD` và nhập dữ liệu công ty từ các file trong `templates`.

### Phương án B: chuyển database hiện tại

Không sao chép riêng `purchase.sqlite` khi ứng dụng cũ còn đang ghi WAL. Tạo một snapshot nhất quán rồi chuyển snapshot đó.

1. Dừng web cũ trong thời gian cutover.
2. Tại thư mục ứng dụng trên máy hiện tại, bảo đảm chưa có `data/render-upload.sqlite`, sau đó chạy:

   ```powershell
   node --input-type=module -e "import { DatabaseSync } from 'node:sqlite'; const db=new DatabaseSync('data/purchase.sqlite'); db.exec(\"VACUUM INTO 'data/render-upload.sqlite'\"); db.close();"
   ```

3. Chuyển `data/render-upload.sqlite` vào Persistent Disk bằng Render Shell/SSH/SCP hoặc một URL tải xuống riêng tư, có thời hạn. Đặt file nhận thành `/app/data/purchase-imported.sqlite`. Không đưa database lên repository hoặc URL công khai.
4. Nếu dùng một URL riêng tư, có thể tạm thêm `DATABASE_IMPORT_URL` trên Render rồi chạy trong Render Shell:

   ```sh
   node --input-type=module -e "import { writeFile } from 'node:fs/promises'; const r=await fetch(process.env.DATABASE_IMPORT_URL); if(!r.ok) throw new Error('Download failed: '+r.status); const b=Buffer.from(await r.arrayBuffer()); if(b.subarray(0,16).toString()!=='SQLite format 3\u0000') throw new Error('Not a SQLite database'); await writeFile('/app/data/purchase-imported.sqlite',b);"
   ```

5. Xóa ngay `DATABASE_IMPORT_URL`, đổi `DB_PATH` thành `/app/data/purchase-imported.sqlite`, rồi redeploy Render.
6. Kiểm tra số lượng tài khoản, kho, vendor, mặt hàng, đơn hàng và tài liệu cũ trước khi cho người dùng ghi dữ liệu mới.
7. Xóa bản upload tạm ở máy cá nhân sau khi đã xác minh và vẫn giữ một bản backup an toàn riêng.

`DB_PATH` dùng `sync: false`, vì vậy Render không ghi đè giá trị đã đổi khi đồng bộ Blueprint sau này.

## 6. Kiểm thử trước khi bật mail

Thực hiện trên URL Vercel production:

1. Mở `/api/auth/config` và xác nhận HTTP 200.
2. Đăng nhập Admin; đăng xuất và đăng nhập lại.
3. Kiểm tra số lượng dữ liệu và tải một file Excel/PO cũ.
4. Tạo một yêu cầu thử và xác nhận dữ liệu còn nguyên sau một lần redeploy Render.
5. Kiểm tra cookie `cj_session` có `Secure`, `HttpOnly`, `SameSite=Lax`.
6. Gửi email thử tới địa chỉ kiểm soát được.
7. Chỉ sau khi các bước trên đạt, đổi `MAIL_ENABLED=true` trên Render và redeploy.

## 7. Giới hạn cần nhớ

- Persistent Disk chỉ gắn với một Render service và không hỗ trợ nhiều instance. Giữ `numInstances: 1`.
- Deploy service có disk sẽ có một khoảng downtime ngắn.
- Vercel Preview URL không khớp `APP_URL`, nên không dùng Preview để kiểm thử thao tác ghi hoặc đăng nhập.
- Session nằm trong RAM; mỗi lần Render restart người dùng phải đăng nhập lại.
- Đăng nhập Requestor hiện chỉ kiểm tra email `@cj.net`, không xác minh chủ hộp thư. Không nên mở công khai nếu chưa chấp nhận rủi ro này hoặc chưa đặt ứng dụng sau lớp truy cập nội bộ/VPN.
- Snapshot tự động của disk không thay thế backup SQLite nhất quán. Lên lịch tạo `VACUUM INTO` và tải backup sang nơi lưu trữ khác.

## 8. Rollback

1. Giữ `MAIL_ENABLED=false` trong lúc rollback để tránh gửi lại thư.
2. Đưa Vercel về deployment trước trong mục Deployments.
3. Trên Render, chọn deploy trước hoặc đổi `DB_PATH` về file SQLite backup đã xác minh.
4. Kiểm tra outbox trước khi bật lại mail; thư trạng thái `UNKNOWN` phải được đối chiếu với Sent Items trước khi retry.

Tài liệu chính thức:

- Render Blueprints: <https://render.com/docs/blueprint-spec>
- Render Persistent Disks: <https://render.com/docs/disks>
- Render Docker: <https://render.com/docs/docker>
- Vercel project configuration: <https://vercel.com/docs/project-configuration>
- Vercel external rewrites: <https://vercel.com/docs/routing/rewrites>
