<script module lang="ts">
  export interface Chapter {
    id?: string | number;
    tieu_de: string;
    tom_tat: string;
    noi_dung?: string;
    so_thu_tu: number;
    contentLoaded?: boolean;
  }

  export interface ChapterLoadTicket {
    bookId: string;
    generation: number;
    signal: AbortSignal;
  }

  export interface ChapterImageUploadTicket {
    bookId: string;
    chapterKey: string;
    generation: number;
  }

  export function serializeChapterDraft(chapters: Chapter[]) {
    return JSON.stringify(chapters.map((c) => ({
      id: c.id,
      so_thu_tu: c.so_thu_tu,
      tieu_de: c.tieu_de,
      tom_tat: c.tom_tat,
      noi_dung: c.contentLoaded ? c.noi_dung : (c.noi_dung ? c.noi_dung : undefined),
    })));
  }

  export function isChapterDraftDirty(savedSnapshot: string | null, chapters: Chapter[]) {
    return savedSnapshot === null ? chapters.length > 0 : serializeChapterDraft(chapters) !== savedSnapshot;
  }

  export function createChapterLoadCoordinator() {
    let generation = 0;
    let controller: AbortController | null = null;

    return {
      begin(bookId: string): ChapterLoadTicket {
        controller?.abort();
        controller = new AbortController();
        generation += 1;
        return { bookId, generation, signal: controller.signal };
      },
      isCurrent(ticket: ChapterLoadTicket, currentBookId: string) {
        return ticket.generation === generation && ticket.bookId === currentBookId && !ticket.signal.aborted;
      },
      dispose() {
        generation += 1;
        controller?.abort();
        controller = null;
      }
    };
  }

  export function createChapterImageUploadCoordinator() {
    let generation = 0;

    return {
      begin(bookId: string, chapterKey: string): ChapterImageUploadTicket {
        generation += 1;
        return { bookId, chapterKey, generation };
      },
      invalidate() {
        generation += 1;
      },
      isCurrent(ticket: ChapterImageUploadTicket, currentBookId: string, currentChapterKey: string) {
        return ticket.generation === generation
          && ticket.bookId === currentBookId
          && ticket.chapterKey === currentChapterKey;
      }
    };
  }
</script>

