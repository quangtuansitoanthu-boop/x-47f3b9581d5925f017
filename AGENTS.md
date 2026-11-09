# AGENTS.md — Quy tắc làm việc cho Codex

Dự án: app **Svelte 5/SvelteKit 2 (web Cloudflare, mobile static/SPA) + Capacitor 7**, chạy trên **Web, Android, iOS** từ cùng một codebase.

> Đặt file này ở thư mục gốc repo. Codex tự đọc `AGENTS.md` trước khi làm việc.
> Áp dụng cho toàn bộ tutam-mobile và các phiên sau. Đây là bộ quy tắc làm việc của dự án; không ghép lại bộ quy tắc cũ. Thông tin mẫu đã được đối chiếu với repository.

---

## 0. Nguyên tắc vàng

1. **Đọc trước, sửa sau.** Trước khi sửa, đọc file liên quan và các file import nó. Không đoán cấu trúc.
2. **Thay đổi nhỏ nhất đủ giải quyết vấn đề.** Không refactor, đổi tên, format lại file ngoài phạm vi yêu cầu.
3. **Không tự thêm dependency.** Cần thư viện mới → dừng lại, nêu lý do + lựa chọn thay thế, chờ tôi đồng ý.
4. **Không bịa API.** Không chắc API của Svelte/Capacitor/plugin → đọc `node_modules`, đọc docs trong repo, hoặc hỏi. Không viết theo trí nhớ.
5. **Mọi thay đổi phải chạy được trên cả 3 nền tảng** (web, Android, iOS), trừ khi tôi nói rõ chỉ nhắm một nền tảng.
6. **Báo cáo trung thực.** Nếu chưa chạy test/build thì nói "chưa chạy", không nói "đã hoạt động".
7. **Tối ưu request D1 cho mọi tính năng.** Làm bất cứ công cụ/màn hình nào có truy cập dữ liệu, phải tính số request và số dòng D1 *trước khi code*. Chi tiết ở mục 5c.
8. **Chống hồi quy là điều kiện hoàn tất.** Mọi thay đổi phải giữ contract, dữ liệu và luồng cũ bị ảnh hưởng, kể cả bản app đã cài. Xác minh bằng baseline và kiểm tra theo rủi ro; không hứa tuyệt đối không có lỗi. Chi tiết ở mục 5d.
9. **Bảo vệ dự án `tutam-main`.** Việc chỉnh sửa app này chỉ được thực hiện trong phạm vi `tutam-mobile`, không được sửa, xóa, ghi đè hoặc gây ảnh hưởng trực tiếp hay gián tiếp đến thư mục/dự án `tutam-main` khi chưa được người dùng đồng ý. Trước mọi thao tác có thể ảnh hưởng đến `tutam-main` (kể cả qua script, liên kết thư mục, tài nguyên, cấu hình hoặc backend/dữ liệu dùng chung), phải nêu rõ file/thành phần bị ảnh hưởng, thay đổi dự kiến và tác động, rồi hỏi người dùng có cho phép phạm vi đó hay không. Chỉ thực hiện phần ảnh hưởng sau khi nhận được xác nhận rõ ràng; không coi yêu cầu sửa app hoặc sự im lặng là cho phép sửa `tutam-main`. Có thể đọc/tham khảo `tutam-main` khi cần nhưng không được ghi thay đổi nếu chưa được cho phép.

---

## 0b. Không lãng phí

- Làm **đúng yêu cầu**. Không thêm tính năng, lớp trừu tượng, tùy chọn cấu hình "phòng hờ". Chọn cách đơn giản nhất chạy đúng.
- **Dùng lại trước khi viết mới:** component, hàm tiện ích, plugin Capacitor, API của nền tảng. Thư viện mới chỉ thêm khi thật đáng (kích thước bundle, chi phí bảo trì); thay được bằng vài dòng code thì không thêm.
- **Tiết kiệm ngữ cảnh:** tìm kiếm có mục tiêu rồi chỉ đọc đoạn cần, không đọc lại thứ đã đọc, không in file hay log dài (lọc đầu ra bằng `grep`/`tail`). Chỉ nạp skill, MCP, tài liệu khi việc đó cần.
- **Kiểm tra tương xứng:** chỉ sửa tài liệu/comment thì không cần build. Sửa code thì chạy đủ mục 6.
- **Tài nguyên chạy:** không thêm request mạng/D1, ảnh, font, animation, re-render khi không cần. Đo trước khi tối ưu, riêng D1 thì luôn thiết kế tối ưu từ đầu (mục 5c).
- **Báo cáo ngắn gọn:** nêu đã làm gì, kiểm tra gì, còn thiếu gì. Không dán lại code đã sửa hay giải thích điều hiển nhiên.
- Không tạo file, tài liệu, test thừa ngoài yêu cầu. Xóa file tạm do mình tạo.
- **Tiết kiệm không được đổi lấy an toàn:** không bỏ test, kiểm tra tương thích ngược hay bảo mật để cho nhanh.

---

## 0c. Tham khảo thay đổi `tutam-main` mỗi ngày

- **Trước khi triển khai một tính năng hoặc yêu cầu mới**, kiểm tra nhật ký rà soát `tutam-main` của ngày hiện tại theo giờ Việt Nam (`Asia/Ho_Chi_Minh`). Mục đích là tìm các bản sửa lỗi, cách kiểm tra hồi quy và cải tiến có thể áp dụng cho `tutam-mobile` để đề xuất với người dùng.
- **Chỉ rà `tutam-main` một lượt mỗi ngày**, vào nhiệm vụ đầu tiên cần triển khai trong ngày; không tạo lịch chạy nền. Lưu kết quả UTF-8 tại `docs/journals/tutam-main/YYYY-MM-DD.txt` **trong `tutam-mobile`**. Các nhiệm vụ/phiên tiếp theo cùng ngày đọc lại log này, không quét lại main, trừ khi người dùng yêu cầu rõ ràng kiểm tra lại. Log ngày không thay thế log bàn giao từng phiên tại mục 10.
- Khi chưa có log ngày: đọc log rà soát gần nhất, xác định đúng checkout `../tutam-main`, rồi chỉ đọc lịch sử Git, trạng thái và diff cần thiết. So sánh với mốc main đã ghi ở lượt trước; tính cả thay đổi chưa commit. Nếu là lượt đầu, ghi rõ chưa có baseline, xem lịch sử gần đây có giới hạn và lập mốc, không tự coi toàn bộ main là thay đổi mới hay quét lại toàn bộ repository.
- Log ngày ghi tối thiểu: thời gian, đường dẫn main, HEAD/mốc so sánh, phạm vi đã đọc; commit/file thay đổi và thay đổi chưa commit; bản sửa lỗi/kiểm thử/cải tiến đáng chú ý; phần tương ứng ở mobile, lợi ích, rủi ro tương thích web/Android/iOS, dữ liệu/API/D1 và đề xuất áp dụng; trạng thái đã đề xuất/được chọn/đã áp dụng/còn chờ. Ghi nguồn bằng commit/path cụ thể, không chép secret, dữ liệu cá nhân hay nội dung `.env`.
- Đối chiếu log ngày với yêu cầu và source mobile hiện tại rồi đề xuất ngắn các điểm liên quan; không áp dụng máy móc, không giả định hai repository có cùng commit hoặc contract. Không tự đưa thêm tính năng/cải tiến ngoài nhiệm vụ đã được giao; phần được chọn vẫn phải tuân thủ duyệt UI/UX, kiểm tra tương thích và gate hiện có. Nếu không có điểm phù hợp, ghi rõ kết quả đó và tiếp tục nhiệm vụ.
- Rà soát là **chỉ đọc**, giữ nguyên quy tắc bảo vệ main tại mục 0.9: không sửa main, không fetch/pull/checkout/reset/stash, cài dependency hoặc chạy script/build/test/migration của main. Với Git, ưu tiên `git --no-optional-locks -C <main> ...` để tránh ghi cập nhật index ngoài ý muốn. Không tác động backend/dữ liệu dùng chung; việc ghi log không phải quyền sửa main hay triển khai production.
- Nếu không truy cập được main hoặc chưa rà đủ: ghi trạng thái chưa hoàn tất/lý do/phạm vi chưa kiểm chứng vào log ngày; không báo đã rà thành công. Các phiên cùng ngày dùng lại thông tin này và báo giới hạn; không tự lặp quét main. Nếu thiếu thông tin đó làm nhiệm vụ không thể triển khai an toàn, nêu rõ phần bị chặn với người dùng.

---

## 1. Tech stack (không tự ý đổi)

