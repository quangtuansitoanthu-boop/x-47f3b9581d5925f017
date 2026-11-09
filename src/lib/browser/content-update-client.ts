import { throwIfAborted } from './abort-signal';
import { collectPdfBookTransitions, isPdfBookTextReady, retirePdfBookTransition, assertPdfTransitionCurrent, type PdfBookTransition, type PdfTransitionContext } from './pdf-book-transition';
import type { ContentArticlePage, ContentCatalogPage, ContentRow, ContentSize, ContentUpdateItem } from '$lib/contracts/content-updates';
import { isContentAvailable } from './ios-content-policy';
import { imageSources, updateItemKey } from '$lib/domain/content-update-model';
import { normalizeCoverSrc } from '$lib/domain/cover-url';
import { parsePositionedImage } from '$lib/domain/positioned-image';
import { isHtmlResponse, resolvePublicUpdateUrl, resolveRemoteUrl } from './native-api';
import { fetchWithDeadline } from './network-deadline';
import { saveContentPackage, savedContentItems } from './offline-content-packages';
import { offlineImageRemoteSource, saveCoverOffline } from './session-cover';
import { rememberCompletedBook } from './offline-books-sync';

export interface ContentUpdatePlan {
  items: ContentUpdateItem[];
  sizes: ContentSize[];
  bytes: number;
  unknownImages: number;
  pdfTransitions?: PdfBookTransition[];
}
export interface ContentUpdateProgress { completed: number; total: number; title: string; }
const cover = (item: ContentUpdateItem) => parsePositionedImage(normalizeCoverSrc(item.row[item.kind === 'talk' ? 'anh_dai_dien' : 'anh_url'])).src;

export class ContentUpdateUnavailableError extends Error {
  constructor() { super('content_update_server_unavailable'); }
}

