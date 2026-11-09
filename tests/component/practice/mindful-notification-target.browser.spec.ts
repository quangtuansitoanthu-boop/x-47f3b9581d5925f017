import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { QueryClient } from '@tanstack/svelte-query';
import { serverStateKeys } from '$lib/browser/server-state';
import type { MindfulPost } from '$lib/contracts/mindful-community';
import type { MindfulNotification } from '$lib/contracts/mindful-notifications';
import Harness from './mindful-notification-target-harness.svelte';

const mocks = vi.hoisted(() => ({ read: vi.fn(), detail: vi.fn(), reactions: vi.fn(), remove: vi.fn(), principal: 'A' }));
vi.mock('$lib/stores/locale.svelte', () => ({ getLocaleContext: () => ({ current: 'vi' }) }));
vi.mock('$lib/stores/session.svelte', () => ({ getBrowserSessionSnapshot: () => ({ user: { id: mocks.principal } }), SESSION_CHANGE_EVENT: 'session-changed' }));
vi.mock('$lib/browser/mindful-community-client', () => ({ fetchMindfulPosts: mocks.read, fetchMindfulPostContext: mocks.detail,
  fetchMindfulReactions: mocks.reactions, deleteMindfulPost: mocks.remove, sendMindfulReaction: vi.fn(),
  MINDFUL_COMMUNITY_QUERY_POLICY: { staleTime: 15 * 60_000, refetchOnWindowFocus: false, refetchOnReconnect: false, retry: false } }));
const post = (id = 'p'): MindfulPost => ({ id, kind: 'repentance', nickname: 'Đồng Tu', content: `Nội dung ${id}`,
  createdAt: new Date().toISOString(), reactionCount: 1, viewerReacted: false, isOwn: true, status: 'published' });
let client: QueryClient;
let component: ReturnType<typeof Harness> | undefined;
const scrollIntoView = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
const settle = async () => { await new Promise(resolve => setTimeout(resolve, 0)); flushSync(); };
beforeEach(() => {
  vi.resetAllMocks(); mocks.principal = 'A';
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  mocks.read.mockResolvedValue({ enabled: true, items: [], nextCursor: null });
  mocks.detail.mockResolvedValue({ post: post(), notification: null }); mocks.reactions.mockResolvedValue({ items: [], nextCursor: null });
  mocks.remove.mockResolvedValue(undefined);
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value() {} });
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
});
afterEach(async () => {
  if (component) await unmount(component);
  component = undefined; client.clear(); document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  if (scrollIntoView) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', scrollIntoView);
  else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
});
async function setup(target: string | null = null, reaction: string | null = null) {
  component = mount(Harness, { target: document.body, props: { client, target, reaction } }); await settle();
}
function click(selector: string) { document.querySelector<HTMLButtonElement>(selector)!.click(); }

it('defaults to all posts and reuses cached pages when the period dropdown is changed', async () => {
  await setup();
  await vi.waitFor(() => expect(mocks.read).toHaveBeenCalledTimes(1));
  expect(mocks.read.mock.calls[0][0]).toMatchObject({ period: 'all' });
  expect(document.querySelector('[role="combobox"][aria-label="Thời gian bài chia sẻ"]')?.textContent).toContain('Tất cả');
  click('[role="combobox"][aria-label="Thời gian bài chia sẻ"]'); await settle();
  click('[data-value="today"]'); await settle();
  await vi.waitFor(() => expect(mocks.read.mock.calls.map(call => call[0])).toEqual([
    { kind: 'repentance', mine: false, period: 'all', after: null },
    { kind: 'repentance', mine: false, period: 'today', after: null },
  ]));
  expect(mocks.read.mock.calls[1][0]).toMatchObject({ period: 'today' });
  click('[role="combobox"][aria-label="Thời gian bài chia sẻ"]'); await settle();
  click('[data-value="all"]'); await settle();
  expect(mocks.read).toHaveBeenCalledTimes(2);
});

it('opens the exact notification post without loading a feed and reopens from cached detail and reactions', async () => {
  await setup('p');
  await vi.waitFor(() => expect(document.querySelector('.mindful-reactions')?.textContent).toContain('Nội dung p'));
  expect(mocks.detail).toHaveBeenCalledTimes(1); expect(mocks.reactions).toHaveBeenCalledTimes(1); expect(mocks.read).not.toHaveBeenCalled();
  click('.mindful-reactions header button'); await settle();
  component!.openTarget('p'); await settle();
  await vi.waitFor(() => expect(document.querySelector('.mindful-reactions')).not.toBeNull());
  expect(mocks.detail).toHaveBeenCalledTimes(1); expect(mocks.reactions).toHaveBeenCalledTimes(1); expect(mocks.read).not.toHaveBeenCalled();
});

