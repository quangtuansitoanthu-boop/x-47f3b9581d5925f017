import { createPrincipalStorage, copyLegacyKeysToAnonymousNamespace } from './principal-storage';
import { LEGACY_LOCAL_STORAGE_KEYS, LEGACY_LOCAL_STORAGE_PREFIXES, type StorageLike } from './storage-contract';

export const PLAYER_STATE_KEY = 'tutam_pt_state';
export const RECENT_ALBUMS_KEY = 'tutam_recent_albums';
export const FAVORITE_ALBUMS_KEY = 'tutam_favorite_albums';
export const LISTEN_LATER_ALBUMS_KEY = 'tutam_listen_later_albums';
export const AUDIO_LIBRARY_TOMBSTONES_KEY = 'tutam_audio_library_tombstones';
export const ALBUM_POSITION_PREFIX = 'tutam_pt_pos_';
const RECENT_LIMIT = 10;

export type AudioLibraryCollection = 'favorite' | 'listen_later';

export interface StoredPlayerState {
  albumId: string;
  trackIndex: number;
  pos: number;
  savedAt: number;
  albumTitle?: string;
  trackTitle?: string;
  trackUrl?: string;
  artwork?: string;
  description?: string;
}
export interface StoredAlbumPosition extends StoredPlayerState {}
export interface StoredLibraryAlbum { albumId: string; savedAt: number; }

interface LibraryTombstones {
  pt_favorite_albums?: Array<{ key: string; deletedAt: number | string }>;
  pt_listen_later_albums?: Array<{ key: string; deletedAt: number | string }>;
}

export interface AudioLibraryStorageSnapshot {
  favoriteAlbums: string | null;
  listenLaterAlbums: string | null;
  tombstones: string | null;
}

export interface PlayerSyncPayload {
  pt_player_state: StoredPlayerState | null;
  pt_album_positions: Record<string, StoredAlbumPosition>;
  pt_recent_albums: string[];
  pt_favorite_albums?: StoredLibraryAlbum[];
  pt_listen_later_albums?: StoredLibraryAlbum[];
  sync_tombstones?: LibraryTombstones;
  updated_at?: string | null;
}

let activePrincipalId: string | null = null;
let legacyCopied = false;

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

function browserStorage(): StorageLike | null {
  if (!isBrowser()) return null;
  if (!legacyCopied) {
    copyLegacyKeysToAnonymousNamespace(localStorage, Object.values(LEGACY_LOCAL_STORAGE_KEYS), Object.values(LEGACY_LOCAL_STORAGE_PREFIXES));
    legacyCopied = true;
  }
  return createPrincipalStorage(localStorage, activePrincipalId);
}

export function selectAudioSyncPrincipal(principalId: string | null | undefined): void {
  activePrincipalId = String(principalId ?? '').trim() || null;
}

export function captureAudioLibraryStorageSnapshot(
  storage: StorageLike,
  principalId: string | null | undefined,
): AudioLibraryStorageSnapshot {
  const scoped = createPrincipalStorage(storage, principalId);
  return {
    favoriteAlbums: scoped.getItem(FAVORITE_ALBUMS_KEY),
    listenLaterAlbums: scoped.getItem(LISTEN_LATER_ALBUMS_KEY),
    tombstones: scoped.getItem(AUDIO_LIBRARY_TOMBSTONES_KEY),
  };
}

export function restoreAudioLibraryStorageSnapshotIfUnchanged(
  storage: StorageLike,
  principalId: string | null | undefined,
  expected: AudioLibraryStorageSnapshot,
  previous: AudioLibraryStorageSnapshot,
): boolean {
  const scoped = createPrincipalStorage(storage, principalId);
  const current = captureAudioLibraryStorageSnapshot(storage, principalId);
  if (current.favoriteAlbums !== expected.favoriteAlbums
    || current.listenLaterAlbums !== expected.listenLaterAlbums
    || current.tombstones !== expected.tombstones) {
    return false;
  }
  for (const [key, value] of [
    [FAVORITE_ALBUMS_KEY, previous.favoriteAlbums],
    [LISTEN_LATER_ALBUMS_KEY, previous.listenLaterAlbums],
    [AUDIO_LIBRARY_TOMBSTONES_KEY, previous.tombstones],
  ] as const) {
    if (value === null) {
      if (scoped.removeItem) scoped.removeItem(key);
      else scoped.setItem(key, '');
    } else {
      scoped.setItem(key, value);
    }
  }
  return true;
}

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

