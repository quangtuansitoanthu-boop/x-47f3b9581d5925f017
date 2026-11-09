import {
  applyAggregateSyncSnapshot,
  readAggregateSyncSnapshot,
  type AggregateSyncTombstones,
  type LegacyAggregateSyncSnapshot,
  type StorageLike,
  syncItemKey,
} from './storage-contract';
import { createPrincipalStorage } from './principal-storage';

const SYNC_BASELINE_KEY = 'quangtu_sync_baseline_v1';

export const LEGACY_AGGREGATE_SYNC_OWNER = Object.freeze({
  aggregateTable: 'user_sync_data',
  playerTable: 'pt_player_sync',
  aggregateScope: ['practice_logs', 'bookmarks', 'listened_history'],
  playerScope: ['pt_player_state', 'pt_album_positions', 'pt_recent_albums'],
} as const);

export interface AggregateSyncClient {
  pull(userId: string): Promise<LegacyAggregateSyncSnapshot | null>;
  pullPlayerFallback?(userId: string): Promise<Pick<LegacyAggregateSyncSnapshot, 'ptAlbumPositions' | 'ptPlayerState' | 'ptRecentAlbums'> | null>;
  push(userId: string, snapshot: LegacyAggregateSyncSnapshot): Promise<void>;
}

export function createCloudSyncCoordinator(storage: StorageLike, client: AggregateSyncClient) {
  interface PendingPush {
    rejecters: Array<(reason?: unknown) => void>;
    resolvers: Array<(snapshot: LegacyAggregateSyncSnapshot) => void>;
    userId: string;
  }

  interface PrincipalSyncState {
    pendingPushes: PendingPush[];
    optimisticBaseline: LegacyAggregateSyncSnapshot | null;
    pendingTombstones: AggregateSyncTombstones | undefined;
    pushInProgress: boolean;
    storage: StorageLike;
  }

  const principalStates = new Map<string, PrincipalSyncState>();
  const stateFor = (userId: string): PrincipalSyncState => {
    const current = principalStates.get(userId);
    if (current) return current;
    const scopedStorage = createPrincipalStorage(storage, userId);
    const created: PrincipalSyncState = {
      optimisticBaseline: readBaseline(scopedStorage),
      pendingPushes: [],
      pendingTombstones: undefined,
      pushInProgress: false,
      storage: scopedStorage,
    };
    principalStates.set(userId, created);
    return created;
  };

  const advanceBaseline = (state: PrincipalSyncState, snapshot: LegacyAggregateSyncSnapshot) => {
    state.optimisticBaseline = snapshot;
    storeBaseline(state.storage, snapshot);
  };

  // Each state instance is one principal generation. Retiring it also invalidates
  // continuations already awaiting transport, including a later return to A.
  const isCurrent = (state: PrincipalSyncState, userId: string) => principalStates.get(userId) === state;

  const pushLatestSnapshot = async (state: PrincipalSyncState, userId: string) => {
    const snapshot = readAggregateSyncSnapshot(state.storage);
    const baseline = state.optimisticBaseline ?? readBaseline(state.storage);
    const nextTombstones = baseline ? buildTombstones(baseline, snapshot) : undefined;
    const tombstones = combinePendingTombstones(state.pendingTombstones, nextTombstones, snapshot);
    const outbound = tombstones ? { ...snapshot, syncTombstones: tombstones } : snapshot;

    // Treat an attempted snapshot as the in-memory baseline immediately. A queued
    // deletion must tombstone data from an earlier request even if its response is
    // delayed or the client cannot know whether the server applied it.
    state.optimisticBaseline = snapshot;
    state.pendingTombstones = tombstones;
    await client.push(userId, outbound);
    if (!isCurrent(state, userId)) throw new Error('sync_principal_changed');
    advanceBaseline(state, snapshot);
    state.pendingTombstones = undefined;
    return snapshot;
  };

  const drainPushQueue = async (state: PrincipalSyncState) => {
    if (state.pushInProgress) return;
    state.pushInProgress = true;
    try {
      while (state.pendingPushes.length) {
        const pending = state.pendingPushes.shift()!;
        try {
          const snapshot = await pushLatestSnapshot(state, pending.userId);
          for (const resolve of pending.resolvers) resolve(snapshot);
        } catch (cause) {
          for (const reject of pending.rejecters) reject(cause);
        }
      }
    } finally {
      state.pushInProgress = false;
    }
  };

  const enqueuePush = (userId: string) => new Promise<LegacyAggregateSyncSnapshot>((resolve, reject) => {
    const state = stateFor(userId);
    const coalesced = state.pendingPushes[state.pendingPushes.length - 1];
    if (coalesced?.userId === userId) {
      coalesced.resolvers.push(resolve);
      coalesced.rejecters.push(reject);
    } else {
      state.pendingPushes.push({ userId, resolvers: [resolve], rejecters: [reject] });
    }
    void drainPushQueue(state);
  });

  return {
    async pull(userId: string): Promise<LegacyAggregateSyncSnapshot | null> {
      const state = stateFor(userId);
      const localSnapshot = readAggregateSyncSnapshot(state.storage);
      const aggregateSnapshot = await client.pull(userId);
      if (!isCurrent(state, userId)) return null;

      if (aggregateSnapshot) {
        const applied = applyAggregateSyncSnapshot(state.storage, aggregateSnapshot);
        if (!sameSnapshotContent(aggregateSnapshot, applied)) {
          await client.push(userId, applied);
          if (!isCurrent(state, userId)) return null;
        }
        advanceBaseline(state, applied);
        return applied;
      }

      const playerSnapshot = client.pullPlayerFallback
        ? await client.pullPlayerFallback(userId)
        : null;
      if (!isCurrent(state, userId)) return null;

      if (!playerSnapshot) {
        if (!hasSnapshotContent(localSnapshot)) return null;
        await client.push(userId, localSnapshot);
        if (!isCurrent(state, userId)) return null;
        advanceBaseline(state, localSnapshot);
        return localSnapshot;
      }

      const applied = applyAggregateSyncSnapshot(state.storage, {
        ...localSnapshot,
        ptAlbumPositions: playerSnapshot.ptAlbumPositions,
        ptPlayerState: playerSnapshot.ptPlayerState,
        ptRecentAlbums: playerSnapshot.ptRecentAlbums,
      });
      await client.push(userId, applied);
      if (!isCurrent(state, userId)) return null;
      advanceBaseline(state, applied);
      return applied;
    },

    async push(userId: string): Promise<LegacyAggregateSyncSnapshot> {
      return enqueuePush(userId);
    },

    cancelPending(userId: string, reason = new Error('sync_principal_changed')): void {
      const state = principalStates.get(userId);
      if (!state) return;
      principalStates.delete(userId);
      for (const pending of state.pendingPushes.splice(0)) {
        for (const reject of pending.rejecters) reject(reason);
      }
      state.pendingTombstones = undefined;
    },
  };
}

