import type { ContentRow, ContentUpdateItem } from '$lib/contracts/content-updates';
import { CONTENT_IMAGE_CACHE } from '$lib/contracts/content-updates';
import { contentVersion, updateGroup } from '$lib/domain/content-update-model';
import { imageSources } from '$lib/domain/content-update-model';
import { isIosExcludedContent } from '$lib/domain/ios-content-policy';
import { normalizeCoverSrc } from '$lib/domain/cover-url';
import { parsePositionedImage } from '$lib/domain/positioned-image';
import { resolvePdfUrl } from '$lib/utils/pdf-url';
import { getOfflinePdf, listOfflinePdfMetadata, normalizePdfPrincipal, offlinePdfRecordKey, retireOfflinePdf, type OfflinePdfMetadata } from './offline-pdf-database';
import { readIndexedContentItem } from './offline-content-index';
import { isOfflinePdfDownloadActive } from './pdf-offline-downloads';
import { isNativeApp } from './native-platform';
import { fetchWithDeadline } from './network-deadline';
import { throwIfAborted } from './abort-signal';

interface BundledImageProof { path: string; bytes: number; sha256: string; }
interface BundledContentProof { content?: string; images?: BundledImageProof[]; }
export interface PdfTransitionContext { principalId: string | null; isCurrent(): boolean; }
export interface PdfBookTransition { item: ContentUpdateItem; record: OfflinePdfMetadata; bundledRow?: ContentRow; bundledDigest?: string; bundledImages?: BundledImageProof[]; }
export function assertPdfTransitionCurrent(context: PdfTransitionContext, signal?: AbortSignal): void {
  throwIfAborted(signal);
  if (!context.isCurrent()) throw new DOMException('Account changed', 'AbortError');
}
export async function hasPreservedOfflinePdf(article: { id: string; pdfUrl?: string }, principalId: string | null): Promise<boolean> {
  if (!article.pdfUrl) return false;
  const owner = normalizePdfPrincipal(principalId);
  const record = await getOfflinePdf(owner, article.id);
  return Boolean(record && record.ownerId === owner && record.key === offlinePdfRecordKey(owner, article.id)
    && resolvePdfUrl(record.sourceUrl) === resolvePdfUrl(article.pdfUrl));
}
export async function collectPdfBookTransitions(items: ContentUpdateItem[], context: PdfTransitionContext): Promise<PdfBookTransition[]> {
  assertPdfTransitionCurrent(context);
  const owner = normalizePdfPrincipal(context.principalId);
  const downloads = await listOfflinePdfMetadata(owner).catch(() => []);
  assertPdfTransitionCurrent(context);
  const seen = new Set<string>();
  const transitions: PdfBookTransition[] = [];
  for (const item of items) {
    if (item.kind !== 'article' || item.group !== 'book' || item.mode !== 'full' || !item.row.pdf_url || Number(item.row.so_tap) <= 0 || seen.has(item.row.id)) continue;
    const record = downloads.find(record => record.ownerId === owner && record.documentId === item.row.id
      && record.key === offlinePdfRecordKey(owner, item.row.id)
      && resolvePdfUrl(record.sourceUrl) === resolvePdfUrl(String(item.row.pdf_url)));
    if (record) { transitions.push({ item, record }); seen.add(item.row.id); }
  }
  return transitions;
}
function completeChapters(item: ContentUpdateItem, chapters: unknown): chapters is ContentRow[] {
  return Array.isArray(chapters) && chapters.length === Number(item.row.so_tap)
    && chapters.length > 0 && new Set(chapters.map(row => row?.id)).size === chapters.length
    && chapters.every(row => row && (typeof row.id === 'string' || typeof row.id === 'number')
      && (row.bai_viet_id == null || String(row.bai_viet_id) === item.row.id) && String(row.noi_dung ?? '').trim());
}
async function availableImage(source: string, signal: AbortSignal, fetcher: typeof fetch, expected?: BundledImageProof): Promise<boolean> {
  throwIfAborted(signal);
  const clean = parsePositionedImage(source).src;
  let response: Response | undefined;
  // Prefer files from the signed native bundle over stale runtime image copies.
  // These are local file reads, never remote API/media probes.
  if (isNativeApp() && /^\/(?!api\/|\/)/u.test(clean)) {
    try {
      const local = await fetchWithDeadline(clean, { signal }, 8000, fetcher);
      if (local.ok && (local.headers.get('content-type') || '').startsWith('image/')) response = local;
      else await local.body?.cancel().catch(() => undefined);
    } catch { throwIfAborted(signal); }
  }
  if (!response && typeof caches !== 'undefined') {
    try { response = await (await caches.open(CONTENT_IMAGE_CACHE)).match(clean); } catch { /* Keep the previous document if storage is unavailable. */ }
  }
  if (!response?.ok || !(response.headers.get('content-type') || '').startsWith('image/')) {
    await response?.body?.cancel().catch(() => undefined);
    return false;
  }
  const blob = await response.blob();
  throwIfAborted(signal);
  if (!blob.size) return false;
  if (!expected) return !clean.startsWith('/assets/book-content/converted/');
  if (blob.size !== expected.bytes) return false;
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  throwIfAborted(signal);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('') === expected.sha256;
}
/** Only local authority/bundle reads. A catalog timestamp alone never retires a download. */
export async function isPdfBookTextReady(transition: PdfBookTransition, signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<boolean> {
  throwIfAborted(signal);
  const { item } = transition;
  const committed = await readIndexedContentItem(`article:${item.row.id}`).catch(() => null);
  let chapters: unknown;
  let article = item.row;
  let bundledImages: BundledImageProof[] | undefined;
  if (committed?.version === item.version && committed.mode === 'full' && committed.group === 'book' && committed.row.id === item.row.id) {
    try { chapters = JSON.parse(await committed.chapterData.text()); article = committed.row; } catch { return false; }
  } else if (isNativeApp()) {
    const base = transition.bundledRow ?? (await import('$lib/data/offline-bundled-articles.json')).default.find(row => row.id === item.row.id);
    if (!base || String(base.updated_at ?? '') !== String(item.row.updated_at ?? '') || Number(base.so_tap) !== Number(item.row.so_tap)
      || !base.has_muc_luc) return false;
    try {
      const response = await fetchWithDeadline(`/offline-data/chapters/${encodeURIComponent(item.row.id)}.json`, { signal }, 8000, fetcher);
      if (!response.ok || !(response.headers.get('content-type') || '').includes('application/json')) { await response.body?.cancel().catch(() => undefined); return false; }
      chapters = await response.json(); article = base;
      const versions = transition.bundledDigest ? null : (await import('$lib/data/offline-content-versions.json')).default as Record<string, BundledContentProof>;
      const expected = transition.bundledDigest ?? versions?.[item.row.id]?.content;
      bundledImages = transition.bundledImages ?? versions?.[item.row.id]?.images;
      if (!expected || !/^[a-f0-9]{64}$/u.test(expected)) return false;
      const bytes = new TextEncoder().encode(JSON.stringify([base, chapters]));
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      const actual = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
      if (actual !== expected) return false;
    } catch { throwIfAborted(signal); return false; }
  } else return false;
  throwIfAborted(signal);
  if (!completeChapters(item, chapters)) return false;
  const sources = new Set(imageSources(String(article.noi_dung ?? '')));
  for (const chapter of chapters) for (const source of imageSources(String(chapter.noi_dung ?? ''))) sources.add(source);
  const cover = parsePositionedImage(normalizeCoverSrc(article.anh_url)).src;
  if (cover) sources.add(cover);
  for (const source of sources) if (!await availableImage(source, signal, fetcher, bundledImages?.find(image => image.path === parsePositionedImage(source).src))) return false;
  return true;
}
export async function retirePdfBookTransition(transition: PdfBookTransition, signal: AbortSignal, context: PdfTransitionContext,
  fetcher: typeof fetch = fetch): Promise<'removed' | 'retained' | 'skipped'> {
  assertPdfTransitionCurrent(context, signal);
  if (transition.record.ownerId !== normalizePdfPrincipal(context.principalId)
    || transition.record.key !== offlinePdfRecordKey(context.principalId, transition.item.row.id)) return 'retained';
  let ready = false;
  try { ready = await isPdfBookTextReady(transition, signal, fetcher); }
  catch { assertPdfTransitionCurrent(context, signal); return 'retained'; }
  assertPdfTransitionCurrent(context, signal);
  if (!ready || isOfflinePdfDownloadActive(context.principalId, transition.item.row.id)) return 'retained';
  let removed = false;
  try { removed = await retireOfflinePdf(transition.record, () => !signal.aborted && context.isCurrent()); }
  catch { assertPdfTransitionCurrent(context, signal); return 'retained'; }
  assertPdfTransitionCurrent(context, signal);
  if (removed && typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('quangtu:offline-pdf-changed', { detail: { documentId: transition.item.row.id } }));
  if (removed) return 'removed';
  const remaining = await listOfflinePdfMetadata(context.principalId).catch(() => [transition.record]);
  assertPdfTransitionCurrent(context, signal);
  return remaining.some(record => record.key === transition.record.key) ? 'retained' : 'skipped';
}

/** An upgraded native bundle already owns full ordinary books. Never query D1 here. */
export async function retireBundledPdfBooks(context: PdfTransitionContext, signal: AbortSignal, fetcher: typeof fetch = fetch,
  bundledRows?: ContentRow[], bundledDigests?: Record<string, BundledContentProof>): Promise<{ removed: string[]; retained: string[] }> {
  assertPdfTransitionCurrent(context, signal);
  const result = { removed: [] as string[], retained: [] as string[] };
  if (!isNativeApp()) return result;
  const owner = normalizePdfPrincipal(context.principalId);
  const records = await listOfflinePdfMetadata(owner).catch(() => []);
  assertPdfTransitionCurrent(context, signal);
  if (!records.length) return result;
  const rows = bundledRows ?? (await import('$lib/data/offline-bundled-articles.json')).default as ContentRow[];
  const versions = bundledDigests ?? (await import('$lib/data/offline-content-versions.json')).default as Record<string, BundledContentProof>;
  for (const record of records) {
    assertPdfTransitionCurrent(context, signal);
    const row = rows.find(row => row.id === record.documentId);
    if (!row || isIosExcludedContent(row) || row.trang_thai !== 'Hoàn thành' || updateGroup(row, 'article') !== 'book' || Number(row.so_tap) <= 0
      || !row.pdf_url || record.ownerId !== owner || record.key !== offlinePdfRecordKey(owner, row.id)
      || resolvePdfUrl(record.sourceUrl) !== resolvePdfUrl(String(row.pdf_url))) continue;
    let version: string;
    try { version = await contentVersion(row, 'article'); }
    catch { assertPdfTransitionCurrent(context, signal); result.retained.push(String(row.tieu_de ?? record.title)); continue; }
    const item: ContentUpdateItem = { kind: 'article', group: 'book', mode: 'full', version, row };
    const outcome = await retirePdfBookTransition({ item, record, bundledRow: row, bundledDigest: versions[row.id]?.content, bundledImages: versions[row.id]?.images }, signal, context, fetcher);
    if (outcome === 'skipped') continue;
    result[outcome === 'removed' ? 'removed' : 'retained'].push(String(row.tieu_de ?? record.title));
  }
  return result;
}
