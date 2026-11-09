import type {
  PracticeSessionFinishRequest,
  PracticeSessionStart,
} from '$lib/domain/practice/sessions';
import {
  ANONYMOUS_STORAGE_PRINCIPAL,
  createPrincipalStorage,
} from './principal-storage';
import { getBrowserStorage, type StorageLike } from './storage-contract';

export const PRACTICE_SESSION_OUTBOX_KEY = 'quangtu_practice_session_outbox_v1';
export const PRACTICE_ANONYMOUS_ADOPTION_DECISION_KEY = 'quangtu_practice_anonymous_adoption_v1';
export const PRACTICE_OUTBOX_CAPACITY_ERROR = 'practice_outbox_capacity_exceeded';
export const PRACTICE_SESSION_ACCEPTED_EVENT = 'quangtu:practice-session-accepted';
export interface PracticeSessionAcceptedDetail {
  principalId: string;
  acceptedCount: number;
  contributionsAdded?: number;
}
const MAX_PRACTICE_OUTBOX_OPERATIONS = 1_000;

export function isPracticeOutboxCapacityError(cause: unknown): boolean {
  return cause instanceof Error && cause.message === PRACTICE_OUTBOX_CAPACITY_ERROR;
}

interface PracticeSessionOperation {
  id: string;
  kind: 'start' | 'complete';
  clientSessionId: string;
  payload: PracticeSessionStart | PracticeSessionFinishRequest;
  queuedAt: string;
}

export interface PracticeSessionClientSession {
  authenticated: boolean;
  csrfToken: string | null;
  user: null | { id: string };
}

export interface PracticeSessionSyncStatus {
  principalId: string;
  pendingOperations: number;
  phase: 'idle' | 'pending' | 'syncing' | 'failed';
  failure: null | 'offline' | 'authentication' | 'rejected' | 'retryable' | 'storage';
  canRetry: boolean;
}
export type PracticeSessionOutboxStatus = PracticeSessionSyncStatus;

