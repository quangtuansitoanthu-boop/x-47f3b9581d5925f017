import type { ContentRow, ContentUpdateItem } from '$lib/contracts/content-updates';
import { isContentAvailable } from './ios-content-policy';
import { CONTENT_PACKAGE_CACHE } from '$lib/contracts/content-updates';
import { updateGroup, updateItemKey } from '$lib/domain/content-update-model';
import { commitContentItem, importLegacyContent, indexedItem, readContentIndex, readIndexedContentItem, type ContentIndexSnapshot, type SavedContentItem } from './offline-content-index';

const ORIGIN = 'https://tutam-cache.local/content-packages/';
type SavedItem = SavedContentItem;
const PROJECTION_HEADER = 'x-tutam-content-index';
const REVISION_HEADER = 'x-tutam-content-revision';

async function open(): Promise<Cache | null> {
  try { return typeof caches === 'undefined' ? null : await caches.open(CONTENT_PACKAGE_CACHE); }
  catch { return null; }
}
async function readCacheIndex(cache: Cache): Promise<{ items: SavedItem[]; marker: string | null; revision: string | null } | null> {
  const response = await cache.match(`${ORIGIN}index`);
  if (!response) return null;
  const value: unknown = await response.json();
  if (!Array.isArray(value) || value.some(item => !item || typeof item !== 'object'
    || !['article', 'talk'].includes(item.kind) || !item.row || typeof item.row.id !== 'string'
    || typeof item.version !== 'string' || typeof item.packageKey !== 'string' || !item.packageKey.startsWith(ORIGIN))) throw new Error('offline_content_index_invalid');
  return { items: value as SavedItem[], marker: response.headers.get(PROJECTION_HEADER), revision: response.headers.get(REVISION_HEADER) };
}
function savedItems(snapshot: ContentIndexSnapshot): SavedItem[] {
  return snapshot.items.map(({ kind, group, mode, version, row, packageKey }) => ({ kind, group, mode, version, row, packageKey }));
}
async function legacyPackages(cache: Cache, entries: SavedItem[], snapshot: ContentIndexSnapshot) {
  const packages = [];
  for (const item of entries) {
    if (item.packageKey !== `${ORIGIN}${item.kind}/${encodeURIComponent(item.row.id)}/${item.version}`) throw new Error('offline_content_legacy_incomplete');
    if (snapshot.items.some(current => updateItemKey(current) === updateItemKey(item) && current.version === item.version)) continue;
    const response = await cache.match(item.packageKey);
    if (!response) throw new Error('offline_content_legacy_incomplete');
    try {
      const payload = await response.json() as { article?: ContentRow; chapters?: ContentRow[] };
      const article = payload.article;
      if (!article || article.id !== item.row.id || !Array.isArray(payload.chapters)
        || payload.chapters.some(chapter => !chapter || typeof chapter !== 'object' || Array.isArray(chapter))
        || updateGroup(article, item.kind) !== item.group
        || item.mode !== (['pdf', 'talk'].includes(item.group) ? 'shell' : 'full')
        || (item.kind === 'article' ? article.trang_thai !== 'Hoàn thành' : article.visibility !== 'public')) throw new Error('offline_content_legacy_incomplete');
      packages.push(indexedItem({ ...item, row: article }, payload.chapters));
    } catch { throw new Error('offline_content_legacy_incomplete'); }
  }
  return packages;
}
async function fingerprint(items: SavedItem[]): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(items));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
async function project(cache: Cache, snapshot: ContentIndexSnapshot): Promise<void> {
  await cache.put(`${ORIGIN}index`, json(savedItems(snapshot), { [PROJECTION_HEADER]: 'committed', [REVISION_HEADER]: String(snapshot.state.revision) }));
}
async function repairCommittedProjection(cache: Cache): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const snapshot = await readContentIndex();
    await project(cache, snapshot);
    if ((await readContentIndex()).state.revision === snapshot.state.revision) return;
  }
}
export async function savedContentItems(strict = false): Promise<SavedItem[]> {
  const cache = await open();
  let snapshot: ContentIndexSnapshot;
  try { snapshot = await readContentIndex(); }
  catch (cause) {
    if (strict) throw cause;
    // Storage mới bị chặn: chỉ đọc index legacy thật, không coi projection staged là commit.
    try { const legacy = cache ? await readCacheIndex(cache) : null; return legacy && !legacy.marker ? legacy.items : []; }
    catch { return []; }
  }
  if (!cache) { if (strict) throw new Error('offline_content_storage_unavailable'); return savedItems(snapshot); }
  let legacy: Awaited<ReturnType<typeof readCacheIndex>>;
  try { legacy = await readCacheIndex(cache); }
  catch (cause) { if (strict) throw cause; return savedItems(snapshot); }
  if (legacy && !legacy.marker) {
    try {
      const hash = await fingerprint(legacy.items);
      if (snapshot.state.legacyFingerprint !== hash) {
        await importLegacyContent(await legacyPackages(cache, legacy.items, snapshot), hash);
        snapshot = await readContentIndex();
      }
    } catch (cause) {
      if (strict) throw cause;
      const retained = new Map(legacy.items.map(item => [updateItemKey(item), item]));
      for (const item of savedItems(snapshot)) retained.set(updateItemKey(item), item);
      return [...retained.values()];
    }
  }
  if (!legacy && snapshot.items.length === 0 && snapshot.state.revision === 0) return [];
  if (!legacy || legacy.marker !== 'committed' || legacy.revision !== String(snapshot.state.revision)) {
    // Cache chỉ là projection tương thích; lỗi repair không che dữ liệu IDB đã commit.
    await project(cache, snapshot).catch(() => undefined);
  }
  return savedItems(snapshot);
}
function json(value: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json', ...headers } });
}

