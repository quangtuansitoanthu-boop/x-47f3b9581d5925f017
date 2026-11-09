import { fetchWithDeadline } from './network-deadline';
import { blocksNativeAdminWrite } from './admin-access';
import { isNativeApp } from './native-platform';
import { NATIVE_ADMIN_READ_ONLY_MESSAGE } from '$lib/i18n/admin-access';
import { SESSION_VERIFICATION_UNAVAILABLE } from '$lib/i18n/native-auth';
import { detectDeviceLocale } from '$lib/stores/locale.svelte';
import { refreshRemoteOrigin } from './url-fallback';
import type { PageSessionDTO } from '$lib/server/auth/types';
import {
  getBrowserSessionSnapshot,
  isSessionExpired,
  refreshBrowserSession,
} from '$lib/stores/session.svelte';
import { fetchNativeJsonMutation, isHtmlResponse, resolveApiUrl } from './native-api';
import { resolveOfflineBundledResponse } from './offline-bundled-resolver';

export async function getBrowserSession(options: { force?: boolean } = {}): Promise<PageSessionDTO> {
  const current = getBrowserSessionSnapshot();
  if (!options.force && !isSessionExpired(current)) return current;
  return refreshBrowserSession();
}

export function hasUsableBrowserCsrf(token: unknown): token is string {
  return typeof token === 'string' && token.length > 0 && token !== 'mobile-session-token';
}

export async function requireBrowserCsrf(): Promise<string> {
  const initialSnapshot = getBrowserSessionSnapshot();
  let session = await getBrowserSession();
  // A root refresh may finish while the initial snapshot is awaiting its microtask.
  const latestSnapshot = getBrowserSessionSnapshot();
  if (latestSnapshot !== initialSnapshot) session = latestSnapshot;
  if (session.authenticated && !hasUsableBrowserCsrf(session.csrfToken)) {
    session = await getBrowserSession({ force: true });
  }
  if (!session.authenticated) throw new Error('Phiên đăng nhập không còn hiệu lực. Vui lòng đăng nhập lại.');
  if (!hasUsableBrowserCsrf(session.csrfToken)) throw new Error(SESSION_VERIFICATION_UNAVAILABLE[detectDeviceLocale()]);
  return session.csrfToken;
}

// In-flight browser requests only: no stale response cache, no Worker-global
// promises, and no shared cancellation or writes. Session identity isolates users.
const pendingReads = new Map<string, { session: PageSessionDTO; promise: Promise<Response> }>();
export function fetchWithSessionRefresh(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const shareable = typeof window !== 'undefined' && typeof input === 'string'
    && input.startsWith('/api/') && (init?.method ?? 'GET').toUpperCase() === 'GET'
    && !init?.signal && init?.body == null;
  if (!shareable) return performSessionRequest(input, init);
  const session = getBrowserSessionSnapshot();
  const key = JSON.stringify([input, { ...init, headers: [...new Headers(init?.headers).entries()].sort() }]);
  const existing = pendingReads.get(key);
  if (existing?.session === session) return existing.promise.then(response => response.clone());
  if (pendingReads.size >= 128) return performSessionRequest(input, init);
  const promise = performSessionRequest(input, init);
  pendingReads.set(key, { session, promise });
  const forget = () => {
    if (pendingReads.get(key)?.promise === promise) pendingReads.delete(key);
  };
  void promise.then(response => {
    forget();
    // All consumers clone in the already queued promise callbacks. Release the
    // unused source branch afterwards so large catalogs are not buffered there.
    queueMicrotask(() => { void response.body?.cancel().catch(() => undefined); });
  }, forget);
  return promise.then(response => response.clone());
}

async function performSessionRequest(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const request = typeof Request !== 'undefined' && input instanceof Request ? input : null;
  const method = (init?.method ?? request?.method ?? 'GET').toUpperCase();
  const canUseOffline = method === 'GET';
  const signal = init?.signal ?? request?.signal;
  const checkAbort = () => {
    if (signal?.aborted) throw signal.reason ?? new DOMException('Request cancelled', 'AbortError');
  };
  const offlineRead = async () => {
    checkAbort();
    if (!canUseOffline) return null;
    const response = await resolveOfflineBundledResponse(input).catch(() => null);
    checkAbort();
    return response;
  };
  checkAbort();
  if (isNativeApp() && await blocksNativeAdminWrite(input, init, getBrowserSessionSnapshot()?.user?.role)) {
    return new Response(JSON.stringify({ error: { code: 'native_admin_read_only', message: NATIVE_ADMIN_READ_ONLY_MESSAGE } }), { status: 403, headers: { 'content-type': 'application/json' } });
  }
  // Khi ngoại tuyến (không có mạng), ưu tiên resolver dữ liệu đóng gói offline ngay lập tức:
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    const directOffline = await offlineRead();
    if (directOffline) return directOffline;
  }

  const requestInput = typeof input === 'string' ? resolveApiUrl(input) : input;

  try {
    checkAbort();
    let native: Response | null = null;
    // Chỉ đổi transport JSON/no-body; FormData và Request giữ owner hiện có.
    if (isNativeApp() && typeof input === 'string' && input.startsWith('/api/')
      && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      const contentType = new Headers(init?.headers).get('content-type')?.split(';')[0].trim().toLowerCase();
      if (init?.body == null || (typeof init.body === 'string' && contentType === 'application/json')) {
        native = await fetchNativeJsonMutation(input, init ?? {});
      }
    }
    checkAbort();
    const response = native ?? await fetchWithDeadline(requestInput, init);
    checkAbort();
    if (response.status === 401) {
      await refreshBrowserSession().catch(() => undefined);
      checkAbort();
    }
    if ((response.status >= 500 || response.status === 404 || isHtmlResponse(response)) && response.status !== 401 && response.status !== 403) {
      const offlineFallback = await offlineRead();
      if (offlineFallback) return offlineFallback;
    }
    return response;
  } catch (error) {
    checkAbort();
    if (error instanceof Error && error.name === 'AbortError') throw error;
    const offlineResponse = await offlineRead();
    if (offlineResponse) return offlineResponse;
    if (method === 'GET' && typeof input === 'string' && input.startsWith('/api/') && requestInput !== input) {
      await refreshRemoteOrigin().catch(() => undefined);
      checkAbort();
      const next = resolveApiUrl(input);
      if (next !== requestInput) return fetchWithDeadline(next, init);
    }
    throw error;
  }
}
