<script lang="ts">
  import { createInterfaceTranslator } from '$lib/i18n/interface';
  const localizeUi = createInterfaceTranslator();
  import { acquireScrollLock } from '$lib/browser/scroll-lock';
  let releaseBodyScroll: (() => void) | null = null;
  import { onDestroy, onMount, tick } from 'svelte';
  import { goto } from '$app/navigation';
  import { fetchWithSessionRefresh, requireBrowserCsrf } from '$lib/browser/session-csrf';
  import { copyLegacyKeysToAnonymousNamespace, createPrincipalStorage } from '$lib/browser/principal-storage';
  import { LEGACY_LOCAL_STORAGE_KEYS } from '$lib/browser/storage-contract';
  import { clearBrowserSession, clearLocalSession, refreshBrowserSession, getBrowserSessionSnapshot, SESSION_CHANGE_EVENT } from '$lib/stores/session.svelte';
  import { isNativeApp, nativePlatform } from '$lib/browser/native-platform';
  import { loginWithGoogleNative, loginWithAppleNative, logoutNativeAuth } from '$lib/browser/native-auth';
  import { beginNativeAuthMutation } from '$lib/browser/native-auth-transaction';

  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import { SESSION_VERIFICATION_UNAVAILABLE } from '$lib/i18n/native-auth';

  interface Props {
    session: {
      authenticated: boolean;
      user: null | {
        id?: string;
        displayName: string;
        role: 'user' | 'ctv' | 'admin';
        email?: string;
        avatarUrl?: string;
      };
    };
  }

  type ModalMode = 'login' | 'profile' | 'logout';

  interface ActivitySummary {
    reading: string;
    albums: string;
  }

  let { session }: Props = $props();
  const localeStore = getLocaleContext();
  const t = $derived(localeStore.t);

  let activeModal = $state<ModalMode | null>(null);
  let busy = $state(false);
  let error = $state('');
  let logoutPrincipal: string | null = null;
  let logoutGeneration = 0;
  let logoutRequest: AbortController | null = null;
  let alive = true;
  function cancelStaleLogout() {
    logoutGeneration += 1; logoutRequest?.abort(); logoutRequest = null; logoutPrincipal = null;
    busy = false;
    if (activeModal === 'logout') closeModal();
  }
  $effect(() => {
    const principal = session.authenticated ? session.user?.id ?? null : null;
    if (activeModal === 'logout' && principal !== logoutPrincipal) cancelStaleLogout();
  });
  let dialog = $state<HTMLElement | null>(null);
  let avatarFailed = $state(false);
  $effect(() => {
    // Ảnh lỗi của phiên cũ không được ẩn ảnh mới sau đăng nhập hoặc đổi tài khoản.
    session.user?.id;
    session.user?.avatarUrl;
    avatarFailed = false;
  });
  let activity = $state<ActivitySummary>({
    reading: localizeUi('Chưa có sách nào'),
    albums: localizeUi('Chưa nghe album nào')
  });
  let layeredOverContent = false;
  let previousFocus: HTMLElement | null = null;
  let previousBodyOverflow = '';

  const roleLabel = $derived(
    session.user?.role === 'admin'
      ? t.profile.roleAdmin
      : session.user?.role === 'ctv'
        ? t.profile.roleCtv
        : t.profile.roleMember
  );

  function setContentModalSuspended(suspended: boolean): void {
    window.dispatchEvent(new CustomEvent('quangtu:login-modal-state', { detail: { open: suspended } }));
  }

  function openModal(mode: ModalMode, returnFocusTo?: HTMLElement): void {
    if (!activeModal) {
      previousFocus = returnFocusTo ?? document.activeElement as HTMLElement;

    }
    error = '';
    activeModal = mode;
    releaseBodyScroll ??= acquireScrollLock();
    void tick().then(() => dialog?.focus());
  }

  function show(returnFocusTo?: HTMLElement): void {
    if (activeModal) return;
    openModal('login', returnFocusTo);
  }

  function closeModal(): void {
    if (!activeModal) return;
    activeModal = null;
    if (layeredOverContent) setContentModalSuspended(false);
    layeredOverContent = false;
    releaseBodyScroll?.(); releaseBodyScroll = null;
    void tick().then(() => previousFocus?.focus());
  }

  function openProfile(returnFocusTo: HTMLElement): void {
    activity = readActivitySummary();
    avatarFailed = false;
    openModal('profile', returnFocusTo);
  }

  function showLogoutConfirm(returnFocusTo?: HTMLElement): void {
    logoutPrincipal = session.authenticated ? session.user?.id ?? null : null;
    if (!logoutPrincipal) return;
    logoutGeneration += 1;
    openModal('logout', returnFocusTo);
  }

  function readActivitySummary(): ActivitySummary {
    let reading = localizeUi('Chưa có sách nào');
    let albums = localizeUi('Chưa nghe album nào');
    const principalId = session.authenticated ? session.user?.id?.trim() : null;
    if (session.authenticated && !principalId) return { reading, albums };
    let scopedStorage: ReturnType<typeof createPrincipalStorage>;
    try {
      copyLegacyKeysToAnonymousNamespace(localStorage, [
        LEGACY_LOCAL_STORAGE_KEYS.pdfBookmarks,
        LEGACY_LOCAL_STORAGE_KEYS.bookmarks,
        LEGACY_LOCAL_STORAGE_KEYS.recentAlbums,
      ]);
      scopedStorage = createPrincipalStorage(localStorage, principalId);
    } catch {
      // Lịch sử cục bộ không được chặn truy cập tài khoản khi storage lỗi.
      return { reading, albums };
    }

    try {
      const pdfBookmarks = JSON.parse(scopedStorage.getItem(LEGACY_LOCAL_STORAGE_KEYS.pdfBookmarks) || '{}');
      const articleBookmarks = JSON.parse(scopedStorage.getItem(LEGACY_LOCAL_STORAGE_KEYS.bookmarks) || '[]');
      const pdfCount = pdfBookmarks && typeof pdfBookmarks === 'object' && !Array.isArray(pdfBookmarks)
        ? Object.keys(pdfBookmarks).length
        : 0;
      const articleCount = Array.isArray(articleBookmarks) ? articleBookmarks.length : 0;
      const total = pdfCount + articleCount;
      if (total > 0) reading = localizeUi('Đang đọc {0} sách/bài viết', total);
    } catch {
      // Keep the legacy empty-state copy when local data is malformed.
    }

    try {
      const recentAlbums = JSON.parse(scopedStorage.getItem(LEGACY_LOCAL_STORAGE_KEYS.recentAlbums) || '[]');
      if (Array.isArray(recentAlbums) && recentAlbums.length > 0) {
        albums = localizeUi('Đã nghe {0} album', recentAlbums.length);
      }
    } catch {
      // Keep the legacy empty-state copy when local data is malformed.
    }

    return { reading, albums };
  }

  async function logout(): Promise<void> {
    if (busy) return;
    const principal = logoutPrincipal, generation = logoutGeneration;
    const current = () => alive && generation === logoutGeneration && principal !== null
      && session.authenticated && session.user?.id === principal
      && getBrowserSessionSnapshot().authenticated && getBrowserSessionSnapshot().user?.id === principal;
    if (!current()) { cancelStaleLogout(); return; }
    const request = new AbortController(); logoutRequest = request;
    busy = true;
    error = '';
    let release: (() => void) | null = null;
    try {
      // Giữ phiên và CSRF đến khi server xác nhận đã thu hồi cookie.
      const csrfToken = await requireBrowserCsrf();
      if (!current() || request.signal.aborted) return;
      release = beginNativeAuthMutation();
      if (!release) throw new Error('native_auth_busy');
      const response = await fetchWithSessionRefresh('/api/auth/logout', {
        method: 'POST',
        signal: request.signal,
        headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken },
        body: JSON.stringify({ preserveSessionCookie: true })
      });
      if (!current() || request.signal.aborted) return;
      if (!response.ok) throw new Error('logout_failed');
      await logoutNativeAuth(current).catch(() => undefined);
      if (!current() || request.signal.aborted) return;
      clearLocalSession();
      clearBrowserSession();
      closeModal();
      if (typeof window !== 'undefined') {
        if (location.pathname.startsWith('/admin') || location.pathname.startsWith('/tien-do-tu-tap')) {
          window.location.replace('/');
        } else {
          window.location.reload();
        }
      }
    } catch {
      if (!current() || request.signal.aborted) return;
      error = t.profile.logoutError;
    } finally {
      release?.();
      if (current()) { busy = false; logoutRequest = null; }
    }
  }

  function trapFocus(event: KeyboardEvent): void {
    if (event.key !== 'Tab' || !dialog) return;
    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )).filter((element) => element.offsetParent !== null);
    if (focusable.length === 0) {
      event.preventDefault();
      dialog.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const focusAtDialogBoundary = document.activeElement === dialog || !dialog.contains(document.activeElement);
    if (event.shiftKey && (document.activeElement === first || focusAtDialogBoundary)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || focusAtDialogBoundary)) {
      event.preventDefault();
      first.focus();
    }
  }

  function keydown(event: KeyboardEvent): void {
    if (!activeModal) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      closeModal();
      return;
    }
    trapFocus(event);
  }

  onMount(() => {
    const sessionChanged = () => {
      const next = getBrowserSessionSnapshot();
      if (logoutPrincipal && (!next.authenticated || next.user?.id !== logoutPrincipal)) cancelStaleLogout();
    };
    const loginRequired = (event: Event) => {
      if (activeModal) return;
      const returnFocusTo = (event as CustomEvent<{ returnFocusTo?: HTMLElement }>).detail?.returnFocusTo;
      layeredOverContent = true;
      show(returnFocusTo);
      setContentModalSuspended(true);
    };
    const logoutRequired = (event: Event) => {
      if (activeModal) return;
      const returnFocusTo = (event as CustomEvent<{ returnFocusTo?: HTMLElement }>).detail?.returnFocusTo;
      showLogoutConfirm(returnFocusTo);
    };
    window.addEventListener('quangtu:login-required', loginRequired);
    window.addEventListener('quangtu:logout-required', logoutRequired);
    window.addEventListener(SESSION_CHANGE_EVENT, sessionChanged);
    if (!session.authenticated && new URL(window.location.href).searchParams.get('login') === '1') {
      queueMicrotask(() => window.dispatchEvent(new CustomEvent('quangtu:login-required')));
    }
    return () => {
      window.removeEventListener('quangtu:login-required', loginRequired);
      window.removeEventListener('quangtu:logout-required', logoutRequired);
      window.removeEventListener(SESSION_CHANGE_EVENT, sessionChanged);
    };
  });

  onDestroy(() => {
    alive = false; logoutGeneration += 1; logoutRequest?.abort();
    if (layeredOverContent) setContentModalSuspended(false);
    if (activeModal) releaseBodyScroll?.(); releaseBodyScroll = null;
  });
