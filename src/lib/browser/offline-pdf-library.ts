import { throwIfAborted } from './abort-signal';
import defaultViewsRaw from '$lib/data/default-views.json';
import type { LibraryArticle, ArticleCategory } from '$lib/components/library/article';
import { ARTICLE_CATEGORIES, CatalogResponseError, fetchHomepageArticles } from './content-catalogs';
import { isHomepageArticleVisible } from '$lib/domain/library/homepage-visibility';
import { normalizeCoverSrc } from '$lib/domain/cover-url';
import { compareContentRecency } from '$lib/domain/content-recency';
import { resolvePdfUrl } from '$lib/utils/pdf-url';
import { isNativeApp } from './native-platform';
import { resolveOfflineBundledResponse } from './offline-bundled-resolver';
import { listOfflinePdfMetadata, normalizePdfPrincipal, offlinePdfRecordKey } from './offline-pdf-database';
import { updatedArticleRows } from './offline-content-packages';

const VIEWS_CACHE_KEY = 'quangtu_views_cache';

/** Reopen explicitly downloaded PDFs and bundled offline articles without network. */
export async function fetchHomepageWithOfflinePdfs(
  fetcher: typeof fetch,
  role: string,
  principalId: string | null,
  signal?: AbortSignal,
  readDownloads: typeof listOfflinePdfMetadata = listOfflinePdfMetadata,
): Promise<{ articles: LibraryArticle[]; offline: boolean }> {
  // Khi chạy native app và không có mạng, load ngay dữ liệu đóng gói offline + PDF đã tải
  if (isNativeApp() && typeof navigator !== 'undefined' && navigator.onLine === false) {
    return loadCombinedOfflineLibrary(role, principalId, readDownloads, signal);
  }

  const networkFailures = new Set<unknown>();
  const fetchWithNetworkEvidence: typeof fetch = async (input, init) => {
    try {
      return await fetcher(input, init);
    } catch (cause) {
      networkFailures.add(cause);
      throw cause;
    }
  };
  try {
    const articles = await fetchHomepageArticles(fetchWithNetworkEvidence, role, signal);
    return { articles, offline: false };
  } catch (cause) {
    if (signal?.aborted) throw cause;
    const serviceUnavailable = cause instanceof CatalogResponseError && (
      cause.status >= 500 || [200, 404, 408, 429].includes(cause.status)
    );
    const timedOut = cause instanceof DOMException && (cause.name === 'TimeoutError' || cause.name === 'AbortError');
    if (isNativeApp() && (serviceUnavailable || timedOut)) {
      return loadCombinedOfflineLibrary('guest', principalId, async () => [], signal, cause);
    }
    if (!networkFailures.has(cause)) throw cause;
    return loadCombinedOfflineLibrary(role, principalId, readDownloads, signal, cause);
  }
}

async function loadCombinedOfflineLibrary(
  role: string,
  principalId: string | null,
  readDownloads: typeof listOfflinePdfMetadata,
  signal?: AbortSignal,
  cause?: unknown,
): Promise<{ articles: LibraryArticle[]; offline: boolean }> {
  const result: LibraryArticle[] = [];
  const seenIds = new Set<string>();

  // 1. Tải sách thường đóng gói sẵn (khi chạy native app)
  const manualArticles = await updatedArticleRows();
  if (isNativeApp() || manualArticles.length) {
    try {
      const offlineResp = isNativeApp() ? await resolveOfflineBundledResponse('/api/articles')
        : new Response(JSON.stringify(manualArticles), { headers: { 'content-type': 'application/json' } });
      if (offlineResp?.ok) {
      const rows = (await offlineResp.json()) as Array<Record<string, unknown>>;
      const cachedViewsMap = new Map<string, number>(
        (defaultViewsRaw as Array<{ bai_viet_id: string; so_luot: number }>).map((r) => [String(r.bai_viet_id), Number(r.so_luot)])
      );
      try {
        if (typeof localStorage !== 'undefined') {
          const rawViews = localStorage.getItem(VIEWS_CACHE_KEY);
          if (rawViews) {
            const parsed = JSON.parse(rawViews);
            if (Array.isArray(parsed)) {
              for (const r of parsed) {
                cachedViewsMap.set(String(r.bai_viet_id ?? ''), Number(r.so_luot ?? 0));
              }
            }
          }
        }
      } catch {}

      const bundledArticles: LibraryArticle[] = rows
        .filter((row) => isHomepageArticleVisible(row, role))
        .map((row) => {
          const rawCategory = String(row.danh_muc ?? '').trim().toUpperCase();
          const category = ARTICLE_CATEGORIES.has(rawCategory as ArticleCategory)
            ? (rawCategory as ArticleCategory)
            : 'KHÁC';
          return {
            id: String(row.id ?? ''),
            title: String(row.tieu_de ?? ''),
            summary: String(row.tom_tat ?? ''),
            content: String(row.noi_dung ?? ''),
            category,
            tags: String(row.tags ?? '').split(',').map((tag: string) => tag.trim()).filter(Boolean),
            author: String(row.tac_gia ?? 'Tu Tập'),
            imageUrl: normalizeCoverSrc(row.anh_url),
            featured: Number(row.noi_bat ?? 0) > 0,
            publishedAt: String(row.ngay_dang ?? ''),
            hasTableOfContents: Boolean(row.has_muc_luc),
            volumeCount: Number(row.so_tap ?? 0),
            status: String(row.trang_thai ?? ''),
            pdfUrl: resolvePdfUrl(row.pdf_url),
            externalUrl: String(row.link_ngoai ?? ''),
            viewCount: cachedViewsMap.get(String(row.id ?? '')) ?? 0,
            createdAt: String(row.created_at ?? ''),
            updatedAt: String(row.updated_at ?? '')
          } satisfies LibraryArticle;
        })
        .filter((article) => article.id && article.title);

      for (const a of bundledArticles) {
        if (!seenIds.has(a.id)) {
          seenIds.add(a.id);
          result.push(a);
        }
      }
    }
  } catch {
    // Bỏ qua lỗi đọc bundle
  }
}

  // 2. Gộp thêm các sách PDF người dùng đã tải ngoại tuyến vào IndexedDB
  const ownerId = normalizePdfPrincipal(principalId);
  let records: Awaited<ReturnType<typeof readDownloads>> = [];
  try {
    records = await readDownloads(ownerId);
  } catch {}
  throwIfAborted(signal);
  try {
    for (const record of records) {
      if (record.ownerId === ownerId && record.key === offlinePdfRecordKey(ownerId, record.documentId) && !seenIds.has(record.documentId)) {
        seenIds.add(record.documentId);
        result.push({
          id: record.documentId,
          title: record.title,
          pdfUrl: record.sourceUrl,
          summary: '',
          content: '',
          category: 'KHÁC',
          tags: [],
          author: '',
          imageUrl: '',
          featured: false,
          publishedAt: '',
          hasTableOfContents: false,
          volumeCount: 0,
          status: '',
        });
      }
    }
  } catch {
    // Bỏ qua lỗi đọc PDF download
  }

  if (!result.length && cause) {
    throw cause;
  }

  result.sort(compareContentRecency);
  return { articles: result, offline: true };
}
