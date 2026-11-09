import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/svelte-query';

const { requireBrowserCsrf } = vi.hoisted(() => ({
  requireBrowserCsrf: vi.fn(async () => 'csrf-token'),
}));

vi.mock('$lib/browser/session-csrf', () => ({
  fetchWithSessionRefresh: vi.fn(),
  requireBrowserCsrf,
}));

import {
  createDedicationCardDownload,
  DEDICATION_CARD_FONT_ASSETS,
  DEDICATION_CARD_FONT_FAMILY,
  hasPngSignature,
  loadBundledDedicationCardFonts,
} from '$lib/browser/dedication-card';
import {
  contributePracticeCampaign,
  deletePracticeCampaign,
  deletePracticeCampaignContribution,
  fetchPracticeCampaignMembers,
  fetchPracticeCampaigns,
  fetchPracticeLeaderboard,
  fetchPracticeProgress,
  joinPracticeCampaign,
  withCampaignMembership,
  leavePracticeCampaign,
  updatePracticeProfile,
} from '$lib/browser/practice-community';
import { serverStateKeys } from '$lib/browser/server-state';

function jsonFetcher(payload: unknown = {}): typeof fetch {
  return vi.fn(async () => new Response(JSON.stringify(payload), {
    headers: { 'content-type': 'application/json' },
    status: 200,
  })) as unknown as typeof fetch;
}

