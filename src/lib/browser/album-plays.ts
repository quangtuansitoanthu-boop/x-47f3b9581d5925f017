import { fetchWithSessionRefresh, getBrowserSession, hasUsableBrowserCsrf } from './session-csrf';
import { fetchNativeJsonMutation, isHtmlResponse } from './native-api';
import { createBrowserId } from './random-id';
import { getBrowserSessionSnapshot, SESSION_CHANGE_EVENT } from '$lib/stores/session.svelte';

export interface AlbumPlayCount { albumId: string; playCount: number; }
export const ALBUM_PLAYS_CHANGED = 'quangtu:album-plays-changed';

const ALBUM_PLAYS_CACHE_KEY = 'quangtu_album_plays_cache';
const ALBUM_PLAYS_SYNC_TIME_KEY = 'quangtu_album_plays_last_sync_time';
const ALBUM_PLAYS_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;
const acknowledgedCounts = new Map<string, number>();

function isAlbumPlayCounts(value: unknown): value is AlbumPlayCount[] {
  return Array.isArray(value) && value.every(row => row && typeof row === 'object'
    && typeof row.albumId === 'string' && row.albumId.length > 0
    && Number.isSafeInteger(row.playCount) && row.playCount >= 0);
}

function mergeAcknowledgedCounts(rows: AlbumPlayCount[]): AlbumPlayCount[] {
  let merged = rows;
  for (const [albumId, playCount] of acknowledgedCounts) {
    merged = applyAlbumPlayResult(merged, { albumId, playCount }) ?? merged;
  }
  return merged;
}

function rememberAcknowledgedCount(result: unknown): void {
  if (!result || typeof result !== 'object') return;
  const { albumId, playCount } = result as Partial<AlbumPlayCount>;
  if (typeof albumId !== 'string' || !Number.isFinite(playCount) || (playCount ?? -1) < 0) return;
  acknowledgedCounts.set(albumId, Math.max(acknowledgedCounts.get(albumId) ?? 0, playCount!));
  try {
    const cached = localStorage.getItem(ALBUM_PLAYS_CACHE_KEY);
    const rows: unknown = cached ? JSON.parse(cached) : null;
    // Không đánh dấu catalog từng phần là bản tổng vừa tải từ server.
    if (isAlbumPlayCounts(rows)) localStorage.setItem(ALBUM_PLAYS_CACHE_KEY, JSON.stringify(mergeAcknowledgedCounts(rows)));
  } catch { /* Analytics cache failure must not interrupt audio. */ }
}

/** Hiển thị bản đã lưu trong khi query đang chờ tải tổng mới. */
export function readCachedAlbumPlays(): AlbumPlayCount[] | undefined {
  try {
    const cached = typeof localStorage !== 'undefined' ? localStorage.getItem(ALBUM_PLAYS_CACHE_KEY) : null;
    const rows: unknown = cached ? JSON.parse(cached) : null;
    if (isAlbumPlayCounts(rows)) return mergeAcknowledgedCounts(rows);
  } catch { /* Cache không truy cập được vẫn không chặn dữ liệu từ web. */ }
  return undefined;
}

export async function fetchAlbumPlays(signal?: AbortSignal): Promise<AlbumPlayCount[]> {
  const cachedCounts = () => readCachedAlbumPlays() ?? mergeAcknowledgedCounts([]);
  try {
    const saved = readCachedAlbumPlays();
    let lastSync = 0;
    try {
      lastSync = Number(typeof localStorage !== 'undefined' ? localStorage.getItem(ALBUM_PLAYS_SYNC_TIME_KEY) : 0);
    } catch { /* Bộ nhớ bị chặn vẫn cho phép tải tổng từ server. */ }
    const age = Date.now() - lastSync;
    // Dùng mốc tải tổng thành công, không gia hạn khi nghe thêm hoặc chỉ mở lại màn hình.
    if (saved && Number.isFinite(lastSync) && lastSync > 0 && age >= 0 && age < ALBUM_PLAYS_MAX_AGE_MS) {
      return mergeAcknowledgedCounts(saved);
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return cachedCounts();
    const response = await fetchWithSessionRefresh('/api/album-plays', { signal });
    if (!response.ok || isHtmlResponse(response) || response.headers.get('x-quangtu-offline') === '1' || signal?.aborted) return cachedCounts();
    let rows: unknown;
    try {
      rows = await response.json();
    } catch {
      return cachedCounts();
    }
    if (!isAlbumPlayCounts(rows) || signal?.aborted) return cachedCounts();
    rows = mergeAcknowledgedCounts(rows);
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(ALBUM_PLAYS_CACHE_KEY, JSON.stringify(rows));
        localStorage.setItem(ALBUM_PLAYS_SYNC_TIME_KEY, String(Date.now()));
      }
    } catch { /* Không bỏ tổng từ web chỉ vì bộ nhớ cache đã đầy. */ }
    return rows as AlbumPlayCount[];
  } catch {
    return cachedCounts();
  }
}

