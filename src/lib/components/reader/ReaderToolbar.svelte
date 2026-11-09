<script lang="ts">
  import { uiScrollBehavior } from '$lib/browser/ui-motion';
  import { onMount } from 'svelte';
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import ReaderToolsPanel from './ReaderToolsPanel.svelte';

  const localeStore = getLocaleContext();
  const t = $derived(localeStore.t.readerToolbar);

  interface DownloadDetails {
    authenticated: boolean;
    url: string;
    fileName: string;
    prepareFile?: (signal: AbortSignal) => Promise<Blob>;
  }

  export interface ReaderMediaInfo {
    type: 'video' | 'image';
    title: string;
    count: number;
    total: number;
    cachedBytes: number;
    totalBytes: number;
    onOpenModal: () => void;
  }

  interface Props {
    fontSize: number;
    bold: boolean;
    background: string;
    bookmarked: boolean;
    ttsActive: boolean;
    ttsLoading: boolean;
    autoScrollActive: boolean;
    autoScrollSpeed: number;
    download?: DownloadDetails;
    mediaInfo?: ReaderMediaInfo | null;
    scrollElement?: HTMLElement | null;
    fontFamily?: string;
    lineHeight?: number;
    textAlign?: 'justify' | 'left';
    ttsSpeed?: number;
    ttsVoice?: string;
    onFont: (delta: number) => void;
    onBold: () => void;
    onBackground: (background: string) => void;
    onBookmark: () => void;
    onSpeak: () => void;
    onShare: () => void;
    onAutoScroll: () => void;
    onAutoScrollSpeed: (speed: number) => void;
    onFontFamily?: (font: string) => void;
    onLineHeight?: (lineHeight: number) => void;
    onTextAlign?: (align: 'justify' | 'left') => void;
    onTtsSpeed?: (speed: number) => void;
    onTtsVoice?: (voice: string) => void;
    onNotify?: (message: string) => void;
    onClose: () => void;
  }

  let {
    fontSize,
    bold,
    background,
    bookmarked,
    ttsActive,
    ttsLoading,
    autoScrollActive,
    autoScrollSpeed,
    download,
    mediaInfo = null,
    scrollElement = null,
    fontFamily = 'bookerly',
    lineHeight = 1.9,
    textAlign = 'justify',
    ttsSpeed = 1,
    ttsVoice = 'female',
    onFont,
    onBold,
    onBackground,
    onBookmark,
    onSpeak,
    onShare,
    onAutoScroll,
    onAutoScrollSpeed,
    onFontFamily = () => {},
    onLineHeight = () => {},
    onTextAlign = () => {},
    onTtsSpeed = () => {},
    onTtsVoice = () => {},
    onNotify = () => {},
    onClose,
  }: Props = $props();

  const fontOptions = [
    { key: 'bookerly', label: 'Bookerly' },
    { key: 'merriweather', label: 'Merriweather' },
    { key: 'literata', label: 'Literata' },
    { key: 'be-vietnam-pro', label: 'San Francisco' },
  ];

  const backgroundOptions = $derived([
    { key: 'white', label: t.bgWhite, color: '#fff', border: '#ccc' },
    { key: 'cream', label: t.bgCream, color: '#f4ecd8', border: '#e0d8c8' },
    { key: 'gray', label: t.bgGray, color: '#e8e8e8', border: '#ccc' },
    { key: 'dark', label: t.bgDark, color: '#15120d', border: '#3a3226' },
  ]);

  let toolbar = $state<HTMLElement | null>(null);
  let canScrollLeft = $state(false);
  let canScrollRight = $state(false);

  function updateScrollState(): void {
    if (!toolbar) return;
    canScrollLeft = toolbar.scrollLeft > 2;
    canScrollRight = toolbar.scrollLeft + toolbar.clientWidth < toolbar.scrollWidth - 2;
  }

  function scrollToolbar(direction: -1 | 1): void {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    toolbar?.scrollBy({ left: direction * 150, behavior: reduced ? 'auto' : uiScrollBehavior() });
  }

  onMount(() => {
    const observer = new ResizeObserver(updateScrollState);
    if (toolbar) observer.observe(toolbar);
    updateScrollState();
    return () => observer.disconnect();
  });