function normalizeLibraryItems(value: unknown): StoredLibraryAlbum[] {
  if (!Array.isArray(value)) return [];
  const newest = new Map<string, StoredLibraryAlbum>();
  for (const raw of value) {
    const albumId = typeof raw === 'string' ? raw.trim()
      : raw && typeof raw === 'object' && !Array.isArray(raw)
        ? String((raw as Record<string, unknown>).albumId ?? '').trim() : '';
    if (!albumId) continue;
    const candidate = raw && typeof raw === 'object' && !Array.isArray(raw)
      ? Number((raw as Record<string, unknown>).savedAt ?? 0) : 0;
    const item = { albumId, savedAt: Number.isFinite(candidate) ? candidate : 0 };
    if (!newest.has(albumId) || item.savedAt >= newest.get(albumId)!.savedAt) newest.set(albumId, item);
  }
  return [...newest.values()].sort((left, right) => right.savedAt - left.savedAt || left.albumId.localeCompare(right.albumId));
}

function normalizeLibraryTombstones(value: unknown): LibraryTombstones {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  const result: LibraryTombstones = {};
  for (const field of ['pt_favorite_albums', 'pt_listen_later_albums'] as const) {
    const entries = source[field];
    if (!Array.isArray(entries)) continue;
    result[field] = entries.flatMap((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
      const { key, deletedAt } = entry as Record<string, unknown>;
      return typeof key === 'string' && (typeof deletedAt === 'string'
        || (typeof deletedAt === 'number' && Number.isFinite(deletedAt))) ? [{ key, deletedAt }] : [];
    });
  }
  return result;
}

function deletionTimestamp(value: number | string): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number(value) || 0;
}

function collectionKey(collection: AudioLibraryCollection): string {
  return collection === 'favorite' ? FAVORITE_ALBUMS_KEY : LISTEN_LATER_ALBUMS_KEY;
}
function syncField(collection: AudioLibraryCollection): 'pt_favorite_albums' | 'pt_listen_later_albums' {
  return collection === 'favorite' ? 'pt_favorite_albums' : 'pt_listen_later_albums';
}

export function readStoredPlayerState(): StoredPlayerState | null {
  const storage = browserStorage();
  if (!storage) return null;
  const state = parseJson<StoredPlayerState | null>(storage.getItem(PLAYER_STATE_KEY), null);
  return state && typeof state.albumId === 'string' ? state : null;
}
export function writeStoredPlayerState(state: StoredPlayerState): void {
  browserStorage()?.setItem(PLAYER_STATE_KEY, JSON.stringify(state));
}
export function readStoredRecentAlbums(): string[] {
  const storage = browserStorage();
  if (!storage) return [];
  const values = parseJson<unknown>(storage.getItem(RECENT_ALBUMS_KEY), []);
  return (Array.isArray(values) ? values : [])
    .map((value) => String(value || '').trim()).filter(Boolean).slice(0, RECENT_LIMIT);
}
export function pushRecentAlbum(albumId: string): string[] {
  const storage = browserStorage();
  if (!storage) return [];
  const id = String(albumId || '').trim();
  if (!id) return readStoredRecentAlbums();
  const recent = readStoredRecentAlbums().filter((value) => value !== id);
  recent.unshift(id);
  const trimmed = recent.slice(0, RECENT_LIMIT);
  storage.setItem(RECENT_ALBUMS_KEY, JSON.stringify(trimmed));
  return trimmed;
}

export function readStoredLibrary(collection: AudioLibraryCollection): StoredLibraryAlbum[] {
  const storage = browserStorage();
  return storage ? normalizeLibraryItems(parseJson<unknown>(storage.getItem(collectionKey(collection)), [])) : [];
}

