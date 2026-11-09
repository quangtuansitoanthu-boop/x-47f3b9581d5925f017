<script lang="ts">
  import { tick } from 'svelte';
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import { quoteCardCopy } from '$lib/i18n/quote-card';
  import { QUOTE_CARD_THEMES, type QuoteThemeKey } from '$lib/domain/quote-card-themes';
  const locale = getLocaleContext();
  const copy = $derived(quoteCardCopy[locale.current === 'en' ? 'en' : 'vi']);
  import { createQuoteCardLayout, justifiedWordPositions } from './quote-card-layout';
  import { modalDialog } from '$lib/browser/modal-dialog';
  import { savePngImage } from '$lib/browser/image-export';
  import { isNativeApp, nativePlatform } from '$lib/browser/native-platform';

  interface Props {
    open: boolean;
    quoteText: string;
    sourceTitle?: string;
    note?: string;
    verse?: boolean;
    onClose: () => void;
  }

  let { open, quoteText, sourceTitle = '', note = '', verse = false, onClose }: Props = $props();

  const THEMES = QUOTE_CARD_THEMES;
  let selectedTheme = $state<QuoteThemeKey>('lotus-dawn');
  let canvasElement = $state<HTMLCanvasElement | null>(null);
  let toastMessage = $state('');
  let isGenerating = $state(false);
  const backgrounds = new Map<QuoteThemeKey, Promise<HTMLImageElement>>();
  const loadedBackgrounds = new Map<QuoteThemeKey, HTMLImageElement>();
  let previewLoading = $state(true);
  let previewFailed = $state(false);
  let retryVersion = $state(0);
  let logoImage: HTMLImageElement | null = null;
  let resourcesPromise: Promise<void> | null = null;

  function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('quote_image_unavailable'));
      image.src = src;
    });
  }

  async function prepareResources(theme: QuoteThemeKey = selectedTheme): Promise<void> {
    if (!canvasElement?.getContext('2d')) return;
    if (!resourcesPromise) {
      const appFont = getComputedStyle(document.documentElement).getPropertyValue('--font-app').trim() || 'sans-serif';
      resourcesPromise = Promise.all([
        loadImage('/images/quote-cards/tu-tap-mark.webp'),
        loadBookerly('italic 400 44px "Bookerly"'),
        loadBookerly('400 26px "Bookerly"'),
        document.fonts?.load(`600 32px ${appFont}`).catch(() => []),
      ]).then(([logo]) => { logoImage = logo; }).catch((error: unknown) => {
        resourcesPromise = null;
        throw error;
      });
    }
    if (!backgrounds.has(theme)) {
      const resource = loadImage(`/images/quote-cards/${theme}.webp`).then(image => {
        loadedBackgrounds.set(theme, image);
        return image;
      }).catch((error: unknown) => { backgrounds.delete(theme); throw error; });
      backgrounds.set(theme, resource);
    }
    await Promise.all([resourcesPromise, backgrounds.get(theme)]);
  }

  async function loadBookerly(declaration: string): Promise<void> {
    if (!document.fonts) throw new Error('quote_font_unavailable');
    const faces = await document.fonts.load(declaration);
    // Không xuất bằng font fallback khi face được duyệt chưa tải thành công.
    if (!faces.some((face) => face.family.replace(/["']/g, '') === 'Bookerly' && face.status === 'loaded')) {
      throw new Error('quote_font_unavailable');
    }
  }

  function showToast(msg: string): void {
    toastMessage = msg;
    setTimeout(() => {
      if (toastMessage === msg) toastMessage = '';
    }, 2800);
  }

  function renderCard(): void {
    if (!canvasElement) return;
    const canvas = canvasElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const theme = THEMES.find((t) => t.id === selectedTheme) || THEMES[0];
    const size = 1080;
    canvas.width = size;
    canvas.height = size;

    const background = loadedBackgrounds.get(theme.id);
    if (!background || !logoImage) throw new Error('quote_image_unavailable');
    ctx.drawImage(background, 0, 0, size, size);
    const tokens = getComputedStyle(document.documentElement);
    ctx.fillStyle = tokens.getPropertyValue(theme.dark ? '--white' : '--copy-paper-ink').trim();

    const readerFont = getComputedStyle(document.documentElement).getPropertyValue('--font-reader').trim() || 'Bookerly, Georgia, serif';
    const quoteFont = (fontSize: number, italic: boolean) => (italic ? 'italic ' : '') + '400 ' + fontSize + 'px ' + readerFont;
    const layout = createQuoteCardLayout(quoteText, sourceTitle, (text, fontSize, italic) => {
      ctx.font = quoteFont(fontSize, italic);
      return ctx.measureText(text).width;
    });
    ctx.font = quoteFont(layout.fontSize, true);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    for (let index = 0; index < layout.lines.length; index += 1) {
      const line = layout.lines[index];
      if (verse) {
        ctx.textAlign = 'center';
        ctx.fillText(line.text, size / 2, layout.top + index * layout.lineHeight);
      } else {
        for (const word of justifiedWordPositions(line, layout.width, (text) => ctx.measureText(text).width)) {
          ctx.fillText(word.text, layout.left + word.x, layout.top + index * layout.lineHeight);
        }
      }
    }

    ctx.font = quoteFont(layout.sourceFontSize, false);
    ctx.textAlign = verse ? 'center' : 'right';
    const sourceTop = layout.top + layout.lines.length * layout.lineHeight + layout.sourceGap;
    for (let index = 0; index < layout.sourceLines.length; index += 1) {
      ctx.fillText(layout.sourceLines[index].text, verse ? size / 2 : layout.right, sourceTop + index * layout.sourceLineHeight);
    }

    // Ghép logo gốc và chữ ở lúc xuất, không dùng logo/chữ do AI vẽ trong nền.
    const appFont = getComputedStyle(document.documentElement).getPropertyValue('--font-app').trim() || 'sans-serif';
    ctx.font = '600 32px ' + appFont;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const logoSize = 96;
    const gap = 14;
    const nameWidth = ctx.measureText('Tu tập').width;
    const brandLeft = (size - logoSize - gap - nameWidth) / 2;
    if (logoImage) ctx.drawImage(logoImage, brandLeft, 886, logoSize, logoSize);
    ctx.fillText('Tu tập', brandLeft + logoSize + gap, 934);
  }

  $effect(() => {
    // Đọc đủ dependency trước await; kết quả tải muộn không vẽ lên màn đã đóng.
    const content = { quote: quoteText, source: sourceTitle, theme: selectedTheme, verse, retryVersion };
    if (!open || !content.quote || !canvasElement || !content.theme) return;
    let cancelled = false;
    previewLoading = true;
    previewFailed = false;
    void tick().then(async () => {
      try {
        await prepareResources(content.theme);
        if (!cancelled) { renderCard(); previewLoading = false; }
      } catch {
        if (!cancelled) { previewLoading = false; previewFailed = true; showToast(copy.error); }
      }
    });
    return () => { cancelled = true; };
  });

  async function downloadImage(): Promise<void> {
    if (!canvasElement) return;
    try {
      isGenerating = true;
      const saved = await savePngImage(await exportBlob(), `trich-dan-quangtu-${Date.now()}.png`);
      if (saved) showToast(isNativeApp() && nativePlatform() === 'android' ? 'Đã lưu ảnh PNG vào máy.' : 'Đã bắt đầu tải ảnh PNG.');
    } catch {
      showToast('Không thể tải ảnh. Vui lòng thử lại.');
    } finally {
      isGenerating = false;
    }
  }

  async function copyImage(): Promise<void> {
    if (!canvasElement) return;
    try {
      isGenerating = true;
      const blob = await exportBlob();
      try {
        if (navigator.clipboard && window.ClipboardItem) {
          await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blob }),
          ]);
          showToast('Đã sao chép ảnh vào bộ nhớ tạm! (Bạn có thể dán ngay vào Zalo, Facebook)');
        } else {
          await downloadImage();
        }
      } catch {
        await downloadImage();
      }
    } catch {
      showToast('Không thể sao chép ảnh.');
    } finally {
      isGenerating = false;
    }
  }

  async function shareImage(): Promise<void> {
    if (!canvasElement) return;
    try {
      isGenerating = true;
      const blob = await exportBlob();
      const file = new File([blob], 'trich-dan-quangtu.png', { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: sourceTitle ? `Trích dẫn: ${sourceTitle}` : 'Trích dẫn hay',
          text: `“${quoteText}” — ${sourceTitle || 'Tu tập cùng Quang Từ (quangtu.vn)'}`,
        });
      } else {
        await copyImage();
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) showToast('Không thể chia sẻ ảnh. Vui lòng thử lại.');
    } finally {
      isGenerating = false;
    }
  }

  async function exportBlob(): Promise<Blob> {
    const canvas = canvasElement;
    const theme = selectedTheme;
    const text = quoteText;
    const source = sourceTitle;
    await prepareResources(theme);
    if (theme !== selectedTheme || text !== quoteText || source !== sourceTitle) throw new Error('quote_changed');
    if (!canvas || canvas !== canvasElement || !open || !canvas.isConnected) throw new Error('canvas_unavailable');
    renderCard();
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!open || canvas !== canvasElement || !canvas.isConnected) reject(new Error('canvas_unavailable'));
        else if (blob) resolve(blob);
        else reject(new Error('png_unavailable'));
      }, 'image/png');
    });
  }

