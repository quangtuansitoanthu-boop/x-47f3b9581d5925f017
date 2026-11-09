<script lang="ts">
  import { modalDialog } from '$lib/browser/modal-dialog';
  import { sessionCover } from '$lib/browser/session-cover';
  import { parsePositionedImage } from '$lib/domain/positioned-image';
  import { handleCoverImgError, normalizeCoverSrc } from '$lib/domain/cover-url';
  import { getLocaleContext } from '$lib/stores/locale.svelte';

  interface Item { id: string; title: string; count: number; image?: string; }
  let { title, items, unit, onOpen, mobileOnly = false, loading = false, error = '' }: {
    title: string; items: Item[]; unit: string; onOpen: (id: string) => void;
    mobileOnly?: boolean; loading?: boolean; error?: string;
  } = $props();
  let open = $state(false);
  const localeStore = getLocaleContext();
  const t = $derived(localeStore.t);
  const format = $derived(new Intl.NumberFormat(localeStore.current === 'en' ? 'en-US' : 'vi-VN'));
</script>

<button class="top-ten-trigger" class:mobile-only={mobileOnly} type="button" aria-haspopup="dialog" aria-expanded={open} onclick={() => open = true}>Top 10</button>
{#if open}
  <dialog data-dialog-glass use:modalDialog aria-label={title} oncancel={() => open = false}>
    <header><h2 tabindex="-1" data-modal-focus>{title}</h2><button type="button" aria-label={t.common.close} onclick={() => open = false}>×</button></header>
    {#if loading}<p role="status">{t.topTen.loading}</p>
    {:else if error}<p role="status">{error}</p>
    {:else if !items.length}<p>{t.topTen.noData}</p>
    {:else}
      <ol>{#each items as item (item.id)}
        {@const cover = parsePositionedImage(normalizeCoverSrc(item.image))}
        <li><button type="button" onclick={() => { open = false; onOpen(item.id); }}>
          {#if cover.src}
            <img
              use:sessionCover={cover.src}
              alt=""
              width="40"
              height="48"
              loading="lazy"
              style:object-position={cover.position}
              onerror={(event) => {
                handleCoverImgError(event.currentTarget as HTMLImageElement, () => {
                  const el = event.currentTarget as HTMLElement;
                  el.style.display = 'none';
                  const fallback = el.nextElementSibling as HTMLElement | null;
                  if (fallback) fallback.style.display = 'grid';
                });
              }}
            />
            <div class="top-ten-thumb-fallback" style="display: none;" aria-hidden="true">📖</div>
          {:else}
            <div class="top-ten-thumb-fallback" aria-hidden="true">📖</div>
          {/if}
          <span><strong>{item.title}</strong>{#if item.count > 0}<small>{format.format(item.count)} {unit}</small>{/if}</span>
        </button></li>
      {/each}</ol>
    {/if}
  </dialog>
{/if}

<style>
  .top-ten-trigger{min-height:44px;padding:8px 16px;border:1px solid var(--border);border-radius:20px;background:var(--card);color:var(--text);font:600 13px var(--font-app);cursor:pointer;white-space:nowrap}
  .top-ten-trigger:hover{background:var(--bg3)}
  button:focus-visible{outline:2px solid var(--gold);outline-offset:2px}
  dialog{width:min(560px,calc(100% - 32px));max-height:80dvh;margin:auto;padding:16px 24px;border:1px solid var(--dialog-surface-border,var(--border));border-radius:16px;background:var(--dialog-surface-background,var(--card));box-shadow:var(--dialog-surface-shadow,var(--shadow-xl));color:var(--text);font-family:var(--font-app);overflow:auto}
  dialog::backdrop{background:rgb(20 17 12 / .65)}
  header{display:flex;align-items:center;justify-content:space-between;gap:12px}
  h2{flex:1;min-width:0;font-size:18px;margin:0}header button{flex:none;width:44px;height:44px;border:0;background:transparent;color:var(--text);font-size:28px;cursor:pointer}
  ol{padding-left:24px;margin:16px 0}li{padding:4px 0;color:var(--text2)}
  li::marker{font-weight:700}li button{display:flex;align-items:center;gap:12px;width:100%;min-height:56px;padding:8px;border:0;border-radius:8px;background:transparent;color:var(--text);text-align:left;cursor:pointer;font:inherit}
  li button:hover{background:var(--bg3)}li button:active{background:var(--gold-muted)}
  img{flex-shrink:0;object-fit:contain;border-radius:4px}strong{display:block;font-size:14px;text-wrap:balance;overflow-wrap:anywhere}small{display:block;margin-top:4px;font-size:12px;color:var(--text2)}
  .top-ten-thumb-fallback{display:grid;place-items:center;width:40px;height:48px;border-radius:4px;background:var(--bg2);border:1px solid var(--border);font-size:18px;flex-shrink:0}
  @media(min-width:901px){.mobile-only{display:none}}
  @media(max-width:900px){dialog{position:fixed;inset:auto 0 0;margin:0;width:100%;max-width:none;box-sizing:border-box;max-height:85dvh;border-radius:16px 16px 0 0;padding-bottom:calc(24px + env(safe-area-inset-bottom))}}
</style>
