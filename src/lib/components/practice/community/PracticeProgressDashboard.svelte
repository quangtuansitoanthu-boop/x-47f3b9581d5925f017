<script lang="ts">
  import { browser } from '$app/environment';
  import { completedPracticeDisplayType, resolvePracticeDisplayName } from '$lib/domain/practice/progress-display';
  import { practiceCountUnit, practiceTypesEn, practiceUi } from '$lib/i18n/practice-ui';
  import { COMMUNITY_BLOCKS_CHANGED_EVENT, type CommunityBlocksChangedDetail } from '$lib/contracts/community-moderation';
  import { shareVerifiedTalkCatalog } from '$lib/browser/talk-catalog-proof';
  import { Award, BookOpen, CalendarDays, Download, Flame, Gauge, Lock, Music, ShieldCheck, Sparkles } from '@lucide/svelte';
  import { createMutation, createQuery, useQueryClient } from '@tanstack/svelte-query';
  import { onMount } from 'svelte';
  import { triggerHaptic } from '$lib/utils/haptics';
  import './avatar-rings.css';
  import { createDedicationCardDownload } from '$lib/browser/dedication-card';
  import { isNativeApp, nativePlatform } from '$lib/browser/native-platform';
  import {
    fetchPracticeCampaigns,
    fetchPracticeLeaderboard,
    fetchPracticeProgress,
    joinPracticeCampaign,
    leavePracticeCampaign,
    updatePracticeProfile,
    withCampaignMembership,
    PRACTICE_COMMUNITY_QUERY_POLICY,
    type PracticeCampaign,
    type PracticeCampaignListData,
    type PracticeLeaderboardData,
    type PracticeProgressData,
  } from '$lib/browser/practice-community';
  import { fetchWithSessionRefresh } from '$lib/browser/session-csrf';
  import { fetchTalkAlbums } from '$lib/browser/content-catalogs';
  import { serverStateKeys } from '$lib/browser/server-state';
  import {
    PRACTICE_BADGE_DEFINITIONS,
    getBadgeTitle,
    getBadgeLabel,
    getBadgeSubtitle,
    type PracticeBadgeId,
  } from '$lib/domain/practice/progress-achievements';
  import type { PageSessionDTO } from '$lib/server/auth/types';
  import { getSessionContext, SESSION_CHANGE_EVENT } from '$lib/stores/session.svelte';
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import PracticeCampaigns from './PracticeCampaigns.svelte';
  import PracticeHeatmap from './PracticeHeatmap.svelte';
  import PracticeLeaderboard from './PracticeLeaderboard.svelte';

  interface Props {
    initialCampaigns: PracticeCampaignListData;
    initialLeaderboard: PracticeLeaderboardData;
    initialProgress: PracticeProgressData;
    user: NonNullable<PageSessionDTO['user']>;
  }

  let { initialCampaigns, initialLeaderboard, initialProgress, user }: Props = $props();
  const queryClient = useQueryClient();
  const sessionStore = getSessionContext();
  const catalogRole = $derived(sessionStore.value.user?.role ?? 'guest');
  const catalogPrincipalId = $derived(sessionStore.value.authenticated ? sessionStore.value.user?.id ?? null : null);
  const localeStore = getLocaleContext();
  const isEn = $derived(localeStore.current === 'en');
  const numberFormat = $derived(new Intl.NumberFormat(isEn ? 'en-US' : 'vi-VN'));
  let blockedAuthors = $state<string[]>([]);
  let notice = $state('');
  let actionError = $state('');
  let errorCampaignId = $state<string | null>(null);
  let exportBusy = $state(false);
  let detectedTimeZone = $state('');
  let privateVisible = $state(true);
  let exportGeneration = 0;

  const progressQuery = createQuery(() => ({
    ...PRACTICE_COMMUNITY_QUERY_POLICY,
    queryKey: serverStateKeys.practiceCommunity.progress(user.id),
    queryFn: ({ signal }) => fetchPracticeProgress(fetchWithSessionRefresh, signal),
    initialData: initialProgress,
    initialDataUpdatedAt: 0,
    staleTime: 48 * 60 * 60 * 1000,
    gcTime: 72 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    enabled: browser && privateVisible,
  }));
  const leaderboardQuery = createQuery(() => ({
    ...PRACTICE_COMMUNITY_QUERY_POLICY,
    queryKey: serverStateKeys.practiceCommunity.leaderboardForPrincipal(user.id),
    queryFn: ({ signal }) => fetchPracticeLeaderboard(fetch, signal),
    initialData: initialLeaderboard,
    initialDataUpdatedAt: 0,
    staleTime: PRACTICE_COMMUNITY_QUERY_POLICY.staleTime,
    gcTime: 72 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    enabled: browser && privateVisible,
  }));
  const campaignsQuery = createQuery(() => ({
    ...PRACTICE_COMMUNITY_QUERY_POLICY,
    queryKey: serverStateKeys.practiceCommunity.campaigns(user.id),
    queryFn: ({ signal }) => fetchPracticeCampaigns(fetch, { signal }),
    initialData: initialCampaigns,
    initialDataUpdatedAt: 0,
    staleTime: PRACTICE_COMMUNITY_QUERY_POLICY.staleTime,
    gcTime: 72 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    enabled: browser && privateVisible,
  }));
  const albumsQuery = createQuery(() => ({
    ...PRACTICE_COMMUNITY_QUERY_POLICY,
    queryKey: serverStateKeys.talks.catalogForPrincipal(catalogRole, catalogPrincipalId),
    structuralSharing: shareVerifiedTalkCatalog,
    queryFn: ({ signal }) => fetchTalkAlbums(fetch, signal, sessionStore.value),
    enabled: browser && privateVisible && (progressQuery.data ?? initialProgress).breakdown.length > 0,
  }));
  const albumTitleLookup = $derived(
    new Map((albumsQuery.data ?? []).map((album) => [album.id, album.tieu_de]))
  );
  const campaigns = $derived(campaignsQuery.data?.campaigns ?? initialCampaigns.campaigns);
  const campaignTitleLookup = $derived(
    new Map((campaigns ?? []).map((campaign) => [campaign.id, campaign.title]))
  );
  const progress = $derived(progressQuery.data ?? initialProgress);
  const leaderboardData = $derived(leaderboardQuery.data ?? initialLeaderboard);
  const leaderboard = $derived({ ...leaderboardData, ranking: leaderboardData.ranking.filter(member => !member.authorId || !blockedAuthors.includes(member.authorId)) });
  const communityEnabled = $derived(
    leaderboard.enabled !== false && (campaignsQuery.data ?? initialCampaigns).enabled !== false,
  );
  const refreshError = $derived([
    progressQuery.error,
    leaderboardQuery.error,
    campaignsQuery.error,
  ].some(Boolean) ? (isEn ? 'Part of the data could not be refreshed. The latest version was retained.' : 'Một phần dữ liệu chưa thể làm mới. Bản gần nhất vẫn được giữ lại.') : '');
  const selectedBadge = $derived(
    PRACTICE_BADGE_DEFINITIONS.find((badge) => badge.id === progress.profile.selectedBadge) ?? null,
  );
  const timeZoneOptions = $derived.by(() => Array.from(new Set([
    progress.profile.timeZone,
    detectedTimeZone,
    'Asia/Ho_Chi_Minh',
    'Asia/Bangkok',
    'Asia/Tokyo',
    'Australia/Sydney',
    'Europe/London',
    'America/New_York',
    'America/Los_Angeles',
  ].filter(Boolean))));

  const profileMutation = createMutation(() => ({
    mutationFn: (input: PracticeProgressData['profile']) => updatePracticeProfile(input),
    onSuccess: (next) => {
      if (!privateVisible) return;
      queryClient.setQueryData(serverStateKeys.practiceCommunity.progress(user.id), next);
      notice = isEn ? 'Saved progress preferences.' : 'Đã lưu tùy chọn tiến độ.';
    },
  }));
  const displayedProfile = $derived(
    profileMutation.isPending && profileMutation.variables ? profileMutation.variables : progress.profile,
  );
  const membershipMutation = createMutation(() => ({
    mutationFn: async ({ campaign }: { campaign: PracticeCampaign }) => campaign.joined
      ? leavePracticeCampaign(campaign.id)
      : joinPracticeCampaign(campaign.id),
    onSuccess: (_result, { campaign }) => {
      if (!privateVisible) return;
      queryClient.setQueryData<PracticeCampaignListData>(
        serverStateKeys.practiceCommunity.campaigns(user.id),
        (current) => withCampaignMembership(current ?? initialCampaigns, campaign.id, !campaign.joined),
      );
      notice = campaign.joined
        ? (isEn ? 'Left community goal.' : 'Đã rời mục tiêu chung.')
        : (isEn ? 'Joined community goal.' : 'Đã tham gia mục tiêu chung.');
    },
  }));

  async function saveProfile(patch: Partial<PracticeProgressData['profile']>): Promise<void> {
    errorCampaignId = null;
    if (!privateVisible || profileMutation.isPending) return;
    notice = '';
    actionError = '';
    try {
      await profileMutation.mutateAsync({ ...progress.profile, ...patch });
    } catch (cause) {
      if (!privateVisible) return;
      actionError = cause instanceof Error ? cause.message : (isEn ? 'Could not save progress preferences.' : 'Không thể lưu tùy chọn tiến độ.');
    }
  }

  async function changeMembership(campaign: PracticeCampaign): Promise<void> {
    if (!privateVisible || membershipMutation.isPending) return;
    errorCampaignId = campaign.id;
    notice = '';
    actionError = '';
    triggerHaptic('medium');

    try {
      await membershipMutation.mutateAsync({ campaign });
    } catch (cause) {
      if (!privateVisible) return;
      actionError = cause instanceof Error ? cause.message : (isEn ? 'Could not update community goal.' : 'Không thể cập nhật mục tiêu chung.');
    }
  }

  async function exportDedication(): Promise<void> {
    errorCampaignId = null;
    if (!privateVisible || exportBusy) return;
    const request = ++exportGeneration;
    const isCurrent = () => privateVisible && request === exportGeneration;
    exportBusy = true;
    notice = '';
    actionError = '';
    try {
      const downloaded = await createDedicationCardDownload({
        displayName: user.displayName,
        currentStreak: progress.streaks.current,
        longestStreak: progress.streaks.longest,
        totalAcceptedCount: progress.totals.acceptedCount,
        totalAcceptedDurationSeconds: progress.totals.acceptedDurationSeconds,
        totalSessions: progress.totals.sessions,
        selectedBadge: progress.profile.selectedBadge,
        badgeLabel: selectedBadge ? getBadgeLabel(selectedBadge, isEn) : '',
        today: progress.today,
      }, isCurrent);
      if (!downloaded) return;
      notice = isNativeApp() && nativePlatform() === 'android'
        ? (isEn ? 'Saved PNG card to this device.' : 'Đã lưu thẻ PNG vào máy.')
        : (isEn ? 'Created dedication PNG card.' : 'Đã tạo thẻ hồi hướng PNG.');
    } catch {
      if (!isCurrent()) return;
      actionError = isEn ? 'Could not create PNG card on this browser. Please try again.' : 'Không thể tạo thẻ PNG trên trình duyệt này. Vui lòng thử lại.';
    } finally {
      if (isCurrent()) exportBusy = false;
    }
  }

  function formatDuration(seconds: number): string {
    const minutes = Math.floor(Math.max(0, seconds) / 60);
    if (minutes < 60) return `${numberFormat.format(minutes)} ${practiceCountUnit(isEn, 'phút', minutes)}`;
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    if (isEn) {
      return remainder ? `${numberFormat.format(hours)}h ${remainder}m` : `${numberFormat.format(hours)} ${practiceCountUnit(isEn, 'giờ', hours)}`;
    }
    return remainder ? `${numberFormat.format(hours)}g ${remainder}p` : `${numberFormat.format(hours)} giờ`;
  }

  function initials(name: string): string {
    return name.trim().split(/\s+/u).slice(-2).map((part) => part.slice(0, 1)).join('').toUpperCase() || 'QT';
  }

  function badgeEarned(id: PracticeBadgeId): boolean {
    return progress.badges.includes(id);
  }

  interface BreakdownGroup {
    key: string;
    label: string;
    icon: 'rosary' | 'scripture' | 'meditation' | 'audio';
    items: { name: string; count: number; durationSeconds: number; sessions: number }[];
    totalCount: number;
    totalDurationSeconds: number;
  }

  function resolvePracticeName(
    explicitTitle: string | null | undefined,
    sourceId: string | null | undefined,
    fallbackDefault: string,
  ): string {
    return resolvePracticeDisplayName(explicitTitle, sourceId, fallbackDefault, campaignTitleLookup, albumTitleLookup);
  }

  const practiceBreakdownGroups = $derived.by(() => {
    const bd = progress.breakdown ?? [];
    if (!bd.length) return [];

    const groups: Map<string, BreakdownGroup> = new Map();

    for (const row of bd) {
      const type = row.activityType;
      let groupKey: string;
      let groupLabel: string;
      let icon: BreakdownGroup['icon'];
      let itemName: string;

      const completedType = completedPracticeDisplayType(row);
      if (completedType) {
        groupKey = completedType === 'Lễ Phật' ? 'prostrations' : completedType === 'Chép kinh' ? 'scripture_copying' : 'name_copying';
        groupLabel = isEn ? practiceTypesEn[completedType] : completedType;
        icon = 'scripture';
        itemName = resolvePracticeName(row.title, null, groupLabel);
      } else if (type === 'rosary') {
        groupKey = 'rosary';
        groupLabel = isEn ? 'Buddha Recitation' : 'Niệm danh hiệu';
        icon = 'rosary';
        itemName = resolvePracticeName(row.title, row.sourceId, isEn ? 'Buddha Recitation' : 'Niệm danh hiệu');
      } else if (type === 'scripture') {
        groupKey = 'scripture';
        groupLabel = isEn ? 'Sutra Recitation / Precepts' : 'Tụng kinh / Thọ giới';
        icon = 'scripture';
        itemName = resolvePracticeName(row.title, row.sourceId, isEn ? 'Sutra Recitation / Precepts' : 'Tụng kinh / Thọ giới');
      } else if (type === 'model_chant') {
        groupKey = 'model_chant';
        groupLabel = isEn ? 'Mantra / Chanting' : 'Trì chú / Mẫu tụng';
        icon = 'audio';
        itemName = resolvePracticeName(row.title, row.sourceId, isEn ? 'Mantra / Chanting' : 'Trì chú / Mẫu tụng');
      } else if (type === 'meditation') {
        groupKey = 'meditation';
        groupLabel = isEn ? 'Meditation' : 'Ngồi thiền';
        icon = 'meditation';
        itemName = isEn ? 'Meditation' : 'Thiền định';
      } else if (type === 'dharma_talk') {
        groupKey = 'dharma_talk';
        groupLabel = isEn ? 'Dharma Talks' : 'Nghe pháp thoại';
        icon = 'audio';
        const rawId = row.sourceId ?? '';
        itemName = resolvePracticeName(row.title, rawId, isEn ? 'Dharma Talks' : 'Pháp thoại');
      } else {
        groupKey = type;
        groupLabel = type;
        icon = 'audio';
        itemName = resolvePracticeName(row.title, row.sourceId, type || (isEn ? 'Cultivation Practice' : 'Công phu tu tập'));
      }

      if (!groups.has(groupKey)) {
        groups.set(groupKey, { key: groupKey, label: groupLabel, icon, items: [], totalCount: 0, totalDurationSeconds: 0 });
      }
      const group = groups.get(groupKey)!;
      group.totalCount += row.acceptedCount;
      group.totalDurationSeconds += row.acceptedDurationSeconds;
      if (row.acceptedCount > 0 || row.acceptedDurationSeconds > 0) {
        const existing = group.items.find((item) => item.name === itemName);
        if (existing) {
          existing.count += row.acceptedCount;
          existing.durationSeconds += row.acceptedDurationSeconds;
          existing.sessions += row.sessionCount;
        } else {
          group.items.push({
            name: itemName,
            count: row.acceptedCount,
            durationSeconds: row.acceptedDurationSeconds,
            sessions: row.sessionCount,
          });
        }
      }
    }

    // Sort items within groups by count descending
    for (const group of groups.values()) {
      group.items.sort((a, b) => b.count - a.count || b.durationSeconds - a.durationSeconds);
    }

    // Sort groups: rosary first, then scripture, then model_chant, meditation, dharma_talk
    const order = ['rosary', 'scripture', 'model_chant', 'meditation', 'dharma_talk'];
    return [...groups.values()].sort((a, b) => {
      const ia = order.indexOf(a.key);
      const ib = order.indexOf(b.key);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
  });

  onMount(() => {
    detectedTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    const blocksChanged = (event: Event) => {
      const detail = (event as CustomEvent<CommunityBlocksChangedDetail>).detail;
      if (!detail?.blocked || !privateVisible || detail.principalId !== user.id || sessionStore.value.user?.id !== user.id) return;
      blockedAuthors = [...new Set([...blockedAuthors, detail.authorId])];
      const queryKey = serverStateKeys.practiceCommunity.leaderboardForPrincipal(user.id);
      void queryClient.cancelQueries({ queryKey, exact: true });
      queryClient.setQueryData<PracticeLeaderboardData>(queryKey, current => current ? { ...current, ranking: current.ranking.filter(member => member.authorId !== detail.authorId) } : undefined);
      void queryClient.invalidateQueries({ queryKey, exact: true, refetchType: 'none' });
    };
    const sessionChanged = (event: Event) => {
      const session = (event as CustomEvent<PageSessionDTO>).detail;
      if (session.authenticated && session.user?.id === user.id) return;
      exportGeneration += 1;
      privateVisible = false;
      notice = '';
      actionError = '';
      exportBusy = false;
      profileMutation.reset();
      membershipMutation.reset();
      void queryClient.cancelQueries({ queryKey: serverStateKeys.practiceCommunity.progress(user.id) });
      void queryClient.cancelQueries({ queryKey: serverStateKeys.practiceCommunity.campaigns(user.id) });
      void queryClient.cancelQueries({ queryKey: serverStateKeys.practiceCommunity.leaderboardForPrincipal(user.id), exact: true });
      queryClient.removeQueries({ queryKey: serverStateKeys.practiceCommunity.progress(user.id) });
      queryClient.removeQueries({ queryKey: serverStateKeys.practiceCommunity.campaigns(user.id) });
      queryClient.removeQueries({ queryKey: serverStateKeys.practiceCommunity.leaderboardForPrincipal(user.id), exact: true });
      if (!session.authenticated) {
        globalThis.location.replace('/?login=1');
        return;
      }
      globalThis.location.reload();
    };
    window.addEventListener(SESSION_CHANGE_EVENT, sessionChanged);
    window.addEventListener(COMMUNITY_BLOCKS_CHANGED_EVENT, blocksChanged);
    return () => {
      exportGeneration += 1;
      window.removeEventListener(SESSION_CHANGE_EVENT, sessionChanged);
      window.removeEventListener(COMMUNITY_BLOCKS_CHANGED_EVENT, blocksChanged);
    };
  });
</script>

{#if privateVisible}
<main class="practice-community practice-theme" data-practice="community" aria-busy={progressQuery.isFetching || leaderboardQuery.isFetching || campaignsQuery.isFetching}>
  <header class="practice-community__hero">
    <div class="practice-community__intro">
      <a
        href="/tu-tap"
        onclick={(event) => {
          if (typeof window !== 'undefined' && window.history.length > 1) {
            event.preventDefault();
            window.history.back();
          }
        }}
      >{isEn ? '← Back to Practice' : '← Về trang Tu tập'}</a>
      <h1>{isEn ? 'Practice Progress' : 'Tiến độ tu tập'}</h1>
      <p>{isEn ? 'Your personal data, aggregated from verified cultivation sessions.' : 'Dữ liệu riêng của bạn, được tổng hợp từ những phiên đã xác minh.'}</p>
    </div>
    <div class="practice-community__identity">
      <div class={`avatar-ring avatar-ring--hero ${selectedBadge ? `avatar-ring--${selectedBadge.id}` : ''}`}>
        <span class:decorated={Boolean(selectedBadge)} class="practice-community__avatar">
          {#if user.avatarUrl}<img src={user.avatarUrl} alt="" width="64" height="64" referrerpolicy="no-referrer" />{:else}{initials(user.displayName)}{/if}
          {#if selectedBadge}<i title={getBadgeLabel(selectedBadge, isEn)}><Award aria-hidden="true" size={16} strokeWidth={2.2} /><span class="sr-only">{isEn ? 'Pinned badge: ' : 'Huy hiệu đang gắn: '}{getBadgeLabel(selectedBadge, isEn)}</span></i>{/if}
        </span>
      </div>
      <span><strong>{user.displayName}</strong><small>{selectedBadge ? getBadgeLabel(selectedBadge, isEn) : (isEn ? 'No badge pinned to profile avatar' : 'Chưa gắn huy hiệu vào ảnh đại diện')}</small></span>
    </div>
  </header>

  {#if refreshError}<p class="practice-community__notice" role="status">{refreshError}</p>{/if}
  {#if notice}<p class="practice-community__notice" role="status">{notice}</p>{/if}
  {#if actionError && !errorCampaignId}<p class="practice-community__notice error" role="alert">{actionError}</p>{/if}

  <dl class="practice-community__summary" aria-label={isEn ? 'Cultivation progress overview' : 'Tổng quan tiến độ tu tập'}>
    <div class="primary"><dt><Flame aria-hidden="true" size={18} strokeWidth={1.9} /> {isEn ? 'Day streak' : 'Chuỗi ngày'}</dt><dd>{numberFormat.format(progress.streaks.current)} {practiceCountUnit(isEn, 'ngày', progress.streaks.current)}</dd><small>{isEn ? 'Record' : 'Kỷ lục'} {numberFormat.format(progress.streaks.longest)} {practiceCountUnit(isEn, 'ngày', progress.streaks.longest)}</small></div>
    <div><dt><Gauge aria-hidden="true" size={18} strokeWidth={1.9} /> {isEn ? 'Total counts' : 'Tổng số biến'}</dt><dd>{numberFormat.format(progress.totals.acceptedCount)}</dd><small>{isEn ? 'Verified' : 'Đã được xác minh'}</small></div>
    <div><dt><CalendarDays aria-hidden="true" size={18} strokeWidth={1.9} /> {isEn ? 'Total sessions' : 'Tổng số phiên'}</dt><dd>{numberFormat.format(progress.totals.sessions)}</dd><small>{isEn ? 'Valid sessions' : 'Phiên hợp lệ'}</small></div>
    <div><dt><ShieldCheck aria-hidden="true" size={18} strokeWidth={1.9} /> {isEn ? 'Total duration' : 'Tổng thời lượng'}</dt><dd>{formatDuration(progress.totals.acceptedDurationSeconds)}</dd><small>{isEn ? 'From valid sessions' : 'Từ các phiên hợp lệ'}</small></div>
  </dl>

  <PracticeHeatmap days={progress.heatmap} timeZone={progress.profile.timeZone} />

  {#if practiceBreakdownGroups.length > 0}
  <section class="practice-panel practice-breakdown" aria-labelledby="practice-breakdown-title">
    <header class="practice-breakdown__header">
      <div>
        <h2 id="practice-breakdown-title">{isEn ? 'Cultivation Details' : 'Chi tiết công phu'}</h2>
        <p>{isEn ? 'Categorized by verified cultivation practices.' : 'Phân loại theo từng hình thức tu tập đã xác minh.'}</p>
      </div>
      <Sparkles aria-hidden="true" size={24} strokeWidth={1.7} />
    </header>
    <div class="practice-breakdown__groups">
      {#each practiceBreakdownGroups as group (group.key)}
        <div class="breakdown-group">
          <div class="breakdown-group__head">
            <span class="breakdown-group__icon">
              {#if group.icon === 'rosary'}<span aria-hidden="true">📿</span>
              {:else if group.icon === 'scripture'}<BookOpen aria-hidden="true" size={16} strokeWidth={2} />
              {:else if group.icon === 'meditation'}<span aria-hidden="true">🧘</span>
              {:else}<Music aria-hidden="true" size={16} strokeWidth={2} />
              {/if}
            </span>
            <strong class="breakdown-group__label">{group.label}</strong>
            <span class="breakdown-group__total">
              {#if group.key === 'dharma_talk' || group.key === 'meditation'}{formatDuration(group.totalDurationSeconds)}{:else if group.totalCount > 0}{numberFormat.format(group.totalCount)} {practiceCountUnit(isEn, group.key === 'prostrations' ? 'lạy' : group.key === 'scripture_copying' ? 'lượt' : group.key === 'name_copying' ? 'câu' : 'biến', group.totalCount)}{:else}{formatDuration(group.totalDurationSeconds)}{/if}
            </span>
          </div>
          <table class="breakdown-table" aria-label="{isEn ? 'Details for ' : 'Chi tiết '}{group.label}">
            <thead>
              <tr>
                <th scope="col">{isEn ? 'Name' : 'Tên'}</th>
                <th scope="col" class="num">{group.key === 'prostrations' ? practiceUi(isEn, 'Số lạy') : group.key === 'scripture_copying' ? practiceUi(isEn, 'Số lượt') : group.key === 'name_copying' ? practiceUi(isEn, 'Số câu') : (isEn ? 'Counts' : 'Số biến')}</th>
                <th scope="col" class="num">{isEn ? 'Duration' : 'Thời lượng'}</th>
                <th scope="col" class="num">{isEn ? 'Sessions' : 'Phiên'}</th>
              </tr>
            </thead>
            <tbody>
              {#each group.items as item (item.name)}
                <tr>
                  <td class="breakdown-table__name">{item.name}</td>
                  <td class="num">{item.count > 0 ? numberFormat.format(item.count) : '—'}</td>
                  <td class="num">{item.durationSeconds > 0 ? formatDuration(item.durationSeconds) : '—'}</td>
                  <td class="num">{numberFormat.format(item.sessions)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/each}
    </div>
  </section>
  {/if}

  <div class="practice-community__personalize">
    <section class="practice-panel practice-badges" aria-labelledby="practice-badges-title">
      <header><div><h2 id="practice-badges-title">{isEn ? 'Achievement Badges' : 'Huy hiệu thành tựu'}</h2><p>{isEn ? 'Each milestone day streak unlocks a halo avatar ring.' : 'Mỗi mốc chuỗi ngày đạt được sẽ mở khóa vòng tròn hào quang trang nghiêm quanh ảnh đại diện.'}</p></div><Award aria-hidden="true" size={24} strokeWidth={1.7} /></header>
      <div class="practice-badges__list">
        {#each PRACTICE_BADGE_DEFINITIONS as badge (badge.id)}
          <button
            class:selected={progress.profile.selectedBadge === badge.id}
            class:earned={badgeEarned(badge.id)}
            class="badge-card"
            type="button"
            disabled={!badgeEarned(badge.id) || profileMutation.isPending}
            aria-pressed={progress.profile.selectedBadge === badge.id}
            onclick={() => saveProfile({ selectedBadge: progress.profile.selectedBadge === badge.id ? null : badge.id })}
          >
            <div class="badge-card__preview">
              <div class={`avatar-ring avatar-ring--mini avatar-ring--${badge.id} ${badgeEarned(badge.id) ? '' : 'locked'}`}>
                <div class="avatar-ring__core">
                  {#if badgeEarned(badge.id)}
                    <Award aria-hidden="true" size={18} strokeWidth={2} />
                  {:else}
                    <Lock aria-hidden="true" size={16} strokeWidth={2} />
                  {/if}
                </div>
              </div>
            </div>
            <div class="badge-card__content">
              <div class="badge-card__top">
                <strong class="badge-card__title">{getBadgeTitle(badge, isEn)}</strong>
                <span class="badge-card__tier">{isEn ? `Tier ${badge.tier}` : `Cấp ${badge.tier}`}</span>
              </div>
              <p class="badge-card__subtitle">{getBadgeSubtitle(badge, isEn)}</p>
              <div class="badge-card__status">
                {#if progress.profile.selectedBadge === badge.id}
                  <span class="badge-status badge-status--active">{isEn ? '✦ Pinned to profile avatar' : '✦ Đang gắn vào ảnh đại diện'}</span>
                {:else if badgeEarned(badge.id)}
                  <span class="badge-status badge-status--unlocked">{isEn ? '✓ Unlocked • Click to pin' : '✓ Đã mở khóa • Nhấn để gắn'}</span>
                {:else}
                  <span class="badge-status badge-status--locked">{isEn ? `Requires streak of ${numberFormat.format(badge.threshold)} days (Record: ${numberFormat.format(progress.streaks.longest)}/${badge.threshold})` : `Cần chuỗi ${numberFormat.format(badge.threshold)} ngày (Kỷ lục: ${numberFormat.format(progress.streaks.longest)}/${badge.threshold})`}</span>
                {/if}
              </div>
            </div>
          </button>
        {/each}
      </div>
      <button class="practice-badges__download" type="button" disabled={exportBusy} onclick={exportDedication}><Download aria-hidden="true" size={17} strokeWidth={2} /> {exportBusy ? (isEn ? 'Generating PNG…' : 'Đang tạo PNG…') : (isEn ? 'Download Dedication Card' : 'Tải thẻ hồi hướng')}</button>
    </section>

    <section class="practice-panel practice-privacy" aria-labelledby="practice-privacy-title">
      <header><div><h2 id="practice-privacy-title">{isEn ? 'Community Privacy' : 'Quyền riêng tư cộng đồng'}</h2><p>{isEn ? 'Enabled by default and customizable at any time.' : 'Mặc định được kích hoạt và có thể tùy chỉnh bất cứ lúc nào.'}</p></div><ShieldCheck aria-hidden="true" size={24} strokeWidth={1.7} /></header>
      <div class="practice-privacy__controls">
        <label>
          <span><strong>{isEn ? 'Join Leaderboard' : 'Tham gia bảng xếp hạng'}</strong><small>{isEn ? 'Display name, avatar, badge, and 30-day stats if in top 10.' : 'Công khai tên, ảnh, huy hiệu và số liệu 30 ngày trong top 10.'}</small></span>
          <input type="checkbox" checked={displayedProfile.leaderboardOptIn} disabled={profileMutation.isPending} onchange={(event) => saveProfile({ leaderboardOptIn: event.currentTarget.checked })} />
        </label>

        <label class="practice-privacy__timezone" for="practice-time-zone">
          <span><strong>{isEn ? 'Calendar Timezone' : 'Múi giờ nhật lịch'}</strong><small>{isEn ? 'Each day is calculated based on this account timezone.' : 'Mỗi ngày được tính theo múi giờ tài khoản này.'}</small></span>
          <select id="practice-time-zone" value={progress.profile.timeZone} disabled={profileMutation.isPending} onchange={(event) => saveProfile({ timeZone: event.currentTarget.value })}>
            {#each timeZoneOptions as zone}<option value={zone}>{zone}{zone === detectedTimeZone ? (isEn ? ' (this device)' : ' (thiết bị này)') : ''}</option>{/each}
          </select>
        </label>
      </div>
    </section>
  </div>

  {#if communityEnabled}
    <PracticeCampaigns
      {campaigns}
      busyCampaignId={membershipMutation.isPending ? membershipMutation.variables?.campaign.id ?? null : null}
      onMembership={changeMembership}
      {errorCampaignId}
      errorMessage={actionError}
    />

    <PracticeLeaderboard {leaderboard} principalId={user.id} />
  {:else}
    <p class="practice-community__notice" role="status">{isEn ? 'Community features are temporarily paused; your private progress continues to operate normally.' : 'Tính năng cộng đồng đang tạm dừng; tiến độ riêng tư của bạn vẫn hoạt động bình thường.'}</p>
  {/if}
</main>
{:else}
  <div class="practice-community__transition" role="status">{isEn ? 'Switching account…' : 'Đang chuyển tài khoản…'}</div>
{/if}

<style>
  .practice-community{--pc-space-1:4px;--pc-space-2:8px;--pc-space-3:12px;--pc-space-4:16px;--pc-space-5:24px;--pc-space-6:32px;--pc-space-7:48px;--pc-space-8:64px;--pc-radius-xs:4px;--pc-radius:10px;--pc-radius-lg:16px;--pc-radius-pill:999px;--pc-cell:12px;--pc-type-0:var(--font-size-meta);--pc-type-1:var(--font-size-body);--pc-type-2:16px;--pc-type-3:var(--font-size-section-title);--pc-type-4:24px;--pc-type-5:40px;--pc-ease:cubic-bezier(.25,1,.5,1);display:grid;width:min(1080px,calc(100% - 48px));margin:0 auto;padding:var(--pc-space-7) 0 var(--pc-space-5);gap:var(--pc-space-7);color:var(--text);font-family:var(--font-app)}
  .practice-community__hero{display:flex;align-items:flex-end;justify-content:space-between;gap:var(--pc-space-6);padding-bottom:var(--pc-space-5);border-bottom:1px solid var(--border)}
  .practice-community__intro>a{display:inline-flex;min-height:44px;align-items:center;color:var(--brown);font-size:var(--pc-type-1);font-weight:700;text-decoration:none;transition:transform .2s var(--pc-ease),color .2s var(--pc-ease)}
  .practice-community__intro>a:hover{color:var(--brown);transform:translateX(-2px)}.practice-community__intro>a:active{transform:translateX(-4px)}.practice-community__intro>a:focus-visible{outline:3px solid color-mix(in srgb,var(--gold) 48%,transparent);outline-offset:3px}
  h1{margin:var(--pc-space-2) 0 0;color:var(--brown-dark);font-size:var(--pc-type-5);line-height:1.12;letter-spacing:-.02em;text-wrap:balance}:global([data-theme="dark"]) h1{color:var(--text)}
  .practice-community__intro{min-width:0}.practice-community__intro>p{max-width:62ch;overflow-wrap:anywhere;margin:var(--pc-space-2) 0 0;color:var(--muted);font-size:var(--pc-type-2);line-height:1.65;text-wrap:pretty}
  .practice-community__identity{display:flex;min-width:0;flex:0 1 auto;align-items:center;gap:var(--pc-space-3)}.practice-community__identity>span:last-child{display:grid;min-width:0;overflow-wrap:anywhere;gap:var(--pc-space-1)}.practice-community__identity strong{font-size:var(--pc-type-2)}.practice-community__identity small{max-width:220px;color:var(--muted);font-size:var(--font-size-meta)}
  .practice-community__avatar{position:relative;display:grid;flex:0 0 auto;width:64px;height:64px;place-items:center;border:1px solid var(--border);border-radius:50%;background:var(--bg2);color:var(--brown);font-size:var(--pc-type-3);font-weight:800}.practice-community__avatar.decorated{border:3px solid var(--gold)}.practice-community__avatar img{width:100%;height:100%;overflow:hidden;border-radius:50%;object-fit:cover}.practice-community__avatar i{position:absolute;right:-8px;bottom:-4px;display:grid;width:28px;height:28px;place-items:center;border:3px solid var(--bg);border-radius:50%;background:var(--gold);color:var(--on-gold)}
  .practice-community__notice{margin:calc(var(--pc-space-7) * -1 + var(--pc-space-2)) 0 0;padding:var(--pc-space-3) var(--pc-space-4);border-radius:var(--pc-radius);background:var(--gold-light);color:var(--brown);font-size:var(--pc-type-1)}.practice-community__notice.error{background:color-mix(in srgb,var(--red) 12%,var(--bg2));color:var(--danger-text)}
  .practice-community__transition{display:grid;min-height:50vh;place-items:center;color:var(--muted);font:600 13px var(--font-app)}
  .practice-community__summary{display:grid;margin:0;grid-template-columns:1.2fr repeat(3,1fr);border:1px solid var(--border2);border-radius:var(--pc-radius-lg);background:var(--card)}
  .practice-community__summary>div{min-width:0;padding:var(--pc-space-5);border-left:1px solid var(--border2)}.practice-community__summary>div:first-child{border-left:0}.practice-community__summary>div.primary{background:var(--gold-light)}
  .practice-community__summary dt{display:flex;align-items:center;gap:var(--pc-space-2);color:var(--muted);font-size:var(--font-size-meta);font-weight:700}.practice-community__summary dd{margin:var(--pc-space-2) 0 0;color:var(--text);font-size:var(--pc-type-4);font-weight:800;font-variant-numeric:tabular-nums;line-height:1.2}.practice-community__summary small{display:block;margin-top:var(--pc-space-1);color:var(--muted);font-size:var(--font-size-meta)}
  .practice-panel{border:1px solid var(--border2);border-radius:var(--pc-radius-lg);background:var(--card)}
  .practice-community__personalize{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(320px,.8fr);gap:var(--pc-space-4)}
  .practice-badges>header,.practice-privacy>header{display:flex;align-items:flex-start;justify-content:space-between;gap:var(--pc-space-4);padding:var(--pc-space-5);border-bottom:1px solid var(--border2)}.practice-badges>header>:global(svg),.practice-privacy>header>:global(svg){color:var(--gold)}
  .practice-badges h2,.practice-privacy h2{margin:0;font-size:var(--pc-type-3);line-height:1.2}.practice-badges header p,.practice-privacy header p{margin:var(--pc-space-2) 0 0;color:var(--muted);font-size:var(--pc-type-1);line-height:1.6}
  .practice-badges__list{display:grid;padding:var(--pc-space-4);grid-template-columns:1fr;gap:var(--pc-space-3)}
  .badge-card{display:flex;align-items:center;gap:var(--pc-space-3);padding:var(--pc-space-3) var(--pc-space-4);border:1px solid var(--border2);border-radius:var(--pc-radius-lg);background:var(--bg2);color:var(--muted);cursor:pointer;font:inherit;text-align:left;transition:transform .15s var(--pc-ease),border-color .2s var(--pc-ease),background .2s var(--pc-ease),box-shadow .2s var(--pc-ease)}
  .badge-card.earned{background:var(--card);color:var(--text)}
  .badge-card.selected{border-color:var(--gold);background:var(--gold-light);box-shadow:0 0 16px rgba(217,119,6,.18)}
  .badge-card:hover:not(:disabled){border-color:var(--gold);transform:translateY(-2px);box-shadow:0 4px 14px rgba(0,0,0,.08)}
  .badge-card:active:not(:disabled){transform:translateY(1px)}
  .badge-card:focus-visible{outline:3px solid color-mix(in srgb,var(--gold) 48%,transparent);outline-offset:3px}
  .badge-card:disabled{cursor:not-allowed;opacity:.72}
  .badge-card__preview{display:grid;place-items:center;flex-shrink:0;width:52px;height:52px}
  .badge-card__content{display:grid;min-width:0;flex:1 1 auto;gap:3px}
  .badge-card__top{display:flex;align-items:center;justify-content:space-between;gap:var(--pc-space-2)}
  .badge-card__title{font-size:var(--font-size-card-title);font-weight:700;color:var(--text)}
  .badge-card.selected .badge-card__title{color:var(--brown-dark)}
  .badge-card__tier{font-size:var(--font-size-meta);font-weight:700;padding:2px 8px;border-radius:var(--pc-radius-pill);background:var(--bg3);color:var(--muted)}
  .badge-card.earned .badge-card__tier{background:var(--gold-light);color:var(--brown)}
  .badge-card.selected .badge-card__tier{background:var(--gold);color:var(--on-gold)}
  .badge-card__subtitle{margin:0;font-size:var(--pc-type-1);color:var(--muted);line-height:1.4}
  .badge-card__status{margin-top:2px;font-size:var(--font-size-meta)}
  .badge-status{display:inline-block;font-weight:600}
  .badge-status--active{color:var(--brown);font-weight:700}
  .badge-status--unlocked{color:#16a34a}:global([data-theme="dark"]) .badge-status--unlocked{color:#4ade80}
  .badge-status--locked{color:var(--muted)}
  .practice-badges__download{display:flex;min-height:44px;align-items:center;justify-content:center;gap:var(--pc-space-2);margin:0 var(--pc-space-4) var(--pc-space-4);padding:0 var(--pc-space-4);border:1px solid var(--gold);border-radius:var(--pc-radius);background:var(--gold);color:var(--on-gold);cursor:pointer;font:700 var(--pc-type-1) var(--font-app);transition:transform .12s var(--pc-ease),background .2s var(--pc-ease)}.practice-badges__download:hover{background:var(--gold2);transform:translateY(-2px)}.practice-badges__download:active{transform:translateY(2px)}.practice-badges__download:focus-visible{outline:3px solid color-mix(in srgb,var(--gold) 48%,transparent);outline-offset:3px}.practice-badges__download:disabled{cursor:wait;opacity:.64;transform:none}
  .practice-privacy__controls{display:grid}.practice-privacy__controls label{display:flex;min-height:88px;align-items:center;justify-content:space-between;gap:var(--pc-space-4);padding:var(--pc-space-4) var(--pc-space-5);border-bottom:1px solid var(--border2);cursor:pointer}.practice-privacy__controls label:last-child{border-bottom:0}.practice-privacy__controls label>span{display:grid;min-width:0;overflow-wrap:anywhere;gap:var(--pc-space-1)}.practice-privacy__controls strong{color:var(--text);font-size:var(--font-size-label)}.practice-privacy__controls small{color:var(--muted);font-size:var(--font-size-meta);line-height:1.5}.practice-privacy__controls input{width:44px;height:24px;flex:0 0 auto;accent-color:var(--gold);cursor:pointer}.practice-privacy__controls input:focus-visible,.practice-privacy__controls select:focus-visible{outline:3px solid color-mix(in srgb,var(--gold) 48%,transparent);outline-offset:3px}.practice-privacy__controls input:disabled,.practice-privacy__controls select:disabled{cursor:wait;opacity:.64}.practice-privacy__controls select{min-height:44px;max-width:190px;padding:0 var(--pc-space-3);border:1px solid var(--border);border-radius:var(--pc-radius);background:var(--bg2);color:var(--text);font:var(--pc-type-2) var(--font-app)}
  /* Chi tiết công phu */
  .practice-breakdown__header{display:flex;align-items:flex-start;justify-content:space-between;gap:var(--pc-space-4);padding:var(--pc-space-5);border-bottom:1px solid var(--border2)}.practice-breakdown__header>:global(svg){color:var(--gold);flex-shrink:0}
  .practice-breakdown__header h2{margin:0;font-size:var(--pc-type-3);line-height:1.2}.practice-breakdown__header p{margin:var(--pc-space-2) 0 0;color:var(--muted);font-size:var(--pc-type-1);line-height:1.6}
  .practice-breakdown__groups{display:grid;gap:0;padding:var(--pc-space-4);grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));align-items:start}
  .breakdown-group{border:1px solid var(--border2);border-radius:var(--pc-radius-lg);background:var(--bg2);overflow:hidden;margin:var(--pc-space-2)}
  .breakdown-group__head{display:flex;align-items:center;gap:var(--pc-space-2);padding:var(--pc-space-3) var(--pc-space-4);background:var(--gold-light);border-bottom:1px solid var(--border2)}
  .breakdown-group__icon{display:grid;place-items:center;flex-shrink:0;width:28px;height:28px;border-radius:50%;background:var(--gold);color:var(--on-gold);font-size:14px}.breakdown-group__icon>:global(svg){color:var(--on-gold)}
  .breakdown-group__label{flex:1;font-size:var(--pc-type-1);font-weight:700;color:var(--brown-dark)}
  .breakdown-group__total{font-size:var(--pc-type-1);font-weight:800;color:var(--brown);font-variant-numeric:tabular-nums}
  .breakdown-table{width:100%;border-collapse:collapse;font-size:var(--pc-type-0)}
  .breakdown-table th{padding:var(--pc-space-2) var(--pc-space-3);text-align:left;font-size:var(--font-size-meta);font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);background:var(--bg3);border-bottom:1px solid var(--border2)}
  .breakdown-table th.num,.breakdown-table td.num{text-align:right;font-variant-numeric:tabular-nums}
  .breakdown-table td{padding:var(--pc-space-2) var(--pc-space-3);border-bottom:1px solid var(--border2);vertical-align:middle;color:var(--text)}
  .breakdown-table tbody tr:last-child td{border-bottom:0}
  .breakdown-table tbody tr:hover{background:var(--bg3);transition:background .15s}
  .breakdown-table__name{font-weight:600;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .sr-only{position:absolute;width:1px;height:1px;overflow:hidden;padding:0;border:0;margin:-1px;clip:rect(0,0,0,0);white-space:nowrap}
  @media(max-width:820px){.practice-community{width:min(100% - 32px,1080px);padding-top:var(--pc-space-6)}.practice-community__hero{align-items:flex-start;flex-direction:column}.practice-community__summary{grid-template-columns:1fr 1fr}.practice-community__summary>div{border-top:1px solid var(--border2)}.practice-community__summary>div:nth-child(odd){border-left:0}.practice-community__summary>div:nth-child(-n+2){border-top:0}.practice-community__personalize{grid-template-columns:1fr}}
  @media(max-width:420px){.practice-community{width:min(100% - 24px,1080px);padding-top:var(--pc-space-5);gap:var(--pc-space-6)}h1{font-size:32px}.practice-community__identity{width:100%}.practice-community__summary{grid-template-columns:1fr}.practice-community__summary>div{border-top:1px solid var(--border2);border-left:0}.practice-community__summary>div:first-child{border-top:0}.practice-badges__list{grid-template-columns:1fr}.practice-privacy__controls label{align-items:flex-start;flex-direction:column}.practice-privacy__controls select{width:100%;max-width:none}}
  @media(prefers-reduced-motion:reduce){.practice-community :is(a,button){transition:none}.practice-community :is(a,button):hover,.practice-community :is(a,button):active{transform:none}}
</style>
