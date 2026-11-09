<script lang="ts">
  import { ArrowRight, Radio } from '@lucide/svelte';
  import PracticeEntryArtwork from './PracticeEntryArtwork.svelte';
  import { getPracticeEntryCopy } from '$lib/i18n/practice-entry-cards';
  import { goto } from '$app/navigation';
  import { browser } from '$app/environment';
  import type { PageSessionDTO } from '$lib/server/auth/types';
  import { getLocaleContext } from '$lib/stores/locale.svelte';

  interface Props {
    session: PageSessionDTO;
    currentPath: string;
    alwaysShow?: boolean;
  }

  let { session, currentPath, alwaysShow = true }: Props = $props();
  let dismissedManually = $state(false);

  const localeStore = getLocaleContext();
  const isEn = $derived(localeStore.current === 'en');
  const entryCopy = $derived(getPracticeEntryCopy(isEn));

  const storageKey = $derived(
    session.user?.id ? `tutam_dharma_giving_seen_${session.user.id}` : 'tutam_dharma_giving_seen_guest'
  );

  function isStoredDismissed(): boolean {
    if (!browser || !storageKey) return false;
    try {
      return localStorage.getItem(storageKey) === '1';
    } catch {
      return false;
    }
  }

  const isExpanded = $derived(!dismissedManually && !isStoredDismissed());

  const shouldShow = $derived.by(() => {
    if (currentPath.startsWith('/huong-dan')) return false;
    if (alwaysShow) return true;
    return !browser ? true : isExpanded;
  });

  function markDismissed(): void {
    dismissedManually = true;
    if (browser && storageKey) {
      try {
        localStorage.setItem(storageKey, '1');
      } catch {
        // Ignore localStorage quota errors
      }
    }
  }

  function handleOpenGuide(): void {
    if (!alwaysShow) {
      markDismissed();
    }
    void goto('/huong-dan?phan=tu-hoc#bo-thi-may-nghe-phap');
  }

  function handleDismiss(event: MouseEvent): void {
    event.stopPropagation();
    markDismissed();
  }
</script>