async function apiJson<T>(query: URLSearchParams, signal: AbortSignal, fetcher: typeof fetch): Promise<T> {
  const response = await fetchWithDeadline(resolvePublicUpdateUrl(`/api/content-updates?${query}`),
    { signal, cache: 'no-store', headers: { accept: 'application/json' } }, 30000, fetcher);
  const unsupported = response.status === 404 || isHtmlResponse(response);
  if (!response.ok || unsupported) {
    // Giải phóng body để dọn deadline trước khi người dùng kiểm tra lại.
    await response.body?.cancel().catch(() => undefined);
    if (unsupported) throw new ContentUpdateUnavailableError();
    throw new Error(`content_update_api:${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function checkContentUpdates(signal: AbortSignal, fetcher: typeof fetch = fetch, transitionContext?: PdfTransitionContext): Promise<ContentUpdatePlan> {
  throwIfAborted(signal);
  const [saved, bundleModule, talksModule] = await Promise.all([
    savedContentItems(), import('$lib/data/offline-bundled-articles.json'), import('$lib/data/offline-talks.json'),
  ]);
  const known = new Map(saved.map(item => [updateItemKey(item), item.version]));
  const bundled = new Map((bundleModule.default as ContentRow[]).map(row => [row.id, row]));
  const bundledTalks = new Map((talksModule.default as ContentRow[]).map(row => [row.id, row]));
  const items: ContentUpdateItem[] = [];
  const catalog: ContentUpdateItem[] = [];
  const query = new URLSearchParams();
  for (let pageNumber = 0; ; pageNumber++) {
    if (pageNumber >= 1000) throw new Error('content_update_catalog_too_large');
    const page = await apiJson<ContentCatalogPage>(query, signal, fetcher);
    if (!Array.isArray(page.items) || !('articlesNext' in page) || !('talksNext' in page)) throw new Error('content_update_invalid_catalog');
    for (const item of page.items) {
      if (!isContentAvailable(item.row)) continue;
      if (typeof item.row?.id !== 'string' || !item.row.id || !['article', 'talk'].includes(item.kind)
        || !['book', 'scripture', 'ritual', 'pdf', 'talk'].includes(item.group)
        || item.mode !== (['pdf', 'talk'].includes(item.group) ? 'shell' : 'full')
        || (item.kind === 'talk') !== (item.group === 'talk') || !/^[a-f0-9]{64}$/u.test(item.version)) throw new Error('content_update_invalid_item');
      catalog.push(item);
      if (known.get(updateItemKey(item)) === item.version) continue;
      if (!known.has(updateItemKey(item))) {
        const base = item.kind === 'article' ? bundled.get(item.row.id) : bundledTalks.get(item.row.id);
        if (base) {
          if (item.kind === 'article' && Date.parse(String(base.updated_at)) >= Date.parse(String(item.row.updated_at))) continue;
          if (item.kind === 'talk') {
            const { contentVersion } = await import('$lib/domain/content-update-model');
            if (await contentVersion(base, 'talk') === item.version) continue;
          }
        }
      }
      items.push(item);
    }
    for (const name of ['articles', 'talks'] as const) {
      const next = page[`${name}Next`];
      if (next === null) query.set(`${name}Done`, '1');
      else {
        if (!next || query.get(`${name}After`) === next) throw new Error('content_update_invalid_cursor');
        query.set(`${name}After`, next);
      }
    }
    if (page.articlesNext === null && page.talksNext === null) break;
  }
  const pdfTransitions = transitionContext ? await collectPdfBookTransitions(catalog, transitionContext) : [];
  for (const transition of pdfTransitions) {
    assertPdfTransitionCurrent(transitionContext!, signal);
    if (!items.some(item => updateItemKey(item) === updateItemKey(transition.item)) && !await isPdfBookTextReady(transition, signal, fetcher)) items.push(transition.item);
  }
  if (transitionContext) assertPdfTransitionCurrent(transitionContext, signal);
  const full = items.filter(item => item.mode === 'full');
  const sizes: ContentSize[] = [];
  for (let offset = 0; offset < full.length; offset += 40) {
    const batch = await apiJson<ContentSize[]>(new URLSearchParams({ action: 'estimate', ids: full.slice(offset, offset + 40).map(item => item.row.id).join(',') }), signal, fetcher);
    if (!Array.isArray(batch) || batch.some(size => !Number.isSafeInteger(size.bytes) || size.bytes < 0 || !Number.isSafeInteger(size.chapters) || size.chapters < 0)) throw new Error('content_update_invalid_size');
    sizes.push(...batch);
  }
  if (full.some(item => !sizes.some(size => size.id === item.row.id))) throw new Error('content_update_missing_size');
  // Tổng text/JSON dự kiến trước tải. Ảnh không có Content-Length được báo riêng.
  let bytes = sizes.reduce((sum, size) => sum + size.bytes, 0)
    + new TextEncoder().encode(JSON.stringify(items)).byteLength;
  let unknownImages = sizes.filter(size => size.illustrated).length;
  for (const source of new Set(items.map(cover).filter(Boolean))) {
    throwIfAborted(signal);
    try {
      const url = resolveRemoteUrl(offlineImageRemoteSource(source));
      const response = await fetchWithDeadline(url, { method: 'HEAD', credentials: 'omit', signal }, 8000, fetcher);
      const size = Number(response.headers.get('content-length'));
      if (response.ok && Number.isSafeInteger(size) && size > 0 && (response.headers.get('content-type') ?? '').startsWith('image/')) bytes += size;
      else unknownImages++;
      await response.body?.cancel();
    } catch (cause) { throwIfAborted(signal); unknownImages++; }
  }
  return { items, sizes, bytes, unknownImages, ...(pdfTransitions.length ? { pdfTransitions } : {}) };
}

export interface ContentUpdateResult { completed: number; failed: string[]; pdfRemoved?: string[]; pdfRetained?: string[]; }

export async function downloadContentUpdates(plan: ContentUpdatePlan, signal: AbortSignal,
  onProgress: (progress: ContentUpdateProgress) => void, fetcher: typeof fetch = fetch, transitionContext?: PdfTransitionContext): Promise<ContentUpdateResult> {
  let completed = 0;
  const failed: string[] = [];
  const failedIds = new Set<string>();
  if (transitionContext) assertPdfTransitionCurrent(transitionContext, signal);
  const savedImages = new Set<string>();
  async function saveImage(source: string) {
    if (savedImages.has(source)) return;
    await saveCoverOffline(source, signal);
    savedImages.add(source);
  }
  for (const item of plan.items) {
    throwIfAborted(signal);
    if (transitionContext) assertPdfTransitionCurrent(transitionContext, signal);
    onProgress({ completed, total: plan.items.length, title: String(item.row.tieu_de ?? '') });
    try {
      let article = item.row;
      const chapters: ContentRow[] = [];
      if (item.mode === 'full') {
        let cursor: number | null = null;
        for (let pageNumber = 0; ; pageNumber++) {
          if (pageNumber >= 10000) throw new Error('content_update_book_too_large');
          const query = new URLSearchParams({ action: 'article', id: item.row.id, version: item.version });
          if (cursor !== null) query.set('after', String(cursor));
          const page = await apiJson<ContentArticlePage>(query, signal, fetcher);
          if (page.article?.id !== item.row.id || !Array.isArray(page.chapters)) throw new Error('content_update_invalid_package');
          if (pageNumber === 0) article = page.article;
          chapters.push(...page.chapters);
          if (page.next === null) break;
          if (!Number.isSafeInteger(page.next) || (cursor !== null && page.next <= cursor)) throw new Error('content_update_invalid_cursor');
          cursor = page.next;
        }
        const expected = plan.sizes.find(size => size.id === item.row.id);
        if (!expected || expected.chapters !== chapters.length || new Set(chapters.map(chapter => chapter.id)).size !== chapters.length
          || chapters.some(chapter => !String(chapter.noi_dung ?? '').trim())
          || (!chapters.length && !String(article.noi_dung ?? '').trim())) throw new Error('content_update_incomplete');
        const images = new Set(imageSources(String(article.noi_dung ?? '')));
        for (const chapter of chapters) for (const source of imageSources(String(chapter.noi_dung ?? ''))) images.add(source);
        for (const source of images) await saveImage(source);
      }
      const source = cover(item);
      if (source) await saveImage(source);
      throwIfAborted(signal);
      if (transitionContext) assertPdfTransitionCurrent(transitionContext, signal);
      await saveContentPackage(item, article, chapters);
      if (item.mode === 'full') rememberCompletedBook({ id: item.row.id, title: String(item.row.tieu_de ?? ''), downloadedAt: Date.now(), chapterCount: chapters.length, updatedAt: String(item.row.updated_at ?? '') });
      completed++;
    } catch (cause) {
      throwIfAborted(signal);
      if (transitionContext) assertPdfTransitionCurrent(transitionContext, signal);
      failedIds.add(item.row.id);
      failed.push(String(item.row.tieu_de ?? item.row.id));
    }
  }
  onProgress({ completed, total: plan.items.length, title: '' });
  if (!transitionContext || !plan.pdfTransitions?.length) return { completed, failed };
  const pdfRemoved: string[] = [], pdfRetained: string[] = [];
  for (const transition of plan.pdfTransitions) {
    assertPdfTransitionCurrent(transitionContext, signal);
    const title = String(transition.item.row.tieu_de ?? transition.record.title);
    if (failedIds.has(transition.item.row.id)) { pdfRetained.push(title); continue; }
    const outcome = await retirePdfBookTransition(transition, signal, transitionContext, fetcher);
    if (outcome !== 'skipped') (outcome === 'removed' ? pdfRemoved : pdfRetained).push(title);
  }
  return { completed, failed, pdfRemoved, pdfRetained };
}