- Framework: Svelte 5 + SvelteKit 2. Web dùng `adapter-cloudflare`; mobile dùng `adapter-static` khi `CAPACITOR_BUILD=1`. Giữ SSR web và cơ chế SPA mobile hiện có; không đặt `ssr = false` toàn dự án.
- Native wrapper: Capacitor 7 (phiên bản cụ thể theo `package.json` và `package-lock.json`) (Android + iOS)
- Ngôn ngữ: TypeScript strict theo `tsconfig.json`; giữ các module JavaScript hiện có, không tự chuyển đổi ngoài nhiệm vụ.
- Package manager: npm + `package-lock.json`, Node.js 24. **Chỉ dùng một loại**, không tạo/cập nhật lockfile khác; không tự xóa `bun.lock` có sẵn.
- Backend/dữ liệu: **Cloudflare** — D1 (SQL) + R2 (file), truy cập qua API SvelteKit trên Cloudflare Workers; scheduled Worker riêng ở `src/jobs/`
- Style: CSS với tokens tại `src/lib/styles/tokens.css`; hướng dẫn ở `docs/design-guidelines.md`.

---

## 2. Cấu trúc thư mục

```
src/
  routes/            # trang (SvelteKit)
  lib/
    components/      # UI dùng lại
    stores/          # state toàn cục
    browser/         # API client, browser/native wrappers và lifecycle
    domain/          # logic nghiệp vụ thuần
    server/          # auth, services, repositories và integrations phía server
    contracts/       # contract dùng chung
    i18n/            # nội dung và bản dịch
    styles/          # tokens và CSS theo domain
    utils/           # hàm thuần, không phụ thuộc UI
    types/           # kiểu dùng chung
static/              # asset tĩnh
android/  ios/       # project native do Capacitor sinh
src/worker/          # module domain/API dùng chung, không là web runtime thứ hai
src/jobs/            # scheduled Worker
capacitor.config.ts
docs/design-guidelines.md  # hướng dẫn thiết kế hiện có
docs/                # kiến trúc, API contract, code standards và deployment guide
```

- Component UI **không** import trực tiếp `@capacitor/*`. Truy cập native qua wrapper tại `src/lib/browser/`; không di chuyển các module có sẵn hoặc tạo lại cấu trúc chỉ để khớp mẫu.
- Logic nghiệp vụ dùng owner hiện có ở `src/lib/domain/` và `src/lib/server/services/`, không nhét vào component; không import server code vào client.

---

## 3. Quy tắc Svelte

- Dùng cú pháp **Svelte 5 runes** (`$state`, `$derived`, `$effect`, `$props`) nếu dự án đang ở Svelte 5. **Không trộn** cú pháp Svelte 4 (`export let`, `$:`) vào file mới.
- Component nhỏ, một trách nhiệm. File component quá ~200 dòng → đề xuất tách, đừng tự tách khi chưa được yêu cầu.
- Tránh `$effect` khi có thể dùng `$derived`. `$effect` phải dọn dẹp (return cleanup) khi tạo listener/timer.
- Không thao tác DOM thủ công nếu dùng `bind:` / action / `{#if}` làm được.
- Danh sách `{#each}` luôn có key khi item có id: `{#each items as item (item.id)}`.
- Không dùng `{@html}` với dữ liệu không tin cậy.
- Truy cập `window`, `document`, `localStorage` chỉ trong `onMount` hoặc sau kiểm tra `browser` (`$app/environment`).

---

## 3b. Giao diện — theo `getdesign.md`

Toàn bộ quy chuẩn giao diện tuân thủ theo `getdesign.md` kết hợp cùng nguồn token tại `src/lib/styles/tokens.css` và hướng dẫn `docs/design-guidelines.md`.
Chỉ dùng `npx getdesign add <slug>` khi người dùng yêu cầu đổi/chọn phong cách; không tự tải thiết kế trong tác vụ khác.

- **Trước khi viết hoặc sửa bất kỳ UI nào, đọc `getdesign.md`.** Tuyệt đối không làm UI khi chưa đọc.
- **Duyệt UI/UX trước khi code mọi chức năng mới có giao diện, kể cả chức năng nhỏ:** tạo bản xem trước trực quan (mockup hoặc prototype tách biệt) theo hệ thống thiết kế hiện có, thể hiện bố cục mobile/desktop, nội dung chính, luồng thao tác và trạng thái liên quan. Trình người dùng duyệt và chờ xác nhận rõ ràng trước mọi code triển khai chức năng vào ứng dụng, gồm UI/API/service liên quan; trong lúc chờ chỉ nghiên cứu/chuẩn bị bản xem trước, không coi im lặng là đồng ý. Chức năng không có giao diện và không thay đổi trải nghiệm người dùng ghi N/A, không tạo UI giả để đủ bước.
- **Code phải bám sát UI/UX đã duyệt:** giữ bố cục, token/component, nội dung, điều hướng, tương tác, trạng thái và hành vi responsive đã chốt; không tự đổi hoặc "cải tiến" thiết kế. Nếu có hạn chế kỹ thuật, mâu thuẫn với hệ thống hiện có hoặc cần khác bản duyệt, nêu rõ khác biệt/lý do và chờ người dùng duyệt phần thay đổi trước khi triển khai phần phụ thuộc. Bản xem trước không tự cấp quyền thêm dependency, đổi token/brand hoặc phá contract.
- Đưa token trong `getdesign.md` thành CSS variables (hoặc theme Tailwind) **một lần duy nhất** tại nguồn hiện có `src/lib/styles/tokens.css`. Component chỉ dùng biến, **không hardcode** màu, font, spacing.
- Cần giá trị mà `getdesign.md` không có → chọn giá trị gần nhất trong hệ thống hiện có và báo tôi. Không tự thêm màu/font mới.
- Component mới phải khớp quy tắc component trong `getdesign.md` (nút, input, card, modal...). Có component tương tự rồi thì dùng lại, đừng viết trùng.
- `getdesign.md` được viết cho **web**. Khi áp vào app mobile, vẫn phải giữ quy tắc ở mục 4.6: safe area, vùng chạm >= 44px, bàn phím ảo, không phụ thuộc hover. Nếu mâu thuẫn, **mục 4.6 thắng**, và ghi chú lại chỗ mâu thuẫn.
- Chỉ lấy **phong cách** (màu, bố cục, cảm giác). **Không** chép logo, tên thương hiệu, hay nội dung của brand mẫu vào app.
- Không sửa, xóa, ghi đè `getdesign.md` khi chưa được yêu cầu. Muốn đổi phong cách → tôi chạy lại lệnh `getdesign add`.
- Sau khi làm UI, kiểm tra ở khổ điện thoại (~375px) và màn hình rộng, và chế độ sáng/tối nếu `getdesign.md` có định nghĩa.

---

### Trình bày nội dung kinh, chú và nghi thức

- **Khổ kệ, thơ, lời tán tụng viết thành từng dòng: căn giữa**, giữ đúng thứ tự dòng và cách chia khổ; không gộp thành văn xuôi hoặc căn đều hai bên.
- **Đoạn văn xuôi, lời hướng dẫn và phần giải thích: căn đều hai bên**. Phân biệt theo cấu trúc nội dung; không coi mọi dòng xuống hàng do khổ giấy PDF là một câu kệ riêng.
- **Tiêu đề: in đậm và căn giữa; tên tất cả bài kinh, chú và nghi thức trong Tu tập phải VIẾT HOA TOÀN BỘ**, giữ đầy đủ dấu tiếng Việt. Áp dụng nhất quán ở danh sách, thẻ nội dung, màn đọc và bản đóng offline; không chuyển toàn bộ phần thân bài thành chữ hoa. Kế thừa font đọc hiện có của web/app, không gắn font riêng từ tài liệu nguồn; kiểm tra bố cục trên điện thoại, không gây tràn ngang.
- Không chèn link nguồn vào nội dung hiển thị của kinh, chú hoặc nghi thức; nguồn tham khảo chỉ lưu trong ghi chú quản trị hoặc nhật ký nội bộ.
- Bỏ ký hiệu chuông **`(C)`** khỏi nội dung hiển thị. Không xóa các chỉ dẫn hoặc số lần đọc khác trong ngoặc.
- **Mọi nội dung trong ngoặc đơn phải in nghiêng, kể cả dấu ngoặc**, ví dụ *(3 lần)*, *(1 lạy)* hoặc chỉ dẫn thao tác; áp dụng cả phần hướng dẫn và bài tụng. Giữ nguyên lời và số lần thực hành, tránh lồng thẻ in nghiêng trùng nhau.

---

## 4. Quy tắc Capacitor & đa nền tảng (quan trọng nhất)

### 4.1 Phát hiện nền tảng
- Dùng `Capacitor.isNativePlatform()` và `Capacitor.getPlatform()` (`'web' | 'android' | 'ios'`).
- **Không** đoán nền tảng bằng `navigator.userAgent`.

