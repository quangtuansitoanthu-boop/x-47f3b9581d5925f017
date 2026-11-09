<script lang="ts">
  import { browser } from '$app/environment';
  import { onMount, untrack } from 'svelte';
  import { COMMUNITY_BLOCKS_CHANGED_EVENT, type CommunityBlocksChangedDetail } from '$lib/contracts/community-moderation';
  import { LockKeyhole } from '@lucide/svelte';
  import { createQuery, useQueryClient } from '@tanstack/svelte-query';
  import {
    fetchPracticeCampaigns,
    fetchPracticeLeaderboard,
    joinPracticeCampaign,
    leavePracticeCampaign,
    withCampaignMembership,
    PRACTICE_COMMUNITY_QUERY_POLICY,
    type PracticeCampaign,
    type PracticeCampaignListData,
    type PracticeLeaderboardData,
  } from '$lib/browser/practice-community';
  import { serverStateKeys } from '$lib/browser/server-state';
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import { getSessionContext } from '$lib/stores/session.svelte';
  import PracticeCampaigns from './PracticeCampaigns.svelte';
  import PracticeLeaderboard from './PracticeLeaderboard.svelte';

  interface Props {
    initialCampaigns: PracticeCampaignListData;
    initialLeaderboard: PracticeLeaderboardData;
  }

  let { initialCampaigns, initialLeaderboard }: Props = $props();
  const localeStore = getLocaleContext();
  const sessionStore = getSessionContext();
  const queryClient = useQueryClient();
  const principal = $derived(sessionStore.value.authenticated ? sessionStore.value.user?.id ?? 'anonymous' : 'anonymous');
  const initialPrincipal = untrack(() => principal);
  let initialProjectionValid = $state(true);
  let previousPrincipal = initialPrincipal;
  let blockedAuthors = $state<string[]>([]);
  let blockedPrincipal = $state(initialPrincipal);
  const activeBlocks = $derived(blockedPrincipal === principal ? blockedAuthors : []);
  const isEn = $derived(localeStore.current === 'en');
  const isUserAuthenticated = $derived(Boolean(sessionStore.value.authenticated && sessionStore.value.user));

  const leaderboardQuery = createQuery(() => ({
    ...PRACTICE_COMMUNITY_QUERY_POLICY,
    queryKey: serverStateKeys.practiceCommunity.leaderboardForPrincipal(principal),
    queryFn: ({ signal }) => fetchPracticeLeaderboard(fetch, signal),
    initialData: initialProjectionValid && principal === initialPrincipal ? initialLeaderboard : undefined,
    initialDataUpdatedAt: 0,
    enabled: browser && sessionStore.initialResolutionComplete !== false,
  }));
  const campaignsQuery = createQuery(() => ({
    ...PRACTICE_COMMUNITY_QUERY_POLICY,
    queryKey: serverStateKeys.practiceCommunity.campaigns(principal),
    queryFn: ({ signal }) => fetchPracticeCampaigns(fetch, { signal }),
    initialData: initialProjectionValid && principal === initialPrincipal ? initialCampaigns : undefined,
    initialDataUpdatedAt: 0,
    enabled: browser && sessionStore.initialResolutionComplete !== false,
  }));
  const leaderboardData = $derived(leaderboardQuery.data ?? (initialProjectionValid && principal === initialPrincipal ? initialLeaderboard : { ...initialLeaderboard, ranking: [] }));
  const leaderboard = $derived({ ...leaderboardData, ranking: leaderboardData.ranking.filter(member => !member.authorId || !activeBlocks.includes(member.authorId)) });
  const campaigns = $derived(campaignsQuery.data?.campaigns ?? (initialProjectionValid && principal === initialPrincipal ? initialCampaigns.campaigns : []));
  const communityEnabled = $derived(
    leaderboard.enabled !== false && (campaignsQuery.data ?? initialCampaigns).enabled !== false,
  );
  const refreshError = $derived(leaderboardQuery.error || campaignsQuery.error
    ? (isEn ? 'Community data could not be refreshed. Showing last cached data.' : 'Dữ liệu cộng đồng chưa thể làm mới. Bản gần nhất vẫn được giữ lại.')
    : '');

  let busyCampaignId = $state<string | null>(null);
  let actionError = $state('');
  let errorCampaignId = $state<string | null>(null);

  $effect(() => {
    if (previousPrincipal === principal) return;
    const old = previousPrincipal;
    previousPrincipal = principal;
    initialProjectionValid = false;
    void queryClient.cancelQueries({ queryKey: serverStateKeys.practiceCommunity.leaderboardForPrincipal(old), exact: true });
    queryClient.removeQueries({ queryKey: serverStateKeys.practiceCommunity.leaderboardForPrincipal(old), exact: true });
    void queryClient.cancelQueries({ queryKey: serverStateKeys.practiceCommunity.campaigns(old), exact: true });
    queryClient.removeQueries({ queryKey: serverStateKeys.practiceCommunity.campaigns(old), exact: true });
    blockedAuthors = []; blockedPrincipal = principal;
    actionError = ''; errorCampaignId = null;
  });
  onMount(() => {
    const changed = (event: Event) => {
      const detail = (event as CustomEvent<CommunityBlocksChangedDetail>).detail;
      if (!detail?.blocked || detail.principalId !== principal) return;
      blockedPrincipal = principal;
      blockedAuthors = [...new Set([...blockedAuthors, detail.authorId])];
      const queryKey = serverStateKeys.practiceCommunity.leaderboardForPrincipal(principal);
      void queryClient.cancelQueries({ queryKey, exact: true });
      queryClient.setQueryData<PracticeLeaderboardData>(queryKey, current => current ? { ...current, ranking: current.ranking.filter(member => member.authorId !== detail.authorId) } : undefined);
      void queryClient.invalidateQueries({ queryKey, exact: true, refetchType: 'none' });
    };
    window.addEventListener(COMMUNITY_BLOCKS_CHANGED_EVENT, changed);
    return () => window.removeEventListener(COMMUNITY_BLOCKS_CHANGED_EVENT, changed);
  });

  function requestLogin(): void {
    if (!isUserAuthenticated) {
      window.dispatchEvent(new CustomEvent('quangtu:login-required'));
    }
  }

  async function handleMembership(campaign: PracticeCampaign): Promise<void> {
    if (busyCampaignId) return;
    if (!isUserAuthenticated) {
      window.dispatchEvent(new CustomEvent('quangtu:login-required'));
      return;
    }
    busyCampaignId = campaign.id;
    errorCampaignId = campaign.id;
    actionError = '';
    const owner = principal;
    try {
      if (campaign.joined) {
        await leavePracticeCampaign(campaign.id);
      } else {
        await joinPracticeCampaign(campaign.id);
      }
      if (principal !== owner) return;
      queryClient.setQueryData<PracticeCampaignListData>(
        serverStateKeys.practiceCommunity.campaigns(owner),
        (current) => withCampaignMembership(current ?? initialCampaigns, campaign.id, !campaign.joined),
      );
    } catch (e) {
      if (principal === owner) actionError = e instanceof Error ? e.message : (isEn ? 'Could not join. Please try again.' : 'Không thể tham gia. Vui lòng thử lại.');
    } finally {
      busyCampaignId = null;
    }
  }
