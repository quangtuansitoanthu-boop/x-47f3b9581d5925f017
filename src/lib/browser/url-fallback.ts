/**
 * URL Fallback - Đường dẫn dự phòng khi tên miền chính không hoạt động.
 *
 * Giữ backend đã lưu nếu còn hoạt động; khi cần, thử Workers rồi quangtu.vn.
 * Vercel chỉ chuyển hướng HTTP 308, không còn là backend API dự phòng.
 *
 * Logic:
 *   - Mỗi lần app khởi động, nếu đang chạy trong Capacitor (native),
 *     thử fetch /api/health của từng URL theo thứ tự.
 *   - URL đầu tiên phản hồi thành công được lưu vào localStorage.
 *   - Khi app đang chạy từ bundle nội bộ của Capacitor, tuyệt đối không
 *     chuyển hướng sang web remote; UI phải khởi động được khi không có mạng.
 */

import { browser } from '$app/environment';
import { getBrowserSessionSnapshot } from '$lib/stores/session.svelte';
import { isNativeAuthMutationActive, nativeAuthMutationRevision } from './native-auth-transaction';
import { NATIVE_BACKEND_STORAGE_KEY, NATIVE_BACKEND_ORIGINS, normalizeNativeBackendOrigin } from './native-backend-origin';

const STORAGE_KEY = NATIVE_BACKEND_STORAGE_KEY;
const HEALTH_PATH = '/api/health';
const PROBE_TIMEOUT_MS = 4000;

/** Danh sách URL theo thứ tự ưu tiên */
const FALLBACK_URLS: readonly string[] = NATIVE_BACKEND_ORIGINS;

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
}

function isNativeApp(): boolean {
  try {
    const cap = (globalThis as { Capacitor?: CapacitorGlobal }).Capacitor;
    return cap?.isNativePlatform?.() === true;
  } catch {
    return false;
  }
}

/** A working page/redirect is not proof that this host serves the app API. */
async function probe(baseUrl: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(`${baseUrl}${HEALTH_PATH}`, {
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!res.ok || res.redirected || !(res.headers.get('content-type') || '').toLowerCase().includes('application/json')) return false;
    const health = await res.json();
    return health?.ok === true && health?.service === 'quangtu-worker' && health?.database === 'sealed';
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Lưu URL tốt nhất tìm được. */
function saveActiveUrl(url: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, url);
    localStorage.setItem('quangtu_origin_verified_at', String(Date.now()));
  } catch {
    // Private mode hoặc storage đầy – bỏ qua.
  }
}

/** Lấy URL đang được lưu. */
export function getSavedActiveUrl(): string {
  try {
    return normalizeNativeBackendOrigin(localStorage.getItem(STORAGE_KEY));
  } catch {
    return FALLBACK_URLS[0];
  }
}

function captureProbeOwner(origin: string): () => boolean {
  const authRevision = nativeAuthMutationRevision();
  const session = getBrowserSessionSnapshot();
  const authenticated = session.authenticated;
  const principal = session.user?.id;
  const csrfToken = session.csrfToken;
  return () => {
    const current = getBrowserSessionSnapshot();
    return !isNativeAuthMutationActive() && nativeAuthMutationRevision() === authRevision
      && getSavedActiveUrl() === origin && current.authenticated === authenticated
      && current.user?.id === principal && current.csrfToken === csrfToken;
  };
}

/** URL gốc của trang hiện tại (chỉ scheme + host). */
function currentOrigin(): string {
  return `${location.protocol}//${location.host}`;
}

function isCapacitorLocalOrigin(): boolean {
  const origin = currentOrigin();
  return origin === 'capacitor://localhost'
    || origin === 'ionic://localhost'
    || origin === 'https://localhost'
    || origin === 'http://localhost';
}

/**
 * Khởi động kiểm tra URL dự phòng.
 * Chỉ chạy trong môi trường native (Capacitor) khi có mạng.
 * Hoàn toàn non-blocking – không làm chậm khởi động app.
 * Với app Android/iOS đóng gói offline-first, chỉ lưu URL tốt nhất cho
 * các tác vụ mạng sau này; không dùng URL đó để thay thế bundle local.
 */
export async function initUrlFallback(): Promise<void> {
  if (!browser || !isNativeApp()) return;
  // Không chạy khi đang offline.
  if (!navigator.onLine) return;
  // Nếu đã có URL hoạt động được lưu, không probe ngầm liên tục mỗi lần mở app
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    const verifiedAt = Number(localStorage.getItem('quangtu_origin_verified_at') || 0);
    if (saved && saved === normalizeNativeBackendOrigin(saved) && Date.now() - verifiedAt < 300_000) return;
  } catch {}

  // Session cookies belong to one host. Keep a healthy saved host on restart
  // instead of silently moving an authenticated user to another cookie jar.
  const saved = getSavedActiveUrl();
  const ownsSelection = captureProbeOwner(saved);
  // Cookie HttpOnly thuộc từng host; lỗi mạng không được đổi chủ phiên đăng nhập.
  const candidates = getBrowserSessionSnapshot().authenticated
    ? [saved]
    : FALLBACK_URLS.includes(saved)
      ? [saved, ...FALLBACK_URLS.filter(url => url !== saved)] : FALLBACK_URLS;
  for (const url of candidates) {
    if (!ownsSelection()) return;
    const ok = await probe(url);
    // Probe trả muộn không được đổi cookie jar của phiên hoặc lựa chọn backend mới.
    if (!ownsSelection()) return;
    if (ok) {
      saveActiveUrl(url);
      // Trên app native, chỉ lưu URL cho các API request, tuyệt đối không chuyển hướng sang remote web
      return;
    }
  }

  // Tất cả đều không phản hồi: giữ nguyên, dựa vào Service Worker cache.
}

let originProbe: Promise<void> | null = null;
let lastForcedProbe = 0;
export function refreshRemoteOrigin(): Promise<void> {
  if (originProbe) return originProbe;
  if (Date.now() - lastForcedProbe < 30_000) return Promise.resolve();
  lastForcedProbe = Date.now();
  originProbe = (async () => {
    const current = getSavedActiveUrl();
    const ownsSelection = captureProbeOwner(current);
    const candidates = getBrowserSessionSnapshot().authenticated
      ? [current] : [...FALLBACK_URLS.filter(url => url !== current), current];
    for (const origin of candidates) {
      if (!ownsSelection()) return;
      const ok = await probe(origin);
      if (!ownsSelection()) return;
      if (ok) { saveActiveUrl(origin); return; }
    }
  })().finally(() => { originProbe = null; });
  return originProbe;
}