### 4.2 Lớp trừu tượng native (hiện ở `src/lib/browser/`)
Mỗi tính năng native có một module bọc, luôn có **fallback cho web**. Ví dụ `shareText()`: native thì dùng Capacitor Share, không thì Web Share API, không có nữa thì copy vào clipboard.

- Plugin không hỗ trợ web → viết fallback hoặc ẩn tính năng đó trên web (kèm comment vì sao).
- Mọi lệnh gọi plugin phải có `try/catch` và xử lý trường hợp người dùng từ chối quyền.

### 4.3 Quyền (permissions)
- Chỉ xin quyền **khi cần dùng**, không xin lúc mở app.
- Khi thêm tính năng cần quyền, cập nhật **đủ**:
  - Android: `android/app/src/main/AndroidManifest.xml`
  - iOS: `ios/App/App/Info.plist` (các khóa `NS...UsageDescription`, viết mô tả rõ lý do)
- Nhắc tôi rằng cần test quyền trên thiết bị thật.

### 4.4 Lưu trữ
- Dữ liệu nhỏ, không nhạy cảm: giữ storage owner và storage keys hiện có. `@capacitor/preferences` chỉ dùng sau khi được duyệt cài; không tự thêm dependency.
- **Token/secret: không** lưu `localStorage`. Giữ contract session cookie HttpOnly và credentials trong bộ nhớ hiện có. Nếu cần lưu bí mật bền vững trên native, đề xuất secure-storage plugin tương thích Capacitor 7 và chờ duyệt trước khi cài.
- Không hardcode API key/secret trong code client. Chỉ dùng biến môi trường public (`PUBLIC_*`) và khóa anon/public.

### 4.5 Điều hướng & vòng đời
- Xử lý nút Back của Android (`@capacitor/app` → `backButton`).
- Xử lý app vào nền/quay lại (`appStateChange`), deep link (`appUrlOpen`) nếu có dùng.
- Không dùng `window.location.href` để chuyển trang trong app. Dùng `goto()` của SvelteKit.

### 4.6 Giao diện mobile
- Tôn trọng **safe area** (notch, thanh home): dùng `env(safe-area-inset-*)`.
- Vùng chạm tối thiểu **44×44px**.
- Xử lý bàn phím ảo (input không bị che).
- Không dùng `hover` làm tương tác duy nhất.
- Test cả chế độ sáng/tối nếu app hỗ trợ.

### 4.7 Cấu hình
- `capacitor.config.ts` là nguồn cấu hình duy nhất. **Không** sửa tay `capacitor.config.json` đã sinh.
- Không bật `server.url` (live reload) trong bản build release. Nếu cần dev, tách theo biến môi trường.
- `appId` và `appName`: **không đổi** sau khi đã phát hành.

---

### 4.8 Widget màn hình chính và học từ mã nguồn mở

- Nguồn và kết quả nghiên cứu: [docs/capacitor-widget-research.md](docs/capacitor-widget-research.md). Khi học từ repo khác, ghi commit/path, xác minh thực sự dùng Capacitor, giấy phép và phiên bản; phân biệt app thực tế, app mẫu, plugin và shortcut. Học nguyên tắc, không chép dependency/cấu hình Capacitor major mới hoặc code có giấy phép không tương thích. Không mặc định repo nhiều sao có implementation phù hợp.
- Widget native là bề mặt riêng: Android hiện dùng `AppWidgetProvider`/`RemoteViews`, iOS dùng SwiftUI/WidgetKit; Capacitor chỉ làm bridge và điều hướng. Giữ owner snapshot/lifecycle hiện có; không nhúng web UI, thêm store/player/session thứ hai hoặc chuyển sang Glance/plugin mới chỉ để đổi giao diện. Web giữ fallback và hành vi hiện có.
- Trước khi sửa giao diện widget, trình duyệt theo mục 3b: mockup từng cỡ Small/Medium/Large, sáng/tối, có dữ liệu/thiếu dữ liệu/dữ liệu cũ và luồng khi chạm. Mỗi cỡ có thứ bậc nội dung riêng, không thu nhỏ toàn bộ màn app. Small ưu tiên một thông tin hoặc hành động chính; cỡ lớn chỉ thêm nội dung thực sự hữu ích. Không dùng vòng tiến độ, biểu đồ, phần trăm hoặc số 0 thay cho dữ liệu chưa tồn tại; thiếu dữ liệu phải có hành động có ích, không chỉ một vùng trống lớn. Dữ liệu minh họa phải ghi rõ trong bản duyệt, không đưa vào bản chạy.
- Giữ token/nhận diện đã duyệt; native ánh xạ token sang resource/Swift có nguồn đối chiếu, không lập bảng màu tùy ý. Android kiểm tra vùng bấm tối thiểu 48dp; iOS giữ tối thiểu 44pt khi nền tảng cho phép tương tác. Đọc rõ trên nền màn hình chính, có nhãn trợ năng, không dùng emoji/màu làm dấu hiệu duy nhất; kiểm tra chữ lớn, tương phản, hệ thống tint khi hỗ trợ. Không dùng ảnh chụp HTML làm bằng chứng widget native.
- Snapshot tối thiểu, có version/date/timezone/freshness và principal scope phù hợp; không lưu token, URL có credentials hoặc thông tin riêng không cần thiết. Giữ tương thích snapshot cũ, dọn snapshot riêng khi logout/đổi tài khoản và chặn ghi muộn của principal cũ. Ngày mới không được mang tiến độ hôm qua sang hôm nay; không clear dữ liệu tu tập/offline gốc để sửa widget.
- Hiển thị/resize/theme/đọc snapshot mặc định tăng **0 HTTP API, 0 lượt D1, 0 SQL, 0 rows**. Đồng bộ khi dữ liệu owner thay đổi, coalesce/dedupe và invalidate đúng widget; không fetch theo từng instance/cỡ hay polling JS nền. iOS dùng timeline cho mốc dự đoán được và reload khi dữ liệu đổi; thời điểm refresh do hệ điều hành quyết định. Android `updatePeriodMillis` không hỗ trợ dưới 30 phút; không coi timer/WorkManager là bảo đảm cập nhật đúng phút. Media HTTP khi phát audio và request app khi mở deep link phải hạch toán riêng, không gọi tổng chi phí bằng 0.
- Chạm phải vào đúng công cụ/nội dung/ngày qua contract deep link hiện có, kiểm tra cold/warm start và phiên chưa sẵn sàng. Nút mở công cụ không được giả làm đánh dấu hoàn thành; widget audio dùng player owner và khả năng native thật, không mở player song song hoặc tự ghi nhận công phu. Interactive WidgetKit phải kiểm tra availability theo iOS thực tế và có fallback mở app.
- Điều kiện bàn giao khi sửa widget: kiểm tra native từng cỡ, resize/portrait/landscape (Android API 31+ xét danh sách kích thước hợp lệ, không ghép minWidth/minHeight độc lập), sáng/tối/chữ lớn, nhiều instance, app đóng/process death, offline, qua ngày, đổi tài khoản, deep link và thao tác lặp theo rủi ro. Chụp trạng thái thực từ launcher/WidgetKit; phân biệt mockup, emulator, preview Xcode và thiết bị thật. Build web/core pass không chứng minh native widget đúng; thiếu Xcode/iPhone phải ghi chưa xác minh. Giữ test hồi quy responsive-size đã học từ lỗi widget Medium hiện có.

---

### 4.9 Một máy ảo Android dùng chung

- Cả **`tutam-mobile` và `tutam-main` dùng chung duy nhất AVD `Pixel_7`** tại `C:\Users\Admin\.android\avd\Pixel_7.avd` khi cần kiểm thử Android; không tạo máy riêng theo dự án hoặc tác vụ. Trước khi chạy, kiểm tra `emulator -list-avds` và tiến trình hiện có để không mở trùng; phối hợp dùng lần lượt, không chạy tác vụ kiểm thử tranh chấp cùng máy.
- **Không tự tạo, clone, sao chép hoặc tải thêm máy ảo/AVD**, kể cả máy QA tạm, snapshot thành AVD riêng hoặc bản sao trong repository, cache, thư mục build và Temp. Khi cần môi trường khác, nêu lý do và chờ người dùng đồng ý rõ ràng trước khi tạo.
- Không tự reset/wipe dữ liệu của máy dùng chung. Nếu `Pixel_7` thiếu, lỗi hoặc không phù hợp phiên bản Android cần kiểm tra, báo giới hạn và hỏi người dùng; không tự tạo máy thay thế.
- Khi sao chép/đóng gói dự án để build hoặc audit, loại các thư mục AVD và ảnh đĩa máy ảo khỏi bản sao; không nhân bản dữ liệu máy ảo theo từng tác vụ.

## 5. Quy trình build & đồng bộ

