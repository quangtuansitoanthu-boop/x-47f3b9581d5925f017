import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ owner: 'a', csrf: vi.fn(async () => 'csrf'), fetch: vi.fn(), native: vi.fn(async () => null as Response | null) }));
vi.mock('$lib/stores/session.svelte', () => ({ SESSION_CHANGE_EVENT: 'session-changed', getBrowserSessionSnapshot: () => ({ user: mocks.owner ? { id: mocks.owner } : null }) }));
vi.mock('$lib/browser/session-csrf', () => ({ requireBrowserCsrf: mocks.csrf, fetchWithSessionRefresh: mocks.fetch }));
vi.mock('$lib/browser/native-api', () => ({ resolveApiUrl: (path: string) => path, isHtmlResponse: (response: Response) => response.headers.get('content-type')?.includes('text/html'), fetchNativeJsonMutation: mocks.native }));
import { createMindfulPost, fetchMindfulPost, fetchMindfulPostContext, fetchMindfulNotifications, fetchMindfulPosts, fetchMindfulReactions, sendMindfulReaction } from '$lib/browser/mindful-community-client';

beforeEach(() => { mocks.owner = 'a'; vi.clearAllMocks(); mocks.native.mockResolvedValue(null); });
afterEach(() => vi.unstubAllGlobals());
const json = (data: unknown, status = 200) => Response.json(data, { status });

it('opens an exact post without listing or mutating the feed', async () => {
  mocks.fetch.mockResolvedValue(json({ post: { id: 'post/+1' } }));
  expect(await fetchMindfulPost('post/+1')).toEqual({ id: 'post/+1' });
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
  expect(mocks.fetch.mock.calls[0][0]).toBe('/api/practice/mindful-posts/post%2F%2B1');
  expect(mocks.csrf).not.toHaveBeenCalled();
});

it('loads a cold exact reaction context with one owned-post request', async () => {
  const context = { post: { id: 'post' }, notification: { id: 'reaction/+1' } };
  mocks.fetch.mockResolvedValue(json(context));
  expect(await fetchMindfulPostContext('post', 'reaction/+1')).toEqual(context);
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
  expect(mocks.fetch.mock.calls[0][0]).toBe('/api/practice/mindful-posts/post?reactionId=reaction%2F%2B1');
  expect(mocks.csrf).not.toHaveBeenCalled();
});

it('requests only the selected notification page and retains an empty filtered cursor', async () => {
  const page = { enabled: true, items: [], nextCursor: 'next-filtered-page' };
  mocks.fetch.mockResolvedValue(json(page));
  expect(await fetchMindfulNotifications('opaque+cursor')).toEqual(page);
  expect(mocks.fetch.mock.calls[0][0]).toBe('/api/practice/mindful-notifications?after=opaque%2Bcursor');
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
  expect(mocks.csrf).not.toHaveBeenCalled();
});

it.each([
  { enabled: true, items: null, nextCursor: null },
  { enabled: true, items: [{ id: 'incomplete' }], nextCursor: null },
  { enabled: true, items: [], nextCursor: 42 },
])('does not accept a malformed account notification page', async payload => {
  mocks.fetch.mockResolvedValue(json(payload));
  await expect(fetchMindfulNotifications()).rejects.toThrow('mindful_notifications_invalid_response');
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
});

it('sends one bounded Today request and preserves the legacy URL for All', async () => {
  mocks.fetch.mockImplementation(async () => json({ enabled: true, items: [], nextCursor: null }));
  await fetchMindfulPosts({ kind: 'repentance', period: 'today' });
  expect(mocks.fetch.mock.calls[0][0]).toBe('/api/practice/mindful-posts?kind=repentance&period=today');
  await fetchMindfulPosts({ kind: 'good_deed', period: 'all' });
  expect(mocks.fetch.mock.calls[1][0]).toBe('/api/practice/mindful-posts?kind=good_deed');
  expect(mocks.fetch).toHaveBeenCalledTimes(2);
});

