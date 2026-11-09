import { fetchWithSessionRefresh, hasUsableBrowserCsrf } from '$lib/browser/session-csrf';
import { fetchNativeJsonMutation } from '$lib/browser/native-api';
import { getBrowserSessionSnapshot, SESSION_CHANGE_EVENT } from '$lib/stores/session.svelte';

export const PENDING_ARTICLE_VIEWS_KEY = 'tutam_pending_article_views_v1';

export interface PendingArticleView {
  id: string;
  articleId: string;
  timestamp: number;
}

let isFlushing = false;
let removeListeners: (() => void) | null = null;

function getStorage(): Storage | null {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {}
  return null;
}

export function readPendingViews(): PendingArticleView[] {
  const storage = getStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(PENDING_ARTICLE_VIEWS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writePendingViews(views: PendingArticleView[]): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    if (views.length === 0) {
      storage.removeItem(PENDING_ARTICLE_VIEWS_KEY);
    } else {
      // Keep up to 500 recent pending views
      storage.setItem(PENDING_ARTICLE_VIEWS_KEY, JSON.stringify(views.slice(-500)));
    }
  } catch {}
}

export function queuePendingView(articleId: string): void {
  const safeId = String(articleId || '').trim();
  if (!safeId) return;
  const current = readPendingViews();
  current.push({
    id: `${safeId}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    articleId: safeId,
    timestamp: Date.now()
  });
  writePendingViews(current);
}

async function sendViewRequest(articleId: string): Promise<number | null | undefined> {
  const session = getBrowserSessionSnapshot();
  // Hồ sơ khôi phục chỉ phục vụ UI; đợi phiên sống thay vì hạ lượt xem thành khách.
  if (session.authenticated && !hasUsableBrowserCsrf(session.csrfToken)) return undefined;
  const csrfToken = session.authenticated ? session.csrfToken! : 'public';
  const path = `/api/articles/${encodeURIComponent(articleId)}/views`;
  const init: RequestInit = {
    method: 'POST',
    headers: { 'x-csrf-token': csrfToken }
  };
  // Dùng cùng native transport với các mutation khác để giữ Origin/cookie.
  let response: Response | null;
  try {
    response = await fetchNativeJsonMutation(path, init) ?? await fetchWithSessionRefresh(path, init);
  } catch {
    return null;
  }

  if (!response || !response.ok) return null;
  const payload = await response.json().catch(() => ({}));
  const count = Number(payload?.so_luot);
  return Number.isFinite(count) ? count : null;
}

/**
 * Gửi toàn bộ các lượt xem đã ghi nhận offline về máy chủ khi có kết nối mạng.
 */
export async function flushPendingArticleViews(): Promise<number> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return 0;
  if (isFlushing) return 0;
  isFlushing = true;

  let successCount = 0;
  try {
    const queue = readPendingViews();
    if (queue.length === 0) return 0;

    const acknowledged = new Set<string>();
    let failedId: string | null = null;
    for (const item of queue) {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        break;
      }
      const count = await sendViewRequest(item.articleId);
      if (count === undefined) break;
      // Dừng đợt gửi khi lỗi; giữ lượt chưa được xác nhận thay vì dồn cả hàng đợi vào mạng lỗi.
      if (count === null) {
        failedId = item.id;
        break;
      }
      acknowledged.add(item.id);
      successCount++;
    }
    // Đọc lại hàng đợi để không xóa lượt xem mới được thêm trong lúc chờ mạng.
    if (acknowledged.size || failedId !== null) {
      const remaining = readPendingViews().filter(item => !acknowledged.has(item.id));
      // Chuyển lượt lỗi xuống cuối để bài đã xóa không chặn các lượt hợp lệ ở đợt sau.
      writePendingViews(failedId === null ? remaining : [
        ...remaining.filter(item => item.id !== failedId),
        ...remaining.filter(item => item.id === failedId),
      ]);
    }
  } finally {
    isFlushing = false;
  }
  return successCount;
}

/**
 * Âm thầm ghi nhận lượt xem bài viết / sách:
 * - Nếu đang online: gửi ngay lên máy chủ và đồng bộ các lượt xem tồn đọng.
 * - Nếu đang offline (hoặc mạng lỗi): lưu vào hàng đợi outbox để tự động gửi khi có mạng.
 */
export async function recordArticleView(articleId: string): Promise<number | null> {
  const safeId = String(articleId || '').trim();
  if (!safeId) return null;

  try {
    if (typeof sessionStorage !== 'undefined') {
      const key = `quangtu_viewed_${safeId}`;
      if (sessionStorage.getItem(key)) return null;
      sessionStorage.setItem(key, '1');
    }
  } catch {
    // Bộ nhớ phiên bị chặn không được ngăn ghi nhận hoặc xếp hàng lượt xem.
  }

  installOnlineListener();

  const isOnline = typeof navigator === 'undefined' || navigator.onLine !== false;
  if (isOnline) {
    const count = await sendViewRequest(safeId);
    if (count !== null && count !== undefined) {
      // Khi đã gửi thành công, tranh thủ gửi luôn các lượt xem tích lũy offline trước đó
      void flushPendingArticleViews().catch(() => {});
      return count;
    }
  }

  // Mất mạng hoặc gửi thất bại: âm thầm lưu vào hàng đợi offline
  queuePendingView(safeId);
  return null;
}

export function installOnlineListener(): (() => void) | undefined {
  if (removeListeners) return removeListeners;
  if (typeof window === 'undefined') return;
  const host = window;
  const flush = () => {
    void flushPendingArticleViews().catch(() => {});
  };
  host.addEventListener('online', flush);
  host.addEventListener(SESSION_CHANGE_EVENT, flush);
  let installed = true;
  removeListeners = () => {
    if (!installed) return;
    installed = false;
    host.removeEventListener('online', flush);
    host.removeEventListener(SESSION_CHANGE_EVENT, flush);
    removeListeners = null;
  };
  return removeListeners;
}
