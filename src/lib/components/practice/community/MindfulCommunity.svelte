<script lang="ts">
  import { browser } from '$app/environment';
  import { onMount, untrack } from 'svelte';
  import { createInfiniteQuery, createQuery, useQueryClient, type InfiniteData } from '@tanstack/svelte-query';
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import { getBrowserSessionSnapshot, SESSION_CHANGE_EVENT } from '$lib/stores/session.svelte';
  import { mindfulCommunityCopy } from '$lib/i18n/mindful-community-copy';
  import { personalPracticeCopy } from '$lib/i18n/personal-practice-copy';
  import { MINDFUL_REACTION_TEMPLATES, type MindfulPost, type MindfulPostPage } from '$lib/contracts/mindful-community';
  import type { MindfulNotification, MindfulNotificationPage, MindfulPostContext } from '$lib/contracts/mindful-notifications';
  import { COMMUNITY_BLOCKS_CHANGED_EVENT, type CommunityBlocksChangedDetail } from '$lib/contracts/community-moderation';
  import { fetchMindfulPostContext, fetchMindfulPosts, sendMindfulReaction, deleteMindfulPost, MINDFUL_COMMUNITY_QUERY_POLICY } from '$lib/browser/mindful-community-client';
  import { serverStateKeys } from '$lib/browser/server-state';
  import { getVietnamIsoDate } from '$lib/domain/practice/stats';
  import { countReflectionWords } from '$lib/domain/practice/personal-practice';
  import RosarySelect from '../rosary/RosarySelect.svelte';
  import PracticeConfirmDialog from '../dialog/PracticeConfirmDialog.svelte';
  import MindfulReactions from './MindfulReactions.svelte';
  let { principalId = null, nickname = '', active = true, targetPostId = null, targetReactionId = null, targetIntent = 0, targetOnly = false, targetVisible = true, onTargetClose = () => {} }: {
    principalId?: string | null; nickname?: string; active?: boolean; targetPostId?: string | null;
    targetReactionId?: string | null; targetIntent?: number; targetOnly?: boolean; targetVisible?: boolean; onTargetClose?: () => void;
  } = $props();
  const locale = getLocaleContext();
  const isEn = $derived(locale.current === 'en');
  const reflectionCopy = $derived(personalPracticeCopy[isEn ? 'en' : 'vi']);
  const t = $derived(mindfulCommunityCopy[locale.current === 'en' ? 'en' : 'vi']);
  const queryClient = useQueryClient();
  let tab = $state<'repentance' | 'good_deed' | 'mine'>('repentance');
  let period = $state<'today' | 'all'>('all');
  let today = $state(getVietnamIsoDate());
  let online = $state(browser ? navigator.onLine !== false : true);
  let message = $state('');
  let selected = $state<MindfulPost | null>(null);
  let deleting = $state<MindfulPost | null>(null);
  let viewing = $state<MindfulPost | null>(null);
  let templateId = $state('');
  let busy = $state(false);
  let expandedPosts = $state<Record<string, boolean>>({});
  let controller: AbortController | null = null;
  let generation = 0;
  let midnightTimer: ReturnType<typeof setTimeout> | undefined;
  let targetMode = $state(Boolean(untrack(() => targetPostId)));
  let targetOpen = $state(false);
  const refreshDay = () => { today = getVietnamIsoDate(); };
  function scheduleMidnight() {
    clearTimeout(midnightTimer);
    const nextMidnight = Date.parse(`${getVietnamIsoDate()}T00:00:00+07:00`) + 86_400_000;
    midnightTimer = setTimeout(() => { if (document.visibilityState === 'visible') refreshDay(); scheduleMidnight(); }, Math.max(1, nextMidnight - Date.now()));
  }
  const scope = $derived(principalId ?? 'guest');
  function cachedTarget(): { data: MindfulPostContext; updatedAt: number } | undefined {
    if (!principalId || !targetPostId) return;
    let notification: MindfulNotification | undefined;
    if (targetReactionId) {
      const inbox = queryClient.getQueryData<InfiniteData<MindfulNotificationPage & { principal: string }>>(serverStateKeys.mindfulCommunity.notifications(principalId));
      notification = inbox?.pages.filter(page => page.principal === principalId).flatMap(page => page.items)
        .find(item => item.id === targetReactionId && item.postId === targetPostId);
    }
    const queries = [
      ...queryClient.getQueryCache().findAll({ queryKey: serverStateKeys.mindfulCommunity.post(principalId, targetPostId) }),
      ...queryClient.getQueryCache().findAll({ queryKey: [...serverStateKeys.mindfulCommunity.principal(principalId), 'posts'] }),
    ];
    for (const query of queries) {
      if (query.state.isInvalidated || query.state.fetchStatus !== 'idle'
        || Date.now() - query.state.dataUpdatedAt >= MINDFUL_COMMUNITY_QUERY_POLICY.staleTime) continue;
      const data = query.state.data as { id?: string; post?: MindfulPost; notification?: MindfulNotification | null; pages?: MindfulPostPage[] } | undefined;
      const post: MindfulPost | undefined = data?.id === targetPostId ? query.state.data as MindfulPost
        : data?.post ?? data?.pages?.flatMap(page => page.items).find(item => item.id === targetPostId);
      const focused = notification ?? (data?.notification?.id === targetReactionId ? data.notification : undefined);
      if (post?.id === targetPostId && post.isOwn && post.status === 'published'
        && typeof post.content === 'string' && typeof post.nickname === 'string' && typeof post.viewerReacted === 'boolean'
        && ['repentance', 'good_deed'].includes(post.kind) && Number.isFinite(Date.parse(post.createdAt)) && Number.isFinite(post.reactionCount)
        && (!targetReactionId || focused)) {
        return { data: { post, notification: focused ?? null }, updatedAt: query.state.dataUpdatedAt };
      }
    }
  }
  const targetQuery = createQuery<MindfulPostContext>(() => {
    const cached = cachedTarget();
    const postId = targetPostId, reactionId = targetReactionId;
    return {
      queryKey: [...serverStateKeys.mindfulCommunity.post(scope, postId ?? ''), 'notification', reactionId ?? ''],
      queryFn: ({ signal }) => fetchMindfulPostContext(postId!, reactionId, { signal }),
      initialData: cached?.data, initialDataUpdatedAt: cached?.updatedAt,
      enabled: browser && active && targetMode && Boolean(principalId && targetPostId) && online,
      ...MINDFUL_COMMUNITY_QUERY_POLICY,
    };
  });
  const targetPost = $derived(online && principalId && targetQuery.data?.post?.id === targetPostId
    && targetQuery.data.post.isOwn && targetQuery.data.post.status === 'published' ? targetQuery.data.post : null);
  const targetNotification = $derived(targetPost && targetQuery.data?.notification?.id === targetReactionId
    ? targetQuery.data.notification : null);
  $effect(() => {
    targetPostId; targetReactionId; targetIntent;
    untrack(() => {
      targetMode = Boolean(targetPostId);
      targetOpen = Boolean(targetPostId) && targetVisible;
      if (targetPostId) { tab = 'mine'; period = 'all'; viewing = null; }
    });
  });
  $effect(() => { if (!targetVisible) targetOpen = false; });
  function closeTarget() { targetOpen = false; onTargetClose(); }
  function selectTab(value: typeof tab) { targetMode = false; targetOpen = false; tab = value; message = ''; onTargetClose(); }
  function selectPeriod(value: string) {
    if (value !== 'all' && value !== 'today') return;
    targetMode = false; targetOpen = false; refreshDay(); period = value; message = ''; onTargetClose();
  }
  const posts = createInfiniteQuery(() => {
    const selectedTab = tab, selectedPeriod = period;
    return {
    queryKey: serverStateKeys.mindfulCommunity.posts(scope, selectedTab, selectedPeriod === 'today' ? today : undefined),
    queryFn: ({ pageParam, signal }) => fetchMindfulPosts({ kind: selectedTab === 'mine' ? undefined : selectedTab, mine: selectedTab === 'mine', period: selectedPeriod, after: pageParam }, { signal }),
    initialPageParam: null as string | null,
    getNextPageParam: page => page.nextCursor ?? undefined,
    enabled: browser && active && !targetMode && online && (tab !== 'mine' || Boolean(principalId)),
    ...MINDFUL_COMMUNITY_QUERY_POLICY,
  }; });
  const items = $derived(targetMode ? (targetPost ? [targetPost] : [])
    : [...(posts.data?.pages.flatMap(page => page.items) ?? [])].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.id.localeCompare(a.id)));
  const dateFormat = $derived(new Intl.DateTimeFormat(locale.current === 'en' ? 'en-GB' : 'vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }));
  const templates = $derived(selected ? MINDFUL_REACTION_TEMPLATES[selected.kind].map(item => ({ value: item.id, label: item.text })) : []);
  const enabled = $derived(posts.data?.pages[0]?.enabled !== false);
  function updatePosts(update: (post: MindfulPost) => MindfulPost | null) {
    queryClient.setQueriesData<InfiniteData<MindfulPostPage>>({ queryKey: [...serverStateKeys.mindfulCommunity.principal(scope), 'posts'] }, data => data && ({
      ...data, pages: data.pages.map(page => ({ ...page, items: page.items.flatMap(item => { const next = update(item); return next ? [next] : []; }) })),
    }));
  }
  function chooseReaction(post: MindfulPost) {
    message = '';
    if (!principalId) { message = t.guest; return; }
    if (!nickname.trim()) { message = t.noNickname; return; }
    if (post.viewerReacted || busy) return;
    selected = post;
    templateId = MINDFUL_REACTION_TEMPLATES[post.kind][0].id;
  }
  async function mutate(remove = false) {
    const post = remove ? deleting : selected;
    if (!post || !principalId || busy || !online) return;
    const captured = principalId;
    const revision = generation;
    const operation = new AbortController(); controller = operation; busy = true; message = '';
    try {
      if (remove) {
        await deleteMindfulPost(post.id, { signal: operation.signal });
        if (captured !== principalId || revision !== generation || operation.signal.aborted) return;
        await Promise.all([
          queryClient.cancelQueries({ queryKey: [...serverStateKeys.mindfulCommunity.principal(captured), 'posts'] }),
          queryClient.cancelQueries({ queryKey: serverStateKeys.mindfulCommunity.post(captured, post.id) }),
          queryClient.cancelQueries({ queryKey: serverStateKeys.mindfulCommunity.notifications(captured) }),
          queryClient.cancelQueries({ queryKey: serverStateKeys.mindfulCommunity.reactions(captured, post.id) }),
        ]);
        if (captured !== principalId || revision !== generation || operation.signal.aborted) return;
        updatePosts(item => item.id === post.id ? null : item);
        queryClient.setQueriesData<{ post: MindfulPost | null; notification?: MindfulNotification | null }>(
          { queryKey: serverStateKeys.mindfulCommunity.post(captured, post.id) }, () => ({ post: null, notification: null }));
        queryClient.setQueriesData<InfiniteData<MindfulNotificationPage & { principal: string }>>(
          { queryKey: serverStateKeys.mindfulCommunity.notifications(captured) }, data => data && ({
            ...data, pages: data.pages.map(page => ({ ...page, items: page.items.filter(item => item.postId !== post.id) })),
          }));
        queryClient.removeQueries({ queryKey: serverStateKeys.mindfulCommunity.reactions(captured, post.id) });
        if (targetPostId === post.id) { targetOpen = false; onTargetClose(); }
      } else {
        const result = await sendMindfulReaction(post.id, { templateId, nickname: nickname.trim() }, { signal: operation.signal });
        if (captured !== principalId || revision !== generation || operation.signal.aborted) return;
        await queryClient.cancelQueries({ queryKey: [...serverStateKeys.mindfulCommunity.principal(captured), 'posts'] });
        if (captured !== principalId || revision !== generation || operation.signal.aborted) return;
        updatePosts(item => item.id === result.postId ? { ...item, reactionCount: result.reactionCount, viewerReacted: true } : item);
        void queryClient.invalidateQueries({ queryKey: serverStateKeys.mindfulCommunity.reactions(scope, post.id), exact: true, refetchType: 'none' });
      }
      selected = null; deleting = null;
    } catch {
      if (captured === principalId && revision === generation && !operation.signal.aborted) message = t.failed;
    } finally { if (captured === principalId && revision === generation) busy = false; }
  }
  $effect(() => { scope; generation++; selected = null; deleting = null; viewing = null; message = ''; busy = false; controller?.abort(); });
  onMount(() => {
    let previousScope = scope;
    const network = () => { online = navigator.onLine !== false; refreshDay(); };
    const visibility = () => { if (document.visibilityState === 'visible') { refreshDay(); scheduleMidnight(); } };
    const sessionChanged = () => {
      const current = getBrowserSessionSnapshot().user?.id ?? 'guest';
      if (current !== previousScope) { generation++; controller?.abort(); busy = false; message = ''; selected = null; deleting = null; viewing = null; void queryClient.cancelQueries({ queryKey: serverStateKeys.mindfulCommunity.principal(previousScope) }); queryClient.removeQueries({ queryKey: serverStateKeys.mindfulCommunity.principal(previousScope) }); previousScope = current; }
    };
    const blocksChanged = (event: Event) => {
      const detail = (event as CustomEvent<CommunityBlocksChangedDetail>).detail;
      if (!detail || detail.principalId !== principalId) return;
      generation++; controller?.abort(); busy = false; message = '';
      selected = null; deleting = null; viewing = null;
    };
    network(); scheduleMidnight(); document.addEventListener('visibilitychange', visibility); window.addEventListener('online', network); window.addEventListener('offline', network); window.addEventListener(SESSION_CHANGE_EVENT, sessionChanged);
    window.addEventListener(COMMUNITY_BLOCKS_CHANGED_EVENT, blocksChanged);
    return () => { clearTimeout(midnightTimer); controller?.abort(); document.removeEventListener('visibilitychange', visibility); window.removeEventListener('online', network); window.removeEventListener('offline', network); window.removeEventListener(SESSION_CHANGE_EVENT, sessionChanged); window.removeEventListener(COMMUNITY_BLOCKS_CHANGED_EVENT, blocksChanged); };
  });
</script>

<section class="mindful-community" aria-labelledby="mindful-community-title" hidden={targetOnly}>
  <h2 id="mindful-community-title">{t.title}</h2><p class="description">{t.privacy}</p>
  <nav aria-label={t.title}>{#each [{ id: 'repentance', label: t.repentance }, { id: 'good_deed', label: t.good }, { id: 'mine', label: t.mine }] as item (item.id)}<button type="button" aria-pressed={tab === item.id} onclick={() => selectTab(item.id as typeof tab)}>{item.label}</button>{/each}</nav>
  <div class="periods"><RosarySelect label={t.period} accessibleLabel={t.period} value={period} options={[{ value: 'all', label: t.all }, { value: 'today', label: t.today }]} onChange={selectPeriod} /></div>
  {#if !online}<p role="status">{t.offline}</p>{/if}
  {#if !principalId}<p>{t.guest}</p>{/if}
  {#if message}<p class="error" role="alert">{message}</p>{/if}
  {#if !enabled}<p>{t.disabled}</p>
  {:else if !targetMode && posts.isPending && (tab !== 'mine' || principalId) && online}<p role="status">{t.loading}</p>
  {:else if !targetMode && posts.isError}<p class="error" role="alert">{posts.error instanceof Error && posts.error.message === 'mindful_community_unavailable' ? t.unavailable : t.failed}</p><button type="button" disabled={!online} onclick={() => void posts.refetch()}>{t.retry}</button>
  {:else if !items.length && (tab !== 'mine' || principalId)}<p>{t.empty}</p>{/if}
  {#each items as post (post.id)}
    <article><header><div class="post-author"><span>{t.nickname}</span><strong>{post.nickname}</strong></div><time datetime={post.createdAt}>{dateFormat.format(new Date(post.createdAt))}</time></header>
      <div class="post-body">
        <span class="post-kind">{post.kind === 'good_deed' ? t.good : t.repentance}</span>
        {#if post.content.length <= 280 || expandedPosts[post.id]}
          <p class="content">{post.content}</p>
        {:else}
          <p class="content">{post.content.slice(0, 260)}…</p>
        {/if}
        {#if post.content.length > 280}
          <button
            type="button"
            class="expand-post-btn"
            onclick={() => (expandedPosts[post.id] = !expandedPosts[post.id])}
          >
            {expandedPosts[post.id]
              ? reflectionCopy.collapse
              : reflectionCopy.readMore.replace('{0}', String(countReflectionWords(post.content)))}
          </button>
        {/if}
      </div>
      {#if post.status === 'published'}<div class="actions"><button type="button" disabled={post.viewerReacted || busy || !online || !principalId} onclick={() => chooseReaction(post)}>{post.viewerReacted ? (post.kind === 'good_deed' ? t.rejoiced : t.prayed) : (post.kind === 'good_deed' ? t.rejoice : t.pray)}</button><button type="button" disabled={!online} onclick={() => viewing = post}>{post.kind === 'good_deed' ? t.rejoices : t.prayers} · {post.reactionCount}</button></div>{:else}<p>{t.hidden}</p>{/if}
      {#if post.isOwn}<button class="remove" type="button" disabled={busy || !online} onclick={() => deleting = post}>{t.delete}</button>{/if}
    </article>
  {/each}
  {#if !targetMode && posts.hasNextPage}<button class="more" type="button" disabled={posts.isFetchingNextPage || !online} onclick={() => void posts.fetchNextPage()}>{posts.isFetchingNextPage ? t.loading : t.more}</button>{/if}
</section>
<PracticeConfirmDialog open={Boolean(selected)} title={selected?.kind === 'good_deed' ? t.rejoice : t.pray} description={t.once} cancelLabel={t.cancel} confirmLabel={t.send} {busy} onCancel={() => { if (!busy) selected = null; }} onConfirm={() => void mutate()}>
  {#snippet children()}<RosarySelect label={t.select} accessibleLabel={t.select} value={templateId} options={templates} onChange={value => { templateId = value; }} />{#if message}<p class="error" role="alert">{message}</p>{/if}{/snippet}
</PracticeConfirmDialog>
<PracticeConfirmDialog open={Boolean(deleting)} title={t.deleteTitle} description={t.deleteDescription} cancelLabel={t.cancel} confirmLabel={t.delete} {busy} onCancel={() => { if (!busy) deleting = null; }} onConfirm={() => void mutate(true)} />
{#if viewing}<MindfulReactions post={viewing} principalId={scope} {online} onClose={() => viewing = null} />{/if}
{#if targetMode && targetOpen && targetPostId}
  <MindfulReactions post={targetPost} principalId={scope} requestedPostId={targetPostId} showPost={true} {online}
    focusedNotification={targetNotification} missingFocus={Boolean(targetPost && targetReactionId && !targetNotification)}
    detailState={!principalId ? 'guest' : targetQuery.isError || (targetQuery.isSuccess && !targetPost) ? 'unavailable' : targetPost ? null : 'loading'}
    onRetryDetail={() => void targetQuery.refetch()} onClose={closeTarget} />
{/if}

<style>
  .mindful-community{font-family:var(--font-app);color:var(--text);padding-block:var(--space-page)}h2{font-size:var(--font-size-section-title)}.description{color:var(--text2);font-size:var(--font-size-label);line-height:1.6}
  nav{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:calc(var(--space-page)/3);margin-block:var(--space-page)}
  .periods{margin-block:calc(var(--space-page)/2)}
  button{font:inherit;min-height:44px;min-width:44px;padding:calc(var(--space-page)/2);border:1px solid var(--border);border-radius:var(--radius-control);background:var(--bg2);color:var(--text);cursor:pointer;overflow-wrap:anywhere;box-shadow:var(--glass-button-shadow)}button:focus-visible{outline:2px solid var(--gold);outline-offset:2px}button:disabled{opacity:.6;cursor:default}nav button{font-size:var(--font-size-label);font-weight:700}nav button[aria-pressed=true]{background:var(--gold-light);border-color:var(--gold);color:var(--brown)}
  article{overflow:hidden;margin-block:var(--space-page);border:1px solid var(--dialog-glass-border);border-radius:var(--radius-card);background:var(--dialog-glass-background);box-shadow:var(--shadow)}
  header{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:calc(var(--space-page)/2);padding:calc(var(--space-page)*.75) var(--space-page);background:var(--bg2);border-bottom:1px solid var(--border2)}
  .post-author{display:grid;min-width:0;flex:1;gap:calc(var(--space-page)*.2)}.post-author span{font-size:var(--font-size-meta);color:var(--text2)}header strong{font-size:var(--font-size-card-title);color:var(--brown);overflow-wrap:anywhere}time{color:var(--text2);font-size:var(--font-size-meta);white-space:nowrap}
  .post-body{padding:var(--space-page)}.post-kind{font-size:var(--font-size-label);font-weight:700;color:var(--text2)}
  .content{margin:calc(var(--space-page)*.5) 0 0;white-space:pre-wrap;overflow-wrap:anywhere;font-family:var(--font-reader);font-size:var(--font-size-input);font-weight:400;line-height:1.75;text-align:start;color:var(--text)}
  .expand-post-btn{min-height:44px;padding:calc(var(--space-page)*.2) 0;background:transparent;border:none;color:var(--brown,var(--gold));font-weight:700;font-size:var(--font-size-label);cursor:pointer;text-align:left;box-shadow:none;display:inline-flex;align-items:center}
  .actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:calc(var(--space-page)/2);padding:0 var(--space-page) var(--space-page)}.actions button{font-size:var(--font-size-label)}.remove{margin:0 var(--space-page) var(--space-page);color:var(--danger-text)}.error{color:var(--danger-text);overflow-wrap:anywhere}.more{width:100%}
</style>
