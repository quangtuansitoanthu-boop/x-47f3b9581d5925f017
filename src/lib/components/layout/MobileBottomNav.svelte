<script lang="ts">
  import { uiScrollBehavior } from '$lib/browser/ui-motion';
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import { triggerHaptic } from '$lib/utils/haptics';

  import AppArtwork from '$lib/components/icons/AppArtwork.svelte';
  interface Props {
    currentPath?: string;
    theme?: 'light' | 'dark';
    onThemeToggle?: () => void;
    session?: {
      authenticated: boolean;
      user?: null | {
        role?: 'user' | 'ctv' | 'admin';
        displayName?: string;
      };
    };
  }

  let {
    currentPath = '/',
    session = { authenticated: false }
  }: Props = $props();

  const localeStore = getLocaleContext();
  const t = $derived(localeStore.t.nav);

  const isCurrent = (path: string) =>
    path === '/' ? currentPath === '/' : currentPath === path || currentPath.startsWith(`${path}/`);

  const isAdminOrCtv = $derived(session.user?.role === 'admin' || session.user?.role === 'ctv');

  function onTabClick(event: MouseEvent, href: string) {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    triggerHaptic('selection');
    if (typeof window !== 'undefined' && (currentPath === href || (href !== '/' && currentPath.startsWith(href)))) {
      event.preventDefault();
      window.scrollTo({ top: 0, behavior: uiScrollBehavior() });
      window.dispatchEvent(new CustomEvent('quangtu:tab-reset', { detail: { path: href } }));
    }
  }
</script>

<nav class="qts-bottom-nav" data-sveltekit-preload-code="tap" data-sveltekit-preload-data="off" aria-label={localeStore.current === 'en' ? 'Quick navigation' : 'Điều hướng nhanh'}>
  <!-- 1. Trang chủ -->
  <a
    class="qts-bottom-nav__item"
    data-nav="home"
    href="/"
    aria-current={isCurrent('/') ? 'page' : undefined}
    onclick={(event) => onTabClick(event, '/')}
  >
    <span class="qts-bottom-nav__icon" aria-hidden="true">
      <AppArtwork name="home" size={24} />
    </span>
    <span>{t.home}</span>
  </a>

  <!-- 2. Kinh sách -->
  <a
    class="qts-bottom-nav__item"
    data-nav="books"
    href="/kinh-sach"
    aria-current={isCurrent('/kinh-sach') ? 'page' : undefined}
    onclick={(event) => onTabClick(event, '/kinh-sach')}
  >
    <span class="qts-bottom-nav__icon" aria-hidden="true">
      <AppArtwork name="books" size={24} />
    </span>
    <span>{t.books}</span>
  </a>

  <!-- 3. Tu tập -->
  <a
    class="qts-bottom-nav__item"
    data-nav="practice"
    href="/tu-tap"
    aria-current={isCurrent('/tu-tap') ? 'page' : undefined}
    onclick={(event) => onTabClick(event, '/tu-tap')}
  >
    <span class="qts-bottom-nav__icon" aria-hidden="true">
      <AppArtwork name="practice" size={24} />
    </span>
    <span>{t.practice}</span>
  </a>

  <!-- 4. Pháp thoại -->
  <a
    class="qts-bottom-nav__item"
    data-nav="talks"
    href="/phap-thoai"
    aria-current={isCurrent('/phap-thoai') ? 'page' : undefined}
    onclick={(event) => onTabClick(event, '/phap-thoai')}
  >
    <span class="qts-bottom-nav__icon" aria-hidden="true">
      <AppArtwork name="talks" size={24} />
    </span>
    <span>{t.talks}</span>
  </a>

  <!-- 5. Cá nhân (đồng nhất cho mọi người dùng, bên trong có lối vào Quản trị cho Admin/CTV) -->
  <a
    class="qts-bottom-nav__item qts-bottom-nav__item--user"
    class:qts-bottom-nav__item--admin={isAdminOrCtv}
    data-nav="user"
    href="/ca-nhan"
    aria-current={isCurrent('/ca-nhan') || isCurrent('/admin') ? 'page' : undefined}
    onclick={(event) => onTabClick(event, '/ca-nhan')}
  >
    <span class="qts-bottom-nav__icon" aria-hidden="true" style="position: relative;">
      <AppArtwork name="personal" size={24} />
      {#if isAdminOrCtv}
        <span class="qts-admin-badge-dot" title={session.user?.role === 'admin' ? (localeStore.current === 'en' ? 'Administrator' : 'Quản trị viên') : (localeStore.current === 'en' ? 'Contributor' : 'Cộng tác viên')}></span>
      {/if}
    </span>
    <span>{t.personal}</span>
  </a>
</nav>