{#if shouldShow}
  <div class="dharma-giving-banner-wrap">
    <aside
      class="dharma-giving-prompt"
      class:permanent={alwaysShow}
      role="region"
      aria-label={isEn ? 'Dharma Giving Guide — Recitation players for spirits' : 'Hướng dẫn bố thí pháp máy nghe pháp độ vong linh'}
      data-dharma-giving-prompt
    >
      {#if !alwaysShow}<button
        type="button"
        class="dharma-giving-close-x"
        aria-label={isEn ? 'Close' : 'Đóng'}
        title={isEn ? 'Close' : 'Đóng'}
        onclick={handleDismiss}
      >
        ✕
      </button>{/if}
      <button
        type="button"
        class="dharma-giving-main-action"
        onclick={handleOpenGuide}
        aria-label={isEn ? 'View guide on offering recitation players to spirits to grow vast merits' : 'Xem hướng dẫn bố thí máy nghe pháp độ vong linh tăng trưởng công đức'}
      >
        <div class="dharma-giving-left">
          <div class="dharma-giving-icon-box" aria-hidden="true">
            <span class="dharma-giving-icon">{#if alwaysShow}<PracticeEntryArtwork name="dharma" />{:else}<Radio size={24} />{/if}</span>
          </div>
          <div class="dharma-giving-body">
            {#if !alwaysShow}<div class="dharma-giving-tag">
              <span class="dharma-giving-dot" aria-hidden="true"></span>
              <span>{isEn ? 'Dharma Giving — Liberating Spirits' : 'Bố Thí Pháp — Độ Vong Linh'}</span>
            </div>
            {/if}<h2 class="dharma-giving-title">
              {alwaysShow ? entryCopy.dharma : isEn ? 'Offering Dharma recitation players' : 'Bố thí máy nghe pháp'}
            </h2>
            {#if !alwaysShow}<p class="dharma-giving-desc">
              {isEn ? 'Place 4G (FAT32) chanting devices at cemeteries, accident sites, hospitals... with download links.' : 'Đặt máy niệm Phật thẻ nhớ 4G (FAT32) tại nghĩa trang, điểm tai nạn, bệnh viện... kèm link tải bài pháp.'}
            </p>{/if}
          </div>
        </div>
      {#if alwaysShow}<span class="dharma-giving-compact-arrow" aria-hidden="true"><ArrowRight size={20} /></span>{/if}
      </button>

      {#if !alwaysShow}<div class="dharma-giving-actions">
        <button
          type="button"
          class="btn-view-dharma"
          data-action="view-dharma-guide"
          onclick={(e) => {
            e.stopPropagation();
            handleOpenGuide();
          }}
          aria-label={isEn ? 'View guide on offering Dharma players' : 'Xem hướng dẫn bố thí máy nghe pháp'}
          title={isEn ? 'View Guide' : 'Xem hướng dẫn'}
        >
          <span class="btn-text">{isEn ? 'View Guide' : 'Xem hướng dẫn'}</span>
          <span class="btn-arrow" aria-hidden="true"><ArrowRight size={20} /></span>
        </button>
        {#if !alwaysShow}<button
          type="button"
          class="btn-dismiss-dharma"
          data-action="dismiss-dharma"
          aria-label={isEn ? 'Later' : 'Để sau'}
          title={isEn ? 'Later' : 'Để sau'}
          onclick={handleDismiss}
        >
          <span class="dismiss-text">{isEn ? 'Later' : 'Để sau'}</span>
          <span class="dismiss-icon" aria-hidden="true">✕</span>
        </button>{/if}
      </div>{/if}
    </aside>
  </div>
{/if}

<style>
  .dharma-giving-banner-wrap {
    width: calc(100% - 32px);
    max-width: 968px;
    margin: 0 auto 12px;
  }

  .dharma-giving-prompt {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    padding: 13px 16px;
    box-sizing: border-box;
    border-radius: var(--radius-card);
    border: 1px solid var(--border);
    background: var(--gold-light);
    box-shadow: 0 2px 8px rgba(60, 40, 10, 0.03);
    color: var(--text, #2c2013);
    font-family: inherit;
    cursor: pointer;
    overflow: hidden;
    transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
  }

  .dharma-giving-close-x {
    position: absolute;
    top: 8px;
    right: 10px;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    border: none;
    background: rgba(0, 0, 0, 0.06);
    color: var(--text2, #6b5d4d);
    font-size: 13px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease;
    z-index: 3;
  }

  .dharma-giving-close-x:hover {
    background: rgba(0, 0, 0, 0.14);
    color: var(--text, #2c2013);
  }

  :global([data-theme='dark']) .dharma-giving-close-x {
    background: rgba(255, 255, 255, 0.08);
    color: #dfd4c0;
  }

  :global([data-theme='dark']) .dharma-giving-close-x:hover {
    background: rgba(255, 255, 255, 0.18);
    color: #fff;
  }

  :global([data-theme='dark']) .dharma-giving-prompt {
    background: var(--bg2);
    border-color: var(--border2);
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.2);
    color: var(--text, #f5eedf);
  }

  .dharma-giving-prompt:hover {
    transform: translateY(-2px);
    border-color: var(--gold);
    box-shadow: var(--shadow);
  }

  .dharma-giving-prompt:hover .btn-arrow {
    transform: translateX(3px);
  }

  .dharma-giving-main-action {
    display: flex;
    flex: 1;
    min-width: 0;
    padding: 0;
    border: none;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .dharma-giving-left {
    display: flex;
    align-items: center;
    gap: 13px;
    flex: 1;
    min-width: 0;
  }

  .dharma-giving-icon-box {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    flex-shrink: 0;
    border-radius: 14px;
    background: color-mix(in srgb, var(--gold) 14%, transparent);
    border: 1px solid color-mix(in srgb, var(--gold) 28%, transparent);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.04);
  }

  :global([data-theme='dark']) .dharma-giving-icon-box {
    background: rgba(200, 150, 62, 0.15);
    border-color: rgba(200, 150, 62, 0.3);
  }

  .dharma-giving-icon {
    font-size: 22px;
    line-height: 1;
  }

  .dharma-giving-body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .dharma-giving-tag {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    width: fit-content;
    max-width: 100%;
    padding: 2px 8px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--gold) 15%, transparent);
    border: 1px solid color-mix(in srgb, var(--gold) 28%, transparent);
    color: var(--brown);
    font-family: inherit;
    font-size: var(--font-size-meta);
    font-weight: 700;
    letter-spacing: 0.3px;
    text-transform: uppercase;
    line-height: 1.3;
  }

  :global([data-theme='dark']) .dharma-giving-tag {
    background: rgba(200, 150, 62, 0.15);
    border-color: rgba(200, 150, 62, 0.3);
    color: var(--gold2);
  }

  .dharma-giving-tag > span:last-child { min-width: 0; overflow-wrap: anywhere; }

  .dharma-giving-dot {
    flex-shrink: 0;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: currentColor;
  }

  .dharma-giving-title {
    margin: 1px 0 0;
    font-family: inherit;
    font-size: var(--font-size-card-title);
    font-weight: 700;
    line-height: 1.35;
    color: var(--brown-dark, #422d16);
    letter-spacing: -0.1px;
  }

  :global([data-theme='dark']) .dharma-giving-title {
    color: var(--gold2, #f5d77f);
  }

  .dharma-giving-desc {
    margin: 1px 0 0;
    font-family: inherit;
    font-size: var(--font-size-body);
    line-height: 1.4;
    color: var(--muted);
  }

  :global([data-theme='dark']) .dharma-giving-desc {
    color: var(--text2);
  }

  .dharma-giving-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .btn-view-dharma {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 44px;
    padding: 0 14px;
    border: none;
    border-radius: 999px;
    background: var(--gold);
    color: var(--on-gold);
    font-family: inherit;
    font-size: var(--font-size-label);
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    box-shadow: 0 2px 8px rgba(200, 150, 62, 0.28);
    transition: transform 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
  }

  .btn-view-dharma:hover {
    background: var(--gold2);
    box-shadow: 0 4px 12px rgba(200, 150, 62, 0.38);
  }

  .btn-arrow {
    display: inline-block;
    font-size: 14px;
    font-weight: 700;
    transition: transform 0.15s ease;
  }

  .btn-dismiss-dharma {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 44px;
    padding: 0 10px;
    border: 1px solid color-mix(in srgb, var(--border, #e4d7c5) 80%, transparent);
    border-radius: 999px;
    background: transparent;
    color: var(--muted);
    font-family: inherit;
    font-size: var(--font-size-body);
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
  }

  .btn-dismiss-dharma:hover {
    background: rgba(0, 0, 0, 0.05);
    color: var(--text, #2c2013);
  }

  :global([data-theme='dark']) .btn-dismiss-dharma {
    border-color: rgba(255, 255, 255, 0.15);
    color: var(--text2);
  }

  :global([data-theme='dark']) .btn-dismiss-dharma:hover {
    background: rgba(255, 255, 255, 0.08);
    color: #fff;
  }

  .dismiss-icon {
    display: none;
  }

  @media (max-width: 600px) {
    .dharma-giving-prompt {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 44px;
      align-items: start;
      padding: var(--radius-control);
      gap: var(--radius);
      border-radius: 18px;
    }

    .dharma-giving-close-x { position: static; grid-column: 2; grid-row: 1; }
    .dharma-giving-prompt.permanent { grid-template-columns: minmax(0, 1fr); }
    .dharma-giving-main-action { grid-column: 1; grid-row: 1; }
    .dharma-giving-left {
      align-items: flex-start;
      gap: var(--radius);
    }

    .dharma-giving-icon-box {
      display: none;
      width: 40px;
      height: 40px;
      border-radius: 12px;
    }

    .dharma-giving-icon {
      font-size: 20px;
    }

    .dharma-giving-tag {
      font-size: var(--font-size-meta);
      padding: 1px 6px;
    }

    .dharma-giving-title {
      font-size: var(--font-size-card-title);
      line-height: 1.3;
    }

    .dharma-giving-desc {
      font-size: var(--font-size-body);
      line-height: 1.35;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .dharma-giving-actions {
      grid-column: 1 / -1;
      justify-content: flex-end;
      gap: var(--radius-sm);
    }

    .btn-view-dharma {
      width: 100%;
      height: 44px;
      padding: 0 var(--radius-control);
      border-radius: var(--radius-control);
      justify-content: center;
      background: color-mix(in srgb, var(--gold) 18%, transparent);
      color: var(--brown-dark);
      box-shadow: none;
    }

    :global([data-theme='dark']) .btn-view-dharma {
      background: rgba(200, 150, 62, 0.18);
      color: var(--gold2);
    }

    .dharma-giving-prompt:hover .btn-view-dharma {
      background: var(--gold);
      color: var(--on-gold);
    }

    .btn-view-dharma .btn-text {
      display: inline;
      font-size: var(--font-size-label);
    }

    .btn-view-dharma .btn-arrow {
      font-size: var(--font-size-card-title);
    }

    /* Nút đóng ở góc giữ cùng hành động; tránh hai dấu đóng trên thẻ nhỏ. */
    .btn-dismiss-dharma {
      display: none;
      width: 44px;
      height: 44px;
      padding: 0;
      border-radius: 50%;
      border: none;
      background: rgba(0, 0, 0, 0.04);
    }

    :global([data-theme='dark']) .btn-dismiss-dharma {
      background: rgba(255, 255, 255, 0.08);
    }

    .btn-dismiss-dharma .dismiss-text {
      display: none;
    }

    .btn-dismiss-dharma .dismiss-icon {
      display: block;
      font-size: var(--font-size-meta);
      line-height: 1;
    }
  }
</style>
