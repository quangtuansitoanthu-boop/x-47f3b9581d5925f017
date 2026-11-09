<script lang="ts">
  import { isNativeAdminReadOnly } from '$lib/browser/admin-access';
  import { Headphones, Plus } from '@lucide/svelte';
  import { onMount } from 'svelte';
  import { createQuery, useQueryClient } from '@tanstack/svelte-query';
  import { fetchAdminTalkAlbums } from '$lib/browser/content-catalogs';
  import { invalidateTalkState, serverStateKeys } from '$lib/browser/server-state';
  import { fetchWithSessionRefresh, getBrowserSession } from '$lib/browser/session-csrf';
  import AudioAdminPanel from '$lib/components/audio/AudioAdminPanel.svelte';
  import type { TalkAlbum } from '$lib/components/audio/AudioCatalog.svelte';
  import type { PageSessionDTO } from '$lib/server/auth/types';
  import { SESSION_CHANGE_EVENT } from '$lib/stores/session.svelte';
  import { formatVietnamDate } from '$lib/utils/vietnam-date-format';
  import { compareContentRecency } from '$lib/domain/content-recency';

  interface Props {
    initialAlbums: TalkAlbum[];
    role: 'ctv' | 'admin';
    userId: string;
  }

  type SourceFilter = 'all' | 'drive' | 'archive' | 'manual';
  type VisibilityFilter = 'all' | 'public' | 'private' | 'empty';

  let { initialAlbums, role, userId }: Props = $props();
  let query = $state('');
  let topic = $state('all');
  let source = $state<SourceFilter>('all');
  let visibility = $state<VisibilityFilter>('all');
  let editorAlbumId = $state<string | null>(null);
  let actionError = $state('');
  let notice = $state('');
  const queryClient = useQueryClient();
  const albumsQuery = createQuery(() => ({
    queryKey: serverStateKeys.talks.admin(userId),
    queryFn: async ({ signal }) => {
      const session = await getBrowserSession({ force: true });
      if (!canManageContent(session)) {
        leaveAdmin();
        throw new Error('Phiên quản trị đã hết hạn.');
      }
      return fetchAdminTalkAlbums(fetchWithSessionRefresh, signal);
    },
    initialData: initialAlbums,
  }));
  const albums = $derived(albumsQuery.data ?? []);
  const loading = $derived(albumsQuery.isFetching);
  const error = $derived(actionError || (albumsQuery.error instanceof Error ? albumsQuery.error.message : ''));

  const topics = $derived([...new Set(albums.map((album) => album.chu_de || 'Pháp ngữ'))].sort((a, b) => a.localeCompare(b, 'vi')));
  const filtered = $derived.by(() => {
    return albums.filter((album) => {
      if (visibility === 'empty' && album.tracks.length > 0) return false;
      if (visibility === 'public' && album.visibility === 'private') return false;
      if (visibility === 'private' && album.visibility !== 'private') return false;
      return true;
    }).sort(compareContentRecency);
  });

  function albumSource(album: TalkAlbum): Exclude<SourceFilter, 'all'> {
    if (album.archive_id?.trim()) return 'archive';
    if (album.tracks.some((track) => track.url.startsWith('/api/audio/drive/'))) return 'drive';
    return 'manual';
  }

  function sourceLabel(album: TalkAlbum): string {
    return { archive: 'Archive.org', drive: 'Google Drive', manual: 'Thủ công' }[albumSource(album)];
  }

  function resetFilters(): void {
    query = '';
    topic = 'all';
    source = 'all';
    visibility = 'all';
  }

  async function refreshAlbums(message = ''): Promise<void> {
    actionError = '';
    try {
      const result = await albumsQuery.refetch();
      if (result.error) throw result.error;
      notice = message;
    } catch (cause) {
      actionError = cause instanceof Error ? cause.message : 'Không thể làm mới danh sách Pháp thoại.';
    }
  }

  async function finishTalkChange(message: string): Promise<void> {
    actionError = '';
    try {
      await invalidateTalkState(queryClient);
      notice = message;
    } catch (cause) {
      actionError = cause instanceof Error ? cause.message : 'Không thể làm mới danh sách Pháp thoại.';
    }
  }

  function canManageContent(session: PageSessionDTO): boolean {
    return Boolean(session.authenticated && ['ctv', 'admin'].includes(session.user?.role ?? ''));
  }

  function leaveAdmin(): void {
    queryClient.removeQueries({ queryKey: serverStateKeys.talks.admin(userId) });
    actionError = 'Phiên quản trị đã hết hạn hoặc không đủ quyền.';
  }

  onMount(() => {
    const sessionChanged = (event: Event) => {
      if (!canManageContent((event as CustomEvent<PageSessionDTO>).detail)) leaveAdmin();
    };
    window.addEventListener(SESSION_CHANGE_EVENT, sessionChanged);
    return () => {
      window.removeEventListener(SESSION_CHANGE_EVENT, sessionChanged);
    };
  });
  const readOnly = $derived(isNativeAdminReadOnly(role));