export function setStoredLibraryMembership(
  collection: AudioLibraryCollection,
  albumId: string,
  included: boolean,
  timestamp = Date.now(),
): StoredLibraryAlbum[] {
  const storage = browserStorage();
  if (!storage) return [];
  const id = String(albumId || '').trim();
  if (!id) return readStoredLibrary(collection);
  const field = syncField(collection);
  const itemsKey = collectionKey(collection);
  const previousItems = storage.getItem(itemsKey);
  const previousTombstones = storage.getItem(AUDIO_LIBRARY_TOMBSTONES_KEY);
  const items = readStoredLibrary(collection).filter((item) => item.albumId !== id);
  const tombstones = normalizeLibraryTombstones(parseJson<unknown>(storage.getItem(AUDIO_LIBRARY_TOMBSTONES_KEY), {}));
  if (included) {
    items.unshift({ albumId: id, savedAt: timestamp });
    tombstones[field] = (tombstones[field] ?? []).filter((item) => item.key !== `albumId:${id}`);
  } else {
    tombstones[field] = [...(tombstones[field] ?? []).filter((item) => item.key !== `albumId:${id}`), { key: `albumId:${id}`, deletedAt: timestamp }];
  }
  try {
    storage.setItem(itemsKey, JSON.stringify(items));
    storage.setItem(AUDIO_LIBRARY_TOMBSTONES_KEY, JSON.stringify(tombstones));
  } catch (cause) {
    try {
      if (previousItems === null) storage.removeItem?.(itemsKey);
      else storage.setItem(itemsKey, previousItems);
    } catch {
      // The caller also restores its full optimistic snapshot when possible.
    }
    try {
      if (previousTombstones === null) storage.removeItem?.(AUDIO_LIBRARY_TOMBSTONES_KEY);
      else storage.setItem(AUDIO_LIBRARY_TOMBSTONES_KEY, previousTombstones);
    } catch {
      // Keep the original storage failure as the actionable error.
    }
    throw cause;
  }
  return items;
}

export function replaceStoredLibraryState(payload: Pick<PlayerSyncPayload, 'pt_favorite_albums' | 'pt_listen_later_albums' | 'sync_tombstones'>): void {
  const storage = browserStorage();
  if (!storage) return;
  storage.setItem(FAVORITE_ALBUMS_KEY, JSON.stringify(normalizeLibraryItems(payload.pt_favorite_albums)));
  storage.setItem(LISTEN_LATER_ALBUMS_KEY, JSON.stringify(normalizeLibraryItems(payload.pt_listen_later_albums)));
  storage.setItem(AUDIO_LIBRARY_TOMBSTONES_KEY, JSON.stringify(payload.sync_tombstones ?? {}));
}

export function readStoredAlbumPosition(albumId: string): StoredAlbumPosition | null {
  const storage = browserStorage();
  if (!storage) return null;
  const state = parseJson<StoredAlbumPosition | null>(storage.getItem(`${ALBUM_POSITION_PREFIX}${albumId}`), null);
  return state && typeof state.albumId === 'string' ? state : null;
}
export function writeStoredAlbumPosition(position: StoredAlbumPosition): void {
  browserStorage()?.setItem(`${ALBUM_POSITION_PREFIX}${position.albumId}`, JSON.stringify(position));
}
export function readStoredAlbumPositions(): Record<string, StoredAlbumPosition> {
  const storage = browserStorage();
  if (!storage) return {};
  const positions: Record<string, StoredAlbumPosition> = {};
  for (let index = 0; index < (storage.length ?? 0); index += 1) {
    const key = storage.key?.(index);
    if (!key?.startsWith(ALBUM_POSITION_PREFIX)) continue;
    const position = parseJson<StoredAlbumPosition | null>(storage.getItem(key), null);
    if (position?.albumId) positions[position.albumId] = position;
  }
  return positions;
}

