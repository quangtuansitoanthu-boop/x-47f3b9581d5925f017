/**
 * Cache API "network-first" cho bản native (Capacitor).
 *
 * - Có mạng: luôn lấy dữ liệu mới nhất từ web (sách/PDF/album mới tự xuất hiện),
 *   đồng thời lưu bản sao vào Cache Storage của app.
 * - Mất mạng: trả bản đã lưu gần nhất; nếu chưa có thì dùng dữ liệu đóng gói sẵn.
 * - Không lưu bốn sách và ba album chỉ dành cho web.
 */
import { isOnlineOnlyAudioAlbum, isOnlineOnlyBook } from '$lib/domain/online-only-policy';
import { isIosExcludedContent } from '$lib/domain/ios-content-policy';
import { isHtmlResponse } from './native-api';
import { resolveOfflineBundledResponse, readUpdatedBundledContentResponse } from './offline-bundled-resolver';

const CACHE_NAME = 'tutam-api-v2-public';
const RESTRICTED_IDS_KEY = 'tutam_online_only_ids';
const CACHE_ORIGIN = 'https://tutam-cache.local';

/** ID đã biết của nội dung chỉ online (bổ sung động khi đọc catalog). */
const SEED_RESTRICTED_IDS = [
  'tt_1781529439696',
  'tt_1781529470187',
  'tt_1781529533555',
  'tt_tro_ve_tu_xu_tuyet',
  'pt_1782208869321',
  'pt_1782208945706',
  'pt_1782208975513',
];

/** Chỉ cache dữ liệu nội dung công khai, không cache dữ liệu cá nhân/phiên. */
const CACHEABLE_PATHS = [
  /^\/api\/articles(?:\/[^/]+(?:\/chapters)?)?$/u,
  /^\/api\/data\/(?:baiviet|tap_noi_dung|luot_xem)$/u,
  /^\/api\/talks(?:\/[^/]+)?$/u,
  /^\/api\/phap-bao$/u,
  /^\/api\/practice\/(?:leaderboard|campaigns)$/u,
];

let restrictedIds: Set<string> | null = null;

function loadRestrictedIds(): Set<string> {
  if (restrictedIds) return restrictedIds;
  restrictedIds = new Set(SEED_RESTRICTED_IDS);
  try {
    const saved = JSON.parse(localStorage.getItem(RESTRICTED_IDS_KEY) || '[]');
    if (Array.isArray(saved)) saved.forEach((id) => restrictedIds!.add(String(id)));
  } catch {
    // Bỏ qua.
  }
  return restrictedIds;
}

function rememberRestrictedId(id: string): void {
  const ids = loadRestrictedIds();
  if (!id || ids.has(id)) return;
  ids.add(id);
  try {
    localStorage.setItem(RESTRICTED_IDS_KEY, JSON.stringify([...ids]));
  } catch {
    // Bỏ qua.
  }
}

function isRestrictedRow(row: unknown): boolean {
  if (!row || typeof row !== 'object') return false;
  const record = row as Record<string, unknown>;
  if (record.visibility != null && record.visibility !== 'public') return true;
  if (record.trang_thai != null && record.trang_thai !== 'Hoàn thành') return true;
  if (isIosExcludedContent(record)) return true;
  const id = String(record.id ?? '');
  const title = String(record.tieu_de ?? '');
  const restricted = id.startsWith('pt_')
    ? isOnlineOnlyAudioAlbum(title)
    : isOnlineOnlyBook(title, String(record.tac_gia ?? '')) || isOnlineOnlyAudioAlbum(title);
  if (restricted && id) rememberRestrictedId(id);
  return restricted || (id !== '' && loadRestrictedIds().has(id));
}

/** True nếu URL trỏ tới nội dung của một sách/album chỉ online. */
function urlTargetsRestricted(url: URL): boolean {
  const ids = loadRestrictedIds();
  const pathMatch = /^\/api\/(?:articles|talks)\/([^/]+)/u.exec(url.pathname);
  if (pathMatch && ids.has(decodeURIComponent(pathMatch[1]))) return true;
  for (const name of ['id', 'bai_viet_id']) {
    const value = url.searchParams.get(name);
    if (value?.startsWith('eq.') && ids.has(decodeURIComponent(value.slice(3)))) return true;
  }
  return false;
}

export function isCacheableApiPath(pathname: string): boolean {
  return CACHEABLE_PATHS.some((pattern) => pattern.test(pathname));
}

function cacheKey(url: URL): string {
  return `${CACHE_ORIGIN}${url.pathname}${url.search}`;
}

async function openCache(): Promise<Cache | null> {
  try {
    if (typeof caches === 'undefined') return null;
    // Old versions did not filter private content. Never reuse that namespace.
    if (typeof caches.delete === 'function') void caches.delete('tutam-api-v1').catch(() => false);
    return await caches.open(CACHE_NAME);
  } catch {
    return null;
  }
}

function jsonResponse(payload: unknown, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders },
  });
}

/** Lưu bản sao đã lọc nội dung bản quyền. Không chặn luồng chính. */
export async function storeApiResponse(url: URL, response: Response): Promise<void> {
  if (!isCacheableApiPath(url.pathname) || urlTargetsRestricted(url)) return;
  if (!response.ok || isHtmlResponse(response)) return;
  if (/(?:^|,)\s*(?:no-store|private)(?:\s|,|=|$)/i.test(response.headers.get('cache-control') || '')) return;
  let payload: unknown;
  try {
    payload = await response.clone().json();
  } catch {
    return;
  }

  if (Array.isArray(payload)) {
    const filtered = payload.filter((row) => !isRestrictedRow(row));
    // Danh sách chi tiết chỉ gồm nội dung bản quyền -> không lưu.
    if (payload.length > 0 && filtered.length === 0) return;
    payload = filtered;
  } else if (isRestrictedRow(payload)) {
    return;
  }

  const cache = await openCache();
  if (!cache) return;
  try {
    await cache.put(cacheKey(url), jsonResponse(payload, { 'x-tutam-cached-at': new Date().toISOString() }));
  } catch {
    // Hết quota: bỏ qua, lần sau thử lại.
  }
}

/** Lấy bản đã lưu (nếu có), sau đó tới dữ liệu đóng gói sẵn trong app. */
export async function readOfflineApiResponse(url: URL): Promise<Response | null> {
  if (urlTargetsRestricted(url)) {
    return new Response(JSON.stringify({
      error: { code: 'online_only', message: 'Nội dung này chỉ xem/nghe trực tuyến. Vui lòng kết nối mạng.' },
    }), { status: 503, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
  }
  const manuallySaved = await readUpdatedBundledContentResponse(url);
  if (manuallySaved) return manuallySaved;
  if (isCacheableApiPath(url.pathname)) {
    const cache = await openCache();
    try {
      const cached = await cache?.match(cacheKey(url));
      if (cached) return cached;
    } catch {
      // Rơi xuống bundle.
    }
  }
  return resolveOfflineBundledResponse(`${url.pathname}${url.search}`);
}