it('uses only fresh owned published cached posts from the current principal', async () => {
  client.setQueryData(serverStateKeys.mindfulCommunity.posts('A', 'mine'), { pages: [{ enabled: true, items: [post()], nextCursor: null }], pageParams: [null] });
  await setup('p');
  await vi.waitFor(() => expect(document.querySelector('.mindful-reactions')).not.toBeNull());
  expect(mocks.detail).not.toHaveBeenCalled(); expect(mocks.read).not.toHaveBeenCalled();
});

it('does not fetch or expose cached content while signed out or offline', async () => {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  await setup('p');
  expect(mocks.detail).not.toHaveBeenCalled(); expect(mocks.reactions).not.toHaveBeenCalled();
  expect(document.querySelector('.mindful-community')?.textContent).toContain('Đang ngoại tuyến');
  component!.selectPrincipal(null); await settle();
  expect(mocks.detail).not.toHaveBeenCalled(); expect(document.querySelector('.target-post')).toBeNull();
});

it('rejects late target and principal responses during A to B to A transitions', async () => {
  const pending: { resolve: (value: { post: MindfulPost }) => void; signal: AbortSignal }[] = [];
  mocks.detail.mockImplementation((_id, _reaction, options) => new Promise<{ post: MindfulPost }>(resolve => pending.push({ resolve, signal: options.signal })));
  await setup('p'); await vi.waitFor(() => expect(pending).toHaveLength(1));
  component!.selectPrincipal('B'); mocks.principal = 'B'; await settle();
  await vi.waitFor(() => expect(pending).toHaveLength(2));
  component!.selectPrincipal('A'); mocks.principal = 'A'; await settle();
  await vi.waitFor(() => expect(pending).toHaveLength(3));
  pending[0].resolve({ post: post('old-A') }); pending[1].resolve({ post: post('old-B') }); await settle();
  expect(document.querySelector('.target-post')).toBeNull();
  expect(document.querySelector('.mindful-reactions')?.textContent).not.toContain('old-');
  pending[2].resolve({ post: post() }); await settle();
  await vi.waitFor(() => expect(document.querySelector('.mindful-reactions')?.textContent).toContain('Nội dung p'));
  expect(pending[0].signal.aborted).toBe(true); expect(pending[1].signal.aborted).toBe(true);
});

const notification = (id: string): MindfulNotification => ({ id, postId: 'p', kind: 'repentance', nickname: `Đồng Tu ${id}`,
  templateId: 'tam-bao', text: `Lời nguyện chính xác ${id}`, createdAt: new Date().toISOString() });

it('shows the exact cached notification even if it is outside the first reaction page, without extra reads', async () => {
  const event = notification('older-event');
  client.setQueryData(serverStateKeys.mindfulCommunity.posts('A', 'mine'), { pages: [{ enabled: true, items: [post()], nextCursor: null }], pageParams: [null] });
  client.setQueryData(serverStateKeys.mindfulCommunity.notifications('A'), { pages: [{ principal: 'A', enabled: true, items: [event], nextCursor: null }], pageParams: [null] });
  client.setQueryData(serverStateKeys.mindfulCommunity.reactions('A', 'p'), { pages: [{ items: [{ nickname: 'Khác', text: 'Trang mới nhất', templateId: 'tam-bao', createdAt: new Date().toISOString() }], nextCursor: 'next' }], pageParams: [null] });
  await setup('p', event.id);
  await vi.waitFor(() => expect(document.querySelector('.focused-reaction')?.textContent).toContain(event.text));
  expect(document.querySelector('.mindful-reactions')?.textContent).toContain('Trang mới nhất');
  expect(mocks.detail).not.toHaveBeenCalled(); expect(mocks.reactions).not.toHaveBeenCalled(); expect(mocks.read).not.toHaveBeenCalled();
  click('.mindful-reactions header button'); await settle();
  const newer = notification('newer-event');
  client.setQueryData(serverStateKeys.mindfulCommunity.notifications('A'), { pages: [{ principal: 'A', enabled: true, items: [newer, event], nextCursor: null }], pageParams: [null] });
  component!.openTarget('p', newer.id); await settle();
  await vi.waitFor(() => expect(document.querySelector('.focused-reaction')?.textContent).toContain(newer.text));
  expect(mocks.detail).not.toHaveBeenCalled(); expect(mocks.reactions).not.toHaveBeenCalled();
});

it('uses one cold context lookup to show an exact older notification without fabricating a reaction page', async () => {
  const event = notification('cold-event');
  mocks.detail.mockResolvedValue({ post: post(), notification: event });
  await setup('p', event.id);
  await vi.waitFor(() => expect(document.querySelector('.focused-reaction')?.textContent).toContain(event.text));
  expect(mocks.detail).toHaveBeenCalledTimes(1);
  expect(mocks.detail.mock.calls[0].slice(0, 2)).toEqual(['p', event.id]);
  expect(mocks.reactions).toHaveBeenCalledTimes(1);
  expect(mocks.read).not.toHaveBeenCalled();
});

