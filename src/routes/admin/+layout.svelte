<script lang="ts">
  import { page } from '$app/state';
  import type { Snippet } from 'svelte';
  import AdminShell from '$lib/components/admin/layout/AdminShell.svelte';
  import '$lib/styles/admin-layout.css';

  interface Props {
    children?: Snippet;
    data: {
      session: {
        authenticated: boolean;
        user: null | {
          avatarUrl?: string;
          displayName: string;
          email?: string;
          role: 'user' | 'ctv' | 'admin';
        };
      };
    };
  }

  let { children, data }: Props = $props();
  const role = $derived(data.session?.user?.role);
  const isAuthorized = $derived(Boolean(data.session?.authenticated && (role === 'admin' || role === 'ctv')));
</script>

{#if !isAuthorized}
  <div class="admin-unauthorized-guard">
    <div class="admin-unauthorized-card">
      <div class="admin-unauthorized-icon" aria-hidden="true">🛡️</div>
      <h1>Yêu cầu quyền Quản trị</h1>
      <p class="admin-unauthorized-desc">
        {#if !data.session?.authenticated}
          Bạn chưa đăng nhập. Vui lòng đăng nhập bằng tài khoản quản trị để truy cập khu vực này.
        {:else}
          Tài khoản <strong>{data.session.user?.displayName || 'Cá nhân'}</strong> ({data.session.user?.email || 'Thành viên'}) không có quyền quản trị hệ thống.
        {/if}
      </p>
      <div class="admin-unauthorized-actions">
        <a href="/ca-nhan" class="btn-guard-primary">← Quay lại trang Cá nhân</a>
        <a href="/" class="btn-guard-secondary">Về Trang chủ</a>
      </div>
    </div>
  </div>
{:else}
  <AdminShell currentPath={page.url.pathname} session={data.session}>
    {#if children}{@render children()}{/if}
  </AdminShell>
{/if}