</script>

<svelte:window onkeydown={keydown} />

{#if session.authenticated && session.user}
  <button
    class="session-status"
    type="button"
    aria-haspopup="dialog"
    onclick={(event) => openProfile(event.currentTarget)}
  >
    <span class="session-avatar" aria-hidden="true">
      {#if session.user.avatarUrl && !avatarFailed}
        <img
          src={session.user.avatarUrl}
          alt=""
          referrerpolicy="no-referrer"
          onerror={() => (avatarFailed = true)}
        />
      {:else if session.user.displayName}
        <span class="session-avatar-initials">{session.user.displayName.trim().slice(0, 1).toUpperCase()}</span>
      {:else}
        <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z" /></svg>
      {/if}
    </span>
    <span>{session.user.displayName || t.profile.defaultUserName}</span>
  </button>
{:else}
  <a
    class="session-login"
    role="button"
    href="/api/auth/google"
    onclick={(event) => {
      event.preventDefault();
      show(event.currentTarget);
    }}
  >
    <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z" /></svg>
    {t.header.login}
  </a>
{/if}

{#if activeModal === 'login'}
  <div class="login-overlay" role="presentation" onclick={(event) => event.target === event.currentTarget && closeModal()}>
    <div class="login-dialog" data-dialog-glass role="dialog" aria-modal="true" aria-labelledby="shared-login-title" tabindex="-1" bind:this={dialog}>
      <button class="close" type="button" aria-label={t.common.close} onclick={closeModal}>
        <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" /></svg>
      </button>
      <div class="login-brand">
        <img src="/assets/branding/tu-tap-logo.png" alt="Tu tập cùng Quang Từ" width="56" height="56" />
        <h2 id="shared-login-title">{t.session.loginTitle}</h2>
        <p>{t.session.loginDesc}</p>
      </div>
      <div class="oauth-options">
        <button
          type="button"
          class="google"
          disabled={busy}
          onclick={async (e) => {
            if (busy) return;
            error = '';
            if (isNativeApp()) {
              e.preventDefault();
              busy = true;
              try {
                const res = await loginWithGoogleNative();
                if (alive && res.error) error = res.error;
              } catch { if (alive) error = SESSION_VERIFICATION_UNAVAILABLE[localeStore.current]; }
              finally { if (alive) busy = false; }
            } else {
              window.location.href = `/api/auth/google?returnTo=${encodeURIComponent(location.pathname + location.search)}`;
            }
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.16v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.16C1.43 8.55 1 10.22 1 12s.43 3.45 1.16 4.93l3.68-2.84z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.16 7.07l3.68 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
          {t.session.loginWithGoogle}
        </button>
        {#if !isNativeApp()}
        <button
          type="button"
          class="facebook"
          disabled={busy}
          onclick={() => { window.location.href = `/api/auth/facebook?returnTo=${encodeURIComponent(location.pathname + location.search)}`; }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M13.5 22v-9h3l.45-3.5H13.5V7.27c0-1.01.28-1.7 1.73-1.7h1.85V2.44a24.8 24.8 0 0 0-2.7-.14c-2.67 0-4.5 1.63-4.5 4.62V9.5h-3V13h3v9h3.62Z"/></svg>
          {t.session.loginWithFacebook || 'Đăng nhập bằng Facebook'}
        </button>
        {/if}
        {#if isNativeApp() && nativePlatform() === 'ios'}
          <button
            type="button"
            class="apple"
            disabled={busy}
            onclick={async (e) => {
              if (busy) return;
              error = '';
              e.preventDefault();
              busy = true;
              try {
                const res = await loginWithAppleNative();
                if (alive && res.error) error = res.error;
              } catch { if (alive) error = SESSION_VERIFICATION_UNAVAILABLE[localeStore.current]; }
              finally { if (alive) busy = false; }
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.37c.62-.75 1.04-1.8 1.04-2.85 0-.15-.01-.3-.04-.44-1 .04-2.19.67-2.88 1.48-.55.63-.97 1.65-.97 2.66 0 .16.03.32.05.37 1.15.09 2.28-.57 2.8-.22z"/></svg>
            {t.session.loginWithApple}
          </button>
        {/if}
      </div>
      {#if error}<p class="error" role="alert">{error}</p>{/if}
    </div>
  </div>
{:else if activeModal === 'profile' && session.user}
  <div class="login-overlay" role="presentation" onclick={(event) => event.target === event.currentTarget && closeModal()}>
    <div class="login-dialog account-dialog" data-dialog-glass role="dialog" aria-modal="true" aria-labelledby="account-title" tabindex="-1" bind:this={dialog}>
      <button class="close" type="button" aria-label={t.common.close} onclick={closeModal}>
        <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" /></svg>
      </button>
      <div class="account-avatar" aria-hidden="true">
        {#if session.user.avatarUrl && !avatarFailed}
          <img
            src={session.user.avatarUrl}
            alt=""
            referrerpolicy="no-referrer"
            onerror={() => (avatarFailed = true)}
          />
        {:else if session.user.displayName}
          <span class="account-avatar-initials">{session.user.displayName.trim().slice(0, 1).toUpperCase()}</span>
        {:else}
          <span>👤</span>
        {/if}
      </div>
      <h2 id="account-title">{session.user.displayName || t.profile.defaultUserName}</h2>
      <p class="account-email">{session.user.email || '—'}</p>
      <span class="account-role">{roleLabel}</span>
      {#if error}<p class="error" role="alert">{error}</p>{/if}

      <section class="account-activity" aria-labelledby="account-activity-title">
        <h3 id="account-activity-title">{t.session.myActivity || 'Hoạt động của bạn'}</h3>
        <p><strong>{t.session.readingBooks}</strong> {activity.reading === 'Chưa có sách nào' ? t.session.noBooksYet : activity.reading}</p>
        <p><strong>{t.session.dharmaTalks}</strong> {activity.albums === 'Chưa nghe album nào' ? t.session.noAlbumsYet : activity.albums}</p>
        <a class="account-progress-link" href="/tien-do-tu-tap" onclick={closeModal}>{t.session.viewVerifiedProgress || 'Xem tiến độ tu tập đã xác minh'}</a>
      </section>

      {#if session.user.role === 'admin' || session.user.role === 'ctv'}
        <a class="account-admin-link" href={session.user.role === 'admin' ? '/admin' : '/admin/books'}>{t.session.openAdminArea}</a>
      {/if}
      <button class="account-logout" type="button" onclick={(event) => showLogoutConfirm(event.currentTarget)}>{t.profile.logout}</button>
    </div>
  </div>
{:else if activeModal === 'logout'}
  <div class="login-overlay" role="presentation" onclick={(event) => event.target === event.currentTarget && closeModal()}>
    <div class="login-dialog logout-dialog" data-dialog-glass role="alertdialog" aria-modal="true" aria-labelledby="logout-title" aria-describedby="logout-description" tabindex="-1" bind:this={dialog}>
      <button class="close" type="button" aria-label={t.common.close} onclick={closeModal}>
        <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" /></svg>
      </button>
      <div class="logout-icon" aria-hidden="true">
        <svg width="30" height="30" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
      </div>
      <h2 id="logout-title">{t.profile.logoutConfirmTitle || 'Xác nhận đăng xuất'}</h2>
      <p id="logout-description">{t.profile.logoutConfirmDesc || 'Bạn có chắc chắn muốn đăng xuất khỏi tài khoản này?'}</p>
      {#if error}<p class="error" role="alert">{error}</p>{/if}
      <div class="logout-actions dialog-actions-balanced">
        <button class="cancel" type="button" disabled={busy} onclick={closeModal}>{t.profile.cancel}</button>
        <button class="confirm" type="button" disabled={busy} onclick={logout}>{busy ? t.profile.loggingOut : t.profile.logout}</button>
      </div>
    </div>
  </div>
{/if}

<style>
  :global(.qts-nav:has(.login-overlay)),:global(.tt-topbar:has(.login-overlay)){z-index:1100;backdrop-filter:none;-webkit-backdrop-filter:none}:global(.admin-topbar:has(.login-overlay)){z-index:11010;backdrop-filter:none;-webkit-backdrop-filter:none}.session-status,.session-login{display:inline-flex;min-height:38px;align-items:center;gap:6px;padding:0 14px;border:1.5px solid var(--border);border-radius:20px;background:var(--card);color:var(--text2);cursor:pointer;font:inherit;font-size: var(--font-size-label);font-weight:600;transition:.18s}.session-login{height:auto;min-height:0;padding:8px 16px;background:transparent;line-height:normal;text-decoration:none}.session-status:hover,.session-login:hover{border-color:var(--gold);background:var(--gold-muted);color:var(--brown)}.session-status:focus-visible,.session-login:focus-visible{outline:2px solid var(--gold);outline-offset:2px}.session-avatar{display:grid;width:22px;height:22px;overflow:hidden;place-items:center;border-radius:50%;background:var(--bg2)}.session-avatar img{width:100%;height:100%;object-fit:cover}.login-overlay{position:fixed;z-index:1000;inset:0;display:grid;place-items:center;padding:24px;background:rgba(30,20,10,.65);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}.login-dialog{position:relative;width:min(400px,100%);max-height:calc(100dvh - 48px);overflow:auto;padding:36px 32px;border:1px solid var(--dialog-surface-border,var(--border));border-radius:18px;background:var(--dialog-surface-background,var(--card));box-shadow:var(--dialog-surface-shadow,var(--shadow-xl));text-align:center;overscroll-behavior:contain;animation:modalUp .28s cubic-bezier(.34,1.2,.64,1)}.login-dialog:focus{outline:none}.login-dialog>.close{position:absolute;top:14px;right:14px;display:flex;width:32px;height:32px;align-items:center;justify-content:center;border:0;border-radius:50%;background:var(--bg2);color:var(--muted);cursor:pointer;transition:background .15s,color .15s}.login-dialog>.close:hover{background:var(--bg3);color:var(--text)}.login-brand{display:flex;align-items:center;flex-direction:column;gap:10px;margin-bottom:26px}.login-brand img{width:56px;height:56px;border-radius:14px;object-fit:cover}.login-brand h2{margin:0;color:var(--text);font-size: var(--font-size-section-title)}.login-brand p{margin:0;color:var(--muted);font-size: var(--font-size-body)}.oauth-options{display:grid;gap:10px}.google,.facebook{display:flex;width:100%;min-height:44px;align-items:center;justify-content:center;gap:10px;border:1px solid #ccc;border-radius:8px;font:inherit;font-size: var(--font-size-label);font-weight:600;text-decoration:none;transition:border-color .15s,background .15s}.google{background:#fff;color:#333}.google:hover{border-color:var(--gold);background:var(--gold-light)}.facebook{border-color:#1877f2;background:#1877f2;color:#fff}.facebook:hover{border-color:#1466d2;background:#1466d2}.error{margin:0 0 10px;color:var(--red);font-size: var(--font-size-meta)}.login-dialog :is(button,a):focus-visible{outline:2px solid var(--gold);outline-offset:2px}.account-dialog{padding:30px}.account-avatar{display:grid;width:80px;height:80px;margin:0 auto 15px;overflow:hidden;place-items:center;border-radius:50%;background:#e0e0e0;color:#777;font-size:32px}.account-avatar img{width:100%;height:100%;object-fit:cover}.account-dialog h2{margin:0 0 5px;color:var(--text);font-size:22px}.account-email{margin:0 0 8px;color:var(--muted);font-size:14px}.account-role{display:inline-flex;margin-bottom:20px;padding:4px 10px;border-radius:999px;background:var(--gold-light);color:var(--brown);font-size: var(--font-size-meta);font-weight:700}.account-activity{margin-bottom:20px;padding:15px;border-radius:8px;background:var(--bg);text-align:left;font-size: var(--font-size-body);line-height:1.6}.account-activity h3{margin:0 0 12px;padding-bottom:6px;border-bottom:1px solid var(--border);color:var(--gold);font-size: var(--font-size-card-title)}.account-activity p{margin:0 0 8px;color:var(--text2)}.account-progress-link{display:flex;min-height:44px;align-items:center;justify-content:center;margin-top:10px;border:1px solid var(--gold);border-radius:8px;background:var(--gold-light);color:var(--brown);font-size: var(--font-size-label);font-weight:700;text-decoration:none}.account-progress-link:hover{background:var(--gold-muted);transform:translateY(-1px)}.account-progress-link:active{transform:translateY(1px)}.account-admin-link,.account-logout{display:flex;width:100%;min-height:44px;align-items:center;justify-content:center;border-radius:8px;font:inherit;font-size: var(--font-size-label);font-weight:700;cursor:pointer}.account-admin-link{margin-bottom:10px;border:1px solid var(--border);background:var(--card);color:var(--text);text-decoration:none}.account-admin-link:hover{border-color:var(--gold);background:var(--gold-light)}.account-logout{border:1px solid #dc3545;background:transparent;color:#dc3545}.account-logout:hover{background:#fff0f0}.logout-dialog{width:min(380px,100%);padding:30px}.logout-icon{display:grid;width:60px;height:60px;margin:0 auto 15px;place-items:center;border-radius:50%;background:#fff0f0;color:#dc3545}.logout-dialog h2{margin:0 0 10px;color:var(--text);font-size: var(--font-size-section-title)}.logout-dialog>p:not(.error){margin:0 0 25px;color:var(--muted);font-size:15px}.logout-actions{display:flex;gap:12px}.logout-actions button{min-height:42px;flex:1;border:0;border-radius:8px;font:inherit;font-size: var(--font-size-label);font-weight:700;cursor:pointer}.logout-actions .cancel{background:#f0f0f0;color:#333}.logout-actions .confirm{background:#dc3545;color:#fff}.logout-actions button:disabled{cursor:wait;opacity:.65}@keyframes modalUp{from{opacity:0;transform:translateY(24px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)}}@keyframes slideUp{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}@media(max-width:768px){.login-overlay{align-items:end;padding:0}.login-dialog{width:100%;max-width:100%;max-height:92dvh;padding:28px 22px max(env(safe-area-inset-bottom,24px),28px);border-radius:22px 22px 0 0;animation:slideUp .28s cubic-bezier(.34,1.2,.64,1)}.account-dialog,.logout-dialog{padding-top:32px}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto}.login-dialog{animation:none}.session-status,.session-login,.account-progress-link{transition:none}.account-progress-link:hover,.account-progress-link:active{transform:none}}
.apple{display:flex;width:100%;min-height:44px;align-items:center;justify-content:center;gap:10px;border:1px solid #000;border-radius:8px;background:#000;color:#fff;font:inherit;font-size: var(--font-size-label);font-weight:600;cursor:pointer}.apple:hover{background:#222}
.session-avatar-initials{display:grid;width:100%;height:100%;place-items:center;background:var(--gold);color:#fff;font-size:11px;font-weight:700}
.account-avatar-initials{display:grid;width:100%;height:100%;place-items:center;background:linear-gradient(135deg,var(--gold) 0%,#b8832a 100%);color:#fff;font-size:32px;font-weight:700}
.login-dialog{min-width:0;overflow-wrap:break-word}
.session-status{min-width:0}
.session-status>.session-avatar{flex-shrink:0}
.session-status>span:last-child{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
</style>
