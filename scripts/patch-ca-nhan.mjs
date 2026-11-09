import fs from 'node:fs';

// 1. Patch translations.ts
const transFile = 'src/lib/i18n/translations.ts';
let trans = fs.readFileSync(transFile, 'utf8');

const viTarget = `logoutConfirmDesc: 'Bạn có chắc chắn muốn đăng xuất khỏi tài khoản trên thiết bị này?',`;
const viAddition = `
      loginApple: 'Đăng nhập bằng Apple',
      deleteAccount: 'Xóa tài khoản',
      deletingAccount: 'Đang xóa tài khoản…',
      deleteConfirmTitle: 'Xác nhận xóa tài khoản',
      deleteConfirmDesc: 'Bạn có chắc chắn muốn xóa tài khoản này không? Toàn bộ thông tin cá nhân, lịch sử đọc sách và tiến trình tu tập sẽ bị xóa vĩnh viễn và không thể khôi phục.',
      deleteConfirmButton: 'Xóa vĩnh viễn',`;

const enTarget = `logoutConfirmDesc: 'Are you sure you want to sign out on this device?',`;
const enAddition = `
      loginApple: 'Sign in with Apple',
      deleteAccount: 'Delete account',
      deletingAccount: 'Deleting account…',
      deleteConfirmTitle: 'Confirm Account Deletion',
      deleteConfirmDesc: 'Are you sure you want to permanently delete your account? All your personal information, reading history, and practice records will be irreversibly erased.',
      deleteConfirmButton: 'Delete Permanently',`;

if (!trans.includes('loginApple:')) {
  trans = trans.replace(viTarget, viTarget + viAddition);
  trans = trans.replace(enTarget, enTarget + enAddition);
  fs.writeFileSync(transFile, trans, 'utf8');
  console.log('✓ translations.ts updated');
} else {
  console.log('translations.ts already has loginApple');
}

// 2. Patch ca-nhan/+page.svelte
const caNhanFile = 'src/routes/ca-nhan/+page.svelte';
let caNhan = fs.readFileSync(caNhanFile, 'utf8');

// Ensure loginWithAppleNative import
if (!caNhan.includes('loginWithAppleNative')) {
  caNhan = caNhan.replace(
    "loginWithFacebookNative,\n    logoutNativeAuth,",
    "loginWithFacebookNative,\n    loginWithAppleNative,\n    logoutNativeAuth,"
  ).replace(
    "loginWithFacebookNative,\r\n    logoutNativeAuth,",
    "loginWithFacebookNative,\r\n    loginWithAppleNative,\r\n    logoutNativeAuth,"
  );
}

// Add state variables if not present
if (!caNhan.includes('deleteAccountModalOpen')) {
  caNhan = caNhan.replace(
    "let logoutModalOpen = $state(false);\n  let loggingOut = $state(false);",
    "let logoutModalOpen = $state(false);\n  let loggingOut = $state(false);\n  let deleteAccountModalOpen = $state(false);\n  let deletingAccount = $state(false);"
  ).replace(
    "let logoutModalOpen = $state(false);\r\n  let loggingOut = $state(false);",
    "let logoutModalOpen = $state(false);\r\n  let loggingOut = $state(false);\r\n  let deleteAccountModalOpen = $state(false);\r\n  let deletingAccount = $state(false);"
  );
}

// Add handleDeleteAccount function
if (!caNhan.includes('handleDeleteAccount')) {
  const funcCode = `  async function handleDeleteAccount() {
    if (deletingAccount) return;
    deletingAccount = true;
    try {
      await logoutNativeAuth().catch(() => undefined);
      const csrfToken = await requireBrowserCsrf().catch(() => 'mobile-session-token');
      const res = await fetchWithSessionRefresh('/api/auth/delete-account', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        feedbackMessage = data.message || 'Không thể xóa tài khoản. Vui lòng thử lại sau.';
        deletingAccount = false;
        deleteAccountModalOpen = false;
        return;
      }
      clearLocalSession();
      clearBrowserSession();
      sessionStore.value = { authenticated: false, user: null, csrfToken: null, expiresAt: null };
      deleteAccountModalOpen = false;
      if (typeof window !== 'undefined') {
        window.location.replace('/');
      }
    } catch (e: any) {
      feedbackMessage = e?.message || 'Có lỗi xảy ra khi xóa tài khoản.';
      deletingAccount = false;
    }
  }`;

  caNhan = caNhan.replace(
    'async function handleLogout() {',
    `${funcCode}\n\n  async function handleLogout() {`
  );
}

