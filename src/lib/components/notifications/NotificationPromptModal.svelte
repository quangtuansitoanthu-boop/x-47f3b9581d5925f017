<script lang="ts">
  import { browser } from '$app/environment';
  import { onMount } from 'svelte';
  import type { PageSessionDTO } from '$lib/server/auth/types';
  import { getLocaleContext } from '$lib/stores/locale.svelte';

  interface Props {
    session?: PageSessionDTO | { authenticated: boolean };
  }

  let { session }: Props = $props();

  const localeStore = getLocaleContext();
  const t = $derived(localeStore.t.notifications);

  const STORAGE_KEY = 'tutam_notification_prompt_dismissed_until';
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

  let visible = $state(false);
  let status = $state<'prompt' | 'success' | 'denied'>('prompt');
  let loading = $state(false);

  const isAuthenticated = $derived(Boolean(session?.authenticated));

  function isDismissed(): boolean {
    if (!browser || typeof localStorage === 'undefined') return true;
    try {
      const until = localStorage.getItem(STORAGE_KEY);
      if (!until) return false;
      return Date.now() < Number(until);
    } catch {
      return false;
    }
  }

  function setDismissed(durationMs: number): void {
    if (!browser || typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, String(Date.now() + durationMs));
    } catch {
      // Ignore storage errors
    }
  }

  async function requestPermission(): Promise<void> {
    if (!browser) return;

    loading = true;
    try {
      // Use unified API — works on both native Android/iOS and web browsers
      const { requestUnifiedNotificationPermission, showUnifiedNotification } = await import(
        '$lib/browser/native-notifications'
      );
      const result = await requestUnifiedNotificationPermission();
      if (result === 'granted') {
        status = 'success';
        setDismissed(365 * 24 * 60 * 60 * 1000); // 1 year if granted

        const title = localeStore.current === 'en' ? 'Tu Tap Practice' : 'Tu tập cùng Quang Từ';
        await showUnifiedNotification(title, t.promptSuccessDesc).catch(() => {
          // Notification is best-effort
        });

        setTimeout(() => {
          visible = false;
        }, 2000);
      } else {
        // Denied or dismissed
        status = 'denied';
      }
    } catch {
      status = 'denied';
    } finally {
      loading = false;
    }
  }

  function handleDismiss(): void {
    setDismissed(SEVEN_DAYS_MS);
    visible = false;
  }

  onMount(() => {
    if (!browser) return;

    // Chỉ hiện đối với tài khoản đã đăng nhập, không hiện đối với khách
    if (!session?.authenticated) return;

    // If dismissed recently, skip
    if (isDismissed()) return;

    // Gentle delay after page mount (1.8s) so user sees the page first
    const timer = setTimeout(async () => {
      if (!session?.authenticated) return;

      // Check permission via unified API (handles both native + web)
      const { getUnifiedNotificationPermission } = await import('$lib/browser/native-notifications');
      const permission = await getUnifiedNotificationPermission();

      // If already granted or unsupported, do not prompt
      if (permission === 'granted' || permission === 'unsupported') return;
      // Never cover reading controls or a practice session with an unsolicited prompt.
      if (document.querySelector('.reader-modal, .tt-preview, .tt-practice, .pdf-shell')) return;

      visible = true;
    }, 1800);

    return () => clearTimeout(timer);
  });
</script>

