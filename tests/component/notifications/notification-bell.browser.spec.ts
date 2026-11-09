import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { onlineManager, QueryClient } from '@tanstack/svelte-query';
import Harness from './notification-bell-harness.svelte';
const mocks = vi.hoisted(() => ({ fetch: vi.fn(), admin: vi.fn(), goto: vi.fn() }));
vi.mock('$app/navigation', () => ({ goto: mocks.goto }));
vi.mock('$lib/browser/mindful-community-client', () => ({ fetchMindfulNotifications: mocks.fetch }));
vi.mock('$lib/browser/session-csrf', () => ({ fetchWithSessionRefresh: mocks.admin }));
vi.mock('$lib/stores/session.svelte', () => ({ SESSION_CONTEXT: Symbol('session') }));
vi.mock('$lib/browser/native-platform', () => ({ isNativeApp: () => false }));
vi.mock('$lib/components/lunar/lunar-events', () => ({ getLunarEvent: () => ({ lunarDay: 2, lunarMonth: 1, isThapTrai: false }) }));
vi.mock('$lib/stores/locale.svelte', async () => {
  const { translations } = await import('$lib/i18n/translations');
  return { getLocaleContext: () => ({ current: 'vi', t: translations.vi }) };
});
let component: ReturnType<typeof Harness> | undefined;
let client: QueryClient;
const user = (id: string) => ({ authenticated: true, user: { id, displayName: id, role: 'user' as const } });
const notice = (id: string, nickname = 'Diệu Âm') => ({ id, postId: 'post/+1', kind: 'repentance' as const, nickname, templateId: 'tam-bao', text: 'Lời cầu nguyện', createdAt: '2026-11-09T01:00:00Z' });
const page = (items = [notice('one')], nextCursor: string | null = null) => ({ enabled: true, items, nextCursor });
const settle = async () => { await new Promise(resolve => setTimeout(resolve, 0)); flushSync(); };
const bell = () => document.querySelector<HTMLButtonElement>('.notification-bell-btn')!;
async function start(initial = user('a'), ready = true) {
  component = mount(Harness, { target: document.body, props: { client, initial, ready } }); await settle(); await settle();
}
beforeEach(() => {
  onlineManager.setOnline(true);
  mocks.fetch.mockReset().mockResolvedValue(page()); mocks.admin.mockReset(); mocks.goto.mockReset();
  localStorage.clear(); client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); client.mount();
});
afterEach(async () => { if (component) await unmount(component); component = undefined; client.clear(); client.unmount(); vi.restoreAllMocks(); localStorage.clear(); document.body.replaceChildren(); });

it('loads once for a resolved principal and reuses the root cache through toggles and remount', async () => {
  await start(); expect(mocks.fetch).toHaveBeenCalledTimes(1); bell().click(); await settle();
  expect(document.querySelector('.mindful-item')?.textContent).toContain('Diệu Âm');
  bell().click(); bell().click(); await settle(); expect(mocks.fetch).toHaveBeenCalledTimes(1);
  await unmount(component!); component = undefined; await start(); bell().click(); await settle();
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
});

it('recovers an interrupted initial read on same-principal remount without keeping a permanent pending state', async () => {
  mocks.fetch.mockImplementationOnce(() => new Promise(() => {})).mockResolvedValueOnce(page());
  await start(); const signal = mocks.fetch.mock.calls[0][1].signal as AbortSignal;
  await unmount(component!); component = undefined;
  expect(signal.aborted).toBe(true);
  await start();
  expect(mocks.fetch).toHaveBeenCalledTimes(2);
  bell().click(); await settle();
  expect(document.querySelector('.mindful-item')?.textContent).toContain('Diệu Âm');
});

it('does not refresh a stale inbox on remount and refreshes only its first page on explicit open', async () => {
  mocks.fetch.mockResolvedValueOnce(page([notice('one')], 'older-page'))
    .mockResolvedValueOnce(page([notice('two')]))
    .mockResolvedValueOnce(page([notice('new')]));
  await start(); bell().click(); await settle();
  document.querySelector<HTMLButtonElement>('.notification-more')!.click(); await settle(); await settle();
  expect(mocks.fetch).toHaveBeenCalledTimes(2);
  const key = ['mindful-community', 'a', 'notifications'];
  client.setQueryData(key, client.getQueryData(key), { updatedAt: Date.now() - 60_001 });
  await unmount(component!); component = undefined; await start();
  expect(mocks.fetch).toHaveBeenCalledTimes(2);
  bell().click(); await settle(); await settle();
  expect(mocks.fetch).toHaveBeenCalledTimes(3);
  expect(mocks.fetch.mock.calls[2][0]).toBeNull();
  expect(document.querySelectorAll('.mindful-item')).toHaveLength(1);
});

