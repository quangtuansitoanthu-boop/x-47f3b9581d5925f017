import { describe, expect, it, vi } from 'vitest';

import {
  createCloudSyncCoordinator,
} from '../../src/lib/browser/cloud-sync-coordinator';
import { createPrincipalStorage } from '../../src/lib/browser/principal-storage';
import {
  applyAggregateSyncSnapshot,
  LEGACY_LOCAL_STORAGE_KEYS,
  LEGACY_LOCAL_STORAGE_PREFIXES,
  readAggregateSyncSnapshot,
  type StorageLike,
} from '../../src/lib/browser/storage-contract';

class MemoryStorage implements StorageLike {
  #items = new Map<string, string>();

  get length() {
    return this.#items.size;
  }

  getItem(key: string) {
    return this.#items.get(key) ?? null;
  }

  key(index: number) {
    return [...this.#items.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.#items.delete(key);
  }

  setItem(key: string, value: string) {
    this.#items.set(key, value);
  }
}

describe('legacy storage sync contract', () => {
  it('invalidates late pull work before fallback, local apply, or a follow-up push', async () => {
    const storage = new MemoryStorage();
    const scoped = createPrincipalStorage(storage, 'user-a');
    scoped.setItem(LEGACY_LOCAL_STORAGE_KEYS.bookmarks, '[{"id":"local"}]');
    let release = (_value: ReturnType<typeof readAggregateSyncSnapshot> | null) => {};
    const delayed = new Promise<ReturnType<typeof readAggregateSyncSnapshot> | null>((resolve) => { release = resolve; });
    const fallback = vi.fn(async () => null);
    const push = vi.fn(async () => {});
    const coordinator = createCloudSyncCoordinator(storage, { pull: () => delayed, pullPlayerFallback: fallback, push });
    const pending = coordinator.pull('user-a');
    coordinator.cancelPending('user-a');
    release({ ...readAggregateSyncSnapshot(scoped), bookmarks: [{ id: 'remote' }] });
    await expect(pending).resolves.toBeNull();
    expect(scoped.getItem(LEGACY_LOCAL_STORAGE_KEYS.bookmarks)).toBe('[{"id":"local"}]');
    expect(push).not.toHaveBeenCalled();
    expect(fallback).not.toHaveBeenCalled();
  });

  it('does not let an invalidated push response overwrite a new same-owner baseline', async () => {
    const storage = new MemoryStorage();
    const scoped = createPrincipalStorage(storage, 'user-a');
    scoped.setItem(LEGACY_LOCAL_STORAGE_KEYS.bookmarks, '[{"id":"old"}]');
    let release = () => {};
    const delayed = new Promise<void>((resolve) => { release = resolve; });
    const coordinator = createCloudSyncCoordinator(storage, {
      pull: async () => readAggregateSyncSnapshot(scoped),
      push: async () => delayed,
    });
    const pending = coordinator.push('user-a');
    const rejected = expect(pending).rejects.toThrow('sync_principal_changed');
    coordinator.cancelPending('user-a');
    scoped.setItem(LEGACY_LOCAL_STORAGE_KEYS.bookmarks, '[{"id":"new"}]');
    await coordinator.pull('user-a');
    release();
    await rejected;
    expect(JSON.parse(scoped.getItem('quangtu_sync_baseline_v1') || '{}').bookmarks).toEqual([{ id: 'new' }]);
  });

  it('invalidates a fallback that was already in flight before cancellation', async () => {
    const storage = new MemoryStorage();
    let release = (_value: { ptAlbumPositions: {}; ptPlayerState: { trackId: string }; ptRecentAlbums: [] }) => {};
    const delayed = new Promise<{ ptAlbumPositions: {}; ptPlayerState: { trackId: string }; ptRecentAlbums: [] }>((resolve) => { release = resolve; });
    let started = () => {};
    const fallbackStarted = new Promise<void>((resolve) => { started = resolve; });
    const push = vi.fn(async () => {});
    const coordinator = createCloudSyncCoordinator(storage, {
      pull: async () => null,
      pullPlayerFallback: async () => { started(); return delayed; },
      push,
    });
    const pending = coordinator.pull('user-a');
    await fallbackStarted;
    coordinator.cancelPending('user-a');
    release({ ptAlbumPositions: {}, ptPlayerState: { trackId: 'old-player' }, ptRecentAlbums: [] });
    await expect(pending).resolves.toBeNull();
    expect(createPrincipalStorage(storage, 'user-a').getItem(LEGACY_LOCAL_STORAGE_KEYS.talkPlayerState)).toBeNull();
    expect(push).not.toHaveBeenCalled();
  });

  it('reads exact aggregate keys and dynamic album positions', () => {
    const storage = new MemoryStorage();

    storage.setItem(LEGACY_LOCAL_STORAGE_KEYS.practiceLogs, JSON.stringify([{ date: '2026-07-31' }]));
    storage.setItem(LEGACY_LOCAL_STORAGE_KEYS.bookmarks, JSON.stringify([{ articleId: 'tt_1' }]));
    storage.setItem(LEGACY_LOCAL_STORAGE_KEYS.listenedAlbums, JSON.stringify(['pt_1']));
    storage.setItem(LEGACY_LOCAL_STORAGE_KEYS.talkPlayerState, JSON.stringify({ savedAt: 10, trackId: 'a' }));
    storage.setItem(LEGACY_LOCAL_STORAGE_KEYS.recentAlbums, JSON.stringify(['album-a']));
    storage.setItem(`${LEGACY_LOCAL_STORAGE_PREFIXES.talkAlbumPosition}album-a`, JSON.stringify({ savedAt: 12 }));

    expect(readAggregateSyncSnapshot(storage)).toEqual({
      bookmarks: [{ articleId: 'tt_1' }],
      listenedHistory: ['pt_1'],
      practiceLogs: [{ date: '2026-07-31' }],
      ptAlbumPositions: { 'album-a': { savedAt: 12 } },
      ptPlayerState: { savedAt: 10, trackId: 'a' },
      ptRecentAlbums: ['album-a'],
    });
  });

  it('applies cloud snapshots with legacy merge rules', () => {
    const storage = new MemoryStorage();

    storage.setItem(LEGACY_LOCAL_STORAGE_KEYS.practiceLogs, JSON.stringify([{ date: '2026-07-31' }, { date: '2026-07-30' }]));
    storage.setItem(LEGACY_LOCAL_STORAGE_KEYS.bookmarks, JSON.stringify([{ articleId: 'local-only' }]));
    storage.setItem(LEGACY_LOCAL_STORAGE_KEYS.listenedAlbums, JSON.stringify(['pt_local']));
    storage.setItem(LEGACY_LOCAL_STORAGE_KEYS.talkPlayerState, JSON.stringify({ savedAt: 20, trackId: 'local' }));
    storage.setItem(`${LEGACY_LOCAL_STORAGE_PREFIXES.talkAlbumPosition}album-a`, JSON.stringify({ savedAt: 30, progress: 0.8 }));

    const merged = applyAggregateSyncSnapshot(storage, {
      bookmarks: [{ articleId: 'cloud-1' }, { articleId: 'cloud-2' }],
      listenedHistory: ['pt_cloud'],
      practiceLogs: [{ date: '2026-07-31' }],
      ptAlbumPositions: {
        'album-a': { progress: 0.3, savedAt: 25 },
        'album-b': { progress: 0.6, savedAt: 40 },
      },
      ptPlayerState: { savedAt: 10, trackId: 'cloud' },
      ptRecentAlbums: ['album-b'],
    });

    expect(merged.practiceLogs).toEqual([{ date: '2026-07-31' }, { date: '2026-07-30' }]);
    expect(merged.bookmarks).toEqual([
      { articleId: 'cloud-1' },
      { articleId: 'cloud-2' },
      { articleId: 'local-only' },
    ]);
    expect(merged.ptPlayerState).toEqual({ savedAt: 20, trackId: 'local' });
    expect(merged.ptAlbumPositions).toEqual({
      'album-a': { progress: 0.8, savedAt: 30 },
      'album-b': { progress: 0.6, savedAt: 40 },
    });
  });

  it('unions equal-length cloud and local arrays instead of dropping either side', () => {
    const storage = new MemoryStorage();
    storage.setItem(LEGACY_LOCAL_STORAGE_KEYS.bookmarks, JSON.stringify([
      { articleId: 'local-a', savedAt: 10 },
      { articleId: 'shared', savedAt: 20, scrollTop: 20 },
    ]));

    const applied = applyAggregateSyncSnapshot(storage, {
      bookmarks: [
        { articleId: 'cloud-a', savedAt: 30 },
        { articleId: 'shared', savedAt: 40, scrollTop: 40 },
      ],
      listenedHistory: [],
      practiceLogs: [],
      ptAlbumPositions: {},
      ptPlayerState: null,
      ptRecentAlbums: [],
    });

    expect(applied.bookmarks).toEqual([
      expect.objectContaining({ articleId: 'shared', scrollTop: 40 }),
      expect.objectContaining({ articleId: 'cloud-a' }),
      expect.objectContaining({ articleId: 'local-a' }),
    ]);
  });

  it('uses the same canonical tie-break regardless of which device is local', () => {
    const apply = (localScrollTop: number, cloudScrollTop: number) => {
      const storage = new MemoryStorage();
      storage.setItem(LEGACY_LOCAL_STORAGE_KEYS.bookmarks, JSON.stringify([
        { articleId: 'shared', savedAt: 100, scrollTop: localScrollTop },
      ]));
      return applyAggregateSyncSnapshot(storage, {
        bookmarks: [{ articleId: 'shared', savedAt: 100, scrollTop: cloudScrollTop }],
        listenedHistory: [], practiceLogs: [], ptAlbumPositions: {}, ptPlayerState: null, ptRecentAlbums: [],
      }).bookmarks;
    };

    expect(apply(20, 40)).toEqual([expect.objectContaining({ scrollTop: 40 })]);
    expect(apply(40, 20)).toEqual([expect.objectContaining({ scrollTop: 40 })]);
  });

  it('uses one coordinator for aggregate sync and player fallback', async () => {
    const storage = new MemoryStorage();
    const userStorage = createPrincipalStorage(storage, 'user-1');
    userStorage.setItem(LEGACY_LOCAL_STORAGE_KEYS.practiceLogs, JSON.stringify([{ date: '2026-07-31' }]));

    let pushedSnapshot: ReturnType<typeof readAggregateSyncSnapshot> | null = null;

    const coordinator = createCloudSyncCoordinator(storage, {
      async pull() {
        return null;
      },
      async pullPlayerFallback() {
        return {
          ptAlbumPositions: { 'album-c': { savedAt: 2, progress: 0.2 } },
          ptPlayerState: { savedAt: 3, trackId: 'cloud-fallback' },
          ptRecentAlbums: ['album-c'],
        };
      },
      async push(_userId, snapshot) {
        pushedSnapshot = snapshot;
      },
    });

    const pulled = await coordinator.pull('user-1');
    const pushed = await coordinator.push('user-1');

    expect(pulled?.ptPlayerState).toEqual({ savedAt: 3, trackId: 'cloud-fallback' });
    expect(pushedSnapshot).toEqual(pushed);
    expect(pushed.practiceLogs).toEqual([{ date: '2026-07-31' }]);
  });

  it('pushes local-only aggregate data during the initial cloud pull', async () => {
    const storage = new MemoryStorage();
    const userStorage = createPrincipalStorage(storage, 'user-1');
    userStorage.setItem(LEGACY_LOCAL_STORAGE_KEYS.practiceLogs, JSON.stringify([
      { id: 1, date: '2026-08-01', savedAt: 10 },
    ]));
    userStorage.setItem(LEGACY_LOCAL_STORAGE_KEYS.bookmarks, JSON.stringify([
      { articleId: 'local-bookmark', savedAt: 11 },
    ]));
    userStorage.setItem(LEGACY_LOCAL_STORAGE_KEYS.listenedAlbums, JSON.stringify([
      { albumId: 'local-album', savedAt: 12 },
    ]));

    const pushedSnapshots: ReturnType<typeof readAggregateSyncSnapshot>[] = [];
    const coordinator = createCloudSyncCoordinator(storage, {
      async pull() {
        return {
          bookmarks: [{ articleId: 'cloud-bookmark', savedAt: 20 }],
          listenedHistory: [],
          practiceLogs: [],
          ptAlbumPositions: {},
          ptPlayerState: null,
          ptRecentAlbums: [],
        };
      },
      async push(_userId, snapshot) {
        pushedSnapshots.push(snapshot);
      },
    });

    const pulled = await coordinator.pull('user-1');

    expect(pulled).toMatchObject({
      practiceLogs: [{ id: 1, date: '2026-08-01', savedAt: 10 }],
      listenedHistory: [{ albumId: 'local-album', savedAt: 12 }],
    });
    expect(pulled?.bookmarks).toEqual(expect.arrayContaining([
      { articleId: 'cloud-bookmark', savedAt: 20 },
      { articleId: 'local-bookmark', savedAt: 11 },
    ]));
    expect(pushedSnapshots).toHaveLength(1);
    expect(pushedSnapshots[0]).toEqual(pulled);
    expect(pushedSnapshots[0].syncTombstones).toBeUndefined();
  });

  it('emits durable tombstones for local deletion and applies cloud tombstones over longer local arrays', async () => {
    const storage = new MemoryStorage();
    const userStorage = createPrincipalStorage(storage, 'user-1');
    userStorage.setItem(LEGACY_LOCAL_STORAGE_KEYS.practiceLogs, JSON.stringify([
      { id: 1, date: '2026-07-31' },
      { id: 2, date: '2026-07-30' },
    ]));
    let pushedSnapshot: ReturnType<typeof readAggregateSyncSnapshot> | null = null;
    const coordinator = createCloudSyncCoordinator(storage, {
      async pull() {
        return readAggregateSyncSnapshot(userStorage);
      },
      async push(_userId, snapshot) {
        pushedSnapshot = snapshot;
      },
    });

    await coordinator.pull('user-1');
    userStorage.setItem(LEGACY_LOCAL_STORAGE_KEYS.practiceLogs, JSON.stringify([
      { id: 2, date: '2026-07-30' },
    ]));
    await coordinator.push('user-1');

    expect(
      (pushedSnapshot as ReturnType<typeof readAggregateSyncSnapshot> | null)
        ?.syncTombstones?.practiceLogs,
    ).toEqual([expect.objectContaining({ key: 'id:1' })]);

    userStorage.setItem(LEGACY_LOCAL_STORAGE_KEYS.practiceLogs, JSON.stringify([
      { id: 1, date: '2026-07-31' },
      { id: 2, date: '2026-07-30' },
    ]));
    const applied = applyAggregateSyncSnapshot(userStorage, {
      ...readAggregateSyncSnapshot(userStorage),
      syncTombstones: {
        practiceLogs: [{ deletedAt: Date.now(), key: 'id:1' }],
      },
    });
    expect(applied.practiceLogs).toEqual([{ id: 2, date: '2026-07-30' }]);
  });

  it('keeps user B isolated and unblocked while user A has a push in flight', async () => {
    const storage = new MemoryStorage();
    const userAStorage = createPrincipalStorage(storage, 'user-a');
    const userBStorage = createPrincipalStorage(storage, 'user-b');
    userAStorage.setItem(LEGACY_LOCAL_STORAGE_KEYS.practiceLogs, JSON.stringify([{ id: 'a-log' }]));
    userBStorage.setItem(LEGACY_LOCAL_STORAGE_KEYS.practiceLogs, JSON.stringify([{ id: 'b-log' }]));

    let releaseUserA = () => {};
    const userAGate = new Promise<void>((resolve) => { releaseUserA = resolve; });
    let signalUserAStarted = () => {};
    const userAStarted = new Promise<void>((resolve) => { signalUserAStarted = resolve; });
    const pushed = new Map<string, ReturnType<typeof readAggregateSyncSnapshot>>();
    const coordinator = createCloudSyncCoordinator(storage, {
      async pull() {
        return null;
      },
      async push(userId, snapshot) {
        pushed.set(userId, snapshot);
        if (userId === 'user-a') {
          signalUserAStarted();
          await userAGate;
        }
      },
    });

    let userASettled = false;
    const userAPush = coordinator.push('user-a').then((snapshot) => {
      userASettled = true;
      return snapshot;
    });
    await userAStarted;
    await coordinator.push('user-b');

    expect(userASettled).toBe(false);
    expect(pushed.get('user-a')?.practiceLogs).toEqual([{ id: 'a-log' }]);
    expect(pushed.get('user-b')?.practiceLogs).toEqual([{ id: 'b-log' }]);
    releaseUserA();
    await userAPush;
  });
});
