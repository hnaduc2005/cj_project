> TÀI LIỆU LỊCH SỬ PHIÊN BẢN 1. Bản hiện tại là PROCUREMENT SMILE v2; xem README.md và các tài liệu có hậu tố V2.

# CJ Logistics Vina — Website yêu cầu mua hàng

**Hướng dẫn từ số 0 dành cho người dùng Windows.**

Website được xây dựng dựa trên `CJ_Logistics_Vina_Purchase_Ordering_Website_Design_Spec.docx`. Đây là bản **MVP chạy thử/UAT trên máy cá nhân**, gồm giao diện tiếng Việt, máy chủ API, cơ sở dữ liệu SQLite, phân quyền và nhập/xuất Excel thật. Không phải bản đã được phê duyệt để triển khai toàn công ty.

## 1. Cách mở nhanh ngay trên máy hiện tại

Node.js portable và thư viện đã được chuẩn bị trong workspace để chạy và kiểm thử.

1. Mở **File Explorer** bằng tổ hợp **Windows + E**.
2. Bấm thanh địa chỉ, dán `D:\ThuCNU\CODE\cj-purchase-ordering`, nhấn **Enter**.
3. Nhấp đúp file **START-WEBSITE.cmd**. Nếu Windows đang ẩn phần mở rộng, tên có thể chỉ là **START-WEBSITE** với loại “Windows Command Script”.
4. Giữ cửa sổ dòng lệnh vừa mở. Khi hiện `CJ Purchase Ordering: http://127.0.0.1:3000` là máy chủ đã chạy.
5. Mở Edge/Chrome, gõ chính xác **http://127.0.0.1:3000** vào thanh địa chỉ, nhấn **Enter**.
6. Đăng nhập bằng một tài khoản ở phần 4.
7. Khi dùng xong, quay về cửa sổ dòng lệnh, nhấn **Ctrl + C**. Nếu hỏi `Terminate batch job (Y/N)?`, gõ **Y**, nhấn Enter.

Không mở `public/index.html` bằng nhấp đúp: giao diện cần kết nối máy chủ để đăng nhập, lưu đơn và đọc Excel.

Nếu bạn nhận một bản sao dự án không có thư mục `.tools`, thực hiện phần 2 và 3 bên dưới.

## 2. Cài công cụ từ đầu trên một máy Windows khác

### Bước 1 — Cài Node.js

Node.js là chương trình chạy phần máy chủ JavaScript. npm là công cụ cài thư viện, được cài kèm Node.js.

1. Mở trình duyệt, vào **https://nodejs.org/**.
2. Chọn bộ cài Windows cho **Node.js 24 LTS**, phiên bản **24.14.0 hoặc mới hơn trong dòng 24**. Dự án đã được kiểm thử bằng 24.14.0.
3. Tải file `.msi`, nhấp đúp để chạy.
4. Chọn **Next**, đồng ý điều khoản, giữ các lựa chọn mặc định, chọn **Install**.
5. Bảo đảm tùy chọn thêm Node.js vào **PATH** được bật; bộ cài thông thường bật sẵn.
6. Chọn **Finish**. Đóng và mở lại VS Code/Terminal nếu đang mở.
7. Nhấn **Windows + R**, gõ `cmd`, nhấn Enter.
8. Gõ lần lượt, mỗi dòng nhấn Enter:

```bat
node --version
npm.cmd --version
```

Lệnh đầu cần hiện `v24.14.0` hoặc phiên bản tương thích mới hơn. Nếu thấy “not recognized”, cài lại với PATH hoặc khởi động lại máy.

Không cần cài Python, SQL Server hay MySQL cho bản này.

### Bước 2 — Cài Visual Studio Code

1. Trong thư mục gốc hiện tại có bộ cài `VSCodeUserSetup-x64-1.138.0.exe`; nếu VS Code đã có, bỏ qua bước cài.
2. Trên máy khác, tải VS Code từ **https://code.visualstudio.com/**.
3. Chạy bộ cài, chọn các bước mặc định. Có thể bật “Open with Code” nếu muốn.
4. Mở **Visual Studio Code** sau khi cài xong.

### Bước 3 — Mở đúng thư mục dự án

