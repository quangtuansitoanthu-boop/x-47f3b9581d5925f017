import { fetchEnglishChapters } from '$lib/browser/english-pack';
import { requestDeadline } from './network-deadline';
import { availableContent, blockedContentRequest } from './ios-content-policy';
import { isOnlineOnlyBook } from '$lib/domain/online-only-policy';
import { isHtmlResponse } from './native-api';
import { mergeUpdatedArticleRows, readUpdatedContentResponse } from './offline-content-packages';

interface OfflineArticle {
  id: string;
  tieu_de: string;
  tom_tat?: string | null;
  noi_dung?: string | null;
  danh_muc?: string | null;
  tags?: string | null;
  tac_gia?: string | null;
  anh_url?: string | null;
  noi_bat?: number | null;
  ngay_dang?: string | null;
  has_muc_luc?: number | null;
  so_tap?: number | null;
  trang_thai?: string | null;
  tap_tieu_de?: string | null;
  pdf_url?: string | null;
  link_ngoai?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  is_pdf_book?: boolean;
  bundled_offline?: boolean;
}

// Lazy cache variables - NEVER synchronously import 1.5MB into initial bundle
let offlineArticlesCache: OfflineArticle[] | null = null;
let articlesMapCache: Map<string, OfflineArticle> | null = null;
let offlineArticlesPromise: Promise<OfflineArticle[]> | null = null;

async function getOfflineArticles(): Promise<OfflineArticle[]> {
  if (offlineArticlesCache) return offlineArticlesCache;
  if (!offlineArticlesPromise) {
    offlineArticlesPromise = (async () => {
      // 1. Prioritize fast direct fetch from local WebView/app static assets
      try {
        const resp = await fetch('/offline-bundled-articles.json');
        if (resp.ok && !isHtmlResponse(resp)) {
          const payload = await resp.json();
          if (Array.isArray(payload) && payload.length > 0) {
            offlineArticlesCache = availableContent(payload as OfflineArticle[]);
            const map = new Map<string, OfflineArticle>();
            for (const a of offlineArticlesCache) {
              map.set(a.id, a);
              const clean = a.id.replace(/^book_/u, '');
              map.set(clean, a);
              map.set(`book_${clean}`, a);
            }
            articlesMapCache = map;
            return offlineArticlesCache;
          }
        }
      } catch {}

      // 2. Fallback to dynamic chunk import
      try {
        const mod = await import('$lib/data/offline-bundled-articles.json');
        const raw = (mod as any).default || mod;
        if (Array.isArray(raw)) {
          offlineArticlesCache = availableContent(raw as unknown as OfflineArticle[]);
          const map = new Map<string, OfflineArticle>();
          for (const a of offlineArticlesCache) {
            map.set(a.id, a);
            const clean = a.id.replace(/^book_/u, '');
            map.set(clean, a);
            map.set(`book_${clean}`, a);
          }
          articlesMapCache = map;
          return offlineArticlesCache;
        }
      } catch {}

      offlineArticlesCache = [];
      articlesMapCache = new Map();
      return offlineArticlesCache;
    })();
  }
  return offlineArticlesPromise;
}

async function getArticlesMap(): Promise<Map<string, OfflineArticle>> {
  if (articlesMapCache) return articlesMapCache;
  await getOfflineArticles();
  return articlesMapCache || new Map();
}

let offlineBooksEnCache: Record<string, { title: string; summary?: string; author?: string }> | null = null;
async function getOfflineBooksEn(): Promise<Record<string, { title: string; summary?: string; author?: string }>> {
  if (offlineBooksEnCache) return offlineBooksEnCache;
  try {
    const mod = await import('$lib/data/offline-books-en.json');
    offlineBooksEnCache = ((mod as any).default || mod || {}) as Record<string, { title: string; summary?: string; author?: string }>;
  } catch {
    offlineBooksEnCache = {};
  }
  return offlineBooksEnCache;
}

let offlineTalksCache: any[] | null = null;
let offlineTalksPromise: Promise<any[]> | null = null;
async function getOfflineTalks(): Promise<any[]> {
  if (offlineTalksCache) return offlineTalksCache;
  if (!offlineTalksPromise) {
    offlineTalksPromise = (async () => {
      try {
        const resp = await fetch('/offline-data/talks.json');
        if (resp.ok && !isHtmlResponse(resp)) {
          const payload = await resp.json();
          if (Array.isArray(payload) && payload.length > 0) {
            offlineTalksCache = availableContent(payload);
            return offlineTalksCache;
          }
        }
      } catch {}
      try {
        const mod = await import('$lib/data/offline-talks.json');
        const raw = (mod as any).default || mod;
        if (Array.isArray(raw)) {
          offlineTalksCache = availableContent(raw);
          return offlineTalksCache;
        }
      } catch {}
      offlineTalksCache = [];
      return offlineTalksCache;
    })();
  }
  return offlineTalksPromise;
}