it('waits for initial session resolution and never loads account notifications for a guest', async () => {
  await start(user('a'), false); expect(mocks.fetch).not.toHaveBeenCalled();
  component!.resolve(); await settle(); await settle(); expect(mocks.fetch).toHaveBeenCalledTimes(1);
  component!.select({ authenticated: false, user: null }); await settle(); bell().click(); await settle();
  expect(document.querySelector('.mindful-item')).toBeNull(); expect(mocks.fetch).toHaveBeenCalledTimes(1);
});

it('aborts old-principal work and rejects its late content after switching accounts', async () => {
  let resolve!: (value: ReturnType<typeof page>) => void;
  mocks.fetch.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  await start(); const signal = mocks.fetch.mock.calls[0][1].signal as AbortSignal;
  component!.select(user('b')); await settle(); await settle(); expect(signal.aborted).toBe(true);
  resolve(page([notice('private-a', 'Old private nickname')])); await settle(); bell().click(); await settle();
  expect(document.querySelector('.notification-list')?.textContent).not.toContain('Old private nickname');
  expect(mocks.fetch).toHaveBeenCalledTimes(2);
});

it('offers manual paging for an empty filtered page and renders each event only once', async () => {
  mocks.fetch.mockResolvedValueOnce(page([], 'filtered-next')).mockResolvedValueOnce(page([notice('one'), notice('one')]));
  await start(); bell().click(); await settle(); expect(mocks.fetch).toHaveBeenCalledTimes(1);
  const more = document.querySelector<HTMLButtonElement>('.notification-more')!;
  more.click(); more.click(); await settle(); await settle();
  expect(mocks.fetch.mock.calls[1][0]).toBe('filtered-next');
  expect(mocks.fetch).toHaveBeenCalledTimes(2);
  expect(document.querySelectorAll('.mindful-item')).toHaveLength(1);
});

it('keeps failed reads explicit with retry instead of retrying on every bell open', async () => {
  mocks.fetch.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(page());
  await start();
  await vi.waitFor(() => { flushSync(); expect(client.getQueryState(['mindful-community', 'a', 'notifications'])?.status).toBe('error'); });
  bell().click(); await settle();
  expect(document.querySelector('.notification-load-state')?.textContent).toContain('Chưa thể tải thông báo');
  bell().click(); bell().click(); await settle(); expect(mocks.fetch).toHaveBeenCalledTimes(1);
  document.querySelector<HTMLButtonElement>('.notification-load-state button')!.click(); await settle(); await settle();
  expect(document.querySelector('.mindful-item')).not.toBeNull(); expect(mocks.fetch).toHaveBeenCalledTimes(2);
});

it('fails an offline read immediately and does not resume it when connectivity returns', async () => {
  onlineManager.setOnline(false);
  mocks.fetch.mockRejectedValueOnce(new Error('offline'));
  await start();
  await vi.waitFor(() => { flushSync(); expect(client.getQueryState(['mindful-community', 'a', 'notifications'])?.status).toBe('error'); });
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
  onlineManager.setOnline(true); await settle();
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
});

it('marks read locally and keeps normal reminders available without a write or feed lookup', async () => {
  await start(); bell().click(); await settle();
  document.querySelector<HTMLButtonElement>('.mark-all-btn')!.click(); await settle();
  expect(document.querySelector('.notification-popover')).not.toBeNull();
  expect(JSON.parse(localStorage.getItem('quangtu_notifications_read_a') ?? '[]')).toContain('mindful-reaction:one');
  expect(document.querySelector('.mindful-item')?.classList.contains('unread')).toBe(false);
  expect(mocks.fetch).toHaveBeenCalledTimes(1); expect(mocks.admin).not.toHaveBeenCalled();
});
