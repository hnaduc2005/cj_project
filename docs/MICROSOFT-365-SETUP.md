> **Quy trình hiện hành:** Line Manager chỉ nhận email thông báo khi Requestor chọn gửi, không có chức năng phê duyệt. Requestor được thêm email ngăn cách bằng dấu `;`. Đơn chuyển thẳng đến Admin. Các mô tả duyệt Line Manager bên dưới thuộc phiên bản trước; xem README.md để thao tác hiện tại.

# PROCUREMENT SMILE — Hướng dẫn IT kết nối Microsoft 365

Đây là bước cấu hình cho ứng dụng Entra đã có của công ty. Không cần gửi client secret, mật khẩu hay token qua hội thoại. Secret chỉ nằm ở máy chủ/secret store.

## 1. Hai chức năng và hai nhóm quyền

| Chức năng | Luồng | Quyền |
|---|---|---|
| Đăng nhập Requestor/Line Manager/đồng Admin | Authorization code + PKCE, confidential Web application | Delegated `User.Read`, OIDC `openid profile email` |
| Email tự động gửi từ Requestor/Admin | Client credentials, gọi `/users/{email}/sendMail` | Application `Mail.Send`, được IT consent và giới hạn phạm vi hộp thư |

**Delegated Mail.Send đơn thuần không đủ cho worker email hiện tại.** Worker hoạt động khi người dùng đã đóng trình duyệt, nên dùng Application permission. Nếu app hiện tại chỉ có quyền delegated, IT cần bổ sung quyền application và thiết lập mailbox scope đúng chính sách công ty, hoặc yêu cầu đổi kiến trúc gửi thư.

Website không sử dụng mật khẩu đăng nhập của Requestor hoặc Admin để đăng nhập Outlook/SMTP. Mật khẩu Admin website chỉ dùng xác thực cục bộ. Sender email luôn được lấy từ danh tính đã đăng nhập; trình duyệt không được tự truyền một địa chỉ From khác.