1. Trong VS Code, chọn **File → Open Folder…**.
2. Chọn thư mục **cj-purchase-ordering**. Trên máy này là `D:\ThuCNU\CODE\cj-purchase-ordering`.
3. Bấm **Select Folder**.
4. Nếu VS Code hỏi tin cậy tác giả, đọc thông báo và chọn tin cậy nếu đây là đúng thư mục dự án của bạn.
5. Ở cột bên trái cần nhìn thấy `package.json`, `server.js`, `public`, `lib`, `README.md`.
6. Bấm `README.md`, rồi **Ctrl + Shift + V** để đọc hướng dẫn ở chế độ trình bày đẹp.

### Bước 4 — Mở Terminal

1. Trên thanh menu VS Code, chọn **Terminal → New Terminal**.
2. Một khung lệnh xuất hiện ở phía dưới.
3. Nếu thư mục chưa đúng, dán lệnh sau rồi nhấn Enter:

```powershell
cd D:\ThuCNU\CODE\cj-purchase-ordering
```

Nếu bạn lưu ở ổ khác, thay đường dẫn bằng đường dẫn thật. Đường dẫn có dấu cách phải đặt trong dấu ngoặc kép.

### Bước 5 — Cài thư viện

Gõ lệnh sau, nhấn Enter và chờ hoàn tất:

```powershell
npm.cmd ci
```

Máy cần Internet ở lần cài đầu. Lệnh đọc `package-lock.json` để cài đúng phiên bản thư viện đã được kiểm thử. Khi thành công sẽ có thư mục `node_modules` và dòng thông báo đã cài các package. Một số thư viện phụ của ExcelJS có thông báo `deprecated`; đó không tự động là lỗi cài đặt.

Nếu chỉ có Node portable ở máy hiện tại, không cần bước này vì thư viện đã được cài. Có thể dùng `START-WEBSITE.cmd`, hoặc chạy:

```powershell
& '..\.tools\node-v24.14.0-win-x64\npm.cmd' ci
```

### Bước 6 — Thiết lập cấu hình (không bắt buộc cho lần thử đầu)

1. Trong Terminal, chạy:

```powershell
Copy-Item .env.example .env
```

2. Mở `.env` trong VS Code.
3. Giữ `HOST=127.0.0.1` và `PORT=3000`.
4. Nếu muốn đổi mật khẩu mẫu, sửa `DEMO_REQUESTER_PASSWORD` và `DEMO_ADMIN_PASSWORD` **trước lần khởi động đầu tiên**.
5. Nhấn **Ctrl + S** để lưu.

Mật khẩu trong `.env` chỉ dùng lúc khởi tạo cơ sở dữ liệu; đổi file sau đó không đổi mật khẩu người dùng đã có. Không gửi `.env` hoặc cơ sở dữ liệu cho người không được phép.

### Bước 7 — Chạy website

Chạy:

```powershell
npm.cmd start
```

Hoặc trên máy hiện tại, dùng Node portable:

```powershell
& '..\.tools\node-v24.14.0-win-x64\node.exe' --env-file-if-exists=.env server.js
```

Khi thấy địa chỉ `http://127.0.0.1:3000`, mở địa chỉ đó trong trình duyệt. Giữ Terminal đang chạy. Mở trang trong trình duyệt không tự khởi động máy chủ.

Nếu xuất hiện cảnh báo `SQLite is an experimental feature`, đó là cảnh báo của phiên bản Node về module tích hợp. Bản này đã được kiểm thử với module đó.

### Bước 8 — Dừng và mở lại

- Dừng: bấm vào Terminal rồi nhấn **Ctrl + C**.
- Mở lại: chạy `npm.cmd start` hoặc nhấp đúp `START-WEBSITE.cmd`.
- Đơn hàng đã lưu vẫn còn trong cơ sở dữ liệu sau khi dừng.
- Phiên đăng nhập được lưu trong bộ nhớ máy chủ, nên khởi động lại cần đăng nhập lại.

## 3. Hiểu cấu trúc dự án