</script>

<ReaderToolsPanel {scrollElement}>
<div class="reader-toolbar-wrapper">
  <span class="sr-only" aria-live="polite">{ttsLoading ? t.loading : ttsActive ? t.listen : ''}</span>
  <button class="toolbar-scroll-arrow toolbar-scroll-left" class:hidden={!canScrollLeft} type="button" aria-label={t.scrollLeft} disabled={!canScrollLeft} onclick={() => scrollToolbar(-1)}>
    <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
  </button>
  <div class="reader-toolbar" aria-label={t.toolbarAria} bind:this={toolbar} onscroll={updateScrollState}>
  <div class="toolbar-group">
    <small>{t.fontSize}</small>
    <span class="toolbar-row">
      <button class="font-button" type="button" aria-label={t.decreaseFont} onclick={() => onFont(-1)}>A−</button>
      <b class="font-size">{fontSize}px</b>
      <button class="font-button" type="button" aria-label={t.increaseFont} onclick={() => onFont(1)}>A+</button>
    </span>
  </div>

  <div class="toolbar-group">
    <small>{t.fontFamily}</small>
    <select class="toolbar-select" aria-label={t.fontFamily} value={fontFamily} onchange={(e) => onFontFamily(e.currentTarget.value)}>
      {#each fontOptions as f}
        <option value={f.key}>{f.label}</option>
      {/each}
    </select>
  </div>

  <div class="toolbar-group">
    <small>{t.layout}</small>
    <span class="toolbar-row">
      <button class="square-button" class:active={bold} type="button" aria-pressed={bold} title={t.bold} onclick={onBold}><b>B</b></button>
      <select class="toolbar-select" aria-label={t.lineHeight} value={String(lineHeight)} onchange={(e) => onLineHeight(Number(e.currentTarget.value))}>
        <option value="1.6">1.6×</option>
        <option value="1.9">1.9×</option>
        <option value="2.2">2.2×</option>
      </select>
    </span>
  </div>

  <div class="toolbar-group">
    <small>{t.paperBg}</small>
    <span class="toolbar-row background-options">
      {#each backgroundOptions as option}
        <button
          class:active={background === option.key}
          class={`swatch ${option.key}`}
          type="button"
          aria-label={`${t.paperBg} ${option.label}`}
          aria-pressed={background === option.key}
          title={option.label}
          onclick={() => onBackground(option.key)}
        ><span style={`background:${option.color};border:1.5px solid ${option.border}`}></span></button>
      {/each}
    </span>
  </div>

  <div class="toolbar-group">
    <small>{t.save}</small>
    <button class="action-button" class:active={bookmarked} type="button" aria-pressed={bookmarked} onclick={onBookmark}>
      <span aria-hidden="true">🔖</span><span class="action-label">{bookmarked ? t.bookmarked : t.bookmark}</span>
    </button>
  </div>

  {#if mediaInfo}
    <div class="toolbar-group">
      <small>{mediaInfo.type === 'video' ? (localeStore.current === 'en' ? 'VIDEOS' : 'TẢI VIDEO') : (localeStore.current === 'en' ? 'IMAGES' : 'TẢI ẢNH')}</small>
      <button
        class="action-button media-action-btn"
        class:active={mediaInfo.count === mediaInfo.total && mediaInfo.total > 0}
        type="button"
        title={mediaInfo.type === 'video' ? 'Quản lý tải video ngoại tuyến' : 'Quản lý tải ảnh minh họa ngoại tuyến'}
        onclick={mediaInfo.onOpenModal}
      >
        <span aria-hidden="true">{mediaInfo.type === 'video' ? '🎬' : '🖼️'}</span>
        <span class="media-btn-text">
          {mediaInfo.count === mediaInfo.total && mediaInfo.total > 0
            ? (localeStore.current === 'en' ? 'Saved' : 'Đã tải đủ')
            : (mediaInfo.type === 'video' ? (localeStore.current === 'en' ? 'Download video' : 'Tải video') : (localeStore.current === 'en' ? 'Download images' : 'Tải ảnh'))}
          {mediaInfo.count}/{mediaInfo.total}
        </span>
      </button>
    </div>
  {/if}

  <div class="toolbar-group">
    <small>{t.listen}</small>
    <span class="toolbar-row">
      <button class="action-button" class:active={ttsActive} type="button" aria-pressed={ttsActive} aria-busy={ttsLoading} onclick={onSpeak}><span aria-hidden="true">{ttsLoading ? '⏳' : ttsActive ? '⏹️' : '🔊'}</span><span class="action-label">{ttsLoading ? t.loading : ttsActive ? t.stop : t.play}</span></button>
<span class="voice-default">{t.voiceDefault}</span>
      <select class="toolbar-select" aria-label={t.voiceSpeed} value={String(ttsSpeed)} onchange={(e) => onTtsSpeed(Number(e.currentTarget.value))}>
        <option value="0.8">0.8×</option>
        <option value="1">1.0×</option>
        <option value="1.2">1.2×</option>
      </select>
    </span>
  </div>

  <div class="toolbar-group">
    <small>{t.share}</small>
    <button class="action-button" type="button" onclick={onShare}><span aria-hidden="true">📤</span><span class="action-label">{t.share}</span></button>
  </div>

  <div class="toolbar-group">
    <small>{t.autoScroll}</small>
    <span class="toolbar-row auto-scroll-controls">
      <button class="action-button" class:active={autoScrollActive} type="button" aria-pressed={autoScrollActive} onclick={onAutoScroll}>
        <span aria-hidden="true">{autoScrollActive ? '⏸️' : '⬇️'}</span><span class="action-label">{autoScrollActive ? t.stop : t.scrollPlay}</span>
      </button>
      <select aria-label={t.autoScroll} value={String(autoScrollSpeed)} onchange={(event) => onAutoScrollSpeed(Number(event.currentTarget.value))}>
        <option value="0.25">{t.speedVerySlow}</option>
        <option value="0.5">{t.speedSlow}</option>
        <option value="1">{t.speedNormal}</option>
        <option value="2">{t.speedFast}</option>
      </select>
    </span>
  </div>

  <span class="toolbar-spacer"></span>
  <div class="toolbar-group close-group">
    <small>{t.close}</small>
    <button class="close-button" type="button" aria-label={t.close} onclick={onClose}>✕</button>
  </div>
  </div>
  <button class="toolbar-scroll-arrow toolbar-scroll-right" class:hidden={!canScrollRight} type="button" aria-label={t.scrollRight} disabled={!canScrollRight} onclick={() => scrollToolbar(1)}>
    <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
  </button>
</div>
</ReaderToolsPanel>

<style>
  .sr-only{position:absolute;width:1px;height:1px;overflow:hidden;padding:0;border:0;margin:-1px;clip:rect(0,0,0,0);white-space:nowrap}.reader-toolbar-wrapper{display:contents}.toolbar-scroll-arrow{display:none}.reader-toolbar{display:flex;min-height:68px;overflow-x:auto;flex:0 0 auto;align-items:flex-end;gap:20px;padding:10px 14px;border-bottom:1px solid var(--border2);background:var(--bg2);scrollbar-width:none}.reader-toolbar::-webkit-scrollbar{display:none}.toolbar-group{display:flex;min-width:max-content;flex-direction:column;flex-shrink:0;align-items:center;gap:5px}.toolbar-group small{color:var(--muted);font-size:var(--font-size-label);font-weight:700;letter-spacing:.4px;text-transform:uppercase;white-space:nowrap}.toolbar-row{display:flex;align-items:center;gap:5px}.toolbar-spacer{min-width:4px;flex:1}.reader-toolbar button{border:1.5px solid var(--border);background:var(--bg2);color:var(--text2);font:inherit;cursor:pointer;transition:border-color .15s,background .15s,color .15s,transform .15s}.reader-toolbar button:hover{border-color:var(--gold);color:var(--gold)}.reader-toolbar button:active{transform:scale(.92)}.reader-toolbar button:focus-visible{outline:3px solid color-mix(in srgb,var(--gold) 40%,transparent);outline-offset:2px}.font-button,.square-button{display:grid;width:36px;height:36px;place-items:center;padding:0;font-size:13px;font-weight:700}.font-button{border-radius:10px}.font-button:hover{background:var(--gold-light)}.square-button{border-radius:8px;font-family:var(--font-app);font-size:18px;font-weight:900}.square-button b{font-size:20px;font-weight:900;line-height:1}.square-button.active{border-color:var(--gold);background:var(--gold);color:#fff}.square-button.active:hover{color:#fff}.font-size{min-width:34px;color:var(--gold);font-size:12px;text-align:center}.background-options{gap:5px}.reader-toolbar .swatch{position:relative;display:flex;width:34px;height:34px;flex-shrink:0;align-items:center;justify-content:center;padding:3px;border:2px solid transparent;border-radius:50%;background:none;box-shadow:none;transition:transform .15s,opacity .15s}.reader-toolbar .swatch::after{position:absolute;inset:0;border:2px solid var(--gold);border-radius:50%;box-shadow:0 0 0 0 transparent;content:'';opacity:0;pointer-events:none;transform:scale(.72);transition:opacity .18s ease-out,transform .24s cubic-bezier(.34,1.2,.64,1),box-shadow .24s ease-out}.reader-toolbar .swatch span{display:block;width:100%;height:100%;border-radius:50%}.reader-toolbar .swatch:hover{border-color:transparent;background:none;color:inherit;transform:scale(1.1)}.reader-toolbar .swatch:hover::after{opacity:1;transform:scale(1)}.reader-toolbar .swatch.active{border-color:transparent;box-shadow:none}.reader-toolbar .swatch.active::after{box-shadow:0 0 0 2px var(--gold-light);opacity:1;transform:scale(1)}:global(:root:not([data-theme='dark'])) .swatch.dark{display:none}:global(:root[data-theme='dark']) .swatch:not(.dark):not(.cream){display:none}.action-button{display:flex;align-items:center;justify-content:center;gap:5px;padding:5px 11px;border-radius:16px;font-size:var(--font-size-label);font-weight:500;line-height:normal;white-space:nowrap}.action-button.active{border-color:var(--gold);background:var(--gold-light);color:var(--brown);font-weight:600}.close-button{display:grid;width:32px;height:32px;place-items:center;padding:0;border:1px solid var(--border2);border-radius:50%;background:var(--bg);font-size:15px;line-height:1;transition:.2s}.close-button:hover{background:var(--gold-light)}.toolbar-download :global(.download-gate){min-height:29px;gap:5px;padding:5px 11px;border:1.5px solid var(--border);border-radius:16px;background:var(--bg2);font:inherit;font-size:var(--font-size-label);font-weight:500;line-height:normal;box-shadow:none}.toolbar-download :global(.download-icon),.toolbar-download :global(.download-label){font:inherit}.auto-scroll-controls{gap:4px}.auto-scroll-controls select,.toolbar-select{height:32px;padding:4px 6px;border:1.5px solid var(--border);border-radius:12px;background:var(--card);color:var(--text);cursor:pointer;font:inherit;font-size:11px;outline:none;box-shadow:none;transition:border-color .15s}.auto-scroll-controls select:focus-visible,.toolbar-select:focus-visible{border-color:var(--gold);outline:none;box-shadow:none}
  @media(max-width:768px){.reader-toolbar-wrapper{position:relative;display:flex;width:100%;flex:0 0 auto;align-items:center;background:var(--bg2)}.toolbar-scroll-arrow{position:absolute;z-index:10;top:0;bottom:0;display:flex;width:32px;align-items:center;justify-content:center;padding:0;border:0;background:var(--bg2);color:var(--muted);cursor:pointer;opacity:.8;transition:opacity .2s,transform .2s}.toolbar-scroll-arrow.hidden{opacity:0;pointer-events:none;transform:scale(.8)}.toolbar-scroll-arrow:focus-visible{outline:3px solid color-mix(in srgb,var(--gold) 40%,transparent);outline-offset:-3px}.toolbar-scroll-left{left:0;background:linear-gradient(to right,var(--bg2) 60%,transparent)}.toolbar-scroll-right{right:0;background:linear-gradient(to left,var(--bg2) 60%,transparent)}.reader-toolbar{min-height:auto;flex:1;gap:12px;padding:8px 12px}.toolbar-spacer{display:none}.toolbar-group small{font-size:var(--font-size-label)}.font-button,.square-button{width:32px;height:32px}.reader-toolbar .swatch{width:30px;height:30px}.action-button{width:32px;height:32px;padding:0;border-radius:16px}.action-label{display:none}.toolbar-download :global(.download-gate){width:32px;height:32px;min-height:32px;padding:0}.toolbar-download :global(.download-label){display:none}.close-group{display:none}}
  .reader-toolbar button{font-family:inherit}
  .reader-toolbar .action-button{height:auto;font-size:var(--font-size-label);font-weight:500;line-height:normal}
  .reader-toolbar .action-button.active{font-weight:600}
  .reader-toolbar :is(.font-button,.square-button){font-size:13px;font-weight:700;line-height:1}
  .reader-toolbar .square-button{font-family:var(--font-app);font-size:18px;font-weight:900}
  .reader-toolbar .square-button b{font-size:20px;font-weight:900}
  .reader-toolbar .close-button{font-size:15px;line-height:1}
  .reader-toolbar .media-action-btn{width:auto!important;min-width:44px;min-height:36px;padding:5px 12px;border-radius:12px;border:1.5px solid var(--gold);background:var(--gold-light);color:var(--brown);font-weight:700;display:inline-flex;align-items:center;gap:6px}
  .media-btn-text{display:inline!important;font-size:12px;font-weight:700;white-space:nowrap}
  @media(prefers-reduced-motion:reduce){.reader-toolbar button,.toolbar-scroll-arrow,.reader-toolbar .swatch::after{transition:none}.reader-toolbar .swatch:hover{transform:none}}
  @media(max-width:768px){
    .reader-toolbar-wrapper{display:block}
    .toolbar-scroll-arrow{display:none}
    .reader-toolbar{display:flex;flex-direction:column;align-items:stretch;gap:8px;overflow:visible;padding:2px 0;border:0}
    .toolbar-group{min-width:0;flex-direction:row;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:10px;padding:9px 13px;border:1px solid var(--border2);border-radius:14px;background:var(--bg2);box-shadow:0 1px 3px rgba(0,0,0,.02)}
    .toolbar-row{min-width:0;max-width:100%;flex-wrap:wrap;justify-content:flex-end}
    .toolbar-group small{font-size:var(--font-size-label);font-weight:600;letter-spacing:0;text-transform:none;color:var(--text)}
    .reader-toolbar .action-label{display:inline}
    .reader-toolbar .action-button{width:auto;min-width:44px;min-height:44px;height:auto;padding:7px 13px;gap:6px;border-radius:10px;border-color:var(--border)}
    .reader-toolbar .action-button.active{background:var(--gold-light);border-color:var(--gold);color:var(--brown)}
    .reader-toolbar .font-button,.reader-toolbar .square-button{width:44px;height:44px;border-radius:10px}
    .reader-toolbar .font-size{min-width:38px;font-size:13px;font-weight:700}
    .reader-toolbar .swatch{width:44px;height:44px}
    .toolbar-select,.auto-scroll-controls select{max-width:100%;min-width:44px;height:44px;border-radius:10px;font-size:16px;padding:4px 8px}
    .auto-scroll-controls{flex-wrap:wrap;justify-content:flex-end;gap:5px}
    .toolbar-download :global(.download-gate){width:auto;height:auto;min-width:44px;min-height:44px;padding:7px 13px;border-radius:10px}
    .toolbar-download :global(.download-label){display:inline}
    .toolbar-spacer,.close-group{display:none}
  }
</style>
