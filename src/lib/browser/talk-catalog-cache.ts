export interface CachedTalkAlbumRow {
  id?: unknown;
  tieu_de?: unknown;
  mo_ta?: unknown;
  chu_de?: unknown;
  dien_gia?: unknown;
  archive_id?: unknown;
  anh_dai_dien?: unknown;
  visibility?: unknown;
  ngay_dang?: unknown;
  created_at?: unknown;
  tracks?: unknown;
}

export interface CachedPlayCount {
  albumId: string;
  playCount: number;
}

export interface TalkCatalogMeta {
  lastSyncTime: number;
  latestCreatedAt: string | null;
  albumCount: number;
  privateOwnerId?: string | null;
  privateOwnerRole?: string | null;
}

export interface TalkCatalogScope {
  principalId: string | null;
  role: string;
  generation: number;
}

export interface CachedTalkCatalogSnapshot {
  rows: CachedTalkAlbumRow[];
  meta: Pick<TalkCatalogMeta, 'privateOwnerId' | 'privateOwnerRole'> | null;
}

export const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const DB_NAME = 'tutam_talk_catalog_v1';
const DB_VERSION = 1;
const STORE_ALBUMS = 'albums';
const STORE_META = 'meta';

const LOCAL_STORAGE_BACKUP_KEY = 'quangtu_cached_talk_catalog_v1';
const LOCAL_STORAGE_META_KEY = 'quangtu_talk_catalog_meta_v1';
const LOCAL_STORAGE_PLAYS_KEY = 'quangtu_cached_play_counts_v1';

let dbPromise: Promise<IDBDatabase> | null = null;
let catalogPrincipal = '';
let catalogGeneration = 0;
let verifiedCatalogGeneration = -1;

function hasBrowserStorage(): boolean {
  return typeof window !== 'undefined' || typeof localStorage !== 'undefined' || typeof indexedDB !== 'undefined';
}

function canReadPrivate(scope?: TalkCatalogScope): boolean {
  return Boolean(scope?.principalId && ['admin', 'ctv'].includes(scope.role));
}
function ownsPrivate(meta: Partial<TalkCatalogMeta> | null | undefined, scope?: TalkCatalogScope): boolean {
  return canReadPrivate(scope) && meta?.privateOwnerId === scope?.principalId && meta?.privateOwnerRole === scope?.role;
}
function isUnverifiedGuest(scope?: TalkCatalogScope): boolean {
  return Boolean(scope && !scope.principalId && scope.role === 'guest' && verifiedCatalogGeneration !== scope.generation);
}
function visibleRows(rows: CachedTalkAlbumRow[], meta?: Partial<TalkCatalogMeta> | null, scope?: TalkCatalogScope): CachedTalkAlbumRow[] {
  return rows.filter(row => row?.visibility !== 'private' || ownsPrivate(meta, scope));
}
export function assertTalkCatalogScope(scope: TalkCatalogScope): void {
  if (scope.generation < 0) return;
  if (scope.generation !== catalogGeneration || `${scope.principalId ?? ''}:${scope.role}` !== catalogPrincipal) {
    throw new DOMException('Talk catalog session changed', 'AbortError');
  }
}

// Gắn vào owner session hiện có; chặn ghi muộn đồng bộ trước khi dọn IDB bất đồng bộ.
export function selectTalkCatalogPrincipal(principalId: string | null, role: string, purgeUnowned = true): void {
  if (!hasBrowserStorage()) return;
  const next = `${principalId ?? ''}:${role}`;
  if (next === catalogPrincipal) {
    // Lần xác minh đầu phải dọn owner cũ, kể cả identity không đổi từ lúc khởi động.
    if (!purgeUnowned || verifiedCatalogGeneration === catalogGeneration) return;
  } else {
    catalogPrincipal = next;
    catalogGeneration++;
  }
  if (!purgeUnowned) return;
  verifiedCatalogGeneration = catalogGeneration;
  const scope = { principalId, role, generation: catalogGeneration };
  try {
    if (typeof localStorage !== 'undefined') {
      const meta = JSON.parse(localStorage.getItem(LOCAL_STORAGE_META_KEY) || 'null') as TalkCatalogMeta | null;
      const rows = JSON.parse(localStorage.getItem(LOCAL_STORAGE_BACKUP_KEY) || 'null') as CachedTalkAlbumRow[] | null;
      if (Array.isArray(rows) && !ownsPrivate(meta, scope)) {
        const publicRows = rows.filter(row => row?.visibility !== 'private');
        localStorage.setItem(LOCAL_STORAGE_BACKUP_KEY, JSON.stringify(publicRows));
        localStorage.setItem(LOCAL_STORAGE_META_KEY, JSON.stringify({ ...meta, albumCount: publicRows.length,
          latestCreatedAt: findLatestCreatedAt(publicRows), privateOwnerId: null, privateOwnerRole: null }));
      }
    }
  } catch {}
  if (isIndexedDbAvailable()) void purgeUnownedPrivateRows().catch(() => undefined);
}

