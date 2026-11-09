/**
 * Client hooks — chạy trước khi app SvelteKit khởi tạo.
 *
 * Bản native (Capacitor, adapter-static) không có server `/api/*`: mọi fetch
 * tương đối `/api/...` trong WebView trả về `index.html` -> JSON lỗi / sách
 * không mở / Pháp thoại rỗng. Thay vì sửa từng chỗ gọi (hàng chục file),
 * bọc `window.fetch` một lần để tự rewrite `/api/*` sang backend remote.
 * Web giữ nguyên vì `resolveApiUrl()` chỉ rewrite khi chạy native.
 */
import type { HandleClientError } from '@sveltejs/kit';
import { isHtmlResponse, resolveApiUrl } from '$lib/browser/native-api';
import { readOfflineApiResponse, storeApiResponse } from '$lib/browser/native-api-cache';
import { availableContentResponse, blockedContentRequest } from '$lib/browser/ios-content-policy';

function installNativeApiFetch(): void {
  if (typeof window === 'undefined') return;
  const marker = '__tutamNativeApiFetch';
  const win = window as unknown as Record<string, unknown>;
  if (win[marker]) return;
  // Chỉ bật trong bản build Capacitor (dev web trên localhost không bị ảnh hưởng).
  const isCapacitorBuild = import.meta.env.VITE_CAPACITOR_BUILD === '1'
    || (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.() === true;
  if (!isCapacitorBuild) return;
  // Chỉ cần rewrite khi resolveApiUrl thực sự đổi URL (native runtime).
  if (resolveApiUrl('/api/health') === '/api/health') return;

  const originalFetch = window.fetch.bind(window);
  const sameOrigin = window.location.origin;
  const remoteOrigin = new URL(resolveApiUrl('/api/health')).origin;

  const rewrite = (url: string): string => {
    if (url.startsWith('/api/') || url === '/api') return resolveApiUrl(url);
    if (url.startsWith(`${sameOrigin}/api/`)) return resolveApiUrl(url.slice(sameOrigin.length));
    return url;
  };

  /** URL API backend (sau rewrite) hoặc null nếu không phải API. */
  const apiUrlOf = (target: string): URL | null => {
    try {
      const url = new URL(target, sameOrigin);
      if (!url.pathname.startsWith('/api/')) return null;
      if (url.origin !== remoteOrigin && !/(^|\.)quangtu\.vn$/iu.test(url.hostname)) return null;
      return url;
    } catch {
      return null;
    }
  };

  const withOfflineFallback = async (
    apiUrl: URL,
    run: () => Promise<Response>,
  ): Promise<Response> => {
    const offlineNow = typeof navigator !== 'undefined' && navigator.onLine === false;
    if (!offlineNow) {
      try {
        const response = await run();
        if (response.ok && !isHtmlResponse(response)) {
          void storeApiResponse(apiUrl, response);
          return response;
        }
        // Lỗi server (5xx) hoặc trả HTML: thử bản đã lưu, không có thì trả response gốc.
        if (response.status >= 500 || isHtmlResponse(response)) {
          const fallback = await readOfflineApiResponse(apiUrl).catch(() => null);
          if (fallback) return fallback;
        }
        return response;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') throw error;
        const fallback = await readOfflineApiResponse(apiUrl).catch(() => null);
        if (fallback) return fallback;
        throw error;
      }
    }
    const fallback = await readOfflineApiResponse(apiUrl).catch(() => null);
    if (fallback) return fallback;
    return run();
  };

  window.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    try {
      const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const target = rewrite(rawUrl);
      const method = String(init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
      if (method === 'GET' && blockedContentRequest(new URL(target, sameOrigin))) {
        return Promise.resolve(Response.json(null, { status: 404 }));
      }
      const run = (): Promise<Response> => {
        if (target === rawUrl) return originalFetch(input, init);
        if (input instanceof Request) return originalFetch(new Request(target, input), init);
        return originalFetch(target, init);
      };
      const apiUrl = apiUrlOf(target);
      if (apiUrl && method === 'GET') {
        const response = withOfflineFallback(apiUrl, run);
        return /^\/api\/(?:articles|talks|content-updates|data\/(?:baiviet|tap_noi_dung|phap_thoai))(?:\/|$)/u.test(apiUrl.pathname)
          ? response.then(availableContentResponse) : response;
      }
      return run();
    } catch {
      return originalFetch(input, init);
    }
  };
  win[marker] = true;
}

installNativeApiFetch();

export const handleError: HandleClientError = ({ error }) => {
  console.error('[client-error]', error);
  return { message: 'Đã xảy ra lỗi. Vui lòng thử lại.' };
};
