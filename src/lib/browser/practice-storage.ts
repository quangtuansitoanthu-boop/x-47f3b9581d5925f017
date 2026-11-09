import { initializeCompletedLogState } from './practice-log-outbox';
import { isCompletedLogType, PRACTICE_LOG_CHANGED_EVENT } from '$lib/domain/practice/completed-logs';
import { createCloudSyncCoordinator } from './cloud-sync-coordinator';
import {
  DELETED_PRACTICE_LOGS_KEY,
  LEGACY_LOCAL_STORAGE_KEYS,
  readAggregateSyncSnapshot,
  type StorageLike
} from './storage-contract';
import { createPrincipalStorage } from './principal-storage';
import { createPracticeLog, normalizePracticeLogs, type PracticeLog, type PracticeType } from '$lib/domain/practice/logs';
import { getVietnamIsoDate } from '$lib/domain/practice/stats';
import { hasUsableBrowserCsrf } from './session-csrf';

export interface PracticeFabPosition {
  x: number;
  y: number;
}

export interface PracticePreferences {
  fontSize: number;
  practiceBackground: string;
  practiceBold: boolean;
  readBackground: string;
  rosaryCount: number;
  rosaryDirection: 'up' | 'down';
  rosarySoundEnabled: boolean;
  trackerOpen: boolean;
}

export interface PracticeSyncSession {
  authenticated: boolean;
  csrfToken: string | null;
  user: null | { id: string };
}

