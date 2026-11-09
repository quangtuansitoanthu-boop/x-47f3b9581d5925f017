import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { fetchWithSessionRefresh } from '$lib/browser/session-csrf';
import { blocksNativeAdminWrite } from '$lib/browser/admin-access';

const mocks = vi.hoisted(() => ({
  native: true, request: vi.fn(), fetch: vi.fn(), snapshot: vi.fn(), refresh: vi.fn(), offline: vi.fn(), origin: vi.fn(),
}));
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => mocks.native }, CapacitorHttp: { request: mocks.request },
}));
vi.mock('$lib/stores/session.svelte', () => ({
  getBrowserSessionSnapshot: mocks.snapshot, refreshBrowserSession: mocks.refresh, isSessionExpired: () => false,
}));
vi.mock('$lib/browser/offline-bundled-resolver', () => ({ resolveOfflineBundledResponse: mocks.offline }));
vi.mock('$lib/browser/url-fallback', () => ({ refreshRemoteOrigin: mocks.origin }));
const init = (method = 'POST', signal?: AbortSignal): RequestInit => ({
  method, signal, headers: { 'content-type': 'application/json; charset=utf-8', 'x-csrf-token': 'test-csrf' }, body: '{}',
});
beforeEach(() => {
  mocks.native = true;
  mocks.request.mockReset().mockResolvedValue({ status: 200, data: { ok: true }, headers: { 'content-type': 'application/json' } });
  mocks.fetch.mockReset().mockResolvedValue(Response.json({ error: { code: 'invalid_origin' } }, { status: 403 }));
  mocks.snapshot.mockReset().mockReturnValue({ authenticated: true, csrfToken: 'test-csrf', user: { id: 'user-a', role: 'user' } });
  mocks.refresh.mockReset().mockResolvedValue({ authenticated: false });
  mocks.offline.mockReset().mockResolvedValue(null);
  mocks.origin.mockReset().mockResolvedValue(undefined);
  vi.stubGlobal('fetch', mocks.fetch);
  vi.stubGlobal('window', { location: { origin: 'https://localhost' } });
  vi.stubGlobal('navigator', { onLine: true });
  vi.stubGlobal('localStorage', { getItem: () => 'https://quangtu.vn' });
  vi.stubGlobal('Capacitor', { isNativePlatform: () => mocks.native });
});
afterEach(() => vi.unstubAllGlobals());

it.each([
  ['/api/auth/logout', 'POST'],
  ['/api/articles/article-a/comments', 'POST'],
  ['/api/reading/progress', 'PUT'],
  ['/api/reading/annotations/quote-a', 'PATCH'],
  ['/api/reading/progress', 'DELETE'],
])('retains native Origin/CSRF for %s %s without patched-fetch replay', async (path, method) => {
  const response = await fetchWithSessionRefresh(path, init(method));
  expect(response.status).toBe(200);
  expect(mocks.request).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
    url: `https://quangtu.vn${path}`, method, data: {},
    headers: expect.objectContaining({ origin: 'https://quangtu.vn', 'x-csrf-token': 'test-csrf' }),
  }));
  expect(mocks.fetch).not.toHaveBeenCalled();
});

it('supports native DELETE without a body', async () => {
  await fetchWithSessionRefresh('/api/reading/annotations/quote-a', {
    method: 'DELETE', headers: { 'x-csrf-token': 'test-csrf' },
  });
  expect(mocks.request).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
    method: 'DELETE', data: undefined,
    headers: expect.objectContaining({ origin: 'https://quangtu.vn', 'x-csrf-token': 'test-csrf' }),
  }));
  expect(mocks.fetch).not.toHaveBeenCalled();
});

it('keeps web mutations on browser fetch', async () => {
  mocks.native = false;
  mocks.fetch.mockResolvedValue(Response.json({ ok: true }));
  expect((await fetchWithSessionRefresh('/api/auth/logout', init())).ok).toBe(true);
  expect(mocks.fetch).toHaveBeenCalledExactlyOnceWith('/api/auth/logout', expect.objectContaining({ method: 'POST', body: '{}' }));
  expect(mocks.request).not.toHaveBeenCalled();
});