it('keeps reaction requests on their captured post key when switching targets and reuses each cached page', async () => {
  mocks.detail.mockImplementation(id => Promise.resolve({ post: post(id), notification: null }));
  await setup('p');
  await vi.waitFor(() => expect(mocks.reactions).toHaveBeenCalledTimes(1));
  component!.openTarget('q'); await settle();
  await vi.waitFor(() => expect(document.querySelector('.target-post')?.textContent).toContain('Nội dung q'));
  await vi.waitFor(() => expect(mocks.reactions).toHaveBeenCalledTimes(2));
  component!.openTarget('p'); await settle();
  await vi.waitFor(() => expect(document.querySelector('.target-post')?.textContent).toContain('Nội dung p'));
  expect(mocks.reactions.mock.calls.map(call => call[0])).toEqual(['p', 'q']);
  expect(mocks.detail.mock.calls.map(call => call[0])).toEqual(['p', 'q']);
});

it.each(['stale', 'invalidated', 'not-owned', 'removed', 'incomplete'] as const)('does not trust a %s cached feed for an authenticated notification', async state => {
  const item = { ...post(), ...(state === 'not-owned' ? { isOwn: false } : {}), ...(state === 'removed' ? { status: 'removed' as const } : {}),
    ...(state === 'incomplete' ? { content: undefined as unknown as string } : {}) };
  const key = serverStateKeys.mindfulCommunity.posts('A', 'mine');
  client.setQueryData(key, { pages: [{ enabled: true, items: [item], nextCursor: null }], pageParams: [null] }, state === 'stale' ? { updatedAt: 1 } : undefined);
  if (state === 'invalidated') await client.invalidateQueries({ queryKey: key, refetchType: 'none' });
  await setup('p');
  await vi.waitFor(() => expect(mocks.detail).toHaveBeenCalledTimes(1));
  expect(mocks.read).not.toHaveBeenCalled();
});

it('shows an unavailable target honestly, retries once explicitly and does not scan the feed', async () => {
  mocks.detail.mockRejectedValueOnce(new Error('Not available'));
  await setup('p');
  await vi.waitFor(() => expect(document.querySelector('.mindful-reactions [role="alert"]')?.textContent).toContain('không còn khả dụng'));
  expect(mocks.reactions).not.toHaveBeenCalled(); expect(mocks.read).not.toHaveBeenCalled();
  const retry = [...document.querySelectorAll<HTMLButtonElement>('.mindful-reactions button')].find(button => button.textContent === 'Thử lại')!;
  retry.click(); await settle();
  await vi.waitFor(() => expect(document.querySelector('.target-post')?.textContent).toContain('Nội dung p'));
  expect(mocks.detail).toHaveBeenCalledTimes(2); expect(mocks.reactions).toHaveBeenCalledTimes(1);
});

it('removes deleted post context and inbox entries after cancelling a delayed inbox read without new GETs', async () => {
  const event = notification('removed-event');
  const inboxKey = serverStateKeys.mindfulCommunity.notifications('A');
  const inbox = { pages: [{ principal: 'A', enabled: true, items: [event], nextCursor: null }], pageParams: [null] };
  client.setQueryData(serverStateKeys.mindfulCommunity.posts('A', 'mine'), { pages: [{ enabled: true, items: [post()], nextCursor: null }], pageParams: [null] });
  client.setQueryData(inboxKey, inbox);
  await setup('p', event.id);
  await vi.waitFor(() => expect(document.querySelector('.target-post')).not.toBeNull());
  let finish!: (value: typeof inbox) => void;
  let signal!: AbortSignal;
  const pending = client.fetchQuery({ queryKey: inboxKey, queryFn: options => {
    signal = options.signal; return new Promise<typeof inbox>(resolve => { finish = resolve; });
  } }).catch(() => undefined);
  await settle();
  click('.mindful-reactions header button'); await settle();
  click('.mindful-community article .remove'); await settle();
  click('.practice-confirm__primary'); await settle();
  await vi.waitFor(() => expect(mocks.remove).toHaveBeenCalledTimes(1));
  expect(signal.aborted).toBe(true);
  finish(inbox); await pending; await settle();
  expect(client.getQueryData<typeof inbox>(inboxKey)!.pages[0].items).toEqual([]);
  expect(document.querySelector('.mindful-community article')).toBeNull();
  component!.openTarget('p', event.id); await settle();
  await vi.waitFor(() => expect(document.querySelector('.mindful-reactions [role="alert"]')?.textContent).toContain('không còn khả dụng'));
  expect(mocks.detail).not.toHaveBeenCalled(); expect(mocks.read).not.toHaveBeenCalled();
});