const TT_TRACKER_KEY = 'ttTrackerOpen';
const TTP_BOLD_KEY = 'tt_practice_bold';
export { DELETED_PRACTICE_LOGS_KEY } from './storage-contract';

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function getPracticeStorage(storage: StorageLike = window.localStorage) {
  return {
    clearFabPosition() {
      storage.removeItem?.(LEGACY_LOCAL_STORAGE_KEYS.tutapFabPosition);
    },
    deleteLog(id: number): PracticeLog[] {
      const targetId = String(id);
      const logs = this.getLogs().filter((log) => String(log.id) !== targetId && Number(log.id) !== Number(id));
      storage.setItem(LEGACY_LOCAL_STORAGE_KEYS.practiceLogs, JSON.stringify(logs));
      const deleted = this.getDeletedLogIds();
      deleted.add(targetId);
      storage.setItem(DELETED_PRACTICE_LOGS_KEY, JSON.stringify(Array.from(deleted)));
      return logs;
    },
    getDeletedLogIds(): Set<string> {
      const parsed = parseJson<string[]>(storage.getItem(DELETED_PRACTICE_LOGS_KEY), []);
      return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
    },
    getFabPosition(): PracticeFabPosition | null {
      const parsed = parseJson<Partial<PracticeFabPosition> | null>(
        storage.getItem(LEGACY_LOCAL_STORAGE_KEYS.tutapFabPosition),
        null
      );
      if (!parsed || typeof parsed.x !== 'number' || typeof parsed.y !== 'number') return null;
      if (!Number.isFinite(parsed.x) || !Number.isFinite(parsed.y)) return null;
      return { x: parsed.x, y: parsed.y };
    },
    getLogs(): PracticeLog[] {
      return normalizePracticeLogs(parseJson(storage.getItem(LEGACY_LOCAL_STORAGE_KEYS.practiceLogs), []));
    },
    getPreferences(): PracticePreferences {
      return {
        fontSize: Math.max(12, Math.min(26, Number.parseInt(storage.getItem(LEGACY_LOCAL_STORAGE_KEYS.practiceFontSize) ?? '15', 10) || 15)),
        practiceBackground: storage.getItem(LEGACY_LOCAL_STORAGE_KEYS.practiceBackground) || storage.getItem(LEGACY_LOCAL_STORAGE_KEYS.tutapReadBackground) || 'cream',
        practiceBold: storage.getItem(TTP_BOLD_KEY) === '1',
        readBackground: storage.getItem(LEGACY_LOCAL_STORAGE_KEYS.tutapReadBackground) || 'cream',
        rosaryCount: Math.max(0, Number.parseInt(storage.getItem(LEGACY_LOCAL_STORAGE_KEYS.rosaryCount) ?? '0', 10) || 0),
        rosaryDirection: storage.getItem(LEGACY_LOCAL_STORAGE_KEYS.rosaryDirection) === 'down' ? 'down' : 'up',
        rosarySoundEnabled: storage.getItem(LEGACY_LOCAL_STORAGE_KEYS.rosarySoundEnabled) === '1',
        trackerOpen: storage.getItem(TT_TRACKER_KEY) === '1'
      };
    },
    openNewLogDraft(now = new Date()) {
      return createPracticeLog({
        count: 1,
        date: getVietnamIsoDate(now),
        note: '',
        type: 'Niệm danh hiệu'
      });
    },
    saveFabPosition(position: PracticeFabPosition): void {
      storage.setItem(LEGACY_LOCAL_STORAGE_KEYS.tutapFabPosition, JSON.stringify(position));
    },
    saveLog(log: PracticeLog): PracticeLog[] {
      if (isCompletedLogType(log.type) && !log.campaignId) {
        initializeCompletedLogState(storage, Number.isFinite(Date.parse(log.created)) ? new Date(log.created) : new Date());
      }
      const targetId = String(log.id);
      const logs = this.getLogs().filter((entry) => String(entry.id) !== targetId && Number(entry.id) !== Number(log.id));
      logs.push(log);
      const normalized = normalizePracticeLogs(logs);
      storage.setItem(LEGACY_LOCAL_STORAGE_KEYS.practiceLogs, JSON.stringify(normalized));
      const deleted = this.getDeletedLogIds();
      if (deleted.has(targetId)) {
        deleted.delete(targetId);
        storage.setItem(DELETED_PRACTICE_LOGS_KEY, JSON.stringify(Array.from(deleted)));
      }
      if (typeof window !== 'undefined' && isCompletedLogType(log.type) && !log.campaignId) {
        window.dispatchEvent(new Event(PRACTICE_LOG_CHANGED_EVENT));
      }
      return normalized;
    },
    savePreferences(prefs: Partial<PracticePreferences>): PracticePreferences {
      const current = this.getPreferences();
      const next = { ...current, ...prefs };
      storage.setItem(LEGACY_LOCAL_STORAGE_KEYS.practiceFontSize, String(next.fontSize));
      storage.setItem(LEGACY_LOCAL_STORAGE_KEYS.tutapReadBackground, next.readBackground);
      storage.setItem(LEGACY_LOCAL_STORAGE_KEYS.practiceBackground, next.practiceBackground);
      storage.setItem(TTP_BOLD_KEY, next.practiceBold ? '1' : '0');
      storage.setItem(LEGACY_LOCAL_STORAGE_KEYS.rosaryCount, String(next.rosaryCount));
      storage.setItem(LEGACY_LOCAL_STORAGE_KEYS.rosaryDirection, next.rosaryDirection);
      storage.setItem(LEGACY_LOCAL_STORAGE_KEYS.rosarySoundEnabled, next.rosarySoundEnabled ? '1' : '0');
      storage.setItem(TT_TRACKER_KEY, next.trackerOpen ? '1' : '0');
      return next;
    }
  };
}