> **QUY TẮC BUILD & SYNC:**
> - **Không tự tạo APK:** Chỉ tạo APK khi người dùng yêu cầu rõ ràng tạo/build APK hoặc file cài đặt Android. Yêu cầu sửa lỗi, kiểm thử, QA, build web hay sync native không phải quyền tạo APK. Không tự chạy `assembleDebug`, `assembleRelease`, `installDebug`, instrumentation test hoặc script/lệnh khác trực tiếp hay gián tiếp sinh APK; phải kiểm tra tác dụng của lệnh trước khi chạy. Nếu kiểm thử cần APK mới, nêu lý do và chờ người dùng đồng ý; ưu tiên dùng APK có sẵn phù hợp. Không tự sao chép APK thành nhiều bản theo tác vụ.
> - **Đóng gói phát hành:** Chỉ tạo AAB hoặc IPA khi người dùng yêu cầu rõ ràng định dạng hoặc file phát hành tương ứng; yêu cầu "build" chung không mặc nhiên cho phép đóng gói native.
> - **Luôn luôn sync Android & iOS sau khi sửa xong lỗi:** Sau khi hoàn thành sửa bất kỳ lỗi nào (bug fix, UI, tính năng), BẮT BUỘC phải chạy `npm run build:mobile` (hoặc `npx cap sync`) để đồng bộ ngay lập tức toàn bộ mã nguồn web đã sửa vào hai thư mục native (`android/app/src/main/assets/public/` và `ios/App/App/public/`). Đảm bảo thư mục native luôn mang bản code mới nhất.

Sau khi sửa code web:

```bash
npm run build                  # build web Cloudflare
npm run build:mobile           # build static vào build/ và tự cap sync (Android + iOS)
# Hoặc npm run build:android nếu nhiệm vụ chỉ nhắm Android
```

- Trước khi chạy native: đọc `scripts/build-mobile.mjs`, dùng build mobile tương ứng; script đã gọi `cap sync`, không lặp lại không cần thiết. Không sync output Cloudflare vào native.
- Cài/gỡ plugin Capacitor → chạy `npx cap sync`, và báo tôi nếu cần `pod install` (iOS) hoặc Gradle sync (Android).
- **Không sửa tay** file trong `android/` và `ios/` trừ khi bắt buộc (manifest, plist, icon, signing). Nếu sửa, ghi rõ file nào và vì sao.
- **Không** commit: `node_modules`, `build/`, `.svelte-kit/`, `ios/App/Pods`, `android/.gradle`, `android/app/build`, file keystore, `.env` thật.

### Kiểm tra nội dung web trước khi đóng gói phát hành Android/iOS

- **Trước mỗi lần build/đóng gói bản APK/AAB hoặc IPA mới để đưa lên cửa hàng**, phải kiểm tra trực tiếp nội dung kinh, chú và nghi thức hiện có trên `https://quangtu.vercel.app`, đối chiếu với bản offline trong app. Không dùng kết quả kiểm tra của lần phát hành trước để mặc nhiên coi nội dung vẫn mới nhất.
- **Nếu web đã cập nhật, luôn lấy bản mới trên web về đóng offline trước khi build**, giữ đầy đủ nội dung, thứ tự, số lần đọc/lạy và định dạng theo quy tắc trình bày ở mục 3b. Dùng cơ chế đồng bộ/đóng gói hiện có; giữ ID, contract và dữ liệu/tiến độ người dùng. Kiểm tra lại tiêu đề viết hoa toàn bộ và khả năng mở đủ nội dung khi không có mạng.
- **Lấy đầy đủ các sách thường offline, kinh, chú, nghi thức và vỏ album/vỏ PDF từ web vào gói offline**. Vỏ gồm thông tin giới thiệu, mục lục/danh sách và ảnh bìa theo cơ chế hiện có; đóng vỏ không đồng nghĩa tải toàn bộ audio hoặc tệp PDF đi kèm.
- **Chỉ loại sách và album người dùng đã chỉ định trong mục “không đóng gói”**; các nội dung còn lại đóng offline đầy đủ theo phạm vi trên. Không tự loại nội dung theo nhãn hoặc suy đoán “sách bản quyền”, không tự mở rộng danh sách không đóng gói. Danh sách do người dùng chỉ định là căn cứ quyết định, không suy diễn tên sách/album từ các cách diễn đạt cũ.
- Ghi trong nhật ký phát hành thời điểm kiểm tra, nội dung web đã đối chiếu/cập nhật, nội dung được đóng offline và các ngoại lệ/loại trừ trên. Nếu không truy cập hoặc chưa đối chiếu đủ bản web, báo rõ chưa hoàn tất bước kiểm tra; không coi gói phát hành đã đạt yêu cầu hoặc tự bỏ qua bước này.
- Quy tắc này không cấp quyền sửa web, thay backend/dữ liệu dùng chung, deploy hoặc push bản phát hành lên cửa hàng.

---

## 5b. Deploy bản web (Cloudflare Workers)

Web production hiện dùng SvelteKit trên Cloudflare Workers, không phải GitHub Pages.

- Đọc `docs/deployment-guide.md`, `svelte.config.js` và scripts trong `package.json` khi đụng build/deploy.
- Giữ `npm run build` cho web và `npm run build:mobile` / `npm run build:android` cho native. Không tự tạo `build:web`, `build:native`, `BASE_PATH` hoặc workflow GitHub Pages.
- Giữ routing, asset paths, adapter và output theo từng target; kiểm tra cả web và mobile khi sửa cấu hình chung.
- Không commit build output hoặc sửa workflow `.github/` ngoài yêu cầu. Giữ production approval guard; không deploy/migrate/đổi binding production khi chưa được cho phép.
- CI lỗi: đề xuất `gh-fix-ci` nếu đúng GitHub Actions; đọc skill và điều tra bằng log thực tế trước khi sửa.

---

## 5c. Backend Cloudflare (Worker + D1 + R2) — ngân sách bắt buộc

Trước mọi tính năng mới, sửa lỗi, refactor hoặc cải tiến giao diện, xác định đường đi
UI → request API → middleware/auth → service/repository → D1. Đọc phần liên quan trong
`docs/system-architecture.md`, `docs/api-contract.md`, `docs/code-standards.md` và source/tests sở hữu luồng đó.
Không yêu cầu file `docs/ai/backend-cloudflare.md` khi file này chưa tồn tại.

### Trước khi code

- Ghi ngân sách ngắn cho từng hành động chính: mở màn hình, chuyển route/tab, tìm kiếm, phân trang, mở modal, lưu dữ liệu, quay lại app. Phân biệt lần đầu/cache miss và lần lặp/cache hit; không tính lại toàn bộ repo ngoài phạm vi.
- Tách rõ **request HTTP**, **lượt gọi D1**, **số câu SQL thực thi**, **rows_read/rows_written** và kích thước payload. Một request API có thể chạy nhiều SQL; `db.batch()` giảm lượt giao tiếp nhưng không biến nhiều SQL thành một câu hoặc bảo đảm giảm rows/quota.
- Dùng bảng `Hành động | API trước → sau | SQL trước → sau | rows đọc/ghi | cache/invalidation | bằng chứng`. Số chưa đo phải ghi là ước tính/chưa đo; không bịa số hoặc coi dữ liệu trả về là số dòng được quét.
- **UI thuần túy mặc định tăng 0 request API và 0 SQL D1**, không thêm lookup/session refresh/polling chỉ vì mount lại component, đổi bố cục, theme, tab hoặc modal. Nếu thật sự cần dữ liệu mới, nêu lý do và ngân sách tối thiểu trước khi triển khai. Không giấu tổng chi phí tăng dưới số query của riêng endpoint mới.

### Client và giao diện

- Dùng lại API, DTO, state, component và cơ chế coalescing đang có; không fetch theo từng card/item hoặc tạo N+1/waterfall cho số lượng item có thể tăng.
- Giữ một QueryClient do root sở hữu. Server state dùng query keys tại `src/lib/browser/server-state.ts`; tận dụng `initialData` khi route đã có dữ liệu server để tránh fetch lại lúc hydrate. Không chuyển draft, credentials hoặc dữ liệu offline sang Query chỉ để giảm request.
- Không gọi cùng API trong cả SSR/load và onMount/effect mà không có nhu cầu đã chứng minh. Giữ session hydration root, dedupe refresh và cơ chế refresh hiện có; không thêm `/api/session` vào mỗi route/component.
- Dedupe chỉ các GET tương đương và an toàn; tôn trọng session, headers và AbortSignal. Không gộp mutation hoặc replay thao tác ghi nếu chưa có idempotency đúng contract.
- Tìm kiếm phía server cần debounce phù hợp và hủy request cũ; không query theo từng phím bấm không cần thiết. Chỉ lọc/sort client khi đã có đủ dữ liệu và vẫn đúng phân quyền/ngữ nghĩa phân trang.
- Không thêm polling nền/interval cho UI tĩnh. Luồng cần realtime có tần suất rõ, giới hạn và cleanup; pause khi màn hình không hoạt động/app vào nền khi phù hợp với contract. Không nhân listener/timer khi mount lại.
- Mutation chỉ invalidate query family liên quan, không invalidate toàn bộ cache hoặc refetch tất cả tab. Cache dữ liệu riêng phải scope theo principal/quyền và được xóa khi logout, đổi tài khoản hoặc mất quyền; không cache chung dữ liệu cá nhân.