it('reports an undeployed endpoint without retrying or treating it as an empty feed', async () => {
  mocks.fetch.mockResolvedValue(json({ error: { code: 'not_found', message: 'API không tồn tại.' } }, 404));
  await expect(fetchMindfulPosts({ kind: 'good_deed' })).rejects.toThrow('mindful_community_unavailable');
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
});

it('preserves the distinct error for an unavailable post', async () => {
  mocks.fetch.mockResolvedValue(json({ error: { code: 'mindful_post_unavailable', message: 'Bài chia sẻ không còn khả dụng.' } }, 404));
  await expect(sendMindfulReaction('p', { nickname: 'Đồng Tu', templateId: 'tam-bao' })).rejects.toThrow('Bài chia sẻ không còn khả dụng.');
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
});

it('sends one reaction POST with CSRF and no follow-up feed request', async () => {
  const result = { postId: 'p', reactionCount: 3, viewerReacted: true, templateId: 'tam-bao' };
  mocks.fetch.mockResolvedValue(json(result));
  expect(await sendMindfulReaction('p', { nickname: 'Diệu Âm', templateId: 'tam-bao' })).toEqual(result);
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
  const [url, init] = mocks.fetch.mock.calls[0];
  expect(url).toBe('/api/practice/mindful-posts/p/reactions');
  expect(init.method).toBe('POST');
  expect(init.headers.get('x-csrf-token')).toBe('csrf');
  expect(JSON.parse(init.body)).toEqual({ nickname: 'Diệu Âm', templateId: 'tam-bao' });
});

it('delegates one mutation to the shared session transport without a parallel native write', async () => {
  mocks.fetch.mockResolvedValue(json({ post: { id: 'p' } }));
  expect(await createMindfulPost({ clientPostId: 'request-id', kind: 'good_deed', nickname: 'Đồng Tu', content: 'Việc lành' })).toEqual({ id: 'p' });
  expect(mocks.native).not.toHaveBeenCalled();
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
});

it('encodes pagination and loads reactions only on the explicit call', async () => {
  const fetcher = vi.fn(async () => json({ enabled: true, items: [], nextCursor: null }));
  await fetchMindfulPosts({ kind: 'repentance', mine: true, after: 'opaque+cursor' }, { fetcher });
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][0]).toContain('after=opaque%2Bcursor');
  expect(mocks.csrf).not.toHaveBeenCalled();
  await fetchMindfulReactions('p', null, { fetcher });
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it('does not accept a late response after principal change', async () => {
  let resolve!: (response: Response) => void;
  const fetcher = vi.fn(() => new Promise<Response>(done => { resolve = done; }));
  const pending = fetchMindfulPosts({}, { fetcher });
  mocks.owner = 'b'; resolve(json({ items: [] }));
  await expect(pending).rejects.toThrow('sync_principal_changed');
});

it('permanently invalidates an in-flight response when switching away and back', async () => {
  const events = new EventTarget();
  vi.stubGlobal('window', events);
  let resolve!: (response: Response) => void;
  const pending = fetchMindfulPosts({}, { fetcher: vi.fn(() => new Promise<Response>(done => { resolve = done; })) });
  mocks.owner = 'b'; events.dispatchEvent(new Event('session-changed'));
  mocks.owner = 'a'; events.dispatchEvent(new Event('session-changed'));
  resolve(json({ items: [] }));
  await expect(pending).rejects.toThrow('sync_principal_changed');
});

it('does not replay a rejected mutation or accept HTML as a successful DTO', async () => {
  mocks.fetch.mockResolvedValue(json({ error: { message: 'Already reacted' } }, 409));
  await expect(sendMindfulReaction('p', { nickname: 'Đồng Tu', templateId: 'tam-bao' })).rejects.toThrow('Already reacted');
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
  await expect(fetchMindfulPosts({}, { fetcher: vi.fn(async () => new Response('<html/>', { headers: { 'content-type': 'text/html' } })) })).rejects.toThrow('mindful_community_unavailable');
});
