<script module lang="ts">
  import type { FacebookAdminData as FacebookAdminDataShape } from '$lib/server/services/facebook-integration';

  interface FacebookAdminLifecycleSession {
    authenticated: boolean;
    user?: null | { id: string; role: string };
  }

  export interface FacebookAdminRequestToken {
    readonly controller: AbortController;
    readonly generation: number;
  }

  export function redactFacebookAdminData(): FacebookAdminDataShape {
    return {
      configured: false,
      enabled: false,
      graphVersion: '',
      settings: { publishPolicy: 'review', sourceUrl: '', updatedAt: '' },
      connection: null,
      imports: [],
      importsPage: { nextOffset: null, offset: 0 },
    };
  }

  export function createFacebookAdminRequestLifecycle(ownerId: string, onInvalidate: () => void) {
    let active = true;
    let generation = 0;
    const controllers = new Set<AbortController>();

    const abortRequests = () => {
      for (const controller of controllers) controller.abort();
      controllers.clear();
    };

    return {
      begin(): FacebookAdminRequestToken | null {
        if (!active) return null;
        const controller = new AbortController();
        controllers.add(controller);
        return { controller, generation };
      },

      captureGeneration(): number | null {
        return active ? generation : null;
      },

      destroy(): void {
        if (!active) return;
        active = false;
        generation += 1;
        abortRequests();
      },

      finish(request: FacebookAdminRequestToken): void {
        controllers.delete(request.controller);
      },

      isCurrent(request: FacebookAdminRequestToken): boolean {
        return active && request.generation === generation && !request.controller.signal.aborted;
      },

      isGenerationCurrent(captured: number): boolean {
        return active && captured === generation;
      },

      transition(session: FacebookAdminLifecycleSession): string | null {
        if (active && session.authenticated && session.user?.role === 'admin' && session.user.id === ownerId) return null;
        if (active) {
          active = false;
          generation += 1;
          abortRequests();
          onInvalidate();
        }
        return session.authenticated && session.user?.role === 'admin' ? '/admin/settings' : '/?login=1';
      },
    };
  }
</script>