it.each(['/api/auth/logout', '/api/auth/delete-account'])('preserves cookie-safe JSON and existing authenticated transport for %s', async path => {
  const requestInit = { ...init(), body: JSON.stringify({ preserveSessionCookie: true }) };
  await fetchWithSessionRefresh(path, requestInit);
  expect(mocks.request).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
    method: 'POST', data: { preserveSessionCookie: true },
    headers: expect.objectContaining({ origin: 'https://quangtu.vn', 'x-csrf-token': 'test-csrf' }),
  }));
  mocks.native = false; mocks.fetch.mockResolvedValue(Response.json({ ok: true }));
  await fetchWithSessionRefresh(path, requestInit);
  const [input, options] = mocks.fetch.mock.calls[0];
  const browserRequest = new Request(new URL(input, window.location.origin), options);
  // The browser keeps its existing same-origin cookie default; native uses its HTTP cookie jar.
  expect(browserRequest.credentials).toBe('same-origin');
  expect(browserRequest.headers.get('x-csrf-token')).toBe('test-csrf');
  expect(await browserRequest.json()).toEqual({ preserveSessionCookie: true });
});

it.each(['multipart', 'text', 'opaque', 'absolute'])('keeps %s requests on their existing transport', async kind => {
  const requestInit: RequestInit = kind === 'multipart'
    ? { method: 'POST', body: new FormData() }
    : { method: 'POST', body: 'text', headers: { 'content-type': 'text/plain' } };
  const target = kind === 'opaque'
    ? new Request('https://quangtu.vn/api/auth/logout', init())
    : kind === 'absolute' ? 'https://quangtu.vn/api/auth/logout' : '/api/upload';
  await fetchWithSessionRefresh(target, kind === 'opaque' ? undefined : kind === 'absolute' ? init() : requestInit);
  expect(mocks.fetch).toHaveBeenCalledOnce();
  expect(mocks.request).not.toHaveBeenCalled();
});

it('refreshes a native 401 once without replaying the mutation', async () => {
  mocks.request.mockResolvedValue({ status: 401, data: {}, headers: {} });
  expect((await fetchWithSessionRefresh('/api/auth/logout', init())).status).toBe(401);
  expect(mocks.request).toHaveBeenCalledOnce();
  expect(mocks.refresh).toHaveBeenCalledOnce();
  expect(mocks.fetch).not.toHaveBeenCalled();
});

it.each(['before', 'during-guard'])('does not dispatch an aborted native mutation %s', async phase => {
  const controller = new AbortController();
  if (phase === 'before') controller.abort();
  const pending = fetchWithSessionRefresh('/api/auth/logout', init('POST', controller.signal));
  if (phase === 'during-guard') controller.abort();
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  expect(mocks.request).not.toHaveBeenCalled();
  expect(mocks.fetch).not.toHaveBeenCalled();
});

it('rejects a late native response after cancellation without retrying or refreshing', async () => {
  let respond!: (value: { status: number; data: object; headers: object }) => void;
  mocks.request.mockImplementation(() => new Promise(resolve => { respond = resolve; }));
  const controller = new AbortController();
  const pending = fetchWithSessionRefresh('/api/auth/logout', init('POST', controller.signal));
  const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  await vi.waitFor(() => expect(mocks.request).toHaveBeenCalledOnce());
  controller.abort();
  respond({ status: 200, data: {}, headers: {} });
  await rejected;
  expect(mocks.request).toHaveBeenCalledOnce();
  expect(mocks.fetch).not.toHaveBeenCalled();
  expect(mocks.refresh).not.toHaveBeenCalled();
});

it('does not fall back and replay a native write when its transport fails', async () => {
  mocks.request.mockRejectedValue(new Error('Native connection failed'));
  await expect(fetchWithSessionRefresh('/api/auth/logout', init())).rejects.toThrow('Native connection failed');
  expect(mocks.request).toHaveBeenCalledOnce();
  expect(mocks.fetch).not.toHaveBeenCalled();
  expect(mocks.origin).not.toHaveBeenCalled();
});