export function captureTalkCatalogScope(principalId: string | null, role: string): TalkCatalogScope {
  if (!hasBrowserStorage()) return { principalId, role, generation: -1 };
  selectTalkCatalogPrincipal(principalId, role, false);
  return { principalId, role, generation: catalogGeneration };
}

export function currentTalkCatalogScope(principalId: string | null, role: string): TalkCatalogScope | undefined {
  if (!hasBrowserStorage() || `${principalId ?? ''}:${role}` !== catalogPrincipal) return undefined;
  return { principalId, role, generation: catalogGeneration };
}

async function purgeUnownedPrivateRows(): Promise<void> {
  const db = await openDatabase();
  const tx = db.transaction([STORE_ALBUMS, STORE_META], 'readwrite');
  const done = txPromise(tx);
  const albums = tx.objectStore(STORE_ALBUMS), meta = tx.objectStore(STORE_META);
  const ownerRequest = meta.get('album_count'), rowsRequest = albums.getAll();
  let ownerReady = false, rowsReady = false;
  const purge = () => {
    if (!ownerReady || !rowsReady) return;
    const owner = ownerRequest.result as Partial<TalkCatalogMeta> | undefined;
    const ownerKey = `${owner?.privateOwnerId ?? ''}:${owner?.privateOwnerRole ?? ''}`;
    if (owner?.privateOwnerId && ownerKey === catalogPrincipal) return;
    const publicRows = (rowsRequest.result as CachedTalkAlbumRow[]).filter(row => row?.visibility !== 'private');
    albums.clear();
    for (const row of publicRows) albums.put(row);
    meta.put({ key: 'album_count', value: publicRows.length, privateOwnerId: null, privateOwnerRole: null });
    meta.put({ key: 'latest_created_at', value: findLatestCreatedAt(publicRows) });
  };
  ownerRequest.onsuccess = () => { ownerReady = true; purge(); };
  rowsRequest.onsuccess = () => { rowsReady = true; purge(); };
  await done;
}

function isIndexedDbAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openDatabase(): Promise<IDBDatabase> {
  if (!isIndexedDbAvailable()) return Promise.reject(new Error('IndexedDB unavailable'));
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_ALBUMS)) {
        db.createObjectStore(STORE_ALBUMS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    request.onerror = () => {
      dbPromise = null;
      reject(request.error ?? new Error('Failed to open talk catalog database'));
    };
    request.onblocked = () => {
      dbPromise = null;
      reject(new Error('Talk catalog database upgrade blocked'));
    };
  });

  return dbPromise;
}

function reqPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request error'));
  });
}

function txPromise(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction error'));
  });
}

function findLatestCreatedAt(rows: CachedTalkAlbumRow[]): string | null {
  let latest: string | null = null;
  for (const row of rows) {
    const raw = row.created_at ?? row.ngay_dang;
    if (raw && typeof raw === 'string') {
      if (!latest || raw > latest) {
        latest = raw;
      }
    }
  }
  return latest;
}

// ==================== Storage Operations ====================