describe('practice community browser client', () => {
  it('isolates block-filtered public rankings by principal while retaining the leaderboard invalidation prefix', () => {
    const keys = serverStateKeys.practiceCommunity as typeof serverStateKeys.practiceCommunity & {
      leaderboardForPrincipal: (principal: string) => readonly string[];
    };
    const a = keys.leaderboardForPrincipal('user-a');
    const b = keys.leaderboardForPrincipal('user-b');
    const guest = keys.leaderboardForPrincipal('anonymous');
    expect(a).not.toEqual(b);
    expect(a).not.toEqual(guest);
    expect(a.slice(0, keys.leaderboard.length)).toEqual(keys.leaderboard);
    const client = new QueryClient();
    client.setQueryData(a, { ranking: [{ authorId: 'visible-to-a' }] });
    expect(client.getQueryData(b)).toBeUndefined();
    expect(client.getQueryData(guest)).toBeUndefined();
  });
  it('applies membership once, retains feature flags, and does not mutate the previous cache', () => {
    const data = { enabled: true, campaigns: [{ id: 'goal', joined: false, memberCount: 7 }] } as any;
    const joined = withCampaignMembership(data, 'goal', true);
    expect(joined.enabled).toBe(true);
    expect(joined.campaigns[0].memberCount).toBe(8);
    expect(withCampaignMembership(joined, 'goal', true).campaigns[0].memberCount).toBe(8);
    expect(withCampaignMembership(joined, 'goal', false).campaigns[0].memberCount).toBe(7);
    expect(data.campaigns[0]).toEqual({ id: 'goal', joined: false, memberCount: 7 });
  });
  beforeEach(() => requireBrowserCsrf.mockClear());

  it('separates personalized campaign membership caches by principal', () => {
    expect(serverStateKeys.practiceCommunity.campaigns('user-a')).not.toEqual(
      serverStateKeys.practiceCommunity.campaigns('user-b'),
    );
    expect(serverStateKeys.practiceCommunity.campaigns('anonymous')).not.toEqual(
      serverStateKeys.practiceCommunity.campaigns('user-a'),
    );

    const queryClient = new QueryClient();
    queryClient.setQueryData(serverStateKeys.practiceCommunity.campaigns('user-a'), {
      campaigns: [{ id: 'campaign-a', joined: true }],
    });
    queryClient.setQueryData(serverStateKeys.practiceCommunity.campaigns('user-b'), {
      campaigns: [{ id: 'campaign-a', joined: false }],
    });
    expect(queryClient.getQueryData(serverStateKeys.practiceCommunity.campaigns('user-b'))).toEqual({
      campaigns: [{ id: 'campaign-a', joined: false }],
    });
  });

  it('keeps private progress separate from public ranking and campaign discovery', async () => {
    const fetcher = jsonFetcher({});
    await fetchPracticeProgress(fetcher);
    await fetchPracticeLeaderboard(fetcher);
    await fetchPracticeCampaigns(fetcher);

    expect(fetcher).toHaveBeenNthCalledWith(1, '/api/practice/progress', expect.objectContaining({
      headers: { accept: 'application/json' },
    }));
    expect(fetcher).toHaveBeenNthCalledWith(2, '/api/practice/leaderboard', expect.any(Object));
    expect(fetcher).toHaveBeenNthCalledWith(3, '/api/practice/campaigns', expect.any(Object));
  });

  it('requests draft campaigns only through the explicit admin query', async () => {
    const fetcher = jsonFetcher({ campaigns: [] });
    await fetchPracticeCampaigns(fetcher, { includeDrafts: true });
    expect(fetcher).toHaveBeenCalledWith('/api/practice/campaigns?includeDrafts=1', expect.any(Object));
  });

  it('sends CSRF-protected profile and membership mutations to encoded routes', async () => {
    const fetcher = jsonFetcher({ joined: true });
    await updatePracticeProfile({
      leaderboardOptIn: true,
      presenceOptIn: false,
      selectedBadge: 'streak-7',
      timeZone: 'Asia/Ho_Chi_Minh',
    }, fetcher);
    await joinPracticeCampaign('mua an/cu', fetcher);
    await leavePracticeCampaign('mua an/cu', fetcher);
    await deletePracticeCampaign('mua an/cu', fetcher);

    expect(requireBrowserCsrf).toHaveBeenCalledTimes(4);
    expect(fetcher).toHaveBeenNthCalledWith(1, '/api/practice/progress', expect.objectContaining({
      method: 'PATCH',
      headers: expect.objectContaining({ 'x-csrf-token': 'csrf-token' }),
    }));
    expect(fetcher).toHaveBeenNthCalledWith(2, '/api/practice/campaigns/mua%20an%2Fcu/join', expect.objectContaining({ method: 'POST' }));
    expect(fetcher).toHaveBeenNthCalledWith(3, '/api/practice/campaigns/mua%20an%2Fcu/membership', expect.objectContaining({ method: 'DELETE' }));
    expect(fetcher).toHaveBeenNthCalledWith(4, '/api/practice/campaigns/mua%20an%2Fcu', expect.objectContaining({ method: 'DELETE' }));
  });

  it('submits and deletes manual practice log contributions with CSRF protection', async () => {
    const fetcher = jsonFetcher({ contributed: true, contributionValue: 108 });
    await contributePracticeCampaign('goal-1', {
      logId: 1726372800000,
      type: 'Chép kinh',
      count: 108,
      date: '2026-09-04',
      note: 'Kinh Địa Tạng',
    }, fetcher);
    await deletePracticeCampaignContribution('goal-1', 1726372800000, fetcher);

    expect(requireBrowserCsrf).toHaveBeenCalledTimes(2);
    expect(fetcher).toHaveBeenNthCalledWith(1, '/api/practice/campaigns/goal-1/contribute', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        'content-type': 'application/json',
        'x-csrf-token': 'csrf-token',
      }),
      body: JSON.stringify({
        logId: 1726372800000,
        type: 'Chép kinh',
        count: 108,
        date: '2026-09-04',
        note: 'Kinh Địa Tạng',
      }),
    }));
    expect(fetcher).toHaveBeenNthCalledWith(2, '/api/practice/campaigns/goal-1/contribute?logId=1726372800000', expect.objectContaining({
      method: 'DELETE',
      headers: expect.objectContaining({
        'x-csrf-token': 'csrf-token',
      }),
    }));
  });

  it('loads contribution details only from the admin member endpoint', async () => {
    const fetcher = jsonFetcher({ members: [] });
    await fetchPracticeCampaignMembers('goal-1', fetcher);
    expect(fetcher).toHaveBeenCalledWith('/api/practice/campaigns/goal-1/members', expect.objectContaining({
      headers: { accept: 'application/json' },
    }));
  });

  it('accepts only real PNG bytes for dedication-card downloads', async () => {
    const valid = new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1])], { type: 'image/png' });
    const invalid = new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' });
    expect(await hasPngSignature(valid)).toBe(true);
    expect(await hasPngSignature(invalid)).toBe(false);
  });

  it('waits for the image destination and propagates a failed write', async () => {
    let rejectSave!: (error: Error) => void;
    const destination = new Promise<void>((_, reject) => { rejectSave = reject; });
    void destination.catch(() => {});
    const input = { displayName: 'Test', currentStreak: 0, longestStreak: 0, totalAcceptedCount: 0, totalAcceptedDurationSeconds: 0, totalSessions: 0, selectedBadge: null, badgeLabel: '', today: '2026-10-24' };
    const pending = createDedicationCardDownload(input, () => true, async () => new Blob(['png']), () => destination);
    const result = expect(pending).rejects.toThrow('write failed');
    await Promise.resolve();
    rejectSave(new Error('write failed'));
    await result;
  });

  it('does not announce a private card after its owner changes during the native save', async () => {
    let finish!: (saved:boolean) => void;
    let current = true;
    const destination = new Promise<boolean>(resolve => { finish=resolve; });
    const pending = createDedicationCardDownload({ displayName:'Test', currentStreak:0, longestStreak:0, totalAcceptedCount:0, totalAcceptedDurationSeconds:0, totalSessions:0, selectedBadge:null, badgeLabel:'', today:'2026-10-24' }, () => current, async () => new Blob(['png']), () => destination);
    await Promise.resolve();
    current = false; finish(true);
    await expect(pending).resolves.toBe(false);
  });

  it('does not download a deferred private dedication card after the principal changes', async () => {
    let resolveCard!: (blob: Blob) => void;
    const card = new Promise<Blob>((resolve) => { resolveCard = resolve; });
    let activePrincipal = 'user-a';
    const triggerDownload = vi.fn();
    const pending = createDedicationCardDownload({
      displayName: 'Người dùng A',
      currentStreak: 7,
      longestStreak: 12,
      totalAcceptedCount: 108,
      totalAcceptedDurationSeconds: 3_600,
      totalSessions: 9,
      selectedBadge: null,
      badgeLabel: '',
      today: '2026-09-04',
    }, () => activePrincipal === 'user-a', () => card, triggerDownload);

    activePrincipal = 'user-b';
    resolveCard(new Blob(['private-a'], { type: 'image/png' }));

    await expect(pending).resolves.toBe(false);
    expect(triggerDownload).not.toHaveBeenCalled();
  });

  it('loads every bundled dedication-card weight without an external network request', async () => {
    const constructed: Array<{ family: string; source: string; weight: string }> = [];
    const added: unknown[] = [];
    const externalFetch = vi.fn(async () => { throw new Error('offline'); });
    class OfflineFontFace {
      constructor(family: string, source: string, descriptors: { weight: string }) {
        constructed.push({ family, source, weight: descriptors.weight });
      }
      async load() { return this; }
    }

    await loadBundledDedicationCardFonts({
      add: (face) => added.push(face),
      ready: Promise.resolve(),
    }, OfflineFontFace);

    expect(externalFetch).not.toHaveBeenCalled();
    expect(constructed).toEqual(DEDICATION_CARD_FONT_ASSETS.map(({ path, weight }) => ({
      family: DEDICATION_CARD_FONT_FAMILY,
      source: `url("${path}") format("opentype")`,
      weight,
    })));
    expect(added).toHaveLength(DEDICATION_CARD_FONT_ASSETS.length);
    expect(constructed.every(({ source }) => source.startsWith('url("/fonts/san-francisco/SanFranciscoText-'))).toBe(true);
  });
});
