import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createReadingActivityClient } from '$lib/browser/reading-activity-client';
import { createPracticeReaderProgressClient } from '$lib/browser/practice-reader-progress';

const mocks = vi.hoisted(() => ({ native: true, request: vi.fn(), fetch: vi.fn() }));
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => mocks.native }, CapacitorHttp: { request: mocks.request },
}));
class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}
const session = (id = 'reader-a') => ({ authenticated: true, user: { id }, csrfToken: `csrf-${id}` });
const progress = () => ({
  baseRevision: 0, clientUpdatedAt: '2026-10-28T00:00:00Z', contentId: 'native-book',
  contentKind: 'pdf' as const, contentVersion: null, epoch: 1, percent: 20, position: { page: 2 }, total: 10,
});
const annotation = () => ({
  id: 'native-quote', idempotencyKey: 'native-quote', contentKind: 'pdf' as const, contentId: 'native-book',
  quoteText: 'Nam mô Phật', contextBefore: '', contextAfter: '', color: 'yellow' as const,
  note: '', locator: { page: 2 }, contentVersion: null, anchorStatus: 'active' as const,
});
type Client = ReturnType<typeof createReadingActivityClient>;
function queue(client: Client, kind: string) {
  if (kind === 'progress') client.enqueueProgress(progress());
  else if (kind === 'progress-delete') client.enqueueProgressDelete({ baseRevision: 1, contentId: 'native-book', contentKind: 'pdf', epoch: 1 });
  else if (kind === 'annotation-create') client.enqueueAnnotationCreate(annotation());
  else if (kind === 'annotation-update') client.enqueueAnnotationUpdate('native-quote', {
    baseUpdatedAt: '2026-10-27T00:00:00Z', color: 'yellow', note: 'Updated', locator: { page: 2 }, contentVersion: null, anchorStatus: 'active',
  });
  else client.enqueueAnnotationDelete('native-quote');
}
beforeEach(() => {
  mocks.native = true;
  mocks.request.mockReset().mockResolvedValue({ status: 200, data: {}, headers: { 'content-type': 'application/json' } });
  mocks.fetch.mockReset().mockResolvedValue(Response.json({ error: { code: 'invalid_origin' } }, { status: 403 }));
  vi.stubGlobal('fetch', mocks.fetch);
  vi.stubGlobal('window', { location: { origin: 'https://localhost' } });
  vi.stubGlobal('localStorage', { getItem: () => 'https://quangtu.vn' });
  vi.stubGlobal('Capacitor', { isNativePlatform: () => mocks.native });
});
afterEach(() => vi.unstubAllGlobals());

it.each([
  ['progress', 'PUT', '/api/reading/progress'],
  ['progress-delete', 'DELETE', '/api/reading/progress'],
  ['annotation-create', 'POST', '/api/reading/annotations'],
  ['annotation-update', 'PATCH', '/api/reading/annotations/native-quote'],
  ['annotation-delete', 'DELETE', '/api/reading/annotations/native-quote'],
])('sends native %s through one Origin/CSRF-preserving request', async (kind, method, path) => {
  const client = createReadingActivityClient(fetch, new MemoryStorage());
  client.setSession(session());
  queue(client, kind);
  expect(await client.flush()).toBe(1);
  expect(mocks.request).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
    url: `https://quangtu.vn${path}`, method,
    headers: expect.objectContaining({ origin: 'https://quangtu.vn', 'x-csrf-token': 'csrf-reader-a' }),
  }));
  expect(mocks.fetch).not.toHaveBeenCalled();
  expect(client.pending()).toEqual([]);
});

it('keeps web and injected fetchers on their original transport', async () => {
  mocks.native = false;
  mocks.fetch.mockResolvedValue(Response.json({}));
  const web = createReadingActivityClient(fetch, new MemoryStorage());
  web.setSession(session()); web.enqueueProgress(progress());
  expect(await web.flush()).toBe(1);
  expect(mocks.fetch).toHaveBeenCalledOnce();
  mocks.native = true;
  const injected = vi.fn().mockResolvedValue(Response.json({}));
  const custom = createReadingActivityClient(injected, new MemoryStorage());
  custom.setSession(session()); custom.enqueueProgress(progress());
  expect(await custom.flush()).toBe(1);
  expect(injected).toHaveBeenCalledOnce();
  expect(mocks.request).not.toHaveBeenCalled();
});