/** Applies the count returned by a play POST so the list never needs a D1 refetch. */
export function applyAlbumPlayResult(rows: AlbumPlayCount[] | undefined, result: unknown): AlbumPlayCount[] | undefined {
  if (!rows || !result || typeof result !== 'object') return rows;
  const { albumId, playCount } = result as Partial<AlbumPlayCount>;
  if (typeof albumId !== 'string' || typeof playCount !== 'number' || !Number.isFinite(playCount) || playCount < 0) return rows;
  if (!rows.some((row) => row.albumId === albumId)) return [...rows, { albumId, playCount }];
  return rows.map((row) => row.albumId === albumId ? { ...row, playCount: Math.max(row.playCount, playCount) } : row);
}

/** Best-effort analytics: never interrupt playback or retain an offline queue. */
export function createAlbumPlayReporter() {
  type Cycle = { playbackId: string; pending: boolean; sent: boolean };
  type Session = Awaited<ReturnType<typeof getBrowserSession>>;
  const cycles = new Map<string, Cycle>();
  let selected: { key: string; albumId: string; trackUrl: string } | null = null;
  let generation = 0;
  let selectionGeneration = 0;
  let deferred: { key: string; cycle: Cycle; principal: string; generation: number; selectionGeneration: number } | null = null;
  let removeSessionListener: (() => void) | null = null;
  const principal = (session: Session) => JSON.stringify([session.authenticated, session.user?.id ?? null, session.user?.role ?? null]);
  function clearDeferred() {
    removeSessionListener?.();
    removeSessionListener = null;
    deferred = null;
  }
  function reset() {
    clearDeferred();
    generation += 1;
    selected = null;
    cycles.clear();
  }
  function verifiedDeferredSession(): Session | null {
    const waiting = deferred;
    if (!waiting) return null;
    if (waiting.generation !== generation || waiting.selectionGeneration !== selectionGeneration
      || selected?.key !== waiting.key || cycles.get(waiting.key) !== waiting.cycle) {
      clearDeferred();
      return null;
    }
    const session = getBrowserSessionSnapshot();
    if (principal(session) !== waiting.principal) {
      reset();
      return null;
    }
    if (!hasUsableBrowserCsrf(session.csrfToken)) return null;
    clearDeferred();
    return session;
  }
  function sessionChanged() {
    const session = verifiedDeferredSession();
    if (session) void playing(session);
  }
  function newPlaybackId(): string {
    return createBrowserId();
  }
  async function playing(verifiedSession?: Session) {
    if (!selected) return;
    const { key, albumId, trackUrl } = selected;
    let cycle = cycles.get(key);
    if (cycle?.pending || cycle?.sent) return;
    if (!cycle) {
      cycle = { playbackId: newPlaybackId(), pending: false, sent: false };
      cycles.set(key, cycle);
    }
    // Offline không gửi bù analytics khi bài đang nghe chuyển lại online.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      cycle.sent = true;
      return;
    }
    cycle.pending = true;
    const requestGeneration = generation;
    const requestSelectionGeneration = selectionGeneration;
    try {
      let session = verifiedSession ?? await getBrowserSession();
      if (requestGeneration !== generation) return;
      if (deferred?.cycle === cycle && principal(session) !== deferred.principal) {
        reset();
        return;
      }
      if (session.authenticated && !hasUsableBrowserCsrf(session.csrfToken)) {
        if (requestSelectionGeneration !== selectionGeneration || selected?.key !== key || cycles.get(key) !== cycle
          || typeof window === 'undefined') return;
        clearDeferred();
        deferred = { key, cycle, principal: principal(session), generation, selectionGeneration };
        window.addEventListener(SESSION_CHANGE_EVENT, sessionChanged);
        removeSessionListener = () => window.removeEventListener(SESSION_CHANGE_EVENT, sessionChanged);
        // Nonce có thể đã về trong lúc chờ snapshot cũ; chỉ đọc lại bộ nhớ, không refresh phiên.
        const ready = verifiedDeferredSession();
        if (!ready) return;
        session = ready;
      }
      if (deferred?.cycle === cycle) clearDeferred();
      const csrfToken = session.authenticated ? session.csrfToken : 'public';
      if (!csrfToken) return;
      const path = `/api/talks/${encodeURIComponent(albumId)}/plays`;
      const init: RequestInit = {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken },
        body: JSON.stringify({ playbackId: cycle.playbackId, trackUrl }),
      };
      const response = await fetchNativeJsonMutation(path, init) ?? await fetchWithSessionRefresh(path, init);
      if (!response.ok || requestGeneration !== generation) return;
      const result = await response.json();
      cycle.sent = true;
      rememberAcknowledgedCount(result);
      window.dispatchEvent(new CustomEvent(ALBUM_PLAYS_CHANGED, { detail: result }));
    } catch { /* Listening remains available if analytics is offline. */ }
    finally { cycle.pending = false; }
  }
  return {
    select(albumId: string, trackUrl: string) {
      const next = albumId && trackUrl ? { key: JSON.stringify([albumId, trackUrl]), albumId, trackUrl } : null;
      if (next?.key !== selected?.key) {
        selectionGeneration += 1;
        clearDeferred();
      }
      selected = next;
    },
    playing: () => playing(),
    ended() {
      // Only a completed track unlocks another count; resume/buffering keep the ID.
      clearDeferred();
      if (selected) cycles.delete(selected.key);
    },
    reset,
  };
}
