export const DELETED_PRACTICE_LOGS_KEY = 'tt_deleted_practice_logs_v1';

export const LEGACY_LOCAL_STORAGE_KEYS = Object.freeze({
  articleCache: 'tutam_articles_v4',
  bookmarks: 'tutam_bookmarks_v1',
  darkMode: 'tutam_dark_mode',
  listenedAlbums: 'pt_listened_albums',
  pdfBookmarks: 'tutam_pdf_bookmarks_v1',
  practiceBackground: 'tt_practice_bg',
  practiceBold: 'tt_practice_bold',
  practiceFontSize: 'tt_fs',
  practiceLogs: 'tt_practice_logs_v1',
  readerAlignment: 'tutam_read_align',
  readerBackground: 'tutam_read_bg',
  readerBold: 'tutam_read_bold',
  readerFont: 'tutam_read_font',
  readerFontSize: 'tutam_read_fontsize',
  recentAlbums: 'tutam_recent_albums',
  rosaryCount: 'tt_rosary_count',
  rosaryDirection: 'tt_rosary_dir',
  rosarySoundEnabled: 'tt_rosary_sound',
  splitPanePercent: 'tutam_form_left_pct',
  talkPlayerState: 'tutam_pt_state',
  trackerOpen: 'ttTrackerOpen',
  tutapFabPosition: 'ttr_fab_pos',
  tutapLightBackground: 'tt_light_bg',
  tutapReadBackground: 'tt_bg',
  uposathaCollapsedDate: 'tutam_thaptrai_collapsed_date',
  uposathaNotifiedDate: 'tutam_thaptrai_notified_date',
} as const);

export const LEGACY_LOCAL_STORAGE_PREFIXES = Object.freeze({
  talkAlbumPosition: 'tutam_pt_pos_',
} as const);

export const LEGACY_SESSION_STORAGE_KEYS = Object.freeze({
  role: 'tutam_role',
  userId: 'tutam_user',
} as const);

export const LEGACY_INDEXED_DB_CONTRACT = Object.freeze({
  offlineAudio: {
    databaseName: 'tutam_offline_audio',
    stores: {
      albums: { keyPath: 'id' },
      tracks: { keyPath: 'url' },
    },
    version: 1,
  },
} as const);

export interface SyncAlbumPosition {
  savedAt?: number;
  [key: string]: unknown;
}

export interface SyncDeletion {
  deletedAt: number;
  key: string;
}

export interface AggregateSyncTombstones {
  bookmarks?: SyncDeletion[];
  listenedHistory?: SyncDeletion[];
  practiceLogs?: SyncDeletion[];
  ptAlbumPositions?: SyncDeletion[];
  ptPlayerState?: { deletedAt: number } | null;
  ptRecentAlbums?: SyncDeletion[];
}

export interface LegacyAggregateSyncSnapshot {
  bookmarks: unknown[];
  listenedHistory: unknown[];
  practiceLogs: unknown[];
  ptAlbumPositions: Record<string, SyncAlbumPosition>;
  ptPlayerState: Record<string, unknown> | null;
  ptRecentAlbums: unknown[];
  syncTombstones?: AggregateSyncTombstones;
}

export interface StorageLike {
  getItem(key: string): string | null;
  key?(index: number): string | null;
  readonly length?: number;
  removeItem?(key: string): void;
  setItem(key: string, value: string): void;
}

// Không giả vờ lưu thành công khi trình duyệt chặn cả getter localStorage.
const unavailableBrowserStorage: StorageLike = {
  getItem() { throw new Error('browser_storage_unavailable'); },
  setItem() { throw new Error('browser_storage_unavailable'); },
  removeItem() { throw new Error('browser_storage_unavailable'); },
};

export function getBrowserStorage(): StorageLike {
  try { return window.localStorage; }
  catch { return unavailableBrowserStorage; }
}

