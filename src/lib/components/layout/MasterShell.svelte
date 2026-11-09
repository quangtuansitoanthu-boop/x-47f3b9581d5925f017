<script lang="ts">
  import type { Snippet } from 'svelte';
  import { browser } from '$app/environment';
  import '../../styles/tokens.css';
  import '../../styles/master-shell.css';
  import '../../styles/interaction-performance.css';
  import '../../styles/ui-refresh.css';
  import MobileBottomNav from './MobileBottomNav.svelte';
  import SiteFooter from './SiteFooter.svelte';
  import SiteHeader from './SiteHeader.svelte';
  import EnglishPackDownload from './EnglishPackDownload.svelte';
  import AudioMiniPlayer from '$lib/components/audio/AudioMiniPlayer.svelte';
  import { audioPlayer } from '$lib/stores/audio-player.svelte';
  import { getLocaleContext } from '$lib/stores/locale.svelte';

  interface Props {
    children: Snippet;
    currentPath?: string;
    theme?: 'light' | 'dark';
    presenceCount?: number | null;
    presenceHidden?: boolean;
    onThemeToggle?: () => void;
    showFooter?: boolean;
    session?: {
      authenticated: boolean;
      user: null | { displayName: string; role: 'user' | 'ctv' | 'admin'; email?: string; avatarUrl?: string };
    };
  }

  let {
    children,
    currentPath = '/',
    theme = 'light',
    presenceCount = null,
    presenceHidden = true,
    onThemeToggle = () => {},
    showFooter = true,
    session = { authenticated: false, user: null }
  }: Props = $props();
  const localeStore = getLocaleContext();
  const isAdminArea = $derived(currentPath === '/admin' || currentPath.startsWith('/admin/'));
  const isScrollingCatalog = $derived(currentPath === '/kinh-sach' || currentPath === '/phap-thoai' || currentPath === '/huong-dan');
  let chromeHidden = $state(false);

  $effect(() => {
    const route = currentPath;
    chromeHidden = false;
    if (!browser || !isScrollingCatalog) return;

    let previousY = window.scrollY;
    let travel = 0;
    let keyboardNavigation = false;
    let gestureUntil = 0;
    let frame = 0;
    const chromeSelector = '.qts-nav, .library-top-bar, .pt-browse-controls, .guide-jump-bar, .qts-bottom-nav';
    const reveal = () => {
      chromeHidden = false;
      travel = 0;
      gestureUntil = 0;
      previousY = window.scrollY;
    };
    const update = () => {
      frame = 0;
      // Bỏ độ nảy ở biên để không nhận nhầm thành thao tác đổi hướng cuộn.
      const maximumY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      const y = Math.max(0, Math.min(window.scrollY, maximumY));
      const delta = y - previousY;
      previousY = y;
      const now = performance.now();
      // Mở panel có thể làm scroll anchoring đổi scrollY dù người dùng không vuốt.
      if (now > gestureUntil) {
        reveal();
        return;
      }
      // Gia hạn theo từng nhịp cuộn để giữ quán tính sau khi ngón tay đã nhấc.
      gestureUntil = now + 200;
      const active = document.activeElement;
      const editing = active instanceof HTMLElement && active.matches('input, textarea, select, [contenteditable="true"]');
      if (y <= 24 || keyboardNavigation || editing || document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]')) {
        chromeHidden = false;
        travel = 0;
        return;
      }
      if (!delta) return;
      travel = Math.sign(delta) === Math.sign(travel) ? travel + delta : delta;
      if (Math.abs(travel) >= 12) {
        const results = document.querySelector(route === '/kinh-sach' ? '.library-results' : route === '/huong-dan' ? '.guide-sections' : '.pt-library > .album-grid');
        // Chờ nội dung lấp vùng đầu trước khi giấu thanh lớn còn chiếm chỗ trong flow.
        if (!results || (travel > 0 && results.getBoundingClientRect().top > 0)) {
          chromeHidden = false;
          travel = 0;
          return;
        }
        chromeHidden = travel > 0;
        travel = 0;
      }
    };
    const scroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Tab' || event.key === 'ArrowUp' || event.key === 'ArrowDown' || event.key === 'PageUp' || event.key === 'PageDown' || event.key === 'Home' || event.key === 'End' || event.key === ' ') {
        keyboardNavigation = true;
        reveal();
      }
    };
    const pointerdown = () => {
      keyboardNavigation = false;
      gestureUntil = 0;
      travel = 0;
      previousY = window.scrollY;
    };
    const scrollGesture = () => {
      keyboardNavigation = false;
      gestureUntil = performance.now() + 200;
    };
    const focusin = (event: FocusEvent) => {
      if (event.target instanceof Element && event.target.closest(chromeSelector)) reveal();
    };
    window.addEventListener('scroll', scroll, { passive: true });
    window.addEventListener('keydown', keydown, true);
    window.addEventListener('pointerdown', pointerdown, { passive: true });
    window.addEventListener('wheel', scrollGesture, { passive: true });
    window.addEventListener('touchmove', scrollGesture, { passive: true });
    document.addEventListener('focusin', focusin);
    return () => {
      window.removeEventListener('scroll', scroll);
      window.removeEventListener('keydown', keydown, true);
      window.removeEventListener('pointerdown', pointerdown);
      window.removeEventListener('wheel', scrollGesture);
      window.removeEventListener('touchmove', scrollGesture);
      document.removeEventListener('focusin', focusin);
      if (frame) window.cancelAnimationFrame(frame);
    };
  });

  // A phone asked to render the "desktop site" keeps reporting the real device
  // width in screen.width while the layout viewport jumps to ~980px. The header
  // controls then sit past the right edge of the physical screen and cannot be
  // tapped, so flag the mismatch and let the fixed bottom bar pin itself back
  // to the width the person can actually see.
  $effect(() => {
    const root = document.documentElement;
    const sync = () => {
      const screenWidth = window.screen?.width ?? 0;
      const layoutWidth = root.clientWidth;
      if (screenWidth > 0 && screenWidth < 520 && layoutWidth > screenWidth + 120) {
        root.dataset.narrowScreen = 'true';
        root.style.setProperty('--real-screen-width', `${screenWidth}px`);
      } else {
        delete root.dataset.narrowScreen;
        root.style.removeProperty('--real-screen-width');
      }
    };
    sync();
    window.addEventListener('resize', sync);
    window.addEventListener('orientationchange', sync);
    return () => {
      window.removeEventListener('resize', sync);
      window.removeEventListener('orientationchange', sync);
    };
  });
