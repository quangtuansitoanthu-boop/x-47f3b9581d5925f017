import defaultViewsRaw from '$lib/data/default-views.json';
import { isContentAvailable } from './ios-content-policy';
import type { QueryClient } from '@tanstack/svelte-query';
import { mergeUpdatedArticleRows, savedContentItems } from './offline-content-packages';
import { fetchWithDeadline } from './network-deadline';
import type { LibraryArticle, ArticleCategory } from '$lib/components/library/article';
import type { TalkAlbum } from '$lib/components/audio/AudioCatalog.svelte';
import { isHomepageArticleVisible } from '$lib/domain/library/homepage-visibility';
import { sortPracticeCatalog, type PracticeArticleSummary, type PracticeCategory } from '$lib/domain/practice/state';
import { compareContentRecency } from '$lib/domain/content-recency';
import { normalizeCoverSrc } from '$lib/domain/cover-url';
import { resolvePdfUrl } from '$lib/utils/pdf-url';
import { isNativeApp } from './native-platform';
import { isHtmlResponse, resolveApiUrl } from './native-api';
import { resolveOfflineBundledResponse } from './offline-bundled-resolver';
import { getBrowserSessionSnapshot } from '$lib/stores/session.svelte';
import type { PageSessionDTO } from '$lib/server/auth/types';
import { markVerifiedTalkCatalog } from './talk-catalog-proof';
import {
  getCachedTalkAlbums,
  readCachedTalkCatalog,
  saveCachedTalkAlbums,
  mergeDeltaTalkAlbums,
  getTalkCatalogMeta,
  recordTalkCatalogSyncTime,
  captureTalkCatalogScope,
  assertTalkCatalogScope,
  type TalkCatalogScope,
  type CachedTalkAlbumRow,
} from './talk-catalog-cache';

interface ArticleRow {
  id?: unknown;
  tieu_de?: unknown;
  tom_tat?: unknown;
  noi_dung?: unknown;
  danh_muc?: unknown;
  tags?: unknown;
  tac_gia?: unknown;
  anh_url?: unknown;
  noi_bat?: unknown;
  ngay_dang?: unknown;
  has_muc_luc?: unknown;
  so_tap?: unknown;
  trang_thai?: unknown;
  pdf_url?: unknown;
  link_ngoai?: unknown;
  playlist_json?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
}

interface TalkTrackRow {
  title?: unknown;
  url?: unknown;
  duration_sec?: unknown;
  media_type?: unknown;
}

interface TalkAlbumRow {
  id?: unknown;
  tieu_de?: unknown;
  mo_ta?: unknown;
  chu_de?: unknown;
  dien_gia?: unknown;
  archive_id?: unknown;
  anh_dai_dien?: unknown;
  visibility?: unknown;
  ngay_dang?: unknown;
  created_at?: unknown;
  tracks?: unknown;
}

export const ARTICLE_CATEGORIES = new Set<ArticleCategory>([
  'CHUYỆN NHÂN QUẢ',
  'SÁCH KHUYẾN THIỆN',
  'KINH PHẬT',
  'TRÌ CHÚ',
  'NGHI THỨC KHÁC',
  'CÁC NGHI THỨC',
  'KHÁC'
]);

type PracticeContentCategory = Exclude<PracticeCategory, 'all'>;

const PRACTICE_CATEGORIES = new Set<string>(['KINH PHẬT', 'TRÌ CHÚ', 'NGHI THỨC KHÁC', 'CÁC NGHI THỨC']);
const ADMIN_CATALOG_PAGE_SIZE = 500;
export const LEGACY_TALK_SPEAKER = 'Chưa xác định';
export type TalkDurationFilter = 'all' | 'short' | 'medium' | 'long' | 'unknown';

const VIEWS_CACHE_KEY = 'quangtu_views_cache';
const VIEWS_SYNC_TIME_KEY = 'quangtu_views_last_sync_time';
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

export function talkSpeaker(album: TalkAlbum): string {
  return String(album.dien_gia ?? '').trim() || LEGACY_TALK_SPEAKER;
}

export function talkDurationSeconds(album: TalkAlbum): number | null {
  if (!album.tracks.length || album.tracks.some((track) => !Number.isFinite(track.duration_sec))) return null;
  return album.tracks.reduce((total, track) => total + Number(track.duration_sec), 0);
}

