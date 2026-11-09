/**
 * API base cho app native (Capacitor).
 *
 * Vấn đề (ảnh 3 — Pháp Thoại báo `Unexpected token '<', "<!doctype"... is not
 * valid JSON` kể cả khi có mạng):
 *  - Bản native build tĩnh (`adapter-static` + `fallback: index.html`).
 *  - Mọi fetch tương đối `/api/*` trong WebView `capacitor://localhost` đều
 *    trỏ về bundle local, không có server -> nhận về `index.html`.
 *  - `response.json()` nổ với content-type `text/html`.
 *
 * Module cũ `url-fallback.ts` đã probe `/api/health` và lưu URL tốt nhất vào
 * localStorage (`quangtu_active_url`) nhưng KHÔNG có nơi nào dùng nó —
 * toàn bộ fetch client vẫn gọi `/api/*` tương đối. Fix: mọi fetch client đi
 * qua `resolveApiUrl()` để native trỏ về remote backend.
 */

import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { NATIVE_BACKEND_STORAGE_KEY, NATIVE_BACKEND_ORIGINS, normalizeNativeBackendOrigin } from './native-backend-origin';

function savedRemoteOrigin(): string {
  try {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(NATIVE_BACKEND_STORAGE_KEY) : null;
    return normalizeNativeBackendOrigin(saved);
  } catch {
    // Bỏ qua khi storage không truy cập được.
  }
  return NATIVE_BACKEND_ORIGINS[0];
}

function isNativeLikeOrigin(origin: string): boolean {
  if (
    origin === 'capacitor://localhost'
    || origin === 'ionic://localhost'
    || origin === 'https://localhost'
    || origin === 'http://localhost'
  ) {
    return true;
  }
  return false;
}

function isCapacitorRuntime(): boolean {
  try {
    const cap = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    if (typeof cap?.isNativePlatform === 'function') return cap.isNativePlatform() === true;
  } catch {
    // Bỏ qua.
  }
  try {
    if (typeof window !== 'undefined' && isNativeLikeOrigin(window.location.origin)) return true;
  } catch {
    // Bỏ qua.
  }
  return false;
}

/**
 * Resolve URL gọi API: giữ nguyên trên web, prefix remote origin khi native.
 * Chỉ rewrite các path `/api/*` tương đối; URL tuyệt đối giữ nguyên.
 */
export function resolveApiUrl(path: string): string {
  const trimmed = String(path ?? '');
  if (!trimmed.startsWith('/api/') && trimmed !== '/api') return trimmed;
  if (typeof window === 'undefined') return trimmed;
  if (!isCapacitorRuntime()) return trimmed;
  return `${savedRemoteOrigin()}${trimmed}`;
}

/** Cập nhật public vẫn hoạt động khi tên miền riêng hết hạn; không đổi host phiên đăng nhập. */
export function resolvePublicUpdateUrl(path: string): string {
  const pathname = path.split('?')[0];
  if (pathname !== '/api/content-updates' && !pathname.startsWith('/api/media/')) return resolveApiUrl(path);
  if (typeof window === 'undefined' || !isCapacitorRuntime()) return path;
  return `${NATIVE_BACKEND_ORIGINS[0]}${path}`;
}

export function resolvePublicUrl(path: string): string {
  // Link gửi cho người khác phải mở được trên web, không trỏ về origin WebView/API dự phòng.
  const origin = typeof window === 'undefined' || isCapacitorRuntime() ? 'https://quangtu.vn' : window.location.origin;
  return new URL(path, origin).toString();
}

/** JSON writes bypass patched fetch, whose Request strips Origin. Native HTTP
 * uses the service's public app origin (also for its fallback hosts), cookies
 * and the caller's CSRF proof, matching the deployed server's write contract. */
export async function fetchNativeJsonMutation(input: string, init: RequestInit): Promise<Response | null> {
  if (!Capacitor.isNativePlatform()) return null;
  const method = String(init.method ?? 'GET').toUpperCase();
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return null;
  const url = new URL(resolveApiUrl(input));
  if (url.origin !== savedRemoteOrigin() || !url.pathname.startsWith('/api/')) return null;
  // Chặn thao tác đã hủy trước khi gửi; sau khi bridge gửi phải giữ receipt để tránh ghi lặp.
  if (init.signal?.aborted) throw init.signal.reason ?? new DOMException('Aborted', 'AbortError');
  const headers = new Headers(init.headers);
  headers.set('Origin', 'https://quangtu.vn');
  const response = await CapacitorHttp.request({
    url: url.href,
    method,
    headers: Object.fromEntries(headers.entries()),
    data: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
    responseType: 'json',
    connectTimeout: 12_000,
    readTimeout: 12_000,
  });
  return new Response([204, 205, 304].includes(response.status) ? null
    : typeof response.data === 'string' ? response.data : JSON.stringify(response.data), {
    status: response.status,
    headers: response.headers,
  });
}

/**
 * Resolve URL tài nguyên remote khi chạy trên native app (cho phép fetch asset/chapters từ web server).
 */
export function resolveRemoteUrl(path: string): string {
  const trimmed = String(path ?? '');
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (typeof window === 'undefined') return trimmed;
  if (!isCapacitorRuntime()) return trimmed;
  const origin = savedRemoteOrigin();
  return `${origin}${trimmed.startsWith('/') ? '' : '/'}${trimmed}`;
}

/** True khi response là HTML (SPA fallback) thay vì JSON như kỳ vọng. */
export function isHtmlResponse(response: Response): boolean {
  try {
    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    return contentType.includes('text/html');
  } catch {
    return false;
  }
}

/**
 * Đọc JSON an toàn: nếu server trả HTML (fallback index.html của bản native)
 * thì throw lỗi thân thiện thay vì `Unexpected token '<'...`.
 */
export async function readApiJson<T>(response: Response, fallbackMessage: string): Promise<T> {
  if (isHtmlResponse(response)) {
    throw new Error(fallbackMessage);
  }
  try {
    return (await response.json()) as T;
  } catch {
    throw new Error(fallbackMessage);
  }
}
