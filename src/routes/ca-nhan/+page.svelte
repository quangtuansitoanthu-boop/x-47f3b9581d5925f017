<script lang="ts">
  import { sessionStatusCopy } from '$lib/i18n/session-status';
  import { SESSION_VERIFICATION_UNAVAILABLE } from '$lib/i18n/native-auth';
  import { uiFontScale, setUiFontScale, UI_FONT_SCALE_MIN, UI_FONT_SCALE_MAX, UI_FONT_SCALE_STEP } from '$lib/browser/ui-font-scale';
  import { uiFontScaleCopy } from '$lib/i18n/ui-font-scale';
  import { uiMotion, setUiMotion } from '$lib/browser/ui-motion';
  import { meditationTabCopy } from '$lib/i18n/ui-copy';
  import { quoteCardCopy } from '$lib/i18n/quote-card';
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { getGuideNavigationCopy } from '$lib/i18n/guide-navigation';
  import { getSessionContext, clearLocalSession, clearBrowserSession, SESSION_CHANGE_EVENT } from '$lib/stores/session.svelte';
  import { getThemeContext } from '$lib/stores/theme.svelte';
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import { isNativeApp, nativePlatform } from '$lib/browser/native-platform';
  import { beginNativeAuthMutation } from '$lib/browser/native-auth-transaction';
  import {
    loginWithGoogleNative,
    loginWithFacebookNative,
    loginWithAppleNative,
    authorizeAppleAccountDeletion,
    logoutNativeAuth,
  } from '$lib/browser/native-auth';
  import { fetchWithSessionRefresh, requireBrowserCsrf } from '$lib/browser/session-csrf';
  import { resolveApiUrl } from '$lib/browser/native-api';
  import { triggerHaptic } from '$lib/utils/haptics';
  import { doctrinalGuideSections } from '$lib/content/guide-doctrinal-content';
  import { enDoctrinalGuideSections } from '$lib/content/guide-content.en';
  import '$lib/styles/settings-hub.css';
  import SettingsSection from '$lib/components/shared/SettingsSection.svelte';
  import { settingsHubCopy } from '$lib/i18n/settings-hub';
  import { userTestimonials, userTestimonialsCopy } from '$lib/i18n/user-testimonials';
  import PracticeReminderCard from '$lib/components/practice/reminder/PracticeReminderCard.svelte';
  import FeedbackEmailModal from '$lib/components/feedback/FeedbackEmailModal.svelte';
  import { formatVietnameseFullName } from '$lib/utils/vietnamese-name';
  import { getCachedInstallCount, fetchInstallCount, formatInstallNumber } from '$lib/browser/app-stats';

  const sessionStore = getSessionContext();
  const themeStore = getThemeContext();
  const localeStore = getLocaleContext();
  const t = $derived(localeStore.t);
  const uiFontCopy = $derived(uiFontScaleCopy[localeStore.current === 'en' ? 'en' : 'vi']);
  let activeSettingsSection = $state('');
  const hub = $derived(settingsHubCopy[localeStore.current === 'en' ? 'en' : 'vi']);
  const testimonialsCopy = $derived(userTestimonialsCopy[localeStore.current === 'en' ? 'en' : 'vi']);
  const displaySummary = $derived(`${themeStore.mode === 'dark' ? t.settings.themeDark : themeStore.mode === 'light' ? t.settings.themeLight : t.settings.themeAuto} · ${localeStore.current === 'en' ? 'English' : 'Tiếng Việt'} · ${Math.round($uiFontScale * 100)}%`);
  const uiFontPercent = $derived(Math.round($uiFontScale * 100));
  const guideCopy = $derived(getGuideNavigationCopy(localeStore.current === 'en'));
  const session = $derived(sessionStore.value);

  // Tab đang hoạt động: 'main' (menu các tab to) hoặc 'account' | 'settings' | 'author'
  const rawTab = $derived(page.url.searchParams.get('tab') || 'main');
  const currentTab = $derived(rawTab === 'personal-admin' ? 'account' : rawTab);

  const role = $derived(session.user?.role ?? 'user');
  const isAdminOrCtv = $derived(role === 'admin' || role === 'ctv');
  const roleLabel = $derived(
    role === 'admin' ? t.profile.roleAdmin : role === 'ctv' ? t.profile.roleCtv : t.profile.roleMember
  );

  // Cài đặt đọc sách
  let fontSize = $state(15);
  let fontFamily = $state('bookerly');
  let background = $state('cream');
  let lineHeight = $state(1.9);
  let bold = $state(false);
  let installCount = $state(getCachedInstallCount());
  const formattedInstallCount = $derived(formatInstallNumber(installCount, localeStore.current));

  // Modal & UI State
  let logoutModalOpen = $state(false);
  let loggingOut = $state(false);
  let logoutError = $state('');
  let logoutPrincipal: string | null = null;
  let logoutGeneration = 0;
  let logoutRequest: AbortController | null = null;
  let accountAlive = true;
  function cancelStaleLogout() {
    logoutGeneration += 1; logoutRequest?.abort(); logoutRequest = null;
    logoutPrincipal = null; logoutModalOpen = false; loggingOut = false; logoutError = '';
  }
  function openLogoutModal() {
    logoutPrincipal = sessionStore.value.authenticated ? sessionStore.value.user?.id ?? null : null;
    if (!logoutPrincipal) return;
    logoutGeneration += 1; logoutModalOpen = true;
  }
  let deleteAccountModalOpen = $state(false);
  let deletingAccount = $state(false);
  let deleteAccountPrincipal = $state<string | null>(null);
  let deleteAccountGeneration = 0;
  let feedbackEmailModalOpen = $state(false);
  let expectedDeleteCode = $state('');
  let deleteConfirmationInput = $state('');
  const isDeleteCodeMatched = $derived(
    Boolean(expectedDeleteCode && deleteConfirmationInput.trim().toUpperCase() === expectedDeleteCode.toUpperCase())
  );

  function generateDeleteCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let rand = '';
    for (let i = 0; i < 11; i++) {
      rand += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `XOA-TK-${rand.slice(0, 4)}-${rand.slice(4, 8)}-${rand.slice(8, 11)}`;
  }

  function openDeleteAccountModal(): void {
    deleteAccountPrincipal = sessionStore.value.authenticated ? sessionStore.value.user?.id ?? null : null;
    if (!deleteAccountPrincipal) return;
    deleteAccountGeneration += 1;
    expectedDeleteCode = generateDeleteCode();
    deleteConfirmationInput = '';
    deleteAccountModalOpen = true;
  }
  $effect(() => {
    const principal = session.authenticated ? session.user?.id ?? null : null;
    if (deleteAccountModalOpen && principal !== deleteAccountPrincipal) {
      deleteAccountGeneration += 1;
      deleteAccountModalOpen = false;
      deletingAccount = false;
      deleteAccountPrincipal = null;
      expectedDeleteCode = '';
      deleteConfirmationInput = '';
    }
  });
  let feedbackMessage = $state('');
  let settingsFeedbackTimer: ReturnType<typeof setTimeout> | null = null;
  let authBusy = $state(false);
  let avatarFailed = $state(false);
  $effect(() => {
    // Đổi ảnh hoặc tài khoản phải bỏ trạng thái tải lỗi của ảnh trước.
    session.user?.id;
    session.user?.avatarUrl;
    avatarFailed = false;
  });

  // Lấy dữ liệu Giới thiệu tác giả trực tiếp từ Cẩm nang Hướng dẫn
  const authorSection = $derived(
    localeStore.current === 'en'
      ? enDoctrinalGuideSections.find((s) => s.id === 'gioi-thieu-tac-gia')
      : doctrinalGuideSections.find((s) => s.id === 'gioi-thieu-tac-gia')
  );
  const authorTopic = $derived(authorSection?.topics?.[0]);
  const authorParagraphs = $derived(
    authorTopic?.blocks?.filter((b) => b.type === 'paragraph') ?? []
  );
  const authorLinks = $derived(
    authorTopic?.blocks?.filter((b) => b.type === 'link') ?? []
  );

  function getUserGreetingName(user?: { displayName?: string; email?: string } | null): string {
    if (!user) return t.profile.defaultUserName || 'Phật tử';
    const dn = user.displayName?.trim();
    const email = user.email?.trim() || '';

    // Nếu displayName có và không phải là email, ưu tiên trả về displayName đã chuẩn hoá Họ Tên
    if (dn && !dn.includes('@')) {
      return formatVietnameseFullName(dn);
    }

    const lowerEmail = email.toLowerCase();
    if (lowerEmail === 'tutap.phatphap26@gmail.com' || lowerEmail.includes('quangtu')) {
      return 'Quang Từ';
    }
    if (lowerEmail === 'chienqan@gmail.com') {
      return 'Chiến An';
    }

    if (email && email.includes('@')) {
      const localPart = email.split('@')[0];
      const formatted = localPart
        .replace(/[._-]+/g, ' ')
        .split(' ')
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
      if (formatted) return formatVietnameseFullName(formatted);
    }
    return (dn && !dn.includes('@')) ? formatVietnameseFullName(dn) : (t.profile.defaultUserName || 'Phật tử');
  }

  const userGreetingName = $derived(getUserGreetingName(session.user));

  function getInitials(name?: string): string {
    if (!name) return 'PT';
    const clean = name.includes('@') ? name.split('@')[0] : name;
    const parts = clean.trim().split(/[\s._-]+/).filter(Boolean);
    if (parts.length === 0) return 'PT';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  const fontOptions = $derived([
    { key: 'bookerly', label: t.settings.fontBookerly, style: 'font-family: Bookerly, Georgia, serif' },
    { key: 'merriweather', label: t.settings.fontMerriweather, style: 'font-family: Merriweather, serif' },
    { key: 'literata', label: t.settings.fontLiterata, style: 'font-family: Literata, serif' },
    { key: 'be-vietnam-pro', label: t.settings.fontBeVietnam, style: 'font-family: "Be Vietnam Pro", sans-serif' },
  ]);

  const backgroundOptions = $derived([
    { key: 'cream', label: t.settings.bgCream, bg: '#f4ecd8', text: '#2d2417', border: '#dfd2ba' },
    { key: 'white', label: t.settings.bgWhite, bg: '#ffffff', text: '#111111', border: '#e0e0e0' },
    { key: 'gray', label: t.settings.bgGray, bg: '#e8e8e8', text: '#1a1a1a', border: '#cccccc' },
    { key: 'dark', label: t.settings.bgDark, bg: '#181512', text: '#e6ded4', border: '#332b24' },
  ]);

  const fontSizePresets = $derived([
    { size: 15, label: t.settings.sizeSmall },
    { size: 17, label: t.settings.sizeMedium },
    { size: 19, label: t.settings.sizeLarge },
    { size: 22, label: t.settings.sizeXLarge },
  ]);

  const lineHeightOptions = $derived([
    { val: 1.6, label: t.settings.lhCompact },
    { val: 1.9, label: t.settings.lhStandard },
    { val: 2.2, label: t.settings.lhRelaxed },
  ]);

  onMount(() => {
    try {
    if (typeof localStorage !== 'undefined') {
      fontSize = Math.min(45, Math.max(13, Number(localStorage.getItem('tutam_read_fontsize') || 15) || 15));
      fontFamily = localStorage.getItem('tutam_read_font') || 'bookerly';
      background = localStorage.getItem('tutam_read_bg') || 'cream';
      lineHeight = Number(localStorage.getItem('tutam_read_line_height') || 1.9) || 1.9;
      bold = localStorage.getItem('tutam_read_bold') === '1';
    }
    } catch { /* Keep in-memory defaults and let the remaining account initialization run. */ }
    const sessionChanged = () => {
      const current = sessionStore.value;
      if (logoutPrincipal && (!current.authenticated || current.user?.id !== logoutPrincipal)) cancelStaleLogout();
    };
    window.addEventListener(SESSION_CHANGE_EVENT, sessionChanged);
    // Lấy số liệu cài đặt (ưu tiên cache 12h, offline fallback 1230, không làm phiền D1)
    fetchInstallCount().then((count) => {
      if (count && count >= 1230) {
        installCount = count;
      }
    }).catch(() => {});
    return () => window.removeEventListener(SESSION_CHANGE_EVENT, sessionChanged);
  });

  function saveSettings() {
    let saved = false;
    try {
    if (typeof localStorage === 'undefined') throw new Error('storage_unavailable');
    localStorage.setItem('tutam_read_fontsize', String(fontSize));
    localStorage.setItem('tutam_read_font', fontFamily);
    localStorage.setItem('tutam_read_bg', background);
    const isDark = typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark';
    if (isDark || background === 'dark') {
      localStorage.setItem('tutam_read_bg_dark', background);
    }
    localStorage.setItem('tutam_read_line_height', String(lineHeight));
    localStorage.setItem('tutam_read_bold', bold ? '1' : '0');
    if (background === 'cream') localStorage.setItem('tutam_pdf_paper_mode', 'sepia');
    else if (background === 'white') localStorage.setItem('tutam_pdf_paper_mode', 'default');
    saved = true;
    } catch { /* A multi-key write can be partial; never claim all settings were persisted. */ }
    feedbackMessage = saved ? t.settings.saveSuccess : t.settings.saveFailed;
    if (settingsFeedbackTimer !== null) clearTimeout(settingsFeedbackTimer);
    settingsFeedbackTimer = setTimeout(() => { feedbackMessage = ''; }, 2500);
  }

  function setFont(f: string) {
    fontFamily = f;
    saveSettings();
  }

  function setBg(b: string) {
    background = b;
    saveSettings();
  }

  function setSize(s: number) {
    fontSize = Math.min(36, Math.max(13, s));
    saveSettings();
  }

  function setLineHeight(lh: number) {
    lineHeight = lh;
    saveSettings();
  }

  function toggleBold() {
    bold = !bold;
    saveSettings();
  }

  function openTab(tabKey: string) {
    triggerHaptic('light');
    if (tabKey === 'guide') {
      void goto('/huong-dan?phan=ung-dung');
    } else if (tabKey === 'study-guide') {
      void goto('/huong-dan?phan=tu-hoc');
    } else if (tabKey === 'privacy') {
      void goto('/chinh-sach-bao-mat');
    } else {
      void goto(`/ca-nhan?tab=${tabKey}`);
    }
  }

  function goBackToMain() {
    triggerHaptic('light');
    if (typeof window !== 'undefined' && window.history.length > 1) {
      window.history.back();
    } else {
      void goto('/ca-nhan');
    }
  }

    let copiedEmail = $state(false);
  let copiedEmailError = $state(false);
  let copyingEmail = $state(false);
  let emailCopyTimer: ReturnType<typeof setTimeout> | null = null;
  let emailCopyAttempt = 0;
  onDestroy(() => {
    accountAlive = false; cancelStaleLogout();
    if (settingsFeedbackTimer !== null) clearTimeout(settingsFeedbackTimer);
    deleteAccountGeneration += 1;
    emailCopyAttempt += 1;
    if (emailCopyTimer !== null) clearTimeout(emailCopyTimer);
  });

  function openFeedbackEmail() {
    triggerHaptic('light');
    const email = 'tutap.phatphap26@gmail.com';
    const subject = encodeURIComponent('Góp ý ứng dụng Tu Tập');
    const mailtoUrl = "mailto:" + email + "?subject=" + subject;
    if (typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent)) {
      const intentUrl = "intent://co?to=" + email + "&subject=" + subject + "#Intent;scheme=googlegmail;package=com.google.android.gm;S.browser_fallback_url=" + encodeURIComponent(mailtoUrl) + ";end";
      window.location.href = intentUrl;
      setTimeout(() => {
        window.location.href = mailtoUrl;
      }, 700);
      return;
    }
    window.location.href = mailtoUrl;
  }

  async function copyFeedbackEmail() {
    if (copyingEmail) return;
    triggerHaptic('light');
    if (emailCopyTimer !== null) clearTimeout(emailCopyTimer);
    copiedEmail = false;
    copiedEmailError = false;
    copyingEmail = true;
    const attempt = ++emailCopyAttempt;
    try {
      if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) throw new Error('clipboard_unavailable');
      await navigator.clipboard.writeText('tutap.phatphap26@gmail.com');
      if (attempt !== emailCopyAttempt) return;
      copiedEmail = true;
      feedbackMessage = '📋 Đã sao chép email: tutap.phatphap26@gmail.com';
      emailCopyTimer = setTimeout(() => { copiedEmail = false; emailCopyTimer = null; }, 2500);
    } catch {
      if (attempt === emailCopyAttempt) copiedEmailError = true;
    } finally {
      if (attempt === emailCopyAttempt) copyingEmail = false;
    }
  }

  function handleOpenAuthorLink(url: string) {
    triggerHaptic('light');
    if (!url) return;

    const isAndroid = typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);
    const isIOS = typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);

    if (url.includes('m.me')) {
      if (isAndroid) {
        const rawNoProtocol = url.replace(/^https?:\/\//, '');
        const intentUrl = `intent://${rawNoProtocol}#Intent;scheme=https;package=com.facebook.orca;S.browser_fallback_url=${encodeURIComponent(url)};end`;
        window.location.href = intentUrl;
        return;
      }
      if (isIOS) {
        window.location.href = 'fb-messenger://user-thread/tranan.buhd';
        setTimeout(() => {
          window.location.href = url;
        }, 800);
        return;
      }
    }

    if (url.includes('facebook.com')) {
      if (isAndroid) {
        const rawNoProtocol = url.replace(/^https?:\/\//, '');
        const intentUrl = `intent://${rawNoProtocol}#Intent;scheme=https;package=com.facebook.katana;S.browser_fallback_url=${encodeURIComponent(url)};end`;
        window.location.href = intentUrl;
        return;
      }
      if (isIOS) {
        window.location.href = 'fb://profile/tranan.buhd';
        setTimeout(() => {
          window.location.href = url;
        }, 800);
        return;
      }
    }

    if (typeof window !== 'undefined') {
      const opened = window.open(url, '_blank', 'noopener,noreferrer');
      if (!opened || opened.closed || typeof opened.closed === 'undefined') {
        window.location.href = url;
      }
    }
  }

  async function handleDeleteAccount() {
    if (deletingAccount || !isDeleteCodeMatched) return;
    const principal = deleteAccountPrincipal;
    const generation = deleteAccountGeneration;
    const isCurrent = () => Boolean(principal && generation === deleteAccountGeneration
      && sessionStore.value.authenticated && sessionStore.value.user?.id === principal);
    if (!isCurrent()) return;
    deletingAccount = true;
    let release: (() => void) | null = null;
    try {
      const csrfToken = await requireBrowserCsrf();
      if (!isCurrent()) return;
      release = beginNativeAuthMutation();
      if (!release) throw new Error(SESSION_VERIFICATION_UNAVAILABLE[localeStore.current]);
      let res = await fetchWithSessionRefresh('/api/auth/delete-account', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken },
        body: JSON.stringify({ preserveSessionCookie: true }),
      });
      if (!isCurrent()) return;
      if (!res.ok) {
        let data = await res.json().catch(() => ({}));
        if (!isCurrent()) return;
        if (res.status === 409 && (data.code ?? data.error?.code) === 'apple_reauthentication_required'
          && isNativeApp() && nativePlatform() === 'ios') {
          const credentials = await authorizeAppleAccountDeletion(isCurrent);
          if (!isCurrent()) return;
          const retryCsrfToken = await requireBrowserCsrf();
          if (!isCurrent()) return;
          res = await fetchWithSessionRefresh('/api/auth/delete-account', {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-csrf-token': retryCsrfToken },
            body: JSON.stringify({ ...credentials, preserveSessionCookie: true }),
          });
          if (!isCurrent()) return;
          if (!res.ok) {
            data = await res.json().catch(() => ({}));
            if (!isCurrent()) return;
          }
        }
        if (!res.ok) {
          feedbackMessage = data.message || data.error?.message || 'Không thể xóa tài khoản. Vui lòng thử lại sau.';
          deletingAccount = false;
          deleteAccountModalOpen = false;
          return;
        }
      }
      // Chỉ xóa phiên nhà cung cấp sau khi server đã chấp nhận xóa tài khoản.
      await logoutNativeAuth(isCurrent).catch(() => undefined);
      if (!isCurrent()) return;
      clearLocalSession();
      clearBrowserSession();
      deleteAccountModalOpen = false;
      if (typeof window !== 'undefined') {
        window.location.replace('/');
      }
    } catch (e: any) {
      if (!isCurrent()) return;
      feedbackMessage = e?.message || 'Có lỗi xảy ra khi xóa tài khoản.';
      deletingAccount = false;
      deleteAccountModalOpen = false;
    } finally {
      release?.();
      if (generation === deleteAccountGeneration) deletingAccount = false;
    }
  }

  async function handleLogout() {
    if (loggingOut) return;
    const principal = logoutPrincipal, generation = logoutGeneration;
    const current = () => accountAlive && generation === logoutGeneration && principal !== null
      && sessionStore.value.authenticated && sessionStore.value.user?.id === principal;
    if (!current()) { cancelStaleLogout(); return; }
    const request = new AbortController(); logoutRequest = request;
    loggingOut = true;
    logoutError = '';
    let release: (() => void) | null = null;
    try {
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
      logoutModalOpen = false;
      if (typeof window !== 'undefined') {
        window.location.replace('/');
      }
    } catch {
      if (!current() || request.signal.aborted) return;
      logoutError = localeStore.current === 'en'
        ? 'Unable to sign out. Please check your connection and try again.'
        : 'Chưa thể đăng xuất. Vui lòng kiểm tra kết nối rồi thử lại.';
    } finally {
      release?.();
      if (current()) { loggingOut = false; logoutRequest = null; }
    }
  }

  const previewBgColor = $derived(
    background === 'white' ? '#ffffff' :
    background === 'gray' ? '#f0f0f0' :
    background === 'dark' ? '#181512' : '#f7f0df'
  );
  const previewTextColor = $derived(background === 'dark' ? '#ece5db' : '#252019');