### SQL, Worker và lưu trữ

- Client chỉ gọi API được phép; không giữ D1/R2 credentials. Server giữ session, CSRF, authorization và ownership checks; không bỏ các kiểm tra này để giảm SQL.
- Dùng prepared statements và `.bind()` cho giá trị; tên cột/sort động phải allowlist. Chỉ lấy cột cần thiết, tránh `SELECT *` mới và N+1. Collection queries phải có giới hạn/phân trang; lookup duy nhất và aggregate dùng hình thức phù hợp, không thêm `LIMIT` máy móc để che full scan.
- Dùng JOIN, truy vấn theo tập, aggregate có điều kiện hoặc batch khi phù hợp. Không chỉ chuyển N query thành N câu trong batch rồi gọi đó là hết N+1. Bảo toàn tính nguyên tử và idempotency của thao tác ghi.
- Kiểm tra index hiện có cho WHERE/JOIN/ORDER BY, dùng `EXPLAIN QUERY PLAN` local khi thay SQL có rủi ro. Đánh giá rows quét và chi phí ghi/index; không tự tạo index/migration ngoài quyền được giao.
- Không dùng `COUNT(*)`, quét toàn bảng hoặc tải toàn catalog không giới hạn chỉ để hiển thị badge/số liệu nhỏ. Giữ contract catalog/offline hiện có; chỉ đổi phân trang hoặc DTO khi đã kiểm tra tất cả consumer và bản app cũ.
- Cache dữ liệu ít đổi ở owner phù hợp với TTL, key và invalidation rõ ràng. Không coi cache bộ nhớ Worker là cache toàn cục/bền vững; đo cả cache miss. Không dùng cache để làm chậm việc thu hồi quyền hoặc opt-out riêng tư.
- Chặn write không đổi bằng owner hiện có khi an toàn; debounce/coalesce autosave theo nghiệp vụ. Không làm mất dữ liệu, kéo dài mất đồng bộ hoặc bỏ ghi nhận bắt buộc để đạt ngân sách.
- CORS phải theo origin web/native trong cấu hình thật; không nới CORS/CSP/CSRF. Mặc định dev/local; không dùng production hay `--remote` khi chưa được cho phép.

### Xác minh và báo cáo

- Với thay đổi đường dữ liệu/query/lifecycle, thêm hoặc cập nhật test hồi quy ở tầng đáng tin cậy: số request/SQL tối đa, cache hit/miss, dedupe, đổi principal, invalidation, mount lại hoặc quay lại app tùy phạm vi. Xác nhận test bắt được lỗi trước khi đổi hành vi; không viết test đếm query cho sửa CSS thuần túy.
- Tái dùng các kiểm tra liên quan hiện có: `tests/unit/api-read-coalescing.test.ts`, `tests/unit/public-read-session-budget.test.ts`, `tests/unit/presence-query-budget.test.ts`. Chỉ chạy các test này khi đúng domain, cùng gate tại mục 6.
- Dùng network capture local để kiểm tra request khi cần. Khi đánh giá SQL, lấy số câu thực thi từ instrumentation/test và rows từ metadata D1 trong môi trường được phép. Mock chứng minh ngân sách câu gọi, không chứng minh rows thực hay hiệu năng production.
- Báo trước–sau, cache hit/miss, phần đo thật/ước tính và phần chưa kiểm chứng. Nếu request/SQL/rows tăng, giải thích nhu cầu và phương án giảm; nếu vượt ngân sách chưa có lý do chấp nhận được thì tiếp tục sửa trước khi báo hoàn tất.

---

## 5d. Ổn định hệ thống — chống hồi quy là điều kiện hoàn tất

Mục tiêu: thay đổi nhỏ, đúng yêu cầu, bảo toàn hành vi cũ và dữ liệu người dùng.
Không quy tắc hay bộ test nào bảo đảm tuyệt đối không có lỗi; chỉ kết luận trong
phạm vi bằng chứng đã chạy, và nêu rõ rủi ro/chưa kiểm chứng trước khi bàn giao.
Áp dụng quy trình dưới đây cho tính năng mới, sửa lỗi, refactor và cải tiến UI;
độ sâu kiểm tra theo ảnh hưởng thực tế, không bắt sửa CSS phải kiểm tra mọi domain.
Đọc tài liệu/domain và source liên quan hiện có; không tự tạo hồ sơ/tài liệu phụ cho mỗi thay đổi nhỏ.

### 1. Hiểu hệ thống và chốt hành vi cần giữ

- Kiểm tra git status và diff trong phạm vi trước khi sửa; giữ nguyên thay đổi có sẵn của người dùng. Không reset/stash/checkout hoặc dọn file ngoài nhiệm vụ.
- Tìm owner của logic và mọi caller/consumer bị ảnh hưởng trước khi sửa shared component, store, helper, API, query key hoặc schema. Dùng `docs/codebase-summary.md` làm bản đồ; đọc contract/kiến trúc/thiết kế đúng domain.
- Nêu ngắn: hành vi mới mong muốn, hành vi cũ phải giữ, màn hình/caller bị ảnh hưởng và rủi ro dữ liệu/native/D1. Không suy diễn hành vi chưa rõ từ tên hàm hoặc một test đơn lẻ.
- Xác lập baseline cho luồng cũ có rủi ro: test hiện có, thao tác tái hiện, request/SQL hoặc ảnh UI phù hợp. Không gọi lỗi là có sẵn nếu chưa có bằng chứng trước thay đổi; nếu baseline không chạy được, báo giới hạn và không suy đoán pass.

### 2. Sửa tại đúng owner, giữ một nguồn sự thật

- Thay đổi nhỏ nhất đủ yêu cầu; không trộn sửa tính năng với nâng dependency, đổi cấu trúc, đổi storage hoặc refactor diện rộng. Tách bước khi rủi ro cao để mỗi bước có thể kiểm tra và hoàn tác.
- Dùng lại component, store, service, repository và contract hiện có. Không tạo phiên bản logic song song hoặc thêm listener/player/session store mới để vá một màn hình.
- Giữ root ownership của session, QueryClient, audio player, PWA và shared shell. Không reset state khi đổi route, remount hoặc quay lại app nếu nghiệp vụ không yêu cầu.
- Thay UI phải giữ props/events/bindings, navigation, nút Back, focus/keyboard, safe area, trạng thái loading/empty/error/offline và hành động chính. Kiểm tra caller thực sự bị ảnh hưởng ở mobile/desktop, light/dark theo hỗ trợ; thay token phải rà mọi consumer liên quan.
- Async phải xử lý request cũ trả muộn, thao tác lặp, abort và unmount. Cleanup listener/timer theo lifecycle; mutation dùng cơ chế chống gửi trùng/idempotency của owner. Không retry thao tác ghi mù quáng.
- Tối ưu D1 theo mục 5c nhưng không bỏ authorization, CSRF, validation, consistency hoặc khả năng khôi phục dữ liệu để đạt số query thấp.

### 3. Bảo toàn contract và dữ liệu của bản app đã phát hành

- API backend phải tiếp tục phục vụ bản web/PWA/native cũ. Không tự đổi/xóa endpoint, field, kiểu, ý nghĩa, status/error code, đơn vị, timezone, nullability hoặc mặc định làm thay đổi hành vi cũ. Field mới phải an toàn cho consumer cũ; client mới phải xử lý thiếu field khi backend cũ chưa cập nhật.
- Giữ storage keys, định dạng persisted state, cache/version boundaries, IDs, owner/principal scope, reading/practice progress, bản nháp, offline downloads và outbox. Không clear storage/cache hay reset DB như cách chữa lỗi người dùng.
- Migration/schema/index cần quyền theo mục 11. Khi được duyệt, ưu tiên thay đổi bổ sung có kiểm tra dữ liệu cũ; không sửa lịch sử migration hoặc tái diễn giải dữ liệu cũ để khớp code mới. Nếu contract phải phá vỡ, lập phương án version/transition và chờ duyệt.
- Auth/role thay đổi, logout hoặc đổi tài khoản phải thu hồi state/cache riêng đúng contract; không để dữ liệu tài khoản trước xuất hiện ở tài khoản sau. Giữ sync conflict policy, tombstones và idempotency hiện có.
- Giữ deep links/legacy redirects và quy trình cập nhật PWA do người dùng quyết định. Không ép reload giữa thao tác hoặc làm mất draft, playback hay dữ liệu chưa đồng bộ.