```text
cj-purchase-ordering/
├── public/
│   ├── index.html          Trang HTML gốc
│   ├── styles.css          Giao diện, màu sắc, bố cục responsive
│   └── app.js              Các màn hình và thao tác phía trình duyệt
├── lib/
│   ├── database.js         Tạo bảng SQLite, dữ liệu mẫu, mật khẩu, audit
│   ├── business.js         Kiểm tra dữ liệu, matching, phân loại trạng thái
│   └── excel.js            Đọc Excel/CSV, mẫu Ordering, tạo PO tạm
├── test/
│   └── workflow.test.js   Kiểm thử API và quy tắc nghiệp vụ
├── templates/
│   └── README.md           Cách thay bằng workbook thật của công ty
├── docs/
│   └── PHAM-VI-VA-UAT.md  Phạm vi, kiến trúc, checklist nghiệm thu
├── data/                  Tự tạo khi chạy lần đầu, không đưa lên Git
│   └── purchase.sqlite   Cơ sở dữ liệu đơn hàng, danh mục, file, nhật ký
├── .env.example           Cấu hình mẫu
├── package.json           Thông tin dự án và các lệnh
├── package-lock.json      Khóa phiên bản thư viện
├── server.js              Máy chủ HTTP và API phân quyền
├── START-WEBSITE.cmd       Chạy nhanh trên Windows
└── README.md              Hướng dẫn này
```

Giao diện dùng HTML/CSS/JavaScript thuần, máy chủ dùng Node.js, SQLite là cơ sở dữ liệu quan hệ, ExcelJS xử lý Excel. Tài liệu gợi ý React/Next.js nhưng cho phép thay framework; bản này giảm bước cài đặt, vẫn giữ ranh giới giữa giao diện, API, dữ liệu và dịch vụ Excel.

## 4. Tài khoản chạy thử

| Vai trò | Email | Mật khẩu mặc định |
|---|---|---|
| Người yêu cầu | `requester@cj.local` | `Requester@123` |
| Người yêu cầu thứ hai | `requester2@cj.local` | `Requester@123` |
| Quản trị / Consolidator | `admin@cj.local` | `Admin@123` |

Đây là tài khoản mẫu, không phải email đăng nhập Microsoft thực. Tài khoản thứ hai dùng kiểm tra việc người này không thấy đơn của người khác. Mật khẩu được băm bằng scrypt trong cơ sở dữ liệu. Không có nút đổi vai trò bằng trình duyệt.

Muốn đổi vai trò thử nghiệm: bấm biểu tượng đăng xuất cạnh tên ở cuối thanh menu bên trái, rồi đăng nhập tài khoản còn lại. Hai tab cùng trình duyệt dùng chung phiên; dùng cửa sổ InPrivate/Incognito nếu cần hai vai trò cùng lúc.

## 5. Bài thực hành 1 — Tạo yêu cầu bằng tay

1. Đăng nhập `requester@cj.local`.
2. Tại **Tổng quan**, bấm **Tạo yêu cầu mới**.
3. Chọn **Kho Bình Dương**.
4. Kiểm tra địa chỉ, người nhận và số điện thoại.
5. Nhập phòng ban `Vận hành kho`, ghi chú `Mua vật tư đóng gói tuần này`.
6. Bấm **Tiếp tục**.
7. Giữ tab **Nhập thủ công**.
8. Ở dòng đầu, chọn nhà cung cấp **An Phát Supply**.
9. Nhập mặt hàng **Băng keo trong 48mm**. Có thể chọn gợi ý xuất hiện bên dưới ô.
10. Đơn vị **Cuộn** sẽ tự điền khi chọn đúng tên; nhập số lượng **10**.
11. Bấm **Thêm mặt hàng** nếu cần thêm dòng.
12. Để thử tình huống thiếu dữ liệu, thêm `Kệ dụng cụ mới`, ĐVT `Cái`, số lượng `2`.
13. Bấm **Kiểm tra dữ liệu**.
14. Dòng băng keo có trạng thái xanh khi giá mẫu còn hiệu lực; dòng kệ mới sẽ đỏ. Các dòng đỏ hợp lệ vẫn được phép gửi.
15. Chọn **Lưu bản nháp** nếu chưa chắc chắn. Có thể mở lại trong danh sách, bấm **Sửa bản nháp**.
16. Hoặc bấm **Gửi yêu cầu**, đọc hộp xác nhận, bấm **Xác nhận**.
17. Ghi lại mã `PR-...` vừa tạo. Vào **Đơn hàng của tôi** để tìm lại.

Người yêu cầu không thấy đơn giá, VAT, thành tiền, báo giá hoặc lịch sử giá. Máy chủ cũng không trả các trường đó cho tài khoản này.

## 6. Bài thực hành 2 — Tạo yêu cầu từ Excel