</script>

<svelte:head>
  <title>
    {currentTab === 'account'
      ? `${t.profile.tabLoginTitle} — Quang Từ`
      : currentTab === 'personal-admin'
      ? `${t.profile.tabPersonalAdminTitle} — Quang Từ`
      : currentTab === 'settings'
      ? `${t.profile.tabAppSettingsTitle} — Quang Từ`
      : currentTab === 'author'
      ? `${t.profile.tabAuthorTitle} — Quang Từ`
      : currentTab === 'testimonials'
      ? `${testimonialsCopy.title} — Quang Từ`
      : isAdminOrCtv
      ? `${t.settings.adminTitle} — Quang Từ`
      : `${t.settings.title} — Quang Từ`}
  </title>
</svelte:head>

<div class="cn-page" class:cn-page--main={currentTab === 'main'}>
  <div class="cn-container" class:cn-container--main={currentTab === 'main'}>
    <!-- ========================================================================= -->
    <!-- 1. MÀN HÌNH CHÍNH (MAIN MENU) VỚI CÁC TAB TO                             -->
    <!-- ========================================================================= -->
    {#if currentTab === 'main'}
      <!-- Top Heading Bar Màn Hình Chính -->
      <div class="cn-page-heading">
        <div class="cn-heading-left">
          <button
            type="button"
            class="cn-back-btn"
            onclick={() => {
              if (typeof window !== 'undefined' && window.history.length > 1) {
                window.history.back();
              } else {
                void goto('/');
              }
            }}
            aria-label="Quay lại Trang chủ"
            title="Quay lại Trang chủ"
          >
            <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 class="cn-page-title">{isAdminOrCtv ? t.settings.adminTitle : t.settings.title}</h1>
            <p class="cn-page-sub">{t.settings.subtitle}</p>
          </div>
        </div>
        <button
          class="cn-theme-pill"
          type="button"
          onclick={() => themeStore.toggle()}
          title={t.settings.themePillTitle}
        >
          {themeStore.mode === 'auto' ? t.settings.themePillAuto : themeStore.value === 'dark' ? t.settings.themePillDark : t.settings.themePillLight}
        </button>
      </div>

      <!-- Banner Lời Chào Trang Trọng nếu đã đăng nhập -->
      {#if session.authenticated && session.user}
        <div class="cn-welcome-banner">
          <div class="cn-welcome-avatar">
            {#if session.user?.avatarUrl && !avatarFailed}
              <img
                src={session.user.avatarUrl}
                alt={session.user.displayName || t.profile.defaultUserName}
                class="cn-welcome-avatar-img"
                referrerpolicy="no-referrer"
                onerror={() => (avatarFailed = true)}
              />
            {:else}
              <span class="cn-welcome-initials">{getInitials(userGreetingName)}</span>
            {/if}
          </div>
          <div class="cn-welcome-body">
            <p class="cn-welcome-greeting">
              {localeStore.current === 'en' ? 'Hello' : 'Xin chào'} <strong class="cn-welcome-name">{userGreetingName}</strong>, {localeStore.current === 'en' ? 'wishing you a peaceful day and diligent practice' : 'chúc bạn một ngày mới an lạc, tinh tấn tu tập'} 🙏
            </p>
            <div class="cn-welcome-meta">
              <span class="cn-role-badge" class:badge-admin={role === 'admin'} class:badge-ctv={role === 'ctv'}>
                {roleLabel}
              </span>
              <span class="cn-status-badge">
                <span class="cn-status-dot"></span>
                <span>{sessionStore.verification === 'cached' ? sessionStatusCopy[localeStore.current].cached : t.profile.statusActive}</span>
              </span>
            </div>
          </div>
        </div>
      {/if}

      <!-- DANH SÁCH CÁC TAB TO (BIG TAB CARDS) -->
      <section class="cn-personal-library" aria-labelledby="cn-personal-library-title">
        <h2 id="cn-personal-library-title">{localeStore.current === 'en' ? 'Your journey' : 'Hành trình của bạn'}</h2>
        <div class="cn-personal-shortcuts">
          <a href="/tien-do-tu-tap"><span>{localeStore.current === 'en' ? 'Practice progress' : 'Tiến độ tu tập'}</span><span aria-hidden="true">↗</span></a>
          <a href="/trich-dan-cua-toi"><span>{localeStore.current === 'en' ? 'Saved quotes' : 'Trích dẫn đã lưu'}</span><span aria-hidden="true">↗</span></a>
          <a href="/kinh-sach#reading-library"><span>{localeStore.current === 'en' ? 'Continue reading' : 'Sách đang đọc'}</span><span aria-hidden="true">↗</span></a>
          <a href="/tien-do-tu-tap#practice-campaigns-title"><span>{t.practice.joinCommunityTitle}</span><span aria-hidden="true">↗</span></a>
        </div>
      </section>
      <div class="cn-big-tabs-list" role="navigation" aria-label="Menu cá nhân">
        <!-- TAB TO 1: TÀI KHOẢN (GỘP TÀI KHOẢN & CÁ NHÂN / QUẢN TRỊ) -->
        <button
          type="button"
          class="cn-big-tab-card cn-tab-theme-auth"
          onclick={() => openTab('account')}
        >
          <div class="cn-big-tab-icon-wrap" aria-hidden="true">
            <span class="cn-big-tab-icon">👤</span>
          </div>
          <div class="cn-big-tab-content">
            <h2 class="cn-big-tab-title">{t.profile.tabLoginTitle}</h2>
            {#if session.authenticated && session.user}
              <p class="cn-big-tab-desc">
                {localeStore.current === 'en' ? 'Welcome, ' : 'Xin chào '} <strong class="cn-tab-email-text">{userGreetingName}</strong> · {roleLabel}
              </p>
            {:else}
              <p class="cn-big-tab-desc">{t.profile.tabLoginSub}</p>
            {/if}
          </div>
          <span class="cn-big-tab-arrow" aria-hidden="true">›</span>
        </button>

        <!-- TAB TO 3: CÀI ĐẶT ỨNG DỤNG -->
        <button
          type="button"
          class="cn-big-tab-card cn-tab-theme-settings"
          onclick={() => openTab('settings')}
        >
          <div class="cn-big-tab-icon-wrap" aria-hidden="true">
            <span class="cn-big-tab-icon">🎨</span>
          </div>
          <div class="cn-big-tab-content">
            <h2 class="cn-big-tab-title">{t.profile.tabAppSettingsTitle}</h2>
            <p class="cn-big-tab-desc">{t.profile.tabAppSettingsSub}</p>
          </div>
          <span class="cn-big-tab-arrow" aria-hidden="true">›</span>
        </button>

        <button type="button" class="cn-big-tab-card cn-tab-theme-guide" onclick={() => openTab('study-guide')}>
          <div class="cn-big-tab-icon-wrap" aria-hidden="true"><span class="cn-big-tab-icon">📖</span></div>
          <div class="cn-big-tab-content">
            <h2 class="cn-big-tab-title">{guideCopy.studyTitle}</h2>
            <p class="cn-big-tab-desc">{guideCopy.studyDescription}</p>
          </div>
          <span class="cn-big-tab-arrow" aria-hidden="true">›</span>
        </button>
        <!-- TAB TO 4: HƯỚNG DẪN SỬ DỤNG APP -->
        <button
          type="button"
          class="cn-big-tab-card cn-tab-theme-guide"
          onclick={() => openTab('guide')}
        >
          <div class="cn-big-tab-icon-wrap" aria-hidden="true">
            <span class="cn-big-tab-icon">📱</span>
          </div>
          <div class="cn-big-tab-content">
            <h2 class="cn-big-tab-title">{guideCopy.appTitle}</h2>
            <p class="cn-big-tab-desc">{guideCopy.appDescription}</p>
          </div>
          <span class="cn-big-tab-arrow" aria-hidden="true">›</span>
        </button>

        <!-- TAB TO 5: CHÍNH SÁCH BẢO MẬT -->
        <button
          type="button"
          class="cn-big-tab-card cn-tab-theme-privacy"
          onclick={() => openTab('privacy')}
        >
          <div class="cn-big-tab-icon-wrap" aria-hidden="true">
            <span class="cn-big-tab-icon">🛡️</span>
          </div>
          <div class="cn-big-tab-content">
            <h2 class="cn-big-tab-title">{t.profile.tabPrivacyTitle}</h2>
            <p class="cn-big-tab-desc">{t.profile.tabPrivacySub}</p>
          </div>
          <span class="cn-big-tab-arrow" aria-hidden="true">›</span>
        </button>

        <!-- TAB TO 6: GIỚI THIỆU VỀ TÁC GIẢ -->
        <button
          type="button"
          class="cn-big-tab-card cn-tab-theme-author"
          onclick={() => openTab('author')}
        >
          <div class="cn-big-tab-icon-wrap" aria-hidden="true">
            <span class="cn-big-tab-icon">🙏</span>
          </div>
          <div class="cn-big-tab-content">
            <h2 class="cn-big-tab-title">{t.profile.tabAuthorTitle}</h2>
            <p class="cn-big-tab-desc">{t.profile.tabAuthorSub}</p>
          </div>
          <span class="cn-big-tab-arrow" aria-hidden="true">›</span>
        </button>
        <button
          type="button"
          class="cn-big-tab-card"
          onclick={() => openTab('testimonials')}
        >
          <div class="cn-big-tab-icon-wrap" aria-hidden="true">
            <span class="cn-big-tab-icon">“</span>
          </div>
          <div class="cn-big-tab-content">
            <h2 class="cn-big-tab-title">{testimonialsCopy.title}</h2>
            <p class="cn-big-tab-desc">{testimonialsCopy.subtitle}</p>
          </div>
          <span class="cn-big-tab-arrow" aria-hidden="true">›</span>
        </button>
        <!-- TAB TO 7: LIÊN HỆ & GÓP Ý -->
        <button
          type="button"
          class="cn-big-tab-card cn-tab-theme-feedback"
          onclick={() => openTab('feedback')}
        >
          <div class="cn-big-tab-icon-wrap" aria-hidden="true">
            <span class="cn-big-tab-icon">💌</span>
          </div>
          <div class="cn-big-tab-content">
            <h2 class="cn-big-tab-title">{localeStore.current === 'en' ? 'Contact & Feedback' : 'Liên hệ & Góp ý'}</h2>
            <p class="cn-big-tab-desc">{localeStore.current === 'en' ? 'Email, Messenger & Facebook of author Quang Tu' : 'Email, Messenger & Facebook tác giả Quang Từ'}</p>
          </div>
          <span class="cn-big-tab-arrow" aria-hidden="true">›</span>
        </button>
      </div>

    <!-- ========================================================================= -->
    <!-- 2. TRANG CON: ĐĂNG NHẬP / TÀI KHOẢN (?tab=account)                       -->
    <!-- ========================================================================= -->
    {:else if currentTab === 'account'}
      <div class="cn-subpage-header">
        <button type="button" class="cn-subpage-back-btn" onclick={goBackToMain}>
          <span class="cn-back-arrow" aria-hidden="true">←</span>
          <span>{t.profile.backToMenu}</span>
        </button>
        <div class="cn-subpage-title-box">
          <h1 class="cn-subpage-title">{t.profile.tabLoginTitle}</h1>
          <p class="cn-subpage-sub">{t.profile.tabLoginSub}</p>
        </div>
      </div>

      <section class="cn-card cn-subpage-card">
        <div class="cn-profile-box">
          <div class="cn-profile-header">
            <div class="cn-avatar-col">
              {#if session.user?.avatarUrl && !avatarFailed}
                <img
                  src={session.user.avatarUrl}
                  alt={session.user.displayName || t.profile.defaultUserName}
                  class="cn-avatar-img"
                  referrerpolicy="no-referrer"
                  onerror={() => (avatarFailed = true)}
                />
              {:else if session.authenticated && session.user}
                <div class="cn-avatar-placeholder cn-avatar-initials">
                  {getInitials(userGreetingName)}
                </div>
              {:else}
                <div class="cn-avatar-placeholder">👤</div>
              {/if}
            </div>

            <div class="cn-profile-info">
              {#if session.authenticated && session.user}
                <div class="cn-profile-name-row">
                  <span class="cn-role-badge" class:badge-admin={role === 'admin'} class:badge-ctv={role === 'ctv'}>
                    {roleLabel}
                  </span>
                  <div class="cn-status-indicator">
                    <span class="cn-status-dot"></span>
                    <span class="cn-status-label">{sessionStore.verification === 'cached' ? sessionStatusCopy[localeStore.current].cached : t.profile.statusActive}</span>
                  </div>
                </div>
                <h2 class="cn-user-greeting">
                  {localeStore.current === 'en' ? 'Hello' : 'Xin chào'} <span class="cn-user-email-tag">{userGreetingName}</span>, {localeStore.current === 'en' ? 'wishing you a peaceful day and diligent practice' : 'chúc bạn một ngày mới an lạc, tinh tấn tu tập'} 🙏
                </h2>
                {#if sessionStore.verification === 'cached'}
                  <p class="cn-user-display-name" role="status">{sessionStatusCopy[localeStore.current].cachedDescription}</p>
                {/if}
                {#if session.user.email}
                  <p class="cn-user-display-name">
                    <span class="cn-user-dn-label">Email:</span> {session.user.email}
                  </p>
                {/if}
              {:else}
                <h2 class="cn-user-name">{t.profile.welcome}</h2>
                <p class="cn-guest-desc">{t.profile.guestDesc}</p>
              {/if}
            </div>
          </div>

          {#if feedbackMessage}
            <div class="cn-auth-alert" role="alert">
              <span class="cn-auth-alert-text">{feedbackMessage}</span>
              <button type="button" class="cn-auth-alert-close" aria-label="Đóng" onclick={() => (feedbackMessage = '')}>✕</button>
            </div>
          {/if}
          {#if session.authenticated && session.user}
            <div class="cn-profile-actions">
              <button
                class="cn-btn cn-btn-danger cn-btn-logout"
                type="button"
                onclick={openLogoutModal}
              >
                <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>
                <span>{t.profile.logout}</span>
              </button>
            </div>
            <div class="cn-danger-zone">
              <button
                class="cn-btn-delete-account"
                type="button"
                onclick={openDeleteAccountModal}
              >
                {t.profile.deleteAccount}
              </button>
            </div>
          {:else}
            <div class="cn-login-buttons">
              <button
                class="cn-btn cn-btn-google"
                type="button"
                disabled={authBusy}
                onclick={async () => {
                  if (isNativeApp()) {
                    authBusy = true;
                    feedbackMessage = '';
                    const res = await loginWithGoogleNative();
                    authBusy = false;
                    if (!res.success && res.error) {
                      feedbackMessage = res.error;
                    }
                  } else {
                    window.location.href = resolveApiUrl('/api/auth/google');
                  }
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.16v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.16C1.43 8.55 1 10.22 1 12s.43 3.45 1.16 4.93l3.68-2.84z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.16 7.07l3.68 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                <span>{authBusy ? (localeStore.current === 'en' ? 'Authenticating…' : 'Đang xác thực...') : t.profile.loginGoogle}</span>
              </button>
              <button
                class="cn-btn cn-btn-fb"
                type="button"
                disabled={authBusy}
                onclick={async () => {
                  if (isNativeApp()) {
                    authBusy = true;
                    feedbackMessage = '';
                    const res = await loginWithFacebookNative();
                    authBusy = false;
                    if (!res.success && res.error) {
                      feedbackMessage = res.error;
                    }
                  } else {
                    window.location.href = resolveApiUrl('/api/auth/facebook');
                  }
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M13.5 22v-9h3l.45-3.5H13.5V7.27c0-1.01.28-1.7 1.73-1.7h1.85V2.44a24.8 24.8 0 0 0-2.7-.14c-2.67 0-4.5 1.63-4.5 4.62V9.5h-3V13h3v9h3.62Z"/></svg>
                <span>{authBusy ? (localeStore.current === 'en' ? 'Authenticating…' : 'Đang xác thực...') : t.profile.loginFacebook}</span>
              </button>
              {#if isNativeApp() && nativePlatform() === 'ios'}
                <button
                  class="cn-btn cn-btn-apple"
                  type="button"
                  disabled={authBusy}
                  onclick={async () => {
                    authBusy = true;
                    feedbackMessage = '';
                    const res = await loginWithAppleNative();
                    authBusy = false;
                    if (!res.success && res.error) {
                      feedbackMessage = res.error;
                    }
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.84c.64-.78 1.08-1.87.96-2.96-.93.04-2.07.62-2.74 1.4-.59.68-1.11 1.79-.97 2.85 1.05.08 2.11-.51 2.75-1.29z"/>
                  </svg>
                  <span>{t.profile.loginApple}</span>
                </button>
              {/if}
            </div>
          {/if}
        </div>
      </section>

      <!-- Tiện ích Cá Nhân -->
      <section class="cn-card cn-subpage-card">
        <h2 class="cn-sub-block-title">
          <span class="cn-sub-block-icon" aria-hidden="true">📿</span>
          <span>{t.settings.practiceShortcuts}</span>
        </h2>
        <div class="cn-shortcuts-list">
          <a href="/tien-do-tu-tap" class="cn-shortcut-item" onclick={() => triggerHaptic('light')}>
            <div class="cn-shortcut-icon">📈</div>
            <div class="cn-shortcut-text">
              <strong>{t.settings.verifiedProgress}</strong>
              <small>{t.settings.verifiedProgressSub}</small>
            </div>
            <span class="cn-shortcut-arrow" aria-hidden="true">→</span>
          </a>

          <a href="/trich-dan-cua-toi" class="cn-shortcut-item" onclick={() => triggerHaptic('light')}>
            <div class="cn-shortcut-icon">📑</div>
            <div class="cn-shortcut-text">
              <strong>{t.settings.myQuotes}</strong>
              <small>{t.settings.myQuotesSub}</small>
            </div>
            <span class="cn-shortcut-arrow" aria-hidden="true">→</span>
          </a>

          <button
            type="button"
            class="cn-shortcut-item cn-shortcut-btn"
            onclick={() => { triggerHaptic('light'); window.dispatchEvent(new CustomEvent('quangtu:open-phap-bao')); }}
          >
            <div class="cn-shortcut-icon">🌸</div>
            <div class="cn-shortcut-text">
              <strong>{t.settings.phapBaoLink}</strong>
              <small>{t.settings.phapBaoLinkSub}</small>
            </div>
            <span class="cn-shortcut-arrow" aria-hidden="true">→</span>
          </button>
        </div>
      </section>

      <!-- Khu vực Quản Trị Hệ Thống (Dành riêng cho Admin & CTV) -->
      {#if isAdminOrCtv}
        <section class="cn-card cn-subpage-card cn-admin-sub-block">
          <div class="cn-admin-hub__header">
            <div class="cn-admin-banner__header">
              <span class="cn-admin-banner__icon" aria-hidden="true">⚙️</span>
              <div>
                <strong>{t.profile.adminAreaCardTitle}</strong>
                <span class="cn-role-badge" class:badge-admin={role === 'admin'} class:badge-ctv={role === 'ctv'}>
                  {roleLabel}
                </span>
              </div>
            </div>
            <a href="/admin" class="cn-admin-hub__more" onclick={() => triggerHaptic('light')}>
              <span>{localeStore.current === 'en' ? 'Full Dashboard' : 'Xem toàn bộ'}</span>
              <span aria-hidden="true">→</span>
            </a>
          </div>
          <p class="cn-admin-banner__desc">{t.settings.adminAreaSubtitle}</p>
          <div class="cn-admin-hub__grid">
            <a href="/admin" class="cn-admin-hub__item" onclick={() => triggerHaptic('light')}>
              <span class="cn-admin-hub__item-icon">📊</span>
              <span class="cn-admin-hub__item-label">{localeStore.current === 'en' ? 'Dashboard' : 'Tổng quan'}</span>
            </a>
            <a href="/admin/phap-thoai" class="cn-admin-hub__item" onclick={() => triggerHaptic('light')}>
              <span class="cn-admin-hub__item-icon">🎙️</span>
              <span class="cn-admin-hub__item-label">{localeStore.current === 'en' ? 'Talks' : 'Pháp thoại'}</span>
            </a>
            <a href="/admin/books" class="cn-admin-hub__item" onclick={() => triggerHaptic('light')}>
              <span class="cn-admin-hub__item-icon">📖</span>
              <span class="cn-admin-hub__item-label">{localeStore.current === 'en' ? 'Books' : 'Kinh sách'}</span>
            </a>
            <a href="/admin/members" class="cn-admin-hub__item" onclick={() => triggerHaptic('light')}>
              <span class="cn-admin-hub__item-icon">👥</span>
              <span class="cn-admin-hub__item-label">{localeStore.current === 'en' ? 'Members' : 'Thành viên'}</span>
            </a>
          </div>
        </section>
      {/if}

    <!-- ========================================================================= -->
    <!-- 4. TRANG CON: CÀI ĐẶT ỨNG DỤNG (?tab=settings)                        -->
    <!-- ========================================================================= -->
    {:else if currentTab === 'settings'}
      <div class="cn-subpage-header">
        <button type="button" class="cn-subpage-back-btn" onclick={goBackToMain}>
          <span class="cn-back-arrow" aria-hidden="true">←</span>
          <span>{t.profile.backToMenu}</span>
        </button>
        <div class="cn-subpage-title-box">
          <h1 class="cn-subpage-title">{t.profile.tabAppSettingsTitle}</h1>
          <p class="cn-subpage-sub">{t.profile.tabAppSettingsSub}</p>
        </div>
        {#if feedbackMessage}
          <span class="cn-feedback-badge-top">{feedbackMessage}</span>
        {/if}
      </div>

      <!-- Khối Nhắc nhở tu tập & Thọ Khang Bảo Giám -->
      <div class="settings-hub">
      <PracticeReminderCard bind:activeSection={activeSettingsSection} />
      <p class="settings-hub-divider">{hub.displaySection}</p>
      <SettingsSection id="display" title={hub.display} description={displaySummary} bind:active={activeSettingsSection}>
        <!-- Chế độ Giao diện App -->
        <div class="cn-setting-row">
          <div class="cn-setting-label">
            <strong>{t.settings.appTheme}</strong>
            <small>{t.settings.themeSub}</small>
          </div>
          <div class="cn-theme-toggle-group">
            <button
              type="button"
              class="cn-toggle-btn"
              class:active={themeStore.mode === 'light'}
              aria-pressed={themeStore.mode === 'light'}
              onclick={() => themeStore.apply('light')}
            >
              {t.settings.themeLight}
            </button>
            <button
              type="button"
              class="cn-toggle-btn"
              class:active={themeStore.mode === 'dark'}
              aria-pressed={themeStore.mode === 'dark'}
              onclick={() => themeStore.apply('dark')}
            >
              {t.settings.themeDark}
            </button>
            <button
              type="button"
              class="cn-toggle-btn"
              class:active={themeStore.mode === 'auto'}
              aria-pressed={themeStore.mode === 'auto'}
              onclick={() => themeStore.apply('auto')}
            >
              {t.settings.themeAuto}
            </button>
          </div>
        </div>

        <!-- Ngôn ngữ Ứng dụng -->
        <div class="cn-setting-row">
          <div class="cn-setting-label">
            <strong>{t.settings.language}</strong>
            <small>{t.settings.languageSub}</small>
          </div>
          <div class="cn-lang-toggle-group">
            <button
              type="button"
              class="cn-toggle-btn"
              class:active={localeStore.current === 'vi'}
              aria-pressed={localeStore.current === 'vi'}
              onclick={() => localeStore.setLocale('vi')}
            >
              {t.settings.langVi}
            </button>
            <button
              type="button"
              class="cn-toggle-btn"
              class:active={localeStore.current === 'en'}
              aria-pressed={localeStore.current === 'en'}
              onclick={() => localeStore.setLocale('en')}
            >
              {t.settings.langEn}
            </button>
          </div>
        </div>

        <div class="cn-setting-row cn-motion-row">
          <div class="cn-setting-label">
            <strong id="ui-motion-label">{hub.motion}</strong>
            <small id="ui-motion-help">{hub.motionHelp}</small>
          </div>
          <div class="cn-motion-control">
            <button type="button" class="cn-motion-switch" role="switch" aria-checked={$uiMotion.enabled}
              aria-labelledby="ui-motion-label" aria-describedby="ui-motion-help" onclick={() => setUiMotion(!$uiMotion.enabled)}>
              <span class="cn-motion-track" aria-hidden="true"><span class="cn-motion-thumb"></span></span>
            </button>
            <span class="cn-motion-status" aria-hidden="true">{$uiMotion.enabled ? hub.motionOn : hub.motionOff}</span>
          </div>
          {#if $uiMotion.enabled && $uiMotion.reduced}
            <p class="cn-motion-system-note">{hub.motionSystemNote}</p>
          {/if}
        </div>

        <div class="cn-setting-row cn-ui-font-row" role="group" aria-labelledby="ui-font-scale-label" aria-describedby="ui-font-scale-help">
          <div class="cn-setting-label">
            <strong id="ui-font-scale-label">{uiFontCopy.title}</strong>
            <small id="ui-font-scale-help">{uiFontCopy.help}</small>
          </div>
          <div class="cn-size-stepper">
            <button type="button" class="cn-step-btn" aria-label={uiFontCopy.decrease}
              onclick={() => setUiFontScale($uiFontScale - UI_FONT_SCALE_STEP)} disabled={$uiFontScale <= UI_FONT_SCALE_MIN}>A−</button>
            <output class="cn-step-val" aria-live="polite">{uiFontPercent}%</output>
            <button type="button" class="cn-step-btn" aria-label={uiFontCopy.increase}
              onclick={() => setUiFontScale($uiFontScale + UI_FONT_SCALE_STEP)} disabled={$uiFontScale >= UI_FONT_SCALE_MAX}>A+</button>
            <button type="button" class="cn-step-btn cn-ui-font-reset" onclick={() => setUiFontScale(1)}>{uiFontCopy.reset}</button>
          </div>
          <p class="cn-ui-font-preview-title">{uiFontCopy.previewTitle}</p>
          <p class="cn-ui-font-help">{uiFontCopy.previewHelp}</p>
          <div class="cn-ui-font-demo" role="region" aria-label={uiFontCopy.previewTitle}>
            <strong>{t.practice.meditationTitle}</strong>
            <div class="cn-ui-font-demo-tabs" aria-hidden="true">
              {#each Object.entries(meditationTabCopy[localeStore.current === 'en' ? 'en' : 'vi']) as [key, text] (key)}<span>{text}</span>{/each}
            </div>
            <span class="cn-ui-font-demo-button" aria-hidden="true">{quoteCardCopy[localeStore.current === 'en' ? 'en' : 'vi'].create}</span>
          </div>
          <p class="cn-ui-font-help">{uiFontCopy.savedHelp}</p>
        </div>

      </SettingsSection>
      <SettingsSection id="reading" title={hub.reading}
        description={hub.readingSummary(fontOptions.find(opt => opt.key === fontFamily)?.label || fontFamily, fontSize, lineHeight, backgroundOptions.find(opt => opt.key === background)?.label || background)}
        bind:active={activeSettingsSection}>
        <!-- Màu nền đọc kinh -->
        <div class="cn-setting-row">
          <div class="cn-setting-label">
            <strong>{t.settings.readerBg}</strong>
            <small>{t.settings.readerBgSub}</small>
          </div>
          <div class="cn-bg-options-grid">
            {#each backgroundOptions as opt}
              <button
                type="button"
                class="cn-bg-btn"
                class:selected={background === opt.key}
                style={`background:${opt.bg}; color:${opt.text}; border-color:${opt.border}`}
                onclick={() => setBg(opt.key)}
              >
                <span class="cn-bg-swatch" style={`background:${opt.bg}`}></span>
                <span class="cn-bg-title">{opt.label}</span>
                {#if background === opt.key}<span class="cn-bg-check">✓</span>{/if}
              </button>
            {/each}
          </div>
        </div>

        <!-- Phông chữ đọc -->
        <div class="cn-setting-row">
          <div class="cn-setting-label">
            <strong>{t.settings.readerFont}</strong>
            <small>{t.settings.readerFontSub}</small>
          </div>
          <div class="cn-font-options-grid">
            {#each fontOptions as opt}
              <button
                type="button"
                class="cn-font-btn"
                class:selected={fontFamily === opt.key}
                onclick={() => setFont(opt.key)}
              >
                <span class="cn-font-sample" style={opt.style}>Tâm An</span>
                <span class="cn-font-name">{opt.label}</span>
                {#if fontFamily === opt.key}<span class="cn-check-mark">✓</span>{/if}
              </button>
            {/each}
          </div>
        </div>

        <!-- Cỡ chữ -->
        <div class="cn-setting-row">
          <div class="cn-setting-label">
            <strong>{t.settings.fontSize}: <span class="cn-highlight-val">{fontSize}px</span></strong>
            <small>{t.settings.fontSizeSub}</small>
          </div>
          <div class="cn-size-controls">
            <div class="cn-size-presets">
              {#each fontSizePresets as preset}
                <button
                  type="button"
                  class="cn-preset-btn"
                  class:selected={fontSize === preset.size}
                  onclick={() => setSize(preset.size)}
                >
                  {preset.label}
                </button>
              {/each}
            </div>
            <div class="cn-size-stepper">
              <button type="button" class="cn-step-btn" onclick={() => setSize(fontSize - 1)} disabled={fontSize <= 13}>A−</button>
              <span class="cn-step-val">{fontSize}px</span>
              <button type="button" class="cn-step-btn" onclick={() => setSize(fontSize + 1)} disabled={fontSize >= 32}>A+</button>
              <button type="button" class="cn-step-btn cn-step-bold" class:active={bold} onclick={toggleBold}>B</button>
            </div>
          </div>
        </div>

        <!-- Độ giãn dòng -->
        <div class="cn-setting-row">
          <div class="cn-setting-label">
            <strong>{t.settings.lineHeight}</strong>
            <small>{t.settings.lineHeightSub}</small>
          </div>
          <div class="cn-lh-presets">
            {#each lineHeightOptions as lh}
              <button
                type="button"
                class="cn-preset-btn"
                class:selected={lineHeight === lh.val}
                onclick={() => setLineHeight(lh.val)}
              >
                {lh.label}
              </button>
            {/each}
          </div>
        </div>

        <!-- Xem trước nội dung đọc (Live Preview) -->
        <div class="cn-preview-box-wrap">
          <div class="cn-preview-box-header">
            <span>{t.settings.preview}</span>
            <span>{fontSize}px · {lineHeight} {t.settings.line}</span>
          </div>
          <div
            class="cn-preview-box"
            style={`background:${previewBgColor}; color:${previewTextColor}; font-family:${fontFamily === 'bookerly' ? 'Bookerly, Georgia, serif' : fontFamily === 'merriweather' ? 'Merriweather, serif' : fontFamily === 'literata' ? 'Literata, serif' : '"Be Vietnam Pro", sans-serif'}; font-size:${fontSize}px; line-height:${lineHeight}; font-weight:${bold ? 700 : 400}`}
          >
            <div class="cn-preview-title">{t.settings.previewTitle}</div>
            <p>{t.settings.previewQuote}</p>
          </div>
        </div>
      </SettingsSection>
      </div>

    <!-- ========================================================================= -->
    <!-- 5. TRANG CON: GIỚI THIỆU VỀ TÁC GIẢ (?tab=author)                        -->
    <!-- ========================================================================= -->
    {:else if currentTab === 'author'}
      <div class="cn-subpage-header">
        <button type="button" class="cn-subpage-back-btn" onclick={goBackToMain}>
          <span class="cn-back-arrow" aria-hidden="true">←</span>
          <span>{t.profile.backToMenu}</span>
        </button>
        <div class="cn-subpage-title-box">
          <h1 class="cn-subpage-title">{t.profile.tabAuthorTitle}</h1>
          <p class="cn-subpage-sub">{authorTopic?.title || t.profile.tabAuthorSub}</p>
        </div>
      </div>

      <section class="cn-card cn-subpage-card cn-author-block">
        <div class="cn-author-card">
          <!-- Author Identity Header -->
          <div class="cn-author-header">
            <div class="cn-author-avatar-wrap">
              <span class="cn-author-avatar-icon" aria-hidden="true">🙏</span>
            </div>
            <div class="cn-author-title-group">
              <h2 class="cn-author-name">{localeStore.current === 'en' ? 'Lay Practitioner Ngo Quang Tu' : 'Cư sĩ Ngộ Quang Từ'}</h2>
              <p class="cn-author-meta">{localeStore.current === 'en' ? 'Dharma Sharing & Online Practice Space' : 'Phụng sự & Hoằng dương Phật pháp'}</p>
            </div>
          </div>

          <!-- Author Bio Paragraphs extracted directly from Guide -->
          <div class="cn-author-body">
            {#if authorParagraphs.length > 0}
              {#each authorParagraphs as para, idx}
                <p class="cn-author-p" class:cn-author-highlight={idx === 0}>{para.text}</p>
              {/each}
            {:else}
              {#if localeStore.current === 'en'}
                <p class="cn-author-p cn-author-highlight">
                  Quang Tu, whose full Dharma name is Ngo Quang Tu, is a Buddhist lay practitioner endowed with a deep affinity for the Buddha Dharma. Through life trials and adversity, Quang Tu came to realize the miraculous efficacy of the Dharma and cultivated unwavering faith in the law of cause and effect.
                </p>
                <p class="cn-author-p">
                  This application is built purely with the aspiration of selfless service and Dharma connection, helping everyone understand karma more deeply, abandon evil, cultivate goodness, and attain peace and happiness.
                </p>
              {:else}
                <p class="cn-author-p cn-author-highlight">
                  Quang Từ, pháp danh đầy đủ là Ngộ Quang Từ, là một cư sĩ tại gia có nhân duyên sâu dày với Phật pháp. Từ những biến cố và thử thách trong cuộc sống, Quang Từ nhận ra sự nhiệm màu của Phật Pháp và phát khởi niềm tin vững chắc vào luật nhân quả.
                </p>
                <p class="cn-author-p">
                  Ứng dụng này được xây dựng hoàn toàn với tâm nguyện phụng sự và gieo duyên Phật pháp, không ngoài mục đích giúp mọi người hiểu sâu hơn về nhân quả, đoạn ác tu thiện và hướng đến đời sống an lạc, hạnh phúc.
                </p>
              {/if}
            {/if}
          </div>

          <!-- Contact Links from Guide -->
          <div class="cn-author-actions">
            {#each authorLinks as link}
              <button
                type="button"
                class="cn-author-btn"
                class:cn-author-btn-messenger={link.href.includes('m.me')}
                class:cn-author-btn-fb={link.href.includes('facebook.com')}
                onclick={() => handleOpenAuthorLink(link.href)}
              >
                {#if link.href.includes('m.me')}
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M12 2C6.477 2 2 6.145 2 11.258c0 2.914 1.453 5.518 3.734 7.205V22l3.385-1.858c.917.254 1.886.39 2.881.39 5.523 0 10-4.145 10-9.274C22 6.145 17.523 2 12 2zm1.002 12.441-2.56-2.73-5 2.73 5.5-5.836 2.624 2.73 4.936-2.73-5.5 5.836z"/>
                  </svg>
                {:else}
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M13.5 22v-9h3l.45-3.5H13.5V7.27c0-1.01.28-1.7 1.73-1.7h1.85V2.44a24.8 24.8 0 0 0-2.7-.14c-2.67 0-4.5 1.63-4.5 4.62V9.5h-3V13h3v9h3.62Z"/>
                  </svg>
                {/if}
                <span>{link.label || link.text}</span>
              </button>
            {/each}
          </div>
        </div>
      </section>
    <!-- ========================================================================= -->
    <!-- 7. TRANG CON: LIÊN HỆ & GÓP Ý (?tab=feedback)                            -->
    <!-- ========================================================================= -->
    {:else if currentTab === 'testimonials'}
      <div class="cn-subpage-header">
        <button type="button" class="cn-subpage-back-btn" onclick={goBackToMain}>
          <span class="cn-back-arrow" aria-hidden="true">←</span>
          <span>{t.profile.backToMenu}</span>
        </button>
        <div class="cn-subpage-title-box">
          <h1 class="cn-subpage-title">{testimonialsCopy.title}</h1>
          <p class="cn-subpage-sub">{testimonialsCopy.subtitle}</p>
        </div>
      </div>
      <div class="cn-testimonials" lang="vi">
        {#each userTestimonials as testimonial (testimonial.id)}
          <article class="cn-card cn-subpage-card cn-testimonial-card" aria-labelledby={`testimonial-${testimonial.id}`}>
            <span class="cn-testimonial-quote" aria-hidden="true">“</span>
            <h2 class="cn-testimonial-name" id={`testimonial-${testimonial.id}`}>{testimonial.name}</h2>
            <blockquote class="cn-testimonial-body">
              {#each testimonial.paragraphs as paragraph}
                <p>{paragraph}</p>
              {/each}
            </blockquote>
            {#if testimonial.signature}
              <p class="cn-testimonial-signature">— {testimonial.signature}</p>
            {/if}
          </article>
        {/each}
      </div>
    {:else if currentTab === 'feedback'}
      <div class="cn-subpage-header">
        <button type="button" class="cn-subpage-back-btn" onclick={goBackToMain}>
          <span class="cn-back-arrow" aria-hidden="true">←</span>
          <span>{t.profile.backToMenu}</span>
        </button>
        <div class="cn-subpage-title-box">
          <h1 class="cn-subpage-title">{localeStore.current === 'en' ? 'Contact & Feedback' : 'Liên hệ & Góp ý'}</h1>
          <p class="cn-subpage-sub">{localeStore.current === 'en' ? 'Direct channels to reach author Quang Tu' : 'Kênh liên hệ trực tiếp đến tác giả Quang Từ'}</p>
        </div>
      </div>

      <section class="cn-subpage-card cn-feedback-container">
        <div class="cn-feedback-intro">
          <p>
            {localeStore.current === 'en'
              ? 'We deeply appreciate all feedback, suggestions, and bug reports from the Sangha to make Tu Tap more helpful on your spiritual path.'
              : 'Ban biên tập và tác giả Quang Từ luôn lắng nghe và trân trọng mọi ý kiến đóng góp, phản hồi lỗi hoặc đề xuất cải tiến của quý Phật tử để ứng dụng ngày một hoàn thiện, phụng sự đại chúng tốt hơn.'}
          </p>
        </div>

        <div class="cn-feedback-channels-grid">
          <!-- 1. Gmail -->
          <div class="cn-contact-channel-card cn-channel-email">
            <div class="cn-channel-top">
              <span class="cn-channel-icon" aria-hidden="true">📧</span>
              <div class="cn-channel-header">
                <h3>{localeStore.current === 'en' ? 'Email Feedback' : 'Email Góp Ý'}</h3>
                <span class="cn-channel-badge">{localeStore.current === 'en' ? 'Official' : 'Chính thức'}</span>
              </div>
            </div>
            <p class="cn-channel-address">tutap.phatphap26@gmail.com</p>
            <p class="cn-channel-desc">{localeStore.current === 'en' ? 'Tap to open email composer with pre-filled topics' : 'Bấm để mở giao diện soạn thư gửi góp ý'}</p>
            <div class="cn-channel-btns">
              <button
                type="button"
                class="cn-channel-btn-primary cn-btn-email"
                onclick={() => { triggerHaptic('light'); feedbackEmailModalOpen = true; }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
                </svg>
                <span>{localeStore.current === 'en' ? 'Send Email' : 'Gửi Email'}</span>
              </button>
              <button type="button" class="cn-channel-btn-copy" onclick={copyFeedbackEmail} disabled={copyingEmail} aria-busy={copyingEmail}>
                <span>{copiedEmail ? (localeStore.current === 'en' ? 'Copied ✓' : 'Đã chép ✓') : (localeStore.current === 'en' ? 'Copy' : 'Sao chép')}</span>
              </button>
            </div>
            {#if copiedEmailError}<p class="cn-copy-error" role="alert">{t.feedback.copyAddressFailed}</p>{/if}
          </div>

          <!-- 2. Messenger -->
          <div class="cn-contact-channel-card cn-channel-messenger">
            <div class="cn-channel-top">
              <span class="cn-channel-icon" aria-hidden="true">💬</span>
              <div class="cn-channel-header">
                <h3>{localeStore.current === 'en' ? 'Messenger' : 'Messenger Tác Giả'}</h3>
                <span class="cn-channel-badge cn-badge-blue">Messenger</span>
              </div>
            </div>
            <p class="cn-channel-desc">{localeStore.current === 'en' ? 'Chat or ask questions directly via Messenger' : 'Nhắn tin trực tiếp với tác giả Quang Từ qua Messenger'}</p>
            <div class="cn-channel-btns">
              <button type="button" class="cn-channel-btn-primary cn-btn-messenger" onclick={() => handleOpenAuthorLink('https://m.me/tranan.buhd')}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.477 2 2 6.145 2 11.258c0 2.914 1.453 5.518 3.734 7.205V22l3.385-1.858c.917.254 1.886.39 2.881.39 5.523 0 10-4.145 10-9.274C22 6.145 17.523 2 12 2zm1.002 12.441-2.56-2.73-5 2.73 5.5-5.836 2.624 2.73 4.936-2.73-5.5 5.836z"/>
                </svg>
                <span>{localeStore.current === 'en' ? 'Open Messenger' : 'Mở Messenger'}</span>
              </button>
            </div>
          </div>

          <!-- 3. Facebook -->
          <div class="cn-contact-channel-card cn-channel-facebook">
            <div class="cn-channel-top">
              <span class="cn-channel-icon" aria-hidden="true">👤</span>
              <div class="cn-channel-header">
                <h3>{localeStore.current === 'en' ? 'Facebook' : 'Facebook Tác Giả'}</h3>
                <span class="cn-channel-badge cn-badge-fb">Facebook</span>
              </div>
            </div>
            <p class="cn-channel-desc">{localeStore.current === 'en' ? 'Visit personal page & dharma sharings' : 'Trang cá nhân và bài viết Phật pháp của tác giả'}</p>
            <div class="cn-channel-btns">
              <button type="button" class="cn-channel-btn-primary cn-btn-facebook" onclick={() => handleOpenAuthorLink('https://www.facebook.com/tranan.buhd/')}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M13.5 22v-9h3l.45-3.5H13.5V7.27c0-1.01.28-1.7 1.73-1.7h1.85V2.44a24.8 24.8 0 0 0-2.7-.14c-2.67 0-4.5 1.63-4.5 4.62V9.5h-3V13h3v9h3.62Z"/>
                </svg>
                <span>{localeStore.current === 'en' ? 'Open Facebook' : 'Mở Facebook'}</span>
              </button>
            </div>
          </div>
        </div>
      </section>
    {/if}
  </div>
</div>

<!-- Logout Confirmation Dialog -->
{#if logoutModalOpen}
  <div class="cn-modal-scrim" role="presentation" onclick={() => !loggingOut && (logoutModalOpen = false)}>
    <div class="cn-modal-dialog" data-dialog-glass role="alertdialog" aria-modal="true" aria-labelledby="modal-logout-title">
      <div class="cn-modal-icon">🚪</div>
      <h3 id="modal-logout-title">{t.profile.logoutConfirmTitle}</h3>
      <p>{t.profile.logoutConfirmDesc}</p>
      {#if logoutError}<p role="alert">{logoutError}</p>{/if}
      <div class="cn-modal-actions dialog-actions-balanced">
        <button
          type="button"
          class="cn-btn cn-btn-ghost"
          disabled={loggingOut}
          onclick={() => logoutModalOpen = false}
        >
          {t.profile.cancel}
        </button>
        <button
          type="button"
          class="cn-btn cn-btn-danger"
          disabled={loggingOut}
          onclick={handleLogout}
        >
          {loggingOut ? t.profile.loggingOut : t.profile.logout}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Delete Account Confirmation Dialog -->
{#if deleteAccountModalOpen}
  <div class="cn-modal-scrim" role="presentation" onclick={(e) => { if (e.target === e.currentTarget && !deletingAccount) deleteAccountModalOpen = false; }}>
    <div
      class="cn-modal-dialog cn-delete-dialog"
      data-dialog-glass
      role="alertdialog"
      tabindex="-1"
      aria-modal="true"
      aria-labelledby="modal-delete-title"
      onkeydown={(e) => { if (e.key === 'Escape' && !deletingAccount) deleteAccountModalOpen = false; }}
    >
      <div class="cn-modal-icon">⚠️</div>
      <h3 id="modal-delete-title">{t.profile.deleteConfirmTitle}</h3>
      <p>{t.profile.deleteConfirmDesc}</p>

      <div class="cn-delete-code-section">
        <label for="delete-confirm-input" class="cn-delete-code-label">
          {t.profile.deleteConfirmCodePrompt}
        </label>
        <div class="cn-delete-code-display" title="Mã xác nhận bảo mật">
          {expectedDeleteCode}
        </div>
        <input
          id="delete-confirm-input"
          type="text"
          class="cn-delete-code-input"
          bind:value={deleteConfirmationInput}
          placeholder={t.profile.deleteConfirmCodePlaceholder}
          autocomplete="off"
          autocorrect="off"
          autocapitalize="characters"
          spellcheck="false"
        />
        <div class="cn-delete-code-feedback" class:matched={isDeleteCodeMatched}>
          {isDeleteCodeMatched ? t.profile.deleteConfirmCodeMatched : t.profile.deleteConfirmCodeUnmatched}
        </div>
      </div>

      <div class="cn-modal-actions dialog-actions-balanced">
        <button
          type="button"
          class="cn-btn cn-btn-ghost"
          disabled={deletingAccount}
          onclick={() => deleteAccountModalOpen = false}
        >
          {t.profile.cancel}
        </button>
        <button
          type="button"
          class="cn-btn cn-btn-danger"
          disabled={deletingAccount || !isDeleteCodeMatched}
          onclick={handleDeleteAccount}
        >
          {deletingAccount ? t.profile.deletingAccount : t.profile.deleteConfirmButton}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Feedback Email Modal -->
<FeedbackEmailModal
  open={feedbackEmailModalOpen}
  onClose={() => feedbackEmailModalOpen = false}
/>

<style>
  .cn-subpage-back-btn,.cn-toggle-btn,.cn-bg-btn,.cn-font-btn,.cn-preset-btn,.cn-step-btn { min-width:44px; min-height:44px; }
  .cn-copy-error { margin-top: var(--radius); color: var(--danger-text); }
  .cn-page {
    background: var(--bg);
    color: var(--text);
    padding-bottom: 0;
  }
  :root[data-native-app='true'] .cn-page {
    padding-bottom: 0 !important;
  }
  @media (max-width: 680px) {
    .cn-page-heading {
      display: none !important;
    }
    .cn-container--main {
      padding: 14px 16px 20px !important;
      gap: 12px !important;
    }
    .cn-welcome-banner {
      padding: 14px 16px !important;
      margin-bottom: 2px !important;
      gap: 13px !important;
      border-radius: 16px !important;
    }
    .cn-welcome-avatar-img,
    .cn-welcome-initials {
      width: 44px !important;
      height: 44px !important;
      font-size: 16px !important;
    }
    .cn-welcome-greeting {
      font-size: var(--font-size-body) !important;
      line-height: 1.45 !important;
    }
    .cn-big-tabs-list {
      gap: 12px !important;
    }
    .cn-big-tab-card {
      padding: 16px 18px !important;
      gap: 14px !important;
      border-radius: 16px !important;
    }
    .cn-big-tab-icon-wrap {
      width: 48px !important;
      height: 48px !important;
      border-radius: 14px !important;
    }
    .cn-big-tab-icon {
      font-size: 23px !important;
    }
    .cn-big-tab-title {
      font-size: var(--font-size-card-title) !important;
      font-weight: 700 !important;
    }
    .cn-big-tab-desc {
      font-size: var(--font-size-body) !important;
      margin-top: 2px !important;
      line-height: 1.4 !important;
    }

    @media (min-height: 760px) {
      .cn-container--main {
        padding: 16px 16px 24px !important;
        gap: 14px !important;
      }
      .cn-welcome-banner {
        padding: 16px 18px !important;
        gap: 14px !important;
      }
      .cn-big-tabs-list {
        gap: 13px !important;
      }
      .cn-big-tab-card {
        padding: 18px 18px !important;
        gap: 15px !important;
      }
      .cn-big-tab-icon-wrap {
        width: 50px !important;
        height: 50px !important;
      }
      .cn-big-tab-icon {
        font-size: 24px !important;
      }
      .cn-big-tab-title {
        font-size: var(--font-size-card-title) !important;
      }
      .cn-big-tab-desc {
        font-size: var(--font-size-body) !important;
      }
    }
  }

  .cn-container {
    max-width: 720px;
    margin: 0 auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  /* Top Heading */
  .cn-page-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 6px 4px 2px;
  }

  .cn-heading-left {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .cn-back-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    padding: 0;
    border-radius: 50%;
    border: 1px solid var(--border);
    background: var(--card);
    color: var(--text);
    cursor: pointer;
    flex-shrink: 0;
    transition: 0.15s ease;
  }
  .cn-back-btn:hover {
    border-color: var(--gold);
    color: var(--gold);
    background: var(--border);
  }
  .cn-back-btn:active {
    transform: scale(0.94);
  }

  .cn-page-title {
    margin: 0;
    font-size: var(--font-size-section-title);
    font-weight: 800;
    color: var(--gold);
    line-height: 1.25;
  }

  .cn-page-sub {
    margin: 3px 0 0;
    font-size: var(--font-size-body);
    color: var(--muted);
  }

  .cn-theme-pill {
    padding: 6px 12px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--card);
    color: var(--text2);
    cursor: pointer;
    font-size: var(--font-size-label);
    font-weight: 600;
    transition: 0.15s;
    flex-shrink: 0;
  }
  .cn-theme-pill:hover { border-color: var(--gold); color: var(--gold); }

  /* Sub-page Top Navigation */
  .cn-subpage-header {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 4px 2px 8px;
    position: relative;
  }

  .cn-subpage-back-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--card);
    color: var(--gold);
    font-size: var(--font-size-label);
    font-weight: 700;
    cursor: pointer;
    width: fit-content;
    transition: all 0.15s ease;
  }
  .cn-subpage-back-btn:hover {
    border-color: var(--gold);
    background: color-mix(in srgb, var(--gold) 12%, var(--card));
  }
  .cn-subpage-back-btn:active {
    transform: scale(0.96);
  }

  .cn-back-arrow {
    font-size: 15px;
    line-height: 1;
  }

  .cn-subpage-title-box {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .cn-subpage-title {
    margin: 0;
    font-size: 22px;
    font-weight: 800;
    color: var(--text);
    line-height: 1.25;
  }

  .cn-subpage-sub {
    margin: 0;
    font-size: var(--font-size-body);
    color: var(--muted);
  }

  .cn-feedback-badge-top {
    position: absolute;
    right: 0;
    top: 4px;
    padding: 4px 10px;
    border-radius: 999px;
    background: #e8f5e9;
    color: #2e7d32;
    font-size: var(--font-size-meta);
    font-weight: 700;
  }

  /* Welcome Banner ở màn hình chính */
  .cn-welcome-banner {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 16px 18px;
    border-radius: 18px;
    background: linear-gradient(135deg, color-mix(in srgb, var(--gold) 14%, var(--card)), var(--card));
    border: 1.5px solid color-mix(in srgb, var(--gold) 35%, var(--border));
    box-shadow: 0 4px 16px rgba(200, 150, 62, 0.08);
  }

  .cn-welcome-avatar {
    flex-shrink: 0;
  }

  .cn-welcome-avatar-img, .cn-welcome-initials {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    object-fit: cover;
    display: grid;
    place-items: center;
    background: linear-gradient(135deg, var(--gold) 0%, #b8832a 100%);
    color: #fff;
    font-size: 17px;
    font-weight: 800;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    border: 2px solid var(--gold-light);
  }

  .cn-welcome-body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .cn-welcome-greeting {
    margin: 0;
    font-size: var(--font-size-body);
    line-height: 1.45;
    color: var(--text);
  }

  .cn-welcome-name {
    color: var(--gold);
    font-weight: 800;
    word-break: break-all;
  }

  .cn-welcome-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .cn-status-badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: var(--font-size-meta);
    font-weight: 600;
    color: #2e7d32;
  }
  :root[data-theme='dark'] .cn-status-badge { color: #81c784; }

  /* ========================================================================= */
  /* DANH SÁCH CÁC TAB TO (BIG TAB CARDS)                                      */
  /* ========================================================================= */
  .cn-big-tabs-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: 100%;
  }

  .cn-personal-library{margin:0 0 24px}
  .cn-personal-library h2{margin:0 0 14px;font-size: var(--font-size-section-title);line-height:1.5;color:var(--text)}
  .cn-personal-shortcuts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
  .cn-personal-shortcuts a{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:64px;padding:14px;border:1px solid var(--border2);border-radius:var(--radius-control);background:var(--card);color:var(--text);font-size: var(--font-size-label);font-weight:600;line-height:1.5;text-decoration:none;transition:transform var(--motion-press),border-color var(--motion-fast)}
  .cn-personal-shortcuts a:hover{border-color:var(--gold)}
  .cn-personal-shortcuts a:active{transform:scale(.98)}
  .cn-personal-shortcuts a>span:last-child{color:var(--brown)}

  .cn-big-tab-card {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 18px 20px;
    border-radius: 18px;
    border: 1.5px solid var(--border);
    background: var(--card);
    color: var(--text);
    text-decoration: none;
    cursor: pointer;
    text-align: left;
    width: 100%;
    box-sizing: border-box;
    box-shadow: 0 3px 12px rgba(0, 0, 0, 0.03);
    transition: transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1), border-color 0.15s, box-shadow 0.15s;
  }
  .cn-big-tab-card:hover {
    border-color: var(--gold);
    box-shadow: 0 6px 20px rgba(200, 150, 62, 0.12);
    transform: translateY(-2px);
  }
  .cn-big-tab-card:active {
    transform: scale(0.98);
  }

  .cn-big-tab-icon-wrap {
    display: grid;
    place-items: center;
    width: 50px;
    height: 50px;
    border-radius: 14px;
    flex-shrink: 0;
    box-shadow: 0 3px 10px rgba(0, 0, 0, 0.08);
  }

  .cn-big-tab-icon {
    font-size: 24px;
    line-height: 1;
  }

  .cn-big-tab-content {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .cn-big-tab-title {
    margin: 0;
    font-size: var(--font-size-card-title);
    font-weight: 700;
    color: var(--text);
    line-height: 1.3;
  }

  .cn-big-tab-desc {
    margin: 0;
    font-size: var(--font-size-body);
    color: var(--muted);
    line-height: 1.4;
  }

  .cn-tab-email-text {
    color: var(--gold);
    font-weight: 700;
  }

  .cn-big-tab-arrow {
    font-size: 24px;
    line-height: 1;
    color: var(--muted);
    font-weight: 400;
    transition: transform 0.15s;
    flex-shrink: 0;
  }
  .cn-big-tab-card:hover .cn-big-tab-arrow {
    transform: translateX(3px);
    color: var(--gold);
  }

  /* Theme từng Tab To */
  .cn-tab-theme-auth .cn-big-tab-icon-wrap {
    background: linear-gradient(135deg, #e6b85c 0%, #b8832a 100%);
    color: #fff;
  }
  .cn-tab-theme-settings .cn-big-tab-icon-wrap {
    background: linear-gradient(135deg, #4a90e2 0%, #2a6cb8 100%);
    color: #fff;
  }
  .cn-tab-theme-guide .cn-big-tab-icon-wrap {
    background: linear-gradient(135deg, #7e6bb2 0%, #5d4c8e 100%);
    color: #fff;
  }
  .cn-tab-theme-privacy .cn-big-tab-icon-wrap {
    background: linear-gradient(135deg, #388e3c 0%, #1b5e20 100%);
    color: #fff;
  }
  .cn-tab-theme-author .cn-big-tab-icon-wrap {
    background: linear-gradient(135deg, #d4806a 0%, #a44d37 100%);
    color: #fff;
  }

  .cn-testimonials {
    display: grid;
    gap: var(--space-page);
    min-width: 0;
    padding: calc(var(--space-page) / 2);
    border-radius: var(--radius-feature);
    background:
      radial-gradient(ellipse at top left, var(--gold-muted), transparent 65%),
      linear-gradient(135deg, var(--gold-light), var(--bg2));
  }
  .cn-testimonials .cn-testimonial-card {
    position: relative;
    overflow: hidden;
    padding: var(--space-page);
    border: 1px solid var(--dialog-glass-border);
    border-radius: var(--radius-card);
    background: var(--dialog-glass-background);
    box-shadow: var(--shadow);
    -webkit-backdrop-filter: var(--dialog-glass-filter);
    backdrop-filter: var(--dialog-glass-filter);
  }
  .cn-testimonial-card::before {
    position: absolute;
    inset: 0 0 auto;
    height: calc(var(--space-page) / 5);
    background: linear-gradient(90deg, var(--gold), var(--gold-muted), transparent);
    content: '';
  }
  .cn-testimonial-card:nth-child(even)::before {
    background: linear-gradient(90deg, var(--brown2), var(--gold2), transparent);
  }
  .cn-testimonial-quote {
    color: var(--gold);
    font-size: var(--font-size-dialog-count);
    line-height: 1;
  }
  .cn-testimonial-name {
    margin: 0;
    color: var(--brown);
    font-size: var(--font-size-section-title);
    font-style: italic;
    font-weight: 600;
  }
  .cn-testimonial-body {
    font-family: var(--font-reader);
    display: grid;
    gap: var(--space-page);
    margin: 0;
    color: var(--text2);
    font-size: var(--font-size-card-title);
    line-height: 1.8;
    overflow-wrap: anywhere;
  }
  .cn-testimonial-body p,
  .cn-testimonial-signature {
    margin: 0;
  }
  .cn-testimonial-body p {
    text-align: justify;
    text-indent: var(--space-page);
  }
  .cn-testimonial-signature {
    color: var(--brown);
    font-size: var(--font-size-card-title);
    font-style: italic;
  }

  /* Base Card */
  .cn-card {
    padding: 20px;
    border: 1px solid var(--border);
    border-radius: 18px;
    background: var(--card);
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.03);
  }

  .cn-subpage-card {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  /* Subpage Profile Box */
  .cn-profile-box {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .cn-profile-header {
    display: flex;
    align-items: center;
    gap: 16px;
    width: 100%;
  }

  .cn-avatar-col {
    flex-shrink: 0;
  }

  .cn-avatar-img, .cn-avatar-placeholder {
    width: 60px;
    height: 60px;
    border-radius: 50%;
    object-fit: cover;
    display: block;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  }

  .cn-avatar-placeholder {
    display: grid;
    place-items: center;
    background: var(--bg2);
    font-size: 28px;
    border: 2px solid var(--gold-light);
  }

  .cn-avatar-initials {
    display: grid;
    place-items: center;
    background: linear-gradient(135deg, var(--gold) 0%, #b8832a 100%);
    color: #ffffff;
    font-size: 22px;
    font-weight: 700;
    border: 2px solid var(--gold-light);
  }

  .cn-profile-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 4px;
  }

  .cn-profile-name-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .cn-user-greeting {
    margin: 2px 0 0;
    font-size: var(--font-size-body);
    font-weight: 600;
    color: var(--text);
    line-height: 1.45;
  }

  .cn-user-email-tag {
    color: var(--gold);
    font-weight: 800;
    word-break: break-all;
  }

  .cn-user-display-name {
    margin: 2px 0 0;
    min-width: 0;
    overflow-wrap: break-word;
    font-size: var(--font-size-label);
    color: var(--muted);
  }

  .cn-user-dn-label {
    font-weight: 600;
  }

  .cn-status-indicator {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .cn-status-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #2e7d32;
    box-shadow: 0 0 0 2px rgba(46, 125, 50, 0.2);
  }

  .cn-status-label {
    font-size: var(--font-size-meta);
    font-weight: 600;
    color: #2e7d32;
  }
  :root[data-theme='dark'] .cn-status-label { color: #81c784; }
  :root[data-theme='dark'] .cn-status-dot { background: #81c784; }

  .cn-guest-desc {
    margin: 2px 0 0;
    font-size: var(--font-size-body);
    line-height: 1.45;
    color: var(--muted);
  }

  .cn-role-badge {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: var(--font-size-meta);
    font-weight: 700;
    background: var(--gold-light);
    color: var(--brown);
    line-height: 1.35;
    white-space: nowrap;
  }

  .badge-admin {
    background: #fdf5e6;
    color: #8c5300;
    border: 1px solid #fedfa8;
  }
  :root[data-theme='dark'] .badge-admin {
    background: #3d2300;
    color: #ffcb80;
    border-color: #663800;
  }

  .badge-ctv {
    background: #e8f5e9;
    color: #2e7d32;
    border: 1px solid #c8e6c9;
  }
  :root[data-theme='dark'] .badge-ctv {
    background: #1b381e;
    color: #81c784;
    border-color: #2e7d32;
  }

  .cn-profile-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-top: 14px;
    border-top: 1px solid var(--border);
    width: 100%;
  }

  .cn-btn-logout {
    flex: 0 0 auto;
    min-height: 40px;
    padding: 0 16px;
    border-radius: 10px;
    font-size: var(--font-size-label);
    font-weight: 600;
    border: 1.5px solid rgba(220, 53, 69, 0.22);
    background: rgba(220, 53, 69, 0.05);
    color: #dc3545;
    transition: all 0.15s ease;
  }
  .cn-btn-logout:hover {
    background: rgba(220, 53, 69, 0.12);
    border-color: #dc3545;
  }
  :root[data-theme='dark'] .cn-btn-logout {
    background: rgba(255, 133, 141, 0.08);
    border-color: rgba(255, 133, 141, 0.25);
    color: #ff858d;
  }

  .cn-danger-zone {
    margin-top: 4px;
    text-align: right;
  }

  .cn-btn-delete-account {
    background: transparent;
    border: 0;
    color: var(--muted);
    font-size: var(--font-size-label);
    cursor: pointer;
    text-decoration: underline;
    padding: 4px;
    transition: color 0.15s;
  }
  .cn-btn-delete-account:hover {
    color: #dc3545;
  }

  .cn-login-buttons {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding-top: 14px;
    border-top: 1px solid var(--border);
    width: 100%;
  }

  /* Subpage Personal & Admin */
  .cn-sub-block-title {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 10px;
    font-size: var(--font-size-card-title);
    font-weight: 700;
    color: var(--text);
  }

  .cn-sub-block-icon {
    font-size: 18px;
  }

  .cn-shortcuts-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .cn-shortcut-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 16px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--bg2);
    color: var(--text);
    text-decoration: none;
    cursor: pointer;
    font: inherit;
    width: 100%;
    text-align: left;
    transition: 0.15s;
    box-sizing: border-box;
  }
  .cn-shortcut-item:hover {
    border-color: var(--gold);
    background: var(--card);
  }
  .cn-shortcut-item:active {
    transform: scale(0.98);
  }

  .cn-shortcut-icon {
    font-size: 22px;
    flex-shrink: 0;
  }

  .cn-shortcut-text {
    flex: 1;
    display: flex;
    flex-direction: column;
  }
  .cn-shortcut-text strong {
    font-size: var(--font-size-body);
    color: var(--text);
  }
  .cn-shortcut-text small {
    font-size: var(--font-size-body);
    color: var(--muted);
  }

  .cn-shortcut-arrow {
    color: var(--muted);
    font-size: 16px;
  }

  .cn-admin-sub-block {
    padding: 16px;
    border: 1.5px solid color-mix(in srgb, var(--gold) 40%, var(--border));
    background: linear-gradient(135deg, color-mix(in srgb, var(--gold) 10%, var(--card)), var(--card));
  }

  .cn-admin-hub__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    width: 100%;
  }

  .cn-admin-banner__header {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .cn-admin-banner__header strong {
    font-size: var(--font-size-card-title);
    font-weight: 700;
  }

  .cn-admin-banner__icon {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    border-radius: 8px;
    background: linear-gradient(135deg, var(--gold) 0%, #a67324 100%);
    color: #fff;
    font-size: 17px;
    flex-shrink: 0;
  }

  .cn-admin-hub__more {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: var(--font-size-label);
    font-weight: 600;
    color: var(--gold);
    text-decoration: none;
    padding: 4px 10px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--gold) 12%, transparent);
    transition: background 0.15s;
    flex-shrink: 0;
  }
  .cn-admin-hub__more:hover {
    background: color-mix(in srgb, var(--gold) 22%, transparent);
  }

  .cn-admin-banner__desc {
    margin: 4px 0 12px;
    font-size: var(--font-size-body);
    color: var(--muted);
    line-height: 1.45;
  }

  .cn-admin-hub__grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
    width: 100%;
  }

  .cn-admin-hub__item {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 5px;
    padding: 12px 6px;
    border-radius: 12px;
    border: 1px solid var(--border);
    background: var(--card);
    text-decoration: none;
    color: var(--text);
    transition: transform 0.15s, border-color 0.15s;
  }
  .cn-admin-hub__item:hover {
    border-color: var(--gold);
    transform: translateY(-1px);
  }
  .cn-admin-hub__item-icon {
    font-size: 20px;
    line-height: 1;
  }
  .cn-admin-hub__item-label {
    font-size: var(--font-size-meta);
    font-weight: 600;
    color: var(--text2);
    text-align: center;
  }

  @media (max-width: 480px) {
    .cn-admin-hub__grid {
      grid-template-columns: repeat(2, 1fr);
      gap: 8px;
    }
    .cn-admin-hub__item {
      flex-direction: row;
      justify-content: flex-start;
      padding: 10px 14px;
      gap: 10px;
    }
  }

  /* Subpage Settings */
  .cn-motion-row{display:grid;grid-template-columns:minmax(0,1fr) 52px;align-items:start;gap:12px}
  .cn-motion-row .cn-setting-label{margin-bottom:0}
  .cn-motion-control{display:grid;justify-items:center;gap:3px}
  .cn-motion-switch{display:grid;place-items:center;width:52px;min-height:44px;padding:0;border:0;background:transparent;cursor:pointer}
  .cn-motion-track{display:flex;align-items:center;width:48px;height:28px;padding:3px;border-radius:var(--radius-control);background:var(--border)}
  .cn-motion-thumb{width:22px;height:22px;border-radius:50%;background:var(--card);box-shadow:var(--shadow)}
  .cn-motion-switch[aria-checked=true] .cn-motion-track{background:var(--gold)}
  .cn-motion-switch[aria-checked=true] .cn-motion-thumb{margin-left:20px;background:var(--on-gold)}
  .cn-motion-switch:focus-visible{outline:3px solid var(--gold);outline-offset:3px;border-radius:var(--radius-control)}
  .cn-motion-status{font-size:var(--font-size-meta);font-weight:600;color:var(--text2)}
  .cn-motion-system-note{grid-column:1/-1;margin:0;padding:12px;border:1px solid var(--border);border-radius:var(--radius-control);background:var(--gold-light);color:var(--text2);font-size:var(--font-size-body);line-height:1.6}
  .cn-ui-font-row .cn-size-stepper{flex-wrap:wrap}
  .cn-ui-font-row .cn-ui-font-reset{width:auto;padding-inline:calc(var(--space-page)*.6)}
  .cn-ui-font-preview-title{margin:var(--space-page) 0 0;color:var(--muted);font-size:var(--font-size-meta);font-weight:700}
  .cn-ui-font-help{margin:calc(var(--space-page)*.3) 0;color:var(--muted);font-size:var(--font-size-meta)}
  .cn-ui-font-demo{margin-block:calc(var(--space-page)*.6);padding:calc(var(--space-page)*.6);border:1px solid var(--border2);border-radius:var(--radius-control);background:var(--bg2)}
  .cn-ui-font-demo strong{font-size:var(--font-size-card-title)}
  .cn-ui-font-demo-tabs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:var(--radius-sm);margin-block:calc(var(--space-page)*.4)}
  .cn-ui-font-demo-tabs span{display:grid;place-items:center;min-height:44px;border-bottom:2px solid var(--border);font-size:var(--font-size-meta);text-align:center;overflow-wrap:anywhere}
  .cn-ui-font-demo-button{display:grid;place-items:center;min-height:44px;border:1px solid var(--gold);border-radius:var(--radius-sm);background:var(--card);color:var(--brown);font-size:var(--font-size-label)}
  .cn-setting-row {
    padding: 14px 0;
    border-bottom: 1px dashed var(--border);
  }
  .cn-setting-row:last-of-type {
    border-bottom: 0;
  }

  .cn-setting-label {
    margin-bottom: 8px;
  }
  .cn-setting-label strong {
    font-size: var(--font-size-body);
    display: block;
  }
  .cn-setting-label small {
    font-size: var(--font-size-body);
    color: var(--muted);
  }

  .cn-highlight-val {
    color: var(--gold);
  }

  .cn-lang-toggle-group {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  .cn-theme-toggle-group {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }

  .cn-toggle-btn {
    padding: 10px;
    border: 1.5px solid var(--border);
    border-radius: 10px;
    background: var(--bg2);
    color: var(--text);
    cursor: pointer;
    font-weight: 600;
    font-size: var(--font-size-label);
    transition: 0.15s;
  }
  .cn-toggle-btn.active {
    border-color: var(--gold);
    background: var(--card);
    color: var(--gold);
    box-shadow: 0 2px 8px rgba(200, 150, 62, 0.2);
  }

  .cn-bg-options-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  }

  .cn-bg-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    border: 1.5px solid;
    border-radius: 10px;
    cursor: pointer;
    font-weight: 600;
    font-size: var(--font-size-label);
    position: relative;
    transition: 0.15s;
  }
  .cn-bg-btn.selected {
    outline: 2px solid var(--gold);
    outline-offset: 1px;
  }
  .cn-bg-swatch {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    border: 1px solid rgba(0, 0, 0, 0.15);
  }
  .cn-bg-title {
    flex: 1;
    text-align: left;
  }
  .cn-bg-check {
    font-weight: 800;
  }

  .cn-font-options-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  }

  .cn-font-btn {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    padding: 10px 12px;
    border: 1.5px solid var(--border);
    border-radius: 10px;
    background: var(--bg2);
    color: var(--text);
    cursor: pointer;
    position: relative;
    transition: 0.15s;
  }
  .cn-font-btn.selected {
    border-color: var(--gold);
    background: var(--card);
    box-shadow: 0 2px 8px rgba(200, 150, 62, 0.2);
  }
  .cn-font-sample {
    font-size: 15px;
    margin-bottom: 2px;
  }
  .cn-font-name {
    font-size: var(--font-size-meta);
    color: var(--muted);
  }
  .cn-check-mark {
    position: absolute;
    top: 8px;
    right: 10px;
    color: var(--gold);
    font-weight: 800;
  }

  .cn-size-controls {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .cn-size-presets, .cn-lh-presets {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .cn-preset-btn {
    padding: 7px 12px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg2);
    color: var(--text2);
    cursor: pointer;
    font-size: var(--font-size-label);
    font-weight: 600;
    transition: 0.15s;
  }
  .cn-preset-btn.selected {
    border-color: var(--gold);
    background: var(--gold-light);
    color: var(--brown);
    font-weight: 700;
  }

  .cn-size-stepper {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 4px;
  }
  .cn-step-btn {
    width: 38px;
    height: 38px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--card);
    color: var(--text);
    cursor: pointer;
    font-weight: 700;
    font-size: var(--font-size-label);
  }
  .cn-step-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .cn-step-btn.active { background: var(--gold); color: var(--on-gold); border-color: var(--gold); }
  .cn-step-val {
    font-size: var(--font-size-label);
    font-weight: 700;
    min-width: 44px;
    text-align: center;
  }

  .cn-preview-box-wrap {
    margin-top: 14px;
    border: 1px solid var(--border);
    border-radius: 12px;
    overflow: hidden;
  }
  .cn-preview-box-header {
    display: flex;
    justify-content: space-between;
    padding: 8px 12px;
    background: var(--bg2);
    font-size: var(--font-size-label);
    color: var(--muted);
    border-bottom: 1px solid var(--border);
  }
  .cn-preview-box {
    padding: 16px;
    transition: background 0.2s, color 0.2s, font-size 0.2s;
  }
  .cn-preview-title {
    margin: 0 0 6px;
    font-weight: 700;
  }
  .cn-preview-box p {
    margin: 0;
  }

  /* Subpage Author */
  .cn-author-block {
    background: linear-gradient(180deg, var(--card) 0%, color-mix(in srgb, var(--gold) 4%, var(--card)) 100%);
    border-color: color-mix(in srgb, var(--gold) 28%, var(--border));
  }

  .cn-author-card {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .cn-author-header {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .cn-author-avatar-wrap {
    width: 52px;
    height: 52px;
    border-radius: 16px;
    background: linear-gradient(135deg, var(--gold) 0%, #a67324 100%);
    display: grid;
    place-items: center;
    flex-shrink: 0;
    box-shadow: 0 3px 10px rgba(200, 150, 62, 0.28);
  }
  .cn-author-avatar-icon {
    font-size: 26px;
  }

  .cn-author-title-group {
    flex: 1;
    min-width: 0;
  }

  .cn-author-name {
    margin: 0;
    font-size: 18px;
    font-weight: 800;
    color: var(--text);
    line-height: 1.3;
  }

  .cn-author-meta {
    margin: 3px 0 0;
    font-size: var(--font-size-meta);
    color: var(--gold);
    font-weight: 600;
  }

  .cn-author-body {
    display: flex;
    flex-direction: column;
    gap: 12px;
    background: var(--bg);
    padding: 16px;
    border-radius: 14px;
    border: 1px solid var(--border);
  }

  .cn-author-p {
    font-family: var(--font-reader);
    margin: 0;
    font-size: var(--font-size-body);
    line-height: 1.65;
    color: var(--text2);
    text-align: justify;
  }

  .cn-author-highlight {
    font-weight: 500;
    color: var(--text);
  }

  .cn-author-actions {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 2px;
  }

  .cn-author-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 12px 16px;
    border-radius: 12px;
    border: none;
    cursor: pointer;
    font-family: inherit;
    width: 100%;
    box-sizing: border-box;
    text-decoration: none;
    font-size: var(--font-size-label);
    font-weight: 600;
    transition: 0.15s ease;
  }

  .cn-author-btn-messenger {
    background: #0084ff;
    color: #ffffff;
  }
  .cn-author-btn-messenger:hover {
    background: #0073e6;
  }

  .cn-author-btn-fb {
    background: #1877f2;
    color: #ffffff;
  }
  .cn-author-btn-fb:hover {
    background: #166fe5;
  }


  .cn-auth-alert {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 16px;
    padding: 10px 14px;
    border-radius: 10px;
    background: #fdf2f2;
    border: 1px solid #f8b4b4;
    color: #9b1c1c;
    font-size: var(--font-size-body);
    line-height: 1.4;
  }
  :root[data-theme='dark'] .cn-auth-alert {
    background: #381216;
    border-color: #5c1e24;
    color: #f87171;
  }
  .cn-auth-alert-text {
    flex: 1;
    min-width: 0;
    overflow-wrap: break-word;
    text-align: left;
  }
  .cn-auth-alert-close {
    border: none;
    background: transparent;
    color: inherit;
    cursor: pointer;
    font-size: 16px;
    padding: 2px 6px;
  }

  /* General Buttons */
  .cn-btn {
    display: inline-flex;
    min-height: 44px;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 11px 18px;
    border: 0;
    border-radius: 12px;
    cursor: pointer;
    font: inherit;
    font-size: var(--font-size-label);
    font-weight: 600;
    text-decoration: none;
    transition: 0.15s;
  }
  .cn-btn-danger {
    background: #fff0f0;
    color: #dc3545;
    border: 1px solid #f5c2c7;
  }
  :root[data-theme='dark'] .cn-btn-danger {
    background: #381216;
    border-color: #5c1e24;
    color: #ff858d;
  }
  .cn-btn-google {
    background: #fff;
    color: #333;
    border: 1px solid #ccc;
  }
  .cn-btn-fb {
    background: #1877f2;
    color: #fff;
  }
  .cn-btn-apple {
    background: #000;
    color: #fff;
  }
  .cn-btn-ghost {
    background: var(--bg2);
    color: var(--text);
  }

  /* Logout Dialog */
  .cn-modal-scrim {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: grid;
    place-items: center;
    padding: 24px;
    background: rgba(0, 0, 0, 0.55);
    backdrop-filter: blur(4px);
  }
  .cn-modal-dialog {
    width: min(380px, 100%);
    padding: 24px;
    border: 1px solid var(--dialog-surface-border, var(--border));
    border-radius: 18px;
    background: var(--dialog-surface-background, var(--card));
    text-align: center;
    box-shadow: var(--dialog-surface-shadow, var(--shadow-xl));
  }
  .cn-modal-icon {
    font-size: 36px;
    margin-bottom: 8px;
  }
  .cn-modal-dialog h3 {
    margin: 0 0 8px;
    font-size: 18px;
  }
  .cn-modal-dialog p {
    margin: 0 0 20px;
    font-size: var(--font-size-body);
    color: var(--muted);
  }
  .cn-modal-actions {
    display: flex;
    gap: 10px;
  }
  .cn-modal-actions button {
    flex: 1;
  }
  .cn-btn-danger:disabled {
    opacity: 0.45;
    cursor: not-allowed;
    filter: grayscale(40%);
  }
  .cn-delete-dialog {
    width: min(420px, 100%);
  }
  .cn-delete-code-section {
    margin: 0 0 18px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    text-align: left;
  }
  .cn-delete-code-label {
    font-size: var(--font-size-label);
    font-weight: 600;
    color: var(--text);
    line-height: 1.4;
  }
  .cn-delete-code-display {
    padding: 10px 12px;
    background: rgba(220, 53, 69, 0.08);
    border: 1px dashed rgba(220, 53, 69, 0.45);
    border-radius: 8px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
    font-size: 14.5px;
    font-weight: 700;
    letter-spacing: 1.2px;
    color: #dc3545;
    text-align: center;
    user-select: all;
    word-break: break-all;
  }
  :root[data-theme='dark'] .cn-delete-code-display {
    background: rgba(255, 133, 141, 0.1);
    border-color: rgba(255, 133, 141, 0.4);
    color: #ff858d;
  }
  .cn-delete-code-input {
    width: 100%;
    box-sizing: border-box;
    padding: 10px 12px;
    border-radius: 8px;
    border: 1.5px solid var(--border);
    background: var(--bg);
    color: var(--text);
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 13.5px;
    letter-spacing: 0.8px;
    text-align: center;
    outline: none;
    transition: border-color 0.15s, box-shadow 0.15s;
  }
  .cn-delete-code-input:focus {
    border-color: #dc3545;
    box-shadow: 0 0 0 3px rgba(220, 53, 69, 0.15);
  }
  .cn-delete-code-feedback {
    font-size: var(--font-size-meta);
    color: var(--muted);
    text-align: center;
  }
  .cn-delete-code-feedback.matched {
    color: #198754;
    font-weight: 600;
  }
  :root[data-theme='dark'] .cn-delete-code-feedback.matched {
    color: #4ade80;
  }

  @media (max-width: 580px) {
    .cn-container {
      padding: 12px;
      gap: 12px;
      width: 100%;
      box-sizing: border-box;
      overflow-x: hidden;
    }
    .cn-card {
      padding: 16px;
    }
    .cn-avatar-img, .cn-avatar-placeholder {
      width: 52px;
      height: 52px;
    }
    .cn-user-greeting {
      font-size: var(--font-size-body);
    }
  }

  @media (max-width: 350px) {
    .cn-profile-actions {
      flex-direction: column;
      gap: 6px;
    }
    .cn-btn-logout {
      width: 100%;
      flex: 1 1 auto;
    }
  }
  /* Feedback & Contact Styles */
  .cn-tab-theme-feedback { border-left: 4px solid #ea580c; }
  .cn-feedback-intro { margin-bottom: 20px; line-height: 1.65; color: var(--muted); font-size: 0.95rem; }
  .cn-feedback-channels-grid { display: flex; flex-direction: column; gap: 16px; }
  .cn-contact-channel-card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 18px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.04);
  }
  .cn-channel-top { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
  .cn-channel-icon { font-size: 24px; }
  .cn-channel-header { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .cn-channel-header h3 { margin: 0; font-size: 1.05rem; font-weight: 700; color: var(--text); }
  .cn-channel-badge {
    font-size: var(--font-size-meta);
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 999px;
    background: rgba(234, 88, 12, 0.12);
    color: #ea580c;
  }
  .cn-badge-blue { background: rgba(0, 132, 255, 0.12); color: #0084ff; }
  .cn-badge-fb { background: rgba(24, 119, 242, 0.12); color: #1877f2; }
  .cn-channel-address {
    font-family: monospace;
    font-size: 0.95rem;
    font-weight: 700;
    color: var(--gold, #c59b27);
    margin: 4px 0 6px 0;
  }
  .cn-channel-desc {
    font-size: var(--font-size-body);
    color: var(--muted);
    margin: 0 0 14px 0;
    line-height: 1.45;
  }
  .cn-channel-btns { display: flex; gap: 10px; }
  .cn-channel-btn-primary {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    background: linear-gradient(135deg, var(--gold, #c59b27) 0%, #a67324 100%);
    color: #ffffff !important;
    border: none;
    border-radius: 10px;
    padding: 10px 18px;
    font-size: 0.9rem;
    font-weight: 700;
    cursor: pointer;
    flex: 1;
    min-height: 42px;
    box-shadow: 0 3px 10px rgba(197, 155, 39, 0.25);
    transition: transform 0.15s ease, filter 0.15s ease;
  }
  .cn-channel-btn-primary:active {
    transform: scale(0.98);
  }
  .cn-btn-email {
    background: linear-gradient(135deg, #ea580c 0%, #c2410c 100%);
    color: #ffffff !important;
    box-shadow: 0 3px 10px rgba(234, 88, 12, 0.28);
  }
  .cn-btn-messenger {
    background: #0084ff;
    color: #ffffff !important;
    box-shadow: 0 3px 10px rgba(0, 132, 255, 0.25);
  }
  .cn-btn-facebook {
    background: #1877f2;
    color: #ffffff !important;
    box-shadow: 0 3px 10px rgba(24, 119, 242, 0.25);
  }
  .cn-channel-btn-copy {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: 1.5px solid var(--border);
    color: var(--text);
    border-radius: 10px;
    padding: 10px 14px;
    font-size: var(--font-size-label);
    font-weight: 600;
    cursor: pointer;
    min-height: 42px;
    transition: background 0.15s ease, border-color 0.15s ease;
  }
  .cn-channel-btn-copy:hover {
    background: color-mix(in srgb, var(--gold, #c59b27) 12%, transparent);
    border-color: var(--gold, #c59b27);
  }
</style>