{#if visible && isAuthenticated}
  <div
    class="notification-modal-card" data-dialog-glass
    role="dialog"
    aria-modal="false"
    aria-label={t.promptAria}
  >
    {#if status === 'prompt'}
      <div class="card-header">
        <div class="icon-bubble" aria-hidden="true">🔔</div>
        <div class="header-text">
          <strong class="title">{t.promptTitle}</strong>
          <span class="subtitle">{t.promptSubtitle}</span>
        </div>
        <button
          type="button"
          class="btn-close"
          aria-label={localeStore.current === 'en' ? 'Close' : 'Đóng'}
          onclick={handleDismiss}
        >×</button>
      </div>

      <p class="body-text">
        {t.promptDesc}
      </p>

      <div class="actions dialog-actions-balanced">
        <button
          type="button"
          class="btn-primary"
          disabled={loading}
          onclick={requestPermission}
        >
          {loading ? t.promptEnabling : t.promptAllow}
        </button>
        <button
          type="button"
          class="btn-secondary"
          disabled={loading}
          onclick={handleDismiss}
        >
          {t.promptLater}
        </button>
      </div>
    {:else if status === 'success'}
      <div class="feedback-card success">
        <div class="feedback-icon">🙏</div>
        <div class="feedback-content">
          <strong>{t.promptSuccessTitle}</strong>
          <p>{t.promptSuccessDesc}</p>
        </div>
      </div>
    {:else}
      <div class="feedback-card denied">
        <div class="feedback-icon">⚠️</div>
        <div class="feedback-content">
          <strong>{t.promptDeniedTitle}</strong>
          <p>
            {t.promptDeniedDesc}
          </p>
          <button type="button" class="btn-ack" onclick={handleDismiss}>{t.promptUnderstood}</button>
        </div>
      </div>
    {/if}
  </div>
{/if}

<style>
  .notification-modal-card {
    position: fixed;
    z-index: 9996;
    bottom: max(20px, calc(env(safe-area-inset-bottom) + 16px));
    right: 20px;
    width: min(400px, calc(100vw - 32px));
    padding: 16px 18px;
    box-sizing: border-box;
    border-radius: 20px;
    border: 1px solid var(--dialog-surface-border,var(--border));
    background: var(--dialog-surface-background,var(--card));
    box-shadow: var(--dialog-surface-shadow,var(--shadow-xl));
    color: var(--text, #2c2013);
    font-family: var(--font-app, system-ui, -apple-system, sans-serif);
    animation: slideUp 0.35s cubic-bezier(0.16, 1, 0.3, 1);
  }

  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(24px) scale(0.96);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  .card-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 8px;
  }

  .icon-bubble {
    width: 38px;
    height: 38px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 12px;
    background: color-mix(in srgb, var(--gold, #c8963e) 22%, transparent);
    font-size: 20px;
    flex-shrink: 0;
  }

  .header-text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  .title {
    font-size: 15px;
    font-weight: 700;
    color: var(--brown-dark, #4a3219);
    line-height: 1.3;
  }

  .subtitle {
    font-size: 12px;
    color: var(--gold-dark, #9e6d1c);
    font-weight: 500;
  }

  .btn-close {
    background: transparent;
    border: none;
    font-size: 20px;
    line-height: 1;
    color: var(--muted, #8b7355);
    cursor: pointer;
    padding: 4px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    transition: background 0.15s ease, color 0.15s ease;
  }

  .btn-close:hover {
    background: rgba(0, 0, 0, 0.05);
    color: var(--text, #2c2013);
  }

  .body-text {
    font-size: 13px;
    line-height: 1.45;
    color: var(--text2, #554433);
    margin: 0 0 14px 0;
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .btn-primary {
    flex: 1;
    height: 38px;
    padding: 0 14px;
    border: none;
    border-radius: 10px;
    background: linear-gradient(135deg, #d8a245, #b8822c);
    color: #fff;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(184, 130, 44, 0.28);
    transition: transform 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease;
    white-space: nowrap;
  }

  .btn-primary:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 6px 16px rgba(184, 130, 44, 0.38);
  }

  .btn-primary:active:not(:disabled) {
    transform: translateY(0);
  }

  .btn-primary:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }

  .btn-secondary {
    height: 38px;
    padding: 0 14px;
    border: 1px solid color-mix(in srgb, var(--gold, #c8963e) 30%, var(--border, #e4d7c5));
    border-radius: 10px;
    background: transparent;
    color: var(--muted, #786550);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .btn-secondary:hover:not(:disabled) {
    background: rgba(0, 0, 0, 0.04);
  }

  .feedback-card {
    display: flex;
    align-items: flex-start;
    gap: 12px;
  }

  .feedback-icon {
    font-size: 24px;
    line-height: 1;
    flex-shrink: 0;
  }

  .feedback-content {
    flex: 1;
    min-width: 0;
    font-size: 13px;
    line-height: 1.45;
  }

  .feedback-content strong {
    display: block;
    font-size: 14px;
    color: var(--brown-dark, #4a3219);
    margin-bottom: 4px;
  }

  .feedback-content p {
    margin: 0;
    color: var(--text2, #554433);
  }

  .btn-ack {
    margin-top: 10px;
    height: 32px;
    padding: 0 14px;
    border: none;
    border-radius: 8px;
    background: var(--gold, #c8963e);
    color: #fff;
    font-size: 12.5px;
    font-weight: 600;
    cursor: pointer;
  }

  @media (max-width: 640px) {
    .notification-modal-card {
      right: 12px;
      left: 12px;
      width: auto;
      bottom: max(84px, calc(env(safe-area-inset-bottom, 0px) + 76px));
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .notification-modal-card {
      animation: none;
    }
  }
</style>