</script>

{#if open}
  <dialog
    data-dialog-glass
    use:modalDialog
    class="quote-card-modal"
    aria-label={copy.title}
    oncancel={(e) => {
      e.preventDefault();
      onClose();
    }}
  >
    <div class="quote-card-dialog" tabindex="-1" data-modal-focus>
      <header class="quote-card-header">
        <div class="quote-card-title-wrap">
          <span class="quote-card-icon" aria-hidden="true">🖼️</span>
          <div>
            <h2>{copy.title}</h2>
            <p>{copy.subtitle}</p>
          </div>
        </div>
        <button type="button" class="quote-card-close-btn" onclick={onClose} aria-label={copy.close}>
          ✕
        </button>
      </header>

      <div class="quote-canvas-preview-wrap" aria-busy={previewLoading}>
        <canvas bind:this={canvasElement} class="quote-canvas" style:visibility={previewLoading || previewFailed ? 'hidden' : 'visible'} aria-label={`${quoteText}${sourceTitle ? ` — ${sourceTitle}` : ''}`}></canvas>
        {#if previewLoading}<p class="quote-preview-state" role="status">{copy.loading}</p>
        {:else if previewFailed}<div class="quote-preview-state"><p role="status">{copy.error}</p><button type="button" class="quote-btn" onclick={() => retryVersion += 1}>{copy.retry}</button></div>{/if}
      </div>
      <div class="quote-card-themes" role="group" aria-label={copy.choose}>
        {#each THEMES as theme (theme.id)}
          <button type="button" class="quote-theme-pill" class:active={selectedTheme === theme.id}
            onclick={() => selectedTheme = theme.id} aria-pressed={selectedTheme === theme.id}>
            <img src={`/images/quote-cards/${theme.id}.webp`} alt="" loading="lazy" decoding="async" />
            <span>{copy.themes[theme.id]}</span>
          </button>
        {/each}
      </div>

      <!-- Actions -->
      <div class="quote-card-actions">
        <button
          type="button"
          class="quote-btn copy-btn"
          onclick={copyImage}
          disabled={isGenerating}
          title="Sao chép ảnh để dán thẳng vào Zalo/Messenger/FB"
        >
          <span>📋</span>
          <span>{copy.copy}</span>
        </button>

        <button
          type="button"
          class="quote-btn download-btn"
          onclick={downloadImage}
          disabled={isGenerating}
          title="Tải ảnh PNG độ nét cao về máy"
        >
          <span>📥</span>
          <span>{copy.save}</span>
        </button>

        <button
          type="button"
          class="quote-btn share-btn"
          onclick={shareImage}
          disabled={isGenerating}
          title="Chia sẻ lên mạng xã hội"
        >
          <span>📤</span>
          <span>{copy.share}</span>
        </button>
      </div>

      {#if toastMessage}
        <div class="quote-card-toast" role="status" aria-live="polite">
          {toastMessage}
        </div>
      {/if}
    </div>
  </dialog>
{/if}

<style>
  .quote-card-modal {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    margin: 0;
    width: min(480px, calc(100% - 32px));
    max-height: min(88dvh, calc(100dvh - env(safe-area-inset-top, 24px) - env(safe-area-inset-bottom, 24px) - 24px));
    padding: 0;
    border: 1.5px solid var(--dialog-surface-border, var(--border));
    border-radius: 24px;
    background: var(--dialog-surface-background, var(--card));
    color: var(--text);
    box-shadow: var(--dialog-surface-shadow, var(--shadow-xl));
    overflow: hidden;
  }

  .quote-card-modal::backdrop {
    background: rgba(18, 14, 10, 0.75);
    backdrop-filter: blur(8px);
  }

  .quote-card-dialog {
    display: flex;
    flex-direction: column;
    padding: 18px 18px calc(18px + env(safe-area-inset-bottom, 0px));
    max-height: min(88dvh, calc(100dvh - env(safe-area-inset-top, 24px) - env(safe-area-inset-bottom, 24px) - 24px));
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    position: relative;
    box-sizing: border-box;
  }

  .quote-card-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 16px;
  }

  .quote-card-title-wrap {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .quote-card-icon {
    font-size: 24px;
  }

  .quote-card-title-wrap h2 {
    margin: 0;
    font-size: var(--font-size-card-title);
    font-weight: 700;
    color: var(--text);
  }

  .quote-card-title-wrap p {
    margin: 2px 0 0;
    font-size:var(--font-size-body);
    color: var(--muted);
  }

  .quote-card-close-btn {
    width: 44px;
    height: 44px;
    flex-shrink: 0;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 50%;
    background: var(--bg3);
    color: var(--text2);
    font-size: 14px;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }

  .quote-card-close-btn:hover {
    background: var(--border);
    color: var(--text);
  }

  .quote-card-themes { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:calc(var(--space-page)*.4); margin-bottom:var(--space-page); }
  .quote-theme-pill { min-width:0; min-height:44px; padding:calc(var(--space-page)*.2); border:1px solid var(--border); border-radius:var(--radius); background:var(--bg2); color:var(--text); font:inherit; font-size:var(--font-size-meta); cursor:pointer; overflow-wrap:anywhere; }
  .quote-theme-pill img { display:block; width:100%; aspect-ratio:1; object-fit:cover; border-radius:var(--radius-sm); }
  .quote-theme-pill.active { border-color:var(--gold); background:var(--gold-light); }
  .quote-theme-pill:focus-visible { outline:2px solid var(--gold); outline-offset:2px; }
  .quote-preview-state { position:absolute; inset:0; display:grid; place-content:center; text-align:center; padding:var(--space-page); color:var(--text); }

  /* Preview Container */
  .quote-canvas-preview-wrap {
    position: relative;
    display: flex;
    justify-content: center;
    align-items: center;
    margin-bottom: 18px;
    padding: 12px;
    background: var(--bg3);
    border-radius: 14px;
  }

  .quote-canvas {
    width: 100%;
    max-width: 360px;
    height: auto;
    aspect-ratio: 1 / 1;
    border-radius: 10px;
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.25);
    display: block;
  }

  /* Action Buttons */
  .quote-card-actions {
    display: flex;
    gap: 8px;
  }

  .quote-btn {
    flex: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 10px 12px;
    border-radius: 12px;
    font-family: inherit;
    font-size:var(--font-size-label);
    font-weight: 700;
    cursor: pointer;
    transition: background 0.15s, transform 0.1s, box-shadow 0.15s;
    white-space: nowrap;
    -webkit-tap-highlight-color: transparent;
  }

  .quote-btn:active {
    transform: scale(0.97);
  }

  .quote-btn.copy-btn {
    border: 1px solid var(--border);
    background: var(--bg2);
    color: var(--text);
  }

  .quote-btn.copy-btn:hover {
    background: var(--bg3);
    border-color: var(--gold);
  }

  .quote-btn.download-btn {
    border: 0;
    background: var(--gold);
    color: var(--on-gold);
    box-shadow: 0 4px 14px rgba(200, 150, 62, 0.3);
  }

  .quote-btn.download-btn:hover {
    background: var(--brown2);
  }

  .quote-btn.share-btn {
    border: 1px solid var(--border);
    background: var(--bg2);
    color: var(--text);
  }

  .quote-btn.share-btn:hover {
    background: var(--bg3);
  }

  /* Toast */
  .quote-card-toast {
    position: absolute;
    bottom: 74px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--brown-dark, #2b1f14);
    color: #fff;
    padding: 8px 16px;
    border-radius: 20px;
    font-size:var(--font-size-meta);
    font-weight: 600;
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
    white-space: nowrap;
    pointer-events: none;
    animation: toast-in 0.25s ease-out;
    z-index: 10;
  }

  @keyframes toast-in {
    from {
      opacity: 0;
      transform: translate(-50%, 8px);
    }
    to {
      opacity: 1;
      transform: translate(-50%, 0);
    }
  }

  @media (max-width: 500px) {
    .quote-card-dialog {
      padding: 16px;
    }
    .quote-card-actions {
      flex-direction: column;
    }
    .quote-btn {
      width: 100%;
      padding: 11px;
    }
  }
  @media (min-width: 900px) {
    .quote-card-modal { width:min(860px,calc(100% - var(--space-page)*2)); }
    .quote-card-dialog { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:var(--space-page); }
    .quote-card-header { grid-column:1/-1; margin-bottom:0; }
    .quote-canvas-preview-wrap { grid-column:1; grid-row:2/4; margin-bottom:0; }
    .quote-card-themes { margin-bottom:0; }
    .quote-card-actions { flex-wrap:wrap; }
  }
</style>
