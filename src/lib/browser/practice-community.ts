import type { PracticeBadgeId, PracticeHeatmapDay } from '$lib/domain/practice/progress-achievements';
import type { CommunityAuthor, OwnCommunityProfile } from '$lib/contracts/community-moderation';
import { fetchWithSessionRefresh, requireBrowserCsrf } from './session-csrf';
import { isHtmlResponse, resolveApiUrl } from './native-api';
import { blocksNativeAdminWrite } from './admin-access';
import { isNativeApp } from './native-platform';
import { getBrowserSessionSnapshot } from '$lib/stores/session.svelte';
import { NATIVE_ADMIN_READ_ONLY_MESSAGE } from '$lib/i18n/admin-access';

export interface PracticeProgressData {
  profile: {
    leaderboardOptIn: boolean;
    presenceOptIn: boolean;
    selectedBadge: PracticeBadgeId | null;
    timeZone: string;
    publicProfile?: Pick<OwnCommunityProfile, 'authorId' | 'moderationStatus' | 'moderationReason' | 'revision'> | null;
  };
  heatmap: PracticeHeatmapDay[];
  streaks: { current: number; longest: number };
  badges: PracticeBadgeId[];
  totals: {
    acceptedCount: number;
    acceptedDurationSeconds: number;
    sessions: number;
  };
  breakdown: {
    practiceType?: string | null;
    activityType: string;
    sourceKind: string | null;
    sourceId: string | null;
    title?: string | null;
    sessionCount: number;
    acceptedCount: number;
    acceptedDurationSeconds: number;
  }[];
  today: string;
}

export interface PracticeLeaderboardEntry extends CommunityAuthor {
  rank: number;
  displayName: string;
  avatarUrl: string;
  selectedBadge: PracticeBadgeId | null;
  activeDays: number;
  acceptedCount: number;
  acceptedDurationSeconds: number;
  currentStreak: number;
  sessions: number;
}

export interface PracticeLeaderboardData {
  enabled?: boolean;
  generatedAt: string;
  metric: {
    key: string;
    windowDays: number;
    description: string;
  };
  ranking: PracticeLeaderboardEntry[];
}

export type PracticeCampaignMetric = 'count' | 'duration_seconds' | 'sessions';
export type PracticeCampaignStatus = 'draft' | 'active' | 'closed';

export interface PracticeCampaign {
  id: string;
  title: string;
  description: string;
  metric: PracticeCampaignMetric;
  goalValue: number;
  contributionValue: number;
  memberCount: number;
  startsAt: string;
  endsAt: string;
  status: PracticeCampaignStatus;
  createdAt: string;
  updatedAt: string;
  joined?: boolean;
}

export interface PracticeCampaignListData {
  enabled?: boolean;
  campaigns: PracticeCampaign[];
}

/** Apply confirmed membership once, retaining server feature flags. */
export function withCampaignMembership(data: PracticeCampaignListData, id: string, joined: boolean): PracticeCampaignListData {
  return { ...data, campaigns: data.campaigns.map((campaign) => campaign.id !== id ? campaign : {
    ...campaign,
    joined,
    memberCount: Math.max(0, campaign.memberCount + (Boolean(campaign.joined) === joined ? 0 : joined ? 1 : -1)),
  }) };
}

export interface PracticeCampaignInput {
  title: string;
  description: string;
  metric: PracticeCampaignMetric;
  goalValue: number;
  startsAt: string;
  endsAt: string;
  status: PracticeCampaignStatus;
}

export interface PracticeCampaignMember {
  ownerId: string;
  displayName: string;
  avatarUrl: string;
  identityVisible: boolean;
  joinedAt: string;
  leftAt: string | null;
  contributionValue: number;
}

export interface PracticeCampaignMembersData {
  members: PracticeCampaignMember[];
}

type Fetcher = typeof fetch;

// No polling or focus/reconnect reads. Mutations update this cache explicitly.
export const PRACTICE_COMMUNITY_QUERY_POLICY = {
  staleTime: 15 * 60 * 1000,
  gcTime: 60 * 60 * 1000,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
  retry: false,
} as const;

export function fetchPracticeProgress(fetcher: Fetcher = fetch, signal?: AbortSignal): Promise<PracticeProgressData> {
  return requestJson(fetcher, '/api/practice/progress', { headers: { accept: 'application/json' }, signal });
}

export async function updatePracticeProfile(
  input: PracticeProgressData['profile'],
  fetcher: Fetcher = fetchWithSessionRefresh,
): Promise<PracticeProgressData> {
  return requestJson(fetcher, '/api/practice/progress', {
    method: 'PATCH',
    headers: await mutationHeaders(),
    body: JSON.stringify(input),
  });
}

export function fetchPracticeLeaderboard(
  fetcher: Fetcher = fetch,
  signal?: AbortSignal,
): Promise<PracticeLeaderboardData> {
  return requestJson(fetcher, '/api/practice/leaderboard', { headers: { accept: 'application/json' }, signal });
}