function getActiveLocale(): string {
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem('tutam_locale') || 'vi';
    }
  } catch {}
  return 'vi';
}

async function localizeArticle(article: OfflineArticle, locale: string): Promise<OfflineArticle> {
  if (locale !== 'en') return article;
  const offlineBooksEn = await getOfflineBooksEn();
  const enMeta = offlineBooksEn[article.id] || offlineBooksEn[article.id.replace(/^book_/u, '')] || offlineBooksEn[`book_${article.id}`];
  if (!enMeta) return article;
  return {
    ...article,
    tieu_de: enMeta.title || article.tieu_de,
    tom_tat: enMeta.summary || article.tom_tat,
    tac_gia: enMeta.author || article.tac_gia
  };
}

let articlesEnCache: Promise<Record<string, { tieu_de?: string; tom_tat?: string | null; noi_dung?: string | null }>> | null = null;

function getArticlesEn(): Promise<Record<string, { tieu_de?: string; tom_tat?: string | null; noi_dung?: string | null }>> {
  if (!articlesEnCache) {
    articlesEnCache = (async () => {
      try {
        const resp = await fetch('/offline-data/articles-en.json');
        if (resp.ok && !isHtmlResponse(resp)) {
          const payload = await resp.json();
          if (payload && typeof payload === 'object') return payload;
        }
      } catch {}
      return {};
    })();
  }
  return articlesEnCache;
}

async function localizeArticleAsync(article: OfflineArticle, locale: string): Promise<OfflineArticle> {
  const base = await localizeArticle(article, locale);
  if (locale !== 'en') return base;
  try {
    const enMap = await getArticlesEn();
    const full = enMap[article.id];
    if (!full) return base;
    return {
      ...base,
      tieu_de: full.tieu_de || base.tieu_de,
      tom_tat: full.tom_tat || base.tom_tat,
      noi_dung: full.noi_dung || base.noi_dung
    };
  } catch {
    return base;
  }
}

async function localizeRowsAsync(rows: OfflineArticle[], locale: string): Promise<OfflineArticle[]> {
  if (locale !== 'en') return rows;
  return Promise.all(rows.map((a) => localizeArticleAsync(a, locale)));
}

function eqParam(url: URL | null, name: string): string | null {
  const value = url?.searchParams.get(name);
  if (!value?.startsWith('eq.')) return null;
  return decodeURIComponent(value.slice(3));
}

const chapterCacheVi = new Map<string, any[]>();
const chapterCacheEn = new Map<string, any[]>();

