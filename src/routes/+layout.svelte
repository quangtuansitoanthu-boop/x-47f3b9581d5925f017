<script lang="ts">
  import { startParticipationSync } from '$lib/browser/practice-participation';
  import '$lib/styles/dialog-glass.css';
  import { invalidateAcceptedPracticeState, serverStateKeys, transitionTalkCatalogQueryPrincipal } from '$lib/browser/server-state';
  import { COMMUNITY_BLOCKS_CHANGED_EVENT, type CommunityBlocksChangedDetail } from '$lib/contracts/community-moderation';
  import { startCompletedPracticeLogSync } from '$lib/browser/practice-log-outbox';
  import { getBrowserPracticeSessionOutbox, PRACTICE_SESSION_ACCEPTED_EVENT, type PracticeSessionAcceptedDetail, type PracticeSessionOutboxStatus } from '$lib/browser/practice-session-outbox';
  import { fetchWithSessionRefresh } from '$lib/browser/session-csrf';
  import { getBrowserStorage } from '$lib/browser/storage-contract';
  import { PRACTICE_LOG_CHANGED_EVENT } from '$lib/domain/practice/completed-logs';
  import { practiceSyncStatusText } from '$lib/i18n/practice-sync-status';
  import { afterNavigate, goto } from '$app/navigation';
  import { browser } from '$app/environment';
  import { page } from '$app/state';
  import { QueryClient, QueryClientProvider } from '@tanstack/svelte-query';
  import { contentUpdateText } from '$lib/i18n/content-updates';
  import { onMount, untrack, type Snippet } from 'svelte';
  import { startPersonalEventsSync } from '$lib/browser/personal-lunar-events';
  import MasterShell from '$lib/components/layout/MasterShell.svelte';
  import NativeSelectPicker from '$lib/components/layout/NativeSelectPicker.svelte';
  import AppDialogHost from '$lib/components/layout/AppDialogHost.svelte';
  import { cancelAppDialogs } from '$lib/browser/app-dialog';
  import ReadingAdoptionPrompt from '$lib/components/reader/ReadingAdoptionPrompt.svelte';
  import GuestNoticeBanner from '$lib/components/auth/GuestNoticeBanner.svelte';
  import { selectAudioPlayerSession, refreshPracticePlayback } from '$lib/stores/audio-player.svelte';
  import { registerPwa, type PwaRegistrationHandle } from '$lib/browser/pwa-registration';
  import { announceOfflinePdfPrincipal } from '$lib/browser/offline-pdf-resolver';
  import { initializeNativeBackButton } from '$lib/browser/native-back-button';
  import { startNativeAppLinks } from '$lib/browser/native-app-links';
  import { initUrlFallback } from '$lib/browser/url-fallback';
  import {
    registerBrowserSessionStore,
    SESSION_CHANGE_EVENT,
    setSessionContext,
  } from '$lib/stores/session.svelte';
  import { setThemeContext } from '$lib/stores/theme.svelte';
  import { setLocaleContext } from '$lib/stores/locale.svelte';
  import { isNativeApp } from '$lib/browser/native-platform';
  import { initializeUiMotion } from '$lib/browser/ui-motion';
  import { initializeUiFontScale } from '$lib/browser/ui-font-scale';
  import { initializeInteractionPerformance } from '$lib/browser/interaction-performance';
  import { LEGACY_MASTER_LAYOUT_CONTRACT } from '$lib/contracts/legacy-compatibility';
  import type { PageSessionDTO } from '$lib/server/auth/types';

  interface Props {
    children?: Snippet;
    data?: {
      session: PageSessionDTO;
      sessionVerified?: boolean;
    };
  }

  let {
    children,
    data = {
      session: { authenticated: false, user: null, csrfToken: null, expiresAt: null }
    }
  }: Props = $props();
  const defaultSession = { authenticated: false, user: null, csrfToken: null, expiresAt: null };
  const initialSessionVerified = untrack(() => data?.sessionVerified === true && !isNativeApp()
    && (!browser || !document.documentElement.hasAttribute('data-offline-shell')));
  const sessionStore = setSessionContext(
    untrack(() => data?.session ?? defaultSession),
    initialSessionVerified,
  );
  if (browser) selectAudioPlayerSession(sessionStore.value);
  const theme = setThemeContext('auto');
  const locale = setLocaleContext();
  const t = $derived(locale.t.notifications);
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        enabled: browser,
        staleTime: 600_000,
        gcTime: 30 * 60_000,
        retry: (failureCount, error) => {
          if (error instanceof Error && (error.message.includes('quá tải') || error.message.includes('overload') || error.message.includes('503'))) {
            return false;
          }
          return failureCount < 1;
        },
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: 0,
      },
    },
  });
  let mounted = $state(false);
  let pdfTransitionNotice = $state<{ removed: number; retained: number } | null>(null);
  let pdfTransitionGeneration = 0;
  const pdfTransitionPrincipal = $derived(sessionStore.initialResolutionComplete === true
    ? (sessionStore.value.authenticated ? sessionStore.value.user?.id ?? null : null) : undefined);
  $effect(() => {
    if (!browser || !mounted || !isNativeApp() || pdfTransitionPrincipal === undefined) return;
    const principalId = pdfTransitionPrincipal;
    const generation = ++pdfTransitionGeneration;
    const task = new AbortController();
    pdfTransitionNotice = null;
    const isCurrent = () => !task.signal.aborted && generation === pdfTransitionGeneration && pdfTransitionPrincipal === principalId;
    void import('$lib/browser/pdf-book-transition').then(module => module.retireBundledPdfBooks({ principalId, isCurrent }, task.signal))
      .then(result => { if (isCurrent() && (result.removed.length || result.retained.length)) pdfTransitionNotice = { removed: result.removed.length, retained: result.retained.length }; })
      .catch(() => { /* Keep the old downloads if local verification/storage is unavailable. */ });
    return () => { task.abort(); if (generation === pdfTransitionGeneration) pdfTransitionGeneration += 1; };
  });

  let practiceLogSyncPending = $state(false);
  let practiceSessionSyncStatus = $state<PracticeSessionOutboxStatus | null>(null);
  const practiceSyncMessage = $derived(practiceSyncStatusText(practiceSessionSyncStatus, practiceLogSyncPending, locale.current === 'en'));
  let practiceSyncDismissed = $state(false);
  let retryPracticeSync = () => {};
  let pwaUpdateAvailable = $state(false);
  let pwaUpdateApplying = $state(false);
  let phapBaoModalOpen = $state(false);
  let pwaRegistration: PwaRegistrationHandle | null = null;
  const isReadingArticle = $derived(page.url.searchParams.has('article'));

  function applyPwaUpdate(): void {
    pwaUpdateApplying = true;
    if (!pwaRegistration?.applyUpdate()) pwaUpdateApplying = false;
  }

  afterNavigate(() => {
    cancelAppDialogs();
  });

  onMount(() => {
    mounted = true;
    // Dismiss after the first app paint; no network request or artificial startup delay.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      void import('$lib/browser/native-startup-screen').then(module => module.finishNativeStartup()).catch(() => {});
      const startup = document.getElementById('app-startup');
      if (startup) {
        startup.classList.add('startup-ready');
        window.setTimeout(() => startup.remove(), 240);
      }
    }));
    const native = isNativeApp();
    const disposePerformance = initializeInteractionPerformance(native);
    const disposeUiMotion = initializeUiMotion();
    const disposeUiFontScale = initializeUiFontScale();
    if (native) {
      document.documentElement.dataset.nativeApp = 'true';
    }
    // Mọi bước khởi động đều best-effort: một module lỗi không được làm trắng app.
    try {
      const savedTheme = localStorage.getItem('tutam_dark_mode');
      if (savedTheme === '1') theme.apply('dark');
      else if (savedTheme === '0') theme.apply('light');
      else theme.apply('auto');
    } catch {
      // Giữ theme mặc định khi storage không truy cập được.
    }
    void initializeNativeBackButton().catch(() => undefined);
    let disposed = false;
    const unregisterSessionStore = registerBrowserSessionStore(sessionStore);
    const practiceStorage = getBrowserStorage();
    const stopParticipationSync = startParticipationSync(practiceStorage,() => sessionStore.value);
    const practiceOutbox = getBrowserPracticeSessionOutbox(fetchWithSessionRefresh, practiceStorage);
    practiceOutbox.setSession(sessionStore.value);
    const unsubscribePracticeSync = practiceOutbox.subscribe(status => { if (!disposed) practiceSessionSyncStatus = status; });
    const flushPracticeSessions = (retryFailed = true) => {
      if (disposed) return;
      practiceOutbox.setSession(sessionStore.value);
      const status = practiceOutbox.getStatus();
      if (document.visibilityState !== 'hidden' && sessionStore.value.authenticated && status.pendingOperations
        && status.failure !== 'authentication' && status.failure !== 'rejected'
        && (retryFailed || status.phase !== 'failed')) {
        void practiceOutbox.flush().catch(() => undefined);
      }
    };
    retryPracticeSync = () => {
      if (!sessionStore.value.authenticated || !sessionStore.value.csrfToken || practiceSessionSyncStatus?.failure === 'authentication') {
        void goto('/ca-nhan?tab=account');
        return;
      }
      flushPracticeSessions();
      if (practiceLogSyncPending) window.dispatchEvent(new CustomEvent(PRACTICE_LOG_CHANGED_EVENT));
    };
    const selectPracticeSession = () => flushPracticeSessions(false);
    const resumePracticeSync = () => flushPracticeSessions();
    window.addEventListener(SESSION_CHANGE_EVENT, selectPracticeSession);
    document.addEventListener('visibilitychange', resumePracticeSync);
    flushPracticeSessions(false);
    const stopCompletedLogSync = startCompletedPracticeLogSync(fetchWithSessionRefresh, practiceStorage,
      () => sessionStore.value,
      () => {
        const id = sessionStore.value.user?.id;
        if (!id) return;
        void queryClient.invalidateQueries({ queryKey: serverStateKeys.practiceCommunity.campaigns(id) });
        void queryClient.invalidateQueries({ queryKey: serverStateKeys.practiceCommunity.adminCampaigns(id) });
        void queryClient.invalidateQueries({ queryKey: serverStateKeys.practiceCommunity.progress(id) });
        void queryClient.invalidateQueries({ queryKey: serverStateKeys.practiceCommunity.leaderboard, refetchType: 'none' });
      },
      (pending) => { practiceLogSyncPending = pending; });
    const refreshAcceptedPracticeProgress = (event: Event) => {
      const detail = (event as CustomEvent<PracticeSessionAcceptedDetail>).detail;
      const currentId = sessionStore.value.authenticated ? sessionStore.value.user?.id : null;
      // Chỉ đồng bộ các màn liên quan sau xác nhận của server; không fetch riêng cho widget.
      void invalidateAcceptedPracticeState(queryClient, currentId ?? null, detail).catch(() => undefined);
    };
    window.addEventListener(PRACTICE_SESSION_ACCEPTED_EVENT, refreshAcceptedPracticeProgress);
    // Restore the server cookie after web OAuth and revalidate cached native
    // sessions. Mount first so offline content can render without waiting.
    if (native || !initialSessionVerified) {
      void sessionStore.refresh().catch(() => undefined);
    }
    const stopPersonalEventsSync = startPersonalEventsSync();
    let previousTalkCatalogPrincipal = {
      role: sessionStore.value.user?.role ?? 'guest',
      principalId: sessionStore.value.authenticated ? sessionStore.value.user?.id ?? null : null,
    };
    const selectAudioSession = (event: Event) => {
      const nextTalkCatalogPrincipal = {
        role: sessionStore.value.user?.role ?? 'guest',
        principalId: sessionStore.value.authenticated ? sessionStore.value.user?.id ?? null : null,
      };
      if (previousTalkCatalogPrincipal.principalId !== nextTalkCatalogPrincipal.principalId) {
        // Invalidate even an A→B→A sequence batched before the next reactive turn.
        pdfTransitionGeneration += 1;
        pdfTransitionNotice = null;
      }
      if (previousTalkCatalogPrincipal.principalId &&
        (previousTalkCatalogPrincipal.principalId !== nextTalkCatalogPrincipal.principalId
          || previousTalkCatalogPrincipal.role !== nextTalkCatalogPrincipal.role)) {
        const oldId = previousTalkCatalogPrincipal.principalId;
        for (const queryKey of [serverStateKeys.participation.principal(oldId),serverStateKeys.communityBlocks.list(oldId),
          serverStateKeys.communityModeration.principal(oldId),
          serverStateKeys.mindfulCommunity.principal(oldId),
          serverStateKeys.practiceCommunity.leaderboardForPrincipal(oldId)]) {
          void queryClient.cancelQueries({ queryKey });
          queryClient.removeQueries({ queryKey });
        }
      }
      transitionTalkCatalogQueryPrincipal(queryClient, previousTalkCatalogPrincipal, nextTalkCatalogPrincipal);
      previousTalkCatalogPrincipal = nextTalkCatalogPrincipal;
      try {
        selectAudioPlayerSession((event as CustomEvent<PageSessionDTO>).detail);
      } catch {
        // Bỏ qua session event lỗi – giữ session hiện tại.
      }
    };
    window.addEventListener(SESSION_CHANGE_EVENT, selectAudioSession);
    const invalidateBlocks = (event: Event) => {
      const detail = (event as CustomEvent<CommunityBlocksChangedDetail>).detail;
      if (sessionStore.value.authenticated && detail?.principalId === sessionStore.value.user?.id) {
        const queryKey = serverStateKeys.mindfulCommunity.principal(detail.principalId);
        // Anonymous DTOs intentionally carry no account ID to filter on. Clear
        // stale block-sensitive projections, with one refresh per active query.
        void queryClient.cancelQueries({ queryKey }).then(() => {
          if (!sessionStore.value.authenticated || sessionStore.value.user?.id !== detail.principalId) return;
          queryClient.removeQueries({ queryKey, type: 'inactive' });
          void queryClient.resetQueries({ queryKey, type: 'active' });
        });
      }
      if (detail?.blocked && sessionStore.value.authenticated && detail.principalId === sessionStore.value.user?.id) {
        void queryClient.invalidateQueries({ queryKey: serverStateKeys.communityBlocks.list(detail.principalId), exact: true, refetchType: 'none' });
      }
    };
    window.addEventListener(COMMUNITY_BLOCKS_CHANGED_EVENT, invalidateBlocks);

    // Hoãn các tác vụ mạng/ngầm sau khi giao diện đã vẽ xong (paint)
    const deferTimer = setTimeout(() => {
      if (disposed) return;
      if (native) {
        void import('$lib/browser/native-notifications').then(({ requestStartupExactReminderPermission }) => {
          if (!disposed) return requestStartupExactReminderPermission(() => !disposed);
        }).catch(() => undefined);
      }
      void initUrlFallback().catch(() => undefined);
      if (!native) {
        void registerPwa({
          onUpdateReady: () => {
            if (!disposed) pwaUpdateAvailable = true;
          },
          onReloadAttempt: () => { if (!disposed) pwaUpdateApplying = false; },
        }).then((registration) => {
          if (disposed) registration?.dispose();
          else {
            pwaRegistration = registration;
            announceOfflinePdfPrincipal(sessionStore.value, registration?.registration.active);
          }
        }).catch(() => {
          // The app remains fully usable when service workers are unavailable.
        });
      }
    }, 400);

    const handleOnline = () => {
      window.dispatchEvent(new CustomEvent('quangtu:online'));
      flushPracticeSessions();
    };
    const openPhapBao = () => { phapBaoModalOpen = true; };
    const handleLocaleChanged = () => {
      void queryClient.invalidateQueries({ queryKey: ['articles'] });
    };
    window.addEventListener('quangtu:locale-changed', handleLocaleChanged);
    const handleLoginRequired = () => {
      void goto('/ca-nhan?tab=account');
    };
    window.addEventListener('quangtu:login-required', handleLoginRequired);
    window.addEventListener('quangtu:open-phap-bao', openPhapBao);
    window.addEventListener('online', handleOnline);

    // Đăng ký lắng nghe sự kiện bấm vào thông báo nhắc nhở tu tập (Deep Linking)
    let stopNativeAppLinks: (() => void) | null = null;
    let stopReminderSync: (() => void) | null = null;
    let stopCalendarWidgetSync: (() => void) | null = null;
    let stopPracticeWidgetSync: (() => void) | null = null;
    if (native) {
      stopNativeAppLinks = startNativeAppLinks((target) => goto(target), refreshPracticePlayback);

      void import('$lib/browser/buddhist-calendar-widget').then(({ startBuddhistCalendarWidgetSync }) => {
        if (!disposed) stopCalendarWidgetSync = startBuddhistCalendarWidgetSync(() => locale.current);
      }).catch(() => {});
      void import('$lib/browser/practice-widget').then(({ startPracticeWidgetSync }) => {
        if (!disposed) stopPracticeWidgetSync = startPracticeWidgetSync(queryClient, () => sessionStore.value, () => locale.current);
      }).catch(() => {});

      // Tự động làm mới lịch thông báo 45 ngày tới trong nền
      import('$lib/browser/practice-reminder-service').then(({ startReminderSystemSync }) => {
        if (!disposed) stopReminderSync = startReminderSystemSync(() => locale.current);
      });
    }

    return () => {
      disposed = true;
      stopParticipationSync();
      stopCompletedLogSync();
      unsubscribePracticeSync();
      window.removeEventListener(SESSION_CHANGE_EVENT, selectPracticeSession);
      document.removeEventListener('visibilitychange', resumePracticeSync);
      retryPracticeSync = () => {};
      window.removeEventListener(PRACTICE_SESSION_ACCEPTED_EVENT, refreshAcceptedPracticeProgress);
      stopPersonalEventsSync();
      disposePerformance();
      disposeUiMotion();
      disposeUiFontScale();
      clearTimeout(deferTimer);
      stopNativeAppLinks?.();
      stopReminderSync?.();
      stopCalendarWidgetSync?.();
      stopPracticeWidgetSync?.();
      window.removeEventListener('quangtu:login-required', handleLoginRequired);
      window.removeEventListener('quangtu:locale-changed', handleLocaleChanged);
      window.removeEventListener('quangtu:open-phap-bao', openPhapBao);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener(SESSION_CHANGE_EVENT, selectAudioSession);
      window.removeEventListener(COMMUNITY_BLOCKS_CHANGED_EVENT, invalidateBlocks);
      unregisterSessionStore();
      pwaRegistration?.dispose();
    };
  });