export async function readCachedTalkCatalog(scope?: TalkCatalogScope): Promise<CachedTalkCatalogSnapshot | null> {
  if (isIndexedDbAvailable()) {
    try {
      const db = await openDatabase();
      const tx = db.transaction([STORE_ALBUMS, STORE_META], 'readonly');
      const done = txPromise(tx);
      // Đọc owner và rows cùng snapshot; metadata mới không được cấp quyền cho rows cũ.
      const [rows, meta] = await Promise.all([
        reqPromise(tx.objectStore(STORE_ALBUMS).getAll()) as Promise<CachedTalkAlbumRow[]>,
        reqPromise(tx.objectStore(STORE_META).get('album_count')) as Promise<Partial<TalkCatalogMeta> | undefined>,
      ]);
      await done;
      if (Array.isArray(rows) && rows.length > 0) {
        if (scope) assertTalkCatalogScope(scope);
        return { rows: visibleRows(rows, meta, scope), meta: meta ? {
          privateOwnerId: meta.privateOwnerId, privateOwnerRole: meta.privateOwnerRole,
        } : null };
      }
    } catch (error) { if (error instanceof Error && error.name === 'AbortError') throw error; }
  }

  // Fallback to localStorage
  try {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(LOCAL_STORAGE_BACKUP_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const meta = JSON.parse(localStorage.getItem(LOCAL_STORAGE_META_KEY) || 'null') as TalkCatalogMeta | null;
          if (scope) assertTalkCatalogScope(scope);
          return { rows: visibleRows(parsed as CachedTalkAlbumRow[], meta, scope), meta: meta ? {
            privateOwnerId: meta.privateOwnerId, privateOwnerRole: meta.privateOwnerRole,
          } : null };
        }
      }
    }
  } catch (error) { if (error instanceof Error && error.name === 'AbortError') throw error; }

  return null;
}

export async function getCachedTalkAlbums(scope?: TalkCatalogScope): Promise<CachedTalkAlbumRow[] | null> {
  return (await readCachedTalkCatalog(scope))?.rows ?? null;
}

export async function saveCachedTalkAlbums(albums: CachedTalkAlbumRow[], scope?: TalkCatalogScope): Promise<void> {
  if (!Array.isArray(albums) || albums.length === 0) return;
  if (scope) assertTalkCatalogScope(scope);
  albums = albums.filter(row => row?.visibility !== 'private' || canReadPrivate(scope));

  const latestCreatedAt = findLatestCreatedAt(albums);
  const now = Date.now();

  if (isIndexedDbAvailable()) {
    try {
      const db = await openDatabase();
      if (scope) assertTalkCatalogScope(scope);
      const tx = db.transaction([STORE_ALBUMS, STORE_META], 'readwrite');
      const done = txPromise(tx);
      const albumStore = tx.objectStore(STORE_ALBUMS);
      let writeError: unknown;
      const write = () => {
        try {
          if (scope) assertTalkCatalogScope(scope);
          albumStore.clear();
          for (const album of albums) {
            if (album && album.id) albumStore.put(album);
          }
          const metaStore = tx.objectStore(STORE_META);
          metaStore.put({ key: 'last_sync_time', value: now });
          metaStore.put({ key: 'latest_created_at', value: latestCreatedAt });
          metaStore.put({ key: 'album_count', value: albums.length, privateOwnerId: canReadPrivate(scope) ? scope!.principalId : null,
            privateOwnerRole: canReadPrivate(scope) ? scope!.role : null });
        } catch (error) {
          writeError = error;
          tx.abort();
        }
      };
      if (isUnverifiedGuest(scope)) {
        const previous = albumStore.getAll();
        previous.onsuccess = () => {
          // Guest chưa xác minh được đọc public, nhưng không được ghi đè private của phiên cũ.
          if (isUnverifiedGuest(scope) && (previous.result as CachedTalkAlbumRow[]).some(row => row?.visibility === 'private')) return;
          write();
        };
      } else {
        write();
      }
      await done.catch(error => { throw writeError ?? error; });
      if (scope) assertTalkCatalogScope(scope);
      return;
    } catch (error) { if (error instanceof Error && error.name === 'AbortError') throw error; }
  }

  // Fallback to localStorage
  try {
    if (typeof localStorage !== 'undefined') {
      if (scope) assertTalkCatalogScope(scope);
      if (isUnverifiedGuest(scope)) {
        const previous = JSON.parse(localStorage.getItem(LOCAL_STORAGE_BACKUP_KEY) || 'null') as CachedTalkAlbumRow[] | null;
        if (Array.isArray(previous) && previous.some(row => row?.visibility === 'private')) return;
      }
      localStorage.setItem(LOCAL_STORAGE_BACKUP_KEY, JSON.stringify(albums));
      localStorage.setItem(LOCAL_STORAGE_META_KEY, JSON.stringify({
        lastSyncTime: now,
        latestCreatedAt,
        albumCount: albums.length,
        privateOwnerId: canReadPrivate(scope) ? scope!.principalId : null,
        privateOwnerRole: canReadPrivate(scope) ? scope!.role : null,
      }));
    }
  } catch {}
}

