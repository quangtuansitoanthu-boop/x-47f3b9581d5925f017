import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';

let server: Server;
let origin: string;
test.beforeAll(async () => {
  server = createServer(async (request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://test').pathname;
    const allowed = ['/src/lib/browser/offline-content-packages', '/src/lib/browser/offline-content-index', '/src/lib/browser/ios-content-policy', '/src/lib/browser/native-platform', '/src/lib/domain/ios-content-policy', '/src/lib/domain/content-update-model', '/src/lib/domain/online-only-policy', '/src/lib/contracts/content-updates'];
    const name = pathname.replace(/\.ts$/, '');
    if (pathname === '/') { response.writeHead(200, { 'content-type': 'text/html' }); response.end('<!doctype html><title>Isolated offline storage test</title>'); return; }
    if (!allowed.includes(name)) { response.writeHead(404); response.end(); return; }
    try {
      const source = await readFile(path.join(process.cwd(), `${name.slice(1)}.ts`), 'utf8');
      const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
        .replaceAll("'$lib/", "'/src/lib/").replaceAll('"$lib/', '"/src/lib/')
        // This isolated HTTP harness does not run Vite; retain the real policy in its web build mode.
        .replaceAll('import.meta.env.VITE_CONTENT_PLATFORM', '"web"');
      response.writeHead(200, { 'content-type': 'text/javascript' }); response.end(compiled);
    } catch { response.writeHead(404); response.end(); }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('storage_test_server_unavailable');
  origin = `http://127.0.0.1:${address.port}`;
});
test.afterAll(async () => { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); });

type StorageApi = typeof import('../../src/lib/browser/offline-content-packages');
type TestWindow = Window & { storageApi: StorageApi; releasePackage: () => void; packagePaused: Promise<void>; saving: Promise<void> };
async function setup(page: Page) {
  await page.goto(origin);
  await page.evaluate(async () => {
    Object.defineProperty(navigator, 'locks', { value: undefined, configurable: true });
    const moduleUrl = '/src/lib/browser/offline-content-packages';
    (window as unknown as TestWindow).storageApi = await import(moduleUrl) as StorageApi;
  });
}
async function save(page: Page, id: string, version = 'one') {
  await page.evaluate(async ({ id, version }) => {
    const row = { id, tieu_de: id, has_muc_luc: 1, trang_thai: 'Hoàn thành', updated_at: version === 'one' ? '2026-10-01' : '2026-10-02', noi_dung: version };
    await (window as unknown as TestWindow).storageApi.saveContentPackage({ kind: 'article', group: 'book', mode: 'full', version, row }, row, [{ id: `${id}-chapter`, noi_dung: version }]);
  }, { id, version });
}
async function ids(page: Page) { return page.evaluate(async () => (await (window as unknown as TestWindow).storageApi.savedContentItems()).map(item => item.row.id).sort()); }
async function withTwoPages(context: BrowserContext) {
  const pages = await Promise.all([context.newPage(), context.newPage()]);
  await Promise.all(pages.map(setup));
  return pages;
}

test('concurrent tabs without Web Locks preserve both committed offline packages', async ({ context }) => {
  const [first, second] = await withTwoPages(context);
  await Promise.all([first, second].map(page => pausePut(page, 'package')));
  const saves = [save(first, 'A'), save(second, 'B')];
  await Promise.all([first, second].map(page => page.evaluate(() => (window as unknown as TestWindow).packagePaused)));
  await Promise.all([first, second].map(page => page.evaluate(() => (window as unknown as TestWindow).releasePackage())));
  await Promise.all(saves);
  expect(await first.evaluate(async () => {
    const moduleUrl = '/src/lib/contracts/content-updates';
    const { CONTENT_PACKAGE_CACHE } = await import(moduleUrl) as typeof import('../../src/lib/contracts/content-updates');
    const response = await (await caches.open(CONTENT_PACKAGE_CACHE)).match('https://tutam-cache.local/content-packages/index');
    const entries = await response?.json() as { row: { id: string } }[];
    return entries.map(item => item.row.id).sort();
  })).toEqual(['A', 'B']);
  expect(await ids(first)).toEqual(['A', 'B']);
  expect(await ids(second)).toEqual(['A', 'B']);
  expect(await chapter(first, 'A')).toEqual([{ id: 'A-chapter', noi_dung: 'one' }]);
  expect(await chapter(second, 'B')).toEqual([{ id: 'B-chapter', noi_dung: 'one' }]);
});

async function pausePut(page: Page, stage: 'package' | 'pending') {
  await page.evaluate(stage => {
    const target = window as unknown as TestWindow;
    let arrived!: () => void;
    target.packagePaused = new Promise<void>(resolve => { arrived = resolve; });
    const released = new Promise<void>(resolve => { target.releasePackage = resolve; });
    const original = Cache.prototype.put;
    Cache.prototype.put = async function (request, response) {
      const url = typeof request === 'string' ? request : request instanceof URL ? request.href : request.url;
      const selected = stage === 'package' ? !url.endsWith('/index') : response.headers.get('x-tutam-content-index') === 'pending';
      if (selected && stage === 'package') { arrived(); await released; }
      await original.call(this, request, response);
      if (selected && stage === 'pending') { arrived(); await released; }
    };
  }, stage);
}
async function chapter(page: Page, id = 'A') {
  return page.evaluate(async id => {
    const response = await (window as unknown as TestWindow).storageApi.readUpdatedContentResponse(new URL(`${location.origin}/api/articles/${id}/chapters`));
    return response?.json() ?? null;
  }, id);
}
async function cacheName(page: Page) {
  return page.evaluate(async () => {
    const moduleUrl = '/src/lib/contracts/content-updates';
    return (await import(moduleUrl) as typeof import('../../src/lib/contracts/content-updates')).CONTENT_PACKAGE_CACHE;
  });
}
async function seedLegacy(page: Page, mode: 'valid' | 'missing' | 'malformed' | 'null-chapter') {
  await page.evaluate(async mode => {
    const moduleUrl = '/src/lib/contracts/content-updates';
    const { CONTENT_PACKAGE_CACHE } = await import(moduleUrl) as typeof import('../../src/lib/contracts/content-updates');
    const cache = await caches.open(CONTENT_PACKAGE_CACHE);
    const base = 'https://tutam-cache.local/content-packages/';
    const row = { id: 'legacy', tieu_de: 'legacy', has_muc_luc: 1, trang_thai: 'Hoàn thành', updated_at: '2026-10-01' };
    const entry = { kind: 'article', group: 'book', mode: 'full', version: 'legacy-v1', row, packageKey: `${base}article/legacy/legacy-v1` };
    await cache.put(`${base}index`, new Response(JSON.stringify([entry])));
    if (mode !== 'missing') await cache.put(entry.packageKey, new Response(mode === 'malformed' ? '{broken' : JSON.stringify({ article: row, chapters: mode === 'null-chapter' ? [null] : [{ id: 'legacy-chapter', noi_dung: 'retained' }] })));
  }, mode);
}

test('index quota failure rejects update and preserves committed chapters', async ({ page }) => {
  await setup(page); await save(page, 'A');
  await page.evaluate(() => {
    const original = Cache.prototype.put;
    Cache.prototype.put = async function (request, response) {
      if (response.headers.get('x-tutam-content-index') === 'pending') throw new DOMException('quota', 'QuotaExceededError');
      await original.call(this, request, response);
    };
  });
  await expect(save(page, 'A', 'two')).rejects.toThrow('quota');
  expect(await chapter(page)).toEqual([{ id: 'A-chapter', noi_dung: 'one' }]);
});

test('IDB transaction abort after staging cannot promote new Cache payload', async ({ page }) => {
  await setup(page); await save(page, 'A');
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      const request = original.apply(this, args);
      if (this.name === 'items') this.transaction.abort();
      return request;
    };
  });
  await expect(save(page, 'A', 'two')).rejects.toThrow();
  await page.reload(); await setup(page);
  expect(await chapter(page)).toEqual([{ id: 'A-chapter', noi_dung: 'one' }]);
  expect(await page.evaluate(async name => (await (await caches.open(name)).match('https://tutam-cache.local/content-packages/index'))?.headers.get('x-tutam-content-index'), await cacheName(page))).toBe('committed');
});

