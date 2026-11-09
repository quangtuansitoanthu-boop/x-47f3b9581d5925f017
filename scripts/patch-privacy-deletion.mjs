import fs from 'node:fs';

const file = 'src/routes/chinh-sach-bao-mat/+page.svelte';
let code = fs.readFileSync(file, 'utf8');

const target = `<section>
        <h2>{isEn ? '5. Data Security & Deletion Rights' : '5. Bảo mật dữ liệu & Quyền yêu cầu xóa thông tin'}</h2>
        <p>
          {#if isEn}
            We implement modern security standards (SSL/TLS encryption for all internet connections) to protect against unauthorized access.
          {:else}
            Chúng tôi áp dụng các biện pháp bảo mật hiện đại (mã hóa SSL/TLS cho mọi kết nối internet) nhằm ngăn chặn truy cập trái phép.
          {/if}
        </p>`;

const replacement = `<section id="xoa-tai-khoan">
        <h2>{isEn ? '5. Data Security & Account Deletion Policy' : '5. Bảo mật dữ liệu & Quy định xóa tài khoản'}</h2>
        <p>
          {#if isEn}
            We implement modern industry security standards (SSL/TLS encryption for all internet connections) to protect against unauthorized access.
          {:else}
            Chúng tôi áp dụng các biện pháp bảo mật hiện đại (mã hóa SSL/TLS cho mọi kết nối internet) nhằm ngăn chặn truy cập trái phép.
          {/if}
        </p>
        <div class="deletion-guide-box" style="background: rgba(220, 53, 69, 0.05); border: 1px solid rgba(220, 53, 69, 0.25); border-radius: 8px; padding: 14px 18px; margin: 14px 0;">
          <h3 style="margin-top: 0; color: #dc3545; font-size: 15px;">
            {isEn ? 'How to Delete Your Account and Associated Data:' : 'Hướng Dẫn Xóa Tài Khoản & Toàn Bộ Dữ Liệu Cá Nhân:'}
          </h3>
          {#if isEn}
            <p style="margin-bottom: 8px;">
              <strong>1. Within the mobile app:</strong> Navigate to the <em>"Personal" (Cá nhân)</em> tab &rarr; Scroll down &rarr; Click <strong>"Delete account" (Xóa tài khoản)</strong> and confirm. Your account, sessions, and reading progress will be permanently erased immediately.
            </p>
            <p style="margin-bottom: 0;">
              <strong>2. Via Email / Web request:</strong> If you have uninstalled the app or cannot sign in, please email us at <strong>quangtu.ansitoanthu@gmail.com</strong> with the subject <em>"Account Deletion Request - Tu Tap"</em> providing your registered email address. We will permanently delete your account, authentication identities, and associated data from our database within 24 to 48 hours.
            </p>
          {:else}
            <p style="margin-bottom: 8px;">
              <strong>1. Xóa trực tiếp trong ứng dụng:</strong> Mở ứng dụng Tu Tập &rarr; Vào mục <em>"Cá nhân"</em> &rarr; Kéo xuống dưới &rarr; Bấm <strong>"Xóa tài khoản"</strong> và xác nhận. Toàn bộ thông tin tài khoản, phiên đăng nhập và lịch sử đọc sách của bạn sẽ được xóa vĩnh viễn ngay lập tức.
            </p>
            <p style="margin-bottom: 0;">
              <strong>2. Yêu cầu xóa qua Email / Web:</strong> Nếu bạn đã gỡ cài đặt ứng dụng hoặc không thể đăng nhập, vui lòng gửi email đến <strong>quangtu.ansitoanthu@gmail.com</strong> với tiêu đề <em>"Yêu cầu xóa tài khoản Tu Tập"</em> kèm địa chỉ email bạn đã dùng để đăng nhập. Ban quản trị sẽ xóa vĩnh viễn tài khoản và mọi dữ liệu liên quan khỏi cơ sở dữ liệu trong vòng 24 - 48 giờ làm việc.
            </p>
          {/if}
        </div>`;

// Normalize both to LF
const normalizedCode = code.replace(/\r\n/g, '\n');
const normalizedTarget = target.replace(/\r\n/g, '\n');
const normalizedReplacement = replacement.replace(/\r\n/g, '\n');

if (normalizedCode.includes(normalizedTarget)) {
  const result = normalizedCode.replace(normalizedTarget, normalizedReplacement);
  fs.writeFileSync(file, result, 'utf8');
  console.log('✓ chinh-sach-bao-mat/+page.svelte updated with deletion policy');
} else {
  console.error('Target not found');
  process.exit(1);
}
