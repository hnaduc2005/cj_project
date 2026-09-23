# Kiểm thử quy trình thông báo đơn hàng

- 14/14 kiểm thử tự động đạt: email-only login, dữ liệu, PO, phân quyền và luồng email mới.
- Requestor phải gửi lựa chọn boolean rõ ràng; thiếu lựa chọn bị từ chối.
- Kiểm tra email bổ sung bằng dấu ;, loại trùng không phân biệt hoa thường, từ chối dấu phẩy, email sai và khoảng trống giữa hai dấu ;.
- Không chọn gửi: không có email trong outbox, đơn vẫn SUBMITTED.
- Chọn gửi: đúng sender Requestor, manager + Admin + email bổ sung; không có link phê duyệt, không chứa giá.
- Manager không xem được đơn người khác; API duyệt cũ trả 410.
- Thiếu manager: chỉ email bị BLOCKED_DATA; Admin vẫn tiếp nhận và có thể bổ sung email rồi retry.
- Admin tạo PO đúng FORM PO ngay sau khi hoàn thiện dữ liệu, không đợi manager.
- Chrome: nhập email Requestor, xác nhận gửi và thêm người nhận, manager không có menu duyệt, Admin tiếp nhận/phát hành PO; không có lỗi JavaScript.

Email và Microsoft trong kiểm thử đều giả lập, không phải bằng chứng đã gửi thư thật.

- Migration đã kiểm thử: giữ đơn cũ, chuyển PENDING_APPROVAL sang SUBMITTED, hủy hàng đợi duyệt cũ chưa gửi và ghi nhật ký chuyển đổi.
