import { QueryClient } from '@tanstack/svelte-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { PracticeProgressData } from '../../src/lib/browser/practice-community';
import { serverStateKeys } from '../../src/lib/browser/server-state';

const native = vi.hoisted(() => ({
  enabled: true,
  available: true,
  replaceSnapshot: vi.fn(),
}));
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => native.enabled,
    isPluginAvailable: () => native.available,
  },
  registerPlugin: () => ({ replaceSnapshot: native.replaceSnapshot }),
}));

const now = new Date('2026-11-01T12:00:00+07:00');
const currentProgress = (): PracticeProgressData => ({
  profile: { leaderboardOptIn: false, presenceOptIn: false, selectedBadge: null, timeZone: 'Asia/Ho_Chi_Minh' },
  heatmap: [], streaks: { current: 14, longest: 18 }, badges: [],
  totals: { acceptedCount: 1080, acceptedDurationSeconds: 1800, sessions: 3 },
  breakdown: [{ activityType: 'meditation', sourceId: null, sourceKind: null, sessionCount: 3, acceptedCount: 3, acceptedDurationSeconds: 1800 }],
  today: '2026-11-01',
});
let windowEvents: EventTarget;
let documentEvents: EventTarget & { visibilityState: string };
let client: QueryClient;
let stop: (() => void) | undefined;
const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(now);
  native.enabled = true; native.available = true;
  native.replaceSnapshot.mockReset().mockResolvedValue(undefined);
  windowEvents = new EventTarget();
  documentEvents = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  vi.stubGlobal('window', windowEvents); vi.stubGlobal('document', documentEvents);
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Widget must not fetch'); }));
  client = new QueryClient();
});
afterEach(() => { stop?.(); stop = undefined; client.clear(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it('does not invent daily completion targets or sample progress from lifetime totals', async () => {
  const { buildPracticeWidgetSnapshot } = await import('../../src/lib/browser/practice-widget');
  const result = buildPracticeWidgetSnapshot(currentProgress(), now);
  expect(result).toMatchObject({ date: '2026-11-01', hasData: false, completionPercent: null, completedCount: null, totalCount: null, streakDays: 14 });
  expect(result.items.map(item => item.id)).toEqual(['meditation', 'chanting_beads', 'sutra', 'mantra']);
  expect(result.items.every(item => item.progress === null && item.hasData === false && item.isCompleted === false)).toBe(true);
  expect(JSON.stringify(result)).not.toContain('1080');
});

it('marks missing, stale and differently scoped calendar-day summaries as unavailable', async () => {
  const { buildPracticeWidgetSnapshot } = await import('../../src/lib/browser/practice-widget');
  for (const progress of [undefined, { ...currentProgress(), today: '2026-10-31' }, { ...currentProgress(), profile: { ...currentProgress().profile, timeZone: 'America/New_York' } }]) {
    expect(buildPracticeWidgetSnapshot(progress, now).streakDays).toBeNull();
  }
  expect(buildPracticeWidgetSnapshot(undefined, new Date('2026-11-01T18:00:00Z')).date).toBe('2026-11-02');
});

it('localizes item copy without inventing progress or fetching on a locale change', async () => {
  const { buildPracticeWidgetSnapshot, startPracticeWidgetSync } = await import('../../src/lib/browser/practice-widget');
  expect(buildPracticeWidgetSnapshot(undefined, now, 'en')).toMatchObject({ locale: 'en', hasData: false, items: [{ title: 'Meditation', progress: null }, {}, {}, {}] });
  let locale = 'vi';
  stop = startPracticeWidgetSync(client, () => ({ authenticated: false, user: null }), () => locale);
  await flush();
  locale = 'en'; windowEvents.dispatchEvent(new Event('quangtu:locale-changed'));
  await flush();
  expect(native.replaceSnapshot.mock.calls.at(-1)?.[0]).toMatchObject({ locale: 'en', hasData: false });
  expect(fetch).not.toHaveBeenCalled();
});

it('ignores malformed accepted streak values instead of publishing nonfinite or negative metrics', async () => {
  const { buildPracticeWidgetSnapshot } = await import('../../src/lib/browser/practice-widget');
  for (const current of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    const value = { ...currentProgress(), streaks: { current, longest: 0 } };
    expect(buildPracticeWidgetSnapshot(value, now).streakDays).toBeNull();
  }
});

it('has no native effects on web or an older binary without the plugin', async () => {
  const { startPracticeWidgetSync } = await import('../../src/lib/browser/practice-widget');
  for (const input of [{ enabled: false, available: true }, { enabled: true, available: false }]) {
    Object.assign(native, input);
    startPracticeWidgetSync(client, () => ({ authenticated: true, user: { id: 'alice' } }))();
  }
  await flush(); expect(native.replaceSnapshot).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
});

it('reads only the current principal cache, dedupes updates and does not issue HTTP or SQL', async () => {
  const { startPracticeWidgetSync } = await import('../../src/lib/browser/practice-widget');
  client.setQueryData(serverStateKeys.practiceCommunity.progress('alice'), currentProgress());
  stop = startPracticeWidgetSync(client, () => ({ authenticated: true, user: { id: 'alice' } }));
  await flush();
  expect(native.replaceSnapshot).toHaveBeenCalledTimes(1);
  expect(native.replaceSnapshot.mock.calls[0][0]).toMatchObject({ streakDays: 14 });
  client.setQueryData(serverStateKeys.practiceCommunity.progress('bob'), currentProgress());
  documentEvents.dispatchEvent(new Event('visibilitychange'));
  await flush(); expect(native.replaceSnapshot).toHaveBeenCalledTimes(1);
  client.setQueryData(serverStateKeys.practiceCommunity.progress('alice'), { ...currentProgress(), streaks: { current: 15, longest: 18 } });
  await flush(); expect(native.replaceSnapshot).toHaveBeenCalledTimes(2);
  expect(fetch).not.toHaveBeenCalled();
});

it('clears the native private snapshot on account switch and logout without waiting for a mounted dashboard', async () => {
  const { startPracticeWidgetSync } = await import('../../src/lib/browser/practice-widget');
  let session: { authenticated: boolean; user: { id: string } | null } = { authenticated: true, user: { id: 'alice' } };
  client.setQueryData(serverStateKeys.practiceCommunity.progress('alice'), currentProgress());
  stop = startPracticeWidgetSync(client, () => session);
  await flush();
  session = { authenticated: true, user: { id: 'bob' } }; windowEvents.dispatchEvent(new Event('quangtu:session-changed'));
  await flush(); expect(native.replaceSnapshot.mock.calls.at(-1)?.[0]).toMatchObject({ streakDays: null, hasData: false });
  session = { authenticated: false, user: null }; windowEvents.dispatchEvent(new Event('quangtu:session-changed'));
  await flush(); expect(native.replaceSnapshot.mock.calls.at(-1)?.[0]).toMatchObject({ streakDays: null, hasData: false });
  expect(JSON.stringify(native.replaceSnapshot.mock.calls)).not.toMatch(/alice|bob|csrf|token/);
});

it('serializes a late old-account bridge write before the new account clear and removes listeners on stop', async () => {
  const { startPracticeWidgetSync } = await import('../../src/lib/browser/practice-widget');
  let finish: () => void = () => {};
  native.replaceSnapshot.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
  let session: { authenticated: boolean; user: { id: string } | null } = { authenticated: true, user: { id: 'alice' } };
  client.setQueryData(serverStateKeys.practiceCommunity.progress('alice'), currentProgress());
  stop = startPracticeWidgetSync(client, () => session); await flush();
  session = { authenticated: false, user: null }; windowEvents.dispatchEvent(new Event('quangtu:session-changed')); await flush();
  expect(native.replaceSnapshot).toHaveBeenCalledTimes(1);
  finish(); await flush(); expect(native.replaceSnapshot).toHaveBeenCalledTimes(2);
  expect(native.replaceSnapshot.mock.calls[1][0]).toMatchObject({ streakDays: null });
  stop(); stop = undefined;
  documentEvents.dispatchEvent(new Event('visibilitychange'));
  windowEvents.dispatchEvent(new Event('quangtu:session-changed')); await flush();
  expect(native.replaceSnapshot).toHaveBeenCalledTimes(2);
});

it('drops an intermediate pending account when selection returns to the account currently writing', async () => {
  const { startPracticeWidgetSync } = await import('../../src/lib/browser/practice-widget');
  let finish: () => void = () => {};
  native.replaceSnapshot.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
  let session = { authenticated: true, user: { id: 'alice' } };
  client.setQueryData(serverStateKeys.practiceCommunity.progress('alice'), currentProgress());
  stop = startPracticeWidgetSync(client, () => session); await flush();
  session = { authenticated: true, user: { id: 'bob' } };
  windowEvents.dispatchEvent(new Event('quangtu:session-changed'));
  session = { authenticated: true, user: { id: 'alice' } };
  windowEvents.dispatchEvent(new Event('quangtu:session-changed'));
  finish(); await flush();
  expect(native.replaceSnapshot).toHaveBeenCalledTimes(1);
  expect(native.replaceSnapshot.mock.calls[0][0]).toMatchObject({ streakDays: 14 });
});

it('expires yesterday accepted streak at Vietnam midnight through the existing day watcher without fetching', async () => {
  vi.setSystemTime(new Date('2026-11-01T16:59:59.000Z'));
  const { startPracticeWidgetSync } = await import('../../src/lib/browser/practice-widget');
  client.setQueryData(serverStateKeys.practiceCommunity.progress('alice'), currentProgress());
  stop = startPracticeWidgetSync(client, () => ({ authenticated: true, user: { id: 'alice' } }));
  await flush();
  expect(native.replaceSnapshot.mock.calls[0][0]).toMatchObject({ date: '2026-11-01', streakDays: 14 });
  await vi.advanceTimersByTimeAsync(1101);
  expect(native.replaceSnapshot.mock.calls.at(-1)?.[0]).toMatchObject({ date: '2026-11-02', streakDays: null });
  expect(native.replaceSnapshot).toHaveBeenCalledTimes(2);
  expect(fetch).not.toHaveBeenCalled();
});

it('does not publish an initial fallback summary until a real accepted query result replaces it', async () => {
  const { startPracticeWidgetSync } = await import('../../src/lib/browser/practice-widget');
  const key = serverStateKeys.practiceCommunity.progress('alice');
  client.setQueryData(key, currentProgress(), { updatedAt: 0 });
  stop = startPracticeWidgetSync(client, () => ({ authenticated: true, user: { id: 'alice' } }));
  await flush();
  expect(native.replaceSnapshot.mock.calls.at(-1)?.[0]).toMatchObject({ streakDays: null });
  client.setQueryData(key, currentProgress(), { updatedAt: now.getTime() });
  await flush();
  expect(native.replaceSnapshot.mock.calls.at(-1)?.[0]).toMatchObject({ streakDays: 14 });
  expect(fetch).not.toHaveBeenCalled();
});

it('hides an invalidated cached streak until the existing progress owner supplies a fresh result', async () => {
  const { startPracticeWidgetSync } = await import('../../src/lib/browser/practice-widget');
  const key = serverStateKeys.practiceCommunity.progress('alice');
  client.setQueryData(key, currentProgress());
  stop = startPracticeWidgetSync(client, () => ({ authenticated: true, user: { id: 'alice' } }));
  await flush();
  expect(native.replaceSnapshot.mock.calls.at(-1)?.[0]).toMatchObject({ streakDays: 14 });
  await client.invalidateQueries({ queryKey: key, exact: true, refetchType: 'none' });
  await flush();
  expect(native.replaceSnapshot.mock.calls.at(-1)?.[0]).toMatchObject({ streakDays: null });
  client.setQueryData(key, { ...currentProgress(), streaks: { current: 15, longest: 18 } });
  await flush();
  expect(native.replaceSnapshot.mock.calls.at(-1)?.[0]).toMatchObject({ streakDays: 15 });
  expect(fetch).not.toHaveBeenCalled();
});

it('finishes the queued anonymous clear after logout even when the root is disposed during an old write', async () => {
  const { startPracticeWidgetSync } = await import('../../src/lib/browser/practice-widget');
  let finish: () => void = () => {};
  native.replaceSnapshot.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
  let session: { authenticated: boolean; user: { id: string } | null } = { authenticated: true, user: { id: 'alice' } };
  client.setQueryData(serverStateKeys.practiceCommunity.progress('alice'), currentProgress());
  stop = startPracticeWidgetSync(client, () => session);
  await flush();
  session = { authenticated: false, user: null };
  windowEvents.dispatchEvent(new Event('quangtu:session-changed'));
  stop(); stop = undefined;
  finish();
  await flush();
  expect(native.replaceSnapshot).toHaveBeenCalledTimes(2);
  expect(native.replaceSnapshot.mock.calls.at(-1)?.[0]).toMatchObject({ streakDays: null, hasData: false });
  documentEvents.dispatchEvent(new Event('visibilitychange'));
  client.setQueryData(serverStateKeys.practiceCommunity.progress('alice'), currentProgress());
  await flush();
  expect(native.replaceSnapshot).toHaveBeenCalledTimes(2);
});

it('replaces a queued new-account private write with a clear when account switching is interrupted by disposal', async () => {
  const { startPracticeWidgetSync } = await import('../../src/lib/browser/practice-widget');
  let finish: () => void = () => {};
  native.replaceSnapshot.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
  let session = { authenticated: true, user: { id: 'alice' } };
  client.setQueryData(serverStateKeys.practiceCommunity.progress('alice'), currentProgress());
  client.setQueryData(serverStateKeys.practiceCommunity.progress('bob'), { ...currentProgress(), streaks: { current: 25, longest: 25 } });
  stop = startPracticeWidgetSync(client, () => session);
  await flush();
  session = { authenticated: true, user: { id: 'bob' } };
  windowEvents.dispatchEvent(new Event('quangtu:session-changed'));
  stop(); stop = undefined;
  finish();
  await flush();
  expect(native.replaceSnapshot).toHaveBeenCalledTimes(2);
  expect(native.replaceSnapshot.mock.calls.at(-1)?.[0]).toMatchObject({ streakDays: null });
  expect(native.replaceSnapshot.mock.calls.every(([snapshot]) => snapshot.streakDays !== 25)).toBe(true);
});