it('applies the native admin read-only guard before dispatch', async () => {
  mocks.snapshot.mockReturnValue({ authenticated: true, csrfToken: 'test-csrf', user: { id: 'admin-a', role: 'admin' } });
  const response = await fetchWithSessionRefresh('/api/articles/article-a', init('PATCH'));
  expect(response.status).toBe(403);
  expect((await response.json()).error.code).toBe('native_admin_read_only');
  expect(mocks.request).not.toHaveBeenCalled();
  expect(mocks.fetch).not.toHaveBeenCalled();
});

it.each([
  ['comments', 'approve', undefined], ['comments', 'reject', 'Nội dung không phù hợp'], ['comments', 'hide', 'Ẩn theo báo cáo'],
  ['profiles', 'approve', undefined], ['profiles', 'reject', 'Cần sửa hồ sơ'], ['profiles', 'hide', 'Ẩn theo báo cáo'],
  ['comments', 'hide', undefined], ['profiles', 'hide', null], ['profiles', 'hide', '   '],
  ['reports', 'resolve', undefined],
])('allows only the approved native admin moderation decision %s/%s through existing CSRF transport', async (kind, action, reason) => {
  mocks.snapshot.mockReturnValue({ authenticated: true, csrfToken: 'test-csrf', user: { id: 'admin-a', role: 'admin' } });
  const decision = { action, revision: 3, ...(reason === undefined ? {} : { reason }) };
  const path = `/api/admin/community/moderation/${kind}/record-a`;
  const response = await fetchWithSessionRefresh(path, { ...init('PATCH'), body: JSON.stringify(decision) });
  expect(response.status).toBe(200);
  expect(mocks.request).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
    url: `https://quangtu.vn${path}`, method: 'PATCH', data: decision,
    headers: expect.objectContaining({ origin: 'https://quangtu.vn', 'x-csrf-token': 'test-csrf' }),
  }));
  expect(mocks.fetch).not.toHaveBeenCalled();
  expect(mocks.refresh).not.toHaveBeenCalled();
});

it.each(['user', 'ctv', 'guest', undefined])('denies only the new native moderation API to nonadmin role %s', async role => {
  for (const method of ['GET', 'PATCH']) {
    const path = method === 'GET' ? '/api/admin/community/moderation?kind=comments&limit=50' : '/api/admin/community/moderation/comments/record-a';
    expect(await blocksNativeAdminWrite(path, {
      method, ...(method === 'PATCH' ? { body: JSON.stringify({ action: 'approve', revision: 1 }) } : {}),
    }, role)).toBe(true);
  }
  // Server authorization remains mandatory; this client barrier grants no role.
  expect(await blocksNativeAdminWrite('/api/reading/progress', init('PUT'), role)).toBe(false);
});

it.each([
  ['comments', { action: 'resolve', revision: 1 }],
  ['profiles', { action: 'resolve', revision: 1 }],
  ['reports', { action: 'approve', revision: 1 }],
  ['reports', { action: 'reject', revision: 1, reason: 'Lý do' }],
  ['reports', { action: 'hide', revision: 1, reason: 'Lý do' }],
  ['comments', { action: 'delete', revision: 1 }],
  ['comments', { action: 'approve', revision: 0 }],
  ['comments', { action: 'approve', revision: -1 }],
  ['comments', { action: 'approve', revision: 1.5 }],
  ['comments', { action: 'approve', revision: '1' }],
  ['comments', { action: 'approve' }],
  ['comments', { action: 'reject', revision: 1 }],
  ['profiles', { action: 'reject', revision: 1, reason: '   ' }],
  ['profiles', { action: 'hide', revision: 1, reason: 'x'.repeat(1001) }],
  ['profiles', { action: 'hide', revision: 1, reason: 12 }],
  ['profiles', { action: 'reject', revision: 1, reason: 'x'.repeat(1001) }],
  ['reports', { action: 'resolve', revision: 1, reason: null }],
  ['comments', { action: 'approve', revision: 1, status: 'published' }],
  ['profiles', { action: 'approve', revision: 1, displayName: 'Thay nội dung ngoài duyệt' }],
  ['reports', []], ['reports', null],
])('keeps malformed or out-of-scope moderation body blocked for %s: %j', async (kind, body) => {
  expect(await blocksNativeAdminWrite(`/api/admin/community/moderation/${kind}/record-a`, {
    method: 'PATCH', body: JSON.stringify(body),
  }, 'admin')).toBe(true);
});

