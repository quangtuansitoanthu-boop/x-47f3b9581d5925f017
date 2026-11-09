import { afterEach, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/svelte-query';
vi.mock('$lib/stores/session.svelte', () => ({ getBrowserSessionSnapshot:() => null, isSessionExpired:() => false, refreshBrowserSession:vi.fn() }));
import { resolveOfflineBundledResponse } from '$lib/browser/offline-bundled-resolver';
import { fetchPracticeProgress } from '$lib/browser/practice-community';
import { fetchWithSessionRefresh } from '$lib/browser/session-csrf';

afterEach(() => vi.unstubAllGlobals());
it.each(['/api/practice/progress','/api/practice/campaigns','/api/practice/leaderboard'])('does not substitute malformed successful community data while offline: %s', async path => {
  const response = await resolveOfflineBundledResponse(path);
  expect(response?.status).toBe(503);
  expect(response?.ok).toBe(false);
  expect(await response?.json()).toMatchObject({ error:{code:'offline_unavailable'} });
});
it('retains the last private progress snapshot after an offline refresh instead of replacing it with an invalid payload', async () => {
  vi.stubGlobal('navigator',{onLine:false});
  const network=vi.fn(); vi.stubGlobal('fetch',network);
  const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
  const previous={profile:{selectedBadge:null},streaks:{current:7,longest:12},totals:{acceptedCount:108},breakdown:[]};
  const key=['practice','offline-regression']; client.setQueryData(key,previous);
  try {
    await expect(client.fetchQuery({queryKey:key,queryFn:() => fetchPracticeProgress(fetchWithSessionRefresh),staleTime:0})).rejects.toThrow();
    expect(client.getQueryData(key)).toEqual(previous);
    expect(network).not.toHaveBeenCalled();
  } finally {client.clear();}
});