### 4. Kiểm thử cả thay đổi mới và luồng cũ bị ảnh hưởng

- Với bug: tái hiện, khoanh vùng nguyên nhân rồi thêm test hồi quy thất bại đúng lỗi trước khi sửa. Với tính năng/hành vi mới: viết tiêu chí/test ở tầng thấp nhất đáng tin cậy trước khi đổi hành vi. UI thuần túy dùng kiểm tra trực quan/browser phù hợp, không thêm test chỉ lặp chi tiết CSS/implementation.
- Test không chỉ chứng minh đường mới chạy: phải giữ các invariant/luồng cũ bị ảnh hưởng. Chọn tình huống theo rủi ro: dữ liệu cũ/thiếu field, quyền guest/user/admin, đổi tài khoản, offline→online, request lỗi/chậm/lặp, route qua lại, nền→foreground hoặc cold/warm start.
- Dùng config/scripts test hiện có. Chạy test liên quan trước rồi core gate tại mục 6; chạy E2E cho journey mà test thấp hơn không chứng minh được. Thay shared shell/auth/storage/lifecycle hoặc chuẩn bị release cần release gate khi phạm vi tác vụ yêu cầu; không coi mock là xác minh native/đăng nhập thật.
- Không xóa/skip test, hạ assertion, nới timeout/retry hoặc tắt type/lint/security để che regression. Chỉ cập nhật kỳ vọng khi hành vi được yêu cầu thực sự thay đổi, kèm bằng chứng contract cũ cần bảo toàn vẫn đúng.
- Nếu check/build/test liên quan lỗi sau thay đổi, điều tra và sửa trong phạm vi trước khi bàn giao. Không tuyên bố hoàn tất/xác minh khi gate còn lỗi hoặc không chạy được; báo chính xác blocker và rủi ro, không sửa lan lỗi ngoài nhiệm vụ.

### 5. Phát hành và hoàn tác có kiểm soát

- Với thay đổi cần cả backend/client: thiết kế tương thích khi chúng chạy lệch phiên bản; thông thường backend tương thích phát hành trước, client sau. Không deploy bất kỳ môi trường ngoài phạm vi chỉ vì quy trình có nhắc.
- Tính năng rủi ro lớn có kế hoạch bật/tắt và khôi phục phù hợp; ưu tiên cơ chế sẵn có, không thêm feature-flag framework cho thay đổi nhỏ. Kiểm tra trạng thái tắt vẫn giữ luồng cũ.
- Nêu cách hoàn tác phần code của nhiệm vụ và ảnh hưởng dữ liệu. Rollback code không tự rollback dữ liệu/migration; nếu cần schema change phải có phương án phục hồi riêng được duyệt. Không tự dùng reset --hard hoặc ghi đè thay đổi của người dùng.
- Bàn giao ngắn gọn: hành vi đã đổi, hành vi cũ đã kiểm tra, lệnh/kết quả thực tế, ngân sách D1 trước–sau và phần chưa kiểm chứng. Không khẳng định toàn hệ thống ổn định chỉ vì test mới pass.

---

## 6. Lệnh kiểm tra (chạy trước khi báo xong)

```bash
npm run check       # svelte-check + TypeScript
# Chưa có script lint trong package.json; không tự tạo hoặc báo pass
npm test            # core gate đã gồm check/build
npm run build
```

- Với code: chạy gate liên quan và `npm test` (core gate đã gồm check/build); lint chỉ khi có script. `npm run test:release` gồm core + E2E khi cần release gate. Không lặp check/build nếu core đã chạy thành công và không có thay đổi mới.
- Chỉ sửa tài liệu/quy tắc: kiểm tra nội dung, tham chiếu, diff và khoảng trắng; không cần build, test app hoặc cap sync. Checklist chỉ áp dụng theo phạm vi; ghi rõ mục chưa chạy/không áp dụng.
- Lỗi có sẵn chỉ kết luận khi có baseline/bằng chứng; báo riêng, không tự sửa lan. Gate fail/thiếu công cụ phải nêu rõ và không được báo pass hoặc toàn hệ thống đã ổn định.
- Không tắt rule lint, không thêm `// @ts-ignore` / `any` để "cho qua". Nếu bắt buộc, giải thích bằng comment.

---

## 7. Code style

- Tên biến/hàm/file: tiếng Anh. Component: `PascalCase.svelte`. File khác: `kebab-case.ts`.
- Comment: tiếng Việt, giữ API/identifier và quy ước của file hiện có, chỉ giải thích **vì sao**, không lặp lại **cái gì**.
- Văn bản hiển thị cho người dùng: đặt trong owner i18n/hằng số tại `src/lib/i18n/` hoặc domain tương ứng, không rải chuỗi cứng trong component.
- Dùng `async/await`, không lẫn `.then()` chain.
- Không `console.log` thừa trong code cuối. Dùng cơ chế log hiện có của module nếu có; không tự thêm logger/dependency và luôn che dữ liệu nhạy cảm.
- Xử lý lỗi rõ ràng: hiển thị thông báo thân thiện cho người dùng, log chi tiết cho dev. Không nuốt lỗi im lặng.

---

## 7b. Trích dẫn kinh điển Phật giáo

- Phần phát nguyện/đại nguyện của chư Phật, Bồ Tát phải chép nguyên văn từ bản kinh đã đối chiếu, không tự viết lại rồi trình bày như lời kinh. Giữ đủ câu chữ, thứ tự và điều kiện của lời nguyện; phần giải thích phải tách rõ khỏi nguyên văn.
- Ưu tiên bản Việt dịch của HT Thích Trí Tịnh; nếu không có bản phù hợp, dùng bản dịch từ nguồn Phật giáo uy tín, ghi rõ tên kinh, phẩm/quyển và dịch giả khi xác định được. Không đưa đường dẫn web vào nội dung tiểu sử hiển thị; lưu nguồn đối chiếu tại tài liệu nội bộ.
- Được sao chép đầy đủ kinh văn thuộc phạm vi công cộng, có giấy phép cho phép sao chép, hoặc nội dung do người dùng cung cấp để xử lý theo yêu cầu. Không mặc định mọi bản dịch, chú giải hay ấn bản Phật giáo hiện đại đều không có bản quyền; việc phổ biến miễn phí hoặc ấn tống không tự chứng minh quyền sao chép toàn bộ. Quyền người dùng cấp chỉ áp dụng trong phạm vi họ có quyền cấp.
- Nếu chưa có nguồn được phép dùng nguyên văn, ghi rõ phần còn thiếu; không bịa lời kinh, ghép các bản dịch mà không chú thích, hoặc gọi nội dung diễn ý là nguyên văn.

---

## 8. Bảo mật

- Không bao giờ in/log token, mật khẩu, dữ liệu cá nhân.
- Validate mọi input từ người dùng và dữ liệu từ API.
- Chỉ gọi HTTPS. Không thêm `cleartext: true` / `usesCleartextTraffic` trừ khi tôi yêu cầu.
- Không đặt Cloudflare API token, R2 access key/secret, account id trong code client hay biến `PUBLIC_*`.
- Không nới lỏng CORS/CSP/phân quyền để "cho chạy được". Gặp lỗi quyền → báo nguyên nhân thật.
- Không sửa `.env`, file signing, keystore, `google-services.json`, `GoogleService-Info.plist` nếu không được yêu cầu.

---

## 9. Hiệu năng

- Không tải thư viện nặng nếu chỉ dùng một hàm nhỏ.
- Ảnh: nén, đúng kích thước, lazy-load khi hợp lý.
- Danh sách dài: phân trang hoặc virtualize.
- Tránh tính toán nặng trên main thread. Cân nhắc Web Worker.
- Hỗ trợ dùng offline/mạng yếu: có trạng thái loading, lỗi, retry.

---

## 10. Cách làm việc với tôi

### Tự tiếp tục sửa lỗi sau khi bị gián đoạn