export function matchesTalkMetadataFilters(
  album: TalkAlbum,
  speaker: string,
  duration: TalkDurationFilter,
): boolean {
  if (speaker !== 'all' && talkSpeaker(album) !== speaker) return false;
  if (duration === 'all') return true;
  const seconds = talkDurationSeconds(album);
  if (duration === 'unknown') return seconds == null;
  if (seconds == null) return false;
  if (duration === 'short') return seconds < 15 * 60;
  if (duration === 'medium') return seconds >= 15 * 60 && seconds <= 45 * 60;
  return seconds > 45 * 60;
}

export class CatalogResponseError extends Error {
  constructor(message: string, readonly status: number, options?: ErrorOptions) {
    super(message, options);
    this.name = 'CatalogResponseError';
  }
}

async function readJsonRows<T>(response: Response, fallbackMessage: string): Promise<T[]> {
  if (!response.ok) throw new CatalogResponseError(fallbackMessage, response.status);
  // Bản native chạy file tĩnh: /api/* có thể trả về index.html (text/html).
  // Không gọi response.json() mù quáng để tránh lỗi `Unexpected token '<'`.
  if (isHtmlResponse(response)) throw new CatalogResponseError(fallbackMessage, response.status);
  let payload: unknown;
  try {
    payload = await response.json();
  } catch (cause) {
    if (cause instanceof DOMException && (cause.name === 'AbortError' || cause.name === 'TimeoutError')) throw cause;
    throw new CatalogResponseError(fallbackMessage, response.status, { cause });
  }
  if (!Array.isArray(payload) || payload.some(row => !row || typeof row !== 'object')) {
    throw new CatalogResponseError(fallbackMessage, response.status);
  }
  return payload as T[];
}

/** Prefix remote origin khi chạy native, web giữ nguyên path tương đối. */
function api(path: string): string {
  return resolveApiUrl(path);
}

async function fetchAllAdminRows<T>(
  baseUrl: string,
  fetcher: typeof fetch,
  signal: AbortSignal | undefined,
  fallbackMessage: string
): Promise<T[]> {
  const allRows: T[] = [];
  for (let offset = 0; ; offset += ADMIN_CATALOG_PAGE_SIZE) {
    const page = await fetcher(
      `${baseUrl}&limit=${ADMIN_CATALOG_PAGE_SIZE}&offset=${offset}`,
      { headers: { accept: 'application/json' }, signal }
    ).then((response) => readJsonRows<T>(response, fallbackMessage));
    allRows.push(...page);
    if (page.length < ADMIN_CATALOG_PAGE_SIZE) return allRows;
  }
}

