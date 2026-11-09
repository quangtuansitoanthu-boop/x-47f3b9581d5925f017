<script lang="ts">
  import { goto } from '$app/navigation';
  import { browser } from '$app/environment';
  import type { PageSessionDTO } from '$lib/server/auth/types';
  import { getLocaleContext } from '$lib/stores/locale.svelte';

  interface Props {
    session: PageSessionDTO;
    currentPath: string;
    variant?: 'default' | 'sticky-bouncing';
  }

  let { session, currentPath, variant = 'default' }: Props = $props();
  let dismissedManually = $state(false);

  const localeStore = getLocaleContext();
  const t = $derived(localeStore.t.notifications);

  const isNewRegisteredUser = $derived.by(() => {
    if (!browser || !session.authenticated || !session.user?.id) return false;
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.get('registered') === '1' || url.searchParams.get('new_user') === '1') {
        localStorage.setItem(`tutam_just_registered_${session.user.id}`, '1');
        return true;
      }
      const regFlag = sessionStorage.getItem('tutam_just_registered') || localStorage.getItem(`tutam_just_registered_${session.user.id}`);
      if (regFlag) return true;
      // If user first seen record doesn't exist, this is first session as logged-in user
      const userFirstSeenKey = `tutam_user_first_seen_${session.user.id}`;
      const firstSeen = localStorage.getItem(userFirstSeenKey);
      if (!firstSeen) {
        localStorage.setItem(userFirstSeenKey, String(Date.now()));
        localStorage.setItem(`tutam_just_registered_${session.user.id}`, '1');
        return true;
      }
      return false;
    } catch {
      return false;
    }
  });

  const storageKey = $derived(
    session.user?.id ? `tutam_new_user_guide_seen_${session.user.id}` : 'tutam_new_user_guide_seen_guest'
  );

  function isStoredDismissed(): boolean {
    if (!browser || !storageKey) return false;
    try {
      return localStorage.getItem(storageKey) === '1' || Boolean(session.user?.id && localStorage.getItem('tutam_new_user_guide_seen_guest') === '1');
    } catch {
      return false;
    }
  }

  const isExpanded = $derived(!dismissedManually && !isStoredDismissed());

  const shouldShow = $derived.by(() => {
    if (!browser || currentPath.startsWith('/huong-dan')) return false;
    return isExpanded;
  });

  function markDismissed(): void {
    dismissedManually = true;
    if (browser && storageKey) {
      try {
        localStorage.setItem(storageKey, '1');
      } catch {
        // Ignore localStorage quota errors
      }
    }
  }

  function handleOpenGuide(): void {
    markDismissed();
    void goto('/huong-dan#huong-dan-nguoi-moi');
  }

  function handleDismiss(event?: MouseEvent): void {
    event?.stopPropagation();
    markDismissed();
  }
</script>

