<script lang="ts">
  import { Check, CloudUpload, Image, Link, Plus, X } from '@lucide/svelte';
  import { onDestroy } from 'svelte';

  interface Props {
    busy?: boolean;
    uploadImage: (file: File) => Promise<string>;
    onBusy: (busy: boolean) => void;
    onClose: () => void;
    onInsert: (markdown: string) => void;
    onError: (message: string) => void;
  }

  let { busy = false, uploadImage, onBusy, onClose, onInsert, onError }: Props = $props();
  let tab = $state<'upload' | 'url'>('upload');
  let fileInput = $state<HTMLInputElement | null>(null);
  let files = $state<File[]>([]);
  let previews = $state<string[]>([]);
  let urls = $state<string[]>(['']);

  function clearPreviews() {
    previews.forEach((url) => URL.revokeObjectURL(url));
    previews = [];
  }

  function setFiles(next: File[]) {
    clearPreviews();
    files = next.filter((file) => file.type.startsWith('image/'));
    previews = files.map((file) => URL.createObjectURL(file));
  }

  function selectFiles(event: Event) {
    setFiles([...(event.currentTarget as HTMLInputElement).files || []]);
  }

  function dropFiles(event: DragEvent) {
    event.preventDefault();
    setFiles([...(event.dataTransfer?.files || [])]);
  }

  function removeFile(index: number) {
    setFiles(files.filter((_, itemIndex) => itemIndex !== index));
  }

  function setUrl(index: number, value: string) {
    urls[index] = value;
    urls = [...urls];
  }

  async function insert() {
    if (busy) return;
    onError('');
    try {
      if (tab === 'url') {
        const validUrls = urls.map((url) => url.trim()).filter(Boolean);
        if (!validUrls.length) throw new Error('Hãy nhập ít nhất một URL ảnh.');
        onInsert(validUrls.map((url) => `![](${url})`).join('\n\n'));
        return;
      }
      if (!files.length) throw new Error('Hãy chọn ít nhất một ảnh để tải lên.');
      onBusy(true);
      const markdown: string[] = [];
      for (const file of files) {
        const url = await uploadImage(file);
        markdown.push(`![${file.name}](${url})`);
      }
      onInsert(markdown.join('\n\n'));
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'Không thể chèn ảnh vào tập.');
    } finally {
      onBusy(false);
    }
  }

  onDestroy(clearPreviews);
</script>