function applyRemoteLibrary(payload: PlayerSyncPayload): void {
  const storage = browserStorage();
  if (!storage) return;
  const remoteTombstones = normalizeLibraryTombstones(payload.sync_tombstones);
  const localTombstones = normalizeLibraryTombstones(parseJson<unknown>(storage.getItem(AUDIO_LIBRARY_TOMBSTONES_KEY), {}));
  const mergedTombstones: LibraryTombstones = {};
  for (const collection of ['favorite', 'listen_later'] as const) {
    const field = syncField(collection);
    const newestDeletion = new Map<string, number>();
    for (const entry of [...(localTombstones[field] ?? []), ...(remoteTombstones[field] ?? [])]) {
      const timestamp = deletionTimestamp(entry.deletedAt);
      if (timestamp >= (newestDeletion.get(entry.key) ?? Number.NEGATIVE_INFINITY)) {
        newestDeletion.set(entry.key, timestamp);
      }
    }
    mergedTombstones[field] = [...newestDeletion.entries()].map(([key, deletedAt]) => ({ key, deletedAt }));
    if (!(field in payload) && !(field in remoteTombstones)) continue;
    const merged = normalizeLibraryItems([...readStoredLibrary(collection), ...normalizeLibraryItems(payload[field])]);
    storage.setItem(collectionKey(collection), JSON.stringify(merged.filter((item) => {
      const key = `albumId:${item.albumId}`;
      return !newestDeletion.has(key) || item.savedAt > Number(newestDeletion.get(key));
    })));
  }
  storage.setItem(AUDIO_LIBRARY_TOMBSTONES_KEY, JSON.stringify(mergedTombstones));
}

export function applyRemotePlayerSync(payload: PlayerSyncPayload | null): PlayerSyncPayload | null {
  const storage = browserStorage();
  if (!payload || !storage) return null;
  const localState = readStoredPlayerState();
  const remoteState = payload.pt_player_state && typeof payload.pt_player_state.albumId === 'string' ? payload.pt_player_state : null;
  if (remoteState && (!localState || Number(remoteState.savedAt || 0) > Number(localState.savedAt || 0))) writeStoredPlayerState(remoteState);
  const localPositions = readStoredAlbumPositions();
  for (const [albumId, remotePosition] of Object.entries(payload.pt_album_positions || {})) {
    const localPosition = localPositions[albumId];
    if (remotePosition?.albumId && (!localPosition || Number(remotePosition.savedAt || 0) > Number(localPosition.savedAt || 0))) writeStoredAlbumPosition(remotePosition);
  }
  const localRecent = readStoredRecentAlbums();
  const remoteRecent = Array.isArray(payload.pt_recent_albums)
    ? payload.pt_recent_albums.map((value) => typeof value === 'string'
      ? value.trim()
      : String((value as unknown as { albumId?: unknown })?.albumId ?? '').trim())
      .filter(Boolean).slice(0, RECENT_LIMIT) : [];
  if (remoteRecent.length >= localRecent.length) storage.setItem(RECENT_ALBUMS_KEY, JSON.stringify(remoteRecent));
  applyRemoteLibrary(payload);
  return { ...readPlayerSyncPayload(), updated_at: payload.updated_at ?? null };
}

export function readPlayerSyncPayload(): PlayerSyncPayload {
  const storage = browserStorage();
  const tombstones = storage ? normalizeLibraryTombstones(parseJson<unknown>(storage.getItem(AUDIO_LIBRARY_TOMBSTONES_KEY), {})) : {};
  return {
    pt_player_state: readStoredPlayerState(),
    pt_album_positions: readStoredAlbumPositions(),
    pt_recent_albums: readStoredRecentAlbums(),
    pt_favorite_albums: readStoredLibrary('favorite'),
    pt_listen_later_albums: readStoredLibrary('listen_later'),
    ...(Object.values(tombstones).some((entries) => entries?.length) ? { sync_tombstones: tombstones } : {}),
  };
}

export function dispatchAudioStorageEvent(
  name: 'quangtu:recent-updated' | 'quangtu:player-sync-updated' | 'quangtu:audio-library-updated', detail: unknown,
): void {
  if (isBrowser()) window.dispatchEvent(new CustomEvent(name, { detail }));
}