async function bundledChapters(articleOrId: OfflineArticle | string, url: URL | null): Promise<any[]> {
  const map = await getArticlesMap();
  const id = typeof articleOrId === 'string' ? articleOrId : articleOrId.id;
  const article = typeof articleOrId === 'string' ? map.get(id) : articleOrId;
  const locale = getActiveLocale();
  const cache = locale === 'en' ? chapterCacheEn : chapterCacheVi;
  let chapters: any[] = cache.get(id) || [];

  const idVariants = [id, id.startsWith('book_') ? id.replace(/^book_/, '') : `book_${id}`];

  if (chapters.length === 0 && locale === 'en') {
    const deadline = requestDeadline(undefined, 6_000);
    try {
    for (const testId of idVariants) {
      try {
        const enResp = await fetchEnglishChapters(`/offline-data/chapters-en/${encodeURIComponent(testId)}.json`, deadline.signal);
        if (enResp.ok && !isHtmlResponse(enResp)) {
          const payload = await enResp.json();
          if (Array.isArray(payload) && payload.length > 0) {
            chapters = payload;
            cache.set(id, chapters);
            break;
          }
        }
      } catch {}
    }
    } finally {
      deadline.dispose();
    }
  }

  if (chapters.length === 0) {
    for (const testId of idVariants) {
      try {
        const localResp = await fetch(`/offline-data/chapters/${encodeURIComponent(testId)}.json`);
        if (localResp.ok && !isHtmlResponse(localResp)) {
          const payload = await localResp.json();
          if (Array.isArray(payload) && payload.length > 0) {
            chapters = payload;
            chapterCacheVi.set(id, chapters);
            break;
          }
        }
      } catch {
        // Fallback sang dữ liệu nhúng trong article.
      }
    }
  }

  if (chapters.length === 0 && article) {
    try {
      if (article.tap_tieu_de) {
        const rawToc = article.tap_tieu_de;
        const parsed = Array.isArray(rawToc) ? rawToc : JSON.parse(String(rawToc));
        if (Array.isArray(parsed) && parsed.length > 0) {
          chapters = parsed.map((item, idx) => ({
            id: `${article.id}_chap_${idx + 1}`,
            bai_viet_id: article.id,
            so_thu_tu: idx,
            tieu_de: typeof item === 'string' ? item : item.tieu_de || `Chương ${idx + 1}`,
            tom_tat: item.tom_tat || '',
            noi_dung: item.noi_dung || article.noi_dung || ''
          }));
        }
      }
    } catch {
      // Fallback tiếp sang chương tổng hợp bên dưới.
    }
  }

  if (chapters.length === 0 && article && article.noi_dung) {
    chapters = [{
      id: `${article.id}_full`,
      bai_viet_id: article.id,
      so_thu_tu: 1,
      tieu_de: article.tieu_de,
      tom_tat: article.tom_tat || '',
      noi_dung: article.noi_dung
    }];
  }

  const targetSoThuTu = eqParam(url, 'so_thu_tu');
  if (targetSoThuTu !== null) {
    const target = Number(targetSoThuTu);
    let filtered = chapters.filter((chapter) => Number(chapter?.so_thu_tu) === target);
    if (filtered.length === 0) {
      if (chapters[target]) {
        filtered = [chapters[target]];
      } else if (target > 0 && chapters[target - 1]) {
        filtered = [chapters[target - 1]];
      }
    }
    chapters = filtered;
  }

  return chapters;
}

export async function readUpdatedBundledContentResponse(url: URL): Promise<Response | null> {
  const articleRequest = /^\/api\/articles\/[^/]+(?:\/chapters)?$/u.test(url.pathname)
    || ['/api/data/baiviet', '/api/data/tap_noi_dung'].includes(url.pathname);
  return readUpdatedContentResponse(url, articleRequest ? await getOfflineArticles() : undefined);
}

