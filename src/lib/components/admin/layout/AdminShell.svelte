<script lang="ts">
  import { acquireScrollLock } from '$lib/browser/scroll-lock';
  let releaseBodyScroll: (() => void) | null = null;
  import { Menu, Moon, Sun } from '@lucide/svelte';
  import { onDestroy, untrack, type Snippet } from 'svelte';
  import SessionStatus from '$lib/components/auth/SessionStatus.svelte';
  import NotificationBell from '$lib/components/notifications/NotificationBell.svelte';
  import { getThemeContext } from '$lib/stores/theme.svelte';
  import AdminSidebar from './AdminSidebar.svelte';
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import { participationCopy } from '$lib/i18n/participation';
  const locale = getLocaleContext();

  interface Props {
    children: Snippet;
    currentPath: string;
    session: {
      authenticated: boolean;
      user: null | {
        avatarUrl?: string;
        displayName: string;
        email?: string;
        role: 'user' | 'ctv' | 'admin';
      };
    };
  }

  let { children, currentPath, session }: Props = $props();
  const theme = getThemeContext();
  let mobileOpen = $state(false);
  let menuButton: HTMLButtonElement | null = $state(null);
  let lastPath = $state('');
  let previousBodyOverflow = '';
  const role = $derived(session.user?.role === 'admin' ? 'admin' : 'ctv');
  const title = $derived.by(() => {
    if (currentPath.startsWith('/admin/analytics')) return 'Phân tích truy cập';
    if (currentPath.startsWith('/admin/community')) return 'Hoạt động cộng đồng';
    if (currentPath.startsWith('/admin/practice-participation')) return participationCopy[locale.current === 'en' ? 'en' : 'vi'].title;
    if (currentPath.startsWith('/admin/practice')) return 'Chiến dịch tu tập';
    if (currentPath.startsWith('/admin/books')) return 'Quản lý sách';
    if (currentPath.startsWith('/admin/phap-thoai')) return 'Quản lý pháp thoại';
    if (currentPath.startsWith('/admin/tu-tap')) return 'Quản lý tu tập';
    if (currentPath.startsWith('/admin/members')) return 'Quản lý thành viên';
    if (currentPath.startsWith('/admin/settings')) return 'Cài đặt hệ thống';
    return 'Bảng điều khiển';
  });
  const backHref = $derived(currentPath === '/admin' ? '/ca-nhan' : '/admin');
  const backLabel = $derived(currentPath === '/admin' ? 'Cá nhân' : 'Quản trị');

  function openSidebar(): void {

    releaseBodyScroll ??= acquireScrollLock();
    mobileOpen = true;
  }

  function closeSidebar(restoreFocus = true): void {
    mobileOpen = false;
    releaseBodyScroll?.(); releaseBodyScroll = null;
    if (restoreFocus) requestAnimationFrame(() => menuButton?.focus());
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (!mobileOpen) return;
    if (event.key === 'Escape') {
      closeSidebar();
      return;
    }
    if (event.key !== 'Tab') return;
    const sidebar = document.getElementById('admin-sidebar');
    const focusable = Array.from(sidebar?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ) ?? []).filter((element) => element.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!sidebar?.contains(document.activeElement)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
      return;
    }
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function handleResize(): void {
    if (mobileOpen && globalThis.innerWidth > 900) closeSidebar(false);
  }

  $effect(() => {
    const nextPath = currentPath;
    if (!lastPath) {
      lastPath = nextPath;
      return;
    }
    if (nextPath === lastPath) return;
    lastPath = nextPath;
    if (untrack(() => mobileOpen)) closeSidebar(false);
    requestAnimationFrame(() => document.getElementById('admin-content')?.focus());
  });

  onDestroy(() => {
    if (typeof document !== 'undefined' && mobileOpen) releaseBodyScroll?.(); releaseBodyScroll = null;
  });
</script>

<svelte:window onkeydown={handleKeydown} onresize={handleResize} />

<div class="admin-shell">
  <AdminSidebar {currentPath} {mobileOpen} onClose={() => closeSidebar()} {role} />
  {#if mobileOpen}
    <button class="admin-shell__scrim" type="button" aria-label="Đóng menu quản trị" onclick={() => closeSidebar()}></button>
  {/if}
  <div class="admin-shell__workspace" inert={mobileOpen ? true : undefined}>
    <header class="admin-topbar">
      <div class="admin-topbar__heading">
        <a
          class="admin-topbar__back"
          href={backHref}
          title={`Quay lại ${backLabel}`}
          aria-label="Quay lại"
          onclick={(event) => {
            if (typeof window !== 'undefined' && window.history.length > 1) {
              event.preventDefault();
              window.history.back();
            }
          }}
        >
          <span aria-hidden="true">←</span>
          <span class="admin-topbar__back-text">{backLabel}</span>
        </a>
        <button bind:this={menuButton} class="admin-topbar__menu" type="button" aria-label="Mở menu quản trị" aria-controls="admin-sidebar" aria-expanded={mobileOpen} onclick={openSidebar}>
          <Menu aria-hidden="true" size={21} strokeWidth={2} />
        </button>
        <h1 class="admin-topbar__title">{title}</h1>
      </div>
      <div class="admin-topbar__actions">
        <button class="admin-topbar__theme" type="button" aria-label={theme.value === 'dark' ? 'Chuyển sang chế độ sáng' : 'Chuyển sang chế độ tối'} onclick={() => theme.toggle()}>
          {#if theme.value === 'dark'}
            <Sun aria-hidden="true" size={18} strokeWidth={1.8} />
          {:else}
            <Moon aria-hidden="true" size={18} strokeWidth={1.8} />
          {/if}
        </button>
        <NotificationBell {session} />
        <SessionStatus {session} />
      </div>
    </header>
    <div id="admin-content" class="admin-shell__content" tabindex="-1">{@render children()}</div>
  </div>
</div>