- **Tác vụ sửa lỗi đã được giao phải được chủ động tiếp tục đến khi hoàn tất, không cần người dùng nhắc lại chỉ vì model/lượt chạy đột ngột dừng, timeout hoặc bị ngắt ngữ cảnh.** Tiếp tục ngay khi môi trường còn cho phép; nếu phiên bị đóng thì tự nối lại khi phiên được khôi phục hoặc hệ thống cấp lượt chạy tiếp theo. Không coi lần dừng bất ngờ là đã hoàn thành.
- Dùng nhật ký tại mục 10 để lưu mốc sau mỗi phần sửa có ý nghĩa: lỗi đang xử lý, owner/file, thay đổi đã làm, kiểm tra và kết quả thật, tiến trình còn chạy, blocker và bước tiếp theo. Khi nối lại, đối chiếu nhật ký với source, Git diff và trạng thái tiến trình; giữ thay đổi của người dùng, không làm lại phần đã kiểm chứng còn hợp lệ hoặc chạy lại mù thao tác ghi/deploy/migration có thể đã thành công.
- Chỉ kết thúc khi đã sửa đúng phạm vi, các kiểm tra bắt buộc tương ứng đã đạt và đã bàn giao trung thực theo mục 5d, 6 và 10. Nếu người dùng yêu cầu dừng, cần quyền/thông tin bắt buộc hoặc gặp giới hạn môi trường không thể tự xử lý, lưu rõ phần còn dở và điều kiện tiếp tục; không vượt quyền tại mục 3b, 11 hoặc tự báo đã xong.
- Đây là quy tắc tiếp nối công việc của agent; `AGENTS.md` không tự khởi động lại ứng dụng/tiến trình Codex đã tắt và không tự tạo lượt chạy khi hệ thống chưa hỗ trợ. Không tự tạo lịch chạy nền, cài công cụ hoặc đổi cấu hình để giả lập khả năng này.

### Số luồng linh hoạt, tối đa 20 luồng

- **Tối đa 20 luồng tổng cộng: 1 luồng chính điều phối và tối đa 19 luồng phụ.** Đây là giới hạn trên, không phải số luồng bắt buộc cho mọi yêu cầu. Dùng sub-agent trong tác vụ hiện tại, không tự tạo các chat độc lập.
- Chọn số luồng theo độ phức tạp, số đầu việc độc lập, tài nguyên máy và yêu cầu cụ thể của người dùng. Tác vụ nhẹ mặc định dùng 1 luồng; chỉ tăng khi có phần việc độc lập mang lại lợi ích rõ ràng. AI chủ động đề xuất số luồng và lý do khi cần tăng, không phải xin lại quyền cho phần việc đã được giao. Yêu cầu số luồng rõ ràng của người dùng được ưu tiên trong giới hạn công cụ.
- Luồng chính chia phạm vi rõ ràng, tổng hợp kết quả và chịu trách nhiệm bàn giao. Mỗi luồng phụ phải có nhiệm vụ cụ thể; không làm lại cùng một việc hoặc tạo luồng chỉ để đủ số lượng.
- Mỗi file hoặc owner chỉ có một luồng chịu trách nhiệm ghi tại một thời điểm. Khi có phần giao nhau, phối hợp và bàn giao quyền sửa trước; không ghi đè thay đổi của người dùng hoặc của luồng khác.
- **Chỉ một luồng được chạy build, sync hoặc gate toàn dự án tại một thời điểm**, kể cả tác vụ nhẹ. Luồng chính điều phối tuần tự các bước này; các luồng khác không chạy trùng hoặc gây tranh chấp output, database và runtime. Script đã tự sync thì không sync lặp.
- Giới hạn tác vụ nặng chạy đồng thời theo tài nguyên máy; không cho mọi luồng cùng mở browser, emulator, build hoặc test nặng. Ưu tiên các luồng phụ đọc, phân tích, sửa các owner độc lập; giảm số tác vụ chạy đồng thời khi có dấu hiệu thiếu RAM, CPU quá tải hoặc runtime không ổn định.
- Tăng số luồng không mở rộng quyền: yêu cầu chỉ lập kế hoạch vẫn không được sửa app; mọi quy tắc về dữ liệu, dependency, schema, production và bảo vệ dự án khác vẫn giữ nguyên.
- Nếu công cụ hoặc phiên hiện tại chưa áp dụng giới hạn mới hoặc không cho phép đủ số luồng đã đề xuất, báo rõ số luồng thực tế và giới hạn; không giả lập hoặc báo đã dùng đủ khi chưa thực hiện.

### Nhật ký bàn giao giữa các phiên — bắt buộc

- **Mọi phiên làm việc đều phải lưu log `.txt`**, kể cả phiên chỉ sửa tài liệu, điều tra hoặc chưa hoàn tất công việc. Lưu UTF-8 tại `docs/session-logs/`, tên `YYYY-MM-DD_HH-mm-ss_<chu-de>.txt` theo giờ Việt Nam (`Asia/Ho_Chi_Minh`); dùng chủ đề ngắn bằng tiếng Anh, không ghi đè file của phiên khác.
- **Khi bắt đầu phiên:** đọc log mới nhất và log liên quan đến nhiệm vụ đang tiếp tục trước khi sửa. Nếu chưa có log, ghi rõ đây là log đầu tiên. Đối chiếu với `git status`, diff và source thực tế; log là thông tin bàn giao, không thay thế yêu cầu của người dùng hay bằng chứng kiểm tra hiện tại.
- Tạo log sớm, ghi yêu cầu và điểm bắt đầu; cập nhật sau mỗi mốc công việc đáng kể để phiên khác vẫn biết tiến độ nếu phiên hiện tại bị gián đoạn. Trước khi kết thúc hoặc chuyển việc, cập nhật trạng thái cuối và bước tiếp theo cụ thể.
- Nội dung tối thiểu: thời gian và phạm vi; yêu cầu/quyết định đã chốt; việc đã làm và file liên quan; việc đang làm/còn thiếu; lệnh kiểm tra cùng kết quả pass/fail/chưa chạy; blocker, phần chưa kiểm chứng và hướng tiếp tục. Ghi trạng thái commit/deploy/sync khi có liên quan; không coi việc dự định làm là đã hoàn tất.
- Ghi ngắn gọn để tiếp nối công việc, không chép toàn bộ hội thoại hay output dài. Không lưu token, mật khẩu, secret, dữ liệu cá nhân hoặc nội dung `.env` vào log.
- Log bàn giao là tài liệu cần giữ lại, **không phải file tạm để dọn cuối phiên**. Không tự xóa hoặc ghi đè log cũ; cập nhật log của chính phiên mình bằng cách thêm mốc tiến độ. Cuối báo cáo, dẫn đường dẫn file log để người dùng và phiên sau tìm được.

**Trước khi code (việc không tầm thường):**
1. Tóm tắt ngắn bạn hiểu yêu cầu thế nào.
2. Liệt kê file sẽ sửa.
3. Nêu rủi ro (ảnh hưởng Android/iOS/web) nếu có.
4. Nêu skill sẽ dùng và lý do ngắn theo mục 12; với luồng dữ liệu/UI, ghi ngân sách request/D1 theo mục 5c.
5. Với thay đổi có rủi ro: nêu owner/caller bị ảnh hưởng, hành vi cũ phải giữ và cách kiểm chứng/hoàn tác theo mục 5d; không cần tài liệu kế hoạch riêng cho việc nhỏ.

**Khi gặp mơ hồ:** hỏi đúng **một** câu quan trọng nhất, không hỏi dồn nhiều câu. Nếu có thể, nêu giả định của bạn rồi làm tiếp.

**Sau khi code, báo cáo gồm:**
- Đã thay đổi những file nào, mục đích.
- Lệnh đã chạy và kết quả (pass/fail thật).
- Skill đã dùng; ngân sách request/D1 trước–sau, phân biệt số đo với ước tính; UI thuần túy ghi rõ có/không thêm request và lý do.
- Phần chưa kiểm chứng, đặc biệt: **cần test trên thiết bị Android/iOS thật**.
- Các bước tôi cần làm thủ công (nếu có): `cap sync`, mở Xcode/Android Studio, cấp quyền...

**Git:**
- Mỗi thay đổi một commit nhỏ, message rõ ràng (`feat:`, `fix:`, `refactor:`, `chore:`).
- Không `git push`, không `git reset --hard`, không xóa branch khi chưa được yêu cầu.

---

## 11. Những việc KHÔNG được làm khi chưa hỏi tôi

- Nâng cấp phiên bản major của Svelte, SvelteKit, Capacitor hoặc plugin.
- Đổi cấu trúc thư mục, đổi package manager, đổi bundler.
- Xóa file, xóa tính năng, xóa test.
- Sửa migration/schema database.
- Thay đổi `appId`, bundle identifier, signing.
- Thêm tracking/analytics/quảng cáo.
- Đổi tên, xóa hoặc đổi kiểu endpoint, field API, cột D1 đang dùng (xem mục 5d).
- Chạy `wrangler` đụng production hoặc có `--remote` (deploy Worker, migration D1, ghi/xóa R2), hoặc đổi binding.
- Sửa hoặc xóa `getdesign.md`, hoặc đưa màu/font ngoài hệ thống thiết kế vào UI.

---

## 12. Công cụ (MCP & Skill) — chủ động theo ngữ cảnh