export async function resolveOfflineBundledResponse(input: RequestInfo | URL): Promise<Response | null> {
  const urlString = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  
  // Extract path from relative or absolute URL
  let pathname = '';
  let urlObj: URL | null = null;
  try {
    urlObj = new URL(urlString, 'https://quangtu.vn');
    pathname = urlObj.pathname;
  } catch {
    pathname = urlString.split('?')[0];
  }

  if (urlObj) {
    if (blockedContentRequest(urlObj)) return new Response('null', { status: 404, headers: { 'content-type': 'application/json' } });
    const saved = await readUpdatedBundledContentResponse(urlObj);
    if (saved) return saved;
  }

  // 1. Catalog list: /api/articles
  if (pathname === '/api/articles') {
    const articles = await mergeUpdatedArticleRows(await getOfflineArticles());
    return new Response(JSON.stringify(articles), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // 2. Views: /api/data/luot_xem
  if (pathname === '/api/data/luot_xem') {
    let cached = '';
    try {
      if (typeof localStorage !== 'undefined') {
        cached = localStorage.getItem('quangtu_views_cache') || '';
      }
    } catch {}
    if (!cached || cached === '[]') {
      try {
        const mod = await import('$lib/data/default-views.json');
        cached = JSON.stringify((mod as any).default || mod || []);
      } catch {}
    }
    return new Response(cached || '[]', {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // 3. PostgREST article detail: /api/data/baiviet?id=eq.ID
  if (pathname === '/api/data/baiviet') {
    const id = eqParam(urlObj, 'id');
    const map = await getArticlesMap();
    const articles = await getOfflineArticles();
    const rows = id ? [map.get(id)].filter((a): a is OfflineArticle => Boolean(a)) : articles;
    return new Response(JSON.stringify(rows), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // 4. PostgREST chapters: /api/data/tap_noi_dung?bai_viet_id=eq.ID
  if (pathname === '/api/data/tap_noi_dung') {
    const id = eqParam(urlObj, 'bai_viet_id');
    if (id) {
      const chapters = await bundledChapters(id, urlObj);
      if (chapters && chapters.length > 0) {
        return new Response(JSON.stringify(chapters), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }
  }

  // 5. Single article: /api/articles/:id
  const articleMatch = /^\/api\/articles\/([^/]+)$/.exec(pathname);
  if (articleMatch) {
    const id = decodeURIComponent(articleMatch[1]);
    const map = await getArticlesMap();
    const article = map.get(id);
    if (article) {
      return new Response(JSON.stringify(article), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  // 6. Chapters: /api/articles/:id/chapters
  const chaptersMatch = /^\/api\/articles\/([^/]+)\/chapters$/.exec(pathname);
  if (chaptersMatch) {
    const id = decodeURIComponent(chaptersMatch[1]);
    const chapters = await bundledChapters(id, urlObj);
    if (chapters && chapters.length > 0) {
      return new Response(JSON.stringify(chapters), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  // 7. Views count increment: /api/articles/:id/views
  if (/^\/api\/articles\/[^/]+\/views$/.test(pathname)) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // 8. Comments: /api/articles/:id/comments
  if (/^\/api\/articles\/[^/]+\/comments$/.test(pathname)) {
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // 9. Pháp bảo offline: /api/phap-bao
  if (pathname === '/api/phap-bao') {
    const cachedLink = (typeof localStorage !== 'undefined' && localStorage.getItem('tutam_cached_shopee_link'))
      || 'https://shopee.vn/product/84427568/54218649079/';
    return new Response(JSON.stringify({
      items: [
        { id: 'kinh-duoc-su', tieu_de: 'Kinh Dược Sư Lưu Ly Quang Như Lai', link_shopee: cachedLink },
        { id: 'may-niem-phat', tieu_de: 'Máy Niệm Phật Cầm Tay', link_shopee: cachedLink },
        { id: 'vong-dau-tam', tieu_de: 'Vòng Dâu Tằm / Chuỗi Tràng Hạt', link_shopee: cachedLink },
        { id: 'pb_c7ed888a-d594-481f-aa6a-9f547f6b039e', tieu_de: 'Kinh Địa Tạng Bồ Tát Bổn Nguyện', link_shopee: cachedLink }
      ]
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // 10. Session: /api/session
  if (pathname === '/api/session') {
    try {
      if (typeof localStorage !== 'undefined') {
        const saved = localStorage.getItem('tutam_native_session');
        if (saved) {
          return new Response(saved, {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }
    } catch {}
    return new Response(JSON.stringify({ authenticated: false, user: null, csrfToken: null, expiresAt: null }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // 11. Health: /api/health
  if (pathname === '/api/health') {
    return new Response(JSON.stringify({ ok: true, offline: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // 12. Talks / Pháp Thoại
  if (pathname === '/api/talks') {
    const talks = await getOfflineTalks();
    return new Response(JSON.stringify(talks), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  const singleTalkMatch = /^\/api\/talks\/([^/]+)$/.exec(pathname);
  if (singleTalkMatch) {
    const talkId = decodeURIComponent(singleTalkMatch[1]);
    const talks = await getOfflineTalks();
    const album = Array.isArray(talks) ? talks.find((a) => String(a.id) === talkId) : null;
    if (album) {
      return new Response(JSON.stringify(album), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return new Response(JSON.stringify(null), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  if (pathname.includes('/plays')) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  if (pathname === '/api/album-plays') {
    let cached = '[]';
    try {
      if (typeof localStorage !== 'undefined') {
        cached = localStorage.getItem('quangtu_album_plays_cache') || '[]';
      }
    } catch {}
    return new Response(cached, {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'x-quangtu-offline': '1' }
    });
  }
  if (pathname === '/api/presence') {
    return new Response(JSON.stringify({ enabled: false, activeCount: 1 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // These endpoints have no bundled snapshot. A fake 200 replaces the view's
  // valid initial/cached data with the wrong schema and crashes offline screens.
  if (['/api/practice/progress', '/api/practice/campaigns', '/api/practice/leaderboard'].includes(pathname)) {
    return new Response(JSON.stringify({ error: {
      code: 'offline_unavailable',
      message: 'Chưa thể làm mới dữ liệu khi mất mạng. Bản gần nhất vẫn được giữ lại.',
    } }), {
      status: 503,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
    });
  }

  // 14. Reading activity sync
  if (pathname === '/api/reading-activity') {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return null;
}
