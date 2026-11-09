<script lang="ts">
  import { acquireScrollLock } from '$lib/browser/scroll-lock';
  let releaseBodyScroll: (() => void) | null = null;
  import {
    Check,
    CircleCheck,
    CircleX,
    ClipboardList,
    ClipboardPaste,
    Copy,
    DatabaseZap,
    Download,
    FileText,
    FileUp,
    Info,
    X,
  } from '@lucide/svelte';
  import { onMount } from 'svelte';
  import { fetchWithSessionRefresh, requireBrowserCsrf } from '$lib/browser/session-csrf';
  import { normalizeBookImportPayload, SAMPLE_BOOK_IMPORT, type BookImportPayload } from './book-form-helpers';
  import './import-json-modal.css';

  interface Props {
    onClose: () => void;
    onImported?: () => void | Promise<void>;
  }

  interface ImportItem {
    key: string;
    source: string;
    payload?: BookImportPayload;
    error?: string;
  }

  let { onClose, onImported = () => {} }: Props = $props();
  let dialog = $state<HTMLElement | null>(null);
  let fileInput = $state<HTMLInputElement | null>(null);
  let tab = $state<'upload' | 'paste' | 'sample'>('upload');
  let files = $state<File[]>([]);
  let pastedJson = $state('');
  let items = $state<ImportItem[]>([]);
  let busy = $state(false);
  let dragOver = $state(false);
  let notice = $state('');
  let copied = $state(false);
  const sampleJson = JSON.stringify(SAMPLE_BOOK_IMPORT, null, 2);
  const validItems = $derived(items.filter((item) => item.payload));
  const ready = $derived(validItems.length > 0 && !busy);

  function safeClose(): void {
    if (!busy) onClose();
  }

  function formatSize(size: number): string {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / 1024 / 1024).toFixed(1)} MB`;
  }

  function parseValues(values: unknown[], source: string): ImportItem[] {
    return values.map((value, index) => {
      try {
        const payload = normalizeBookImportPayload(value);
        return { key: `${source}-${index}`, source, payload };
      } catch (cause) {
        return { key: `${source}-${index}`, source, error: cause instanceof Error ? cause.message : 'JSON không hợp lệ.' };
      }
    });
  }

  async function parseFiles(nextFiles: File[]): Promise<void> {
    const accepted = nextFiles.filter((file) => file.type === 'application/json' || file.name.toLowerCase().endsWith('.json'));
    files = accepted;
    notice = accepted.length === nextFiles.length ? '' : 'Một số tệp không phải JSON đã được bỏ qua.';
    const parsed = await Promise.all(accepted.map(async (file) => {
      try {
        const raw = JSON.parse(await file.text());
        return parseValues(Array.isArray(raw) ? raw : [raw], file.name);
      } catch (cause) {
        return [{ key: file.name, source: file.name, error: cause instanceof Error ? cause.message : 'Không đọc được file JSON.' }];
      }
    }));
    items = parsed.flat();
  }

  function selectFiles(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    void parseFiles([...(input.files ?? [])]);
    input.value = '';
  }

  function dropFiles(event: DragEvent): void {
    event.preventDefault();
    dragOver = false;
    void parseFiles([...(event.dataTransfer?.files ?? [])]);
  }

  function parsePasted(value: string): void {
    pastedJson = value;
    notice = '';
    if (!value.trim()) {
      items = [];
      return;
    }
    try {
      const raw = JSON.parse(value);
      items = parseValues(Array.isArray(raw) ? raw : [raw], 'Nội dung đã dán');
    } catch (cause) {
      items = [{ key: 'paste-error', source: 'Nội dung đã dán', error: cause instanceof Error ? cause.message : 'JSON không hợp lệ.' }];
    }
  }

  async function copySample(): Promise<void> {
    try {
      await navigator.clipboard.writeText(sampleJson);
      copied = true;
      setTimeout(() => copied = false, 1800);
    } catch {
      notice = 'Không thể sao chép tự động. Hãy bôi đen nội dung mẫu để sao chép.';
    }
  }

  async function runImport(): Promise<void> {
    if (!ready) return;
    busy = true;
    notice = '';
    let imported = 0;
    try {
      const csrf = await requireBrowserCsrf();
      for (const item of validItems) {
        const response = await fetchWithSessionRefresh('/api/admin/books/import', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-csrf-token': csrf },
          body: JSON.stringify(item.payload)
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(`${item.source}: ${data?.error?.message || 'Import thất bại.'}`);
        if (!data.complete || data.persistedChapters !== data.expectedChapters) throw new Error(`${item.source}: máy chủ chưa xác nhận đủ tập.`);
        imported += 1;
      }
      notice = `Đã import ${imported} sách vào D1.`;
      await onImported();
      setTimeout(() => onClose(), 650);
    } catch (cause) {
      notice = cause instanceof Error ? cause.message : 'Import JSON thất bại.';
    } finally {
      busy = false;
    }
  }

  onMount(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    releaseBodyScroll ??= acquireScrollLock();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        safeClose();
        return;
      }
      if (event.key !== 'Tab' || !dialog) return;
      const focusable = [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter((element) => element.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', keydown);
    queueMicrotask(() => dialog?.querySelector<HTMLElement>('.import-json-tab')?.focus({ preventScroll: true }));
    return () => {
      releaseBodyScroll?.(); releaseBodyScroll = null;
      window.removeEventListener('keydown', keydown);
      previousFocus?.focus({ preventScroll: true });
    };
  });
</script>

<div class="import-json-overlay" role="presentation" onclick={(event) => { if (event.target === event.currentTarget) safeClose(); }}>
  <div class="import-json-modal" data-dialog-glass role="dialog" aria-modal="true" aria-labelledby="import-json-title" bind:this={dialog}>
    <header class="import-json-header">
      <div><h2 id="import-json-title"><DatabaseZap aria-hidden="true" size={20} strokeWidth={1.9} /> Import sách từ file JSON</h2><p>Dành cho CTV và Admin · Dữ liệu sẽ được lưu vào hệ thống</p></div>
      <button type="button" aria-label="Đóng" title="Đóng" onclick={safeClose}><X aria-hidden="true" size={20} strokeWidth={2} /></button>
    </header>

    <div class="import-json-tabs" aria-label="Cách nhập JSON" role="tablist">
      <button class:active={tab === 'upload'} class="import-json-tab" type="button" role="tab" aria-selected={tab === 'upload'} onclick={() => tab = 'upload'}><FileUp aria-hidden="true" /><span>Tải file lên</span></button>
      <button class:active={tab === 'paste'} class="import-json-tab" type="button" role="tab" aria-selected={tab === 'paste'} onclick={() => tab = 'paste'}><ClipboardPaste aria-hidden="true" /><span>Dán JSON</span></button>
      <button class:active={tab === 'sample'} class="import-json-tab" type="button" role="tab" aria-selected={tab === 'sample'} onclick={() => tab = 'sample'}><Info aria-hidden="true" /><span>Xem mẫu JSON</span></button>
    </div>

    <div class="import-json-body">
      {#if tab === 'upload'}
        <input class="visually-hidden" bind:this={fileInput} type="file" accept=".json,application/json" aria-label="Chọn file JSON để import" multiple onchange={selectFiles} />
        <button class:drag-over={dragOver} class:has-files={files.length > 0} class="import-json-drop-zone" type="button" ondragover={(event) => { event.preventDefault(); dragOver = true; }} ondragleave={() => dragOver = false} ondrop={dropFiles} onclick={() => fileInput?.click()}>
          <FileUp aria-hidden="true" />
          <strong>{files.length ? 'Click hoặc kéo thả để thay đổi file' : 'Click hoặc kéo thả file JSON vào đây'}</strong>
          <span>{files.length ? `${files.length} file đã chọn` : 'Chấp nhận nhiều file .json cùng lúc'}</span>
        </button>
        {#if files.length}
          <div class="import-json-file-list">{#each files as file}<div><span><FileText aria-hidden="true" size={16} strokeWidth={1.8} /></span><strong title={file.name}>{file.name}</strong><small>{formatSize(file.size)}</small></div>{/each}</div>
        {/if}
      {:else if tab === 'paste'}
        <textarea class="import-json-textarea" value={pastedJson} spellcheck="false" aria-label="Nội dung JSON" placeholder="Dán nội dung JSON vào đây..." oninput={(event) => parsePasted(event.currentTarget.value)}></textarea>
      {:else}
        <div class="import-json-sample-note">Sao chép mẫu bên dưới, điền dữ liệu thật rồi dán vào tab <strong>Dán JSON</strong> hoặc lưu thành file <code>.json</code> để tải lên.</div>
        <div class="import-json-sample"><pre>{sampleJson}</pre><button type="button" onclick={copySample}>{#if copied}<Check aria-hidden="true" size={15} strokeWidth={2} /> Đã sao chép{:else}<Copy aria-hidden="true" size={15} strokeWidth={2} /> Sao chép{/if}</button></div>
      {/if}

      {#if items.length && tab !== 'sample'}
        <section class="import-json-preview" aria-label="Xem trước dữ liệu import">
          <header><strong><ClipboardList aria-hidden="true" size={17} strokeWidth={1.9} /> Xem trước</strong><span>{validItems.length} hợp lệ</span></header>
          {#each items as item, index (item.key)}
            <div class:error={Boolean(item.error)} class="import-json-preview-item"><i>{#if item.error}<CircleX aria-hidden="true" size={16} strokeWidth={2} />{:else}<CircleCheck aria-hidden="true" size={16} strokeWidth={2} />{/if}</i><div><strong>{item.payload ? String(item.payload.book.tieu_de) : '(JSON không hợp lệ)'}</strong><small>{item.error || `${item.payload?.chapters.length ?? 0} tập · ${item.source}`}</small></div><em>#{index + 1}</em></div>
          {/each}
        </section>
      {/if}
      {#if notice}<p class:success={notice.startsWith('Đã import')} class="import-json-notice" role="status">{notice}</p>{/if}
    </div>

    <footer class="import-json-footer dialog-actions-balanced">
      <button class="secondary" type="button" disabled={busy} onclick={safeClose}>Huỷ</button>
      <button class="primary" type="button" disabled={!ready} onclick={() => void runImport()}><Download aria-hidden="true" /><span>{busy ? 'Đang import…' : 'Import vào D1'}</span></button>
    </footer>
  </div>
</div>

<style>
  .import-json-header h2,
  .import-json-sample button,
  .import-json-preview > header strong {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
</style>