function combinePendingTombstones(
  pending: AggregateSyncTombstones | undefined,
  next: AggregateSyncTombstones | undefined,
  current: LegacyAggregateSyncSnapshot,
): AggregateSyncTombstones | undefined {
  const combineEntries = (
    previous: AggregateSyncTombstones['practiceLogs'],
    incoming: AggregateSyncTombstones['practiceLogs'],
    presentKeys: Set<string>,
  ) => {
    const combined = new Map<string, number>();
    for (const entry of [...(previous ?? []), ...(incoming ?? [])]) {
      if (!presentKeys.has(entry.key)) {
        combined.set(entry.key, Math.max(combined.get(entry.key) ?? 0, entry.deletedAt));
      }
    }
    return [...combined].map(([key, deletedAt]) => ({ key, deletedAt }));
  };
  const itemKeys = (items: unknown[]) => new Set(items.map(syncItemKey));
  const tombstones: AggregateSyncTombstones = {
    bookmarks: combineEntries(pending?.bookmarks, next?.bookmarks, itemKeys(current.bookmarks)),
    listenedHistory: combineEntries(pending?.listenedHistory, next?.listenedHistory, itemKeys(current.listenedHistory)),
    practiceLogs: combineEntries(pending?.practiceLogs, next?.practiceLogs, itemKeys(current.practiceLogs)),
    ptAlbumPositions: combineEntries(
      pending?.ptAlbumPositions,
      next?.ptAlbumPositions,
      new Set(Object.keys(current.ptAlbumPositions)),
    ),
    ptPlayerState: current.ptPlayerState ? null : newestPlayerTombstone(pending, next),
    ptRecentAlbums: combineEntries(pending?.ptRecentAlbums, next?.ptRecentAlbums, itemKeys(current.ptRecentAlbums)),
  };
  return Object.values(tombstones).some((value) => Array.isArray(value) ? value.length > 0 : Boolean(value))
    ? tombstones
    : undefined;
}

