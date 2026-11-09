import { loadSession } from './lib/server/auth/sessions';
import { corsPreflight, withCors } from './lib/server/http/cors';
import { type EventLike, migrationIsSealed } from './lib/server/http/runtime';
import {
  DEFAULT_SITE_NAME,
  DEFAULT_SITE_DESCRIPTION,
  DEFAULT_TALK_DESCRIPTION,
  ensureAbsoluteUrl,
  getImageMimeType,
  cleanMetaDescription,
} from './lib/domain/social-preview';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export const handle = async ({ event, resolve }: {
  event: EventLike;
  resolve: (event: EventLike, opts?: { transformPageChunk?: (input: { html: string }) => string | Promise<string> }) => Promise<Response>;
}): Promise<Response> => {
  const env = event.platform?.env ?? null;
  const rawUrl = event.url ?? new URL(event.request.url);
  const pathname = rawUrl.pathname;
  const isApiRequest = pathname.startsWith('/api/');
  const isHealthRequest = pathname === '/api/health';
  event.locals.requestId = event.request.headers.get('cf-ray') || crypto.randomUUID();
  // Specific +server routes bypass the catch-all API handler. Apply its policy
  // uniformly, and answer preflight before migration/session database work.
  const preflight = isApiRequest ? corsPreflight(event.request) : null;
  if (preflight) {
    preflight.headers.set('X-Request-Id', String(event.locals.requestId));
    return preflight;
  }
  // These handlers return the same public aggregate for every role. Other
  // content reads still need a session to enforce draft/private visibility.
  const isPublicAggregateRead = event.request.method === 'GET'
    && (pathname === '/api/app/stats' || pathname === '/api/album-plays' || pathname === '/api/thanh-tinh/stats');
  event.locals.env = env;
  event.locals.session = null;
  event.locals.migrationSealed = !isApiRequest || isHealthRequest;

  if (env && isApiRequest && !isHealthRequest) {
    try {
      event.locals.migrationSealed = await migrationIsSealed(env);
    } catch {
      event.locals.migrationSealed = false;
      warnRuntimeFailure('migration-seal-check-failed', event.locals.requestId, pathname);
    }
  } else if (!env && isApiRequest && !isHealthRequest) {
    event.locals.migrationSealed = false;
  }

  const shouldLoadSession = env && !isHealthRequest && !isPublicAggregateRead && (!isApiRequest || event.locals.migrationSealed);
  if (shouldLoadSession) {
    try {
      event.locals.session = await loadSession(event.request, env);
    } catch {
      event.locals.session = null;
      if (isApiRequest) event.locals.migrationSealed = false;
      warnRuntimeFailure('session-load-failed', event.locals.requestId, pathname);
    }
  }

  // Load social preview metadata for full page requests with article or album query
  let previewMeta: {
    title: string;
    description: string;
    imageUrl: string;
    imageType: string;
    canonicalUrl: string;
    type: string;
  } | null = null;

  if (!isApiRequest && !isHealthRequest && env?.DB) {
    const origin = rawUrl.origin.replace(/^http:\/\//iu, 'https://');
    const canReadUnpublishedContent = event.locals.session?.role === 'admin'
      || event.locals.session?.role === 'ctv';
    if (pathname === '/') {
      const articleId = rawUrl.searchParams.get('article')
        || rawUrl.searchParams.get('id')
        || rawUrl.searchParams.get('book')
        || rawUrl.searchParams.get('bai-viet')
        || rawUrl.searchParams.get('bai_viet')
        || rawUrl.searchParams.get('sach')
        || rawUrl.searchParams.get('doc')
        || rawUrl.searchParams.get('slug');
      if (articleId) {
        try {
          const row = await env.DB.prepare(
            `SELECT tieu_de, tom_tat, anh_url FROM baiviet
             WHERE id = ?${canReadUnpublishedContent ? '' : " AND trang_thai = 'Hoàn thành'"}
             LIMIT 1`
          ).bind(articleId).first() as Record<string, unknown> | null;
          if (row && row.tieu_de) {
            const title = `${row.tieu_de} — Quang Từ`;
            const description = cleanMetaDescription(String(row.tom_tat ?? ''), DEFAULT_SITE_DESCRIPTION);
            const imageUrl = ensureAbsoluteUrl(String(row.anh_url ?? ''), origin);
            previewMeta = {
              title,
              description,
              imageUrl,
              imageType: getImageMimeType(imageUrl),
              canonicalUrl: `${origin}/?article=${encodeURIComponent(articleId)}`,
              type: 'article',
            };
          }
        } catch {
          // Ignore preview DB lookup errors
        }
      }
    } else if (pathname === '/phap-thoai') {
      const albumId = rawUrl.searchParams.get('album')
        || rawUrl.searchParams.get('id')
        || rawUrl.searchParams.get('album_id')
        || rawUrl.searchParams.get('phap_thoai')
        || rawUrl.searchParams.get('phap-thoai')
        || rawUrl.searchParams.get('audio')
        || rawUrl.searchParams.get('track');
      if (albumId) {
        try {
          const row = await env.DB.prepare(
            `SELECT tieu_de, mo_ta, anh_dai_dien FROM phap_thoai
             WHERE id = ?${canReadUnpublishedContent ? '' : " AND visibility = 'public'"}
             LIMIT 1`
          ).bind(albumId).first() as Record<string, unknown> | null;
          if (row && row.tieu_de) {
            const title = `${row.tieu_de} — Pháp Thoại Quang Từ`;
            const description = cleanMetaDescription(String(row.mo_ta ?? ''), DEFAULT_TALK_DESCRIPTION);
            const imageUrl = ensureAbsoluteUrl(String(row.anh_dai_dien ?? ''), origin);
            previewMeta = {
              title,
              description,
              imageUrl,
              imageType: getImageMimeType(imageUrl),
              canonicalUrl: `${origin}/phap-thoai?album=${encodeURIComponent(albumId)}`,
              type: 'music.album',
            };
          }
        } catch {
          // Ignore preview DB lookup errors
        }
      }
    }
  }

  const response = await resolve(event, {
    transformPageChunk: ({ html }) => {
      if (!previewMeta) return html;
      const safeTitle = escapeHtml(previewMeta.title);
      const safeDesc = escapeHtml(previewMeta.description);
      const safeImg = escapeHtml(previewMeta.imageUrl);
      const safeImgType = escapeHtml(previewMeta.imageType);
      const safeCanonical = escapeHtml(previewMeta.canonicalUrl);
      const safeType = escapeHtml(previewMeta.type);

      return html
        .replace(/<title>[^<]*<\/title>/iu, `<title>${safeTitle}</title>`)
        .replace(/<meta\s+name=["']title["']\s+content=["'][^"']*["']/iu, `<meta name="title" content="${safeTitle}"`)
        .replace(/<meta\s+name=["']description["']\s+content=["'][^"']*["']/iu, `<meta name="description" content="${safeDesc}"`)
        .replace(/<link\s+rel=["']canonical["']\s+href=["'][^"']*["']/iu, `<link rel="canonical" href="${safeCanonical}"`)
        .replace(/<meta\s+property=["']og:title["']\s+content=["'][^"']*["']/iu, `<meta property="og:title" content="${safeTitle}"`)
        .replace(/<meta\s+property=["']og:description["']\s+content=["'][^"']*["']/iu, `<meta property="og:description" content="${safeDesc}"`)
        .replace(/<meta\s+property=["']og:image["']\s+content=["'][^"']*["']/iu, `<meta property="og:image" content="${safeImg}"`)
        .replace(/<meta\s+property=["']og:image:secure_url["']\s+content=["'][^"']*["']/iu, `<meta property="og:image:secure_url" content="${safeImg}"`)
        .replace(/<meta\s+property=["']og:image:type["']\s+content=["'][^"']*["']/iu, `<meta property="og:image:type" content="${safeImgType}"`)
        .replace(/<meta\s+property=["']og:type["']\s+content=["'][^"']*["']/iu, `<meta property="og:type" content="${safeType}"`)
        .replace(/<meta\s+property=["']og:url["']\s+content=["'][^"']*["']/iu, `<meta property="og:url" content="${safeCanonical}"`)
        .replace(/<meta\s+property=["']zalo:title["']\s+content=["'][^"']*["']/iu, `<meta property="zalo:title" content="${safeTitle}"`)
        .replace(/<meta\s+property=["']zalo:description["']\s+content=["'][^"']*["']/iu, `<meta property="zalo:description" content="${safeDesc}"`)
        .replace(/<meta\s+property=["']zalo:image["']\s+content=["'][^"']*["']/iu, `<meta property="zalo:image" content="${safeImg}"`)
        .replace(/<meta\s+name=["']twitter:title["']\s+content=["'][^"']*["']/iu, `<meta name="twitter:title" content="${safeTitle}"`)
        .replace(/<meta\s+name=["']twitter:description["']\s+content=["'][^"']*["']/iu, `<meta name="twitter:description" content="${safeDesc}"`)
        .replace(/<meta\s+name=["']twitter:image["']\s+content=["'][^"']*["']/iu, `<meta name="twitter:image" content="${safeImg}"`);
    },
  });

  if (
    !isApiRequest
    && (response.headers.get('Content-Type') ?? '').startsWith('text/html')
  ) {
    if (event.locals.session) response.headers.set('Cache-Control', 'private, no-store');
    else if (!response.headers.has('Cache-Control')) response.headers.set('Cache-Control', 'no-cache');
  }
  response.headers.set('X-Request-Id', String(event.locals.requestId));
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'SAMEORIGIN');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  if (rawUrl.protocol === 'https:' || env?.APP_ORIGIN?.startsWith('https:')) {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
  return isApiRequest ? withCors(response, event.request) : response;
};

function warnRuntimeFailure(event: string, requestId: unknown, pathname: string): void {
  console.warn(JSON.stringify({ event, requestId: String(requestId), pathname }));
}