1. Bắt đầu yêu cầu mới, chọn đúng kho, bấm Tiếp tục.
2. Chọn tab **Tải lên Excel**.
3. Bấm **Tải mẫu cho [tên kho]**.
4. Mở file tải về bằng Excel. File có một dòng ví dụ; sửa hoặc xóa dòng đó trước khi nhập nhu cầu thật.
5. Giữ tiêu đề ở dòng 1. Điền các cột:

| Cột | Ý nghĩa | Ví dụ |
|---|---|---|
| Warehouse | Mã kho, mọi dòng phải trùng kho đã chọn | `WH-BD` |
| Supplier | Mã NCC; được phép để trống để quản trị xử lý | `SUP-AP` |
| Item | Tên mặt hàng bắt buộc | `Băng keo trong 48mm` |
| UOM | Đơn vị tính bắt buộc | `Cuộn` |
| Quantity | Số lớn hơn 0 | `10` |
| Note | Ghi chú từng dòng | `Giao giờ hành chính` |
| Department | Phòng ban, tùy chọn | `Vận hành kho` |
| Receiver | Người nhận, tùy chọn | `Nguyễn Văn Hùng` |
| Phone | Số điện thoại, nên định dạng Text | `0901234567` |
| RequestedDate | Ngày mong muốn nhận, tùy chọn | `2026-09-25` |

6. Thông tin Department/Receiver/Phone/RequestedDate nếu có phải nhất quán giữa các dòng. Nếu để trống, dùng thông tin biểu mẫu/kho.
7. Không gộp nhiều kho trong một file. Chỉ dùng một sheet có dữ liệu.
8. Không đặt công thức ở các ô nhập; dùng Paste Values. Không để dòng trống xen giữa danh sách mặt hàng.
9. Với số thập phân, dùng ô số Excel; CSV dùng dấu chấm phân cách thập phân, không có dấu tách hàng nghìn.
10. Lưu dạng `.xlsx`. CSV UTF-8 cũng được hỗ trợ; file `.xls` cũ cần lưu lại thành `.xlsx`.
11. Quay lại website, chọn file hoặc kéo thả vào khu vực tải lên.
12. Bấm **Kiểm tra dữ liệu**.
13. Nếu lỗi, đọc chính xác **dòng – cột – vấn đề – cách sửa**, sửa file, lưu rồi chọn lại file.
14. Xem bảng đối chiếu, lưu nháp hoặc gửi yêu cầu.

File gốc được lưu trong cơ sở dữ liệu khi tạo đơn. Nút **Xuất yêu cầu** xuất lại dữ liệu theo mẫu tạm không có giá. Chỉnh sửa bản nháp Excel bằng màn hình thủ công sẽ chuyển nguồn thành MANUAL và thay nội dung đính kèm cũ; đơn đã gửi không cho chỉnh sửa kiểu này.

## 7. Bài thực hành 3 — Quản trị xử lý và tạo PO

1. Đăng xuất Requester, đăng nhập `admin@cj.local`.
2. Chọn **Tất cả đơn hàng**, tìm mã yêu cầu vừa tạo.
3. Mở đơn, bấm **Tiếp nhận xử lý**.
4. Kiểm tra tab **Mặt hàng & giá**.
5. Nếu có dòng đỏ, vào **Dữ liệu danh mục** bổ sung dữ liệu ở phần 8, rồi quay lại đơn.
6. Bấm **Đối chiếu** tại dòng cần xử lý. Chọn sản phẩm đúng đơn vị tính và nhà cung cấp.
7. Nếu tên nhập là tên thay thế hợp lệ, có thể đánh dấu **Ghi nhớ tên gốc như tên thay thế đã duyệt**.
8. Nếu chưa có giá, bấm **Chờ bổ sung giá**; sau đó nhập giá và tiếp tục.
9. Khi toàn bộ dòng xanh, bấm **Xác nhận đủ giá**.
10. Mở tab **Purchase Order**.
11. Đọc thông báo mẫu tạm. Bấm **Chốt giá & tạo PO mẫu UAT**, xác nhận.
12. Hệ thống lưu price snapshot và tạo một file cho mỗi NCC trong đơn. Không trộn hàng giữa các kho.
13. Bấm tên file để tải Excel về máy.
14. Kiểm tra thông tin NCC, kho nhận, người nhận, số lượng, giá, VAT và tổng.
15. Nếu cần thử trạng thái gửi, thực hiện gửi thủ công bên ngoài website rồi bấm **Đánh dấu đã gửi NCC**. Nút này không tự gửi email.
16. Khi kết thúc quy trình, bấm **Hoàn tất đơn**.