test('closing writer after pending Cache put preserves OLD and repairs projection', async ({ context }) => {
  const [writer, reader] = await withTwoPages(context);
  await save(writer, 'A'); await pausePut(writer, 'pending');
  const interrupted = save(writer, 'A', 'two').catch(() => undefined);
  await writer.evaluate(() => (window as unknown as TestWindow).packagePaused);
  await writer.close(); await interrupted;
  expect(await chapter(reader)).toEqual([{ id: 'A-chapter', noi_dung: 'one' }]);
  expect(await ids(reader)).toEqual(['A']);
  expect(await reader.evaluate(async name => (await (await caches.open(name)).match('https://tutam-cache.local/content-packages/index'))?.headers.get('x-tutam-content-index'), await cacheName(reader))).toBe('committed');
});

test('valid legacy migration survives an old writer deleting the Cache payload', async ({ page }) => {
  await setup(page); await seedLegacy(page, 'valid');
  expect(await ids(page)).toEqual(['legacy']);
  await page.evaluate(async name => {
    await (await caches.open(name)).delete('https://tutam-cache.local/content-packages/article/legacy/legacy-v1');
  }, await cacheName(page));
  expect(await chapter(page, 'legacy')).toEqual([{ id: 'legacy-chapter', noi_dung: 'retained' }]);
  await save(page, 'A');
  expect(await ids(page)).toEqual(['A', 'legacy']);
});

