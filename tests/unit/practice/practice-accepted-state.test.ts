import { QueryClient, QueryObserver, type QueryKey } from '@tanstack/svelte-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { invalidateAcceptedPracticeState, serverStateKeys } from '$lib/browser/server-state';

let client: QueryClient;
let stops: Array<() => void>;
beforeEach(() => { client = new QueryClient(); stops = []; });
afterEach(() => { stops.forEach(stop => stop()); client.clear(); });

function active(key: QueryKey, data: unknown) {
  const fetcher = vi.fn(async () => data);
  const observer = new QueryObserver(client, { queryKey: key, queryFn: fetcher, initialData: data, staleTime: Infinity });
  stops.push(observer.subscribe(() => {}));
  return fetcher;
}

it('refreshes only active current-owner progress and confirmed changed community data once per accepted drain', async () => {
  const keys = serverStateKeys.practiceCommunity;
  const progress = active(keys.progress('a'), { profile: { leaderboardOptIn: true } });
  const leaderboard = active(keys.leaderboard, { ranking: [] });
  const campaigns = active(keys.campaigns('a'), { campaigns: [] });
  const other = active(keys.progress('b'), { profile: { leaderboardOptIn: true } });
  const otherCampaigns = active(keys.campaigns('b'), { campaigns: [] });
  const admin = active(keys.adminCampaigns('a'), { campaigns: [] });
  const members = active(keys.campaignMembers('a', 'campaign'), { members: [] });

  await invalidateAcceptedPracticeState(client, 'a', { principalId: 'a', acceptedCount: 12, contributionsAdded: 2 });

  expect(progress).toHaveBeenCalledTimes(1);
  expect(leaderboard).toHaveBeenCalledTimes(1);
  expect(campaigns).toHaveBeenCalledTimes(1);
  expect(other).not.toHaveBeenCalled();
  expect(otherCampaigns).not.toHaveBeenCalled();
  expect(admin).not.toHaveBeenCalled();
  expect(members).not.toHaveBeenCalled();
  expect(client.getQueryState(keys.adminCampaigns('a'))?.isInvalidated).toBe(true);
  expect(client.getQueryState(keys.campaignMembers('a', 'campaign'))?.isInvalidated).toBe(true);
});

it('does not fetch inactive caches or private data for another principal', async () => {
  const keys = serverStateKeys.practiceCommunity;
  client.setQueryData(keys.progress('a'), { profile: { leaderboardOptIn: true } });
  client.setQueryData(keys.leaderboard, { ranking: [] });
  client.setQueryData(keys.campaigns('a'), { campaigns: [] });
  client.setQueryData(keys.progress('b'), { profile: { leaderboardOptIn: true } });
  const fetcher = vi.fn();
  client.setDefaultOptions({ queries: { queryFn: fetcher } });

  await invalidateAcceptedPracticeState(client, 'a', { principalId: 'a', acceptedCount: 1, contributionsAdded: 1 });

  expect(fetcher).not.toHaveBeenCalled();
  expect(client.getQueryState(keys.progress('a'))?.isInvalidated).toBe(true);
  expect(client.getQueryState(keys.leaderboard)?.isInvalidated).toBe(true);
  expect(client.getQueryState(keys.campaigns('a'))?.isInvalidated).toBe(true);
  expect(client.getQueryState(keys.progress('b'))?.isInvalidated).toBe(false);
});

it('keeps public and campaign caches untouched for explicit opt-out and zero contributions', async () => {
  const keys = serverStateKeys.practiceCommunity;
  const progress = active(keys.progress('a'), { profile: { leaderboardOptIn: false } });
  const leaderboard = active(keys.leaderboard, { ranking: [] });
  const campaigns = active(keys.campaigns('a'), { campaigns: [] });

  await invalidateAcceptedPracticeState(client, 'a', { principalId: 'a', acceptedCount: 1, contributionsAdded: 0 });

  expect(progress).toHaveBeenCalledTimes(1);
  expect(leaderboard).not.toHaveBeenCalled();
  expect(campaigns).not.toHaveBeenCalled();
  expect(client.getQueryState(keys.leaderboard)?.isInvalidated).toBe(false);
  expect(client.getQueryState(keys.campaigns('a'))?.isInvalidated).toBe(false);
});

it('marks legacy unknown public effects stale without fetching extra private or public data', async () => {
  const keys = serverStateKeys.practiceCommunity;
  const leaderboard = active(keys.leaderboard, { ranking: [] });
  const campaigns = active(keys.campaigns('a'), { campaigns: [] });

  await invalidateAcceptedPracticeState(client, 'a', { principalId: 'a', acceptedCount: 1 });

  expect(leaderboard).not.toHaveBeenCalled();
  expect(campaigns).not.toHaveBeenCalled();
  expect(client.getQueryState(keys.leaderboard)?.isInvalidated).toBe(true);
  expect(client.getQueryState(keys.campaigns('a'))?.isInvalidated).toBe(true);
});

it('ignores stale principal events, guest events and unaccepted completion counts', async () => {
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  await invalidateAcceptedPracticeState(client, 'b', { principalId: 'a', acceptedCount: 1, contributionsAdded: 1 });
  await invalidateAcceptedPracticeState(client, null, { principalId: 'a', acceptedCount: 1, contributionsAdded: 1 });
  await invalidateAcceptedPracticeState(client, 'a', { principalId: 'a', acceptedCount: 0, contributionsAdded: 1 });
  expect(invalidate).not.toHaveBeenCalled();
});

it('replaces a pre-completion in-flight read instead of marking its older progress fresh', async () => {
  const key = serverStateKeys.practiceCommunity.progress('a');
  const oldProgress = { profile: { leaderboardOptIn: false }, totals: { acceptedCount: 0 } };
  const acceptedProgress = { profile: { leaderboardOptIn: false }, totals: { acceptedCount: 108 } };
  const signals: AbortSignal[] = [];
  let release!: (value: typeof oldProgress) => void;
  const pending = new Promise<typeof oldProgress>(resolve => { release = resolve; });
  const fetcher = vi.fn(({ signal }: { signal: AbortSignal }) => {
    signals.push(signal);
    return signals.length === 1 ? pending : Promise.resolve(acceptedProgress);
  });
  const observer = new QueryObserver(client, { queryKey: key, queryFn: fetcher, initialData: oldProgress, staleTime: Infinity });
  stops.push(observer.subscribe(() => {}));
  const beforeCompletion = client.refetchQueries({ queryKey: key });
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));

  const afterCompletion = invalidateAcceptedPracticeState(client, 'a', { principalId: 'a', acceptedCount: 1, contributionsAdded: 0 });
  release(oldProgress);
  await Promise.all([beforeCompletion, afterCompletion]);

  expect(client.getQueryData(key)).toEqual(acceptedProgress);
  expect(signals[0].aborted).toBe(true);
  expect(fetcher).toHaveBeenCalledTimes(2);
});
