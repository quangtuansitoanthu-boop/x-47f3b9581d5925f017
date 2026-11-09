import { browser } from '$app/environment';
import { goto } from '$app/navigation';
import { isNativeApp } from './native-platform';
import { dismissTopModal } from './modal-dialog';

let backButtonInitialized = false;
let backButtonInitialization: Promise<void> | undefined;
let lastBackPressTime = 0;

export async function initializeNativeBackButton(): Promise<void> {
  if (!browser || !isNativeApp() || backButtonInitialized) return;
  if (backButtonInitialization) return backButtonInitialization;

  backButtonInitialization = (async () => {
    const { App } = await import('@capacitor/app');

    await App.addListener('backButton', ({ canGoBack }: { canGoBack?: boolean }) => {
      if (dismissTopModal()) return;
      const notificationClose = document.querySelector<HTMLElement>('.notification-popover .close-popover-btn');
      if (notificationClose && notificationClose.offsetParent !== null && !notificationClose.closest('[hidden], [inert]')) {
        notificationClose.click();
        return;
      }
      for (const selector of ['#copy-options .panel-heading button', '.copy-writing .issues-heading button']) {
        const close = document.querySelector<HTMLElement>(selector);
        if (close && close.offsetParent !== null) { close.click(); return; }
      }
      const routeBack = document.querySelector('[data-practice-route-back]')
        ? document.querySelector<HTMLElement>('.tt-topbar .tt-back-btn') : null;
      if (routeBack && routeBack.offsetParent !== null) { routeBack.click(); return; }
      const readerPanelClose = document.querySelector<HTMLElement>('.pdf-bookmark-panel [aria-label="Đóng danh sách đánh dấu"], .reader-tools-panel.open .sheet-close-btn');
      if (readerPanelClose && readerPanelClose.offsetParent !== null) {
        readerPanelClose.click();
        return;
      }
      const confirmationCancel = document.querySelector<HTMLElement>('.practice-confirm .practice-confirm__actions button:first-child');
      if (confirmationCancel && confirmationCancel.offsetParent !== null) {
        confirmationCancel.click();
        return;
      }
      // 0. Kiểm tra nếu Trình phát Pháp Thoại mở rộng đang mở (.pt-fp-sheet)
      const expandedPlayer = document.querySelector<HTMLElement>('.pt-fp-sheet');
      if (expandedPlayer) {
        const collapseBtn = expandedPlayer.querySelector<HTMLElement>('.pt-fp-collapse-btn, .pt-fp-close-btn');
        if (collapseBtn && collapseBtn.offsetParent !== null) {
          collapseBtn.click();
          return;
        }
      }

      // 1. Kiểm tra Pháp Bảo Modal đang mở (.pb-overlay)
      const phapBaoModal = document.querySelector<HTMLElement>('.pb-overlay');
      if (phapBaoModal) {
        // Ưu tiên bấm nút Quay lại (Back) nếu có
        const backBtn = phapBaoModal.querySelector<HTMLElement>('.pb-btn-back, .pb-btn-header-back');
        if (backBtn && backBtn.offsetParent !== null) {
          backBtn.click();
          return;
        }
        // Nếu không có nút Back (đang ở trang chọn danh hiệu), bấm nút đóng
        const closeBtn = phapBaoModal.querySelector<HTMLElement>('.pb-close-btn, button.close, [aria-label="Đóng"], [aria-label="Close"]');
        if (closeBtn) {
          closeBtn.click();
          return;
        }
      }

      // 1.5 Kiểm tra Chế độ Lần tràng hạt hoặc Lễ Phật đang mở
      const rosaryBackBtn = document.querySelector<HTMLElement>('.tt-rosary .tt-rosary__back-btn');
      if (rosaryBackBtn && rosaryBackBtn.offsetParent !== null) {
        rosaryBackBtn.click();
        return;
      }
      const lePhatBackBtn = document.querySelector<HTMLElement>('.lp-fullscreen-back-btn');
      if (lePhatBackBtn && lePhatBackBtn.offsetParent !== null) {
        lePhatBackBtn.click();
        return;
      }
      const setupBack = document.querySelector<HTMLElement>('.lp .lp__header-left .lp__hbtn');
      if (setupBack && setupBack.offsetParent !== null) { setupBack.click(); return; }
      const practiceBack = document.querySelector<HTMLElement>('.tt-practice .ttp-back');
      if (practiceBack && practiceBack.offsetParent !== null) { practiceBack.click(); return; }

      // 2. Kiểm tra nếu có bất kỳ Modal nào khác đang mở (Login, Hộp thoại xác nhận, Lightbox ảnh, Tracker, Khuyến tu, Thanh Tịnh Tâm, v.v.)
      const openModals = Array.from(document.querySelectorAll<HTMLElement>('.modal-backdrop, .login-overlay, .reader-image-lightbox, .quote-card-overlay, .tt-overlay.open, .album-overlay, .article-admin-overlay, .admin-member-overlay, .reader-overlay, .tt-modal-overlay, .cn-modal-scrim, .admin-shell__scrim, .thanh-tinh-overlay'));
      // Child/successor overlays are rendered after their parent. Back must
      // cancel that layer first; never use a form's generic submit/OK button.
      for (const openModal of openModals.reverse()) {
        const closeBtn = openModal.querySelector<HTMLElement>('.btn-back, .btn-cancel-modal, .btn-cancel, .btn-cancel-checkin, .tt-dialog-cancel, button.close, .lightbox-close, .tt-tracker__close, .tt-rec-toggle-btn, .tt-modal-close, .admin-shell__scrim, [aria-label="Đóng"], [aria-label="Close"], [aria-label="Hủy"], [aria-label="Quay lại danh mục"], [aria-label="Quay lại"]');
        if (closeBtn && closeBtn.offsetParent !== null) {
          closeBtn.click();
          return;
        }
        if (openModal.classList.contains('admin-shell__scrim')) {
          openModal.click();
          return;
        }
        if (openModal.classList.contains('tt-modal-overlay') || openModal.classList.contains('cn-modal-scrim')) {
          openModal.click();
          return;
        }
      }

      // 3. Kiểm tra nếu Trình đọc sách (Reader) đang mở
      const readerBackEvent = new CustomEvent('quangtu:reader-back', { cancelable: true });
      window.dispatchEvent(readerBackEvent);
      if (readerBackEvent.defaultPrevented) {
        // Đã được Reader xử lý (quay về Mục lục hoặc đóng Reader về Thư viện)
        return;
      }
      const categoryBack = document.querySelector<HTMLElement>('.tt-section-view .tt-back-btn');
      if (categoryBack && categoryBack.offsetParent !== null) { categoryBack.click(); return; }
      if (document.querySelector('.tt-preview')) {
        const previewBack = document.querySelector<HTMLElement>('.tt-topbar .tt-back-btn');
        if (previewBack && previewBack.offsetParent !== null) { previewBack.click(); return; }
      }

      // 4. Nếu đang ở các trang con (Tu tập, Pháp thoại, Hướng dẫn, Cá nhân, Admin, v.v.) và có thể lùi
      if (window.location.pathname !== '/') {
        if (canGoBack) window.history.back();
        else void goto('/');
        return;
      }

      // 5. Nếu đang ở trang chủ '/' mà có URL search params (như tìm kiếm hoặc filter)
      if (window.location.pathname === '/' && window.location.search) {
        window.history.pushState(null, '', '/');
        window.dispatchEvent(new PopStateEvent('popstate'));
        return;
      }

      // 5. Nếu đang ở Trang chủ gốc (Root): Bấm lần 2 trong vòng 2 giây để thoát
      const now = Date.now();
      if (now - lastBackPressTime < 2000) {
        void App.exitApp();
      } else {
        lastBackPressTime = now;
        showToast('Nhấn Back lần nữa để thoát ứng dụng');
      }
    });
    backButtonInitialized = true;
  })().catch((err) => {
    console.warn('[native-back-button] Failed to initialize Capacitor App listener:', err);
  }).finally(() => {
    backButtonInitialization = undefined;
  });
  return backButtonInitialization;
}

function showToast(message: string): void {
  const existing = document.getElementById('native-back-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'native-back-toast';
  toast.innerText = message;
  Object.assign(toast.style, {
    position: 'fixed',
    bottom: '80px',
    left: '50%',
    transform: 'translateX(-50%)',
    backgroundColor: 'rgba(26, 26, 26, 0.92)',
    color: '#fff',
    padding: '10px 18px',
    borderRadius: '24px',
    fontSize: '14px',
    zIndex: '99999',
    boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
    pointerEvents: 'none',
    transition: 'opacity 0.25s ease',
    opacity: '1',
    fontFamily: 'system-ui, -apple-system, sans-serif'
  });
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 250);
  }, 1800);
}
