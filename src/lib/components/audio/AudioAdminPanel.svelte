<script lang="ts">
  import { confirmInApp } from '$lib/browser/app-dialog';
  import { getBrowserSessionSnapshot } from '$lib/stores/session.svelte';
  import { fetchWithSessionRefresh, getBrowserSession } from '$lib/browser/session-csrf';
  import AudioAdminEditor from './AudioAdminEditor.svelte';
  import type { TalkAlbum } from './AudioCatalog.svelte';
  import {
    buildArchiveAlbumPayload,
    parseArchiveIdentifier,
    type ArchiveMetadataResponse,
  } from './archive-org-album-import';

  interface ScanFolder {
    folderId?: string;
    folderName?: string;
    albumId?: string;
    status?: 'created' | 'updated' | 'skipped' | 'error' | string;
    trackCount?: number;
    message?: string;
    reason?: string;
    code?: string;
  }

  interface ScanPayload {
    folders?: ScanFolder[];
  }

  type ToolTab = 'drive' | 'archive';

  interface Props {
    role: 'ctv' | 'admin';
    albums: TalkAlbum[];
    showTools?: boolean;
    showManualAction?: boolean;
    editorAlbumId?: string | null;
    onEditorOpen?: (albumId: string) => void;
    onEditorClose?: () => void;
    onChanged?: () => void;
  }

  let {
    role,
    albums,
    showTools = true,
    showManualAction = true,
    editorAlbumId = null,
    onEditorOpen = () => {},
    onEditorClose = () => {},
    onChanged = () => {},
  }: Props = $props();
  let scanBusy = $state(false);
  let scanConfirmationPending = false;
  let scanMode = $state<'preview' | 'apply'>('preview');
  let scanStatus = $state('');
  let folders = $state<ScanFolder[]>([]);
  let canApply = $state(false);
  let archiveTopic = $state('');
  let archiveUrl = $state('');
  let archiveAuthor = $state('');
  let archiveBusy = $state(false);
  let archiveStatus = $state('');
  let archiveSucceeded = $state(false);
  let requestedToolTab = $state<ToolTab>('drive');
  const activeToolTab = $derived(role === 'admin' ? requestedToolTab : 'archive');

  const topics = [
    ['Nhân quả', '⚖️'], ['Vô thường', '🌊'], ['Sám hối', '🙏'], ['Thiền định', '🧘'],
    ['Luân hồi', '🔄'], ['Hành thiện', '🌸'], ['Pháp ngữ', '📿'], ['Câu chuyện', '📖'], ['Tổng hợp', '🎙️'],
  ] as const;

  const labelFor = (value: string) => ({
    created: 'Tạo mới', updated: 'Cập nhật', skipped: 'Bỏ qua', error: 'Lỗi',
  })[value] || 'Lỗi';

  const detailFor = (folder: ScanFolder) => {
    if (folder.message || folder.reason || folder.code) return String(folder.message || folder.reason || folder.code);
    const detail = [];
    if (Number.isFinite(Number(folder.trackCount))) detail.push(`${Number(folder.trackCount)} tệp âm thanh`);
    if (folder.albumId) detail.push(`Album ${folder.albumId}`);
    return detail.join(' · ') || 'Không có thông tin bổ sung.';
  };

  function activateToolTab(tab: ToolTab, focus = false): void {
    requestedToolTab = tab;
    if (focus) queueMicrotask(() => document.getElementById(`audio-tool-tab-${tab}`)?.focus());
  }

  function navigateToolTabs(event: KeyboardEvent): void {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const tabs: ToolTab[] = role === 'admin' ? ['drive', 'archive'] : ['archive'];
    const current = Math.max(0, tabs.indexOf(activeToolTab));
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
      : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    event.preventDefault();
    activateToolTab(tabs[next], true);
  }

  async function sessionToken(requireAdmin = false): Promise<string> {
    const session = await getBrowserSession();
    const sessionRole = session?.user?.role;
    const allowed = requireAdmin ? sessionRole === 'admin' : sessionRole === 'admin' || sessionRole === 'ctv';
    if (!allowed || !session.csrfToken) {
      throw new Error(requireAdmin ? 'Chỉ admin được quét Google Drive.' : 'Phiên quản trị không hợp lệ.');
    }
    return session.csrfToken;
  }

  async function requestScan(dryRun: boolean): Promise<ScanPayload> {
    const token = await sessionToken(true);
    const response = await fetchWithSessionRefresh('/api/admin/talks/drive-scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token },
      body: JSON.stringify({ dryRun }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error?.message || payload?.message || `HTTP ${response.status}`);
    return payload?.data ?? payload;
  }

  async function runScan(dryRun: boolean): Promise<void> {
    if (scanBusy || scanConfirmationPending || role !== 'admin') return;
    const session = getBrowserSessionSnapshot();
    const principal = session.authenticated ? session.user?.id : null;
    if (!dryRun) {
      scanConfirmationPending = true;
      try {
        if (!await confirmInApp('Quét Drive lại và áp dụng trạng thái mới nhất? Album mới sẽ được tạo ở chế độ công khai.')) return;
      } finally {
        scanConfirmationPending = false;
      }
    }
    const current = getBrowserSessionSnapshot();
    if (scanBusy || role !== 'admin' || !current.authenticated || current.user?.id !== principal || current.user?.role !== 'admin') return;
    scanBusy = true;
    scanMode = dryRun ? 'preview' : 'apply';
    scanStatus = dryRun ? 'Đang xem trước thay đổi, chưa ghi dữ liệu…' : 'Đang áp dụng thay đổi…';
    try {
      const payload = await requestScan(dryRun);
      folders = Array.isArray(payload.folders) ? payload.folders : [];
      const actionable = folders.filter((item) => item.status === 'created' || item.status === 'updated').length;
      const errors = folders.filter((item) => item.status === 'error').length;
      canApply = dryRun && actionable > 0;
      if (!folders.length) scanStatus = 'Không tìm thấy thư mục nào để đồng bộ.';
      else if (dryRun && actionable) scanStatus = `Có ${actionable} thay đổi chờ xác nhận${errors ? ` và ${errors} lỗi` : ''}.`;
      else if (dryRun) scanStatus = errors ? `Xem trước hoàn tất với ${errors} lỗi.` : 'Mọi album đã đồng bộ.';
      else {
        canApply = false;
        scanStatus = errors ? `Đã áp dụng các thư mục hợp lệ; ${errors} thư mục bị lỗi.` : 'Đã áp dụng. Album mới đang riêng tư để admin kiểm tra.';
        onChanged();
      }
    } catch (error) {
      scanStatus = `Không thể quét Drive: ${error instanceof Error ? error.message : 'Lỗi không xác định'}`;
    } finally {
      scanBusy = false;
    }
  }

  async function importArchiveAlbum(): Promise<void> {
    if (archiveBusy) return;
    archiveBusy = true;
    archiveSucceeded = false;
    archiveStatus = 'Đang đọc dữ liệu từ Archive.org…';
    try {
      const identifier = parseArchiveIdentifier(archiveUrl);
      const metadataResponse = await fetch(`https://archive.org/metadata/${encodeURIComponent(identifier)}`);
      if (!metadataResponse.ok) throw new Error(`Archive.org trả về HTTP ${metadataResponse.status}.`);
      const metadata = await metadataResponse.json() as ArchiveMetadataResponse;
      const payload = buildArchiveAlbumPayload(metadata, identifier, archiveTopic, archiveAuthor);
      const creator = metadata.metadata?.creator;
      const speaker = archiveAuthor.trim()
        || (Array.isArray(creator) ? creator.join(', ') : String(creator || metadata.metadata?.uploader || '').trim());
      archiveStatus = `Đã tìm thấy ${payload.tracks.length} bài. Đang tạo album…`;
      const token = await sessionToken();
      const response = await fetchWithSessionRefresh('/api/talks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token },
        body: JSON.stringify({ ...payload, dien_gia: speaker || null }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error?.message || result?.message || `HTTP ${response.status}`);
      archiveSucceeded = true;
      archiveStatus = `Đã tạo album “${payload.tieu_de}” với ${payload.tracks.length} bài.`;
      archiveUrl = '';
      archiveAuthor = '';
      onChanged();
    } catch (error) {
      archiveStatus = error instanceof Error ? error.message : 'Không thể tạo album từ Archive.org.';
    } finally {
      archiveBusy = false;
    }
  }
</script>

{#if showTools}
  <div class="pt-admin-tools" role="region" aria-label="Công cụ quản trị Pháp Thoại">
    <div class="pt-admin-tools-inner">
    {#if showManualAction}
      <div class="manual-album-actions">
        <button class="manual-album-button" type="button" onclick={() => onEditorOpen('new')}>
          + Tạo album thủ công
        </button>
      </div>
    {/if}
    <div class="tool-tabs" role="tablist" aria-label="Nguồn nhập dữ liệu" tabindex="-1" onkeydown={navigateToolTabs}>
      {#if role === 'admin'}
        <button id="audio-tool-tab-drive" class:active={activeToolTab === 'drive'} class="tool-tab" type="button" role="tab" aria-selected={activeToolTab === 'drive'} aria-controls="audio-tool-panel-drive" tabindex={activeToolTab === 'drive' ? 0 : -1} onclick={() => activateToolTab('drive')}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.2 4.5 3 13.6l2.6 4.5h5.2l2.6-4.5-5.2-9.1Zm7.6 0h-5.2l5.2 9.1H21l-5.2-9.1Zm-8.9 16h10.4l2.6-4.5H9.5l-2.6 4.5Z"/></svg>
          <span>Google Drive</span>
        </button>
      {/if}
      <button id="audio-tool-tab-archive" class:active={activeToolTab === 'archive'} class="tool-tab" type="button" role="tab" aria-selected={activeToolTab === 'archive'} aria-controls="audio-tool-panel-archive" tabindex={activeToolTab === 'archive' ? 0 : -1} onclick={() => activateToolTab('archive')}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h16M5 8h14M6 8v9m4-9v9m4-9v9m4-9v9M3 5l9-3 9 3v3H3V5Z"/></svg>
        <span>Archive.org</span>
      </button>
    </div>

    {#if role === 'admin' && activeToolTab === 'drive'}
      <div id="audio-tool-panel-drive" class="pt-admin-tool-section drive-panel" role="tabpanel" aria-labelledby="audio-tool-tab-drive" tabindex="0">
        <div class="tool-heading">
          <span class="tool-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8.2 4.5 3 13.6l2.6 4.5h5.2l2.6-4.5-5.2-9.1Zm7.6 0h-5.2l5.2 9.1H21l-5.2-9.1Zm-8.9 16h10.4l2.6-4.5H9.5l-2.6 4.5Z"/></svg></span>
          <div><span class="tool-kicker">Đồng bộ nguồn</span><h2 id="drive-scan-title">Google Drive</h2><p>Xem trước thay đổi trước khi áp dụng. Album mới luôn được đặt ở chế độ công khai.</p></div>
        </div>
        <div class="drive-actions">
          <button class="drive-button" type="button" disabled={scanBusy} onclick={() => runScan(true)}>
            {scanBusy && scanMode === 'preview' ? 'Đang quét…' : 'Xem trước thay đổi'}
          </button>
          {#if canApply}
            <button class="drive-button secondary" type="button" disabled={scanBusy} onclick={() => runScan(false)}>
              {scanBusy && scanMode === 'apply' ? 'Đang áp dụng…' : 'Áp dụng thay đổi'}
            </button>
          {/if}
        </div>
        {#if scanStatus}<p class="tool-status" role="status" aria-live="polite">{scanStatus}</p>{/if}
        {#if folders.length}
          <ul class="scan-results" aria-label="Kết quả quét Google Drive">
            {#each folders as folder, index}
              <li data-status={folder.status || 'error'}>
                <span class="badge">{labelFor(folder.status || 'error')}</span>
                <strong>{folder.folderName || `Thư mục ${index + 1}`}</strong>
                <small>{detailFor(folder)}</small>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    {/if}

    {#if activeToolTab === 'archive'}
      <div id="audio-tool-panel-archive" class="pt-admin-tool-section archive-section" role="tabpanel" aria-labelledby="audio-tool-tab-archive" tabindex="0">
        <div class="tool-heading">
          <span class="tool-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 20h16M5 8h14M6 8v9m4-9v9m4-9v9m4-9v9M3 5l9-3 9 3v3H3V5Z"/></svg></span>
          <div><span class="tool-kicker">Nhập album</span><h2 id="archive-import-title">Archive.org</h2><p>Đọc metadata và danh sách track từ một liên kết Archive.org.</p></div>
        </div>
        <form class="archive-form" onsubmit={(event) => { event.preventDefault(); void importArchiveAlbum(); }}>
          <label><span>Chủ đề</span><select bind:value={archiveTopic} disabled={archiveBusy}>
            <option value="">— Chọn Chủ Đề —</option>
            {#each topics as [name, icon]}<option value={name}>{icon} {name}</option>{/each}
          </select></label>
          <label class="wide"><span>Liên kết Archive.org</span><input bind:value={archiveUrl} disabled={archiveBusy} type="url" placeholder="archive.org/details/..." required /></label>
          <label class="wide author"><span>Tác giả / pháp sư</span><input bind:value={archiveAuthor} disabled={archiveBusy} type="text" placeholder="Không bắt buộc" /></label>
          <button class="archive-button" type="submit" disabled={archiveBusy}>
            {archiveBusy ? 'Đang tạo…' : 'Tạo album'}
          </button>
        </form>
        {#if archiveStatus}<p class:success={archiveSucceeded} class="tool-status" role="status" aria-live="polite">{archiveStatus}</p>{/if}
      </div>
    {/if}
    </div>
  </div>
{/if}

{#if editorAlbumId}
  <AudioAdminEditor role={role} {albums} selectedAlbumId={editorAlbumId} onClose={onEditorClose} onChanged={onChanged} />
{/if}

<style>
  .pt-admin-tools{padding:0;border-bottom:1px solid var(--border2);background:var(--card)}
  .pt-admin-tools-inner{display:block;width:100%;margin:0 auto}
  .manual-album-actions{display:flex;justify-content:flex-end;padding:12px 16px;border-bottom:1px solid var(--border2);background:var(--bg2)}
  .manual-album-button{padding:8px 14px;border:0;border-radius:7px;background:var(--brown);color:#fff;font-size:13px;font-weight:700}
  .manual-album-button:hover{background:var(--gold)}
  .tool-tabs{display:flex;overflow-x:auto;gap:4px;padding:8px 14px 0;border-bottom:1px solid var(--border2);background:var(--bg2);scrollbar-width:none}
  .tool-tabs::-webkit-scrollbar{display:none}
  .tool-tab{display:inline-flex;min-height:44px;align-items:center;gap:8px;padding:0 14px;border:0;border-bottom:2px solid transparent;background:transparent;color:var(--text2);font-size:12px;font-weight:650;white-space:nowrap}
  .tool-tab svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-linecap:round;stroke-linejoin:round;stroke-width:1.7}
  .tool-tab:hover{color:var(--text)}.tool-tab.active{border-bottom-color:var(--gold);color:var(--admin-accent-text,var(--brown))}.tool-tab:focus-visible{outline:2px solid var(--gold);outline-offset:-3px}
  .pt-admin-tool-section{min-width:0;padding:18px;border:0;background:var(--card)}
  .pt-admin-tool-section:focus{outline:none}.pt-admin-tool-section:focus-visible{outline:2px solid var(--gold);outline-offset:-4px}
  .tool-heading{display:flex;align-items:flex-start;gap:11px}
  .tool-icon{display:grid;width:34px;height:34px;flex:0 0 auto;place-items:center;border:1px solid var(--border2);border-radius:8px;background:var(--bg2);color:var(--admin-accent-text,var(--brown))}
  .tool-icon svg{width:17px;height:17px;fill:none;stroke:currentColor;stroke-linecap:round;stroke-linejoin:round;stroke-width:1.7}
  .tool-heading>div{min-width:0}.tool-kicker{display:block;margin-bottom:2px;color:var(--muted);font-size:9px;font-weight:700;letter-spacing:.65px;text-transform:uppercase}
  h2{margin:0;color:var(--text);font-family:inherit;font-size:14px;font-weight:700}
  p{margin:3px 0 0;color:var(--muted);font-size:11px;line-height:1.5}
  .drive-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
  button{font-family:inherit;cursor:pointer;transition:background .15s,border-color .15s,opacity .15s}
  .drive-button{min-height:38px;padding:8px 13px;border:0;border-radius:8px;background:var(--admin-primary-bg,var(--brown));color:var(--admin-primary-text,#fff);font-size:11px;font-weight:700}
  .drive-button.secondary{border:1px solid var(--border);background:var(--card);color:var(--text)}
  button:disabled{cursor:wait;opacity:.6}
  .tool-status{margin-top:10px;padding:8px 10px;border-radius:7px;background:var(--bg2);font-weight:600}.tool-status.success{color:var(--green-ok)}
  .scan-results{display:grid;gap:7px;margin:10px 0 0;padding:0;list-style:none}
  .scan-results li{display:grid;grid-template-columns:auto minmax(0,1fr);gap:4px 8px;padding:9px 10px;border:1px solid var(--border2);border-radius:7px;background:var(--bg2);font-size:12px}
  .badge{grid-row:1/3;align-self:start;padding:2px 7px;border-radius:999px;background:var(--muted);color:#fff;font-size:10px;font-weight:700;text-transform:uppercase}
  li[data-status="created"] .badge{background:#16a34a}li[data-status="updated"] .badge{background:#2563eb}li[data-status="error"] .badge{background:#dc2626}.scan-results small{color:var(--muted)}
  .archive-form{display:grid;grid-template-columns:minmax(140px,.65fr) minmax(240px,1.45fr) minmax(180px,1fr) auto;align-items:end;gap:9px;margin-top:14px}
  label{display:grid;min-width:0;gap:5px}label>span{color:var(--text2);font-size:9px;font-weight:700;letter-spacing:.4px;text-transform:uppercase}
  input,select{width:100%;min-height:38px;padding:8px 10px;border:1px solid var(--border);border-radius:7px;outline:none;background:var(--bg);color:var(--text);font-family:inherit;font-size:12px;line-height:normal}
  input:focus,select:focus{border-color:var(--gold);box-shadow:0 0 0 3px color-mix(in srgb,var(--gold) 15%,transparent)}select{cursor:pointer}
  .archive-button{min-height:38px;padding:8px 14px;border:0;border-radius:8px;background:var(--admin-primary-bg,var(--brown));color:var(--admin-primary-text,#fff);font-size:11px;font-weight:700;white-space:nowrap}
  .archive-button:hover:not(:disabled),.drive-button:hover:not(:disabled){opacity:.86}
  @media(max-width:900px){.archive-form{grid-template-columns:minmax(130px,.7fr) minmax(220px,1.3fr) auto}.archive-form>.author{grid-column:1/3}.archive-form>.archive-button{grid-column:3;grid-row:1}}
  @media(max-width:700px){.tool-tabs{padding-inline:10px}.tool-tab{flex:1;justify-content:center}.archive-form{grid-template-columns:1fr}.archive-form>.author,.archive-form>.archive-button{grid-column:auto;grid-row:auto}.archive-button{width:100%}.pt-admin-tool-section{padding:16px 14px}input,select{min-height:44px;font-size:16px}.drive-button,.archive-button{min-height:44px}}
</style>