export async function fetchHomepageArticles(
  fetcher: typeof fetch,
  role: string,
  signal?: AbortSignal
): Promise<LibraryArticle[]> {
  const originalFetch = fetcher;
  fetcher = (input, init) => fetchWithDeadline(input, init, 8000, originalFetch);
  // Native app hoặc browser offline: dùng dữ liệu đóng gói offline
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    const offline = await resolveOfflineBundledResponse('/api/articles');
    if (offline) {
      const offlineRows = await offline.json() as ArticleRow[];
      let cachedViewsMap = new Map<string, number>(
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

      // Nếu có mạng trên native app và đã qua 3 ngày kể từ lần cập nhật trước, tải lượt xem ngầm
      try {
        if (typeof navigator !== 'undefined' && navigator.onLine) {
          const lastSync = Number(typeof localStorage !== 'undefined' ? localStorage.getItem(VIEWS_SYNC_TIME_KEY) || 0 : 0);
          if (Date.now() - lastSync > THREE_DAYS_MS) {
            void fetcher(api('/api/data/luot_xem?select=bai_viet_id,so_luot'), {
              headers: { accept: 'application/json' }
            }).then(async (res) => {
              if (res.ok && !isHtmlResponse(res)) {
                const data = await res.json();
                if (Array.isArray(data) && typeof localStorage !== 'undefined') {
                  localStorage.setItem(VIEWS_CACHE_KEY, JSON.stringify(data));
                  localStorage.setItem(VIEWS_SYNC_TIME_KEY, String(Date.now()));
                }
              }
            }).catch(() => null);
          }
        }
      } catch {}

      return offlineRows
        .filter((row) => isHomepageArticleVisible(row, role))
        .map((row) => {
          const rawCategory = String(row.danh_muc ?? '').trim().toUpperCase();
          const category = ARTICLE_CATEGORIES.has(rawCategory as ArticleCategory)
            ? rawCategory as ArticleCategory
            : 'KHÁC';
          return {
            id: String(row.id ?? ''),
            title: String(row.tieu_de ?? ''),
            summary: String(row.tom_tat ?? ''),
            content: String(row.noi_dung ?? ''),
            category,
            tags: String(row.tags ?? '').split(',').map((tag) => tag.trim()).filter(Boolean),
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
            updatedAt: String(row.updated_at ?? ''),
            originalTitle: String(row.tieu_de ?? ''),
            originalSummary: String(row.tom_tat ?? ''),
            originalAuthor: String(row.tac_gia ?? 'Tu Tập')
          } satisfies LibraryArticle;
        })
        .filter((article) => article.id && article.title && isContentAvailable(article))
        .sort(compareContentRecency);
    }
  }

  const [articleRows, viewRows] = await Promise.all([
    fetcher(
      api('/api/articles?select=id,tieu_de,tom_tat,noi_dung,danh_muc,tags,tac_gia,anh_url,noi_bat,ngay_dang,has_muc_luc,so_tap,trang_thai,pdf_url,link_ngoai,playlist_json,created_at,updated_at&order=created_at.desc'),
      { headers: { accept: 'application/json' }, signal }
    ).then((response) => readJsonRows<ArticleRow>(response, 'Không thể tải bài viết. Vui lòng thử lại.')),
    fetcher(api('/api/data/luot_xem?select=bai_viet_id,so_luot'), {
      headers: { accept: 'application/json' },
      signal
    }).then((response) => response.ok
      ? readJsonRows<{ bai_viet_id?: unknown; so_luot?: unknown }>(response, '')
      : [])
      .catch(() => [])
  ]);
  const views = new Map(viewRows.map((row) => [String(row.bai_viet_id ?? ''), Number(row.so_luot ?? 0)]));

  return (await mergeUpdatedArticleRows(articleRows))
    .filter((row) => isHomepageArticleVisible(row, role))
    .map((row) => {
      const rawCategory = String(row.danh_muc ?? '').trim().toUpperCase();
      const category = ARTICLE_CATEGORIES.has(rawCategory as ArticleCategory)
        ? rawCategory as ArticleCategory
        : 'KHÁC';
      return {
        id: String(row.id ?? ''),
        title: String(row.tieu_de ?? ''),
        summary: String(row.tom_tat ?? ''),
        content: String(row.noi_dung ?? ''),
        category,
        tags: String(row.tags ?? '').split(',').map((tag) => tag.trim()).filter(Boolean),
        author: String(row.tac_gia ?? 'Tu Tập'),
        imageUrl: normalizeCoverSrc(row.anh_url),
        featured: Number(row.noi_bat ?? 0) > 0,
        publishedAt: String(row.ngay_dang ?? ''),
        hasTableOfContents: Boolean(row.has_muc_luc),
        volumeCount: Number(row.so_tap ?? 0),
        status: String(row.trang_thai ?? ''),
        pdfUrl: resolvePdfUrl(row.pdf_url),
        externalUrl: String(row.link_ngoai ?? ''),
        viewCount: views.get(String(row.id ?? '')) ?? 0,
        createdAt: String(row.created_at ?? ''),
        updatedAt: String(row.updated_at ?? ''),
        originalTitle: String(row.tieu_de ?? ''),
        originalSummary: String(row.tom_tat ?? ''),
        originalAuthor: String(row.tac_gia ?? 'Tu Tập')
      } satisfies LibraryArticle;
    })
    .filter((article) => article.id && article.title && isContentAvailable(article))
    .sort(compareContentRecency);
}

