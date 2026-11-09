<script lang="ts">
  import { browser } from '$app/environment';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import type { PageSessionDTO } from '$lib/server/auth/types';
  import { getLocaleContext } from '$lib/stores/locale.svelte';

  interface Props {
    session: PageSessionDTO;
    currentPath: string;
  }

  const LEGACY_STORAGE_KEY = 'tutam_guest_notice_dismissed_date';

  let { session, currentPath }: Props = $props();
  let dismissedManually = $state(false);

  const localeStore = getLocaleContext();
  const t = $derived(localeStore.t.notifications);

  const isTargetPage = $derived(
    currentPath === '/' ||
    currentPath.startsWith('/phap-thoai')
  );

  const shouldShow = $derived(
    browser &&
    !session.authenticated &&
    isTargetPage &&
    !dismissedManually
  );

  function handleLogin(): void {
    dismissedManually = true;
    void goto('/ca-nhan?tab=account');
  }

  function handleDismiss(): void {
    dismissedManually = true;
  }

  onMount(() => {
    try {
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch {
      // Ignore localStorage errors
    }
  });
</script>

{#if shouldShow}
  <aside
    class="guest-notice-banner"
    role="region"
    aria-label={t.guestAria}
    aria-live="polite"
    data-guest-notice-banner
  >
    <div class="banner-body">
      <div class="icon-wrap" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M7 18a5 5 0 0 1-1-9.9A6.5 6.5 0 0 1 18.5 7 5.5 5.5 0 0 1 18 18" />
          <path d="m9 17 2 2 4-4" />
        </svg>
      </div>
      <div class="content-text">
        <strong class="title">{t.guestTitle || 'Đăng nhập để lưu tiến độ'}</strong>
        <p class="description">
          {t.guestDesc || 'Đồng bộ tiến độ đọc sách, nghe pháp và tu tập với tài khoản của bạn.'}
        </p>
      </div>
    </div>

    <div class="actions">
      <button
        type="button"
        class="btn-login"
        onclick={handleLogin}
      >
        {t.guestLogin || 'Đăng nhập ngay'}
      </button>
      <button
        type="button"
        class="btn-later"
        onclick={handleDismiss}
      >
        {t.guestLater || 'Để sau'}
      </button>
      <button
        type="button"
        class="btn-close"
        aria-label={t.guestDismiss}
        title={t.guestDismiss}
        onclick={handleDismiss}
      >
        ×
      </button>
    </div>
  </aside>
{/if}

<style>
  .guest-notice-banner{--notice-accent:#247246;--notice-tint:#dcf5df;--notice-end:#f0faf0;--notice-ink:#173f29;--notice-copy:#365c43;--notice-line:#a7d6ae;--notice-icon:#ffffffc9;--notice-secondary:#ffffff99;position:relative;display:flex;align-items:center;gap:18px;width:100%;box-sizing:border-box;padding:18px 56px 18px 18px;border:1px solid var(--notice-line);border-radius:var(--radius-card,18px);background:linear-gradient(120deg,var(--notice-tint),var(--notice-end));box-shadow:0 6px 20px #245c3514;color:var(--text);font-family:var(--font-app);animation:guest-banner-in .2s ease-out}
  .banner-body{display:flex;align-items:center;gap:12px;flex:1;min-width:0}
  .icon-wrap{display:grid;place-items:center;flex-shrink:0;width:44px;height:44px;border-radius:14px;background:var(--notice-icon);color:var(--notice-accent);box-shadow:0 2px 6px #244b350b}
  .content-text{display:flex;flex-direction:column;gap:5px;min-width:0}
  .title{font-size:15px;font-weight:750;color:var(--notice-ink);line-height:1.4}
  .description{margin:0;font-size:13px;line-height:1.6;color:var(--notice-copy)}
  .actions{display:flex;align-items:center;gap:8px;flex-shrink:0}
  .btn-login,.btn-later{min-height:44px;padding:10px 16px;border-radius:var(--radius-control,14px);font:700 13px/1.4 var(--font-app);cursor:pointer;transition:background .15s,transform .15s}
  .btn-login{border:1px solid transparent;background:linear-gradient(135deg,#287a43,#1c5c34);color:#fff;box-shadow:0 3px 10px #28694f25}
  .btn-login:hover{filter:brightness(1.08)}
  .btn-login:active,.btn-later:active{transform:scale(.98)}
  .btn-later{border:1px solid var(--notice-line);background:var(--notice-secondary);color:var(--notice-ink)}
  .btn-later:hover{background:var(--notice-icon)}
  .btn-close{position:absolute;top:4px;right:4px;display:grid;place-items:center;width:44px;height:44px;padding:0;border:0;border-radius:50%;background:transparent;color:var(--notice-copy);font-size:23px;line-height:1;cursor:pointer}
  .btn-close:hover{background:var(--notice-secondary)}
  button:focus-visible{outline:3px solid var(--notice-accent);outline-offset:2px}
  :global([data-theme='dark']) .guest-notice-banner{--notice-accent:#a0e4ac;--notice-tint:#183e29;--notice-end:#142c20;--notice-ink:#e0f8e3;--notice-copy:#bbd7c0;--notice-line:#3e6d4c;--notice-icon:#285238;--notice-secondary:#1c3828;box-shadow:0 6px 20px #0003}
  @keyframes guest-banner-in{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}
  @media(max-width:680px){
    .guest-notice-banner{flex-direction:column;align-items:stretch;gap:14px;padding:16px}
    .banner-body{align-items:flex-start;padding-right:28px}
    .icon-wrap{width:40px;height:40px;border-radius:12px}
    .actions{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,1fr);gap:10px}
    .btn-login,.btn-later{padding:10px 8px}
  }
  @media(prefers-reduced-motion:reduce){.guest-notice-banner{animation:none}button{transition:none}}
</style>