<script lang="ts">
  import { confirmInApp } from '$lib/browser/app-dialog';
  import { isNativeAdminReadOnly } from '$lib/browser/admin-access';
  const readOnly = $derived(isNativeAdminReadOnly('admin'));
  import { onMount, untrack } from 'svelte';
  import { ExternalLink, Link2, RefreshCw, Save, Trash2 } from '@lucide/svelte';
  import { fetchWithSessionRefresh, requireBrowserCsrf } from '$lib/browser/session-csrf';
  import type { PageSessionDTO } from '$lib/server/auth/types';
  import type { FacebookAdminData } from '$lib/server/services/facebook-integration';
  import { SESSION_CHANGE_EVENT } from '$lib/stores/session.svelte';
  import { formatVietnamDate } from '$lib/utils/vietnam-date-format';

  interface Props { initial: FacebookAdminData; ownerId: string }
  let { initial, ownerId }: Props = $props();
  let data = $state(untrack(() => initial));
  let sourceUrl = $state(untrack(() => initial.settings.sourceUrl));
  let publishPolicy = $state<'review' | 'auto'>(untrack(() => initial.settings.publishPolicy));
  let busy = $state('');
  let notice = $state('');
  let error = $state('');
  let pageOffsets = $state<number[]>([]);
  let principalActive = $state(true);

  function clearActorState(): void {
    data = redactFacebookAdminData();
    sourceUrl = '';
    publishPolicy = 'review';
    pageOffsets = [];
    busy = '';
    notice = '';
    error = '';
    principalActive = false;
  }

  const lifecycle = createFacebookAdminRequestLifecycle(untrack(() => ownerId), clearActorState);

  async function refresh(offset = data.importsPage.offset): Promise<void> {
    const request = lifecycle.begin();
    if (!request) return;
    try {
      const response = await fetchWithSessionRefresh(`/api/admin/facebook?importOffset=${offset}&importLimit=50`, {
        headers: { accept: 'application/json' },
        signal: request.controller.signal,
      });
      if (!lifecycle.isCurrent(request)) return;
      if (!response.ok) throw new Error(await responseMessage(response));
      const nextData = await response.json() as FacebookAdminData;
      if (!lifecycle.isCurrent(request)) return;
      data = nextData;
      sourceUrl = nextData.settings.sourceUrl;
      publishPolicy = nextData.settings.publishPolicy;
    } finally {
      lifecycle.finish(request);
    }
  }

  async function loadImportPage(offset: number, rememberCurrent: boolean): Promise<void> {
    const generation = lifecycle.captureGeneration();
    if (generation === null) return;
    busy = 'Đang tải sổ nhập…';
    error = '';
    try {
      if (rememberCurrent) pageOffsets.push(data.importsPage.offset);
      await refresh(offset);
    } catch (reason) {
      if (lifecycle.isGenerationCurrent(generation)) {
        if (rememberCurrent) pageOffsets.pop();
        error = reason instanceof Error ? reason.message : 'Không thể tải sổ nhập Facebook.';
      }
    } finally {
      if (lifecycle.isGenerationCurrent(generation)) busy = '';
    }
  }

  function previousImportPage(): void {
    const offset = pageOffsets.pop();
    if (offset !== undefined) void loadImportPage(offset, false);
  }

  async function mutate(label: string, callback: (csrf: string, signal: AbortSignal) => Promise<Response>): Promise<void> {
    const request = lifecycle.begin();
    if (!request) return;
    busy = label;
    notice = '';
    error = '';
    try {
      const csrf = await requireBrowserCsrf();
      if (!lifecycle.isCurrent(request)) return;
      const response = await callback(csrf, request.controller.signal);
      if (!lifecycle.isCurrent(request)) return;
      if (!response.ok) throw new Error(await responseMessage(response));
      await refresh();
      if (lifecycle.isCurrent(request)) notice = label;
    } catch (reason) {
      if (lifecycle.isCurrent(request)) {
        error = reason instanceof Error ? reason.message : 'Không thể cập nhật Facebook.';
      }
    } finally {
      lifecycle.finish(request);
      if (lifecycle.isCurrent(request)) busy = '';
    }
  }

  async function saveSettings(): Promise<void> {
    await mutate('Đã lưu cài đặt Facebook.', (csrf, signal) => fetchWithSessionRefresh('/api/admin/facebook', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
      body: JSON.stringify({ sourceUrl, publishPolicy }),
      signal,
    }));
  }

  async function connect(): Promise<void> {
    const request = lifecycle.begin();
    if (!request) return;
    busy = 'Đang mở Facebook…';
    error = '';
    try {
      const csrf = await requireBrowserCsrf();
      if (!lifecycle.isCurrent(request)) return;
      const response = await fetchWithSessionRefresh('/api/integrations/facebook/connect/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
        body: JSON.stringify({ returnTo: '/admin/settings' }),
        signal: request.controller.signal,
      });
      if (!lifecycle.isCurrent(request)) return;
      if (!response.ok) throw new Error(await responseMessage(response));
      const payload = await response.json() as { url?: string };
      if (!lifecycle.isCurrent(request)) return;
      if (!payload.url) throw new Error('Facebook không trả đường dẫn kết nối.');
      window.location.assign(payload.url);
    } catch (reason) {
      if (lifecycle.isCurrent(request)) {
        error = reason instanceof Error ? reason.message : 'Không thể mở Facebook.';
        busy = '';
      }
    } finally {
      lifecycle.finish(request);
    }
  }

  async function sync(): Promise<void> {
    await mutate('Đã hoàn tất lượt đồng bộ Facebook.', (csrf, signal) => fetchWithSessionRefresh('/api/admin/facebook/sync', {
      method: 'POST', headers: { 'X-CSRF-Token': csrf }, signal,
    }));
  }

  async function disconnect(): Promise<void> {
    const generation = lifecycle.captureGeneration();
    if (!principalActive || busy || generation === null) return;
    if (!await confirmInApp('Ngắt kết nối và xóa dữ liệu Facebook chưa chỉnh sửa?')) return;
    if (!principalActive || busy || !lifecycle.isGenerationCurrent(generation)) return;
    await mutate('Đã ngắt kết nối Facebook.', (csrf, signal) => fetchWithSessionRefresh('/api/admin/facebook', {
      method: 'DELETE', headers: { 'X-CSRF-Token': csrf }, signal,
    }));
  }

  async function importAction(id: string, action: string): Promise<void> {
    const generation = lifecycle.captureGeneration();
    if (!principalActive || busy || generation === null) return;
    if (action === 'remove' && !await confirmInApp(
      'Xóa bản nhập này? Bài TuTam còn được đồng bộ từ Facebook và chưa chỉnh sửa cũng sẽ bị xóa. Bài đã chỉnh sửa được giữ lại và tách khỏi nguồn Facebook.',
    )) return;
    if (!principalActive || busy || !lifecycle.isGenerationCurrent(generation)) return;
    await mutate('Đã cập nhật bản nhập Facebook.', (csrf, signal) => fetchWithSessionRefresh(
      `/api/admin/facebook/imports/${encodeURIComponent(id)}/${action}`,
      { method: 'POST', headers: { 'X-CSRF-Token': csrf }, signal },
    ));
  }

  async function responseMessage(response: Response): Promise<string> {
    try {
      const payload = await response.json() as { error?: { message?: string } };
      return payload.error?.message || `Yêu cầu thất bại (${response.status}).`;
    } catch {
      return `Yêu cầu thất bại (${response.status}).`;
    }
  }

  function statusLabel(status: string): string {
    return ({
      active: 'Đang hoạt động',
      disabled: 'Đã tắt',
      permission_missing: 'Thiếu quyền đọc bài viết',
      permission_unavailable: 'Ứng dụng chưa được Meta cấp quyền',
      backoff: 'Đang chờ thử lại',
      reauthorization_required: 'Cần kết nối lại',
      configuration_error: 'Lỗi cấu hình',
    } as Record<string, string>)[status] || status;
  }

  function importStatusLabel(status: string): string {
    return ({
      review: 'Chờ duyệt',
      published: 'Đã xuất bản',
      detached: 'Đã tách nguồn',
      removed: 'Đã xóa',
      failed: 'Nhập thất bại',
    } as Record<string, string>)[status] || status;
  }

  onMount(() => {
    const sessionChanged = (event: Event) => {
      const session = (event as CustomEvent<PageSessionDTO>).detail;
      const destination = lifecycle.transition(session);
      if (!destination) return;
      globalThis.location.replace(destination);
    };
    window.addEventListener(SESSION_CHANGE_EVENT, sessionChanged);
    return () => {
      lifecycle.destroy();
      window.removeEventListener(SESSION_CHANGE_EVENT, sessionChanged);
    };
  });