function parseJsonValue<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function readAlbumPositionSnapshot(storage: StorageLike): Record<string, SyncAlbumPosition> {
  const output: Record<string, SyncAlbumPosition> = {};
  const totalKeys = storage.length ?? 0;

  for (let index = 0; index < totalKeys; index += 1) {
    const key = storage.key?.(index);
    if (!key || !key.startsWith(LEGACY_LOCAL_STORAGE_PREFIXES.talkAlbumPosition)) continue;

    const albumId = key.slice(LEGACY_LOCAL_STORAGE_PREFIXES.talkAlbumPosition.length);
    output[albumId] = parseJsonValue(storage.getItem(key), {});
  }

  return output;
}

export function readAggregateSyncSnapshot(storage: StorageLike): LegacyAggregateSyncSnapshot {
  return {
    bookmarks: parseJsonValue(storage.getItem(LEGACY_LOCAL_STORAGE_KEYS.bookmarks), []),
    listenedHistory: parseJsonValue(storage.getItem(LEGACY_LOCAL_STORAGE_KEYS.listenedAlbums), []),
    practiceLogs: parseJsonValue(storage.getItem(LEGACY_LOCAL_STORAGE_KEYS.practiceLogs), []),
    ptAlbumPositions: readAlbumPositionSnapshot(storage),
    ptPlayerState: parseJsonValue(storage.getItem(LEGACY_LOCAL_STORAGE_KEYS.talkPlayerState), null),
    ptRecentAlbums: parseJsonValue(storage.getItem(LEGACY_LOCAL_STORAGE_KEYS.recentAlbums), []),
  };
}

function mergeSyncArrays(cloudValue: unknown[], localValue: unknown[]): unknown[] {
  const merged = new Map<string, unknown>();
  for (const item of [...cloudValue, ...localValue]) {
    const key = syncItemKey(item);
    const current = merged.get(key);
    const itemTimestamp = syncItemTimestamp(item);
    const currentTimestamp = current === undefined ? Number.NEGATIVE_INFINITY : syncItemTimestamp(current);
    if (current === undefined || itemTimestamp > currentTimestamp || (
      itemTimestamp === currentTimestamp && stableCanonicalize(item) >= stableCanonicalize(current)
    )) {
      merged.set(key, item);
    }
  }
  return [...merged.values()].sort((left, right) => syncItemTimestamp(right) - syncItemTimestamp(left));
}

export function syncItemKey(value: unknown): string {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    for (const field of ['id', 'articleId', 'albumId', 'slug', 'date', 'savedAt']) {
      if (typeof record[field] === 'string' || typeof record[field] === 'number') {
        return `${field}:${record[field]}`;
      }
    }
  }
  return stableCanonicalize(value);
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

function withoutDeleted(items: unknown[], deletions?: SyncDeletion[]): unknown[] {
  if (!deletions?.length) return items;
  const deletedKeys = new Map(deletions.map((entry) => [entry.key, entry.deletedAt]));
  return items.filter((item) => {
    const deletedAt = deletedKeys.get(syncItemKey(item));
    return deletedAt === undefined || deletedAt < syncItemTimestamp(item);
  });
}

export function applyBookmarkSyncSnapshot(
  storage: StorageLike,
  cloudBookmarks: unknown[],
  deletions?: SyncDeletion[],
): unknown[] {
  const localBookmarks = parseJsonValue<unknown[]>(
    storage.getItem(LEGACY_LOCAL_STORAGE_KEYS.bookmarks),
    [],
  );
  const bookmarks = withoutDeleted(
    mergeSyncArrays(cloudBookmarks, Array.isArray(localBookmarks) ? localBookmarks : []),
    deletions,
  );
  storage.setItem(LEGACY_LOCAL_STORAGE_KEYS.bookmarks, JSON.stringify(bookmarks));
  return bookmarks;
}

function syncItemTimestamp(value: unknown): number {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 0;
  const record = value as Record<string, unknown>;
  for (const field of ['savedAt', 'updated_at', 'updatedAt', 'date', 'tao_luc']) {
    const raw = record[field];
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
    if (typeof raw === 'string') {
      const parsed = Date.parse(raw);
      if (Number.isFinite(parsed)) return parsed;
      const numeric = Number(raw);
      if (Number.isFinite(numeric)) return numeric;
    }
  }
  return 0;
}

