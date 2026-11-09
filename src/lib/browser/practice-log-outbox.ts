import {
  COMPLETED_LOG_BATCH_LIMIT, PRACTICE_LOG_CHANGED_EVENT, isCompletedLogType,
  normalizeCompletedLogs, type CompletedPracticeLog,
} from '$lib/domain/practice/completed-logs';
import { normalizePracticeLogs, type PracticeLog } from '$lib/domain/practice/logs';
import { createBrowserId } from './random-id';
import { createPrincipalStorage, principalStorageKey } from './principal-storage';
import { DELETED_PRACTICE_LOGS_KEY, LEGACY_LOCAL_STORAGE_KEYS, type StorageLike } from './storage-contract';
import { SESSION_CHANGE_EVENT } from '$lib/stores/session.svelte';

export const COMPLETED_LOG_OUTBOX_KEY = 'quangtu_completed_practice_logs_v1';
interface QueueState {
  version: 1;
  namespace: string;
  startedAt: string;
  pending: CompletedPracticeLog[];
  acknowledged: string[];
}
interface SyncSession {
  authenticated: boolean;
  csrfToken: string | null;
  user: { id: string } | null;
}

export function initializeCompletedLogState(storage: StorageLike, now = new Date()): QueueState {
  const raw = storage.getItem(COMPLETED_LOG_OUTBOX_KEY);
  if (raw === null) {
    const initial: QueueState = { version: 1, namespace: createBrowserId(), startedAt: now.toISOString(), pending: [], acknowledged: [] };
    storage.setItem(COMPLETED_LOG_OUTBOX_KEY, JSON.stringify(initial));
    return initial;
  }
  const value = JSON.parse(raw) as Partial<QueueState>;
  if (value.version !== 1 || typeof value.namespace !== 'string' || !value.namespace
    || typeof value.startedAt !== 'string' || !Number.isFinite(Date.parse(value.startedAt))
    || !Array.isArray(value.pending) || !Array.isArray(value.acknowledged)
    || !value.acknowledged.every(id => typeof id === 'string')) throw new Error('invalid_completed_log_queue');
  for (const log of value.pending) normalizeCompletedLogs({ logs: [log] }, new Date('9999-01-01T00:00:00.000Z'));
  return value as QueueState;
}

/** ID của vòng chép giữ nguyên qua lần thử lại, nhưng khác giữa các thiết bị. */
export function completedLogNumericId(storage: StorageLike, key: string): number {
  const { namespace } = initializeCompletedLogState(storage);
  let hash = 14695981039346656037n;
  for (const char of `${namespace}:${key}`) hash = BigInt.asUintN(64, (hash ^ BigInt(char.codePointAt(0)!)) * 1099511628211n);
  return Number(hash & ((1n << 52n) - 1n)) || 1;
}

function receiptId(log: PracticeLog): string {
  return `log:${log.id}`;
}

/** Phiên đã có trên server không được biến thành công phu mới khi đổi thiết bị. */
export function acknowledgeRestoredToolLogs(storage: StorageLike, logs: PracticeLog[]): void {
  if (!logs.length) return;
  const state = initializeCompletedLogState(storage);
  const ids = new Set(logs.map(log => receiptId(log)));
  state.pending = state.pending.filter(log => !ids.has(log.logId));
  state.acknowledged = [...new Set([...state.acknowledged, ...ids])];
  storage.setItem(COMPLETED_LOG_OUTBOX_KEY, JSON.stringify(state));
}