it.each([
  ['POST', '/api/admin/community/moderation/comments/record-a'],
  ['PUT', '/api/admin/community/moderation/comments/record-a'],
  ['DELETE', '/api/admin/community/moderation/comments/record-a'],
  ['PATCH', '/api/admin/community/moderation'],
  ['PATCH', '/api/admin/community/moderation/comment/record-a'],
  ['PATCH', '/api/admin/community/moderation/comments/'],
  ['PATCH', '/api/admin/community/moderation/comments/record-a/extra'],
  ['PATCH', '/api/articles/record-a'],
  ['POST', '/api/talks'],
  ['POST', '/api/upload'],
  ['PATCH', '/api/practice/campaigns/record-a'],
])('keeps existing native content restrictions and unknown moderation paths blocked: %s %s', async (method, path) => {
  expect(await blocksNativeAdminWrite(path, { method, body: JSON.stringify({ action: 'approve', revision: 1 }) }, 'admin')).toBe(true);
});

it('allows approved moderation through a Request clone without consuming its body and accepts the exact reason limit', async () => {
  const decision = { action: 'hide', revision: 1, reason: 'x'.repeat(1000) };
  const request = new Request('https://quangtu.vn/api/admin/community/moderation/profiles/member%3Aone', {
    method: 'PATCH', body: JSON.stringify(decision),
  });
  expect(await blocksNativeAdminWrite(request, undefined, 'admin')).toBe(false);
  expect(await request.json()).toEqual(decision);
});

it('preserves member-status writes and public reports or blocks without opening other native admin writes', async () => {
  expect(await blocksNativeAdminWrite('/api/admin/members/member-a', { method: 'PATCH', body: JSON.stringify({ status: 'suspended' }) }, 'admin')).toBe(false);
  expect(await blocksNativeAdminWrite('/api/admin/members/member-a', { method: 'PATCH', body: JSON.stringify({ status: 'active', role: 'admin' }) }, 'admin')).toBe(true);
  for (const role of ['admin', 'ctv', 'user', undefined]) for (const [method, path] of [
    ['POST', '/api/community/reports'], ['GET', '/api/community/blocks'],
    ['POST', '/api/community/blocks'], ['DELETE', '/api/community/blocks/author-a'],
  ]) expect(await blocksNativeAdminWrite(path, init(method), role)).toBe(false);
  expect(await blocksNativeAdminWrite('/api/admin/community/moderation?kind=reports&after=cursor&limit=50', undefined, 'admin')).toBe(false);
});

it('leaves web moderation authorization to the server without changing existing web transport', async () => {
  mocks.native = false;
  for (const role of ['admin', 'user', undefined]) expect(await blocksNativeAdminWrite('/api/admin/community/moderation/reports/report-a', {
    method: 'PATCH', body: JSON.stringify({ action: 'resolve', revision: 1 }),
  }, role)).toBe(false);
});

it('does not move GET reads or break in-flight deduplication', async () => {
  mocks.fetch.mockImplementation(async () => Response.json({ items: [] }));
  const responses = await Promise.all([
    fetchWithSessionRefresh('/api/articles'), fetchWithSessionRefresh('/api/articles'),
  ]);
  expect(await Promise.all(responses.map(response => response.json()))).toEqual([{ items: [] }, { items: [] }]);
  expect(mocks.fetch).toHaveBeenCalledOnce();
  expect(mocks.request).not.toHaveBeenCalled();
});
