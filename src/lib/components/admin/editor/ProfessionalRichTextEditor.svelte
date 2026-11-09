<script lang="ts">
  import { promptInApp } from '$lib/browser/app-dialog';
  import { sanitizeStoredHtml } from '$lib/domain/content-sanitizer';
  import { cleanPastedHtml, formatPlainTextToHtml } from './paste-cleaner';
  import { createArticleLinkHtml, createArticleTableHtml, isSafeEditorLink } from '../articles/article-content-editor';

  interface Props {
    content: string;
    label: string;
    placeholder: string;
    variant?: 'article' | 'chapter';
    imageBusy?: boolean;
    showSplit?: boolean;
    onChange: (value: string) => void;
    serialize?: (html: string) => string;
    createImageHtml: (markdown: string) => string;
    uploadImage: (file: File) => Promise<string>;
    onImageBusy: (busy: boolean) => void;
    onError: (message: string) => void;
  }
  let { content, label, placeholder, variant = 'article', imageBusy = false,
    showSplit = false, onChange, serialize = sanitizeStoredHtml,
    createImageHtml, uploadImage, onImageBusy, onError }: Props = $props();
  let editorEl: HTMLDivElement | undefined = $state();
  let preview = $state(false);
  let previewHtml = $state('');
  let lastEmitted: string | null = null;
  let savedRange: Range | null = null;
  let uploading = $state(false);
  const busy = $derived(imageBusy || uploading);

  $effect(() => {
    const element = editorEl;
    const incoming = content;
    if (element && incoming !== lastEmitted) {
      const safe = sanitizeStoredHtml(incoming);
      if (element.innerHTML !== safe) element.innerHTML = safe;
      previewHtml = safe;
      savedRange = null;
    }
  });

  function rememberSelection() {
    const selection = window.getSelection();
    if (editorEl && selection?.rangeCount && editorEl.contains(selection.getRangeAt(0).commonAncestorContainer)) {
      savedRange = selection.getRangeAt(0).cloneRange();
    }
  }
  function restoreSelection() {
    if (!editorEl) return;
    editorEl.focus();
    const selection = window.getSelection();
    if (!selection) return;
    const range = savedRange && editorEl.contains(savedRange.commonAncestorContainer)
      ? savedRange : document.createRange();
    if (range !== savedRange) { range.selectNodeContents(editorEl); range.collapse(false); }
    selection.removeAllRanges();
    selection.addRange(range);
  }
  function emitChange() {
    if (!editorEl) return;
    previewHtml = sanitizeStoredHtml(editorEl.innerHTML);
    lastEmitted = serialize(previewHtml);
    onChange(lastEmitted);
    rememberSelection();
  }
  function command(name: string, value?: string) {
    if (busy) return;
    restoreSelection();
    document.execCommand(name, false, value);
    emitChange();
  }
  function paste(event: ClipboardEvent) {
    event.preventDefault();
    const html = event.clipboardData?.getData('text/html');
    const text = event.clipboardData?.getData('text/plain') ?? '';
    command('insertHTML', sanitizeStoredHtml(html ? cleanPastedHtml(html) : formatPlainTextToHtml(text)));
  }
  async function insertLink(): Promise<void> {
    if (busy) return;
    rememberSelection();
    const target = editorEl;
    const selection = savedRange?.cloneRange() ?? null;
    const url = await promptInApp('Địa chỉ liên kết (https://…)');
    if (!url || busy || !target?.isConnected || editorEl !== target) return;
    savedRange = selection;
    const href = url.trim();
    if (!isSafeEditorLink(href)) { onError('Liên kết không hợp lệ.'); return; }
    // Giữ nguyên chữ, định dạng và khoảng trắng cạnh vùng chọn khi tạo liên kết.
    if (selection && !selection.collapsed) command('createLink', href);
    else command('insertHTML', createArticleLinkHtml(href));
  }
  async function insertImages(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (busy || !files.length) return;
    uploading = true;
    onImageBusy(true);
    onError('');
    try {
      for (const file of files) {
        if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
          throw new Error('Chỉ hỗ trợ ảnh JPEG, PNG, WebP và GIF.');
        }
        const url = await uploadImage(file);
        if (!editorEl?.isConnected) break;
        restoreSelection();
        document.execCommand('insertHTML', false, sanitizeStoredHtml(createImageHtml(`![Ảnh](${url})`)));
        emitChange();
      }
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Không thể tải ảnh.');
    } finally {
      uploading = false;
      onImageBusy(false);
    }
  }
</script>