export function fetchPracticeCampaigns(
  fetcher: Fetcher = fetch,
  options: { includeDrafts?: boolean; signal?: AbortSignal } = {},
): Promise<PracticeCampaignListData> {
  const query = options.includeDrafts ? '?includeDrafts=1' : '';
  return requestJson(fetcher, `/api/practice/campaigns${query}`, {
    headers: { accept: 'application/json' },
    signal: options.signal,
  });
}

export async function joinPracticeCampaign(
  campaignId: string,
  fetcher: Fetcher = fetchWithSessionRefresh,
): Promise<{ joined: boolean }> {
  return requestJson(fetcher, `/api/practice/campaigns/${encodeURIComponent(campaignId)}/join`, {
    method: 'POST',
    headers: await mutationHeaders(),
    body: '{}',
  });
}

export async function leavePracticeCampaign(
  campaignId: string,
  fetcher: Fetcher = fetchWithSessionRefresh,
): Promise<{ left: boolean }> {
  return requestJson(fetcher, `/api/practice/campaigns/${encodeURIComponent(campaignId)}/membership`, {
    method: 'DELETE',
    headers: await mutationHeaders(),
  });
}

export async function contributePracticeCampaign(
  campaignId: string,
  input: { logId: number; type: string; count: number; date: string; note?: string },
  fetcher: Fetcher = fetchWithSessionRefresh,
): Promise<{ contributed: boolean; contributionValue: number }> {
  return requestJson(fetcher, `/api/practice/campaigns/${encodeURIComponent(campaignId)}/contribute`, {
    method: 'POST',
    headers: await mutationHeaders(),
    body: JSON.stringify(input),
  });
}

export async function deletePracticeCampaignContribution(
  campaignId: string,
  logId: number,
  fetcher: Fetcher = fetchWithSessionRefresh,
): Promise<{ deleted: boolean }> {
  return requestJson(fetcher, `/api/practice/campaigns/${encodeURIComponent(campaignId)}/contribute?logId=${encodeURIComponent(logId)}`, {
    method: 'DELETE',
    headers: await mutationHeaders(),
  });
}

export async function createPracticeCampaign(
  input: PracticeCampaignInput,
  fetcher: Fetcher = fetchWithSessionRefresh,
): Promise<{ campaign: PracticeCampaign }> {
  return requestJson(fetcher, '/api/practice/campaigns', {
    method: 'POST',
    headers: await mutationHeaders(),
    body: JSON.stringify(input),
  });
}

export async function updatePracticeCampaign(
  campaignId: string,
  input: PracticeCampaignInput,
  fetcher: Fetcher = fetchWithSessionRefresh,
): Promise<{ campaign: PracticeCampaign }> {
  return requestJson(fetcher, `/api/practice/campaigns/${encodeURIComponent(campaignId)}`, {
    method: 'PATCH',
    headers: await mutationHeaders(),
    body: JSON.stringify(input),
  });
}

export async function deletePracticeCampaign(
  campaignId: string,
  fetcher: Fetcher = fetchWithSessionRefresh,
): Promise<void> {
  await requestJson(fetcher, `/api/practice/campaigns/${encodeURIComponent(campaignId)}`, {
    method: 'DELETE',
    headers: { 'x-csrf-token': await requireBrowserCsrf() },
  });
}

export function fetchPracticeCampaignMembers(
  campaignId: string,
  fetcher: Fetcher = fetchWithSessionRefresh,
  signal?: AbortSignal,
): Promise<PracticeCampaignMembersData> {
  return requestJson(fetcher, `/api/practice/campaigns/${encodeURIComponent(campaignId)}/members`, {
    headers: { accept: 'application/json' },
    signal,
  });
}

async function mutationHeaders(): Promise<Record<string, string>> {
  return {
    accept: 'application/json',
    'content-type': 'application/json',
    'x-csrf-token': await requireBrowserCsrf(),
  };
}

async function requestJson<T>(fetcher: Fetcher, input: string, init?: RequestInit): Promise<T> {
  if (isNativeApp() && await blocksNativeAdminWrite(input, init, getBrowserSessionSnapshot()?.user?.role)) {
    throw new Error(NATIVE_ADMIN_READ_ONLY_MESSAGE);
  }
  const target = input.startsWith('/api/') ? resolveApiUrl(input) : input;
  const mergedInit: RequestInit = { credentials: 'include', ...init };
  const response = await fetcher(fetcher === fetchWithSessionRefresh ? input : target, mergedInit);
  if (!response.ok) throw new Error(await responseMessage(response));
  if (isHtmlResponse(response)) throw new Error(`Yêu cầu thất bại (${response.status}).`);
  try {
    return (await response.json()) as Promise<T>;
  } catch {
    throw new Error(`Yêu cầu thất bại (${response.status}).`);
  }
}

async function responseMessage(response: Response): Promise<string> {
  try {
    const payload = await response.json() as { error?: { message?: string } };
    return payload.error?.message || `Yêu cầu thất bại (${response.status}).`;
  } catch {
    return `Yêu cầu thất bại (${response.status}).`;
  }
}
