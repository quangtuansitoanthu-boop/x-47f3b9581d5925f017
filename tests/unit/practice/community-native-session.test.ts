import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ request: vi.fn(), fetch: vi.fn(), refresh: vi.fn(),
  session: { authenticated: true, csrfToken: 'csrf', user: { id: 'A', role: 'user' } } }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true }, CapacitorHttp: { request: mocks.request } }));
vi.mock('$lib/stores/session.svelte', () => ({ SESSION_CHANGE_EVENT: 'session-changed',
  getBrowserSessionSnapshot: () => mocks.session, isSessionExpired: () => false, refreshBrowserSession: mocks.refresh }));
vi.mock('$lib/browser/offline-bundled-resolver', () => ({ resolveOfflineBundledResponse: async () => null }));
vi.mock('$lib/browser/url-fallback', () => ({ refreshRemoteOrigin: vi.fn() }));
import { createMindfulPost, sendMindfulReaction, deleteMindfulPost } from '$lib/browser/mindful-community-client';
import { joinPracticeCampaign } from '$lib/browser/practice-community';
import { loadPersonalLunarEvents, savePersonalLunarEvents, pullPersonalLunarEventsFromServer, syncPersonalLunarEventsWithServer } from '$lib/browser/personal-lunar-events';

const draft = { clientPostId: 'post-a', kind: 'good_deed' as const, nickname: 'Đồng Tu', content: 'Việc lành' };
const actions = [
  ['create post', () => createMindfulPost(draft)],
  ['react', () => sendMindfulReaction('post-a', { nickname: 'Đồng Tu', templateId: 'hoan-hy' })],
  ['delete post', () => deleteMindfulPost('post-a')],
  ['join campaign', () => joinPracticeCampaign('campaign-a')],
] as const;
let storage: Map<string, string>;
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks(); storage = new Map();
  mocks.session = { authenticated: true, csrfToken: 'csrf', user: { id: 'A', role: 'user' } };
  mocks.refresh.mockResolvedValue({ authenticated: false });
  mocks.request.mockResolvedValue({ status: 401, data: { error: { message: 'expired' } }, headers: { 'content-type': 'application/json' } });
  mocks.fetch.mockResolvedValue(Response.json({ events: [], revision: 0 }));
  vi.stubGlobal('fetch', mocks.fetch);
  vi.stubGlobal('window', Object.assign(new EventTarget(), { location: { origin: 'https://localhost' } }));
  vi.stubGlobal('navigator', { onLine: true });
  vi.stubGlobal('Capacitor', { isNativePlatform: () => true });
  vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) });
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it.each(actions)('refreshes native 401 once for %s without replay', async (_name, action) => {
  await expect(action()).rejects.toThrow('expired');
  expect(mocks.request).toHaveBeenCalledOnce();
  expect(mocks.refresh).toHaveBeenCalledOnce();
  expect(mocks.fetch).not.toHaveBeenCalled();
});

it('keeps one native successful write and does not refresh', async () => {
  mocks.request.mockResolvedValue({ status: 200, data: { post: { id: 'post-a' } }, headers: {} });
  expect(await createMindfulPost(draft)).toEqual({ id: 'post-a' });
  expect(mocks.request).toHaveBeenCalledOnce();
  expect(mocks.refresh).not.toHaveBeenCalled(); expect(mocks.fetch).not.toHaveBeenCalled();
});

it('rejects the response when 401 refresh changes the principal', async () => {
  mocks.refresh.mockImplementationOnce(async () => { mocks.session = { ...mocks.session, user: { id: 'B', role: 'user' } }; });
  await expect(createMindfulPost(draft)).rejects.toThrow('sync_principal_changed');
  expect(mocks.request).toHaveBeenCalledOnce(); expect(mocks.refresh).toHaveBeenCalledOnce();
});

it('keeps custom fetcher ownership without sending a native write', async () => {
  const fetcher = vi.fn(async () => Response.json({ post: { id: 'custom' } }));
  expect(await createMindfulPost(draft, { fetcher })).toEqual({ id: 'custom' });
  expect(fetcher).toHaveBeenCalledOnce(); expect(mocks.request).not.toHaveBeenCalled();
  expect(mocks.refresh).not.toHaveBeenCalled();
});

it.each([false, true])('retains personal-event outbox after native401 refresh without retry (logout=%s)', async logout => {
  await pullPersonalLunarEventsFromServer();
  const events = [{ id: 'event-a', title: 'Ngày lễ', lunarDay: 15, lunarMonth: 7, type: 'gia-dinh' as const, createdAt: '2026-10-22' }];
  savePersonalLunarEvents(events);
  if (logout) mocks.refresh.mockImplementationOnce(async () => { mocks.session = { ...mocks.session, authenticated: false }; });
  await syncPersonalLunarEventsWithServer();
  expect(mocks.request).toHaveBeenCalledOnce(); expect(mocks.refresh).toHaveBeenCalledOnce();
  expect(mocks.fetch.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0);
  const saved = JSON.parse(storage.get('tutam_personal_lunar_events:v2:user:A')!);
  expect(saved.events).toEqual(events); expect(saved.pending).toBe(true);
  if (!logout) expect(loadPersonalLunarEvents()).toEqual(events);
  expect(storage.has('tutam_personal_lunar_events:v2:guest')).toBe(false);
});