for (const mode of ['missing', 'malformed', 'null-chapter'] as const) {
  test(`legacy ${mode} payload rejects a write and preserves original index bytes`, async ({ page }) => {
    await setup(page); await seedLegacy(page, mode);
    const name = await cacheName(page);
    const before = await page.evaluate(async name => (await (await caches.open(name)).match('https://tutam-cache.local/content-packages/index'))?.text(), name);
    await expect(save(page, 'A')).rejects.toThrow('offline_content_legacy_incomplete');
    const after = await page.evaluate(async name => (await (await caches.open(name)).match('https://tutam-cache.local/content-packages/index'))?.text(), name);
    expect(after).toBe(before);
    if (mode === 'null-chapter') {
      expect(await page.evaluate(async () => {
        const response = await (window as unknown as TestWindow).storageApi.readUpdatedContentResponse(new URL(`${location.origin}/api/articles/legacy/chapters?so_thu_tu=eq.1`));
        return response ? await response.json() : null;
      })).toBeNull();
    }
  });
}

test('committed IDB remains readable with corrupt or blocked Cache storage', async ({ page }) => {
  await setup(page); await save(page, 'A');
  await page.evaluate(async name => { await (await caches.open(name)).put('https://tutam-cache.local/content-packages/index', new Response('{broken')); }, await cacheName(page));
  expect(await ids(page)).toEqual(['A']);
  expect(await chapter(page)).toEqual([{ id: 'A-chapter', noi_dung: 'one' }]);
  await page.evaluate(() => { CacheStorage.prototype.open = async () => { throw new Error('blocked'); }; });
  expect(await ids(page)).toEqual(['A']);
  expect(await chapter(page)).toEqual([{ id: 'A-chapter', noi_dung: 'one' }]);
});

test('empty reads do not create a legacy Cache index', async ({ page }) => {
  await setup(page);
  expect(await ids(page)).toEqual([]);
  expect(await page.evaluate(async name => Boolean(await (await caches.open(name)).match('https://tutam-cache.local/content-packages/index')), await cacheName(page))).toBe(false);
});

test('same-item concurrent saves retain the newer dated version in either commit order', async ({ browser }) => {
  for (const newerFirst of [false, true]) {
    const context = await browser.newContext();
    try {
      const [older, newer] = await withTwoPages(context);
      await Promise.all([older, newer].map(page => pausePut(page, 'package')));
      const oldSave = save(older, 'A', 'one').then(() => 'committed', () => 'rejected');
      const newSave = save(newer, 'A', 'two').then(() => 'committed', () => 'rejected');
      await Promise.all([older, newer].map(page => page.evaluate(() => (window as unknown as TestWindow).packagePaused)));
      const first = newerFirst ? newer : older;
      const second = newerFirst ? older : newer;
      await first.evaluate(() => (window as unknown as TestWindow).releasePackage());
      await (newerFirst ? newSave : oldSave);
      await second.evaluate(() => (window as unknown as TestWindow).releasePackage());
      await Promise.all([oldSave, newSave]);
      expect(await chapter(newer)).toEqual([{ id: 'A-chapter', noi_dung: 'two' }]);
    } finally { await context.close(); }
  }
});

for (const group of ['pdf', 'talk'] as const) {
  test(`shell ${group} saves reactive Proxy metadata and nested arrays to real IDB`, async ({ page }) => {
    await setup(page);
    const result = await page.evaluate(async group => {
      const raw = {
        id: `proxy-${group}`, tieu_de: 'Proxy metadata', updated_at: '2026-10-03',
        trang_thai: 'Hoàn thành', visibility: 'public', pdf_url: group === 'pdf' ? 'https://example.test/book.pdf' : '',
        tracks: [{ id: 'track-1', sources: [{ url: 'https://example.test/audio.mp3' }] }],
        tags: ['offline', 'retained'],
      };
      function reactive<T extends object>(value: T): T {
        return new Proxy(value, {
          get(target, key, receiver) {
            const child: unknown = Reflect.get(target, key, receiver);
            return child !== null && typeof child === 'object' ? reactive(child) : child;
          },
        });
      }
      const row = reactive(raw);
      const api = (window as unknown as TestWindow).storageApi;
      await api.saveContentPackage({ kind: group === 'talk' ? 'talk' : 'article', group, mode: 'shell', version: 'proxy-v1', row }, row, []);
      return (await api.savedContentItems()).find(item => item.row.id === raw.id);
    }, group);
    expect(result?.mode).toBe('shell');
    expect(result?.row.tracks).toEqual([{ id: 'track-1', sources: [{ url: 'https://example.test/audio.mp3' }] }]);
    expect(result?.row.tags).toEqual(['offline', 'retained']);
    await page.reload(); await setup(page);
    expect(await ids(page)).toEqual([`proxy-${group}`]);
  });
}