</script>

<div
  class:qts-shell--admin={isAdminArea}
  class:qts-shell--audio-active={Boolean($audioPlayer.album)}
  class:qts-shell--talks={currentPath.startsWith('/phap-thoai')}
  class:qts-shell--catalog-scroll={isScrollingCatalog}
  class:qts-shell--chrome-hidden={isScrollingCatalog && chromeHidden}
  class="qts-shell"
  data-presence-count={presenceHidden || presenceCount === null ? undefined : presenceCount}
>
  <a class="qts-skip-link" href={isAdminArea ? '#admin-content' : '#main-content'}>{localeStore.current === 'en' ? 'Skip navigation' : 'Bỏ qua điều hướng'}</a>
  {#if !isAdminArea}<SiteHeader {currentPath} {theme} {onThemeToggle} {session} />{/if}
  <main id="main-content" class="qts-shell__main" tabindex="-1">
    <EnglishPackDownload />
    {@render children()}
  </main>
  {#if !isAdminArea && showFooter && currentPath.startsWith('/huong-dan')}<SiteFooter />{/if}
  <AudioMiniPlayer />
  <MobileBottomNav {currentPath} {theme} {onThemeToggle} {session} />
</div>

<style>
  .qts-shell--catalog-scroll :global(.library-top-bar),
  .qts-shell--catalog-scroll :global(.pt-browse-controls) {
    max-height: calc(100dvh - var(--catalog-controls-top, var(--nav-h)) - var(--catalog-bottom-clearance, 0px) - var(--space-page) / 2);
    overflow-y: auto;
    scroll-padding-block: calc(var(--space-page) / 2);
  }

  .qts-shell--catalog-scroll.qts-shell--audio-active :global(.library-top-bar),
  .qts-shell--catalog-scroll.qts-shell--audio-active :global(.pt-browse-controls) {
    max-height: calc(100dvh - var(--catalog-controls-top, var(--nav-h)) - var(--catalog-bottom-clearance, 0px) - var(--space-page) * 4.5);
  }

  @media (max-width: 768px) {
    .qts-shell--catalog-scroll {
      --catalog-bottom-clearance: calc(var(--nav-base-h) + env(safe-area-inset-bottom, 0px));
    }
  }

  :global(:root[data-native-app='true']) .qts-shell--catalog-scroll {
    --catalog-bottom-clearance: calc(var(--nav-base-h) + env(safe-area-inset-bottom, 0px));
  }

  .qts-shell--catalog-scroll :global(.qts-nav),
  .qts-shell--catalog-scroll :global(.guide-jump-bar),
  .qts-shell--catalog-scroll :global(.library-top-bar),
  .qts-shell--catalog-scroll :global(.pt-browse-controls) {
    transition: transform var(--motion-enter) var(--ease-standard), opacity var(--motion-enter) var(--ease-standard);
  }

  .qts-shell--chrome-hidden :global(.qts-nav) {
    transform: translateY(-100%);
  }

  .qts-shell--chrome-hidden :global(.library-top-bar),
  .qts-shell--chrome-hidden :global(.guide-jump-bar),
  .qts-shell--chrome-hidden :global(.pt-browse-controls) {
    transform: translateY(calc(-100% - var(--nav-h)));
  }

  .qts-shell--chrome-hidden :global(.qts-nav),
  .qts-shell--chrome-hidden :global(.guide-jump-bar),
  .qts-shell--chrome-hidden :global(.library-top-bar),
  .qts-shell--chrome-hidden :global(.pt-browse-controls) {
    opacity: 0;
    pointer-events: none;
  }

  @media (prefers-reduced-motion: reduce) {
    .qts-shell--catalog-scroll :global(.qts-nav),
    .qts-shell--catalog-scroll :global(.guide-jump-bar),
    .qts-shell--catalog-scroll :global(.library-top-bar),
    .qts-shell--catalog-scroll :global(.pt-browse-controls) {
      transition: none;
    }
  }
</style>
