import { beforeEach, describe, expect, it } from 'vitest';

import {
  ALBUM_POSITION_PREFIX,
  AUDIO_LIBRARY_TOMBSTONES_KEY,
  RECENT_ALBUMS_KEY,
  applyRemotePlayerSync,
  captureAudioLibraryStorageSnapshot,
  pushRecentAlbum,
  readPlayerSyncPayload,
  readStoredAlbumPosition,
  readStoredLibrary,
  readStoredPlayerState,
  readStoredRecentAlbums,
  restoreAudioLibraryStorageSnapshotIfUnchanged,
  selectAudioSyncPrincipal,
  setStoredLibraryMembership,
  writeStoredAlbumPosition,
  writeStoredPlayerState,
} from '$lib/browser/audio-sync';
import { createPrincipalStorage } from '$lib/browser/principal-storage';

function createStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
  };
}

describe('audio sync storage contract', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { dispatchEvent: () => undefined },
    });
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: createStorage(),
    });
    selectAudioSyncPrincipal(null);
  });

  it('deduplicates recent albums and caps the list at ten entries', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k'];
    for (const id of ids) pushRecentAlbum(id);
    pushRecentAlbum('f');

    expect(readStoredRecentAlbums()).toEqual([
      'f', 'k', 'j', 'i', 'h', 'g', 'e', 'd', 'c', 'b',
    ]);
  });

  it.each([null, {}, 42, 'album-a'])('ignores malformed recent-album shape %j without clearing stored data', (value) => {
    selectAudioSyncPrincipal('user-a');
    const storage = createPrincipalStorage(localStorage, 'user-a');
    const raw = JSON.stringify(value);
    storage.setItem(RECENT_ALBUMS_KEY, raw);

    expect(readStoredRecentAlbums()).toEqual([]);
    expect(readPlayerSyncPayload().pt_recent_albums).toEqual([]);
    expect(storage.getItem(RECENT_ALBUMS_KEY)).toBe(raw);
    expect(pushRecentAlbum('new-album')).toEqual(['new-album']);
  });

  it.each([null, { pt_favorite_albums: {} }, { pt_favorite_albums: [null, 42, { key: 'bad' }] }])(
    'ignores malformed tombstone shape %j while keeping valid library entries', (value) => {
      selectAudioSyncPrincipal('user-a');
      setStoredLibraryMembership('favorite', 'kept-album', true, 100);
      const storage = createPrincipalStorage(localStorage, 'user-a');
      const raw = JSON.stringify(value);
      storage.setItem(AUDIO_LIBRARY_TOMBSTONES_KEY, raw);

      expect(readPlayerSyncPayload().pt_favorite_albums).toEqual([{ albumId: 'kept-album', savedAt: 100 }]);
      expect(readPlayerSyncPayload().sync_tombstones).toBeUndefined();
      expect(storage.getItem(AUDIO_LIBRARY_TOMBSTONES_KEY)).toBe(raw);
      expect(() => setStoredLibraryMembership('listen_later', 'later-album', true, 200)).not.toThrow();
      expect(() => applyRemotePlayerSync({ pt_player_state: null, pt_album_positions: {}, pt_recent_albums: [] })).not.toThrow();
      expect(readStoredLibrary('favorite')).toEqual([{ albumId: 'kept-album', savedAt: 100 }]);
    },
  );

  it('retains valid local and remote tombstones alongside malformed entries to prevent resurrection', () => {
    selectAudioSyncPrincipal('user-a');
    const storage = createPrincipalStorage(localStorage, 'user-a');
    storage.setItem(AUDIO_LIBRARY_TOMBSTONES_KEY, JSON.stringify({
      pt_favorite_albums: [null, { key: 'albumId:removed-local', deletedAt: 200 }],
    }));
    applyRemotePlayerSync({
      pt_player_state: null, pt_album_positions: {}, pt_recent_albums: [],
      pt_favorite_albums: [{ albumId: 'removed-local', savedAt: 100 }, { albumId: 'removed-remote', savedAt: 100 }],
      sync_tombstones: {
        pt_favorite_albums: [null, { key: 'albumId:removed-remote', deletedAt: 300 }] as unknown as Array<{ key: string; deletedAt: number }>,
      },
    });
    expect(readStoredLibrary('favorite')).toEqual([]);
    expect(readPlayerSyncPayload().sync_tombstones?.pt_favorite_albums).toEqual([
      { key: 'albumId:removed-local', deletedAt: 200 }, { key: 'albumId:removed-remote', deletedAt: 300 },
    ]);
  });

  it('applies newer remote state and preserves newer local positions', () => {
    writeStoredPlayerState({
      albumId: 'local-album',
      trackIndex: 1,
      pos: 12,
      savedAt: 100,
      trackTitle: 'Local',
    });
    writeStoredAlbumPosition({
      albumId: 'album-a',
      trackIndex: 0,
      pos: 33,
      savedAt: 500,
      trackTitle: 'Giữ local',
    });

    const payload = applyRemotePlayerSync({
      pt_player_state: {
        albumId: 'remote-album',
        trackIndex: 2,
        pos: 45,
        savedAt: 300,
        trackTitle: 'Remote',
      },
      pt_album_positions: {
        'album-a': {
          albumId: 'album-a',
          trackIndex: 0,
          pos: 20,
          savedAt: 200,
          trackTitle: 'Cũ hơn local',
        },
        'album-b': {
          albumId: 'album-b',
          trackIndex: 1,
          pos: 90,
          savedAt: 250,
          trackTitle: 'Mới từ cloud',
        },
      },
      pt_recent_albums: ['remote-album', 'album-b'],
    });

    expect(readStoredPlayerState()).toEqual(
      expect.objectContaining({ albumId: 'remote-album', savedAt: 300 }),
    );
    expect(readStoredAlbumPosition('album-a')).toEqual(
      expect.objectContaining({ pos: 33, savedAt: 500 }),
    );
    expect(readStoredAlbumPosition('album-b')).toEqual(
      expect.objectContaining({ pos: 90, savedAt: 250 }),
    );
    expect(payload).toEqual(expect.objectContaining({
      pt_recent_albums: ['remote-album', 'album-b'],
    }));
    expect(readPlayerSyncPayload().pt_recent_albums).toEqual(['remote-album', 'album-b']);
  });

  it('isolates personal collections when the active session principal changes', () => {
    selectAudioSyncPrincipal('user-a');
    setStoredLibraryMembership('favorite', 'album-a', true, 100);
    setStoredLibraryMembership('listen_later', 'album-later', true, 110);

    selectAudioSyncPrincipal('user-b');
    expect(readStoredLibrary('favorite')).toEqual([]);
    setStoredLibraryMembership('favorite', 'album-b', true, 200);

    selectAudioSyncPrincipal('user-a');
    expect(readStoredLibrary('favorite')).toEqual([{ albumId: 'album-a', savedAt: 100 }]);
    expect(readStoredLibrary('listen_later')).toEqual([{ albumId: 'album-later', savedAt: 110 }]);
  });

  it.each([
    { action: 'add', initiallyIncluded: false },
    { action: 'remove', initiallyIncluded: true },
  ])('rolls back an unsent account-A $action without touching account B', ({ initiallyIncluded }) => {
    selectAudioSyncPrincipal('user-a');
    if (initiallyIncluded) setStoredLibraryMembership('favorite', 'album-a', true, 100);
    const previous = captureAudioLibraryStorageSnapshot(localStorage, 'user-a');
    setStoredLibraryMembership('favorite', 'album-a', !initiallyIncluded, 200);
    const optimistic = captureAudioLibraryStorageSnapshot(localStorage, 'user-a');

    selectAudioSyncPrincipal('user-b');
    setStoredLibraryMembership('favorite', 'album-b', true, 300);
    expect(restoreAudioLibraryStorageSnapshotIfUnchanged(
      localStorage, 'user-a', optimistic, previous,
    )).toBe(true);
    expect(readStoredLibrary('favorite')).toEqual([{ albumId: 'album-b', savedAt: 300 }]);

    selectAudioSyncPrincipal('user-a');
    expect(readStoredLibrary('favorite')).toEqual(initiallyIncluded
      ? [{ albumId: 'album-a', savedAt: 100 }]
      : []);
    expect(readPlayerSyncPayload().sync_tombstones?.pt_favorite_albums ?? []).toEqual([]);
  });

  it('does not let an old account-A rollback overwrite a newer account-A mutation', () => {
    selectAudioSyncPrincipal('user-a');
    const previous = captureAudioLibraryStorageSnapshot(localStorage, 'user-a');
    setStoredLibraryMembership('favorite', 'album-a', true, 100);
    const optimistic = captureAudioLibraryStorageSnapshot(localStorage, 'user-a');
    selectAudioSyncPrincipal('user-b');
    selectAudioSyncPrincipal('user-a');
    setStoredLibraryMembership('favorite', 'album-newer', true, 200);

    expect(restoreAudioLibraryStorageSnapshotIfUnchanged(
      localStorage, 'user-a', optimistic, previous,
    )).toBe(false);
    expect(readStoredLibrary('favorite').map((item) => item.albumId)).toEqual(['album-newer', 'album-a']);
  });

  it('applies legacy string collection records with a deterministic shape', () => {
    selectAudioSyncPrincipal('user-a');
    applyRemotePlayerSync({
      pt_player_state: null,
      pt_album_positions: {},
      pt_recent_albums: [],
      pt_favorite_albums: ['legacy-album' as unknown as { albumId: string; savedAt: number }],
      pt_listen_later_albums: [],
    });

    expect(readStoredLibrary('favorite')).toEqual([{ albumId: 'legacy-album', savedAt: 0 }]);
  });

  it('applies cross-device collection tombstones returned with ISO timestamps', () => {
    selectAudioSyncPrincipal('user-a');
    setStoredLibraryMembership('favorite', 'album-a', true, 100);
    applyRemotePlayerSync({
      pt_player_state: null,
      pt_album_positions: {},
      pt_recent_albums: [],
      pt_favorite_albums: [],
      pt_listen_later_albums: [],
      sync_tombstones: {
        pt_favorite_albums: [{ key: 'albumId:album-a', deletedAt: '2026-09-04T00:00:00.000Z' }],
      },
    });

    expect(readStoredLibrary('favorite')).toEqual([]);
  });

  it('keeps a newer local removal when a delayed remote snapshot still contains the album', () => {
    selectAudioSyncPrincipal('user-a');
    setStoredLibraryMembership('favorite', 'album-a', true, 100);
    setStoredLibraryMembership('favorite', 'album-a', false, 200);

    applyRemotePlayerSync({
      pt_player_state: null,
      pt_album_positions: {},
      pt_recent_albums: [],
      pt_favorite_albums: [{ albumId: 'album-a', savedAt: 100 }],
      pt_listen_later_albums: [],
    });

    expect(readStoredLibrary('favorite')).toEqual([]);
    expect(readPlayerSyncPayload().sync_tombstones?.pt_favorite_albums).toEqual([
      { key: 'albumId:album-a', deletedAt: 200 },
    ]);
  });

  it('rolls back collection membership when the matching tombstone write fails', () => {
    selectAudioSyncPrincipal('user-a');
    setStoredLibraryMembership('favorite', 'album-a', true, 100);
    const baseStorage = localStorage;
    let failTombstoneWrite = true;
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        get length() { return baseStorage.length; },
        getItem: (key: string) => baseStorage.getItem(key),
        key: (index: number) => baseStorage.key(index),
        removeItem: (key: string) => baseStorage.removeItem(key),
        setItem: (key: string, value: string) => {
          if (failTombstoneWrite && key.endsWith(AUDIO_LIBRARY_TOMBSTONES_KEY)) {
            failTombstoneWrite = false;
            throw new Error('quota_exceeded');
          }
          baseStorage.setItem(key, value);
        },
      },
    });

    expect(() => setStoredLibraryMembership('favorite', 'album-a', false, 200))
      .toThrow('quota_exceeded');
    expect(readStoredLibrary('favorite')).toEqual([{ albumId: 'album-a', savedAt: 100 }]);
    expect(readPlayerSyncPayload().sync_tombstones?.pt_favorite_albums ?? []).toEqual([]);
  });
});
