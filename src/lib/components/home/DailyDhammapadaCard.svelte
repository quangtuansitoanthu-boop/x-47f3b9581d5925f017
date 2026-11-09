<script lang="ts">
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import {
    getTodayDharmaQuote,
    getRandomDharmaQuote,
    type DailyDharmaQuote,
  } from '$lib/data/daily-dharma-quotes';
  import { triggerHaptic } from '$lib/utils/haptics';
  import { ImagePlus } from '@lucide/svelte';
  import QuoteCardModal from '$lib/components/reader/QuoteCardModal.svelte';
  import { quoteCardCopy } from '$lib/i18n/quote-card';

  const localeStore = getLocaleContext();
  const isEn = $derived(localeStore.current === 'en');

  let quote = $state<DailyDharmaQuote>(getTodayDharmaQuote());
  let copied = $state(false);
  let quoteImageOpen = $state(false);
  let copyTimer: ReturnType<typeof setTimeout> | null = null;

  function shuffleQuote(): void {
    triggerHaptic('light');
    quote = getRandomDharmaQuote(quote.id);
  }

  async function copyQuote(): Promise<void> {
    triggerHaptic('selection');
    const textToCopy = isEn
      ? `"${quote.verseEn}"\n— ${quote.sourceEn} (${quote.themeEn})\nvia Tu Tập App`
      : `"${quote.verseVi}"\n— ${quote.sourceVi} (${quote.themeVi})\nTrích từ Tu Tập App`;

    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(textToCopy);
        copied = true;
        if (copyTimer) clearTimeout(copyTimer);
        copyTimer = setTimeout(() => {
          copied = false;
        }, 2200);
      }
    } catch (err) {
      console.warn('Clipboard copy failed:', err);
    }
  }
</script>

<div class="daily-dhammapada-card" role="region" aria-label={isEn ? 'Daily Quote' : 'Trích dẫn hôm nay'}>
  <!-- Background Lotus Watermark -->
  <div class="watermark-lotus" aria-hidden="true">🪷</div>

  <!-- Header: Title & Category -->
  <div class="card-header">
    <div class="tag-box">
      <span class="tag-sparkle" aria-hidden="true">✨</span>
      <span class="tag-title">{isEn ? 'Daily Quote' : 'Trích dẫn hôm nay'}</span>
      <span class="tag-dot">•</span>
      <span class="tag-theme">{isEn ? quote.themeEn : quote.themeVi}</span>
    </div>

    <div class="action-buttons">
    </div>
  </div>

  <!-- Verse Body -->
  <blockquote class="verse-body">
    <span class="quote-mark mark-open" aria-hidden="true">“</span>
    <p class="verse-text">
      {isEn ? quote.verseEn : quote.verseVi}
    </p>
    <span class="quote-mark mark-close" aria-hidden="true">”</span>
  </blockquote>

  <!-- Source Footer -->
  <footer class="verse-footer">
    <span class="source-dash" aria-hidden="true">—</span>
    <cite class="source-cite">
      {isEn ? quote.sourceEn : quote.sourceVi}
    </cite>
  </footer>

  <button class="create-quote-image" type="button" onclick={() => quoteImageOpen = true}>
    <ImagePlus size={18} aria-hidden="true" />
    {quoteCardCopy[isEn ? 'en' : 'vi'].create}
  </button>

  {#if copied}
    <div class="copied-toast" role="status">
      {isEn ? 'Copied verse to clipboard!' : 'Đã sao chép lời vàng vào bộ nhớ tạm!'}
    </div>
  {/if}
</div>

<QuoteCardModal open={quoteImageOpen} verse
  quoteText={isEn ? quote.verseEn : quote.verseVi}
  sourceTitle={isEn ? quote.sourceEn : quote.sourceVi}
  onClose={() => quoteImageOpen = false} />

<style>
  .create-quote-image { display:flex; align-items:center; justify-content:center; gap:calc(var(--space-page)*.4); width:100%; min-height:44px; margin-top:calc(var(--space-page)*.6); padding:calc(var(--space-page)*.4); border:1px solid var(--gold); border-radius:var(--radius-control); background:var(--card); color:var(--brown); font:inherit; font-size:var(--font-size-label); font-weight:600; cursor:pointer; position:relative; }
  .create-quote-image:focus-visible { outline:2px solid var(--gold); outline-offset:2px; }
  .daily-dhammapada-card {
    position: relative;
    width: 100%;
    padding: 20px 22px 18px;
    border-radius: 20px;
    background: var(--card);
    border: 1px solid color-mix(in srgb, var(--gold) 35%, var(--border));
    box-shadow: 0 4px 18px rgba(0, 0, 0, 0.04);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  /* Watermark Lotus */
  .watermark-lotus {
    position: absolute;
    right: -10px;
    bottom: -15px;
    font-size: 110px;
    line-height: 1;
    opacity: 0.06;
    pointer-events: none;
    user-select: none;
  }

  /* Header */
  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 14px;
  }

  .tag-box {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: var(--font-size-meta);
    font-weight: 700;
  }

  .tag-sparkle {
    font-size: 13px;
    color: var(--gold);
  }

  .tag-title {
    color: var(--gold);
    white-space: nowrap;
    letter-spacing: 0.02em;
    font-weight: 750;
  }

  .tag-dot {
    color: var(--border2);
  }

  .tag-theme {
    color: var(--muted);
  }

  .action-buttons {
    display: flex;
    align-items: center;
    gap: 6px;
  }





  /* Verse Body */
  .verse-body {
    position: relative;
    margin: 0;
    padding: 0 16px;
    text-align: justify;
  }

  .quote-mark {
    position: absolute;
    font-size: 38px;
    line-height: 1;
    font-family: Georgia, serif;
    color: var(--gold);
    opacity: 0.45;
  }

  .mark-open {
    top: -10px;
    left: 0;
  }

  .mark-close {
    right: 0;
    bottom: -15px;
  }

  .verse-text {
    margin: 0;
    font-size: var(--font-size-body);
    line-height: 1.75;
    font-weight: 600;
    color: var(--text);
    white-space: pre-line;
    text-align: center;
    text-wrap: pretty;
    font-style: italic;
    letter-spacing: 0.01em;
  }

  /* Footer */
  .verse-footer {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    margin-top: 14px;
    padding-top: 10px;
    border-top: 1px dashed var(--border2);
  }

  .source-dash {
    color: var(--gold);
  }

  .source-cite {
    font-size: var(--font-size-meta);
    font-weight: 700;
    color: var(--brown, #5c3a21);
    font-style: normal;
  }

  /* Toast Notification */
  .copied-toast {
    position: absolute;
    bottom: 12px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--brown-dark, #2d160b);
    color: #fff;
    font-size: var(--font-size-meta);
    font-weight: 700;
    padding: 5px 14px;
    border-radius: 999px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    animation: toast-fade 0.2s ease;
    white-space: nowrap;
  }

  @keyframes toast-fade {
    from {
      opacity: 0;
      transform: translate(-50%, 8px);
    }
    to {
      opacity: 1;
      transform: translate(-50%, 0);
    }
  }

  @media (max-width: 480px) {
    .daily-dhammapada-card {
      padding: 16px 16px 14px;
    }
    .verse-text {
      font-size: var(--font-size-body);
      line-height: 1.65;
    }
  }
</style>
