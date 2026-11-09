/**
 * Social Preview & OpenGraph metadata helpers for Zalo, Messenger, Facebook, Twitter
 */

export const DEFAULT_SITE_NAME = 'Tu tập cùng Quang Từ';
export const DEFAULT_SITE_TITLE = 'Tu tập cùng Quang Từ — Nhân Quả · Luân Hồi · Hành Thiện';
export const DEFAULT_SITE_DESCRIPTION = 'Kho bài viết Phật pháp và Pháp thoại về nhân quả, luân hồi, hành thiện, kinh Phật và nghi thức tu tập.';
export const DEFAULT_TALK_TITLE = 'Kho Pháp Thoại — Tu tập cùng Quang Từ';
export const DEFAULT_TALK_DESCRIPTION = 'Lắng nghe những bài giảng Phật pháp sâu sắc về nhân quả, vô thường, sám hối và thiền định.';
export const DEFAULT_FALLBACK_IMAGE = '/assets/branding/tu-tap-logo.png';

export function ensureAbsoluteUrl(rawUrl: string | null | undefined, origin: string): string {
  let fallbackOrigin = origin && origin.startsWith('http') ? origin.trim() : 'https://quangtu.vn';
  if (!fallbackOrigin.includes('localhost') && !fallbackOrigin.includes('127.0.0.1')) {
    fallbackOrigin = fallbackOrigin.replace(/^http:\/\//iu, 'https://');
  }
  const cleanOrigin = fallbackOrigin.replace(/\/+$/u, '');

  if (!rawUrl || typeof rawUrl !== 'string' || !rawUrl.trim()) {
    return `${cleanOrigin}${DEFAULT_FALLBACK_IMAGE}`;
  }

  const trimmed = rawUrl.trim();
  if (/^https?:\/\//iu.test(trimmed)) {
    if (!trimmed.includes('localhost') && !trimmed.includes('127.0.0.1')) {
      return trimmed.replace(/^http:\/\//iu, 'https://');
    }
    return trimmed;
  }

  if (trimmed.startsWith('//')) {
    return `https:${trimmed}`;
  }

  const cleanPath = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return `${cleanOrigin}${cleanPath}`;
}

export function getImageMimeType(url: string | null | undefined): string {
  if (!url || typeof url !== 'string') return 'image/png';
  const clean = url.split(/[?#]/u)[0].toLowerCase();
  if (clean.endsWith('.jpg') || clean.endsWith('.jpeg')) return 'image/jpeg';
  if (clean.endsWith('.png')) return 'image/png';
  if (clean.endsWith('.webp')) return 'image/webp';
  if (clean.endsWith('.gif')) return 'image/gif';
  if (clean.endsWith('.svg')) return 'image/svg+xml';
  return 'image/jpeg';
}

function decodeNumericEntity(entity: string, codePoint: number): string {
  if (!Number.isInteger(codePoint) || codePoint <= 0 || codePoint > 0x10ffff
    || (codePoint >= 0xd800 && codePoint <= 0xdfff)) return entity;
  return String.fromCodePoint(codePoint);
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (entity, dec) => decodeNumericEntity(entity, Number(dec)))
    .replace(/&#x([0-9a-f]+);/gi, (entity, hex) => decodeNumericEntity(entity, parseInt(hex, 16)));
}

export function cleanMetaDescription(text: string | null | undefined, fallback: string, maxLength = 260): string {
  if (!text || typeof text !== 'string') return fallback;
  const decoded = decodeHtmlEntities(text);
  // Strip script and style blocks first
  const noScript = decoded
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ');
  // Replace block element endings and line breaks with space, inline tags with empty
  const stripped = noScript
    .replace(/<\/(p|div|h[1-6]|li|blockquote|section|article|tr|td|th)>/gi, ' ')
    .replace(/<(p|div|h[1-6]|li|blockquote|section|article|tr|td|th)(?:\s[^>]*)?>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/gu, '')
    .replace(/\s+([.,!?;:])/gu, '$1')
    .replace(/\s+/gu, ' ')
    .trim();
  if (!stripped) return fallback;
  if (stripped.length <= maxLength) return stripped;
  // Không giữ nửa đầu của ký tự Unicode khi giới hạn rơi giữa surrogate pair.
  return `${stripped.slice(0, maxLength - 3).replace(/[\uD800-\uDBFF]$/u, '').trim()}...`;
}