<section class="native-editor" class:chapter={variant === 'chapter'}>
  <div class="editor-heading"><strong>{label}</strong>
    <button type="button" onclick={() => preview = !preview}>{preview ? 'Soạn thảo' : 'Xem trước'}</button>
  </div>
  <div class="editor-toolbar" role="toolbar" aria-label="Định dạng nội dung" hidden={preview}>
    {#each [['bold', 'Đậm'], ['italic', 'Nghiêng'], ['underline', 'Gạch chân'], ['undo', 'Hoàn tác'], ['redo', 'Làm lại'], ['insertUnorderedList', 'Danh sách'], ['insertOrderedList', 'Đánh số'], ['justifyLeft', 'Căn trái'], ['justifyCenter', 'Căn giữa'], ['justifyFull', 'Căn đều']] as [name, title]}
      <button type="button" disabled={busy} onpointerdown={() => rememberSelection()} onclick={() => command(name)}>{title}</button>
    {/each}
    <select aria-label="Kiểu đoạn" disabled={busy} onfocus={rememberSelection} onchange={(event) => command('formatBlock', event.currentTarget.value)}>
      <option value="p">Đoạn văn</option><option value="h2">Tiêu đề</option><option value="h3">Tiêu đề phụ</option><option value="blockquote">Trích dẫn</option>
    </select>
    <button type="button" disabled={busy} onpointerdown={rememberSelection} onclick={insertLink}>Liên kết</button>
    <button type="button" disabled={busy} onpointerdown={rememberSelection} onclick={() => command('insertHTML', createArticleTableHtml(3, 3))}>Bảng 3 × 3</button>
    <label class="image-upload">{busy ? 'Đang tải…' : 'Chèn ảnh'}<input aria-label="Chèn ảnh" type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif" disabled={busy} onfocus={rememberSelection} onchange={insertImages} /></label>
  </div>
  <div class="editor-body" class:split={showSplit}>
    <div class="editor-canvas" hidden={preview}>
      <div bind:this={editorEl} class="editor-input" contenteditable={!busy} role="textbox" aria-label={label} aria-multiline="true" data-placeholder={placeholder} tabindex="0" oninput={emitChange} onpaste={paste} onkeyup={rememberSelection} onmouseup={rememberSelection} onblur={rememberSelection} ondragover={(event) => event.preventDefault()} ondrop={(event) => event.preventDefault()}></div>
    </div>
    {#if preview || showSplit}<div class="preview-panel">{@html previewHtml}</div>{/if}
  </div>
</section>

<style>
  .native-editor { display:flex; flex-direction:column; flex:1; min-height:280px; min-width:0; color:var(--editor-ink, var(--text)); border:1px solid var(--editor-border, var(--border2)); border-radius:8px; background:var(--editor-paper, var(--bg)); overflow:hidden; }
  .editor-heading { display:flex; justify-content:space-between; align-items:center; padding:10px; gap:8px; }
  .editor-toolbar { display:flex; flex-wrap:wrap; gap:5px; padding:8px; border-block:1px solid var(--editor-border, var(--border2)); }
  .editor-toolbar[hidden], .editor-canvas[hidden] { display:none; }
  button, select, .image-upload { padding:7px 9px; min-height:36px; border:1px solid var(--editor-border, var(--border2)); border-radius:5px; font:inherit; font-size:13px; color:inherit; background:var(--editor-surface, var(--bg)); cursor:pointer; }
  button:disabled, select:disabled { opacity:.5; cursor:default; }
  button:focus-visible, select:focus-visible, input:focus-visible { outline:2px solid var(--editor-accent, #9d702c); }
  .image-upload { position:relative; overflow:hidden; }
  .image-upload input { position:absolute; inset:0; width:100%; opacity:0; cursor:pointer; }
  .editor-body { flex:1; min-height:0; overflow:auto; }
  .editor-body.split { display:grid; grid-template-columns:1fr 1fr; }
  .editor-canvas { min-width:0; }
  .editor-input, .preview-panel { padding:20px; min-height:260px; overflow-wrap:anywhere; font:16px/1.7 var(--font-app, sans-serif); }
  .editor-input { outline:none; }
  .editor-input:focus { box-shadow:inset 0 0 0 2px var(--editor-accent, #9d702c); }
  .editor-input:empty::before { content:attr(data-placeholder); opacity:.5; pointer-events:none; }
  .editor-body :global(img) { max-width:100%; height:auto; }
  .editor-body :global(table) { border-collapse:collapse; max-width:100%; }
  .editor-body :global(td), .editor-body :global(th) { border:1px solid #999; padding:6px; }
  @media(max-width:700px) { .editor-body.split { grid-template-columns:1fr; } .editor-input, .preview-panel { padding:12px; } }
</style>