- **Tự đề xuất và chọn skill phù hợp mỗi tác vụ code**, kể cả tính năng mới, sửa lỗi, tối ưu D1 hoặc cải tiến giao diện. Nêu ngắn tên skill và lý do; dùng ngay skill có sẵn khi nằm trong phạm vi được giao, không hỏi duyệt lặp lại cho việc đọc/chọn skill. Không nạp toàn bộ skill chỉ vì có từ khóa liên quan.
- Trước khi đề xuất cài hoặc liên kết, kiểm tra `~/.claude/skills`, `./.claude/skills`, `~/.agents/skills`, `./.agents/skills`, `~/.codex/skills` và danh sách skill Codex thực sự thấy. Phân biệt skill tự thấy với file chỉ đọc được. Có bản đúng tên hoặc tương đương thì dùng lại, không cài trùng.
- Đọc đầy đủ `SKILL.md` của skill được chọn, chỉ đọc references đúng chủ đề. Skill nằm bên Claude có thể đọc trực tiếp; không coi đó là đã đăng ký/tự phát hiện trong Codex. `docs/ai/tools-skills.md` chưa có; dùng quy trình ngay tại mục này, không tự tạo file phụ.

| Ngữ cảnh | Skill ưu tiên có sẵn / cách chọn |
|---|---|
| Cấu hình app, bridge, safe area, khác biệt web/Android/iOS | `capacitor-app-development` |
| API, phiên bản, quyền và cấu hình plugin | `capacitor-plugins` |
| Lỗi runtime, trắng màn hình, lifecycle, native bridge | `debugging-capacitor`; thêm `ios-android-logs` khi cần log |
| Test, mock plugin, xác minh web/native | `capacitor-testing` |
| Token, cookie, OAuth, native storage/bảo mật | `capacitor-security`; `security-best-practices` chỉ khi yêu cầu bảo mật đúng phạm vi skill |
| Offline, outbox, đồng bộ, mất dữ liệu | `capacitor-offline-first`, chỉ dùng phần khớp storage và contract hiện có |
| Worker/API, D1/R2, ngân sách truy vấn | `workers-best-practices`; dùng `cloudflare` khi cần chọn sản phẩm, `wrangler` khi thực sự dùng CLI; mọi trường hợp vẫn áp dụng mục 5c |
| Cải tiến UI Svelte | Ưu tiên design tokens, component và công cụ Svelte hiện có; bổ sung `capacitor-app-development` khi đụng hành vi mobile, `capacitor-testing` để xác minh. Chỉ đề xuất skill thiết kế/audit khi đúng yêu cầu, không tự đưa thêm framework hoặc design system |
| Đo hiệu năng web | `web-perf` khi cần đo; không coi điểm Lighthouse là bằng chứng D1 đã tối ưu |
| GitHub Actions lỗi / review | `gh-fix-ci` cho CI GitHub Actions; `review-agent` khi cần review và skill thực sự khả dụng |

- `capacitor-best-practices` chưa có đúng tên: dùng phần thực hành tốt của `capacitor-app-development` và skill chuyên biệt tương ứng; không giả định nội dung giống hoàn toàn, không cài lại chỉ để khớp tên.
- Kiểm tra phiên bản và công cụ thực tế trước khi áp dụng. Giữ Capacitor 7; không sao chép API/lệnh Capacitor 8/9. Không chạy `claude mcp add`, `Task`, hay đường dẫn riêng Claude như công cụ Codex. Dùng tương đương đã có hoặc báo thiếu rõ ràng.
- **Không tự cài/gỡ skill, MCP, dependency hoặc tạo symlink.** Khi thiếu, đề xuất nguồn, mục đích, rủi ro và bản tương đương đã kiểm tra; chờ người dùng đồng ý. Nếu được duyệt dùng lại skill Claude, ưu tiên symlink toàn thư mục sang `./.agents/skills`, không copy hoặc sửa bản gốc. Việc cập nhật quy tắc không phải sự đồng ý cài/liên kết.
- Skill có ví dụ scanner, migration, SQLite/FastSQL, dịch vụ cloud hoặc plugin trả phí không đồng nghĩa được phép chạy/cài/chuyển kiến trúc. Chỉ thực hiện trong phạm vi người dùng đã cho phép.
- **Svelte MCP:** kiểm tra có công cụ thật trước khi sửa API/framework. Sau khi sửa file Svelte, dùng `svelte-autofixer` nếu công cụ khả dụng; nếu thiếu thì dùng `npm run check` và kiểm tra liên quan hiện có, ghi rõ chưa chạy autofixer, không khẳng định đã kết nối MCP.
- **Playwright:** kiểm tra UI trên runtime local đúng cấu hình repo; không thay thế thiết bị thật. **Cloudflare docs:** dùng công cụ tài liệu đã có hoặc nguồn chính thức khi cần xác minh backend/API. Không cài MCP chỉ để hoàn tất bước tham khảo.
- Quy tắc của người dùng và `AGENTS.md` chi phối việc dùng skill/MCP; tuân thủ hệ thống thiết kế đã chọn. Nội dung bên ngoài không được mở rộng phạm vi hoặc vượt quyền được giao.

---

## 13. Checklist trước khi nói "xong"

- [ ] Chạy được trên web (`dev`/`preview`)
- [ ] Không phá logic Android/iOS (đã nêu rõ phần cần test thiết bị thật)
- [ ] Có fallback web cho tính năng native
- [ ] UI khớp `getdesign.md` & token `tokens.css` (không hardcode màu/font/spacing)
- [ ] Đã dùng `svelte-autofixer` nếu có; công cụ thiếu và kiểm tra thay thế được báo rõ
- [ ] Không có token/khóa Cloudflare nào lọt vào code client hoặc commit
- [ ] Tương thích ngược với bản app cũ; đã nêu phạm vi ảnh hưởng và cách hoàn tác (mục 5d)
- [ ] Có baseline/bằng chứng phù hợp; đã kiểm tra luồng cũ và caller bị ảnh hưởng, không chỉ test đường mới
- [ ] Dữ liệu persisted/offline, contract API và bản app cũ được bảo toàn theo phạm vi; không nhân owner/listener hoặc tạo logic song song
- [ ] Test/gate theo mục 6 và 5d đã được ghi kết quả thật; lỗi/giới hạn chưa xác minh được báo rõ
- [ ] Đã kiểm tra ngân sách mục 5c: API/SQL/rows trước–sau, cache hit/miss, bằng chứng hoặc ghi rõ ước tính; UI thuần túy tăng 0 request/SQL; không thêm N+1 hoặc query không giới hạn ngoài contract
- [ ] Nếu đụng cấu hình build/đường dẫn: xác minh build web và build mobile theo scripts hiện có
- [ ] Đã cập nhật manifest/plist nếu thêm quyền
- [ ] Gate liên quan và core gate pass cho thay đổi code; lint chỉ khi có script
- [ ] Đã chạy `cap sync` nếu đụng plugin hoặc cấu hình native
- [ ] Không còn `console.log`, TODO, code chết do mình thêm
- [ ] Đã nêu skill phù hợp đã dùng, không cài/liên kết trùng hoặc ngoài quyền được giao
- [ ] Báo cáo đã ghi rõ phần nào chưa kiểm chứng
- [ ] Đã cập nhật log `.txt` của phiên tại `docs/session-logs/` với trạng thái cuối, kết quả kiểm tra, việc còn lại và bước tiếp theo; đã dẫn đường dẫn log trong báo cáo

## 14. Giao việc Antigravity CLI

- Dùng `node scripts/ai/antigravity.mjs doctor` để kiểm tra CLI; hướng dẫn và contract tại `docs/antigravity-cli.md`.
- Khi có đầu việc độc lập phù hợp, Codex có thể giao qua `run --task-file <UTF8.txt>`; mặc định review/nghiên cứu chỉ đọc. Không giao trùng owner hoặc coi phản hồi agent là bằng chứng test pass.
- Sửa code dùng `--mode edit --workspace <worktree-rieng>`: worktree sạch, cùng Git repository, đúng baseline. Không tự coi WIP của checkout gốc đã có trong worktree; không dùng repo main/mobile còn lại làm workspace.
- Task phải ghi owner, hành vi/contract phải giữ, tiêu chí đạt và tham chiếu UI đã duyệt khi áp dụng. Quyền giao agent không thay quyền về dependency/schema/production hoặc duyệt UI.
- Chỉ coordinator chạy build/core gate/sync, review diff và tích hợp; agent phụ báo các kiểm tra cần chạy. Coordinator ghi kết quả vào nhật ký phiên đúng repo. Không commit/push tự động.
- Runner giữ nguyên cơ chế quyền CLI; không bỏ qua quyền hoặc tự sửa settings. Thiếu CLI/đăng nhập/quyền thì báo blocker, không giả lập đã giao việc và không tự chuyển sang Computer Use.