function normalizeTracks(value: unknown): TalkAlbum['tracks'] {
  let parsed = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      parsed = [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((track) => {
    if (!track || typeof track !== 'object' || Array.isArray(track)) return [];
    const row = track as TalkTrackRow;
    const title = String(row.title ?? '').trim();
    const url = String(row.url ?? '').trim();
    if (!title || !url) return [];
    const duration = row.duration_sec == null ? undefined : Number(row.duration_sec);
    return [{
      title,
      url,
      ...(row.media_type === 'video' ? { media_type: 'video' as const } : {}),
      ...(Number.isFinite(duration) && duration! >= 0 ? { duration_sec: Math.round(duration!) } : {})
    }];
  });
}

function mapTalkAlbum(row: TalkAlbumRow): TalkAlbum {
  return {
    id: String(row.id ?? ''),
    tieu_de: String(row.tieu_de ?? ''),
    mo_ta: String(row.mo_ta ?? ''),
    chu_de: String(row.chu_de ?? 'Pháp ngữ'),
    dien_gia: row.dien_gia == null ? null : String(row.dien_gia).trim() || null,
    archive_id: row.archive_id == null ? null : String(row.archive_id),
    anh_dai_dien: row.anh_dai_dien == null ? null : String(row.anh_dai_dien),
    visibility: String(row.visibility ?? 'public'),
    ngay_dang: row.ngay_dang == null ? null : String(row.ngay_dang),
    created_at: row.created_at == null ? null : String(row.created_at),
    tracks: normalizeTracks(row.tracks)
  };
}

async function fetchTalkAlbumRows(fetcher: typeof fetch, signal?: AbortSignal): Promise<TalkAlbumRow[]> {
  return fetcher(
    api('/api/talks?select=id,tieu_de,mo_ta,chu_de,dien_gia,archive_id,anh_dai_dien,visibility,ngay_dang,created_at,tracks&order=created_at.desc'),
    { headers: { accept: 'application/json' }, signal }
  ).then((response) => readJsonRows<TalkAlbumRow>(response, 'Không thể tải danh sách Pháp Thoại. Vui lòng kiểm tra mạng và thử lại.'));
}

export async function syncTalkDelta(fetcher: typeof fetch, sinceCreatedAt: string): Promise<TalkAlbumRow[]> {
  try {
    const encodedSince = encodeURIComponent(`gt.${sinceCreatedAt}`);
    const url = api(`/api/talks?select=id,tieu_de,mo_ta,chu_de,dien_gia,archive_id,anh_dai_dien,visibility,ngay_dang,created_at,tracks&created_at=${encodedSince}&order=created_at.desc`);
    const resp = await fetcher(url, { headers: { accept: 'application/json' } });
    if (!resp.ok) return [];
    const rows = await resp.json() as TalkAlbumRow[];
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

export async function refreshTalkAlbums(fetcher: typeof fetch): Promise<{ newCount: number; albums: TalkAlbum[] }> {
  const session = getBrowserSessionSnapshot();
  const scope = captureTalkCatalogScope(session.authenticated ? session.user?.id ?? null : null, session.user?.role ?? 'guest');
  const result = await refreshScopedTalkAlbums(fetcher, scope);
  assertTalkCatalogScope(scope);
  return { ...result, albums: result.albums.filter(album => album.visibility !== 'private' || Boolean(scope.principalId && ['admin', 'ctv'].includes(scope.role))) };
}

async function refreshScopedTalkAlbums(fetcher: typeof fetch, scope: TalkCatalogScope): Promise<{ newCount: number; albums: TalkAlbum[] }> {
  const meta = await getTalkCatalogMeta();
  assertTalkCatalogScope(scope);
  let updatedRows: TalkAlbumRow[] = [];
  let newCount = 0;

  if (meta.latestCreatedAt && meta.albumCount > 0) {
    const delta = await syncTalkDelta(fetcher, meta.latestCreatedAt);
    if (delta.length > 0) {
      newCount = delta.length;
      updatedRows = (await mergeDeltaTalkAlbums(delta as CachedTalkAlbumRow[], scope)) as TalkAlbumRow[];
    } else {
      await recordTalkCatalogSyncTime();
      updatedRows = ((await getCachedTalkAlbums(scope)) as TalkAlbumRow[]) || [];
    }
  }

  if (!updatedRows.length) {
    assertTalkCatalogScope(scope);
    const fullRows = await fetchTalkAlbumRows(fetcher);
    if (fullRows.length) {
      await saveCachedTalkAlbums(fullRows as CachedTalkAlbumRow[], scope);
      updatedRows = fullRows;
      newCount = fullRows.length;
    }
  }

  const albums = updatedRows
    .map(mapTalkAlbum)
    .filter((album) => album.id && album.tieu_de && album.tracks.length > 0 && isContentAvailable(album))
    .sort(compareContentRecency);

  return { newCount, albums };
}

export async function fetchTalkAlbums(fetcher: typeof fetch, signal?: AbortSignal, currentSession?: PageSessionDTO): Promise<TalkAlbum[]> {
  const session = currentSession ?? getBrowserSessionSnapshot();
  const scope = captureTalkCatalogScope(session.authenticated ? session.user?.id ?? null : null, session.user?.role ?? 'guest');
  const result = await fetchScopedTalkAlbums(fetcher, scope, signal);
  assertTalkCatalogScope(scope);
  return result.filter(album => album.visibility !== 'private' || Boolean(scope.principalId && ['admin', 'ctv'].includes(scope.role)))
    .map(album => markVerifiedTalkCatalog(album, session));
}

async function fetchScopedTalkAlbums(fetcher: typeof fetch, scope: TalkCatalogScope, signal?: AbortSignal): Promise<TalkAlbum[]> {
  // 1. Kiểm tra bộ nhớ đệm (Local-First: load ngay lập tức từ IndexedDB / localStorage)
  const cachedCatalog = await readCachedTalkCatalog(scope);
  let cachedRows = cachedCatalog?.rows ?? null;
  const manualTalks = (await savedContentItems()).filter(item => item.kind === 'talk').map(item => item.row);
  assertTalkCatalogScope(scope);
  if (manualTalks.length) {
    if (!cachedRows?.length) {
      const bundle = await resolveOfflineBundledResponse('/api/talks');
      cachedRows = bundle?.ok ? await bundle.json() as CachedTalkAlbumRow[] : [];
    }
    const merged = new Map((cachedRows ?? []).map(value => [String(value.id), value]));
    for (const value of manualTalks) merged.set(value.id, value);
    cachedRows = [...merged.values()];
  }
  if (cachedRows?.length && scope.principalId && ['admin', 'ctv'].includes(scope.role)) {
    const meta = cachedCatalog?.meta;
    if (meta?.privateOwnerId !== scope.principalId || meta?.privateOwnerRole !== scope.role) {
      // Cache công khai không chứng minh quyền xem private của tài khoản mới.
      try {
        assertTalkCatalogScope(scope);
        const authorizedRows = await fetchTalkAlbumRows(fetcher, signal);
        assertTalkCatalogScope(scope);
        if (authorizedRows.length) {
          await saveCachedTalkAlbums(authorizedRows, scope);
          cachedRows = authorizedRows;
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') throw error;
        assertTalkCatalogScope(scope);
        // Mất mạng vẫn giữ catalog công khai; không mượn private của tài khoản cũ.
      }
    }
  }
  if (cachedRows && cachedRows.length > 0) {
    if (isNativeApp()) {
      const additions = new Set(['pt_drive_f72e42f4cbb7db4312f96f4a1f28e2b4', 'pt_drive_c435791b562e6f6e9d345b414df4a273']);
      for (const row of cachedRows) additions.delete(String(row.id));
      if (additions.size) {
        const bundledResponse = await resolveOfflineBundledResponse('/api/talks');
        if (bundledResponse?.ok) {
          const bundledRows = await bundledResponse.json() as CachedTalkAlbumRow[];
          const missing = Array.isArray(bundledRows) ? bundledRows.filter(row => additions.has(String(row.id))) : [];
          if (missing.length) {
            // Bản app mới bổ sung metadata tại máy, không ghi đè catalog đã đồng bộ của người dùng.
            cachedRows = [...cachedRows, ...missing];
            await saveCachedTalkAlbums(cachedRows, scope);
          }
        }
      }
    }
    return (cachedRows as TalkAlbumRow[])
      .map(mapTalkAlbum)
      .filter((album) => album.id && album.tieu_de && album.tracks.length > 0 && isContentAvailable(album))
      .sort(compareContentRecency);
  }

  // 2. Nếu lần đầu mở app (chưa có cache):
  if (isNativeApp()) {
    const offlineResp = await resolveOfflineBundledResponse('/api/talks');
    if (offlineResp?.ok) {
      const offlineRows = await offlineResp.json() as TalkAlbumRow[];
      if (offlineRows.length) {
        await saveCachedTalkAlbums(offlineRows as CachedTalkAlbumRow[], scope);
        return offlineRows.map(mapTalkAlbum)
          .filter((album) => album.id && album.tieu_de && album.tracks.length > 0 && isContentAvailable(album))
          .sort(compareContentRecency);
      }
    }
  }

  // Tải danh sách đầy đủ từ server và lưu vào bộ nhớ máy
  assertTalkCatalogScope(scope);
  const rows = await fetchTalkAlbumRows(fetcher, signal).then(async (fetched) => {
    if (fetched.length) {
      await saveCachedTalkAlbums(fetched as CachedTalkAlbumRow[], scope);
      return fetched;
    }
    if (!isNativeApp()) return fetched;
    throw new Error('empty_talk_catalog');
  }).catch(async (err) => {
    if (err instanceof Error && err.name === 'AbortError') throw err;
    if (isNativeApp()) {
      try {
        const { listOfflineAlbums, getOfflineTracksForAlbum } = await import('./offline-audio-database');
        const cached = await listOfflineAlbums().catch(() => []);
        if (cached.length) {
          const offlineRows: TalkAlbumRow[] = [];
          for (const album of cached) {
            const tracks = await getOfflineTracksForAlbum(String(album.id ?? '')).catch(() => []);
            if (!tracks.length) continue;
            offlineRows.push({
              id: String(album.id ?? ''),
              tieu_de: String(album.title ?? ''),
              mo_ta: String(album.desc ?? ''),
              chu_de: 'Pháp ngữ',
              dien_gia: null,
              archive_id: null,
              anh_dai_dien: null,
              visibility: album.visibility,
              ngay_dang: null,
              created_at: null,
              tracks: tracks.map((track) => ({ title: track.title, url: track.url })),
            });
          }
          if (offlineRows.length) return offlineRows;
        }
      } catch {}
    }
    if (isNativeApp() || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      return [] as TalkAlbumRow[];
    }
    throw err;
  });

  return rows.map(mapTalkAlbum)
    .filter((album) => album.id && album.tieu_de && album.tracks.length > 0 && isContentAvailable(album))
    .sort(compareContentRecency);
}

export async function fetchAdminTalkAlbums(fetcher: typeof fetch, signal?: AbortSignal): Promise<TalkAlbum[]> {
  const rows = await fetchAllAdminRows<TalkAlbumRow>(
    api('/api/talks?select=id,tieu_de,mo_ta,chu_de,dien_gia,archive_id,anh_dai_dien,visibility,ngay_dang,created_at,tracks&order=created_at.desc'),
    fetcher,
    signal,
    'Không thể tải danh sách Pháp Thoại. Vui lòng kiểm tra mạng và thử lại.'
  );
  return rows.map(mapTalkAlbum)
    .filter((album) => album.id && album.tieu_de && isContentAvailable(album))
    .sort(compareContentRecency);
}

export function normalizePracticeCategory(
  danhMuc?: unknown,
  tieuDe?: unknown
): PracticeContentCategory | null {
  const upper = String(danhMuc ?? '').trim().toUpperCase();
  const title = String(tieuDe ?? '').trim().toLowerCase();

  // Sách chú giải, lược giảng hoặc dịch giải thuộc về thư viện sách, không phải bài thực hành tu tập
  if (title.includes('giảng giải') || title.includes('lược giảng')) {
    return null;
  }

  // Danh mục Trì chú trực tiếp
  if (upper === 'TRÌ CHÚ' || upper === 'TRI CHU') {
    return 'TRÌ CHÚ';
  }

  // Danh mục Kinh Phật
  if (
    upper === 'KINH PHẬT' ||
    upper === 'KINH PHAT' ||
    upper === 'KINH ĐIỂN PHẬT GIÁO' ||
    upper === 'KINH DIEN PHAT GIAO' ||
    upper === 'KINH'
  ) {
    if (
      title.includes('nghi thức sám hối') ||
      title.includes('nghi thức cúng') ||
      title.includes('nghi thức cầu siêu')
    ) {
      return 'NGHI THỨC KHÁC';
    }
    if (
      title.includes('trì tụng') &&
      (title.includes('chú') || title.includes('đà la ni') || title.includes('đà ra ni'))
    ) {
      return 'TRÌ CHÚ';
    }
    return 'KINH PHẬT';
  }

  // Danh mục Nghi thức
  if (
    upper === 'CÁC NGHI THỨC' ||
    upper === 'CAC NGHI THUC' ||
    upper === 'NGHI THỨC KHÁC' ||
    upper === 'NGHI THUC KHAC' ||
    upper === 'NGHI THỨC' ||
    upper === 'NGHI THUC'
  ) {
    // Nếu là nghi thức trì chú (như Chú Đại Bi, Chú Lăng Nghiêm)
    if (
      title.includes('chú') ||
      title.includes('chu ') ||
      title.includes('đà la ni') ||
      title.includes('đà ra ni') ||
      title.includes('đại bi') ||
      title.includes('lăng nghiêm')
    ) {
      return 'TRÌ CHÚ';
    }
    return 'NGHI THỨC KHÁC';
  }

  // Mọi danh mục khác (SÁCH KHUYẾN THIỆN, CHUYỆN NHÂN QUẢ, SÁCH, KHÁC...) hoàn toàn KHÔNG thuộc tu tập!
  return null;
}

export async function fetchPracticeCatalog(
  fetcher: typeof fetch,
  signal?: AbortSignal
): Promise<PracticeArticleSummary[]> {
  if (isNativeApp() || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
    const offline = await resolveOfflineBundledResponse('/api/articles');
    if (offline) {
      const offlineRows = await offline.json() as ArticleRow[];
      const articles: PracticeArticleSummary[] = [];
      for (const row of offlineRows) {
        const cat = normalizePracticeCategory(row.danh_muc, row.tieu_de);
        if (!cat) continue;
        const id = String(row.id ?? '').trim();
        const title = String(row.tieu_de ?? '').trim();
        if (!id || !title) continue;
        articles.push({
          author: String(row.tac_gia ?? 'Tu Tập'),
          category: cat,
          hasTableOfContents: Boolean(row.has_muc_luc),
          id,
          imageUrl: normalizeCoverSrc(row.anh_url),
          publishedAt: String(row.ngay_dang ?? ''),
          tags: String(row.tags ?? '').split(',').map((tag) => tag.trim()).filter(Boolean),
          title,
          createdAt: row.created_at ? String(row.created_at) : undefined,
          updatedAt: row.updated_at ? String(row.updated_at) : undefined,
          originalTitle: title
        });
      }
      return sortPracticeCatalog(articles);
    }
  }

  let rows = await fetcher(
    api('/api/articles?select=id,tieu_de,danh_muc,ngay_dang,anh_url,tac_gia,tags,has_muc_luc,created_at,updated_at&order=created_at.desc&limit=300'),
    { headers: { accept: 'application/json' }, signal }
  ).then((response) => readJsonRows<ArticleRow>(response, 'Không thể tải danh sách kinh và nghi thức. Vui lòng thử lại.'))
   .catch(async (err) => {
     // Bundle native không có server /api/* hoặc mất mạng:
     // luôn dùng sách đóng gói sẵn để chế độ Tu tập mở được offline.
     try {
       const offline = await resolveOfflineBundledResponse('/api/articles');
       if (offline) return offline.json() as Promise<ArticleRow[]>;
     } catch {
       // Rơi xuống throw err bên dưới.
     }
     throw err;
   });

  rows = await mergeUpdatedArticleRows(rows);
  const articles: PracticeArticleSummary[] = [];
  for (const row of rows) {
    const cat = normalizePracticeCategory(row.danh_muc, row.tieu_de);
    if (!cat) continue;
    const id = String(row.id ?? '').trim();
    const title = String(row.tieu_de ?? '').trim();
    if (!id || !title) continue;
    articles.push({
      author: String(row.tac_gia ?? 'Tu Tập'),
      category: cat,
      hasTableOfContents: Boolean(row.has_muc_luc),
      id,
      imageUrl: normalizeCoverSrc(row.anh_url),
      publishedAt: String(row.ngay_dang ?? ''),
      tags: String(row.tags ?? '').split(',').map((tag) => tag.trim()).filter(Boolean),
      title,
      createdAt: row.created_at ? String(row.created_at) : undefined,
      updatedAt: row.updated_at ? String(row.updated_at) : undefined,
      originalTitle: title
    });
  }

  return sortPracticeCatalog(articles);
}

export async function fetchAdminPracticeArticles(
  fetcher: typeof fetch,
  signal?: AbortSignal
): Promise<LibraryArticle[]> {
  const rows = await fetchAllAdminRows<ArticleRow>(
    api('/api/articles?select=id,tieu_de,tom_tat,noi_dung,danh_muc,tags,tac_gia,anh_url,noi_bat,ngay_dang,has_muc_luc,so_tap,trang_thai,pdf_url,link_ngoai,created_at,updated_at&order=created_at.desc'),
    fetcher,
    signal,
    'Không thể tải nội dung Tu tập. Vui lòng thử lại.'
  );

  const articles: LibraryArticle[] = [];
  for (const row of rows) {
    const cat = normalizePracticeCategory(row.danh_muc, row.tieu_de);
    if (!cat) continue;
    const id = String(row.id ?? '').trim();
    const title = String(row.tieu_de ?? '').trim();
    if (!id || !title) continue;
    articles.push({
      id,
      title,
      summary: String(row.tom_tat ?? ''),
      content: String(row.noi_dung ?? ''),
      category: cat,
      tags: String(row.tags ?? '').split(',').map((tag) => tag.trim()).filter(Boolean),
      author: String(row.tac_gia ?? 'Quang Từ'),
      imageUrl: normalizeCoverSrc(row.anh_url),
      featured: Number(row.noi_bat ?? 0) > 0,
      publishedAt: String(row.ngay_dang ?? ''),
      hasTableOfContents: Boolean(row.has_muc_luc),
      volumeCount: Number(row.so_tap ?? 0),
      status: String(row.trang_thai ?? ''),
      pdfUrl: resolvePdfUrl(row.pdf_url),
      externalUrl: String(row.link_ngoai ?? ''),
      createdAt: row.created_at ? String(row.created_at) : undefined,
      updatedAt: row.updated_at ? String(row.updated_at) : undefined
    });
  }

  return articles.sort(compareContentRecency);
}

/** Cập nhật projection đã mount bằng dữ liệu vừa lưu; không refetch query khác. */
export async function applyManualCatalogState(queryClient: QueryClient): Promise<void> {
  const saved = await savedContentItems();
  const rows = saved.filter(item => item.kind === 'article' && isContentAvailable(item.row)).map(item => item.row);
  const talks = saved.filter(item => item.kind === 'talk' && isContentAvailable(item.row)).map(item => mapTalkAlbum(item.row));
  const toArticle = (row: ArticleRow): LibraryArticle => ({
    id: String(row.id), title: String(row.tieu_de ?? ''), summary: String(row.tom_tat ?? ''), content: String(row.noi_dung ?? ''),
    category: ARTICLE_CATEGORIES.has(String(row.danh_muc) as ArticleCategory) ? String(row.danh_muc) as ArticleCategory : 'KHÁC',
    tags: String(row.tags ?? '').split(',').map(value => value.trim()).filter(Boolean), author: String(row.tac_gia ?? 'Tu Tập'),
    imageUrl: normalizeCoverSrc(row.anh_url), featured: Number(row.noi_bat) > 0, publishedAt: String(row.ngay_dang ?? ''),
    hasTableOfContents: Boolean(row.has_muc_luc), volumeCount: Number(row.so_tap ?? 0), status: String(row.trang_thai ?? ''),
    pdfUrl: resolvePdfUrl(row.pdf_url), externalUrl: String(row.link_ngoai ?? ''), updatedAt: String(row.updated_at ?? ''), createdAt: String(row.created_at ?? ''),
  });
  for (const query of queryClient.getQueryCache().getAll()) {
    const key = query.queryKey;
    if (key[0] === 'articles' && key[1] === 'catalog' && key[2] === 'homepage') {
      queryClient.setQueryData<{ articles: LibraryArticle[]; offline: boolean }>(key, previous => {
        if (!previous) return previous;
        const map = new Map(previous.articles.map(value => [value.id, value]));
        for (const row of rows) if (isHomepageArticleVisible({ danh_muc: row.danh_muc, trang_thai: row.trang_thai }, String(key[3]))) {
          const value = toArticle(row);
          map.set(value.id, { ...map.get(value.id), ...value, viewCount: map.get(value.id)?.viewCount ?? 0 });
        }
        return { ...previous, articles: [...map.values()].sort(compareContentRecency) };
      });
    } else if (key[0] === 'articles' && key[1] === 'catalog' && key[2] === 'practice') {
      queryClient.setQueryData<PracticeArticleSummary[]>(key, previous => {
        if (!previous) return previous;
        const map = new Map(previous.map(value => [value.id, value]));
        for (const row of rows) {
          const category = normalizePracticeCategory(row.danh_muc, row.tieu_de);
          if (!category) continue;
          const value = toArticle(row);
          map.set(value.id, { id: value.id, title: value.title, author: value.author, category, imageUrl: value.imageUrl,
            tags: value.tags, publishedAt: value.publishedAt, hasTableOfContents: value.hasTableOfContents,
            createdAt: value.createdAt, updatedAt: value.updatedAt, originalTitle: value.title });
        }
        return sortPracticeCatalog([...map.values()]);
      });
    } else if (key[0] === 'talks' && key[1] === 'catalog') {
      queryClient.setQueryData<TalkAlbum[]>(key, previous => {
        if (!previous) return previous;
        const map = new Map(previous.map(value => [value.id, value]));
        for (const value of talks) map.set(value.id, { ...map.get(value.id), ...value });
        return [...map.values()].filter(value => value.tracks.length > 0 && isContentAvailable(value)).sort(compareContentRecency);
      });
    }
  }
}