export function createPracticeSessionOutbox(
  fetcher: typeof fetch,
  storage: StorageLike = getBrowserStorage(),
  dependencies: { now?: () => Date } = {},
) {
  const now = dependencies.now ?? (() => new Date());
  let session: PracticeSessionClientSession = { authenticated: false, csrfToken: null, user: null };
  let generation = 0;
  let inFlight: AbortController | null = null;
  let running: { generation: number; promise: Promise<number> } | null = null;
  let syncing = false;
  let failure: PracticeSessionSyncStatus['failure'] = null;
  const listeners = new Set<(status: PracticeSessionSyncStatus) => void>();

  const principalId = () => session.authenticated && session.user?.id
    ? session.user.id
    : ANONYMOUS_STORAGE_PRINCIPAL;
  const principalStorage = (id = principalId()) => createPrincipalStorage(storage, id);

  const read = (id = principalId(), strict = false): PracticeSessionOperation[] => {
    try {
      const raw = principalStorage(id).getItem(PRACTICE_SESSION_OUTBOX_KEY);
      const parsed = JSON.parse(raw === null ? '[]' : raw);
      if (!Array.isArray(parsed) || parsed.length > MAX_PRACTICE_OUTBOX_OPERATIONS || !parsed.every(isOperation)) {
        throw new Error('invalid_practice_session_outbox');
      }
      return parsed;
    } catch (cause) {
      if (id === principalId() || strict) failure = 'storage';
      // Đọc trạng thái vẫn an toàn, nhưng mutation không được thay bytes chưa đọc được bằng hàng đợi rỗng.
      if (strict) { publish(); throw cause; }
      return [];
    }
  };
  const getStatus = (): PracticeSessionSyncStatus => {
    const pendingOperations = read().length;
    const visibleFailure = failure ?? (pendingOperations && (!session.authenticated || !session.csrfToken) ? 'authentication' : null);
    return { principalId: principalId(), pendingOperations,
      phase: syncing ? 'syncing' : visibleFailure ? 'failed' : pendingOperations ? 'pending' : 'idle', failure: visibleFailure,
      canRetry: Boolean(session.authenticated && session.csrfToken && pendingOperations && !syncing && failure !== 'rejected' && failure !== 'authentication'),
    };
  };
  const publish = () => { const status = getStatus(); for (const listener of listeners) listener(status); };
  const write = (operations: PracticeSessionOperation[], id = principalId()) => {
    if (operations.length > MAX_PRACTICE_OUTBOX_OPERATIONS) {
      throw new Error(PRACTICE_OUTBOX_CAPACITY_ERROR);
    }
    try { principalStorage(id).setItem(PRACTICE_SESSION_OUTBOX_KEY, JSON.stringify(operations)); }
    catch (cause) { if (id === principalId()) { failure = 'storage'; publish(); } throw cause; }
    if (id === principalId()) publish();
  };
  const enqueue = (operation: PracticeSessionOperation, owner = principalId()) => {
    const operations = read(owner, true);
    if (!operations.some((item) => item.id === operation.id)) operations.push(operation);
    write(operations, owner);
    return operation;
  };

  return {
    getStatus,
    subscribe(listener: (status: PracticeSessionSyncStatus) => void): () => void {
      listeners.add(listener); listener(getStatus());
      return () => listeners.delete(listener);
    },
    adoptAnonymousQueue(userId: string): number {
      const anonymous = read(ANONYMOUS_STORAGE_PRINCIPAL, true);
      const account = read(userId, true);
      const existingIds = new Set(account.map((operation) => operation.id));
      const newlyAdopted = anonymous.filter((operation) => !existingIds.has(operation.id));
      const candidates = [...newlyAdopted, ...account];
      const merged = [
        ...candidates.filter((operation) => operation.kind === 'start'),
        ...candidates.filter((operation) => operation.kind === 'complete'),
      ];
      if (merged.length > MAX_PRACTICE_OUTBOX_OPERATIONS) {
        throw new Error(PRACTICE_OUTBOX_CAPACITY_ERROR);
      }
      write(merged, userId);
      write([], ANONYMOUS_STORAGE_PRINCIPAL);
      principalStorage(userId).setItem(PRACTICE_ANONYMOUS_ADOPTION_DECISION_KEY, 'adopted');
      return newlyAdopted.length;
    },

    keepAnonymousQueueSeparate(userId: string): void {
      principalStorage(userId).setItem(PRACTICE_ANONYMOUS_ADOPTION_DECISION_KEY, 'kept_separate');
    },

    shouldOfferAnonymousAdoption(userId: string): boolean {
      const decision = principalStorage(userId).getItem(PRACTICE_ANONYMOUS_ADOPTION_DECISION_KEY);
      return decision === null && read(ANONYMOUS_STORAGE_PRINCIPAL).length > 0;
    },

    enqueueStart(input: PracticeSessionStart) {
      return enqueue({
        id: `start:${input.idempotencyKey}`,
        kind: 'start',
        clientSessionId: input.clientSessionId,
        payload: input,
        queuedAt: now().toISOString(),
      });
    },

    enqueueCompletion(clientSessionId: string, input: PracticeSessionFinishRequest, owner = principalId()) {
      return enqueue({
        id: `complete:${clientSessionId}`,
        kind: 'complete',
        clientSessionId,
        payload: input,
        queuedAt: now().toISOString(),
      }, owner);
    },

    flush(): Promise<number> {
      if (!session.authenticated || !session.user?.id || !session.csrfToken) return Promise.resolve(0);
      if (running?.generation === generation) return running.promise;
      const capturedPrincipal = session.user.id;
      const capturedGeneration = generation;
      const capturedCsrf = session.csrfToken;
      try { if (!read(capturedPrincipal, true).length) return Promise.resolve(0); }
      catch (cause) { return Promise.reject(cause); }
      const drain = async (): Promise<number> => {
        let applied = 0;
        let acceptedCount = 0;
        let contributionsAdded = 0;
        let contributionsKnown = true;
        const controller = new AbortController();
        inFlight = controller;
        failure = null; syncing = true; publish();
        try {
          while (generation === capturedGeneration && principalId() === capturedPrincipal) {
            // Chỉ một drain cho mỗi phiên; đọc lại để nhận completion được thêm khi start còn chờ.
            const operation = read(capturedPrincipal, true)[0];
            if (!operation) break;
            const path = operation.kind === 'start'
              ? '/api/practice/sessions'
              : `/api/practice/sessions/${encodeURIComponent(operation.clientSessionId)}/complete`;
            const response = await fetcher(path, {
              body: JSON.stringify(operation.payload),
              headers: { 'content-type': 'application/json', 'x-csrf-token': capturedCsrf },
              method: 'POST',
              signal: controller.signal,
            });
            if (!response.ok) {
              if (generation === capturedGeneration) failure = response.status === 401 || response.status === 403
                ? 'authentication' : response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429
                  ? 'rejected' : 'retryable';
              throw new Error(`practice_session_${response.status}`);
            }
            let accepted = false;
            let contributionCount: number | undefined;
            if (operation.kind === 'complete') {
              try {
                const result: unknown = await response.json();
                accepted = acceptedCompletion(result, operation.clientSessionId);
                if (accepted && result && typeof result === 'object') {
                  const count = Reflect.get(result, 'contributionsAdded');
                  if (typeof count === 'number' && Number.isSafeInteger(count) && count >= 0) contributionCount = count;
                }
              } catch {
                // Backend cũ thiếu DTO xác minh vẫn được ack, nhưng không suy ra công phu đã duyệt.
              }
            }
            if (generation !== capturedGeneration || principalId() !== capturedPrincipal) break;
            const current = read(capturedPrincipal, true);
            write(current.filter((item) => item.id !== operation.id), capturedPrincipal);
            applied += 1;
            if (accepted) {
              acceptedCount += 1;
              if (contributionCount === undefined || !Number.isSafeInteger(contributionsAdded + contributionCount)) contributionsKnown = false;
              else contributionsAdded += contributionCount;
            }
          }
        } catch (cause) {
          if (generation === capturedGeneration && !failure) failure = typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'retryable';
          throw cause;
        } finally {
          if (inFlight === controller) inFlight = null;
          if (generation === capturedGeneration) { syncing = false; publish(); }
          // Một sự kiện cho cả đợt đã xác minh; không refetch theo từng operation hoặc lúc enqueue.
          if (acceptedCount > 0 && generation === capturedGeneration && principalId() === capturedPrincipal
            && typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent<PracticeSessionAcceptedDetail>(PRACTICE_SESSION_ACCEPTED_EVENT, {
              detail: { principalId: capturedPrincipal, acceptedCount,
                ...(contributionsKnown ? { contributionsAdded } : {}),
              },
            }));
          }
        }
        return applied;
      };
      const promise = drain().finally(() => {
        if (running?.promise === promise) running = null;
      });
      running = { generation: capturedGeneration, promise };
      return promise;
    },

    pending(principal = principalId()): ReadonlyArray<PracticeSessionOperation> {
      return read(principal);
    },

    setSession(next: PracticeSessionClientSession): void {
      const previousPrincipal = principalId();
      const nextPrincipal = next.authenticated && next.user?.id
        ? next.user.id
        : ANONYMOUS_STORAGE_PRINCIPAL;
      const credentialsChanged = session.csrfToken !== next.csrfToken;
      session = next;
      if (previousPrincipal !== nextPrincipal || credentialsChanged) {
        generation += 1;
        inFlight?.abort();
        inFlight = null;
        syncing = false;
        failure = null;
      }
      publish();
    },
  };
}

const browserOutboxes = new WeakMap<StorageLike, ReturnType<typeof createPracticeSessionOutbox>>();
/** Một owner dùng chung cho route, audio và trạng thái root; factory thuần vẫn dùng được cho kiểm thử. */
export function getBrowserPracticeSessionOutbox(fetcher: typeof fetch, storage: StorageLike = getBrowserStorage()) {
  let outbox = browserOutboxes.get(storage);
  if (!outbox) { outbox = createPracticeSessionOutbox(fetcher, storage); browserOutboxes.set(storage, outbox); }
  return outbox;
}

function acceptedCompletion(value: unknown, clientSessionId: string): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const session = Reflect.get(value, 'session');
  return Boolean(session && typeof session === 'object' && !Array.isArray(session)
    && Reflect.get(session, 'clientSessionId') === clientSessionId
    && Reflect.get(session, 'status') === 'completed'
    && Reflect.get(session, 'verificationResult') === 'accepted');
}

function isOperation(value: unknown): value is PracticeSessionOperation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return (row.kind === 'start' || row.kind === 'complete')
    && typeof row.id === 'string'
    && typeof row.clientSessionId === 'string'
    && Boolean(row.payload)
    && typeof row.payload === 'object';
}