</script>

{#if principalActive}
<section class="admin-inventory facebook-import-settings" aria-labelledby="facebook-import-title">
  <header>
    <div><span>Nguồn nội dung có cấp quyền</span><h2 id="facebook-import-title">Facebook</h2></div>
    <strong class="facebook-connection-status">{data.connection ? statusLabel(data.connection.status) : 'Chưa kết nối'}</strong>
  </header>

  <div class="facebook-settings-grid">
    <label>Đường dẫn trang Facebook
      <input disabled={readOnly} name="facebook-source-url" type="url" bind:value={sourceUrl} inputmode="url" autocomplete="url" aria-describedby="facebook-source-help" />
    </label>
    <label>Chính sách xuất bản
      <select disabled={readOnly} name="facebook-publish-policy" bind:value={publishPolicy}>
        <option value="review">Chờ duyệt</option>
        <option value="auto">Tự động xuất bản</option>
      </select>
    </label>
  </div>
  <p id="facebook-source-help" class="facebook-settings-help">Đường dẫn này chỉ để tham khảo. Nội dung được nhập từ tài khoản Facebook bạn kết nối.</p>
  <p class="facebook-settings-help">Graph {data.graphVersion} · {data.enabled ? 'Bộ nhập đang bật' : 'Bộ nhập đang tắt'} · {data.configured ? 'Cấu hình kết nối sẵn sàng' : 'Chưa hoàn tất cấu hình kết nối'}</p>

  <div class="admin-content-actions facebook-settings-actions">
    {#if !readOnly}<button type="button" disabled={Boolean(busy)} onclick={saveSettings}><Save aria-hidden="true" size={16} /> Lưu</button>{/if}
    {#if !readOnly}<button type="button" disabled={Boolean(busy) || !data.enabled || !data.configured} onclick={connect}><Link2 aria-hidden="true" size={16} /> {data.connection ? 'Kết nối lại' : 'Kết nối Facebook'}</button>{/if}
    {#if !readOnly}<button type="button" disabled={Boolean(busy) || data.connection?.status !== 'active'} onclick={sync}><RefreshCw aria-hidden="true" size={16} /> Đồng bộ ngay</button>{/if}
    {#if data.connection}{#if !readOnly}<button class="secondary danger" type="button" disabled={Boolean(busy)} onclick={disconnect}><Trash2 aria-hidden="true" size={16} /> Ngắt kết nối</button>{/if}{/if}
  </div>
  {#if busy}<p class="facebook-settings-feedback" role="status">Đang xử lý…</p>{/if}
  {#if notice}<p class="facebook-settings-feedback" role="status">{notice}</p>{/if}
  {#if error}<p class="facebook-settings-feedback error" role="alert">{error}</p>{/if}

  {#if data.connection}
    <dl class="facebook-connection-summary">
      <div><dt>Tài khoản</dt><dd>{data.connection.displayName || data.connection.facebookUserId || 'Đã xác thực'}</dd></div>
      <div><dt>Lần đồng bộ cuối</dt><dd>{formatVietnamDate(data.connection.lastSuccessAt) || 'Chưa đồng bộ'}</dd></div>
      <div><dt>Kết nối hết hạn</dt><dd>{formatVietnamDate(data.connection.tokenExpiresAt) || 'Facebook không cung cấp'}</dd></div>
      <div><dt>Lỗi gần nhất</dt><dd>{data.connection.lastErrorCode || 'Không có'}</dd></div>
    </dl>
  {/if}

  <div class="admin-inventory-table-wrap">
    <table>
      <caption>Sổ quản lý bài viết nhập từ Facebook</caption>
      <thead><tr><th scope="col">Bài Facebook</th><th scope="col">Bài TuTam</th><th scope="col">Trạng thái</th><th scope="col">Thao tác</th></tr></thead>
      <tbody>
        {#each data.imports as item}
          <tr>
            <td data-label="Bài Facebook">{#if item.permalinkUrl}<a href={item.permalinkUrl} target="_blank" rel="noopener noreferrer">{item.facebookPostId} <ExternalLink aria-hidden="true" size={14} /></a>{:else}<span>{item.facebookPostId}</span>{/if}</td>
            <td data-label="Bài TuTam"><span>{item.articleId || 'Đã tách/xóa'}</span></td>
            <td data-label="Trạng thái">
              <span class="admin-status-badge">{importStatusLabel(item.status)}</span>
              {#if item.lastErrorCode}<small class="facebook-import-error">{item.lastErrorCode}</small>{/if}
            </td>
            <td data-label="Thao tác">
              <div class="admin-content-actions">
                {#if item.articleId}
                  {#if !readOnly}<button type="button" disabled={Boolean(busy)} onclick={() => importAction(item.id, 'review')}>Chờ duyệt</button>{/if}
                  {#if !readOnly}<button type="button" disabled={Boolean(busy)} onclick={() => importAction(item.id, 'publish')}>Xuất bản</button>{/if}
                  {#if !readOnly}<button type="button" disabled={Boolean(busy)} onclick={() => importAction(item.id, 'detach')}>Tách nguồn</button>{/if}
                {/if}
                {#if item.status === 'failed'}{#if !readOnly}<button type="button" disabled={Boolean(busy)} onclick={() => importAction(item.id, 'retry')}>Thử lại</button>{/if}{/if}
                {#if !readOnly}<button class="secondary danger" type="button" disabled={Boolean(busy)} onclick={() => importAction(item.id, 'remove')}>Xóa</button>{/if}
              </div>
            </td>
          </tr>
        {:else}
          <tr><td class="facebook-import-empty" colspan="4">Chưa có bài viết Facebook nào được nhập.</td></tr>
        {/each}
      </tbody>
    </table>
  </div>
  {#if pageOffsets.length || data.importsPage.nextOffset !== null}
    <nav class="facebook-import-pagination" aria-label="Phân trang sổ nhập Facebook">
      <button type="button" disabled={Boolean(busy) || !pageOffsets.length} onclick={previousImportPage}>Trang trước</button>
      <span>Trang {Math.floor(data.importsPage.offset / 50) + 1}</span>
      <button
        type="button"
        disabled={Boolean(busy) || data.importsPage.nextOffset === null}
        onclick={() => data.importsPage.nextOffset !== null && void loadImportPage(data.importsPage.nextOffset, true)}
      >Trang sau</button>
    </nav>
  {/if}
</section>
{:else}
  <section class="admin-inventory facebook-import-settings" aria-live="polite">
    <p class="facebook-settings-feedback">Đang chuyển phiên quản trị…</p>
  </section>
{/if}

<style>
  .facebook-import-settings{--facebook-inset:22px}
  .facebook-import-settings>header{align-items:flex-start;flex-wrap:wrap}
  .facebook-import-settings>header>.facebook-connection-status{padding:5px 9px;border-radius:999px;background:var(--gold-light);color:var(--admin-accent-text);font-size:12px;line-height:1.5;overflow-wrap:anywhere}
  .facebook-settings-grid{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1fr);gap:16px;padding:18px var(--facebook-inset) 12px}
  label{display:grid;min-width:0;gap:6px;color:var(--text2);font-size:12px;font-weight:600}
  input,select{width:100%;min-width:0;min-height:44px;padding:8px 11px;border:1px solid var(--border);border-radius:8px;background:var(--card);color:var(--text);font:inherit;font-size:13px}
  input:focus-visible,select:focus-visible,button:focus-visible,a:focus-visible{outline:3px solid var(--gold);outline-offset:3px}
  .facebook-settings-help{margin:0;padding:0 var(--facebook-inset) 8px;color:var(--text2);font-size:12px;line-height:1.65;overflow-wrap:anywhere}
  .admin-content-actions{justify-content:flex-start;gap:8px}
  .admin-content-actions button{min-height:44px;gap:6px}
  .facebook-settings-actions{padding:8px var(--facebook-inset) 18px}
  .admin-content-actions button.danger{color:var(--danger-text)}
  .facebook-settings-feedback{margin:0;padding:12px var(--facebook-inset);background:var(--gold-light);color:var(--text2);font-size:12px;line-height:1.6;overflow-wrap:anywhere}
  .facebook-settings-feedback.error{background:color-mix(in srgb,var(--red) 8%,var(--card));color:var(--danger-text)}
  .facebook-connection-summary{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:0;padding:0 var(--facebook-inset) 18px;font-size:12px;line-height:1.6}
  .facebook-connection-summary div{min-width:0;padding:12px;border:1px solid var(--border);border-radius:8px}
  .facebook-connection-summary dt{color:var(--text2);font-weight:600}
  .facebook-connection-summary dd{margin:4px 0 0;color:var(--text);overflow-wrap:anywhere}
  td a{display:inline-flex;min-width:0;align-items:center;gap:4px;color:var(--admin-accent-text)}
  td a :global(svg){flex:0 0 auto}
  td a,td>span{overflow-wrap:anywhere}
  .facebook-import-error{display:block;margin-top:4px;color:var(--danger-text);overflow-wrap:anywhere}
  .facebook-import-pagination{display:flex;flex-wrap:wrap;align-items:center;justify-content:flex-end;gap:12px;padding:16px var(--facebook-inset)}
  .facebook-import-pagination button{min-height:44px;padding:0 12px;border:1px solid var(--border);border-radius:8px;background:var(--card);color:var(--text);cursor:pointer;font:600 12px var(--font-app)}
  .facebook-import-pagination button:hover:not(:disabled){border-color:var(--gold);background:var(--gold-light)}
  .facebook-import-pagination button:disabled{cursor:not-allowed;opacity:.5}
  .facebook-import-pagination span{color:var(--text2);font-size:12px;font-weight:600}
  @media(max-width:700px){.facebook-import-settings{--facebook-inset:14px}.facebook-import-settings>header{gap:10px;padding-inline:var(--facebook-inset)}.facebook-settings-grid,.facebook-connection-summary{grid-template-columns:1fr}.facebook-import-settings td.facebook-import-empty{display:block}.facebook-import-empty::before{display:none}.facebook-import-pagination{justify-content:center}}
  @media(max-width:480px){input,select{font-size:16px}}
</style>
