<script lang="ts">
  import { ArrowLeft, PenLine, Save } from '@lucide/svelte';
  import ProfessionalRichTextEditor from '$lib/components/admin/editor/ProfessionalRichTextEditor.svelte';
  import {
    createChapterEditorHtml,
    createChapterImageHtml,
    serializeChapterEditorHtml,
  } from './chapter-content-editor';

  interface Props {
    title: string;
    content: string;
    busy?: boolean;
    imageBusy?: boolean;
    onChange: (value: string) => void;
    onClose: () => void;
    onSave: () => void | Promise<void>;
    uploadImage: (file: File) => Promise<string>;
    onImageBusy: (busy: boolean) => void;
  }

  let {
    title,
    content,
    busy = false,
    imageBusy = false,
    onChange,
    onClose,
    onSave,
    uploadImage,
    onImageBusy,
  }: Props = $props();

  let editorError = $state('');
  const editorContent = $derived(createChapterEditorHtml(content));
</script>

<div class="chapter-compose-overlay" data-dialog-glass role="dialog" aria-modal="true" aria-labelledby="chapter-compose-title">
  <header class="chapter-compose-header">
    <button type="button" class="chapter-compose-back" disabled={imageBusy || busy} onclick={onClose}>
      <ArrowLeft aria-hidden="true" size={16} strokeWidth={2} />
      Quay lại
    </button>
    <div class="chapter-compose-heading">
      <strong id="chapter-compose-title"><PenLine aria-hidden="true" size={16} strokeWidth={2} /> {title}</strong>
      <small>Soạn nội dung tập</small>
    </div>
    <button type="button" class="chapter-compose-save" disabled={imageBusy || busy} onclick={onSave}>
      <Save aria-hidden="true" size={16} strokeWidth={2} />
      {busy ? 'Đang lưu…' : 'Lưu tập'}
    </button>
  </header>

  <ProfessionalRichTextEditor
    content={editorContent}
    label="Nội dung phẩm"
    placeholder={`Viết nội dung cho ${title} tại đây…`}
    variant="chapter"
    {imageBusy}
    {onChange}
    serialize={serializeChapterEditorHtml}
    createImageHtml={createChapterImageHtml}
    {uploadImage}
    {onImageBusy}
    onError={(message) => editorError = message}
  />

  {#if editorError}<p class="chapter-compose-error" role="alert">{editorError}</p>{/if}
</div>

<style>
  .chapter-compose-overlay {
    --editor-accent: oklch(0.66 0.12 78);
    --editor-accent-strong: oklch(0.51 0.1 78);
    --editor-soft: oklch(0.95 0.035 78);
    --editor-border: oklch(0.87 0.008 78);
    --editor-surface: oklch(0.975 0.004 78);
    --editor-paper: oklch(0.995 0.002 78);
    --editor-ink: oklch(0.24 0.014 78);
    --editor-muted: oklch(0.48 0.018 78);
    --editor-radius-inner: 8px;
    --editor-ease: cubic-bezier(.25, 1, .5, 1);
    position: fixed;
    z-index: 9100;
    inset: 0;
    display: flex;
    flex-direction: column;
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;
    background: var(--dialog-surface-background, var(--card));
    border-color: var(--dialog-surface-border, var(--border));
    box-shadow: var(--dialog-surface-shadow, var(--shadow-xl));
    color: var(--editor-ink);
  }
  :global([data-theme='dark']) .chapter-compose-overlay {
    --editor-accent: oklch(0.75 0.11 78);
    --editor-accent-strong: oklch(0.83 0.09 78);
    --editor-soft: oklch(0.28 0.035 78);
    --editor-border: oklch(0.31 0.012 78);
    --editor-surface: oklch(0.19 0.008 78);
    --editor-paper: oklch(0.23 0.01 78);
    --editor-ink: oklch(0.91 0.01 78);
    --editor-muted: oklch(0.7 0.014 78);
  }
  button { font: inherit; cursor: pointer; touch-action: manipulation; }
  button:focus-visible { outline: 2px solid var(--editor-accent); outline-offset: 2px; }
  button:disabled { cursor: default; opacity: .5; }
  .chapter-compose-header {
    display: grid;
    min-height: 64px;
    flex: none;
    align-items: center;
    grid-template-columns: minmax(120px, 1fr) minmax(0, 2fr) minmax(120px, 1fr);
    gap: 16px;
    padding: 0 16px;
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;
    border-bottom: 1px solid var(--editor-border);
    background: transparent;
  }
  .chapter-compose-header button { display: inline-flex; min-height: 44px; align-items: center; justify-content: center; gap: 8px; padding: 0 16px; border: 1px solid transparent; border-radius: var(--editor-radius-inner); font-size: 13px; font-weight: 700; transition: color 150ms var(--editor-ease), background-color 150ms var(--editor-ease), border-color 150ms var(--editor-ease), transform 100ms var(--editor-ease); }
  .chapter-compose-header button:hover:not(:disabled) { transform: translateY(-1px); }
  .chapter-compose-header button:active:not(:disabled) { transform: translateY(1px); }
  .chapter-compose-back { justify-self: start; background: transparent; color: var(--editor-muted); }
  .chapter-compose-back:hover:not(:disabled) { border-color: var(--editor-border); background: var(--editor-surface); color: var(--editor-ink); }
  .chapter-compose-heading { display: grid; min-width: 0; justify-items: center; gap: 4px; text-align: center; }
  .chapter-compose-heading strong { display: flex; max-width: 100%; align-items: center; gap: 8px; overflow: hidden; color: var(--editor-ink); font-size: 14px; text-overflow: ellipsis; white-space: nowrap; }
  .chapter-compose-heading small { color: var(--editor-muted); font-size: 11px; }

  .chapter-compose-save { justify-self: end; border-color: var(--editor-accent) !important; background: var(--editor-accent-strong); color: var(--editor-paper); }
  .chapter-compose-save:hover:not(:disabled) { background: var(--editor-accent); }
  .chapter-compose-error { position: fixed; z-index: 9300; right: 16px; bottom: 16px; max-width: min(400px, calc(100vw - 32px)); margin: 0; padding: 12px 16px; border-radius: var(--editor-radius-inner); background: oklch(0.42 0.13 28); color: oklch(0.98 0.005 28); font-size: 13px; }
  @media (max-width: 640px) {
    .chapter-compose-header { min-height: 56px; grid-template-columns: auto minmax(0, 1fr) auto; gap: 8px; padding: 0 8px; }
    .chapter-compose-header button { min-width: 44px; padding: 0 8px; font-size: 0; }
    .chapter-compose-header button :global(svg) { width: 18px; height: 18px; }
    .chapter-compose-heading small { display: none; }
  }
  @media (prefers-reduced-motion: reduce) {
    .chapter-compose-header button { transition-duration: 0ms; }
  }
</style>