<script lang="ts">
  import { createBrowserId } from '$lib/browser/random-id';
  import { confirmInApp, promptInApp } from '$lib/browser/app-dialog';
  import { ChevronDown, ChevronUp, Pencil, Plus, Search, Trash2, X } from '@lucide/svelte';
  import { onDestroy } from 'svelte';
  import { encodeMediaFileNameHeader } from '$lib/browser/media-upload';
  import { fetchWithSessionRefresh, requireBrowserCsrf } from '$lib/browser/session-csrf';
  import { renderReaderContent } from '$lib/components/reader/content-renderer';
  import ChapterComposer from './ChapterComposer.svelte';

  interface Props {
    bookId: string;
    variant?: 'manager' | 'inline';
    onSaved?: (count: number) => void;
    onDirtyChange?: (dirty: boolean) => void;
    onUploadBusy?: (busy: boolean) => void;
    onSaveBusy?: (busy: boolean) => void;
    onSaveReady?: (save: (() => Promise<boolean>) | null) => void;
  }

  let {
    bookId,
    variant = 'manager',
    onSaved = () => {},
    onDirtyChange = () => {},
    onUploadBusy = () => {},
    onSaveBusy = () => {},
    onSaveReady = () => {}
  }: Props = $props();

  let chapters = $state<Chapter[]>([]);
  let selected = $state(0);
  let loading = $state(true);
  let busy = $state(false);
  let error = $state('');
  let notice = $state('');
  let editor = $state<HTMLElement | null>(null);
  let preview = $state(false);
  let imageBusy = $state(false);
  let editingOpen = $state(false);
  let savedSnapshot = $state<string | null>(null);
  let loadingContentIndex = $state<number | null>(null);
  let searchQuery = $state('');
  let page = $state(0);
  const PAGE_SIZE = 50;
  let disposed = false;

  const loadCoordinator = createChapterLoadCoordinator();
  const imageUploadCoordinator = createChapterImageUploadCoordinator();
  let currentChapter = $derived(chapters[selected]);
  const dirty = $derived(isChapterDraftDirty(savedSnapshot, chapters));

  const displayChapters = $derived.by(() => {
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      return chapters
        .map((chap, originalIndex) => ({ chapter: chap, index: originalIndex }))
        .filter(({ chapter, index }) => {
          return chapter.tieu_de.toLowerCase().includes(q) ||
            (chapter.tom_tat && chapter.tom_tat.toLowerCase().includes(q)) ||
            String(index + 1) === q;
        });
    }
    if (chapters.length > PAGE_SIZE) {
      const start = page * PAGE_SIZE;
      return chapters
        .slice(start, start + PAGE_SIZE)
        .map((chap, idx) => ({ chapter: chap, index: start + idx }));
    }
    return chapters.map((chap, idx) => ({ chapter: chap, index: idx }));
  });
  const totalPages = $derived(Math.ceil(chapters.length / PAGE_SIZE));

  async function load(targetBookId = bookId) {
    imageUploadCoordinator.invalidate();
    const ticket = loadCoordinator.begin(targetBookId);
    loading = true;
    error = '';
    try {
      const response = await fetchWithSessionRefresh(
        `/api/articles/${encodeURIComponent(targetBookId)}/chapters?order=so_thu_tu.asc&limit=5000&select=id,bai_viet_id,so_thu_tu,tieu_de,tom_tat`,
        { signal: ticket.signal }
      );
      if (!response.ok && response.status !== 404) throw new Error('Không thể tải danh sách tập.');
      const raw = response.ok ? await response.json().catch(() => []) : [];
      const loaded = (Array.isArray(raw) ? raw : []).map((chapter: Chapter, index: number) => ({
        ...chapter,
        noi_dung: chapter.noi_dung || '',
        so_thu_tu: index,
        contentLoaded: Boolean(chapter.noi_dung),
      }));
      if (!loadCoordinator.isCurrent(ticket, bookId)) return;
      chapters = loaded;
      selected = Math.min(selected, Math.max(0, chapters.length - 1));
      savedSnapshot = serializeChapterDraft(loaded);
      if (variant === 'manager' && loaded.length > 0) {
        void ensureChapterContent(selected);
      }
    } catch (cause) {
      if (cause instanceof Error && cause.name === 'AbortError') return;
      if (!loadCoordinator.isCurrent(ticket, bookId)) return;
      error = cause instanceof Error ? cause.message : 'Không thể tải danh sách tập.';
    } finally {
      if (loadCoordinator.isCurrent(ticket, bookId)) loading = false;
    }
  }

  async function ensureChapterContent(index: number): Promise<void> {
    const chap = chapters[index];
    if (!chap || chap.contentLoaded) return;
    loadingContentIndex = index;
    try {
      const chapterId = chap.id;
      const filter = chapterId !== undefined && chapterId !== null && chapterId !== ''
        ? `id=eq.${encodeURIComponent(String(chapterId))}`
        : `so_thu_tu=eq.${chap.so_thu_tu}`;
      const response = await fetchWithSessionRefresh(
        `/api/articles/${encodeURIComponent(bookId)}/chapters?${filter}&select=id,noi_dung&limit=1`
      );
      if (response.ok) {
        const data = await response.json();
        const row = Array.isArray(data) ? data[0] : data;
        if (row && typeof row.noi_dung === 'string') {
          chapters = chapters.map((c, i) => i === index ? { ...c, noi_dung: row.noi_dung, contentLoaded: true } : c);
          return;
        }
      }
      chapters = chapters.map((c, i) => i === index ? { ...c, contentLoaded: true } : c);
    } catch {
      // keep existing
    } finally {
      loadingContentIndex = null;
    }
  }

  function chapterKey(chapter: Chapter | undefined, index: number) {
    return chapter?.id === undefined ? `draft:${index}` : `id:${chapter.id}`;
  }

  function select(index: number) {
    if (imageBusy) return;
    imageUploadCoordinator.invalidate();
    selected = index;
    if (variant === 'manager') {
      void ensureChapterContent(index);
    }
  }

  async function openEditor(index: number) {
    select(index);
    preview = false;
    await ensureChapterContent(index);
    editingOpen = true;
  }

  function closeEditor() {
    if (imageBusy || busy) return;
    editingOpen = false;
    editor = null;
  }

  function setComposerImageBusy(value: boolean) {
    imageBusy = value;
  }

  function add() {
    if (imageBusy) return;
    imageUploadCoordinator.invalidate();
    chapters = [...chapters, {
      tieu_de: `Phẩm ${chapters.length + 1}`,
      tom_tat: '',
      noi_dung: '',
      so_thu_tu: chapters.length,
      contentLoaded: true,
    }];
    selected = chapters.length - 1;
    page = Math.floor((chapters.length - 1) / PAGE_SIZE);
  }

  async function remove(index: number): Promise<void> {
    const target = chapters[index];
    const targetBookId = bookId;
    if (imageBusy || !target || !await confirmInApp(`Xóa “${target.tieu_de}”?`)) return;
    if (disposed || imageBusy || targetBookId !== bookId || chapters[index] !== target) return;
    imageUploadCoordinator.invalidate();
    chapters = chapters
      .filter((_, itemIndex) => itemIndex !== index)
      .map((chapter, itemIndex) => ({ ...chapter, so_thu_tu: itemIndex }));
    selected = Math.min(selected, Math.max(0, chapters.length - 1));
    if (page >= totalPages && page > 0) page = totalPages - 1;
  }

  function move(index: number, delta: number) {
    if (imageBusy) return;
    const target = index + delta;
    if (target < 0 || target >= chapters.length) return;
    imageUploadCoordinator.invalidate();
    const next = [...chapters];
    [next[index], next[target]] = [next[target], next[index]];
    chapters = next.map((chapter, itemIndex) => ({ ...chapter, so_thu_tu: itemIndex }));
    selected = target;
  }

  function update(field: 'tieu_de' | 'tom_tat' | 'noi_dung', value: string) {
    chapters = chapters.map((chapter, index) => index === selected ? { ...chapter, [field]: value, contentLoaded: field === 'noi_dung' ? true : chapter.contentLoaded } : chapter);
  }

  function updateAt(index: number, field: 'tieu_de' | 'tom_tat', value: string) {
    chapters = chapters.map((chapter, itemIndex) => itemIndex === index ? { ...chapter, [field]: value } : chapter);
  }

  function format(command: string, value?: string) {
    editor?.focus();
    document.execCommand(command, false, value);
    if (editor) update('noi_dung', editor.innerHTML);
  }

  async function insertLink(): Promise<void> {
    const target = editor;
    const targetChapter = chapters[selected];
    const selection = window.getSelection();
    const range = selection?.rangeCount && target?.contains(selection.getRangeAt(0).commonAncestorContainer)
      ? selection.getRangeAt(0).cloneRange() : null;
    const value = await promptInApp('Nhập liên kết https://...');
    if (!value || disposed || imageBusy || !target?.isConnected || editor !== target || chapters[selected] !== targetChapter) return;
    target.focus();
    if (range) {
      const currentSelection = window.getSelection();
      currentSelection?.removeAllRanges();
      currentSelection?.addRange(range);
    }
    format('createLink', value);
  }

  async function uploadInlineImage(file: File) {
    const csrf = await requireBrowserCsrf();
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()));
    const encoded = btoa(String.fromCharCode(...digest)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
    const response = await fetchWithSessionRefresh('/api/media', {
      method: 'POST',
      headers: {
        'content-type': file.type,
        'x-content-sha256': encoded,
        'x-csrf-token': csrf,
        'x-file-name': encodeMediaFileNameHeader(file.name),
        'x-media-prefix': 'content',
        'idempotency-key': createBrowserId()
      },
      body: file
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error?.message || `Không thể tải ${file.name}.`);
    return String(data.url || data.objectKey);
  }

  async function insertImages(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const files = [...(input.files || [])].filter((file) => file.type.startsWith('image/'));
    const targetEditor = editor;
    const targetChapterKey = chapterKey(currentChapter, selected);
    if (!files.length || imageBusy) return;
    if (!currentChapter || !targetEditor) {
      error = 'Chuyển về chế độ soạn thảo trước khi chèn ảnh.';
      input.value = '';
      return;
    }
    const ticket = imageUploadCoordinator.begin(bookId, targetChapterKey);
    imageBusy = true;
    error = '';
    try {
      for (const file of files) {
        const url = await uploadInlineImage(file);
        if (!imageUploadCoordinator.isCurrent(ticket, bookId, chapterKey(currentChapter, selected)) || editor !== targetEditor || disposed) return;
        targetEditor.focus();
        document.execCommand('insertImage', false, url);
        update('noi_dung', targetEditor.innerHTML);
      }
      if (!imageUploadCoordinator.isCurrent(ticket, bookId, chapterKey(currentChapter, selected)) || editor !== targetEditor || disposed) return;
      notice = `Đã chèn ${files.length} ảnh vào nội dung.`;
    } catch (cause) {
      if (imageUploadCoordinator.isCurrent(ticket, bookId, chapterKey(currentChapter, selected)) && !disposed) {
        error = cause instanceof Error ? cause.message : 'Không thể tải ảnh nội dung.';
      }
    } finally {
      imageBusy = false;
      input.value = '';
    }
  }

  async function save(): Promise<boolean> {
    const targetBookId = bookId;
    const submittedChapters = chapters.map((chapter) => ({
      id: chapter.id,
      so_thu_tu: chapter.so_thu_tu,
      tieu_de: chapter.tieu_de,
      tom_tat: chapter.tom_tat,
      ...(chapter.contentLoaded || chapter.noi_dung ? { noi_dung: chapter.noi_dung } : {})
    }));
    busy = true;
    error = '';
    notice = '';
    try {
      const csrf = await requireBrowserCsrf();
      const response = await fetchWithSessionRefresh(`/api/admin/books/${encodeURIComponent(targetBookId)}/chapters`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', 'x-csrf-token': csrf },
        body: JSON.stringify({ chapters: submittedChapters })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error?.message || 'Không thể lưu mục lục.');
      if (disposed || targetBookId !== bookId) return false;
      savedSnapshot = serializeChapterDraft(chapters);
      notice = `Đã lưu ${data.chapters} tập theo đúng thứ tự.`;
      onSaved(Number(data.chapters));
      return true;
    } catch (cause) {
      if (!disposed && targetBookId === bookId) {
        error = cause instanceof Error ? cause.message : 'Không thể lưu mục lục.';
      }
      return false;
    } finally {
      busy = false;
    }
  }

  async function saveAndClose() {
    closeEditor();
    void save();
  }

  $effect(() => { const targetBookId = bookId; void load(targetBookId); });
  $effect(() => { onDirtyChange(dirty); });
  $effect(() => { onUploadBusy(imageBusy); });
  $effect(() => { onSaveBusy(busy); });
  $effect(() => { onSaveReady(save); return () => onSaveReady(null); });

  onDestroy(() => {
    disposed = true;
    loadCoordinator.dispose();
    imageUploadCoordinator.invalidate();
    onDirtyChange(false);
    onUploadBusy(false);
    onSaveBusy(false);
    onSaveReady(null);
  });
</script>

{#if variant === 'inline'}
  <section class="chapter-editor toc-editor" aria-label="Mục lục danh sách phẩm">
    {#if chapters.length > 15 || totalPages > 1}
      <div class="toc-toolbar">
        {#if chapters.length > 15}
          <div class="toc-search-box">
            <Search aria-hidden="true" size={13} class="toc-search-icon" />
            <input
              type="search"
              class="toc-search-input"
              placeholder="Tìm tập (tên hoặc số)..."
              bind:value={searchQuery}
              oninput={() => { page = 0; }}
            />
            {#if searchQuery}
              <button type="button" class="toc-search-clear" onclick={() => { searchQuery = ''; page = 0; }} aria-label="Xóa tìm kiếm">
                <X aria-hidden="true" size={13} />
              </button>
            {/if}
          </div>
        {/if}
        {#if totalPages > 1 && !searchQuery}
          <div class="toc-pagination">
            <button type="button" class="toc-page-btn" disabled={page === 0} onclick={() => page = Math.max(0, page - 1)}>
              ‹ Trước
            </button>
            <span class="toc-page-info">{page + 1}/{totalPages} ({chapters.length} tập)</span>
            <button type="button" class="toc-page-btn" disabled={page >= totalPages - 1} onclick={() => page = Math.min(totalPages - 1, page + 1)}>
              Sau ›
            </button>
          </div>
        {/if}
      </div>
    {/if}

    <div class="toc-list">
      {#if loading}
        <div class="toc-empty">Đang tải mục lục…</div>
      {:else if chapters.length === 0}
        <div class="toc-empty">Chưa có mục nào. Nhấn “Thêm mục” bên dưới.</div>
      {:else if displayChapters.length === 0}
        <div class="toc-empty">Không tìm thấy tập nào khớp với "{searchQuery}".</div>
      {:else}
        {#each displayChapters as { chapter, index } (chapterKey(chapter, index))}
          <div class="toc-item">
            <div class="toc-item-drag">
              <button type="button" class="toc-move-btn" aria-label={`Đưa mục ${index + 1} lên`} title="Lên" disabled={imageBusy || index === 0} onclick={() => move(index, -1)}>
                <ChevronUp aria-hidden="true" size={12} strokeWidth={2.5} />
              </button>
              <span class="toc-item-num">{index + 1}</span>
              <button type="button" class="toc-move-btn" aria-label={`Đưa mục ${index + 1} xuống`} title="Xuống" disabled={imageBusy || index === chapters.length - 1} onclick={() => move(index, 1)}>
                <ChevronDown aria-hidden="true" size={12} strokeWidth={2.5} />
              </button>
            </div>
            <div class="toc-item-fields">
              <input class="toc-item-title" aria-label={`Tên mục ${index + 1}`} type="text" placeholder="Tên mục (VD: Phẩm 1, Chương 1...)" value={chapter.tieu_de} oninput={(event) => updateAt(index, 'tieu_de', event.currentTarget.value)} />
              <input class="toc-item-summary" aria-label={`Tóm tắt mục ${index + 1}`} type="text" placeholder="Tóm tắt ngắn (tuỳ chọn)" value={chapter.tom_tat} oninput={(event) => updateAt(index, 'tom_tat', event.currentTarget.value)} />
            </div>
            <div class="toc-item-actions">
              <button type="button" class="toc-edit-chap-btn" disabled={imageBusy || loadingContentIndex === index} onclick={() => openEditor(index)} title="Soạn nội dung tập này">
                <Pencil aria-hidden="true" size={13} strokeWidth={2.2} />
                {loadingContentIndex === index ? 'Đang tải…' : 'Soạn'}
              </button>
              <button type="button" class="toc-del-btn" aria-label={`Xóa mục ${index + 1}`} title="Xoá mục này" disabled={imageBusy} onclick={() => remove(index)}>
                <Trash2 aria-hidden="true" size={14} strokeWidth={2.2} />
              </button>
            </div>
          </div>
        {/each}
      {/if}
    </div>
    <button type="button" class="toc-add-btn" disabled={imageBusy} onclick={add}>
      <Plus aria-hidden="true" size={13} strokeWidth={2.5} />
      Thêm mục
    </button>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    {#if notice}<p class="notice" role="status">{notice}</p>{/if}
  </section>
{:else}
  <section class="chapter-editor chapter-manager" aria-labelledby="chapter-heading">
    <header><div><h3 id="chapter-heading">Mục lục &amp; nội dung tập</h3><small>{chapters.length} tập</small></div><button type="button" disabled={imageBusy} onclick={add}><Plus aria-hidden="true" size={15} strokeWidth={2} /> Thêm tập</button></header>
    {#if loading}
      <p>Đang tải mục lục…</p>
    {:else}
      <div class="chapter-layout">
        <nav aria-label="Danh sách tập">
          {#each chapters as chapter, index (chapterKey(chapter, index))}
            <div class:active={selected === index}>
              <button type="button" disabled={imageBusy} onclick={() => select(index)}><span>{index + 1}</span><strong>{chapter.tieu_de}</strong></button>
              <span class="order"><button type="button" aria-label="Đưa lên" disabled={imageBusy || index === 0} onclick={() => move(index, -1)}><ChevronUp aria-hidden="true" size={14} strokeWidth={2} /></button><button type="button" aria-label="Đưa xuống" disabled={imageBusy || index === chapters.length - 1} onclick={() => move(index, 1)}><ChevronDown aria-hidden="true" size={14} strokeWidth={2} /></button><button class="remove" type="button" aria-label="Xóa tập" disabled={imageBusy} onclick={() => remove(index)}><Trash2 aria-hidden="true" size={14} strokeWidth={2} /></button></span>
            </div>
          {/each}
        </nav>
        {#if loadingContentIndex === selected}
          <div class="empty">Đang tải nội dung tập…</div>
        {:else if currentChapter}
          <div class="chapter-form">
            <label>Tiêu đề<input value={currentChapter.tieu_de} oninput={(event) => update('tieu_de', event.currentTarget.value)} /></label>
            <label>Tóm tắt<textarea value={currentChapter.tom_tat} oninput={(event) => update('tom_tat', event.currentTarget.value)}></textarea></label>
            <div class="rte-toolbar" aria-label="Định dạng nội dung"><button type="button" disabled={imageBusy} onclick={() => format('formatBlock', 'h2')}>H2</button><button type="button" disabled={imageBusy} onclick={() => format('bold')}><b>B</b></button><button type="button" disabled={imageBusy} onclick={() => format('italic')}><i>I</i></button><button type="button" disabled={imageBusy} onclick={() => format('underline')}><u>U</u></button><button type="button" disabled={imageBusy} onclick={() => format('insertUnorderedList')}>• Danh sách</button><button type="button" disabled={imageBusy} onclick={() => format('justifyLeft')}>Trái</button><button type="button" disabled={imageBusy} onclick={() => format('justifyCenter')}>Giữa</button><button type="button" disabled={imageBusy} onclick={() => format('justifyFull')}>Đều</button><button type="button" disabled={imageBusy} onclick={insertLink}>Liên kết</button><button type="button" disabled={imageBusy} onclick={() => format('removeFormat')}>Xóa định dạng</button><label class="inline-upload">{imageBusy ? 'Đang tải ảnh…' : 'Chèn nhiều ảnh'}<input type="file" disabled={imageBusy} multiple accept="image/jpeg,image/png,image/webp,image/gif" onchange={insertImages} /></label><button type="button" disabled={imageBusy} onclick={() => preview = !preview}>{preview ? 'Soạn thảo' : 'Xem trước'}</button></div>
            {#if preview}<article class="rte-preview">{@html renderReaderContent(currentChapter.noi_dung || '')}</article>{:else}<div class="rte" data-chapter-editor contenteditable="true" role="textbox" aria-multiline="true" bind:this={editor} oninput={(event) => update('noi_dung', event.currentTarget.innerHTML)}>{@html currentChapter.noi_dung}</div>{/if}
          </div>
        {:else}
          <div class="empty">Chưa có tập. Nhấn “Thêm tập” để bắt đầu.</div>
        {/if}
      </div>
    {/if}
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    {#if notice}<p class="notice" role="status">{notice}</p>{/if}
    <footer><button type="button" disabled={busy || imageBusy} onclick={save}>{busy ? 'Đang lưu…' : 'Lưu toàn bộ mục lục'}</button></footer>
  </section>
{/if}

{#if editingOpen && currentChapter}
  <ChapterComposer
    title={currentChapter.tieu_de || `Phẩm ${selected + 1}`}
    content={currentChapter.noi_dung || ''}
    {busy}
    {imageBusy}
    onChange={(value) => update('noi_dung', value)}
    onClose={closeEditor}
    onSave={saveAndClose}
    uploadImage={uploadInlineImage}
    onImageBusy={setComposerImageBusy}
  />
{/if}

<style>
  button { font: inherit; cursor: pointer; }
  .chapter-manager { margin-top: 22px; padding-top: 20px; border-top: 1px solid var(--border2); }
  header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  h3 { margin: 0; }
  header small { color: var(--muted); }
  header > button, footer > button { display: inline-flex; min-height: 38px; align-items: center; gap: 6px; padding: 0 14px; border: 0; border-radius: 19px; background: var(--gold); color: #fff; font-weight: 700; }
  .chapter-layout { display: grid; grid-template-columns: 240px 1fr; gap: 12px; margin-top: 14px; }
  nav { max-height: 430px; overflow: auto; border: 1px solid var(--border2); border-radius: 9px; }
  nav > div { display: grid; grid-template-columns: 1fr auto; border-bottom: 1px solid var(--border2); }
  nav > div.active { background: var(--gold-light); }
  nav > div > button { display: flex; min-width: 0; gap: 7px; padding: 9px; border: 0; background: none; color: var(--text); text-align: left; }
  nav strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .order { display: flex; align-items: center; }
  .order button { width: 28px; height: 32px; border: 0; background: none; color: var(--muted); }
  .order .remove { color: var(--red); }
  .chapter-form label { display: flex; flex-direction: column; gap: 4px; margin-bottom: 8px; }
  .chapter-form input, .chapter-form textarea { padding: 8px; border: 1px solid var(--border); border-radius: 7px; background: var(--bg); color: var(--text); font: inherit; }
  .rte-toolbar { display: flex; flex-wrap: wrap; gap: 4px; padding: 5px; border: 1px solid var(--border); border-bottom: 0; border-radius: 7px 7px 0 0; }
  .rte-toolbar button, .inline-upload { display: inline-flex; min-height: 32px; align-items: center; padding: 0 8px; border: 1px solid var(--border2); border-radius: 5px; background: var(--card); color: var(--text); cursor: pointer; font-size: 12px; }
  .inline-upload { margin: 0; }
  .inline-upload input { position: absolute; width: 1px; height: 1px; overflow: hidden; opacity: 0; }
  .rte, .rte-preview { min-height: 240px; overflow: auto; padding: 12px; border: 1px solid var(--border); border-radius: 0 0 7px 7px; background: var(--bg); color: var(--text); line-height: 1.65; }
  .rte-preview :global(img) { max-width: 100%; height: auto; }
  .empty { display: grid; min-height: 240px; place-items: center; color: var(--muted); }
  .error { margin: 8px; color: var(--red); font-size: 11px; }
  .notice { margin: 8px; color: var(--green-ok); font-size: 11px; }
  footer { display: flex; justify-content: flex-end; margin-top: 12px; }

  .toc-editor { margin-top: 10px; overflow: hidden; border: 1.5px solid var(--border2); border-radius: 10px; background: var(--bg); }
  .toc-toolbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 10px; border-bottom: 1.5px solid var(--border2); background: var(--white); }
  .toc-search-box { display: flex; align-items: center; position: relative; width: 100%; max-width: 240px; }
  .toc-search-box :global(.toc-search-icon) { position: absolute; left: 8px; color: var(--muted); pointer-events: none; }
  .toc-search-input { width: 100%; height: 28px !important; min-height: unset !important; padding: 0 24px 0 26px !important; border: 1px solid var(--border2) !important; border-radius: 6px !important; background: var(--bg) !important; font-size: 11.5px !important; color: var(--text) !important; }
  .toc-search-clear { position: absolute; right: 4px; display: flex; align-items: center; justify-content: center; width: 18px; height: 18px; background: none; border: none; color: var(--muted); cursor: pointer; padding: 0; }
  .toc-search-clear:hover { color: var(--text); }
  .toc-pagination { display: flex; align-items: center; gap: 6px; font-size: 11px; }
  .toc-page-btn { display: inline-flex; align-items: center; padding: 3px 8px; border: 1px solid var(--border2); border-radius: 5px; background: var(--bg); color: var(--text); font-size: 11px; font-weight: 600; cursor: pointer; }
  .toc-page-btn:hover:not(:disabled) { background: var(--gold-light); color: var(--gold); border-color: var(--gold); }
  .toc-page-btn:disabled { opacity: 0.35; cursor: default; }
  .toc-page-info { color: var(--muted); font-size: 11px; }
  .toc-list { display: flex; flex-direction: column; gap: 6px; padding: 8px; max-height: 480px; overflow-y: auto; }
  .toc-empty { padding: 16px 8px; color: var(--muted); font-size: 12px; text-align: center; }
  .toc-item { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border: 1px solid var(--border2); border-radius: 8px; background: var(--white); transition: border-color .15s; }
  .toc-item:focus-within { border-color: var(--gold); }
  .toc-item-drag { display: flex; flex: none; align-items: center; flex-direction: column; gap: 2px; }
  .toc-item-num { min-width: 18px; color: var(--gold); font-size: 11px; font-weight: 700; line-height: 1; text-align: center; }
  .toc-move-btn { display: flex; width: 20px; height: 20px; align-items: center; justify-content: center; padding: 0; border: 0; border-radius: 4px; background: none; color: var(--muted); transition: background .12s, color .12s; }
  .toc-move-btn:hover:not(:disabled) { background: var(--bg3); color: var(--text); }
  .toc-move-btn:disabled { cursor: default; opacity: .3; }
  .toc-item-fields { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 5px; }
  .toc-item input { box-sizing: border-box; width: 100%; height: auto !important; min-height: unset !important; border: 1.5px solid var(--border2); border-radius: 8px; outline: 0; background: var(--bg); color: var(--text); font-family: inherit; }
  .toc-item input:focus { border-color: var(--gold); background: var(--white); }
  .toc-item-title { padding: 6px 10px !important; font-size: 13px !important; font-weight: 600 !important; }
  .toc-item-summary { padding: 5px 10px !important; color: var(--text2) !important; font-size: 12px !important; }
  .toc-item-actions { display: flex; flex: none; align-items: center; gap: 6px; }
  .toc-edit-chap-btn { display: inline-flex; flex: none; align-items: center; gap: 5px; padding: 5px 11px; border: 1.5px solid var(--gold); border-radius: 7px; background: transparent; color: var(--gold); font-size: 12px; font-weight: 600; white-space: nowrap; transition: background .15s, color .15s; }
  .toc-edit-chap-btn:hover:not(:disabled) { background: var(--gold); color: #fff; }
  .toc-edit-chap-btn:disabled { opacity: 0.5; cursor: wait; }
  .toc-del-btn { display: flex; width: 28px; height: 28px; flex: none; align-items: center; justify-content: center; padding: 0; border: 0; border-radius: 6px; background: none; color: var(--muted); transition: background .12s, color .12s; }
  .toc-del-btn:hover { background: #fde8e8; color: var(--red); }
  .toc-add-btn { display: flex; width: 100%; align-items: center; justify-content: center; gap: 6px; padding: 10px; border: 0; border-top: 1.5px dashed var(--border2); background: transparent; color: var(--gold); font-size: 13px; font-weight: 600; transition: background .15s; }
  .toc-add-btn:hover { background: var(--gold-light); }

  @media (max-width: 850px) {
    .chapter-layout { grid-template-columns: 1fr; }
    nav { max-height: 220px; }
    .toc-toolbar { flex-direction: column; align-items: stretch; }
    .toc-search-box { max-width: 100%; }
    .toc-pagination { justify-content: space-between; }
    .toc-item { align-items: flex-start; padding: 7px 8px; gap: 6px; }
    .toc-item-actions { align-items: stretch; flex-direction: column; }
    .toc-edit-chap-btn { min-height: 36px; }
  }
  @media (prefers-reduced-motion: reduce) {
    .toc-item, .toc-move-btn, .toc-edit-chap-btn, .toc-del-btn, .toc-add-btn, .toc-page-btn { transition: none; }
  }
</style>
