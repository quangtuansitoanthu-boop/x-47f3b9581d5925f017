<script lang="ts">
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import { triggerHaptic } from '$lib/utils/haptics';

  let { compact = false }: { compact?: boolean } = $props();

  const localeStore = getLocaleContext();
  const t = $derived(localeStore.t.phapBao);
  const isEn = $derived(localeStore.current === 'en');

  function handleOpen() {
    triggerHaptic('light');
    window.dispatchEvent(new CustomEvent('quangtu:open-phap-bao'));
  }
</script>

{#if compact}
  <button
    class="pbb-compact"
    type="button"
    onclick={handleOpen}
    aria-label={t?.ariaLabel || (isEn ? 'Free Buddhist Scriptures and Dharma Gifts' : 'Thỉnh Kinh và Pháp Bảo miễn phí')}
  >
    <span class="pbb-compact-icon" aria-hidden="true">🌸</span>
    <span class="pbb-compact-title">{isEn ? 'Request Scriptures & Dharma Gifts' : 'Thỉnh Kinh và Pháp Bảo'}</span>
    <span class="pbb-compact-arrow" aria-hidden="true">→</span>
  </button>
{:else}
  <aside class="pbb-banner" aria-label={t.ariaLabel}>
    <div class="pbb-inner">
      <div class="pbb-content">
        <div class="pbb-badge">
          <span class="badge-icon" aria-hidden="true">🪷</span>
          <span>{t?.badge || 'ẤN TỐNG MIỄN PHÍ'}</span>
        </div>
        <h2 class="pbb-title">{t?.title || 'Thỉnh Kinh & Pháp Bảo Miễn Phí'}</h2>
        <p class="pbb-desc">
          <!-- 108 biến danh hiệu -->
          {t?.descPart1 ?? 'Gieo duyên chép '}<strong>{t?.descHighlight ?? '108 biến danh hiệu'}</strong>{t?.descPart2 ?? ' để thỉnh kinh sách và pháp bảo về nhà tu tập hoàn toàn miễn phí (chỉ 5.000đ phí sàn Shopee).'}
        </p>
      </div>

      <div class="pbb-action">
        <button class="pbb-cta-btn" type="button" onclick={handleOpen}>
          <span>{t?.ctaBtn || 'Chép Danh Hiệu & Thỉnh Ngay'}</span>
          <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </button>
        <div class="pbb-sub-note">{t.subNote}</div>
      </div>
    </div>
  </aside>
{/if}

<style>
  .pbb-compact {
    display: flex;
    align-items: center;
    gap: 14px;
    width: 100%;
    min-width: 0;
    min-height: 64px;
    padding: 12px 18px;
    border: 1px solid rgba(221, 152, 47, 0.45);
    border-radius: 18px;
    background: linear-gradient(110deg, #ce7600, #a84705 65%, #77340d);
    box-shadow: 0 4px 16px rgba(168, 71, 5, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.25);
    color: #fff;
    font-family: var(--font-app);
    text-align: left;
    cursor: pointer;
    box-sizing: border-box;
    transition: transform 0.18s ease, box-shadow 0.18s ease, filter 0.18s ease;
  }
  .pbb-compact:hover {
    filter: brightness(1.06);
    box-shadow: 0 6px 20px rgba(168, 71, 5, 0.35);
  }
  .pbb-compact:active {
    transform: scale(0.985);
  }
  .pbb-compact:focus-visible {
    outline: 3px solid var(--gold);
    outline-offset: 3px;
  }
  .pbb-compact-icon {
    display: grid;
    place-items: center;
    flex: none;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.22);
    backdrop-filter: blur(4px);
    font-size: 22px;
  }
  .pbb-compact-title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 15px;
    font-weight: 700;
    letter-spacing: -0.01em;
  }
  .pbb-compact-arrow {
    font-size: 18px;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.9);
    transition: transform 0.18s ease;
  }
  .pbb-compact:hover .pbb-compact-arrow {
    transform: translateX(3px);
  }
  @media (max-width: 480px) {
    .pbb-compact {
      gap: 10px;
      padding: 10px 14px;
      min-height: 56px;
    }
    .pbb-compact-title {
      font-size: 14px;
    }
  }

  .pbb-banner {
    width: 100%;
    max-width: 100%;
    margin: 0;
    padding: 0;
    border-radius: 18px;
    border: 1.5px solid var(--border);
    background: var(--card);
    box-shadow: var(--shadow);
    box-sizing: border-box;
    overflow: hidden;
    transition: all 0.2s ease;
  }
  .pbb-banner:hover {
    border-color: var(--gold);
    box-shadow: var(--shadow-lg);
  }
  :global([data-theme='dark']) .pbb-banner {
    border-color: rgba(200, 150, 62, 0.28);
  }
  :global([data-theme='dark']) .pbb-banner:hover {
    border-color: var(--gold);
  }

  .pbb-inner {
    background: var(--card);
    border-radius: 16px;
    padding: 16px 20px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    flex-wrap: wrap;
    background-image: radial-gradient(circle at 100% 50%, rgba(200, 150, 62, 0.08) 0%, transparent 60%);
    box-sizing: border-box;
  }

  .pbb-content {
    flex: 1;
    min-width: 0;
    width: 100%;
  }

  .pbb-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: var(--gold-light);
    color: var(--brown);
    border: 1px solid var(--gold-muted);
    font-size: 11px;
    font-weight: 800;
    padding: 3px 10px;
    border-radius: 20px;
    letter-spacing: 0.5px;
    margin-bottom: 8px;
  }
  .badge-icon {
    font-size: 14px;
  }

  .pbb-title {
    margin: 0 0 6px;
    font-size: 20px;
    font-weight: 800;
    color: var(--text);
    letter-spacing: -0.2px;
  }

  .pbb-desc {
    margin: 0;
    font-size: 13.5px;
    color: var(--text2);
    line-height: 1.5;
    text-align: justify;
  }

  .pbb-desc strong {
    color: var(--gold);
  }

  .pbb-action {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 6px;
  }

  .pbb-cta-btn {
    border: none;
    background: linear-gradient(135deg, var(--gold) 0%, #b88228 100%);
    color: #fff;
    font-size: 14px;
    font-weight: 800;
    padding: 12px 22px;
    border-radius: 12px;
    cursor: pointer;
    box-shadow: 0 4px 16px rgba(184, 130, 40, 0.35);
    display: inline-flex;
    align-items: center;
    gap: 10px;
    transition: transform 0.2s, box-shadow 0.2s;
    font-family: inherit;
    white-space: nowrap;
  }

  .pbb-cta-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 22px rgba(184, 130, 40, 0.45);
  }

  .pbb-sub-note {
    font-size: 11px;
    color: var(--muted);
  }

  @media (max-width: 768px) {
    .pbb-banner {
      margin: 0;
    }
    .pbb-inner {
      padding: 16px;
      flex-direction: column;
      align-items: stretch;
      gap: 14px;
    }
    .pbb-title {
      font-size: 17px;
    }
    .pbb-action {
      align-items: stretch;
    }
    .pbb-cta-btn {
      justify-content: center;
      width: 100%;
    }
    .pbb-sub-note {
      text-align: center;
    }
  }

  :global([data-theme='dark']) .pbb-badge {
    background: rgba(212, 168, 75, 0.2);
    border-color: rgba(212, 168, 75, 0.35);
    color: #e8c47e;
  }
  :global([data-theme='dark']) .pbb-sub-note {
    color: var(--text2);
  }
</style>
