# Tu Tập — Quy chuẩn giao diện

Tài liệu riêng của dự án, bổ sung theo yêu cầu người dùng ngày 26/10/2026.
Tham khảo cấu trúc mô tả phong cách, typography, tokens và components của
[getdesign.md](https://getdesign.md/) và
[Awesome DESIGN.md](https://github.com/VoltAgent/awesome-design-md).
Đây không phải mẫu thương hiệu tải từ website: các quyết định bên dưới lấy từ
[hướng dẫn hiện có](docs/design-guidelines.md) và
[nguồn tokens](src/lib/styles/tokens.css) của Tu Tập.

## Phong cách

Giữ cảm giác an tĩnh, dễ đọc, nền kem và điểm nhấn vàng sa-frăng, chữ nâu.
Nội dung pháp thoại và tu tập là trọng tâm; không thêm hiệu ứng, ảnh hoặc font
chỉ để trang trí. Giữ nhận diện tím riêng của màn thiền hiện có.
Không sao chép logo, tên thương hiệu, nội dung hoặc bảng màu của mẫu khác.

## Tokens và typography

- Màu: dùng `--bg`, `--bg2`, `--bg3`, `--card`, `--text`, `--text2`, `--muted`,
  `--border`, `--border2`, `--gold`, `--gold2`, `--gold-light`, `--gold-muted`.
- Nút nền vàng dùng chữ `--on-gold`; lỗi dùng `--danger-text` cùng thông báo chữ.
- Font UI: `--font-app` (Be Vietnam Pro đã đóng gói); nội dung đọc: `--font-reader`.
  Input và button kế thừa font. Không thêm font hoặc tải font từ CDN.
- Bo góc dùng `--radius`, `--radius-sm`, `--radius-card`, `--radius-control`
  theo component tương ứng; khoảng cách trang dùng `--space-page`.
- Motion dùng các token `--motion-*`, `--ease-standard`; tôn trọng reduced motion.
- Mọi giá trị token chỉ định nghĩa tại `src/lib/styles/tokens.css`; component
  tham chiếu biến, không tạo bảng màu hoặc theme song song. Nếu thiếu token,
  ưu tiên component/giá trị gần nhất hiện có và báo rõ trước khi thêm.

## Layout và components

- Giữ shell, sticky header, bottom navigation và footer tại owner hiện có.
- Tái sử dụng button, card, dialog và trạng thái loading/empty/error/offline
  trong domain; không đổi props, events hoặc cơ chế điều hướng chỉ để thay style.
- Lời nhắc ngắn dùng nền và border nhẹ, chữ dễ đọc; hành động phải ghi rõ đích.
  Không tự thực hiện tải xuống khi người dùng chỉ mở album hoặc bấm xem hướng dẫn.
- Nội dung UI đặt trong i18n owner, hỗ trợ Việt/Anh, co giãn khi chữ dài.
- UI tĩnh không tạo request, polling, refresh session hoặc invalidation mới.

## Mobile và accessibility

- Safe area: giữ `env(safe-area-inset-*)` và owner safe-area của app.
- Vùng chạm tối thiểu 44×44px; keyboard focus nhìn thấy, không dùng hover làm
  tương tác duy nhất. Nút có tên rõ; khi dẫn tới control khác phải chuyển focus.
- Giữ focus trap, Escape/Back và trả focus của dialog hiện có.
- Đáp ứng màn hình khoảng 375px và desktop; không tràn ngang, không che bàn phím.
- Kiểm tra sáng/tối bằng tokens đã có. Quy tắc mobile tại AGENTS.md mục 4.6
  được ưu tiên nếu có mâu thuẫn với mẫu web.

## Kiểm tra khi sửa UI

Đọc file này cùng docs/design-guidelines.md và tokens trước khi sửa.
Kiểm tra nội dung, trạng thái, keyboard, mobile/desktop và sáng/tối theo phạm vi;
chạy các gate code tại AGENTS.md. Không coi mock/browser là xác minh native thật.
