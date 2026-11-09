<script lang="ts">
  import type { GuideBlock } from '$lib/content/guide-content';
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import { guideConfirmState } from './guide-confirm-store.svelte';
  import { copyExternalLink, openExternalBrowser } from '$lib/browser/external-links';

  const localeStore = getLocaleContext();
  const t = $derived(localeStore.t.guidePage);

  interface Props {
    blocks: GuideBlock[];
  }

  let { blocks }: Props = $props();
  let linkStatus = $state<{ href: string; message: string; failed: boolean } | null>(null);

  async function handleExternalAction(href: string, copy: boolean) {
    linkStatus = null;
    try {
      if (copy) await copyExternalLink(href);
      else await openExternalBrowser(href);
      if (copy) linkStatus = { href, message: t.linkCopied, failed: false };
    } catch {
      linkStatus = { href, message: copy ? t.linkCopyFailed : t.linkOpenFailed, failed: true };
    }
  }

  function handleLinkClick(event: MouseEvent, block: Extract<GuideBlock, { type: 'link' }>) {
    // Allow modifier clicks (Ctrl+Click, Cmd+Click, Shift+Click, middle click) to open natively in a new tab
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    guideConfirmState.open(block);
  }
</script>

{#each blocks as block}
  {#if block.type === 'paragraph'}
    <p class="guide-paragraph">{block.text}</p>
  {:else if block.type === 'steps'}
    <ol class="guide-steps">
      {#each block.items as item, index}
        <li class="guide-step">
          <span class="guide-step__number" aria-hidden="true">{index + 1}</span>
          <div><h4>{item.title}</h4><p>{item.text}</p></div>
        </li>
      {/each}
    </ol>
  {:else if block.type === 'cards'}
    <div class="guide-cards">
      {#each block.items as item}
        <article class="guide-card"><h4>{item.title}</h4><p>{item.text}</p></article>
      {/each}
    </div>
  {:else if block.type === 'bullets'}
    <div class="guide-bullets">
      {#if block.title}<h4>{block.title}</h4>{/if}
      <ul>{#each block.items as item}<li>{item}</li>{/each}</ul>
    </div>
  {:else if block.type === 'callout'}
    <aside class:guide-callout--warning={block.tone === 'warning'} class="guide-callout">
      <strong>{block.title}</strong>
      <p>{block.text}</p>
    </aside>
  {:else if block.type === 'quote'}
    <figure class="guide-quote">
      <figcaption>{block.title}</figcaption>
      {#each block.lines as line}<blockquote>{line}</blockquote>{/each}
    </figure>
  {:else}
    <div class="guide-link-card">
      <div><strong>{block.label}</strong><p>{block.text}</p></div>
      {#if block.externalActions}
        <div class="guide-link-actions">
          <button type="button" onclick={() => void handleExternalAction(block.href, false)}>{t.openExternalLink} <span aria-hidden="true">↗</span></button>
          <button type="button" onclick={() => void handleExternalAction(block.href, true)}>{t.copyExternalLink}</button>
          {#if linkStatus?.href === block.href}
            <p role="status">{linkStatus.message}</p>
            {#if linkStatus.failed}<p class="guide-link-address">{block.href}</p>{/if}
          {/if}
        </div>
      {:else}
      <a
        href={block.href}
        target={block.href.startsWith('http') ? '_blank' : undefined}
        rel={block.href.startsWith('http') ? 'noreferrer' : undefined}
        onclick={(event) => handleLinkClick(event, block)}
      >
        {block.buttonLabel || t.openLink} <span aria-hidden="true">↗</span>
      </a>
      {/if}
    </div>
  {/if}
{/each}