export function createCompletedLogSync(
  fetcher: typeof fetch, storage: StorageLike,
  dependencies: { now?: () => Date; onApplied?: (count: number) => void } = {},
) {
  const now = dependencies.now ?? (() => new Date());
  let session: SyncSession = { authenticated: false, csrfToken: null, user: null };
  let generation = 0;
  let controller: AbortController | null = null;
  let running: { generation: number; promise: Promise<number> } | null = null;
  const principal = () => session.authenticated ? session.user?.id ?? null : null;
  const write = (scoped: StorageLike, state: QueueState) => scoped.setItem(COMPLETED_LOG_OUTBOX_KEY, JSON.stringify(state));

  function collect(scoped: StorageLike): QueueState {
    const state = initializeCompletedLogState(scoped, now());
    let deleted: unknown = [];
    try { deleted = JSON.parse(scoped.getItem(DELETED_PRACTICE_LOGS_KEY) || '[]'); }
    catch { /* Giữ nguyên hàng đợi nếu dấu xóa cũ không đọc được. */ }
    const deletedIds = new Set(Array.isArray(deleted) ? deleted.map(String) : []);
    // Chỉ hủy mục có dấu xóa rõ ràng; thiếu trong snapshot không chứng minh người dùng đã xóa.
    const pending = state.pending.filter(log => !deletedIds.has(String(log.localLogId)));
    let changed = pending.length !== state.pending.length;
    state.pending = pending;
    const known = new Set([...state.acknowledged, ...state.pending.map(log => log.logId)]);
    const rawLogs: unknown = JSON.parse(scoped.getItem(LEGACY_LOCAL_STORAGE_KEYS.practiceLogs) || '[]');
    const logs = normalizePracticeLogs(Array.isArray(rawLogs) ? rawLogs.filter(value => value && typeof value === 'object'
      && typeof value.created === 'string' && Number.isFinite(Date.parse(value.created))) : []);
    for (const log of logs) {
      if (deletedIds.has(String(log.id)) || !isCompletedLogType(log.type) || log.campaignId || Date.parse(log.created) < Date.parse(state.startedAt)) continue;
      // ID sổ công phu đã ổn định; không tạo receipt khác khi đổi thiết bị.
      const logId = receiptId(log);
      if (known.has(logId)) continue;
      if (state.pending.length >= 1_000) break;
      const [item] = normalizeCompletedLogs({ logs: [{ logId, localLogId: log.id, type: log.type, count: log.count, completedAt: log.created, note: log.note.slice(0, 2_000) }] }, new Date('9999-01-01T00:00:00.000Z'));
      state.pending.push(item); known.add(logId); changed = true;
    }
    if (changed) write(scoped, state);
    return state;
  }

  async function drain(epoch: number, owner: string, csrf: string): Promise<number> {
    const scoped = createPrincipalStorage(storage, owner);
    const activeController = new AbortController(); controller = activeController;
    let applied = 0;
    try {
      let state = collect(scoped);
      while (state.pending.length && epoch === generation) {
        const logs = state.pending.slice(0, COMPLETED_LOG_BATCH_LIMIT);
        const response = await fetcher('/api/practice/completed-logs', {
          method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': csrf },
          body: JSON.stringify({ logs }), signal: activeController.signal,
        });
        if (!response.ok) throw new Error(`completed_log_sync_${response.status}`);
        if (epoch !== generation || principal() !== owner) return 0;
        state = initializeCompletedLogState(scoped, now());
        const ids = new Set(logs.map(log => log.logId));
        state.pending = state.pending.filter(log => !ids.has(log.logId));
        state.acknowledged = [...new Set([...state.acknowledged, ...ids])];
        write(scoped, state); applied += logs.length;
        state = collect(scoped);
      }
      if (applied && epoch === generation) dependencies.onApplied?.(applied);
      return applied;
    } finally { if (controller === activeController) controller = null; }
  }

  return {
    setSession(next: SyncSession) {
      const changed = principal() !== (next.authenticated ? next.user?.id ?? null : null) || session.csrfToken !== next.csrfToken;
      if (changed) { generation++; controller?.abort(); }
      session = next;
      initializeCompletedLogState(createPrincipalStorage(storage, principal()), now());
    },
    flush(): Promise<number> {
      const owner = principal();
      if (!owner || !session.csrfToken) return Promise.resolve(0);
      if (running?.generation === generation) return running.promise;
      const epoch = generation;
      const promise = drain(epoch, owner, session.csrfToken).finally(() => {
        if (running?.promise === promise) running = null;
      });
      running = { generation: epoch, promise }; return promise;
    },
    dispose() { generation++; controller?.abort(); },
  };
}

export function startCompletedPracticeLogSync(
  fetcher: typeof fetch, storage: StorageLike, getSession: () => SyncSession,
  onApplied: () => void, onError: (pending: boolean) => void,
): () => void {
  let disposed = false;
  const sync = createCompletedLogSync(fetcher, storage, { onApplied });
  const flush = () => {
    if (disposed) return;
    try {
      const session = getSession();
      const owner = session.user?.id ?? null;
      sync.setSession(session);
      // Đổi tài khoản phải thu hồi request cũ ngay cả khi app đang ở nền.
      if (document.visibilityState === 'hidden') return;
      const current = () => !disposed && (getSession().user?.id ?? null) === owner;
      void sync.flush().then(() => { if (current()) onError(false); }).catch(() => { if (current()) onError(true); });
    } catch { onError(true); }
  };
  const storageChanged = (event: StorageEvent) => {
    const session = getSession();
    const owner = session.authenticated ? session.user?.id ?? null : null;
    if (event.key === principalStorageKey(owner, LEGACY_LOCAL_STORAGE_KEYS.practiceLogs)) flush();
  };
  window.addEventListener(PRACTICE_LOG_CHANGED_EVENT, flush);
  window.addEventListener(SESSION_CHANGE_EVENT, flush);
  window.addEventListener('online', flush);
  window.addEventListener('storage', storageChanged);
  document.addEventListener('visibilitychange', flush);
  flush();
  return () => {
    disposed = true; sync.dispose();
    window.removeEventListener(PRACTICE_LOG_CHANGED_EVENT, flush);
    window.removeEventListener(SESSION_CHANGE_EVENT, flush);
    window.removeEventListener('online', flush);
    window.removeEventListener('storage', storageChanged);
    document.removeEventListener('visibilitychange', flush);
  };
}