</script>

<svelte:head>
  <title>{LEGACY_MASTER_LAYOUT_CONTRACT.documentTitle}</title>
  <link rel="manifest" href="/manifest.json" />
  <link rel="icon" href="/assets/branding/tu-tap-logo.png" type="image/png" />
  <link rel="apple-touch-icon" href="/assets/branding/tu-tap-logo.png" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="apple-mobile-web-app-title" content="Quang Từ" />
  <meta name="theme-color" content="#c8963e" />
</svelte:head>

<QueryClientProvider client={queryClient}>
  <div
    class="qt-master-layout"
    data-layout-id={LEGACY_MASTER_LAYOUT_CONTRACT.layoutId}
    data-layout-contract-version={LEGACY_MASTER_LAYOUT_CONTRACT.contractVersion}
    data-mounted={mounted ? '1' : '0'}
  >
    <MasterShell
      currentPath={page.url.pathname}
      theme={theme.value}
      onThemeToggle={() => theme.toggle()}
      session={sessionStore.value}
    >
      {#if page.url.pathname === '/' && !sessionStore.value.authenticated && !isReadingArticle}
        <div class="qt-home-login-notice">
          <GuestNoticeBanner session={sessionStore.value} currentPath={page.url.pathname} />
        </div>
      {/if}
      {#if children}{@render children()}{/if}
      <!-- Giữ hai nhánh liền nhau để khoảng trắng không làm mất trạng thái :empty. -->
      <div class="qt-context-notices" data-context-notices>
        <ReadingAdoptionPrompt initialSession={sessionStore.value} />{#if !isReadingArticle}{#if page.url.pathname !== '/'}<GuestNoticeBanner session={sessionStore.value} currentPath={page.url.pathname} />{/if}{/if}
      </div>
    </MasterShell>
    <NativeSelectPicker route={page.url.href} principal={sessionStore.value.user?.id ?? null} />
    <AppDialogHost />
  </div>

  {#if pdfTransitionNotice && !pwaUpdateAvailable && !practiceSyncMessage}
    <div class="pwa-update-banner" data-pdf-transition-status role="status" aria-live="polite">
      <span>{#if pdfTransitionNotice.removed}{contentUpdateText[locale.current].pdfAutoRemoved} {pdfTransitionNotice.removed}{/if}
        {#if pdfTransitionNotice.retained} {contentUpdateText[locale.current].pdfAutoRetained}{/if}</span>
      <button type="button" class="dismiss" aria-label={contentUpdateText[locale.current].close} onclick={() => { pdfTransitionNotice = null; }}>×</button>
    </div>
  {/if}

  {#if phapBaoModalOpen}
    {#await import('$lib/components/phap-bao/PhapBaoModal.svelte') then { default: PhapBaoModal }}
      <PhapBaoModal
        bind:open={phapBaoModalOpen}
        session={sessionStore.value}
        onClose={() => phapBaoModalOpen = false}
      />
    {/await}
  {/if}

  {#if practiceSyncMessage && !practiceSyncDismissed && !pwaUpdateAvailable}
    <aside class="pwa-update-banner" style="white-space:normal" role="status" data-practice-sync-status>
      <span>{practiceSyncMessage}</span>
      {#if practiceSessionSyncStatus?.failure !== 'rejected'}
      <button type="button" onclick={() => retryPracticeSync()} disabled={practiceSessionSyncStatus?.phase === 'syncing'}>
        {!sessionStore.value.authenticated || !sessionStore.value.csrfToken || practiceSessionSyncStatus?.failure === 'authentication'
          ? locale.current === 'en' ? 'Sign in' : 'Đăng nhập'
          : locale.current === 'en' ? 'Try again' : 'Thử lại'}
      </button>
      {/if}
      <button type="button" onclick={() => { practiceSyncDismissed = true; }}>{locale.current === 'en' ? 'Later' : 'Để sau'}</button>
    </aside>
  {/if}
  {#if pwaUpdateAvailable}
    <aside class="pwa-update-banner" aria-live="polite" aria-label={t.pwaNewVersion} data-pwa-update-banner>
      <span>{t.pwaNewVersion}</span>
      <button
        type="button"
        onclick={applyPwaUpdate}
        disabled={pwaUpdateApplying}
      >{pwaUpdateApplying ? t.pwaUpdating : t.pwaUpdate}</button>
      {#if !pwaUpdateApplying}
        <button
          class="dismiss"
          type="button"
          aria-label={t.pwaLater}
          title={t.pwaLater}
          onclick={() => { pwaUpdateAvailable = false; }}
        >×</button>
      {/if}
    </aside>
  {/if}
</QueryClientProvider>

<style>
  .qt-master-layout { display: contents; }
  .qt-home-login-notice {
    width: min(920px, calc(100% - 32px));
    margin: 16px auto 0;
  }
  .qt-context-notices {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    width: min(920px, calc(100% - 32px));
    margin: 0 auto 28px;
  }
  .qt-context-notices:empty {
    margin-bottom: 0;
  }
  .qt-context-notices :global(> *) {
    width: 100%;
  }
  .pwa-update-banner {
    position: fixed;
    z-index: 9999;
    bottom: max(80px, calc(env(safe-area-inset-bottom) + 64px), calc(var(--audio-player-top, 0px) + var(--radius-sm)));
    left: 50%;
    display: flex;
    align-items: center;
    gap: 10px;
    width: max-content;
    max-width: calc(100vw - 28px);
    padding: 10px 12px 10px 18px;
    transform: translateX(-50%);
    animation: pwa-banner-in .3s cubic-bezier(.34, 1.2, .64, 1);
    border-radius: 28px;
    background: #c8963e;
    box-shadow: 0 4px 24px rgba(0, 0, 0, .35);
    color: #fff;
    font-family: var(--font-app);
    font-size: 14px;
    font-weight: 700;
    white-space: nowrap;
  }
  .pwa-update-banner button {
    min-height: 30px;
    padding: 4px 14px;
    cursor: pointer;
    border: 0;
    border-radius: 16px;
    background: #fff;
    color: #9a681e;
    font: inherit;
    font-size: 13px;
    font-weight: 800;
  }
  .pwa-update-banner button:disabled { cursor: wait; opacity: .82; }
  .pwa-update-banner button.dismiss {
    width: 30px;
    padding: 0;
    background: rgba(255, 255, 255, .16);
    color: #fff;
    font-size: 20px;
    line-height: 1;
  }
  .pwa-update-banner button:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
  .pwa-update-banner[data-practice-sync-status] {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    box-sizing: border-box;
    width: min(var(--dialog-compact-width), calc(100vw - var(--space-page) * 2));
    max-width: calc(100vw - var(--space-page) * 2);
    gap: calc(var(--space-page) * .5);
    padding: calc(var(--space-page) * .7);
    border: 1px solid var(--gold-muted);
    border-radius: var(--radius-card);
    background: var(--card);
    color: var(--text2);
    box-shadow: var(--shadow-lg);
    font-size: var(--font-size-body);
    font-weight: 500;
    line-height: 1.65;
  }
  .pwa-update-banner[data-practice-sync-status] span { grid-column: 1 / -1; }
  .pwa-update-banner[data-practice-sync-status] button {
    min-width: 44px;
    min-height: 44px;
    width: 100%;
    padding: calc(var(--space-page) * .4);
    border: 1px solid var(--border2);
    border-radius: var(--radius-control);
    background: var(--bg2);
    color: var(--text2);
    font-size: var(--font-size-label);
    font-weight: 700;
  }
  .pwa-update-banner[data-practice-sync-status] button:not(:last-child) { border-color: var(--gold); background: var(--gold); color: var(--on-gold); }
  .pwa-update-banner[data-practice-sync-status] button:focus-visible { outline-color: var(--text); }
  .pwa-update-banner[data-pdf-transition-status] {
    box-sizing:border-box;width:min(var(--dialog-compact-width),calc(100vw - var(--space-page)*2));
    align-items:flex-start;gap:calc(var(--space-page)*.5);padding:calc(var(--space-page)*.7);
    border:1px solid var(--gold-muted);border-radius:var(--radius-card);background:var(--card);color:var(--text2);
    box-shadow:var(--shadow-lg);font-size:var(--font-size-body);font-weight:500;line-height:1.65;white-space:normal;
  }
  .pwa-update-banner[data-pdf-transition-status] span{min-width:0;flex:1;overflow-wrap:anywhere}
  .pwa-update-banner[data-pdf-transition-status] button.dismiss{width:44px;min-width:44px;min-height:44px;background:var(--bg2);color:var(--text);border:1px solid var(--border2);border-radius:var(--radius-control)}
  .pwa-update-banner[data-pdf-transition-status] button:focus-visible{outline-color:var(--text)}
  @keyframes pwa-banner-in {
    from { opacity: 0; transform: translateX(-50%) translateY(16px); }
    to { opacity: 1; transform: translateX(-50%) translateY(0); }
  }
  @media (prefers-reduced-motion: reduce) {
    .pwa-update-banner { animation: none; }
  }
</style>
