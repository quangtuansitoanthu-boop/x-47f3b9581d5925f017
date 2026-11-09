<script lang="ts">
  import { browser } from '$app/environment';
  import { createInfiniteQuery } from '@tanstack/svelte-query';
  import { modalDialog } from '$lib/browser/modal-dialog';
  import { fetchMindfulReactions, MINDFUL_COMMUNITY_QUERY_POLICY } from '$lib/browser/mindful-community-client';
  import { serverStateKeys } from '$lib/browser/server-state';
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import { mindfulCommunityCopy } from '$lib/i18n/mindful-community-copy';
  import type { MindfulPost } from '$lib/contracts/mindful-community';
  import type { MindfulNotification } from '$lib/contracts/mindful-notifications';
  let { post, principalId, onClose, requestedPostId = '', showPost = false, online = true, detailState = null, onRetryDetail, focusedNotification = null, missingFocus = false }: {
    post: MindfulPost | null; principalId: string; onClose: () => void; requestedPostId?: string; showPost?: boolean;
    online?: boolean; detailState?: 'loading' | 'unavailable' | 'guest' | null; onRetryDetail?: () => void;
    focusedNotification?: MindfulNotification | null; missingFocus?: boolean;
  } = $props();
  const locale = getLocaleContext();
  const t = $derived(mindfulCommunityCopy[locale.current === 'en' ? 'en' : 'vi']);
  const reactions = createInfiniteQuery(() => {
    const selectedPostId = post?.id ?? requestedPostId;
    return {
    queryKey: serverStateKeys.mindfulCommunity.reactions(principalId, selectedPostId),
    queryFn: ({ pageParam, signal }) => fetchMindfulReactions(selectedPostId, pageParam, { signal }),
    initialPageParam: null as string | null,
    getNextPageParam: page => page.nextCursor ?? undefined,
    enabled: browser && Boolean(post) && online,
    ...MINDFUL_COMMUNITY_QUERY_POLICY,
  }; });
  const items = $derived(reactions.data?.pages.flatMap(page => page.items) ?? []);
  const focusedInPage = $derived(Boolean(focusedNotification && items.some(item => item.createdAt === focusedNotification.createdAt
    && item.nickname === focusedNotification.nickname && item.templateId === focusedNotification.templateId && item.text === focusedNotification.text)));
</script>

<dialog class="mindful-reactions" use:modalDialog aria-labelledby="mindful-reactions-title" oncancel={event => { event.preventDefault(); onClose(); }} onclick={event => { if (event.currentTarget === event.target) onClose(); }}>
  <section class="surface">
    <header><h2 id="mindful-reactions-title">{post ? (post.kind === 'good_deed' ? t.rejoices : t.prayers) : t.mine}</h2><button type="button" onclick={onClose}>{t.close}</button></header>
    {#if showPost && post}<article class="target-post"><strong>{post.nickname}</strong><p>{post.content}</p></article>{/if}
    {#if !online}<p role="status">{t.offline}</p>
    {:else if detailState === 'guest'}<p role="status">{t.guest}</p>
    {:else if detailState === 'loading'}<p role="status">{t.loading}</p>
    {:else if detailState === 'unavailable'}<p role="alert">{t.notificationUnavailable}</p><button type="button" onclick={onRetryDetail}>{t.retry}</button>
    {:else if reactions.isPending}<p role="status">{t.loading}</p>
    {:else if reactions.isError}<p role="alert">{t.failed}</p><button type="button" onclick={() => void reactions.refetch()}>{t.retry}</button>
    {:else if !items.length}<p>{t.noReactions}</p>{/if}
    {#if post && online}
      {#if focusedNotification && !focusedInPage}<article class="focused-reaction"><strong>{focusedNotification.nickname}</strong><p>{focusedNotification.text}</p></article>
      {:else if missingFocus}<p role="status">{t.notificationUnavailable}</p>{/if}
      {#each items as item, index (`${item.createdAt}-${index}`)}<article class:focused-reaction={Boolean(focusedNotification && item.createdAt === focusedNotification.createdAt && item.nickname === focusedNotification.nickname && item.templateId === focusedNotification.templateId && item.text === focusedNotification.text)}><strong>{item.nickname}</strong><p>{item.text}</p></article>{/each}
      {#if reactions.hasNextPage}<button type="button" disabled={reactions.isFetchingNextPage} onclick={() => void reactions.fetchNextPage()}>{reactions.isFetchingNextPage ? t.loading : t.more}</button>{/if}
    {/if}
  </section>
</dialog>

<style>
  .mindful-reactions{position:fixed;inset:0;box-sizing:border-box;width:100%;height:100dvh;max-width:none;max-height:none;margin:0;padding:max(var(--space-page),env(safe-area-inset-top,0px)) max(var(--space-page),env(safe-area-inset-right,0px)) max(var(--space-page),env(safe-area-inset-bottom,0px)) max(var(--space-page),env(safe-area-inset-left,0px));border:0;background:transparent;color:var(--text);display:grid;place-items:center}
  .mindful-reactions::backdrop{background:var(--practice-dialog-backdrop)}
  .surface{box-sizing:border-box;width:100%;max-width:var(--practice-dialog-width);max-height:calc(100dvh - max(var(--space-page),env(safe-area-inset-top,0px)) - max(var(--space-page),env(safe-area-inset-bottom,0px)));overflow:auto;padding:var(--space-page);border:1px solid var(--dialog-glass-border);border-radius:var(--radius-card);background:var(--card)}
  header{display:flex;align-items:center;justify-content:space-between;gap:calc(var(--space-page)/2)}h2{font-size:var(--font-size-card-title)}
  button{font:inherit;min-height:44px;min-width:44px;padding:calc(var(--space-page)/2);border:1px solid var(--border);border-radius:var(--radius-control);background:var(--bg2);color:var(--text);cursor:pointer}button:focus-visible{outline:2px solid var(--gold);outline-offset:2px}button:disabled{opacity:.6}
  article{padding-block:calc(var(--space-page)/2);border-top:1px solid var(--border2)}p{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.65;color:var(--text2)}
  .target-post p{font-family:var(--font-reader);font-size:var(--font-size-input);line-height:1.75}
</style>
