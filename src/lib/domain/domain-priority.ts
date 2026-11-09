/**
 * Domain resolution and fallback priority:
 * 1. Cloudflare Workers Dev (free, direct worker origin)
 * 2. Vercel App (secondary fallback)
 * 3. Custom domain (quangtu.vn)
 */

export const DOMAIN_PRIORITY = [
  'https://quangtu-web.workers.dev',
  'https://quangtu.vercel.app',
  'https://quangtu.vn'
] as const;

export const DEFAULT_FALLBACK_DOMAIN = DOMAIN_PRIORITY[0];

/**
 * Returns the active origin if available, otherwise resolves according to domain priority.
 */
export function getPreferredOrigin(currentOrigin?: string | null): string {
  const origin = currentOrigin ? String(currentOrigin).trim() : '';
  if (origin && origin.startsWith('http')) {
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
      return origin.replace(/\/+$/u, '');
    }
    return origin.replace(/^http:\/\//iu, 'https://').replace(/\/+$/u, '');
  }

  if (typeof window !== 'undefined' && window.location?.origin) {
    const locOrigin = window.location.origin;
    if (locOrigin.includes('localhost') || locOrigin.includes('127.0.0.1')) {
      return locOrigin.replace(/\/+$/u, '');
    }
    return locOrigin.replace(/^http:\/\//iu, 'https://').replace(/\/+$/u, '');
  }

  return DEFAULT_FALLBACK_DOMAIN;
}

/**
 * Normalizes any media URL (covers, audio, pdfs, images).
 * If the URL points to media.quangtu.vn or custom domain, it safely rewrites to /api/media/...
 * preserving any query params and hash (like #pos=...).
 * If relative path like covers/..., pdfs/..., converts to /api/media/...
 */
export function resolveMediaUrl(raw: unknown): string {
  const s = String(raw ?? '').trim();
  if (!s) return '';

  const hashIndex = s.indexOf('#');
  const basePart = hashIndex >= 0 ? s.slice(0, hashIndex) : s;
  const hashPart = hashIndex >= 0 ? s.slice(hashIndex) : '';

  // Rewrite legacy media.quangtu.vn
  if (/^https?:\/\/media\.quangtu\.vn\//iu.test(basePart)) {
    const key = basePart.replace(/^https?:\/\/media\.quangtu\.vn\//iu, '');
    return `/api/media/${key.replace(/^\/+/u, '')}${hashPart}`;
  }

  // Rewrite custom domain /api/media/
  if (/^https?:\/\/(?:[a-zA-Z0-9-]+\.)?quangtu\.vn\/api\/media\//iu.test(basePart)) {
    const key = basePart.replace(/^https?:\/\/(?:[a-zA-Z0-9-]+\.)?quangtu\.vn\/api\/media\//iu, '');
    return `/api/media/${key.replace(/^\/+/u, '')}${hashPart}`;
  }

  // Rewrite worker or vercel direct domain /api/media/ to relative
  if (/^https?:\/\/[^/]+\/api\/media\//iu.test(basePart)) {
    const key = basePart.replace(/^https?:\/\/[^/]+\/api\/media\//iu, '');
    return `/api/media/${key.replace(/^\/+/u, '')}${hashPart}`;
  }

  // Rewrite raw asset keys like covers/..., pdfs/..., content/...
  if (/^(?:covers|content|pdfs|videos|posters)\//u.test(basePart)) {
    return `/api/media/${basePart}${hashPart}`;
  }

  if (/^\/(?:covers|content|pdfs|videos|posters)\//u.test(basePart)) {
    return `/api/media${basePart}${hashPart}`;
  }

  return s;
}