function savedAt(input: Record<string, unknown> | null | undefined): number {
  const value = input?.savedAt;
  return typeof value === 'number' ? value : 0;
}

export function applyAggregateSyncSnapshot(
  storage: StorageLike,
  snapshot: LegacyAggregateSyncSnapshot,
): LegacyAggregateSyncSnapshot {
  const localSnapshot = readAggregateSyncSnapshot(storage);

  const practiceLogs = withoutDeleted(
    mergeSyncArrays(snapshot.practiceLogs, localSnapshot.practiceLogs),
    snapshot.syncTombstones?.practiceLogs,
  );
  const bookmarks = applyBookmarkSyncSnapshot(
    storage,
    snapshot.bookmarks,
    snapshot.syncTombstones?.bookmarks,
  );
  const listenedHistory = withoutDeleted(
    mergeSyncArrays(snapshot.listenedHistory, localSnapshot.listenedHistory),
    snapshot.syncTombstones?.listenedHistory,
  );
  const ptRecentAlbums = withoutDeleted(
    mergeSyncArrays(snapshot.ptRecentAlbums, localSnapshot.ptRecentAlbums),
    snapshot.syncTombstones?.ptRecentAlbums,
  );
  const playerDeletedAt = snapshot.syncTombstones?.ptPlayerState?.deletedAt ?? 0;
  const newestPlayerSavedAt = Math.max(savedAt(snapshot.ptPlayerState), savedAt(localSnapshot.ptPlayerState));
  const ptPlayerState = playerDeletedAt >= newestPlayerSavedAt && playerDeletedAt > 0
    ? null
    : savedAt(snapshot.ptPlayerState) >= savedAt(localSnapshot.ptPlayerState)
    ? snapshot.ptPlayerState
    : localSnapshot.ptPlayerState;

  storage.setItem(LEGACY_LOCAL_STORAGE_KEYS.practiceLogs, JSON.stringify(practiceLogs));
  storage.setItem(LEGACY_LOCAL_STORAGE_KEYS.listenedAlbums, JSON.stringify(listenedHistory));
  storage.setItem(LEGACY_LOCAL_STORAGE_KEYS.recentAlbums, JSON.stringify(ptRecentAlbums));

  if (ptPlayerState) {
    storage.setItem(LEGACY_LOCAL_STORAGE_KEYS.talkPlayerState, JSON.stringify(ptPlayerState));
  } else if (storage.removeItem) {
    storage.removeItem(LEGACY_LOCAL_STORAGE_KEYS.talkPlayerState);
  }

  const mergedAlbumPositions: Record<string, SyncAlbumPosition> = { ...localSnapshot.ptAlbumPositions };

  for (const [albumId, cloudValue] of Object.entries(snapshot.ptAlbumPositions)) {
    const localValue = localSnapshot.ptAlbumPositions[albumId];
    mergedAlbumPositions[albumId] = savedAt(cloudValue) >= savedAt(localValue)
      ? cloudValue
      : (localValue ?? cloudValue);
  }

  for (const deletion of snapshot.syncTombstones?.ptAlbumPositions ?? []) {
    if (deletion.deletedAt >= savedAt(mergedAlbumPositions[deletion.key])) {
      delete mergedAlbumPositions[deletion.key];
      storage.removeItem?.(`${LEGACY_LOCAL_STORAGE_PREFIXES.talkAlbumPosition}${deletion.key}`);
    }
  }

  for (const [albumId, value] of Object.entries(mergedAlbumPositions)) {
    storage.setItem(
      `${LEGACY_LOCAL_STORAGE_PREFIXES.talkAlbumPosition}${albumId}`,
      JSON.stringify(value),
    );
  }

  return {
    bookmarks,
    listenedHistory,
    practiceLogs,
    ptAlbumPositions: mergedAlbumPositions,
    ptPlayerState,
    ptRecentAlbums,
  };
}