export function createPracticeSyncClient(fetcher: typeof fetch, storage: StorageLike = window.localStorage) {
  let currentCsrfToken: string | null = null;
  let currentPrincipalId: string | null = null;
  let generation = 0;
  let transportController = new AbortController();
  let deferredPushPrincipalId: string | null = null;
  let deferredPullPrincipalId: string | null = null;
  let deferredPushVersion = 0;
  let drainingGeneration: number | null = null;
  let activePull: { principalId: string; generation: number; promise: Promise<PracticeLog[] | null> } | null = null;
  const pendingCredentials = 'sync_credentials_pending';

  const request = async (userId: string, init: RequestInit) => {
    if (userId !== currentPrincipalId) throw new Error('sync_principal_changed');
    if (init.method && !hasUsableBrowserCsrf(currentCsrfToken)) {
      deferredPushPrincipalId = userId;
      deferredPushVersion += 1;
      throw new Error(pendingCredentials);
    }
    const capturedGeneration = generation;
    const response = await fetcher('/api/sync', {
      ...init,
      signal: transportController.signal,
      headers: {
        ...init.headers,
        ...(init.method ? { 'x-csrf-token': currentCsrfToken ?? '' } : {}),
      },
    });
    if (capturedGeneration !== generation || userId !== currentPrincipalId) throw new Error('sync_principal_changed');
    return response;
  };

  const coordinator = createCloudSyncCoordinator(storage, {
    async pull(userId) {
      const capturedGeneration = generation;
      const response = await request(userId, {
        headers: { accept: 'application/json' }
      });
      if (!response.ok) return null;
      const raw = await response.json() as Record<string, unknown> | null;
      if (capturedGeneration !== generation || userId !== currentPrincipalId) return null;
      if (!raw || typeof raw !== 'object') return null;
      const tombstones = raw.sync_tombstones as Record<string, unknown> | undefined;
      const locallyOwnedPlayer = readAggregateSyncSnapshot(createPrincipalStorage(storage, userId));
      return {
        bookmarks: Array.isArray(raw.bookmarks) ? raw.bookmarks : [],
        listenedHistory: Array.isArray(raw.listened_history) ? raw.listened_history : [],
        practiceLogs: Array.isArray(raw.practice_logs) ? raw.practice_logs : [],
        // AudioPlayerController is the sole writer for player state through
        // /api/player-sync. Aggregate practice sync must not race that owner.
        ptAlbumPositions: locallyOwnedPlayer.ptAlbumPositions,
        ptPlayerState: locallyOwnedPlayer.ptPlayerState,
        ptRecentAlbums: locallyOwnedPlayer.ptRecentAlbums,
        syncTombstones: tombstones ? {
          bookmarks: normalizeDeletionEntries(tombstones.bookmarks),
          listenedHistory: normalizeDeletionEntries(tombstones.listened_history),
          practiceLogs: normalizeDeletionEntries(tombstones.practice_logs),
          ptAlbumPositions: [],
          ptPlayerState: null,
          ptRecentAlbums: [],
        } : undefined,
      };
    },
    async push(userId, snapshot) {
      const capturedPushVersion = deferredPushVersion;
      const response = await request(userId, {
        body: JSON.stringify({
          // Manual practice and reading positions have typed owners. Only this
          // historical listened metadata still belongs to aggregate writes.
          listened_history: snapshot.listenedHistory,
          sync_tombstones: snapshot.syncTombstones ? {
            listened_history: snapshot.syncTombstones.listenedHistory,
          } : undefined,
        }),
        headers: {
          'content-type': 'application/json',
        },
        method: 'PUT'
      });
      if (!response.ok) {
        throw new Error(`sync_${response.status}`);
      }
      if (deferredPushVersion === capturedPushVersion && deferredPushPrincipalId === userId) {
        deferredPushPrincipalId = null;
      }
    }
  });

  const selectSession = (session: PracticeSyncSession) => {
    const nextPrincipalId = session.authenticated ? session.user?.id ?? null : null;
    if (currentPrincipalId !== nextPrincipalId) {
      deferredPushPrincipalId = null;
      deferredPullPrincipalId = null;
      drainingGeneration = null;
      activePull = null;
      if (currentPrincipalId) coordinator.cancelPending(currentPrincipalId);
      generation += 1;
      transportController.abort();
      transportController = new AbortController();
    }
    currentPrincipalId = nextPrincipalId;
    currentCsrfToken = session.csrfToken;
  };

  const pullCurrent = (userId: string): Promise<PracticeLog[] | null> => {
    if (activePull?.principalId === userId && activePull.generation === generation) return activePull.promise;
    const capturedGeneration = generation;
    const promise = (async () => {
      try {
        const snapshot = await coordinator.pull(userId);
        return capturedGeneration === generation && snapshot ? normalizePracticeLogs(snapshot.practiceLogs) : null;
      } catch (cause) {
        if (capturedGeneration !== generation) return null;
        if (cause instanceof Error && cause.message === pendingCredentials) return null;
        throw cause;
      }
    })();
    const operation = { principalId: userId, generation: capturedGeneration, promise };
    activePull = operation;
    const clear = () => { if (activePull === operation) activePull = null; };
    void promise.then(clear, clear);
    return promise;
  };

  const drainDeferredWork = () => {
    const userId = currentPrincipalId;
    if (!userId || !hasUsableBrowserCsrf(currentCsrfToken) || drainingGeneration === generation
      || (deferredPullPrincipalId !== userId && deferredPushPrincipalId !== userId)) return;
    const capturedGeneration = generation;
    drainingGeneration = capturedGeneration;
    let pulling = false;
    let failed = false;
    // Nhường cùng lượt sự kiện để route pull dùng chung request, rồi mới gửi bản local mới nhất.
    void Promise.resolve().then(async () => {
      if (capturedGeneration !== generation || userId !== currentPrincipalId || !hasUsableBrowserCsrf(currentCsrfToken)) return;
      if (deferredPullPrincipalId === userId) {
        deferredPullPrincipalId = null;
        pulling = true;
        await pullCurrent(userId);
        pulling = false;
      } else if (activePull?.principalId === userId) {
        await activePull.promise;
      }
      if (capturedGeneration === generation && userId === currentPrincipalId
        && hasUsableBrowserCsrf(currentCsrfToken) && deferredPushPrincipalId === userId) {
        await coordinator.push(userId);
      }
    }).catch(() => {
      failed = true;
      if (capturedGeneration === generation && userId === currentPrincipalId && pulling) deferredPullPrincipalId = userId;
    }).finally(() => {
      if (drainingGeneration === capturedGeneration) drainingGeneration = null;
      if (!failed && capturedGeneration === generation && userId === currentPrincipalId) drainDeferredWork();
    });
  };

  return {
    async pull(session: PracticeSyncSession): Promise<PracticeLog[] | null> {
      selectSession(session);
      if (!session.authenticated || !session.user?.id) return null;
      if (!hasUsableBrowserCsrf(currentCsrfToken)) {
        deferredPullPrincipalId = session.user.id;
        return null;
      }
      deferredPullPrincipalId = null;
      return pullCurrent(session.user.id);
    },
    setCsrfToken(token: string | null): void {
      currentCsrfToken = token;
      drainDeferredWork();
    },
    setSession(session: PracticeSyncSession): void {
      selectSession(session);
      drainDeferredWork();
    },
    async push(session: PracticeSyncSession): Promise<void> {
      selectSession(session);
      if (!session.authenticated || !session.user?.id) return;
      if (!hasUsableBrowserCsrf(currentCsrfToken)) {
        deferredPushPrincipalId = session.user.id;
        deferredPushVersion += 1;
        return;
      }
      deferredPushPrincipalId = null;
      try {
        await coordinator.push(session.user.id);
      } catch (cause) {
        if (cause instanceof Error && cause.message === pendingCredentials) return;
        throw cause;
      }
    }
  };
}

function normalizeDeletionEntries(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const record = entry as Record<string, unknown>;
    if (typeof record.key !== 'string') return [];
    return [{ key: record.key, deletedAt: deletionTimestamp(record.deletedAt) }];
  });
}

function deletionTimestamp(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function createManualPracticeLog(input: {
  count: number;
  date: string;
  id?: number;
  note?: string;
  type: PracticeType;
}) {
  return createPracticeLog(input);
}
