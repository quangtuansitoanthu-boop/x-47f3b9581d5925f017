<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import NotificationBell from '../notifications/NotificationBell.svelte';
  import AppArtwork from '$lib/components/icons/AppArtwork.svelte';
  type Theme = 'light' | 'dark';

  const localeStore = getLocaleContext();
  const t = $derived(localeStore.t);

  interface PracticeHeaderDetail {
    active: boolean;
    backLabel?: string;
    onBack?: () => void;
    title?: string;
  }

  interface Props {
    currentPath?: string;
    theme?: Theme;
    onThemeToggle?: () => void;
    session?: {
      authenticated: boolean;
      user: null | { displayName: string; role: 'user' | 'ctv' | 'admin'; email?: string; avatarUrl?: string };
    };
  }

  let {
    currentPath = '/',
    theme = 'light',
    onThemeToggle = () => {},
    session = { authenticated: false, user: null }
  }: Props = $props();

  const isPractice = $derived(currentPath === '/tu-tap' || currentPath.startsWith('/tu-tap/'));
  const isTalks = $derived(currentPath === '/phap-thoai' || currentPath.startsWith('/phap-thoai/'));
  const isGuide = $derived(currentPath === '/huong-dan' || currentPath.startsWith('/huong-dan/'));
  const isBooks = $derived(currentPath === '/kinh-sach' || currentPath.startsWith('/kinh-sach/'));
  const isPersonal = $derived(['/ca-nhan', '/tien-do-tu-tap', '/trich-dan-cua-toi'].some(
    (path) => currentPath === path || currentPath.startsWith(path + '/'),
  ));
  let practiceHeader = $state<PracticeHeaderDetail>({ active: false });

  function handlePracticeBack(): void {
    if (practiceHeader.active && practiceHeader.onBack) {
      practiceHeader.onBack();
      return;
    }
    if (typeof window !== 'undefined' && window.history.length > 1) {
      window.history.back();
    } else {
      void goto('/');
    }
  }

  function reservePracticeHeader(node: HTMLElement) {
    const shell = node.closest<HTMLElement>('.qts-shell');
    const update = () => shell?.style.setProperty('--practice-topbar-height', `${Math.ceil(node.getBoundingClientRect().height)}px`);
    update();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(node);
    return { destroy() { observer?.disconnect(); shell?.style.removeProperty('--practice-topbar-height'); } };
  }

  function reserveSiteHeader(node: HTMLElement) {
    const shell = node.closest<HTMLElement>('.qts-shell');
    const update = () => shell?.style.setProperty('--site-header-height', `${Math.ceil(node.getBoundingClientRect().height)}px`);
    update();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(node);
    return { destroy() { observer?.disconnect(); shell?.style.removeProperty('--site-header-height'); } };
  }

  onMount(() => {
    const updatePracticeHeader = (event: Event) => {
      practiceHeader = (event as CustomEvent<PracticeHeaderDetail>).detail;
    };
    document.addEventListener('qts:practice-header', updatePracticeHeader);
    return () => document.removeEventListener('qts:practice-header', updatePracticeHeader);
  });
</script>

{#if isPractice}
  <header use:reservePracticeHeader class="tt-topbar qts-route-topbar">
    <button class="tt-back-btn" type="button" onclick={handlePracticeBack}>
      <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
      <span class="tt-back-label">{practiceHeader.active ? (practiceHeader.backLabel ?? t.header.back) : t.header.back}</span>
    </button>
    <div class="tt-topbar-title" style:text-transform={practiceHeader.active ? 'uppercase' : undefined}>{practiceHeader.active ? (practiceHeader.title ?? t.header.readArticle) : t.header.practiceMode}</div>
    <div class="tt-topbar-actions">
      <button class="tt-theme-btn" type="button" onclick={onThemeToggle} title={t.header.themeToggle} aria-label={t.header.themeToggle}>{theme === 'dark' ? '☀️' : '🌙'}</button>
      <NotificationBell {session} />
      <img src="/assets/branding/tu-tap-logo.png" alt="logo" class="tt-topbar-logo" />
    </div>
  </header>
{:else}
  <nav use:reserveSiteHeader class="nav qts-nav" class:qts-nav--return={isTalks || isGuide || isPersonal} aria-label={t.header.appTitle}>
    <div class="nav-main-row">
      <div class="nav-logo-wrap">
        <a class="nav-logo" href="/" aria-label={`${t.header.appTitle} — ${t.nav.home}`}>
          <img src="/assets/branding/tu-tap-logo.png" alt="" width="34" height="34" />
          <span class="nav-logo-content">
            {#if isTalks}
              <span class="nl-name">{t.header.talksTitle}</span>
              <span class="nl-tagline">{t.header.talksTagline}</span>
            {:else}
              <span class="nl-name">
                <span class="nl-name__line nl-name__line--1">{t.header.appTitleLine1 ?? 'Tu tập'}</span>{' '}
                <span class="nl-name__line nl-name__line--2">{t.header.appTitleLine2 ?? 'Phật pháp'}</span>
              </span>
              <span class="nl-tagline">{t.header.appTagline}</span>
            {/if}
          </span>
        </a>
      </div>
      <div class="nav-r">
        <a href="/kinh-sach" class="btn btn-outline nav-desktop-only"><AppArtwork name="books" size={20} /> {t.nav.books}</a>
        <a href="/phap-thoai" class="btn btn-outline nav-desktop-only nav-talks"><AppArtwork name="talks" size={20} /> {t.header.dharmaTalksNav}</a>
        <a href="/huong-dan" class="btn btn-outline nav-desktop-only">{t.header.guideNav}</a>
        <a href="/tu-tap" class="btn btn-outline nav-desktop-only nav-practice"><AppArtwork name="practice" size={20} /> {t.header.practiceNav}</a>
        <button
          class="nav-theme-btn"
          type="button"
          aria-label={theme === 'dark' ? 'Chuyển sang chế độ sáng' : 'Chuyển sang chế độ tối'}
          title={t.header.themeToggle}
          onclick={onThemeToggle}
        >
          {#if theme === 'dark'}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" />
              <line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" />
              <line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
          {:else}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          {/if}
        </button>
        <NotificationBell {session} />
      </div>
    </div>
  </nav>
{/if}

<style>
  .tt-topbar-actions { display:flex;align-items:center;gap:calc(var(--space-page)*.4);flex-shrink:0; }
  .tt-theme-btn { min-width:44px;min-height:44px; }
  .tt-topbar-title { min-width:0; }
</style>