Nguồn chính thức: [Microsoft Graph sendMail](https://learn.microsoft.com/en-us/graph/api/user-sendmail?view=graph-rest-1.0), [Client credentials flow](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-client-creds-grant-flow), [MSAL Node request APIs](https://github.com/AzureAD/microsoft-authentication-library-for-js/blob/dev/lib/msal-node/docs/request.md).

## 2. Chuẩn bị thông tin app

Trong Microsoft Entra admin center, mở **App registrations → ứng dụng công ty dùng cho PROCUREMENT SMILE**:

1. Ghi lại **Directory (tenant) ID** và **Application (client) ID**. Cả hai là GUID.
2. Dùng chế độ tài khoản **single tenant** của công ty.
3. Trong **Authentication**, thêm platform **Web**.
4. Đăng ký redirect URI chính xác với đường dẫn callback của website.
5. Với môi trường test trên máy hiện tại, `APP_URL` đang là `http://127.0.0.1:3000`, callback là `http://127.0.0.1:3000/api/auth/microsoft/callback`. IT cần bảo đảm URI loopback này được đăng ký hợp lệ; nếu chính sách/portal chỉ chấp nhận `http://localhost:3000`, đổi **cả APP_URL và URL dùng trong trình duyệt** sang localhost, callback cũng đổi đồng nhất.
6. Khi triển khai cho người dùng khác, thay bằng hostname HTTPS thật, ví dụ `https://procurement.<company-domain>/api/auth/microsoft/callback`. Không dùng localhost trong email thật gửi cho đồng nghiệp: localhost trên máy họ không phải máy chủ của bạn.
7. Trong **Certificates & secrets**, tạo hoặc sử dụng credential theo chính sách IT. Bản mã hiện tại hỗ trợ client secret qua biến môi trường. Sao chép **Value**, không dùng Secret ID.
8. Trong **API permissions**, thêm Microsoft Graph **Delegated User.Read** cho đăng nhập, **Application Mail.Send** cho worker gửi thư.
9. IT thực hiện **Grant admin consent** theo chính sách tenant.
10. Giới hạn quyền ứng dụng vào các hộp thư liên quan bằng cơ chế Exchange Online được công ty phê duyệt (Application RBAC/access policy phù hợp cấu hình hiện có). Không mặc định cấp quyền trên mọi hộp thư nếu không cần.
11. Bảo đảm Requestor và các Admin có mailbox Exchange Online có thể gửi thư. Sau đăng nhập Microsoft, app lưu object ID đã xác minh và dùng ID này để gửi đúng mailbox, kể cả khi email khác UPN. Admin chính đăng nhập mật khẩu chưa có object ID thì tạm dùng email làm UPN; **nên cho Admin chính đăng nhập Microsoft ít nhất một lần** để liên kết đúng mailbox trước go-live.
12. Nếu Enterprise Application đang bật **Assignment required**, nhóm nhân viên được phép đăng nhập cần được gán ứng dụng. Muốn tất cả nhân viên @cj.net truy cập tự do, cấu hình assignment/group phù hợp; không cần tạo trước từng tài khoản trong website.

## 3. Điền `.env` trên máy chủ

Mở `cj-purchase-ordering/.env`, giữ nguyên dữ liệu DB và cổng hiện tại, điền:

```dotenv
HOST=127.0.0.1
PORT=3000
DB_PATH=./data/purchase.sqlite
APP_URL=http://127.0.0.1:3000
BOOTSTRAP_ADMIN_PASSWORD=
ENTRA_TENANT_ID=<directory-tenant-id>
ENTRA_CLIENT_ID=<application-client-id>
ENTRA_CLIENT_SECRET=<secret-value>
MAIL_ENABLED=false
```

Trong Neon production, tài khoản Admin chính là `admin@cj.net`; mật khẩu chỉ được lưu dưới dạng scrypt hash. `BOOTSTRAP_ADMIN_PASSWORD` chỉ dùng khi khởi tạo database mới chưa có tài khoản này. Khi dùng database đã có dữ liệu, không cần điền lại biến đó; nếu đặt cho cài đặt mới, hãy xóa giá trị sau khi khởi tạo.

Khởi động lại máy chủ sau khi sửa `.env`. Không ghi secret vào mã JavaScript, README, Git, screenshot hoặc gửi qua email cho người không có quyền.

## 4. Kiểm tra đăng nhập trước, rồi mới bật gửi thư

1. Giữ `MAIL_ENABLED=false` trong giai đoạn xác minh SSO.
2. Khởi động website, mở **Kết nối & thiết lập** bằng Admin chính: Entra phải hiện “Đã cấu hình”. Đây chỉ là trạng thái có đủ biến cấu hình, chưa chứng minh Microsoft chấp nhận.
3. Đăng xuất, chọn **Tài khoản công ty**, nhập email thật @cj.net, chọn **Tiếp tục với Microsoft**.
4. Hoàn thành MFA/Conditional Access theo chính sách công ty.
5. Ứng dụng lấy danh tính từ Graph `/me`, kiểm tra đúng tenant và đuôi `@cj.net`. Email gõ vào ô đăng nhập chỉ là gợi ý, không quyết định danh tính phiên.
6. Đăng nhập hai người dùng khác nhau để kiểm tra cách ly đơn.
7. Admin cấp quyền một email đồng Admin, đăng nhập tài khoản đó, xác nhận đủ quyền. Thu hồi quyền phải có tác dụng ngay ở request API kế tiếp.

## 5. Hoàn thiện dữ liệu người nhận

Các file được cung cấp hiện có **16 kho trống Mail Line Manager và 11 vendor trống Mail**. Không tự điền email suy đoán.

1. Admin mở **Danh mục & bảng giá → Kho hàng**.
2. Điền **Email Line Manager (@cj.net)** theo danh sách đã được xác nhận. Người duyệt phải đăng nhập bằng email này.
3. Không đặt Line Manager trùng người tạo đơn; hệ thống chặn tự duyệt.
4. Bổ sung địa chỉ kho, người nhận, số điện thoại còn thiếu.
5. Mở **Nhà cung cấp**, điền email nhận PO từ Vendor List đã xác nhận. Vendor có thể dùng email ngoài @cj.net.
6. Với đơn đã gửi nhưng thiếu manager: mở tab **Phê duyệt → Cập nhật tuyến duyệt từ Kho hàng**. Khi email đã được Microsoft tiếp nhận, hệ thống không âm thầm đổi người duyệt.
7. Kiểm tra **Trung tâm email** trước khi bật gửi. Những email QUEUED/BLOCKED_CONFIG sẽ được worker xử lý khi MAIL_ENABLED=true. Hủy đơn thử không cần gửi trước khi bật.

## 6. Bật gửi và nghiệm thu với mailbox thử đã được ủy quyền

1. IT xác nhận quyền Application Mail.Send và phạm vi mailbox gửi.
2. Đổi `MAIL_ENABLED=true`, khởi động lại.
3. Tạo một yêu cầu thử bằng tài khoản Requestor được cho phép. Requestor xác nhận gửi là hành động ủy quyền gửi email trong ứng dụng.
4. Kiểm tra email đi từ **Requestor** đến **Line Manager + các Admin đang hoạt động**; nội dung không có giá.
5. Line Manager duyệt trong website. Admin tiếp nhận, hoàn thiện mọi thông tin, kiểm tra giá/VAT/vendor rồi chọn **Xác nhận, tạo PO & gửi NCC**.
6. Kiểm tra email đi từ **Admin xác nhận** tới **email Vendor**; mỗi vendor chỉ có file PO chứa hàng của mình.
7. Kiểm tra Sent Items trên đúng hộp thư gửi và message trace để xác nhận delivery.
8. Kiểm thử lỗi quyền gửi, địa chỉ sai, token hết hạn, timeout; đối chiếu trạng thái và cách retry.

**HTTP 202 chỉ có nghĩa Microsoft Graph chấp nhận xử lý**, không bảo đảm email đã được phát tới hộp thư người nhận. UI dùng “Microsoft đã tiếp nhận”; không tự tuyên bố delivered/read. Dịch vụ hiện không tích hợp callback phát thư/message trace API.

## 7. Hàng đợi và chống gửi trùng

- Mỗi email có event key duy nhất: một email đề xuất mỗi đơn, một email PO mỗi file vendor.
- Gửi lại Submit/Generate PO không tạo thêm email cho cùng sự kiện.
- Worker xử lý tuần tự; dữ liệu queue lưu trong SQLite, không mất khi tắt trình duyệt.
- `QUEUED`: chờ worker xử lý; `BLOCKED_CONFIG`: thiếu cấu hình; `BLOCKED_DATA`: thiếu email manager.
- `ACCEPTED`: Graph trả 202; không cho bấm gửi lại bằng retry thông thường.
- `FAILED`: bị từ chối rõ ràng; Admin sửa nguyên nhân rồi retry thủ công.
- `UNKNOWN`: timeout/HTTP 5xx hoặc server dừng khi đang gửi. Không tự retry vì có thể Microsoft đã nhận. Admin phải kiểm tra Sent Items trước khi xác nhận thử lại.
- Thư kèm PO giới hạn 2,5 MB trong bản hiện tại. File lớn hơn cần triển khai Graph attachment upload session; lỗi được hiển thị, không âm thầm bỏ đính kèm.
- Worker 15 giây/lần, đồng thời chạy ngay sau thao tác gửi. Chạy **một instance** ứng dụng với SQLite hiện tại; cần thiết kế distributed worker/DB trước khi scale nhiều instance.

## 8. Triển khai nội bộ

- Đặt reverse proxy có TLS phía trước Node; APP_URL dùng HTTPS thật. Cookie tự thêm Secure khi APP_URL là HTTPS.
- Chỉ expose máy chủ qua proxy hoặc firewall được IT kiểm soát; Node mặc định bind localhost.
- Khi cần bind 0.0.0.0, APP_URL bắt buộc HTTPS. Kiểm tra Origin và redirect URI phải trùng public URL.
- Session và OAuth state ở bộ nhớ: khởi động lại cần đăng nhập lại. Với nhiều instance cần session store dùng chung.
- Backup SQLite, templates, cấu hình; bảo vệ file DB và secret bằng quyền filesystem của tài khoản dịch vụ.
- Không dùng tài khoản Windows dùng chung để vận hành production; cấu hình service account và quy trình rotation credential theo IT.
- Bản hiện tại chưa có quy trình amendment/revision cho PO đã phát hành; không sửa trực tiếp DB để thay PO đã gửi.

## 9. Xử lý lỗi

| Lỗi | Kiểm tra |
|---|---|
| Nút Microsoft chưa kích hoạt | Ba biến ENTRA chưa đủ; khởi động lại sau sửa. |
| `AADSTS50011` | Redirect URI trong Entra phải khớp scheme, host, port, path. |
| Microsoft từ chối consent | User.Read/tenant consent/assignment/Conditional Access. |
| Graph 401/403 | Application Mail.Send, admin consent, secret, mailbox scope/Exchange application policy. |
| Graph không tìm thấy mailbox | Tài khoản có mailbox thật? Admin chính đã đăng nhập Microsoft để liên kết object ID chưa? |
| Có cấu hình nhưng email BLOCKED_CONFIG | MAIL_ENABLED vẫn false hoặc máy chủ chưa restart. |
| Thư UNKNOWN | Xem Sent Items/message trace trước retry; không bấm thử liên tục. |
| Người khác mở link email không được | APP_URL còn localhost hoặc hostname không được mạng công ty phân giải. |
| Quản lý không thấy đơn | Email đăng nhập khác manager_email snapshot trong tuyến duyệt. |
# Thay đổi cách truy cập Requestor

Requestor hiện chỉ cần nhập email @cj.net để truy cập, không cần các bước Entra trong tài liệu này. Cấu hình dưới đây áp dụng cho gửi email thật và đăng nhập Microsoft của Admin. Việc chỉ nhập email không xác minh người sở hữu hộp thư.
