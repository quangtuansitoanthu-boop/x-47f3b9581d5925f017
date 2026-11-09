<script lang="ts">
  import { X } from '@lucide/svelte';
  import { tick } from 'svelte';
  import AdminNavIcon from './AdminNavIcon.svelte';
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import { participationCopy } from '$lib/i18n/participation';
  const locale = getLocaleContext();

  interface Props {
    currentPath: string;
    mobileOpen?: boolean;
    onClose?: () => void;
    role: 'ctv' | 'admin';
  }

  let { currentPath, mobileOpen = false, onClose = () => {}, role }: Props = $props();
  let closeButton: HTMLButtonElement | null = $state(null);
  const groups = $derived([
    {
      id: 'overview',
      label: 'Tổng quan',
      items: role === 'admin' ? [
        { href: '/admin', icon: 'dashboard' as const, label: 'Bảng điều khiển' },
        { href: '/admin/analytics', icon: 'analytics' as const, label: 'Phân tích truy cập' },
        { href: '/admin/community', icon: 'community' as const, label: 'Hoạt động cộng đồng' },
        { href: '/admin/practice', icon: 'practice' as const, label: 'Chiến dịch tu tập' },
        { href: '/admin/practice-participation', icon: 'members' as const, label: participationCopy[locale.current === 'en' ? 'en' : 'vi'].title },
      ] : [],
    },
    {
      id: 'content',
      label: 'Nội dung',
      items: [
        { href: '/admin/books', icon: 'book' as const, label: 'Sách và bài viết' },
        { href: '/admin/phap-thoai', icon: 'talk' as const, label: 'Pháp thoại' },
        { href: '/admin/tu-tap', icon: 'practice' as const, label: 'Tu tập' },
      ],
    },
    {
      id: 'system',
      label: 'Hệ thống',
      items: role === 'admin' ? [
        { href: '/admin/members', icon: 'members' as const, label: 'Thành viên' },
        { href: '/admin/settings', icon: 'settings' as const, label: 'Cài đặt' },
      ] : [],
    },
  ].filter((group) => group.items.length));

  const isCurrent = (href: string) => {
    return href === '/admin' ? currentPath === href : currentPath === href || currentPath.startsWith(`${href}/`);
  };

  const closeMobile = () => {
    if (mobileOpen) onClose();
  };

  $effect(() => {
    if (!mobileOpen) return;
    void tick().then(() => closeButton?.focus());
  });
</script>

<aside id="admin-sidebar" class:admin-sidebar--open={mobileOpen} class="admin-sidebar" aria-label="Điều hướng quản trị" aria-modal={mobileOpen ? 'true' : undefined} role={mobileOpen ? 'dialog' : undefined}>
  <div class="admin-sidebar__brand">
    <a href={role === 'admin' ? '/admin' : '/admin/books'} aria-label="Quản trị Quang Từ" onclick={closeMobile}>
      <img src="/assets/branding/tu-tap-logo.png" alt="" width="40" height="40" />
      <span><strong>Quang Từ</strong><small>Khu vực quản trị</small></span>
    </a>
    <button bind:this={closeButton} class="admin-sidebar__close" type="button" aria-label="Đóng menu quản trị" onclick={onClose}>
      <X aria-hidden="true" size={20} strokeWidth={2.2} />
    </button>
  </div>

  <nav class="admin-sidebar__nav">
    {#each groups as group}
      <section aria-labelledby={`admin-nav-${group.id}`}>
        <h2 id={`admin-nav-${group.id}`}>{group.label}</h2>
        <ul>
          {#each group.items as item}
            <li>
              <a href={item.href} aria-current={isCurrent(item.href) ? 'page' : undefined} onclick={closeMobile}>
                <AdminNavIcon name={item.icon} />
                <span>{item.label}</span>
              </a>
            </li>
          {/each}
        </ul>
      </section>
    {/each}
  </nav>

  <div class="admin-sidebar__footer">
    <a href="/ca-nhan" onclick={closeMobile}><AdminNavIcon name="settings" /><span>Về trang cá nhân</span></a>
    <a href="/" onclick={closeMobile}><AdminNavIcon name="home" /><span>Về trang chính</span></a>
    <p>Quản trị nội dung có chánh niệm.</p>
  </div>
</aside>
