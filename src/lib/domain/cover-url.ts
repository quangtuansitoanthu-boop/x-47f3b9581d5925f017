/**
 * Chuẩn hoá URL ảnh bìa (covers) cho cả web và app native (Capacitor).
 *
 * Vấn đề: offline-bundled-articles.json chứa nhiều `anh_url` tương đối
 * dạng `covers/xxx.webp` (không có `/` đầu). Khi render:
 *  - Web tại route `/tu-tap` sẽ resolve thành `/tu-tap/covers/...` -> 404.
 *  - Native chỉ đóng gói ~5 file trong `/covers`, còn lại 40+ file thiếu -> 404,
 *    card Tu tập hiện placeholder 📖, card Trang chủ hiện icon vỡ + alt text.
 *
 * Chiến lược: luôn chuẩn hoá về `/covers/...` tuyệt đối để thử local trước,
 * nếu 404 thì `onerror` đổi sang CDN `https://media.quangtu.vn/covers/...`.
 */

import bookCoverOverrides from '$lib/data/book-cover-overrides.json';

const MEDIA_ORIGIN = 'https://media.quangtu.vn';

function splitPositionSuffix(raw: string): { base: string; suffix: string } {
  const marker = raw.lastIndexOf('#pos=');
  if (marker < 0) return { base: raw, suffix: '' };
  return { base: raw.slice(0, marker), suffix: raw.slice(marker) };
}

/** `covers/a.webp` hoặc URL online có ảnh bìa đã đóng gói -> `/covers/a.webp`. */
export function normalizeCoverSrc(raw: unknown): string {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return '';
  const { base, suffix } = splitPositionSuffix(trimmed);
  const clean = base.trim();
  if (!clean) return '';

  // Legacy API media paths refer to the same covers already bundled in the APK.
  if (/^\/?api\/media\/covers\//iu.test(clean)) {
    return normalizeCoverSrc(clean.replace(/^\/?api\/media\//iu, '/') + suffix);
  }

  if (clean.startsWith('data:') || clean.startsWith('blob:')) {
    return trimmed;
  }

  if (/^https?:\/\//iu.test(clean)) {
    try {
      const path = new URL(clean).pathname;
      // Đuôi ảnh không chứng minh file đã có trong bộ bìa đóng gói của app.
      if (!path.includes('/covers/') && !path.endsWith('-blob')) return trimmed;
    } catch {
      return trimmed;
    }
  }

  // Use versioned local artwork even when the live catalog still returns old URLs.
  const legacyFile = clean.split('/').pop()?.split('?')[0] || '';
  const refreshed = (bookCoverOverrides as Record<string, string>)[legacyFile];
  if (refreshed) return refreshed;

  // Nếu là URL tuyệt đối có chứa cover hoặc ảnh đã được đóng gói local trong /covers/
  if (/^https?:\/\//iu.test(clean)) {
    const filename = clean.split('/').pop()?.split('?')[0];
    if (filename && (clean.includes('/covers/') || /\.(webp|jpg|jpeg|png)$/i.test(filename) || filename.endsWith('-blob'))) {
      const localFile = filename.endsWith('-blob') ? `${filename}.webp` : filename;
      return `/covers/${localFile}${suffix}`;
    }
    return trimmed;
  }

  const filename = clean.split('/').pop()?.split('?')[0];
  if (filename && (clean.startsWith('covers/') || clean.startsWith('/covers/'))) {
    const localFile = filename.endsWith('-blob') ? `${filename}.webp` : filename;
    return `/covers/${localFile}${suffix}`;
  }

  const absolute = clean.startsWith('/') ? clean : `/${clean}`;
  return `${absolute}${suffix}`;
}

/**
 * URL dự phòng trên CDN cho ảnh bìa tương đối.
 * `/covers/a.webp#pos=..` -> `https://media.quangtu.vn/covers/a.webp#pos=..`
 * Trả về '' khi không có fallback (URL tuyệt đối khác origin, data:, ...).
 */
export function coverRemoteFallback(src: string | null | undefined): string {
  const raw = String(src ?? '').trim();
  const trimmed = /^\/?api\/media\/covers\//iu.test(raw) ? normalizeCoverSrc(raw) : raw;
  if (!trimmed) return '';
  const { base, suffix } = splitPositionSuffix(trimmed);
  const clean = base.trim();
  if (!clean || /^https?:\/\//iu.test(clean) || clean.startsWith('data:') || clean.startsWith('blob:')) {
    return '';
  }
  let filename = clean.split('/').pop()?.split('?')[0] || '';
  if (filename.endsWith('.webp') && filename.includes('-blob.')) {
    filename = filename.replace(/\.webp$/, '');
  }
  if (filename && (clean.startsWith('/covers/') || clean.startsWith('covers/'))) {
    return `${MEDIA_ORIGIN}/covers/${filename}${suffix}`;
  }
  const path = clean.startsWith('/') ? clean : `/${clean}`;
  return `${MEDIA_ORIGIN}${path}${suffix}`;
}

/**
 * Xử lý `onerror` 2 giai đoạn cho <img>: thử CDN một lần, thất bại thì gọi
 * `onGaveUp` để component hiện placeholder thân thiện thay vì icon vỡ.
 */
export function handleCoverImgError(
  image: HTMLImageElement,
  onGaveUp?: () => void,
): void {
  try {
    if (image.dataset.coverFallbackAttempted !== '1') {
      const fallback = coverRemoteFallback(image.getAttribute('src') || image.src);
      if (fallback && image.src !== fallback) {
        image.dataset.coverFallbackAttempted = '1';
        image.src = fallback;
        return;
      }
    }
  } catch {
    // Bỏ qua, rơi xuống ẩn ảnh bên dưới.
  }
  onGaveUp?.();
}