<div class="chapter-image-backdrop" role="presentation" onclick={(event) => event.target === event.currentTarget && !busy && onClose()}>
  <div class="chapter-image-dialog" data-dialog-glass role="dialog" aria-modal="true" aria-labelledby="chapter-image-title">
    <header>
      <strong id="chapter-image-title">
        <Image aria-hidden="true" />
        Chèn ảnh vào tập
      </strong>
      <button type="button" aria-label="Đóng" disabled={busy} onclick={onClose}><X aria-hidden="true" size={18} strokeWidth={2} /></button>
    </header>

    <nav aria-label="Nguồn ảnh">
      <button type="button" class:active={tab === 'upload'} onclick={() => tab = 'upload'}>
        <CloudUpload aria-hidden="true" />
        Tải ảnh lên
      </button>
      <button type="button" class:active={tab === 'url'} onclick={() => tab = 'url'}>
        <Link aria-hidden="true" />
        Dán URL
      </button>
    </nav>

    <div class="chapter-image-body">
      {#if tab === 'upload'}
        <input bind:this={fileInput} type="file" multiple accept="image/*" onchange={selectFiles} />
        <button type="button" class="drop-zone" ondragover={(event) => event.preventDefault()} ondrop={dropFiles} onclick={() => fileInput?.click()}>
          <CloudUpload aria-hidden="true" />
          <strong>Click hoặc kéo thả ảnh</strong>
          <small>JPG · PNG · WEBP · nhiều ảnh cùng lúc</small>
        </button>
        {#if files.length}
          <div class="upload-list">
            {#each files as file, index}
              <div class="upload-item">
                <img src={previews[index]} alt="" />
                <span>{file.name}</span>
                <button type="button" aria-label={`Xóa ${file.name}`} onclick={() => removeFile(index)}><X aria-hidden="true" size={16} strokeWidth={2} /></button>
              </div>
            {/each}
          </div>
        {/if}
      {:else}
        <div class="url-list">
          {#each urls as url, index}
            <div class="url-row">
              <input type="url" aria-label={`URL ảnh ${index + 1}`} placeholder="Dán URL ảnh..." value={url} oninput={(event) => setUrl(index, event.currentTarget.value)} />
              {#if url.trim()}<img src={url.trim()} alt="" />{/if}
              <button type="button" aria-label={`Xóa URL ảnh ${index + 1}`} onclick={() => urls = urls.length === 1 ? [''] : urls.filter((_, itemIndex) => itemIndex !== index)}><X aria-hidden="true" size={16} strokeWidth={2} /></button>
            </div>
          {/each}
        </div>
        <button type="button" class="add-url" onclick={() => urls = [...urls, '']}><Plus aria-hidden="true" size={14} strokeWidth={2} /> Thêm ảnh khác</button>
      {/if}
    </div>

    <footer class="dialog-actions-balanced">
      <button type="button" class="cancel" disabled={busy} onclick={onClose}>Huỷ</button>
      <button type="button" class="insert" disabled={busy} onclick={insert}>
        {#if !busy}<Check aria-hidden="true" />{/if}
        {busy ? 'Đang tải…' : 'Chèn ảnh'}
      </button>
    </footer>
  </div>
</div>

<style>
  button, input { font: inherit; }
  button { cursor: pointer; }
  .chapter-image-backdrop { position: fixed; z-index: 9200; inset: 0; display: flex; align-items: center; justify-content: center; padding: 16px; background: rgba(0,0,0,.6); }
  .chapter-image-dialog { width: 100%; max-width: 520px; overflow: hidden; border-radius: 14px; background: var(--dialog-surface-background, var(--card)); box-shadow: var(--dialog-surface-shadow, var(--shadow-xl));
    border-color: var(--dialog-surface-border, var(--border));
  }
  header { display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; border-bottom: 1.5px solid var(--border2); }
  header strong { display: inline-flex; align-items: center; color: var(--text); font-size: 14px; font-weight: 700; }
  header :global(svg) { width: 14px; height: 14px; margin-right: 9.45px; }
  header button { padding: 2px 6px; border: 0; border-radius: 5px; background: none; color: var(--muted); font: 18px var(--font-app); line-height: normal; }
  nav { display: flex; gap: 4px; margin-bottom: 14px; padding: 10px 18px 0; border-radius: 10px; background: var(--bg2); }
  nav button { display: flex; min-width: 0; flex: 1; align-items: center; justify-content: center; gap: 3px; padding: 8px 12px; border: 0; border-radius: 8px; background: transparent; color: var(--muted); font-size: 12px; font-weight: 600; line-height: normal; transition: .18s; }
  nav button :global(svg) { width: 12px; height: 12px; }
  nav button.active { background: var(--bg); box-shadow: 0 1px 4px rgba(0,0,0,.12); color: var(--text); }
  .chapter-image-body { padding: 12px 18px 16px; }
  .chapter-image-body > input { display: none; }
  .drop-zone { display: flex; box-sizing: border-box; width: 100%; height: 143px; align-items: center; justify-content: center; flex-direction: column; margin-bottom: 10px; padding: 28px 16px; border: 2px dashed var(--border2); border-radius: 10px; background: transparent; color: var(--text2); text-align: center; transition: border-color .2s, background .2s; }
  .drop-zone:hover, .drop-zone:focus-visible { border-color: var(--gold); background: var(--bg2); }
  .drop-zone :global(svg) { width: 28px; height: 28px; margin-bottom: 6px; opacity: .35; }
  .drop-zone strong { font-size: 13px; }
  .drop-zone small { margin-top: 3px; font-size: 11px; opacity: .5; }
  .upload-list, .url-list { display: grid; gap: 7px; margin-top: 10px; }
  .upload-item, .url-row { display: flex; min-width: 0; align-items: center; gap: 8px; }
  .upload-item img, .url-row img { width: 42px; height: 42px; flex: none; border-radius: 5px; object-fit: cover; }
  .upload-item span { min-width: 0; flex: 1; overflow: hidden; color: var(--text2); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
  .upload-item button, .url-row button { flex: none; padding: 5px 7px; border: 0; background: none; color: var(--muted); }
  .url-row input { min-width: 0; height: 36px; flex: 1; padding: 0 10px; border: 1.5px solid var(--border2); border-radius: 7px; outline: 0; background: var(--white); color: var(--text); font-size: 13px; }
  .url-row input:focus { border-color: var(--gold); }
  .add-url { display: inline-flex; align-items: center; gap: 5px; margin-top: 8px; padding: 6px 9px; border: 1px solid var(--border2); border-radius: 6px; background: var(--bg2); color: var(--text2); font-size: 11px; font-weight: 600; }
  footer { display: flex; justify-content: flex-end; gap: 8px; padding: 10px 18px 16px; border-top: 1px solid var(--border2); }
  footer button { min-height: 34px; padding: 8px 16px; border-radius: 20px; font-size: 13px; line-height: normal; }
  .cancel { border: 1px solid var(--border); background: var(--white); color: var(--muted); font-weight: 600; }
  .insert { display: flex; align-items: center; gap: 6px; border: 0; background: var(--gold); box-shadow: 0 2px 8px rgba(200,150,62,.3); color: #fff; font-weight: 700; }
  .insert :global(svg) { width: 12px; height: 12px; margin-right: 4px; }
  button:disabled { cursor: wait; opacity: .6; }
</style>
