import { afterEach, expect, it, vi } from 'vitest';
import { downloadEnglishPack, fetchEnglishChapters } from '../../src/lib/browser/english-pack';
import manifest from '../../src/lib/data/english-pack-manifest.json';
import { readFileSync } from 'node:fs';
import bundledRituals from '../../src/lib/data/bundled-english-rituals.json';

afterEach(() => vi.unstubAllGlobals());

const path = '/offline-data/chapters-en/test.json';
const rows = [{ noi_dung: 'English chapter', tieu_de: 'Chapter' }];

it('fetches from media and persists validated English chapters', async () => {
  const put = vi.fn();
  vi.stubGlobal('caches', { open: async () => ({ match: async () => undefined, put }) });
  const fetcher = vi.fn(async (_url: string, _options?: RequestInit) => Response.json(rows));
  vi.stubGlobal('fetch', fetcher);
  expect(await (await fetchEnglishChapters(path)).json()).toEqual(rows);
  expect(fetcher.mock.calls[0][0]).toBe(`https://media.quangtu.vn${path}`);
  expect(put).toHaveBeenCalledOnce();
});

it('reads saved chapters without network', async () => {
  vi.stubGlobal('caches', { open: async () => ({ match: async () => Response.json(rows) }) });
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  expect(await (await fetchEnglishChapters(path)).json()).toEqual(rows);
  expect(fetcher).not.toHaveBeenCalled();
});

it('reads saved English chapters with a legacy iOS signal and preserves explicit cancellation reasons', async () => {
  vi.stubGlobal('navigator', { onLine: false });
  vi.stubGlobal('caches', { open: async () => ({ match: async () => Response.json(rows) }) });
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  const controller = new AbortController();
  Object.defineProperty(controller.signal, 'throwIfAborted', { value: undefined });
  expect(await (await fetchEnglishChapters(path, controller.signal)).json()).toEqual(rows);
  const reason = new Error('cancelled English read');
  controller.abort(reason);
  await expect(fetchEnglishChapters(path, controller.signal)).rejects.toBe(reason);
  expect(fetcher).not.toHaveBeenCalled();
});

it('rejects HTML fallbacks and retries after a failed download', async () => {
  const put = vi.fn();
  vi.stubGlobal('caches', { open: async () => ({ match: async () => undefined, put }) });
  vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>', { headers: { 'content-type': 'text/html' } })));
  await expect(fetchEnglishChapters(path)).rejects.toThrow('English content is unavailable');
  expect(put).not.toHaveBeenCalled();
  vi.stubGlobal('fetch', vi.fn(async () => Response.json(rows)));
  expect(await (await fetchEnglishChapters(path)).json()).toEqual(rows);
});

it.each(bundledRituals)('opens bundled ritual %s on the first offline launch', async (file) => {
  vi.stubGlobal('navigator', { onLine: false });
  const bytes = readFileSync(`static/offline-data/chapters-en/${file}`);
  const fetcher = vi.fn(async () => new Response(bytes));
  vi.stubGlobal('fetch', fetcher);
  const response = await fetchEnglishChapters(`/offline-data/chapters-en/${file}`);
  expect(await response.json()).toEqual(JSON.parse(bytes.toString('utf8')));
  expect(fetcher).toHaveBeenCalledExactlyOnceWith(`/offline-data/chapters-en/${file}`, expect.anything());
});

it('rejects a corrupt bundled ritual while offline', async () => {
  vi.stubGlobal('navigator', { onLine: false });
  vi.stubGlobal('caches', { open: async () => ({ match: async () => undefined }) });
  vi.stubGlobal('fetch', vi.fn(async () => Response.json(rows)));
  await expect(fetchEnglishChapters(`/offline-data/chapters-en/${bundledRituals[0]}`)).rejects.toThrow('English book is not saved offline');
});

it('finishes the English pack with bundled rituals and reuses every saved revision', async () => {
  vi.stubGlobal('navigator', { onLine: false });
  const file = bundledRituals[0];
  const cacheEntries = new Map<string, Uint8Array>();
  for (const entry of manifest.entries) {
    if (entry.file !== file) cacheEntries.set(`/offline-data/chapters-en/${entry.file}?revision=${entry.sha256}`, new TextEncoder().encode(JSON.stringify(rows)));
  }
  const put = vi.fn(async (key: string, response: Response) => { cacheEntries.set(key, new Uint8Array(await response.arrayBuffer())); });
  vi.stubGlobal('caches', { open: async () => ({
    match: async (key: string) => cacheEntries.has(key) ? new Response(cacheEntries.get(key)) : undefined, put,
    keys: async () => [], delete: vi.fn()
  }) });
  const bytes = readFileSync(`static/offline-data/chapters-en/${file}`);
  const fetcher = vi.fn(async () => new Response(bytes));
  vi.stubGlobal('fetch', fetcher);
  const progress = vi.fn();
  await downloadEnglishPack(progress);
  expect(progress).toHaveBeenLastCalledWith(manifest.entries.length, manifest.entries.length);
  expect(fetcher).toHaveBeenCalledExactlyOnceWith(`/offline-data/chapters-en/${file}`, expect.anything());
  expect(put).toHaveBeenCalledOnce();
  fetcher.mockClear();
  await downloadEnglishPack(progress);
  expect(fetcher).not.toHaveBeenCalled();
});

it('downloads the newer manifest revision instead of caching an older bundled ritual under its hash', async () => {
  vi.resetModules();
  vi.stubGlobal('navigator', { onLine: true });
  const bytes = new TextEncoder().encode(JSON.stringify([{ noi_dung: 'Updated ritual' }]));
  const sha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('');
  const file = bundledRituals[0];
  const cacheEntries = new Map<string, Uint8Array>();
  vi.stubGlobal('caches', { open: async () => ({
    match: async (key: string) => cacheEntries.has(key) ? new Response(cacheEntries.get(key)) : undefined,
    put: async (key: string, response: Response) => { cacheEntries.set(key, new Uint8Array(await response.arrayBuffer())); },
    keys: async () => [], delete: vi.fn()
  }) });
  const fetcher = vi.fn(async (url: string) => url.endsWith('english-pack-manifest.json')
    ? Response.json({ version: 'qa-newer-revision', entries: [{ file, bytes: bytes.byteLength, sha256 }] })
    : new Response(bytes));
  vi.stubGlobal('fetch', fetcher);
  const { downloadEnglishPack: download } = await import('../../src/lib/browser/english-pack');
  await download(vi.fn());
  expect(cacheEntries.get(`/offline-data/chapters-en/${file}?revision=${sha256}`)).toEqual(bytes);
  expect(fetcher.mock.calls.map(call => call[0])).toEqual([
    'https://media.quangtu.vn/offline-data/english-pack-manifest.json',
    `https://media.quangtu.vn/offline-data/chapters-en/${file}`
  ]);
});

it('aborts a cached pack before reporting completion or removing prior revisions', async () => {
  vi.stubGlobal('navigator', { onLine: false });
  const remove = vi.fn();
  vi.stubGlobal('caches', { open: async () => ({
    match: async () => Response.json(rows), keys: async () => [], delete: remove
  }) });
  const controller = new AbortController();
  const progress = vi.fn((done: number) => { if (done === 1) controller.abort(); });
  await expect(downloadEnglishPack(progress, controller.signal)).rejects.toThrow();
  expect(progress).not.toHaveBeenCalledWith(manifest.entries.length, manifest.entries.length);
  expect(remove).not.toHaveBeenCalled();
});
