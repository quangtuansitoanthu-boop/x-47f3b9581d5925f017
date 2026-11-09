<script lang="ts">
  import { getLocaleContext } from '$lib/stores/locale.svelte';

  const localeStore = getLocaleContext();
  const isEn = $derived(localeStore.current === 'en');
</script>

<svelte:head>
  <title>{isEn ? 'Privacy Policy - Tu Tap' : 'Chính Sách Bảo Mật - Tu Tập'}</title>
  <meta
    name="description"
    content={isEn
      ? 'Privacy policy, data protection, and copyright terms for the Tu Tap application.'
      : 'Chính sách bảo mật thông tin và quyền riêng tư của ứng dụng Tu Tập.'}
  />
  <meta name="robots" content="index, follow" />
</svelte:head>

<div class="privacy-container">
  <div class="top-nav">
      <button
        type="button"
        class="back-btn"
        onclick={() => history.back()}
        aria-label={isEn ? 'Go back' : 'Quay lại'}
      >
        <span aria-hidden="true">←</span> {isEn ? 'Back' : 'Quay lại'}
      </button>
  </div>

  <div class="privacy-card">
    <header class="header">
      <div class="badge">{isEn ? 'OFFICIAL' : 'CHÍNH THỨC'}</div>
      <h1>{isEn ? 'Privacy Policy & Terms' : 'Chính Sách Quyền Riêng Tư'}</h1>
      <p class="subtitle">
        {isEn
          ? 'Tu tập - Phật pháp — Privacy Policy'
          : 'Ứng dụng Tu tập - Phật pháp'}
      </p>
      <div class="meta-date">
        {isEn ? 'Last updated: November 4, 2026' : 'Cập nhật lần cuối: Ngày 4 tháng 11 năm 2026'}
      </div>
    </header>

    <div class="content">
      <section>
        <h2>{isEn ? '1. Introduction' : '1. Giới thiệu'}</h2>
        <p>
          {#if isEn}
            Welcome to the <strong>Tu Tap</strong> application. We always respect and are committed to protecting your personal privacy. This Privacy Policy explains how we handle personal information and data when you use our mobile application and related services on our system.
          {:else}
            Chào mừng bạn đến với ứng dụng <strong>Tu Tập</strong>. Chúng tôi luôn tôn trọng và cam kết bảo vệ quyền riêng tư cá nhân của bạn. Chính sách quyền riêng tư này giải thích cách chúng tôi xử lý thông tin cá nhân và dữ liệu khi bạn sử dụng ứng dụng di động cũng như các dịch vụ liên quan trên hệ thống của chúng tôi.
          {/if}
        </p>
      </section>

      <section>
        <h2>{isEn ? '2. Information We Collect' : '2. Thông tin chúng tôi thu thập'}</h2>
        <p>
          {#if isEn}
            The <strong>Tu Tap</strong> application is designed with a philosophy of minimalism, serving a peaceful practice, meditation, and reading experience. Therefore:
          {:else}
            Ứng dụng <strong>Tu Tập</strong> được thiết kế theo tôn chỉ tối giản, phục vụ trải nghiệm tu tập, thiền định và đọc sách an lạc. Vì vậy:
          {/if}
        </p>
        <ul>
          <li>
            {#if isEn}
              <strong>Local data and account synchronization:</strong> Reading and practice progress, bookmarks and downloaded content can be stored on your device for offline use. When you sign in and use account synchronization, the data supported by that feature is sent to our servers and linked to your account to restore progress across devices. Content you submit to community features is processed according to the visibility you choose.
            {:else}
              <strong>Dữ liệu cục bộ và đồng bộ tài khoản:</strong> Tiến trình đọc, tu tập, đánh dấu trang và nội dung tải về có thể được lưu trên thiết bị để sử dụng ngoại tuyến. Khi bạn đăng nhập và sử dụng đồng bộ tài khoản, dữ liệu được tính năng đó hỗ trợ sẽ được gửi tới máy chủ, gắn với tài khoản để khôi phục tiến trình trên các thiết bị. Nội dung bạn gửi trong tính năng cộng đồng được xử lý theo phạm vi hiển thị bạn chọn.
            {/if}
          </li>
          <li>
            {#if isEn}
              <strong>Optional sign-in:</strong> Google, Facebook or Sign in with Apple may provide a provider-specific user ID, name, email address and profile picture, depending on the provider and the permissions you grant. Apple may provide a private relay email address. We use this information to verify your identity, manage your account and session, and provide account features. We do not receive your Google, Facebook or Apple password. Reading, listening and practice are available without signing in.
            {:else}
              <strong>Đăng nhập tùy chọn:</strong> Google, Facebook hoặc Đăng nhập bằng Apple có thể cung cấp mã người dùng của nhà cung cấp, tên, địa chỉ email và ảnh đại diện, tùy nhà cung cấp và quyền bạn cho phép. Apple có thể cung cấp địa chỉ email chuyển tiếp riêng tư. Chúng tôi dùng thông tin này để xác minh danh tính, quản lý tài khoản, phiên đăng nhập và cung cấp tính năng tài khoản. Chúng tôi không nhận mật khẩu Google, Facebook hoặc Apple của bạn. Bạn có thể đọc, nghe và thực hành mà không đăng nhập.
            {/if}
          </li>
          <li>
            {#if isEn}
              <strong>Identifiers, activity and operations:</strong> Online features may send an account or device identifier, reading/listening progress, usage events, notes and content you explicitly save or share. Practice data may reveal religious beliefs. When using Thanh Tinh online, abstinence streak days and resisted-urge counts are sent with an identifier to maintain progress; the private local journal is not part of this synchronization payload. We use this data to provide, synchronize and protect features, and for content usage statistics. Servers record request identifiers and technical errors to operate the service.
            {:else}
              <strong>Định danh, hoạt động và vận hành:</strong> Các tính năng trực tuyến có thể gửi mã tài khoản hoặc mã thiết bị, tiến trình đọc/nghe, lượt sử dụng, ghi chú và nội dung bạn chủ động lưu hoặc chia sẻ. Dữ liệu tu tập có thể phản ánh niềm tin tôn giáo. Khi dùng Thanh Tịnh trực tuyến, số ngày giữ giới và số lần vượt qua thôi thúc được gửi cùng mã định danh để duy trì tiến trình; nhật ký riêng trên máy không nằm trong dữ liệu đồng bộ này. Chúng tôi dùng dữ liệu để cung cấp, đồng bộ và bảo vệ tính năng, cùng thống kê sử dụng nội dung. Máy chủ ghi nhận mã yêu cầu và lỗi kỹ thuật để vận hành dịch vụ.
            {/if}
          </li>
        </ul>
        <p>{#if isEn}When you submit comments, replies or a community profile, we process the content, account identity and moderation status to operate the community. New comments and replies become public after approval; pending submissions and rejection reasons are visible only to their author and authorized administrators. Public names and pictures use an approved profile snapshot; changing private account information does not immediately publish the new information. Reports contain the reported target, reason and any details you enter. Account-linked block settings hide blocked members from your community views. The reporting feature does not disclose the reporter's identity to the reported member.{:else}Khi bạn gửi bình luận, trả lời hoặc hồ sơ cộng đồng, chúng tôi xử lý nội dung, danh tính tài khoản và trạng thái kiểm duyệt để vận hành cộng đồng. Bình luận và trả lời mới chỉ công khai sau khi được duyệt; bản đang chờ duyệt và lý do từ chối chỉ được hiển thị cho người gửi và quản trị viên có quyền. Tên và ảnh hiển thị công khai dùng phiên bản hồ sơ đã được duyệt; việc cập nhật thông tin tài khoản riêng không đồng nghĩa thông tin mới được công khai ngay. Báo cáo gồm nội dung được báo cáo, lý do và chi tiết bạn tự nhập; danh sách chặn được gắn với tài khoản để ẩn người bị chặn trên các bề mặt cộng đồng của bạn. Người bị báo cáo không nhận danh tính người báo cáo qua tính năng này.{/if}</p>
      </section>

      <section>
        <h2>{isEn ? '3. Device Permissions' : '3. Quyền truy cập thiết bị (Permissions)'}</h2>
        <p>
          {isEn
            ? 'The Tu Tap application requests only the minimum permissions necessary for its operation:'
            : 'Ứng dụng Tu Tập chỉ yêu cầu các quyền tối thiểu cần thiết để vận hành:'}
        </p>
        <ul>
          <li>
            {#if isEn}
              <strong>Network access (INTERNET):</strong> Used to download new books, update Dharma talk catalogs, and sync data when you are online.
            {:else}
              <strong>Quyền kết nối mạng (INTERNET):</strong> Dùng để tải nội dung sách mới, cập nhật danh mục pháp thoại và đồng bộ khi bạn trực tuyến.
            {/if}
          </li>
          <li>
            {#if isEn}
              <strong>Background audio playback:</strong> Allows you to continue listening to meditation audio, bell chimes, or Dharma talks even when the screen is turned off or when switching to another app.
            {:else}
              <strong>Phát âm thanh nền:</strong> Cho phép bạn tiếp tục nghe nhạc thiền, tiếng chuông hoặc âm thanh thiên nhiên ngay cả khi tắt màn hình hoặc chuyển sang ứng dụng khác.
            {/if}
          </li>
          <li>
            {#if isEn}
              <strong>No sensitive permissions requested:</strong> The application strictly <em>DOES NOT</em> request access to your Contacts, Precise GPS Location, Camera, or Audio Microphone.
            {:else}
              <strong>Không yêu cầu quyền nhạy cảm:</strong> Ứng dụng tuyệt đối <em>KHÔNG</em> yêu cầu quyền truy cập Danh bạ, Vị trí chính xác (GPS), Máy ảnh (Camera) hay Micro ghi âm của bạn.
            {/if}
          </li>
        </ul>
      </section>

      <section>
        <h2>{isEn ? '4. Third-Party Services' : '4. Dịch vụ của bên thứ ba'}</h2>
        <p>
          {isEn
            ? 'We may utilize reputable cloud infrastructure providers to maintain stable and reliable operations:'
            : 'Chúng tôi có thể sử dụng một số dịch vụ hạ tầng đám mây uy tín để duy trì hoạt động ổn định:'}
        </p>
        <ul>
          <li>
            {#if isEn}
              <strong>Cloudflare:</strong> Infrastructure for APIs, account data, synchronization, file storage and content delivery.
            {:else}
              <strong>Cloudflare:</strong> Hạ tầng API, dữ liệu tài khoản, đồng bộ, lưu trữ tệp và phân phối nội dung.
            {/if}
          </li>
          <li>
            {#if isEn}
              <strong>Google, Meta/Facebook and Apple:</strong> Provide optional identity authentication through their sign-in services and SDKs. The selected provider processes sign-in requests under its own privacy policy. App Store/TestFlight and Google Play provide app distribution and updates for their respective platforms.
            {:else}
              <strong>Google, Meta/Facebook và Apple:</strong> Cung cấp xác thực danh tính tùy chọn qua dịch vụ đăng nhập và SDK. Nhà cung cấp bạn chọn xử lý yêu cầu đăng nhập theo chính sách riêng của họ. App Store/TestFlight và Google Play phân phối, cập nhật ứng dụng trên từng nền tảng.
            {/if}
          </li>
          <li>
            {#if isEn}
              <strong>External links:</strong> In the "Dharma Items" or publication sections, the app may provide links to external platforms to acquire printed editions or Dharma items. When clicking these links, you will be subject to the destination platform\'s privacy policy.
            {:else}
              <strong>Liên kết ngoài (Shopee / Nền tảng phát hành):</strong> Trong mục "Thỉnh Pháp Bảo", ứng dụng có thể cung cấp liên kết dẫn tới các nền tảng thương mại để thỉnh ấn phẩm/pháp bảo. Khi nhấp vào các liên kết này, bạn sẽ chịu sự điều chỉnh bởi chính sách quyền riêng tư của nền tảng đích.
            {/if}
          </li>
        </ul>
      </section>

      <section id="xoa-tai-khoan">
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
            {isEn ? 'How to Delete Your Account and Associated Data:' : 'Hướng Dẫn Xóa Tài Khoản & Dữ Liệu Liên Quan:'}
          </h3>
          {#if isEn}
            <p style="margin-bottom: 8px;">
              <strong>1. Within the mobile app:</strong> Navigate to the <em>"Personal" (Cá nhân)</em> tab &rarr; Scroll down &rarr; Click <strong>"Delete account" (Xóa tài khoản)</strong> and confirm. The app submits an authenticated account-deletion request to the server. Apple-linked accounts may require Apple reauthentication to revoke authorization before deletion succeeds.
            </p>
            <p style="margin-bottom: 0;">
              <strong>2. Via Email / Web request:</strong> If you have uninstalled the app or cannot sign in, please email us at <strong>tutap.phatphap26@gmail.com</strong> with the subject <em>"Account Deletion Request - Tu Tap"</em> providing your registered email address. We will verify account ownership and respond with the scope and processing status of your request. Do not send passwords or verification codes.
            </p>
          {:else}
            <p style="margin-bottom: 8px;">
              <strong>1. Xóa trực tiếp trong ứng dụng:</strong> Mở ứng dụng Tu Tập &rarr; Vào mục <em>"Cá nhân"</em> &rarr; Kéo xuống dưới &rarr; Bấm <strong>"Xóa tài khoản"</strong> và xác nhận. Ứng dụng gửi yêu cầu xóa tài khoản đã xác thực tới máy chủ. Tài khoản liên kết Apple có thể cần xác thực lại bằng Apple để thu hồi quyền trước khi xóa thành công.
            </p>
            <p style="margin-bottom: 0;">
              <strong>2. Yêu cầu xóa qua Email / Web:</strong> Nếu bạn đã gỡ cài đặt ứng dụng hoặc không thể đăng nhập, vui lòng gửi email đến <strong>tutap.phatphap26@gmail.com</strong> với tiêu đề <em>"Yêu cầu xóa tài khoản Tu Tập"</em> kèm địa chỉ email bạn đã dùng để đăng nhập. Ban quản trị sẽ xác minh quyền sở hữu tài khoản và phản hồi phạm vi, trạng thái xử lý yêu cầu. Không gửi mật khẩu hoặc mã xác minh.
            </p>
          {/if}
        </div>
        <p>
          {#if isEn}
            <strong>Your Rights:</strong> To delete an account, sign in and open Account → Delete account, then follow the confirmation steps. An Apple-linked account may require Apple reauthentication before deletion can finish. After successful deletion, the account, sessions and account-owned private records are removed, along with its community profile, block relationships and reports it submitted. Text and contact details in your comments are removed or hidden; structural rows may remain so that other people's replies are preserved. Campaigns you created may remain without the creator-account link; other members' practice records, memberships and contributions are not deleted with your account. Server account deletion does not replace removal of downloads, exports or data held on other devices. If you cannot access your account, contact support for ownership verification; do not send passwords or verification codes.
          {:else}
            <strong>Quyền của bạn:</strong> Để xóa tài khoản, đăng nhập, mở Cá nhân → Xóa tài khoản và làm theo bước xác nhận. Tài khoản liên kết Apple có thể cần xác thực lại bằng Apple trước khi hoàn tất. Sau khi xóa thành công, tài khoản, phiên đăng nhập và dữ liệu riêng có quan hệ sở hữu với tài khoản được xóa; hồ sơ cộng đồng, quan hệ chặn và báo cáo do tài khoản đó gửi cũng được xóa. Phần chữ và thông tin liên hệ trong bình luận của bạn được xóa/ẩn; hàng cấu trúc có thể còn lại để không xóa trả lời của người khác. Chiến dịch bạn đã tạo có thể tiếp tục tồn tại nhưng bỏ liên kết người tạo; công phu, thành viên và đóng góp của người khác không bị xóa cùng tài khoản của bạn. Việc xóa tài khoản máy chủ không thay cho việc xóa các tệp đã tải về, bản xuất hoặc dữ liệu nằm trên thiết bị khác. Nếu không truy cập được tài khoản, liên hệ email hỗ trợ để được xác minh quyền sở hữu; không gửi mật khẩu hoặc mã xác minh.
          {/if}
        </p>
        <p>{#if isEn}You can report comments or profiles and block members from community views; blocked members can be managed in Account. Authorized administrators can review submissions and reports, reject or hide content, and restrict accounts under the community rules. Contact tutap.phatphap26@gmail.com for support or content concerns. We review and respond to requests without promising a fixed response time for every report.{:else}Bạn có thể báo cáo bình luận hoặc hồ sơ và chặn người dùng tại phần cộng đồng; quản lý danh sách chặn trong Cá nhân. Quản trị viên có quyền xem xét nội dung chờ duyệt và báo cáo, từ chối hoặc ẩn nội dung, và áp dụng hạn chế tài khoản theo quy tắc cộng đồng. Liên hệ tutap.phatphap26@gmail.com nếu cần hỗ trợ hoặc phản ánh nội dung. Chúng tôi xem xét và phản hồi theo khả năng xử lý; chính sách này không cam kết thời hạn cố định cho mọi báo cáo.{/if}</p>
      </section>

      <section>
        <h2>{isEn ? "6. Children's Privacy" : '6. Quyền riêng tư của trẻ em'}</h2>
        <p>
          {#if isEn}
            The app contains Buddhist cultural, philosophical and spiritual material. Some works describe religious hells or punishments that may be frightening or unsuitable for children. Please follow the age rating shown by your app store and consider the content before allowing a child to use the app. We do not knowingly collect personally identifiable information from children under 13. If you have concerns about a child's data, contact tutap.phatphap26@gmail.com for review and assistance.
          {:else}
            Ứng dụng có nội dung văn hóa, triết học và tâm linh Phật giáo. Một số tác phẩm mô tả địa ngục hoặc hình phạt theo tín ngưỡng, có thể gây sợ hãi hoặc không phù hợp với trẻ em. Vui lòng xem phân loại độ tuổi trên cửa hàng ứng dụng và cân nhắc nội dung trước khi cho trẻ sử dụng. Chúng tôi không cố ý thu thập thông tin nhận dạng cá nhân từ trẻ em dưới 13 tuổi. Nếu có lo ngại về dữ liệu của trẻ em, vui lòng liên hệ tutap.phatphap26@gmail.com để được xem xét và hỗ trợ.
          {/if}
        </p>
      </section>

      <section>
        <h2>{isEn ? '7. Policy Changes' : '7. Thay đổi chính sách'}</h2>
        <p>
          {#if isEn}
            We may update this Privacy Policy and Copyright Terms from time to time. Any changes will be published publicly on this page along with the latest update date.
          {:else}
            Chúng tôi có thể cập nhật Chính Sách Quyền Riêng Tư và Điều Khoản Bản Quyền này theo thời gian. Mọi thay đổi sẽ được công bố công khai trên trang này kèm ngày cập nhật mới nhất.
          {/if}
        </p>
      </section>

      <section>
        <h2>{isEn ? '8. Copyright & Non-Profit Disclaimer' : '8. Tuyên bố Bản quyền & Tôn chỉ Phi thương mại (Copyright & Non-Profit Disclaimer)'}</h2>
        <p>
          {#if isEn}
            The <strong>Tu Tap</strong> application is built entirely with the aspiration to serve the Dharma, propagate the teachings of karma, and support practitioners at home:
          {:else}
            Ứng dụng <strong>Tu Tập</strong> được xây dựng hoàn toàn với tâm nguyện phụng sự đạo pháp, hoằng dương giáo lý nhân quả và hỗ trợ đại chúng tu tập tại gia:
          {/if}
        </p>
        <ul>
          <li>
            {#if isEn}
              <strong>Non-commercial operation:</strong> The application is completely free, does not charge users, and contains no third-party monetization advertisements (AdMob / Facebook Ads).
            {:else}
              <strong>Hoạt động phi thương mại:</strong> Ứng dụng hoàn toàn miễn phí, không thu phí người dùng, không tích hợp quảng cáo kiếm tiền của bên thứ ba (AdMob / Facebook Ads).
            {/if}
          </li>
          <li>
            {#if isEn}
              <strong>Sources & Sacred texts:</strong> Buddhist scriptures, chanting rituals, and ancient moral texts belong to the public cultural and spiritual heritage (Public Domain) or have been freely printed and distributed by monastic and lay predecessors.
            {:else}
              <strong>Nguồn tư liệu & Kinh điển:</strong> Các bộ kinh điển Phật giáo, nghi thức tụng niệm và sách giáo hóa cổ đức thuộc về kho tàng di sản văn hóa tâm linh công cộng (Public Domain) hoặc được các bậc tiền bối phát tâm ấn tống lưu hành phổ thông.
            {/if}
          </li>
          <li>
            {#if isEn}
              <strong>Audio & Media:</strong> All bell and wooden fish chimes and natural meditation sounds are environmental simulations or synthesized via Web Audio algorithms. Dharma talk lectures are streamed from public archives (Archive.org / public cloud) for non-profit learning purposes.
            {:else}
              <strong>Âm thanh & Truyền thông:</strong> Toàn bộ âm thanh chuông mõ, tiếng thiền tự nhiên là âm thanh mô phỏng môi trường hoặc được tạo bằng thuật toán Web Audio. Các bài giảng Pháp thoại được phát trực tuyến từ các kho lưu trữ công cộng (Archive.org) nhằm mục đích học tập phi lợi nhuận.
            {/if}
          </li>
          <li>
            {#if isEn}
              <strong>Respect for Copyright & Takedown Procedure (Notice & Takedown):</strong> We always strive to clearly cite authors, translators, and compilers for every work. Availability online or offline does not establish permission to use a work; translations, recordings and illustrations may have separate rights. If you are the lawful copyright owner of any material and wish to amend citations or request removal from the app, please email <em>tutap.phatphap26@gmail.com</em>. We fully respect your rights and will review the request and communicate the appropriate action.
            {:else}
              <strong>Tôn trọng quyền tác giả & Quy trình gỡ bỏ (Notice & Takedown):</strong> Chúng tôi luôn nỗ lực ghi rõ danh xưng tác giả, dịch giả, soạn giả trên từng tác phẩm. Việc có thể đọc trực tuyến hoặc tải ngoại tuyến không tự xác lập quyền sử dụng tác phẩm; bản dịch, bản thu âm và hình minh họa có thể có quyền riêng. Nếu bạn là chủ sở hữu quyền tác giả hợp pháp của bất kỳ nội dung nào và có mong muốn điều chỉnh trích dẫn hoặc yêu cầu gỡ bỏ khỏi ứng dụng, xin vui lòng gửi thông báo đến email <em>tutap.phatphap26@gmail.com</em>. Chúng tôi tôn trọng tuyệt đối và sẽ xem xét yêu cầu, phản hồi hướng xử lý phù hợp.
            {/if}
          </li>
        </ul>
      </section>

      <section class="contact-box">
        <h2>{isEn ? '9. Contact Information' : '9. Thông tin liên hệ'}</h2>
        <p>
          {isEn
            ? 'If you have any questions, feedback, or support requests regarding our privacy policy, community safety or content copyright, please contact us at:'
            : 'Nếu bạn có bất kỳ thắc mắc, phản ánh hoặc yêu cầu hỗ trợ nào về chính sách quyền riêng tư, an toàn cộng đồng hay bản quyền nội dung, xin vui lòng liên hệ với chúng tôi qua:'}
        </p>
        <ul>
          <li>
            <strong>{isEn ? 'Developer:' : 'Đơn vị phát triển:'}</strong> {isEn ? 'Quang Tu' : 'Quang Từ'}
          </li>
          <li>
            <strong>{isEn ? 'Official Website:' : 'Website chính thức:'}</strong>{' '}
            <a href="https://quangtu.vn" target="_blank" rel="noreferrer">https://quangtu.vn</a>
          </li>
          <li>
            <strong>{isEn ? 'Support Email:' : 'Email hỗ trợ:'}</strong>{' '}
            <a href="mailto:tutap.phatphap26@gmail.com">tutap.phatphap26@gmail.com</a>
          </li>
        </ul>
      </section>
    </div>
  </div>
</div>

<style>
  .privacy-container {
    min-height: 100vh;
    padding: 28px 18px var(--space-page);
    background: linear-gradient(180deg, #fdfbf7 0%, #f4eee1 100%);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #2d3748;
    transition: background 0.25s ease, color 0.25s ease;
  }

  .privacy-card {
    max-width: 780px;
    width: 100%;
    background: #ffffff;
    border-radius: 16px;
    padding: 2.5rem;
    box-shadow: 0 10px 30px rgba(74, 53, 23, 0.08);
    border: 1px solid rgba(220, 205, 175, 0.4);
    transition: background 0.25s ease, border-color 0.25s ease, box-shadow 0.25s ease;
  }

  .top-nav {
    display: flex;
    width: 100%;
    max-width: 780px;
    margin-bottom: 12px;
  }

  .back-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 40px;
    padding: 8px 16px;
    background: rgba(226, 135, 67, 0.1);
    color: #b85d19;
    border: 1px solid rgba(226, 135, 67, 0.25);
    border-radius: 999px;
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .back-btn:hover {
    background: rgba(226, 135, 67, 0.2);
    transform: translateX(-2px);
  }

  .header {
    border-bottom: 2px solid #f0e6d6;
    padding-bottom: 1.5rem;
    margin-bottom: 2rem;
    text-align: center;
  }

  .badge {
    display: inline-block;
    padding: 0.25rem 0.75rem;
    background: #e28743;
    color: #fff;
    font-size: 0.75rem;
    font-weight: 700;
    border-radius: 999px;
    letter-spacing: 0.05em;
    margin-bottom: 0.75rem;
  }

  h1 {
    font-size: 1.85rem;
    font-weight: 800;
    color: #5c3c10;
    margin: 0 0 0.5rem 0;
  }

  .subtitle {
    font-size: 1.05rem;
    color: #7d6b53;
    margin: 0 0 0.5rem 0;
  }

  .meta-date {
    font-size: 0.85rem;
    color: #9c8a70;
    font-style: italic;
  }

  .content section {
    margin-bottom: 1.75rem;
  }

  h2 {
    font-size: 1.25rem;
    font-weight: 700;
    color: #6d4715;
    margin-bottom: 0.75rem;
    border-left: 4px solid #e28743;
    padding-left: 0.65rem;
  }

  p {
    line-height: 1.7;
    margin: 0 0 0.75rem 0;
    font-size: 0.975rem;
    color: #4a453e;
  }

  ul {
    margin: 0 0 0.75rem 1.25rem;
    padding: 0;
    line-height: 1.65;
  }

  li {
    margin-bottom: 0.5rem;
    font-size: 0.95rem;
    color: #4a453e;
  }

  .contact-box {
    background: #faf6ef;
    padding: 1.25rem;
    border-radius: 10px;
    border: 1px dashed #d6bca2;
    margin-top: 2rem;
  }

  .contact-box h2 {
    border-left: none;
    padding-left: 0;
    margin-top: 0;
  }

  a {
    color: #b85d19;
    text-decoration: none;
    font-weight: 600;
  }

  a:hover {
    text-decoration: underline;
  }

  /* Dark mode */
  :global([data-theme="dark"]) .privacy-container {
    background: linear-gradient(180deg, #181512 0%, #12100e 100%);
    color: #e5e0d8;
  }

  :global([data-theme="dark"]) .privacy-card {
    background: #201c18;
    border-color: rgba(255, 255, 255, 0.08);
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
  }

  :global([data-theme="dark"]) .back-btn {
    background: rgba(226, 135, 67, 0.15);
    color: #f3a660;
    border-color: rgba(226, 135, 67, 0.3);
  }

  :global([data-theme="dark"]) .header {
    border-bottom-color: rgba(255, 255, 255, 0.08);
  }

  :global([data-theme="dark"]) h1 {
    color: #f5eedf;
  }

  :global([data-theme="dark"]) .subtitle {
    color: #b5a48f;
  }

  :global([data-theme="dark"]) .meta-date {
    color: #8c7e6c;
  }

  :global([data-theme="dark"]) h2 {
    color: #f3d4a0;
  }

  :global([data-theme="dark"]) p,
  :global([data-theme="dark"]) li {
    color: #d1c8bb;
  }

  :global([data-theme="dark"]) .contact-box {
    background: #28231d;
    border-color: rgba(226, 135, 67, 0.3);
  }

  :global([data-theme="dark"]) a {
    color: #f3a660;
  }

  @media (max-width: 640px) {
    .privacy-card {
      padding: 1.5rem 1.25rem;
    }
    h1 {
      font-size: 1.45rem;
    }
  }
</style>
