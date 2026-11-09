export const IMMUTABLE_ASSET_PREFIX = '/_app/immutable/';
export const OFFLINE_DOCUMENT_ROUTES = new Set(['/', '/huong-dan', '/phap-thoai', '/tu-tap']);
export const OFFLINE_PDF_RESOLVER_PREFIX = '/__offline/pdf/';

export function offlinePdfResolverPath(key: string): string {
  return `${OFFLINE_PDF_RESOLVER_PREFIX}${encodeURIComponent(key)}`;
}

export function offlinePdfResolverKey(pathname: string): string | null {
  if (!pathname.startsWith(OFFLINE_PDF_RESOLVER_PREFIX)) return null;
  const encoded = pathname.slice(OFFLINE_PDF_RESOLVER_PREFIX.length);
  if (!encoded || encoded.length > 2_048 || encoded.includes('/')) return null;
  try {
    const key = decodeURIComponent(encoded);
    return key && key.length <= 1_024 ? key : null;
  } catch {
    return null;
  }
}

export function isNetworkOnlyRequest(url: URL, response?: Response): boolean {
  return url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/auth/') ||
    url.pathname.startsWith('/oauth/') ||
    response?.type === 'opaque' ||
    response?.headers.has('set-cookie') === true ||
    /(?:private|no-store)/iu.test(response?.headers.get('cache-control') || '');
}

export function shouldPrecachePath(pathname: string): boolean {
  return pathname.startsWith(IMMUTABLE_ASSET_PREFIX)
    || pathname.startsWith('/fonts/') || pathname.startsWith('/assets/fonts/')
    || pathname.startsWith('/assets/branding/') || pathname.startsWith('/images/icons/')
    || pathname.startsWith('/vendor/pdfjs/')
    || ['/manifest.json', '/offline-bundled-articles.json', '/offline-data/talks.json'].includes(pathname);
}

export function shouldRuntimeCacheStaticPath(pathname: string): boolean {
  return pathname !== '/assets' && !/\.(?:mp4|webm|mov)$/iu.test(pathname);
}

export function isPracticeAudioPath(pathname: string): boolean {
  return pathname.startsWith('/assets/audio/') && /\.(mp3|m4a)$/iu.test(pathname);
}