it('retains a failed native write for later recovery without replaying a 401', async () => {
  mocks.request.mockResolvedValue({ status: 401, data: {}, headers: {} });
  const client = createReadingActivityClient(fetch, new MemoryStorage());
  client.setSession(session()); client.enqueueProgress(progress());
  const queued = client.pending()[0];
  await expect(client.flush()).rejects.toThrow('reading_activity_401');
  expect(mocks.request).toHaveBeenCalledOnce();
  expect(mocks.fetch).not.toHaveBeenCalled();
  expect(client.pending()).toHaveLength(1);
  expect(client.pending()[0].payload).toEqual(queued.payload);
});

it('does not acknowledge a late native response after the principal changes', async () => {
  let respond!: (value: { status: number; data: object; headers: object }) => void;
  mocks.request.mockImplementation(() => new Promise(resolve => { respond = resolve; }));
  const client = createReadingActivityClient(fetch, new MemoryStorage());
  client.setSession(session()); client.enqueueProgress(progress());
  const sending = client.flush();
  await vi.waitFor(() => expect(mocks.request).toHaveBeenCalledOnce());
  client.setSession(session('reader-b'));
  respond({ status: 200, data: {}, headers: {} });
  expect(await sending).toBe(0);
  expect(client.pending('reader-a')).toHaveLength(1);
  expect(client.pending()).toEqual([]);
  expect(client.cachedProgress()).toEqual([]);
});

it('coalesces concurrent native drains instead of submitting the same write twice', async () => {
  const client = createReadingActivityClient(fetch, new MemoryStorage());
  client.setSession(session()); client.enqueueProgress(progress());
  await Promise.all(Array.from({ length: 8 }, () => client.flush()));
  expect(mocks.request).toHaveBeenCalledOnce();
  expect(client.pending()).toEqual([]);
});

it('preserves the native practice reader wrapper and its injected fetch opt-out', async () => {
  const input = { articleId: 'practice-a', articleTitle: 'Practice', chapterIndex: null, chapterTitle: '', scrollTop: 100 };
  const practice = createPracticeReaderProgressClient(fetch, new MemoryStorage());
  practice.setSession(session()); practice.save(input);
  expect(await practice.flush()).toBe(1);
  expect(mocks.request).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
    url: 'https://quangtu.vn/api/reading/progress', method: 'PUT',
    data: expect.objectContaining({ contentKind: 'practice' }),
    headers: expect.objectContaining({ origin: 'https://quangtu.vn', 'x-csrf-token': 'csrf-reader-a' }),
  }));
  const injected = vi.fn().mockResolvedValue(Response.json({}));
  const custom = createPracticeReaderProgressClient(injected, new MemoryStorage());
  custom.setSession(session()); custom.save(input);
  expect(await custom.flush()).toBe(1);
  expect(injected).toHaveBeenCalledOnce();
  expect(mocks.request).toHaveBeenCalledOnce();
  practice.destroy(); custom.destroy();
});

it('keeps the practice generation fence when a native write returns after account switch', async () => {
  let respond!: (value: { status: number; data: object; headers: object }) => void;
  mocks.request.mockImplementation(() => new Promise(resolve => { respond = resolve; }));
  const storage = new MemoryStorage();
  const practice = createPracticeReaderProgressClient(fetch, storage);
  practice.setSession(session());
  practice.save({ articleId: 'practice-a', articleTitle: 'Practice', chapterIndex: null, chapterTitle: '', scrollTop: 100 });
  const sending = practice.flush();
  await vi.waitFor(() => expect(mocks.request).toHaveBeenCalledOnce());
  practice.setSession(session('reader-b'));
  respond({ status: 200, data: {}, headers: {} });
  await expect(sending).rejects.toThrow('reading_principal_changed');
  const probe = createReadingActivityClient(vi.fn(), storage);
  probe.setSession(session('reader-b'));
  expect(probe.pending()).toEqual([]);
  expect(probe.cachedProgress()).toEqual([]);
  expect(probe.pending('reader-a')).toHaveLength(1);
  practice.destroy();
});