</script>

<main class="practice-community-public practice-theme" data-practice="community" aria-busy={leaderboardQuery.isFetching || campaignsQuery.isFetching}>
  <header>
    <div>
      <a
        href="/tu-tap"
        onclick={(event) => {
          if (typeof window !== 'undefined' && window.history.length > 1) {
            event.preventDefault();
            window.history.back();
          }
        }}
      >{isEn ? '← Back to Practice' : '← Về trang Tu tập'}</a>
      <span>{isEn ? 'VOLUNTARY SANGHA COMMUNITY' : 'CỘNG ĐỒNG TỰ NGUYỆN'}</span>
      <h1>{isEn ? 'Diligent Practice Together' : 'Cùng nhau tinh tấn'}</h1>
      <p>{isEn ? 'Only members who voluntarily opt into public sharing appear here. Personal logs and individual progress remain private.' : 'Chỉ những thành viên chủ động bật chia sẻ mới xuất hiện. Nhật ký và tiến độ riêng không được hiển thị ở đây.'}</p>
    </div>
    {#if !isUserAuthenticated}
      <aside>
        <LockKeyhole aria-hidden="true" size={22} strokeWidth={1.8} />
        <div><strong>{isEn ? 'Your progress is always private' : 'Tiến độ của bạn luôn riêng tư'}</strong><small>{isEn ? 'Log in to view your calendar, streak days, and verified milestones.' : 'Đăng nhập để xem nhật lịch, chuỗi ngày và thành tựu đã xác minh.'}</small></div>
        <button type="button" onclick={requestLogin}>{isEn ? 'Log in to view progress' : 'Đăng nhập để xem tiến độ'}</button>
      </aside>
    {/if}
  </header>

  {#if refreshError}<p class="practice-community-public__notice" role="status">{refreshError}</p>{/if}

  {#if communityEnabled}
    <PracticeLeaderboard {leaderboard} presence={null} principalId={principal} />
    <PracticeCampaigns {campaigns} {busyCampaignId} {errorCampaignId} errorMessage={actionError} authenticated={isUserAuthenticated} onMembership={handleMembership} />
  {:else}
    <p class="practice-community-public__notice" role="status">{isEn ? 'Practice community features are temporarily paused.' : 'Tính năng cộng đồng tu tập đang tạm dừng.'}</p>
  {/if}
</main>

<style>
  .practice-community-public{--pc-space-1:4px;--pc-space-2:8px;--pc-space-3:12px;--pc-space-4:16px;--pc-space-5:24px;--pc-space-6:32px;--pc-space-7:48px;--pc-space-8:64px;--pc-radius-xs:4px;--pc-radius:10px;--pc-radius-lg:16px;--pc-radius-pill:999px;--pc-type-0:11px;--pc-type-1:13px;--pc-type-2:16px;--pc-type-3:20px;--pc-type-4:24px;--pc-type-5:40px;--pc-ease:cubic-bezier(.25,1,.5,1);display:grid;width:min(1080px,calc(100% - 48px));margin:0 auto;padding:var(--pc-space-7) 0 var(--pc-space-5);gap:var(--pc-space-7);color:var(--text);font-family:var(--font-app)}
  .practice-community-public>header{display:grid;align-items:end;padding-bottom:var(--pc-space-6);border-bottom:1px solid var(--border);grid-template-columns:minmax(0,1.4fr) minmax(300px,.6fr);gap:var(--pc-space-7)}
  header>div>a{display:inline-flex;min-height:44px;align-items:center;color:var(--brown);font-size:var(--pc-type-1);font-weight:700;text-decoration:none;transition:transform .2s var(--pc-ease),color .2s var(--pc-ease)}header>div>a:hover{color:var(--brown);transform:translateX(-2px)}header>div>a:active{transform:translateX(-4px)}header>div>a:focus-visible,button:focus-visible{outline:3px solid color-mix(in srgb,var(--gold) 48%,transparent);outline-offset:3px}
  header>div>span{display:block;margin-top:var(--pc-space-5);color:var(--brown);font-size:var(--font-size-meta);font-weight:800;letter-spacing:.12em}h1{margin:var(--pc-space-2) 0 0;color:var(--brown-dark);font-size:var(--pc-type-5);line-height:1.12;letter-spacing:-.02em;text-wrap:balance}:global([data-theme="dark"]) h1{color:var(--text)}header>div>p{max-width:64ch;overflow-wrap:anywhere;margin:var(--pc-space-3) 0 0;color:var(--muted);font-size:var(--pc-type-2);line-height:1.65;text-wrap:pretty}
  aside{display:grid;padding:var(--pc-space-5);border:1px solid var(--border2);border-radius:var(--pc-radius-lg);background:var(--card);gap:var(--pc-space-3)}aside>:global(svg){color:var(--gold)}aside>div{display:grid;gap:var(--pc-space-1)}aside strong{font-size:var(--font-size-label)}aside small{color:var(--muted);font-size:var(--font-size-meta);line-height:1.55}button{min-height:44px;padding:0 var(--pc-space-4);border:1px solid var(--gold);border-radius:var(--pc-radius);background:var(--gold);color:var(--on-gold);cursor:pointer;font:700 var(--pc-type-1) var(--font-app);transition:transform .12s var(--pc-ease),background .2s var(--pc-ease)}button:hover{background:var(--gold2);transform:translateY(-2px)}button:active{transform:translateY(2px)}
  .practice-community-public__notice{margin:calc(var(--pc-space-7) * -1 + var(--pc-space-2)) 0 0;padding:var(--pc-space-3) var(--pc-space-4);border-radius:var(--pc-radius);background:var(--gold-light);color:var(--brown);font-size:var(--pc-type-1)}
  @media(max-width:760px){.practice-community-public{width:min(100% - 32px,1080px);padding-top:var(--pc-space-6)}.practice-community-public>header{grid-template-columns:1fr;gap:var(--pc-space-5)}h1{font-size:34px}}
  @media(max-width:420px){.practice-community-public{width:min(100% - 24px,1080px);padding-top:var(--pc-space-5);gap:var(--pc-space-6)}h1{font-size:30px}}
  @media(prefers-reduced-motion:reduce){.practice-community-public :is(a,button){transition:none}.practice-community-public :is(a,button):hover,.practice-community-public :is(a,button):active{transform:none}}
</style>