Sau khi tạo PO, sửa Price Master không làm thay đổi giá chốt hoặc file PO đã có. Không thể sửa mặt hàng hoặc tạo lại PO trên đơn đó. Quy trình hủy/thay thế PO sau khi đã phát hành cần thiết kế revision bổ sung trước production.

## 8. Thêm/sửa danh mục

1. Đăng nhập Admin, chọn **Dữ liệu danh mục**.
2. Chọn Kho hàng / Nhà cung cấp / Sản phẩm / Bảng giá / Tên thay thế.
3. Bấm **Thêm bản ghi**.
4. Nhập mã ổn định, ví dụ `SP-006`, tên `Kệ dụng cụ mới`, đơn vị `Cái`, trạng thái `ACTIVE`.
5. Bấm **Lưu dữ liệu**.
6. Mở tab **Bảng giá**, thêm:
   - Mã: `PRICE-SP-006`.
   - Mã nhà cung cấp: `SUP-AP`.
   - Mã sản phẩm: `SP-006`.
   - Đơn vị: `Cái` (phải trùng sản phẩm).
   - Đơn giá: `1500000` (nhập số, không dấu tách hàng nghìn).
   - VAT: `10` nghĩa là 10%.
   - Tiền tệ: `VND`.
   - Hiệu lực từ: ngày hôm nay hoặc trước đó.
   - Hiệu lực đến: để trống nếu chưa có ngày kết thúc.
   - Số báo giá: thông tin tham chiếu, ví dụ `BG-2026-001`.
   - Trạng thái: `ACTIVE`.
7. Không tạo hai khoảng giá đang hoạt động chồng nhau cho cùng NCC/sản phẩm/ĐVT.
8. Muốn chỉnh bản ghi, bấm **Sửa**. Mã của bản ghi không đổi.
9. Muốn ngừng sử dụng, sửa trạng thái thành `INACTIVE`; không xóa bản ghi đã được tham chiếu.

## 9. Nhập nhiều bản ghi danh mục

1. Vào **Nhập dữ liệu**.
2. Chọn loại danh mục cần nhập.
3. Bấm **Tải Excel danh mục hiện tại** để lấy đúng cấu trúc và mã đã có.
4. Chỉnh file, chọn lại file trên website.
5. Bấm **Đọc file & ánh xạ cột**.
6. Nếu tên cột khác, chọn cột nguồn cho từng trường đích. Ví dụ cột `Ma` ánh xạ sang `code`.
7. Bấm **Kiểm tra bản xem trước**.
8. Xem số dòng tạo mới/cập nhật/trùng mã/không hợp lệ. Mã có sẵn là cập nhật, không phải tạo thêm.
9. Sửa hết lỗi trước khi nhập.
10. Bấm **Xác nhận nhập**, rồi xác nhận trong hộp thoại.
11. Nếu một dòng xung đột khi nhập, toàn bộ batch bị hoàn tác; không lưu nửa chừng.
12. Xem **Lịch sử nhập** và **Nhật ký hệ thống**.

Thứ tự nhập: **Kho → Nhà cung cấp → Sản phẩm → Bảng giá → Tên thay thế**. Bảng giá/tên thay thế cần mã sản phẩm và NCC đã tồn tại.

## 10. Sao lưu dữ liệu

1. Dừng website bằng **Ctrl + C** để SQLite đóng và hoàn tất ghi dữ liệu.
2. Trong File Explorer, sao chép **toàn bộ thư mục `data`** sang thư mục sao lưu, đặt tên kèm ngày, ví dụ `backup-2026-09-17`.
3. Sao lưu cả `.env` ở nơi an toàn nếu có cấu hình riêng.
4. Không chỉ sao chép file `.sqlite` trong lúc ứng dụng đang chạy: chế độ WAL có thể còn dữ liệu trong các file phụ.
5. Muốn khôi phục, dừng website, giữ một bản sao dữ liệu hiện tại rồi thay thư mục `data` bằng bản sao lưu, chạy lại.