export async function saveContentPackage(item: ContentUpdateItem, article: ContentRow, chapters: ContentRow[]): Promise<void> {
  if (!isContentAvailable(article) || !isContentAvailable(item.row) || updateGroup(article, item.kind) !== item.group || (item.kind === 'article' ? article.trang_thai !== 'Hoàn thành' : article.visibility !== 'public')) {
    throw new Error('offline_content_not_public');
  }
  const cache = await open();
  if (!cache) throw new Error('offline_content_storage_unavailable');
  const packageKey = `${ORIGIN}${item.kind}/${encodeURIComponent(item.row.id)}/${item.version}`;
  await savedContentItems(true);
  const snapshot = await readContentIndex();
  const current = snapshot.items.find(saved => updateItemKey(saved) === updateItemKey(item));
  const next = savedItems(snapshot).filter(saved => updateItemKey(saved) !== updateItemKey(item));
  const saved = { ...item, row: article, packageKey };
  next.push(saved);
  await cache.put(packageKey, json({ article, chapters }));
  // Giữ contract quota cũ: projection phải ghi được trước khi commit authority mới.
  await cache.put(`${ORIGIN}index`, json(next, { [PROJECTION_HEADER]: 'pending' }));
  await commitContentItem(indexedItem(saved, chapters), current?.revision ?? 0);
  // Commit đã bền vững: lỗi projection không được báo nhầm là mất lần lưu này.
  await repairCommittedProjection(cache).catch(() => undefined);
  // Không xóa blob cũ: reader/old writer đang dùng cache legacy vẫn cần bản đó.

}

export async function updatedArticleRows(): Promise<ContentRow[]> {
  return (await savedContentItems()).filter(item => item.kind === 'article').map(item => item.row);
}
export async function mergeUpdatedArticleRows<T extends { id?: unknown; updated_at?: unknown }>(rows: T[]): Promise<T[]> {
  rows = rows.filter(isContentAvailable);
  const saved = await updatedArticleRows();
  if (!saved.length) return rows;
  const result = new Map(rows.map(value => [String(value.id), value]));
  for (const value of saved) {
    const current = result.get(value.id);
    const remoteTime = Date.parse(String(current?.updated_at ?? '')) || 0;
    const savedTime = Date.parse(String(value.updated_at ?? '')) || 0;
    if (!current || savedTime >= remoteTime) result.set(value.id, { ...current, ...value } as T);
  }
  return [...result.values()].filter(isContentAvailable);
}

export async function readUpdatedContentResponse(
  url: URL,
  bundledRows: ReadonlyArray<{ id?: unknown; updated_at?: unknown }> = [],
): Promise<Response | null> {
  const detail = /^\/api\/articles\/([^/]+)(\/chapters)?$/u.exec(url.pathname);
  const legacy = url.pathname === '/api/data/baiviet' || url.pathname === '/api/data/tap_noi_dung';
  const id = detail ? decodeURIComponent(detail[1]) : legacy
    ? (url.searchParams.get(url.pathname.endsWith('baiviet') ? 'id' : 'bai_viet_id') ?? '').replace(/^eq\./u, '') : '';
  if (!id) return null;
  if (!isContentAvailable({ id })) return new Response('null', { status: 404, headers: { 'content-type': 'application/json' } });
  const item = (await savedContentItems()).find(value => value.kind === 'article' && value.row.id === id);
  if (!item) return null;
  const bundled = bundledRows.find(row => String(row.id) === id);
  // Cùng chính sách với catalog: giữ gói đã tải, chỉ nhường bản đóng gói mới hơn.
  if (bundled && (Date.parse(String(bundled.updated_at ?? '')) || 0) > (Date.parse(String(item.row.updated_at ?? '')) || 0)) return null;
  const chaptersRequest = Boolean(detail?.[2]) || url.pathname.endsWith('tap_noi_dung');
  if (!chaptersRequest) return json(legacy ? [item.row] : item.row);
  if (item.mode !== 'full') return null;
  const committed = await readIndexedContentItem(updateItemKey(item)).catch(() => null);
  const response = committed?.version === item.version ? new Response(committed.chapterData) : await (await open())?.match(item.packageKey);
  if (!response) return null;
  let payload: { chapters: ContentRow[] };
  try {
    payload = committed?.version === item.version ? { chapters: await response.json() as ContentRow[] } : await response.json() as { chapters: ContentRow[] };
    if (!Array.isArray(payload.chapters) || payload.chapters.some(chapter => !chapter || typeof chapter !== 'object' || Array.isArray(chapter))) return null;
  } catch { return null; }
  const order = url.searchParams.get('so_thu_tu');
  const chapters = order?.startsWith('eq.')
    ? payload.chapters.filter(chapter => Number(chapter.so_thu_tu) === Number(order.slice(3))) : payload.chapters;
  return json(chapters);
}