{#if shouldShow}
  <aside
    class="new-user-guide-prompt"
    class:new-user-guide-prompt--bouncing={variant === 'sticky-bouncing'}
    class:new-user-guide-prompt--registered={session.authenticated && isNewRegisteredUser}
    role="region"
    aria-label={localeStore.current === 'en' ? 'Beginner Practice Guide' : 'Hướng dẫn tu tập cho người mới'}
    data-new-user-guide-prompt
  >
    <button
      type="button"
      class="prompt-close-x"
      aria-label={localeStore.current === 'en' ? 'Close' : 'Đóng'}
      title={localeStore.current === 'en' ? 'Close' : 'Đóng'}
      onclick={handleDismiss}
    >
      ✕
    </button>
    <button
      type="button"
      class="prompt-main-action"
      onclick={handleOpenGuide}
      aria-label={localeStore.current === 'en' ? 'Read practice guide for beginners' : 'Xem bài hướng dẫn cho người mới tu học Phật pháp'}
    >
      <div class="prompt-body">
        <div class="prompt-icon" aria-hidden="true">🌱</div>
        <div class="prompt-content">
          {#if session.authenticated && isNewRegisteredUser}
            <span class="prompt-welcome-tag">{localeStore.current === 'en' ? '🎉 Registration Successful' : '🎉 Đăng ký thành công'}</span>
          {/if}
          <strong class="prompt-title">
            {localeStore.current === 'en' ? (t.guideTitle || 'New to Buddhist Practice? Start Here') : 'Bạn mới tu học Phật pháp chưa biết bắt đầu từ đâu hãy xem bài này'}
          </strong>
          <p class="prompt-desc">
            {localeStore.current === 'en' ? t.guideDesc : 'Lộ trình 4 giai đoạn tìm hiểu Phật pháp, đọc sách nhân quả, nghe pháp thoại và công phu hằng ngày.'}
          </p>
        </div>
      </div>
    </button>
    <div class="prompt-actions">
      <button
        type="button"
        class="btn-view-guide"
        data-action="view-guide"
        onclick={handleOpenGuide}
      >
        {localeStore.current === 'en' ? (t.guideAction || 'View Guide') : 'Xem hướng dẫn'}
      </button>
      <button
        type="button"
        class="btn-dismiss"
        data-action="dismiss"
        aria-label={localeStore.current === 'en' ? (t.guideLater || 'Later') : 'Để sau'}
        title={localeStore.current === 'en' ? (t.guideLater || 'Later') : 'Để sau'}
        onclick={handleDismiss}
      >
        {localeStore.current === 'en' ? (t.guideLater || 'Later') : 'Để sau'}
      </button>
    </div>
  </aside>
{/if}

<style>
  .new-user-guide-prompt {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    width: calc(100% - 32px);
    max-width: 968px;
    margin: 0 auto 24px;
    padding: 16px 20px;
    box-sizing: border-box;
    border-radius: 20px;
    border: 1.5px solid var(--border2);
    background: var(--white);
    box-shadow: 0 4px 18px rgba(0, 0, 0, 0.05);
    color: var(--text, #2c2013);
    font-family: var(--font-app, system-ui, -apple-system, sans-serif);
  }

  :global([data-theme="dark"]) .new-user-guide-prompt {
    background: var(--bg2);
    border-color: color-mix(in srgb, var(--gold) 28%, var(--border2));
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25);
  }

  .prompt-close-x {
    position: absolute;
    top: 8px;
    right: 10px;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: none;
    background: rgba(0, 0, 0, 0.05);
    color: var(--text2, #6b5d4d);
    font-size: 13px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease;
    z-index: 2;
  }

  .prompt-close-x:hover {
    background: rgba(0, 0, 0, 0.12);
    color: var(--text, #2c2013);
  }

  :global([data-theme='dark']) .prompt-close-x {
    background: rgba(255, 255, 255, 0.08);
    color: #dfd4c0;
  }

  :global([data-theme='dark']) .prompt-close-x:hover {
    background: rgba(255, 255, 255, 0.16);
    color: #fff;
  }

  .prompt-main-action {
    display: flex;
    flex: 1;
    min-width: 0;
    padding: 0;
    border: none;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .prompt-body {
    display: flex;
    align-items: center;
    gap: 14px;
    flex: 1;
    min-width: 0;
  }

  .prompt-icon {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    flex-shrink: 0;
    border-radius: 14px;
    background: rgba(46, 125, 50, 0.12);
    border: 1px solid rgba(46, 125, 50, 0.24);
    font-size: 22px;
  }

  :global([data-theme='dark']) .prompt-icon {
    background: rgba(46, 125, 50, 0.25);
    border-color: rgba(76, 175, 80, 0.35);
  }

  .prompt-content {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .prompt-title {
    font-size: 15px;
    font-weight: 700;
    line-height: 1.35;
    color: var(--text, #2c2013);
  }

  .prompt-desc {
    margin: 0;
    font-size: 13px;
    line-height: 1.45;
    color: var(--text2, #6b5d4d);
  }

  .prompt-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .btn-view-guide {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 38px;
    padding: 0 16px;
    border-radius: 999px;
    border: none;
    background: linear-gradient(135deg, var(--gold, #c8963e), #996d24);
    color: #fff;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(200, 150, 62, 0.3);
    white-space: nowrap;
    transition: transform 0.15s ease, box-shadow 0.15s ease;
  }

  .btn-view-guide:hover {
    transform: translateY(-1px);
    box-shadow: 0 6px 16px rgba(200, 150, 62, 0.4);
  }

  .btn-dismiss {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 38px;
    padding: 0 12px;
    border-radius: 999px;
    border: 1px solid var(--border2);
    background: transparent;
    color: var(--text2, #6b5d4d);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    transition: background-color 0.15s ease, color 0.15s ease;
  }

  .btn-dismiss:hover {
    background: rgba(0, 0, 0, 0.05);
    color: var(--text, #2c2013);
  }

  :global([data-theme='dark']) .btn-dismiss:hover {
    background: rgba(255, 255, 255, 0.08);
    color: #f5eedf;
  }

  @media (max-width: 640px) {
    .new-user-guide-prompt {
      flex-direction: column;
      align-items: stretch;
      padding: 14px 16px;
      gap: 12px;
    }

    .prompt-actions {
      justify-content: flex-end;
    }

    .btn-view-guide,
    .btn-dismiss {
      flex: 1;
      text-align: center;
    }
  }

  /* BOUNCING & PULSING STYLES */
  .new-user-guide-prompt--bouncing {
    cursor: pointer;
    border: 2px solid var(--gold, #c8963e);
    background: linear-gradient(135deg, rgba(200, 150, 62, 0.12), rgba(46, 125, 50, 0.08));
    animation: none;
    box-shadow: 0 4px 18px rgba(200, 150, 62, 0.22);
  }

  .new-user-guide-prompt--bouncing:hover {
    animation-play-state: paused;
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(200, 150, 62, 0.32);
  }

  .prompt-welcome-tag {
    display: inline-block;
    align-self: flex-start;
    padding: 2px 8px;
    margin-bottom: 4px;
    border-radius: 999px;
    background: linear-gradient(135deg, #2e7d32, #1b5e20);
    color: #fff;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.2px;
  }

  @keyframes prompt-subtle-bounce {
    0%, 100% {
      transform: translateY(0);
    }
    15% {
      transform: translateY(-7px);
    }
    30% {
      transform: translateY(0);
    }
    42% {
      transform: translateY(-3.5px);
    }
    54% {
      transform: translateY(0);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .new-user-guide-prompt--bouncing {
      animation: none;
    }
  }
</style>