</script>

<section class="admin-content-manager" aria-labelledby="admin-talk-title">
  <header class="admin-content-header">
    <div><span>Quản trị nội dung</span><h1 id="admin-talk-title">Pháp thoại</h1><p>Quản lý album, nguồn âm thanh và trạng thái hiển thị.</p></div>
    <div class="admin-content-actions">
      <button class="secondary" type="button" disabled={loading} onclick={() => void refreshAlbums('Danh sách đã được làm mới.')}>{loading ? 'Đang tải…' : 'Làm mới'}</button>
      {#if !readOnly}<button type="button" onclick={() => editorAlbumId = 'new'}><Plus aria-hidden="true" size={16} strokeWidth={2} /> Tạo album</button>{/if}
    </div>
  </header>

  {#if !readOnly}<details class="admin-content-tools">
    <summary><span><strong>Nhập dữ liệu</strong><small>Google Drive và Archive.org</small></span></summary>
    <AudioAdminPanel
      {albums}
      {role}
      editorAlbumId={null}
      showManualAction={false}
      onChanged={() => void finishTalkChange('Đã cập nhật Pháp thoại.')}
    />
  </details>{/if}

  {#if editorAlbumId && !readOnly}
    <AudioAdminPanel
      {albums}
      {role}
      {editorAlbumId}
      showTools={false}
      showManualAction={false}
      onEditorOpen={(albumId) => editorAlbumId = albumId}
      onEditorClose={() => editorAlbumId = null}
      onChanged={() => void finishTalkChange('Đã cập nhật Pháp thoại.')}
    />
  {/if}

  <div class="admin-approval-nav" role="tablist" aria-label="Lọc trạng thái">
    <button class:active={visibility === 'all'} class="admin-approval-tab" type="button" onclick={() => visibility = 'all'}>🎧 Tất cả ({albums.length})</button>
    <button class:active={visibility === 'public'} class="admin-approval-tab" type="button" onclick={() => visibility = 'public'}>🟢 Công khai</button>
    <button class:active={visibility === 'private'} class="admin-approval-tab" type="button" onclick={() => visibility = 'private'}>🔒 Riêng tư</button>
    <button class:active={visibility === 'empty'} class="admin-approval-tab" type="button" onclick={() => visibility = 'empty'}>⚠️ Cần thêm track</button>
  </div>

  <section class="admin-inventory" aria-labelledby="talk-inventory-title">
    <header><div><span>Kho nội dung</span><h2 id="talk-inventory-title">Danh sách album</h2></div><strong>{filtered.length}/{albums.length}</strong></header>
    {#if error}<p class="admin-inventory-alert error" role="alert">{error} <button type="button" onclick={() => void refreshAlbums()}>Thử lại</button></p>{/if}
    {#if notice}<p class="admin-inventory-alert" role="status">{notice}</p>{/if}
    {#if filtered.length === 0}
      <div class="admin-inventory-empty"><strong>Không có album phù hợp</strong><p>Thử chọn tab khác hoặc tạo album mới.</p><button type="button" onclick={() => visibility = 'all'}>Xem tất cả</button></div>
    {:else}
      <div class="admin-inventory-table-wrap">
        <table><caption>Danh sách album Pháp thoại</caption><thead><tr><th>Album</th><th>Giảng sư</th><th>Chủ đề</th><th>Track</th><th>Nguồn</th><th>Hiển thị</th><th>Ngày đăng</th><th><span class="sr-only">Hành động</span></th></tr></thead>
          <tbody>{#each filtered as album (album.id)}<tr class:needs-attention={album.tracks.length === 0}>
            <td data-label="Album"><div class="inventory-title"><span class="inventory-cover">{#if album.anh_dai_dien}<img src={album.anh_dai_dien.split('#')[0]} alt="" />{:else}<Headphones aria-hidden="true" size={20} strokeWidth={1.8} />{/if}</span><div><strong>{album.tieu_de}</strong><small>{album.mo_ta || album.id}</small></div></div></td>
            <td data-label="Giảng sư">{album.dien_gia || 'Chưa xác định'}</td>
            <td data-label="Chủ đề">{album.chu_de || 'Pháp ngữ'}</td>
            <td data-label="Track"><span class:warning={album.tracks.length === 0} class="admin-status-badge">{album.tracks.length || 'Chưa có'}</span></td>
            <td data-label="Nguồn">{sourceLabel(album)}</td>
            <td data-label="Hiển thị"><span class:private={album.visibility === 'private'} class="admin-status-badge">{album.visibility === 'private' ? 'Riêng tư' : 'Công khai'}</span></td>
            <td data-label="Ngày đăng">{formatVietnamDate(album.ngay_dang || album.created_at) || '—'}</td>
            <td data-label="Hành động">{#if !readOnly}<button class="row-action" type="button" onclick={() => editorAlbumId = album.id}>Chỉnh sửa</button>{/if}</td>
          </tr>{/each}</tbody>
        </table>
      </div>
    {/if}
  </section>
</section>