// Add Apple login button
if (!caNhan.includes('cn-btn-apple')) {
  const appleButton = `            <button
              class="cn-btn cn-btn-apple"
              type="button"
              onclick={async () => {
                if (isNativeApp() && nativePlatform() === 'ios') {
                  await loginWithAppleNative();
                } else {
                  feedbackMessage = 'Đăng nhập bằng Apple khả dụng trên thiết bị Apple.';
                  setTimeout(() => { feedbackMessage = ''; }, 3000);
                }
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.37c.62-.75 1.04-1.8 1.04-2.85 0-.15-.01-.3-.04-.44-1 .04-2.19.67-2.88 1.48-.55.63-.97 1.65-.97 2.66 0 .16.03.32.05.37 1.15.09 2.28-.57 2.8-.22z"/></svg>
              <span>{t.profile.loginApple}</span>
            </button>`;

  caNhan = caNhan.replace(
    '<span>{t.profile.loginFacebook}</span>\n            </button>',
    `<span>{t.profile.loginFacebook}</span>\n            </button>\n${appleButton}`
  ).replace(
    '<span>{t.profile.loginFacebook}</span>\r\n            </button>',
    `<span>{t.profile.loginFacebook}</span>\r\n            </button>\r\n${appleButton}`
  );
}

// Add Delete Account button in profile actions
if (!caNhan.includes('cn-btn-delete-account')) {
  const deleteBtn = `            <button
              class="cn-btn cn-btn-delete-account"
              type="button"
              onclick={() => { deleteAccountModalOpen = true; }}
            >
              <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24" aria-hidden="true"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              <span>{t.profile.deleteAccount}</span>
            </button>`;

  caNhan = caNhan.replace(
    '<span>{t.profile.logout}</span>\n            </button>',
    `<span>{t.profile.logout}</span>\n            </button>\n${deleteBtn}`
  ).replace(
    '<span>{t.profile.logout}</span>\r\n            </button>',
    `<span>{t.profile.logout}</span>\r\n            </button>\r\n${deleteBtn}`
  );
}

// Add Delete Confirmation Modal
if (!caNhan.includes('delete-confirm-title')) {
  const deleteModal = `
<!-- Delete Account Confirmation Dialog -->
{#if deleteAccountModalOpen}
  <div class="cn-modal-scrim" role="presentation" onclick={() => !deletingAccount && (deleteAccountModalOpen = false)}>
    <div class="cn-modal-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-confirm-title">
      <div class="cn-modal-icon">⚠️</div>
      <h3 id="delete-confirm-title" style="color: #dc3545;">{t.profile.deleteConfirmTitle}</h3>
      <p>{t.profile.deleteConfirmDesc}</p>
      <div class="cn-modal-actions">
        <button
          type="button"
          class="cn-btn cn-btn-outline"
          disabled={deletingAccount}
          onclick={() => deleteAccountModalOpen = false}
        >
          {t.profile.cancel}
        </button>
        <button
          type="button"
          class="cn-btn cn-btn-danger"
          style="background: #dc3545; color: #fff;"
          disabled={deletingAccount}
          onclick={handleDeleteAccount}
        >
          {deletingAccount ? t.profile.deletingAccount : t.profile.deleteConfirmButton}
        </button>
      </div>
    </div>
  </div>
{/if}
`;

  caNhan = caNhan.replace(
    '<!-- Logout Confirmation Dialog -->',
    `${deleteModal}\n<!-- Logout Confirmation Dialog -->`
  );
}

// Add CSS for apple button and delete account button
if (!caNhan.includes('.cn-btn-apple')) {
  const extraCss = `
  .cn-btn-apple {
    background: #000;
    color: #fff;
    border: 1px solid #000;
  }
  .cn-btn-apple:hover {
    background: #222;
  }
  .cn-btn-delete-account {
    flex: 0 0 auto;
    min-height: 38px;
    padding: 0 14px;
    font-size: 13px;
    font-weight: 600;
    border: 1.5px solid rgba(220, 53, 69, 0.35);
    background: rgba(220, 53, 69, 0.05);
    color: #dc3545;
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    transition: all 0.2s ease;
  }
  .cn-btn-delete-account:hover {
    background: rgba(220, 53, 69, 0.15);
    border-color: #dc3545;
  }
  :root[data-theme='dark'] .cn-btn-delete-account {
    background: rgba(255, 133, 141, 0.08);
    border-color: rgba(255, 133, 141, 0.3);
    color: #ff858d;
  }
`;

  caNhan = caNhan.replace(
    '.cn-btn-logout {',
    `${extraCss}\n  .cn-btn-logout {`
  );
}

fs.writeFileSync(caNhanFile, caNhan, 'utf8');
console.log('✓ ca-nhan/+page.svelte updated with Apple Login & Delete Account');