function newestPlayerTombstone(
  pending: AggregateSyncTombstones | undefined,
  next: AggregateSyncTombstones | undefined,
) {
  const deletedAt = Math.max(
    pending?.ptPlayerState?.deletedAt ?? 0,
    next?.ptPlayerState?.deletedAt ?? 0,
  );
  return deletedAt > 0 ? { deletedAt } : null;
}

function hasSnapshotContent(snapshot: LegacyAggregateSyncSnapshot): boolean {
  return snapshot.practiceLogs.length > 0
    || snapshot.bookmarks.length > 0
    || snapshot.listenedHistory.length > 0
    || snapshot.ptRecentAlbums.length > 0
    || Object.keys(snapshot.ptAlbumPositions).length > 0
    || snapshot.ptPlayerState !== null;
}

function sameSnapshotContent(
  left: LegacyAggregateSyncSnapshot,
  right: LegacyAggregateSyncSnapshot,
): boolean {
  return canonicalizeSnapshot(left) === canonicalizeSnapshot(right);
}

function canonicalizeSnapshot(snapshot: LegacyAggregateSyncSnapshot): string {
  return stableCanonicalize({
    bookmarks: snapshot.bookmarks,
    listenedHistory: snapshot.listenedHistory,
    practiceLogs: snapshot.practiceLogs,
    ptAlbumPositions: snapshot.ptAlbumPositions,
    ptPlayerState: snapshot.ptPlayerState,
    ptRecentAlbums: snapshot.ptRecentAlbums,
  });
}

function stableCanonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableCanonicalize).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableCanonicalize(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function buildTombstones(
  baseline: LegacyAggregateSyncSnapshot,
  current: LegacyAggregateSyncSnapshot,
) {
  const deletedAt = Date.now();
  const deleted = (before: unknown[], after: unknown[]) => {
    const currentKeys = new Set(after.map(syncItemKey));
    return before
      .filter((item) => !currentKeys.has(syncItemKey(item)))
      .map((item) => ({ deletedAt, key: syncItemKey(item) }));
  };
  const currentPositionKeys = new Set(Object.keys(current.ptAlbumPositions));
  const tombstones = {
    bookmarks: deleted(baseline.bookmarks, current.bookmarks),
    listenedHistory: deleted(baseline.listenedHistory, current.listenedHistory),
    practiceLogs: deleted(baseline.practiceLogs, current.practiceLogs),
    ptAlbumPositions: Object.keys(baseline.ptAlbumPositions)
      .filter((key) => !currentPositionKeys.has(key))
      .map((key) => ({ deletedAt, key })),
    ptPlayerState: baseline.ptPlayerState && !current.ptPlayerState ? { deletedAt } : null,
    ptRecentAlbums: deleted(baseline.ptRecentAlbums, current.ptRecentAlbums),
  };
  return Object.values(tombstones).some((value) => Array.isArray(value) ? value.length > 0 : Boolean(value))
    ? tombstones
    : undefined;
}

function readBaseline(storage: StorageLike): LegacyAggregateSyncSnapshot | null {
  try {
    const parsed = JSON.parse(storage.getItem(SYNC_BASELINE_KEY) || 'null');
    return parsed && typeof parsed === 'object' ? parsed as LegacyAggregateSyncSnapshot : null;
  } catch {
    return null;
  }
}

function storeBaseline(storage: StorageLike, snapshot: LegacyAggregateSyncSnapshot): void {
  const { syncTombstones: _syncTombstones, ...baseline } = snapshot;
  storage.setItem(SYNC_BASELINE_KEY, JSON.stringify(baseline));
}