Muốn làm lại dữ liệu mẫu hoàn toàn: dừng website, **đổi tên** `data` thành `data-backup` (giữ để khôi phục), rồi chạy lại. Ứng dụng tự tạo DB và tài khoản mẫu mới. Không thực hiện nếu chưa sao lưu dữ liệu cần giữ.

## 11. Kiểm thử tự động

Trong Terminal tại thư mục dự án:

```powershell
npm.cmd test
```

Hoặc dùng portable trên máy hiện tại:

```powershell
& '..\.tools\node-v24.14.0-win-x64\node.exe' --test test/workflow.test.js
```

Kiểm thử dùng SQLite trong bộ nhớ và cổng ngẫu nhiên, **không sửa DB đang sử dụng**. Bao gồm đăng nhập, phân quyền, cách ly đơn giữa người dùng, kiểm tra Excel, chống gộp kho, thiếu mặt hàng, chuyển trạng thái, alias, snapshot, tách PO theo NCC, nhập transactional và audit.

## 12. Các lỗi thường gặp

| Hiện tượng | Cách xử lý |
|---|---|
| `node` / `npm` không được nhận diện | Cài Node 24 và mở lại Terminal; hoặc dùng START-WEBSITE với Node portable đã có. |
| PowerShell báo `npm.ps1 cannot be loaded` | Dùng `npm.cmd`, không cần hạ chính sách bảo mật PowerShell. |
| `Cannot find package 'exceljs'` | Mở đúng thư mục rồi chạy `npm.cmd ci`. |
| `EADDRINUSE` / cổng 3000 đang dùng | Dừng cửa sổ website cũ hoặc đổi `PORT=3001` trong `.env`; truy cập địa chỉ có cổng 3001. |
| Trình duyệt không kết nối | Kiểm tra Terminal còn chạy, URL dùng `http`, địa chỉ `127.0.0.1` và đúng cổng. |
| Không đăng nhập được sau đổi `.env` | Mật khẩu `.env` không thay đổi người dùng đã tồn tại; dùng mật khẩu đã khởi tạo. |
| Đăng nhập lại sau khi dừng/mở máy chủ | Bình thường: phiên đăng nhập nằm trong bộ nhớ. |
| Excel thiếu cột hoặc sai kho | Tải mẫu từ bước chọn kho; giữ header và đúng mã kho trên mọi dòng. |
| Giá vẫn thiếu | Kiểm tra mã NCC/sản phẩm/ĐVT, trạng thái ACTIVE và ngày hiệu lực. |
| Không bấm được Xác nhận đủ giá | Tất cả mặt hàng phải khớp và có giá hiệu lực. |
| Trạng thái/giá vừa thay đổi ở cửa sổ khác | Tải lại trang bằng Ctrl + R. |
| Không mở được website từ điện thoại/máy khác | Bản này chủ động chỉ lắng nghe localhost. Cần bước triển khai production để dùng qua mạng. |

## 13. Giới hạn cần hoàn thiện trước khi dùng thật

- Chưa có Ordering Template và PO Form chính thức; hiện dùng mẫu tạm, chưa đạt AC-13 về đúng PO Form doanh nghiệp.
- Chưa kết nối Microsoft Entra ID/SSO, quản lý tài khoản, cấp quyền theo phòng ban/kho hoặc đổi mật khẩu.
- Thông báo hiện nằm trong website; không gửi email và không gửi PO tự động.
- Chưa có upload file báo giá, đa tiền tệ, phê duyệt nhiều cấp, revision PO sau phát hành, bảng thời gian từng trạng thái hoàn chỉnh.
- SQLite và phiên trong bộ nhớ phù hợp chạy thử đơn máy; cần thiết kế cơ sở dữ liệu tập trung, quản lý phiên, HTTPS, giới hạn tài nguyên parser Excel, backup định kỳ, giám sát, khôi phục và kiểm thử tải trước production.
- Dữ liệu mẫu chỉ để minh họa, tên/địa chỉ/thông tin liên hệ không phải danh mục công ty đã được xác nhận.
- Logo chữ CJ trong giao diện là hình dựng bằng CSS để minh họa; cần thay bằng brand asset chính thức trước phát hành.

Xem `docs/PHAM-VI-VA-UAT.md` để đối chiếu từng tiêu chí và kế hoạch nghiệm thu.
