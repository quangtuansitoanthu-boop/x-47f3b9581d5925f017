import type { QueryClient } from '@tanstack/svelte-query';
import type { PracticeProgressData } from './practice-community';
import type { PracticeSessionAcceptedDetail } from './practice-session-outbox';

export const serverStateKeys = {
  participation: {
    principal: (owner: string) => ['admin-participation',owner] as const,
    page: (owner: string, filters: string) => ['admin-participation',owner,'list',filters] as const,
    detail: (owner: string, account: string) => ['admin-participation',owner,'detail',account] as const,
  },
  mindfulCommunity: {
    all: ['mindful-community'] as const,
    principal: (id: string) => ['mindful-community', id] as const,
    post: (id: string, postId: string) => ['mindful-community', id, 'post', postId] as const,
    notifications: (id: string) => ['mindful-community', id, 'notifications'] as const,
    notificationReads: (id: string, ids: string) => ['notification-read-state', id, ids] as const,
    notificationReadPrincipal: (id: string) => ['notification-read-state', id] as const,
    posts: (id: string, tab: string, day?: string) => day ? ['mindful-community', id, 'posts', tab, day] as const : ['mindful-community', id, 'posts', tab] as const,
    reactions: (id: string, postId: string) => ['mindful-community', id, 'reactions', postId] as const,
  },
  communityBlocks: {
    all: ['community-blocks'] as const,
    list: (principalId: string) => ['community-blocks', principalId] as const,
  },
  communityModeration: {
    principal: (id: string) => ['community-moderation', id] as const,
    kind: (id: string, kind: string) => ['community-moderation', id, kind] as const,
    page: (id: string, kind: string, after: string | null) => ['community-moderation', id, kind, after] as const,
  },
  scriptureCopying: {
    all: ['scripture-copying'] as const,
    chapter: (owner: string, sutra: string, chapter: number) => ['scripture-copying', owner, sutra, chapter] as const,
  },
  articles: {
    all: ['articles'] as const,
    homepage: (role: string) => ['articles', 'catalog', 'homepage', role] as const,
    homepageForPrincipal: (role: string, principalId: string | null) => [
      'articles', 'catalog', 'homepage', role, 'principal', principalId,
    ] as const,
    practice: (role: string) => ['articles', 'catalog', 'practice', role] as const,
    admin: (userId: string) => ['articles', 'admin', userId] as const,
    adminPractice: (userId: string) => ['articles', 'admin', userId, 'practice'] as const,
  },
  talks: {
    all: ['talks'] as const,
    catalog: (role: string) => ['talks', 'catalog', role] as const,
    catalogForPrincipal: (role: string, principalId: string | null) => [
      'talks', 'catalog', role, 'principal', principalId,
    ] as const,
    admin: (userId: string) => ['talks', 'admin', userId] as const,
  },
  practiceCommunity: {
    all: ['practice-community'] as const,
    progress: (userId: string) => ['practice-community', 'progress', userId] as const,
    leaderboard: ['practice-community', 'leaderboard'] as const,
    leaderboardForPrincipal: (principalId: string) => ['practice-community', 'leaderboard', 'principal', principalId] as const,
    campaigns: (principalId: string) => ['practice-community', 'campaigns', 'principal', principalId] as const,
    adminCampaigns: (userId: string) => ['practice-community', 'campaigns', 'admin', userId] as const,
    campaignMembers: (userId: string, campaignId: string) => [
      'practice-community', 'campaigns', 'admin', userId, campaignId, 'members',
    ] as const,
  },
};

export interface TalkCatalogQueryPrincipal {
  role: string;
  principalId: string | null;
}

export function transitionTalkCatalogQueryPrincipal(
  queryClient: QueryClient,
  previous: TalkCatalogQueryPrincipal,
  next: TalkCatalogQueryPrincipal,
): void {
  if (previous.role === next.role && previous.principalId === next.principalId) return;
  const queryKey = serverStateKeys.talks.catalogForPrincipal(previous.role, previous.principalId);
  void queryClient.cancelQueries({ queryKey, exact: true });
  queryClient.removeQueries({ queryKey, exact: true });
}

export function invalidateArticleState(queryClient: QueryClient): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: serverStateKeys.articles.all });
}

export function invalidateTalkState(queryClient: QueryClient): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: serverStateKeys.talks.all });
}

export async function invalidateAcceptedPracticeState(
  queryClient: QueryClient,
  principalId: string | null,
  detail: PracticeSessionAcceptedDetail,
): Promise<void> {
  if (!principalId || detail?.principalId !== principalId || !Number.isSafeInteger(detail.acceptedCount) || detail.acceptedCount <= 0) return;
  const keys = serverStateKeys.practiceCommunity;
  const progressKey = keys.progress(principalId);
  const optIn = queryClient.getQueryData<PracticeProgressData>(progressKey)?.profile?.leaderboardOptIn;
  // GET bắt đầu trước completion có thể trả dữ liệu cũ; hủy đúng query đó trước khi đọc trạng thái đã duyệt.
  const refreshes = [queryClient.invalidateQueries({ queryKey: progressKey })];
  // Chưa biết opt-in không được tạo lượt đọc công khai chỉ vì công phu riêng vừa được duyệt.
  if (optIn !== false) refreshes.push(queryClient.invalidateQueries({
    queryKey: keys.leaderboard, refetchType: optIn === true ? 'active' : 'none',
  }));
  const contributionsKnown = typeof detail.contributionsAdded === 'number'
    && Number.isSafeInteger(detail.contributionsAdded) && detail.contributionsAdded >= 0;
  if (!contributionsKnown || (detail.contributionsAdded ?? 0) > 0) {
    refreshes.push(queryClient.invalidateQueries({
      queryKey: keys.campaigns(principalId), refetchType: contributionsKnown ? 'active' : 'none',
    }));
    // Prefix của admin bao gồm chi tiết thành viên; làm stale để lần mở sau tải đúng, không refetch mọi panel.
    refreshes.push(queryClient.invalidateQueries({ queryKey: keys.adminCampaigns(principalId), refetchType: 'none' }));
  }
  await Promise.all(refreshes);
}