export async function mergeDeltaTalkAlbums(newAlbums: CachedTalkAlbumRow[], scope?: TalkCatalogScope): Promise<CachedTalkAlbumRow[]> {
  const current = (await getCachedTalkAlbums(scope)) || [];
  if (!newAlbums.length) return current;

  // Map by id to update existing or prepend new
  const map = new Map<string, CachedTalkAlbumRow>();
  for (const row of current) {
    if (row && row.id) map.set(String(row.id), row);
  }

  for (const row of newAlbums) {
    if (row && row.id) map.set(String(row.id), row);
  }

  const merged = Array.from(map.values());
  await saveCachedTalkAlbums(merged, scope);
  return merged;
}

export async function getTalkCatalogMeta(): Promise<TalkCatalogMeta> {
  if (isIndexedDbAvailable()) {
    try {
      const db = await openDatabase();
      const tx = db.transaction(STORE_META, 'readonly');
      const store = tx.objectStore(STORE_META);
      const lastSyncReq = reqPromise(store.get('last_sync_time'));
      const latestReq = reqPromise(store.get('latest_created_at'));
      const countReq = reqPromise(store.get('album_count'));
      const [lastSyncVal, latestVal, countVal] = await Promise.all([lastSyncReq, latestReq, countReq]);
      await txPromise(tx);

      if (lastSyncVal || latestVal) {
        return {
          lastSyncTime: Number((lastSyncVal as any)?.value || 0),
          latestCreatedAt: ((latestVal as any)?.value as string) || null,
          albumCount: Number((countVal as any)?.value || 0),
          privateOwnerId: (countVal as Partial<TalkCatalogMeta> | undefined)?.privateOwnerId,
          privateOwnerRole: (countVal as Partial<TalkCatalogMeta> | undefined)?.privateOwnerRole,
        };
      }
    } catch {}
  }

  // Fallback to localStorage
  try {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(LOCAL_STORAGE_META_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return {
          lastSyncTime: Number(parsed.lastSyncTime || 0),
          latestCreatedAt: parsed.latestCreatedAt || null,
          albumCount: Number(parsed.albumCount || 0),
          privateOwnerId: parsed.privateOwnerId,
          privateOwnerRole: parsed.privateOwnerRole,
        };
      }
    }
  } catch {}

  return {
    lastSyncTime: 0,
    latestCreatedAt: null,
    albumCount: 0,
  };
}

export async function recordTalkCatalogSyncTime(time = Date.now()): Promise<void> {
  if (isIndexedDbAvailable()) {
    try {
      const db = await openDatabase();
      const tx = db.transaction(STORE_META, 'readwrite');
      tx.objectStore(STORE_META).put({ key: 'last_sync_time', value: time });
      await txPromise(tx);
      return;
    } catch {}
  }

  try {
    if (typeof localStorage !== 'undefined') {
      const meta = await getTalkCatalogMeta();
      meta.lastSyncTime = time;
      localStorage.setItem(LOCAL_STORAGE_META_KEY, JSON.stringify(meta));
    }
  } catch {}
}

// ==================== Play Counts Cache ====================

export async function getCachedPlayCounts(): Promise<CachedPlayCount[] | null> {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(LOCAL_STORAGE_PLAYS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed as CachedPlayCount[];
      }
    }
  } catch {}
  return null;
}

export async function saveCachedPlayCounts(counts: CachedPlayCount[]): Promise<void> {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LOCAL_STORAGE_PLAYS_KEY, JSON.stringify(counts));
    }
  } catch {}
}
