import { getBrowserSessionSnapshot } from '$lib/stores/session.svelte';
import { currentTalkCatalogScope, readCachedTalkCatalog } from './talk-catalog-cache';
import { resolveOfflineBundledResponse } from './offline-bundled-resolver';
import { hasVerifiedTalkCatalog } from './talk-catalog-proof';

export const OFFLINE_AUDIO_DATABASE = 'tutam_offline_audio';
export const OFFLINE_AUDIO_VERSION = 1;

export interface OfflineTrack {
  url: string;
  blob: Blob;
  albumId: string;
  title: string;
  downloadedAt: number;
  visibility?: 'public' | 'private';
  ownerId?: string;
}

export interface OfflineAlbum {
  id: string;
  title: string;
  desc: string;
  trackCount: number;
  downloadedAt: number;
  visibility?: 'public' | 'private';
  ownerId?: string;
  trackUrls?: string[];
}

export interface OfflineAudioAccess {
  session?: { authenticated: boolean; user: { id: string; role?: string } | null };
  isCurrent?: () => boolean;
  album?: { id: string; title?: string; visibility?: string; tracks: readonly { url: string; title?: string }[] };
}
interface CatalogProof { id: string; title: string; visibility: 'public' | 'private'; tracks: { url: string; title: string }[]; }
interface AccessContext { principalId: string | null; role: string; session: NonNullable<OfflineAudioAccess['session']>; album?: OfflineAudioAccess['album']; assertCurrent(): void; proof?: Promise<CatalogProof[]>; ownedAlbums?: Promise<OfflineAlbum[]>; }
const ACCESS_CONTEXT = Symbol('offline-audio-access');
type ScopedAccess = OfflineAudioAccess & { [ACCESS_CONTEXT]?: AccessContext };
const identity = (session: NonNullable<OfflineAudioAccess['session']>) => JSON.stringify([session.authenticated ? session.user?.id ?? null : null, session.user?.role ?? 'guest']);
function accessContext(input: OfflineAudioAccess = {}): AccessContext {
  const holder = input as ScopedAccess;
  if (holder[ACCESS_CONTEXT]) { holder[ACCESS_CONTEXT]!.assertCurrent(); return holder[ACCESS_CONTEXT]!; }
  const session = input.session ?? getBrowserSessionSnapshot(), expected = identity(session);
  const context: AccessContext = {
    principalId: session.authenticated ? session.user?.id ?? null : null,
    role: session.user?.role ?? 'guest',
    session, album: input.album,
    assertCurrent() {
      if (!(input.isCurrent ? input.isCurrent() : identity(getBrowserSessionSnapshot()) === expected)) {
        throw new DOMException('Offline audio principal changed', 'AbortError');
      }
    },
  };
  context.assertCurrent(); holder[ACCESS_CONTEXT] = context; return context;
}
const privileged = (context: AccessContext) => Boolean(context.principalId && ['admin', 'ctv'].includes(context.role));
const owned = (record: { visibility?: string; ownerId?: string }, context: AccessContext) =>
  record.visibility === 'public' || (record.visibility === 'private' && record.ownerId === context.principalId && privileged(context));
function proofs(rows: unknown[], allowPrivate: boolean): CatalogProof[] {
  return rows.flatMap(value => {
    if (!value || typeof value !== 'object') return [];
    const row = value as Record<string, unknown>;
    if (row.visibility !== 'public' && !(allowPrivate && row.visibility === 'private')) return [];
    let tracks: unknown = row.tracks;
    if (typeof tracks === 'string') { try { tracks = JSON.parse(tracks); } catch { return []; } }
    if (typeof row.id !== 'string' || !Array.isArray(tracks)) return [];
    return [{ id: row.id, title: String(row.tieu_de ?? ''), visibility: row.visibility as 'public' | 'private',
      tracks: (tracks as unknown[]).flatMap(value => {
        if (!value || typeof value !== 'object') return [];
        const track = value as Record<string, unknown>;
        return typeof track.url === 'string' ? [{ url: track.url, title: String(track.title ?? '') }] : [];
      }) }];
  });
}
async function catalogProof(context: AccessContext, strict = false): Promise<CatalogProof[]> {
  context.assertCurrent();
  if (!context.proof) context.proof = (async () => {
    if (context.album && hasVerifiedTalkCatalog(context.album, context.session)) {
      return [{ id: context.album.id, title: context.album.title ?? '', visibility: context.album.visibility as 'public' | 'private',
        tracks: context.album.tracks.map(track => ({ url: track.url, title: track.title ?? '' })) }];
    }
    // Chỉ đọc token hiện có; không select lại một principal đã cũ sau await.
    const scope = currentTalkCatalogScope(context.principalId, context.role);
    const cached = await readCachedTalkCatalog(scope);
    context.assertCurrent();
    const rows = proofs(cached?.rows ?? [], Boolean(scope && privileged(context)));
    const response = await resolveOfflineBundledResponse('/api/talks').catch(error => { if (strict) throw error; return null; });
    const bundled: unknown = response?.ok ? await response.json().catch(error => { if (strict) throw error; return []; }) : [];
    context.assertCurrent();
    return [...rows, ...proofs(Array.isArray(bundled) ? bundled : [], false)];
  })();
  const result = await context.proof; context.assertCurrent(); return result;
}
async function readableTrack(record: OfflineTrack, context: AccessContext, albumId?: string): Promise<OfflineTrack | null> {
  context.assertCurrent();
  if (owned(record, context)) return record;
  if (!context.ownedAlbums) context.ownedAlbums = (async () => {
    const db = await openOfflineAudioDatabase(), tx = db.transaction('albums', 'readonly');
    const done = transactionDone(tx);
    const albums = await requestResult(tx.objectStore('albums').getAll()) as OfflineAlbum[];
    await done; context.assertCurrent(); return albums;
  })();
  const local = (await context.ownedAlbums).find(album => owned(album, context) && album.trackUrls?.includes(record.url)
    && (album.visibility === 'public' ? !albumId || album.id === albumId : album.id === (albumId ?? record.albumId)));
  context.assertCurrent();
  if (local) return { ...record, albumId: local.id, title: local.title, visibility: local.visibility,
    ownerId: local.visibility === 'private' ? context.principalId! : undefined };
  const proof = (await catalogProof(context)).find(item => item.tracks.some(track => track.url === record.url)
    && (item.visibility === 'public' ? !albumId || item.id === albumId : item.id === (albumId ?? record.albumId)));
  if (!proof) return null;
  return { ...record, albumId: proof.id, title: proof.tracks.find(track => track.url === record.url)?.title || record.title,
    visibility: proof.visibility, ownerId: proof.visibility === 'private' ? context.principalId! : undefined };
}
async function readableAlbum(record: OfflineAlbum, tracks: OfflineTrack[], context: AccessContext): Promise<OfflineAlbum | null> {
  context.assertCurrent();
  if (owned(record, context)) return record;
  const ownTracks = privileged(context) ? tracks.filter(track => track.albumId === record.id && track.visibility === 'private' && track.ownerId === context.principalId) : [];
  if (ownTracks.length) return { id: record.id, title: ownTracks[0].title, desc: '', trackCount: ownTracks.length,
    downloadedAt: Math.max(...ownTracks.map(track => track.downloadedAt)), visibility: 'private', ownerId: context.principalId!, trackUrls: ownTracks.map(track => track.url) };
  const proof = (await catalogProof(context)).find(item => item.id === record.id && item.tracks.some(track => tracks.some(saved => saved.url === track.url)));
  if (!proof) return null;
  return { ...record, title: proof.title || record.title, visibility: proof.visibility,
    ownerId: proof.visibility === 'private' ? context.principalId! : undefined, trackUrls: proof.tracks.map(track => track.url) };
}
async function albumTracks(albumId: string, album: OfflineAlbum | undefined, tracks: OfflineTrack[], context: AccessContext): Promise<OfflineTrack[]> {
  const urls = new Set(album?.trackUrls ?? []);
  if (!urls.size && !tracks.some(track => String(track.albumId) === albumId)) {
    for (const proof of await catalogProof(context)) if (proof.id === albumId) for (const track of proof.tracks) urls.add(track.url);
  }
  const allowed = await Promise.all(tracks.filter(track => String(track.albumId) === albumId || urls.has(track.url))
    .map(track => readableTrack(track, context, albumId)));
  return allowed.filter((track): track is OfflineTrack => Boolean(track)).map(track => ({ ...track, albumId }));
}
function assertPrivateWrite(record: { visibility?: string; ownerId?: string }, context: AccessContext): void {
  context.assertCurrent();
  if (record.visibility === 'private' && (!record.ownerId || record.ownerId !== context.principalId || !privileged(context))) {
    throw new DOMException('Offline audio write is no longer authorized', 'AbortError');
  }
}

export interface OfflineLibrarySnapshot {
  albums: OfflineAlbum[];
  bytes: number;
  trackCounts: Record<string, number>;
}

export type OfflineAlbumStatus = 'none' | 'partial' | 'downloaded';

let databasePromise: Promise<IDBDatabase> | undefined;

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'));
  });
}

export function openOfflineAudioDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB is unavailable'));
  if (databasePromise) return databasePromise;

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(OFFLINE_AUDIO_DATABASE, OFFLINE_AUDIO_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains('tracks')) {
        database.createObjectStore('tracks', { keyPath: 'url' });
      }
      if (!database.objectStoreNames.contains('albums')) {
        database.createObjectStore('albums', { keyPath: 'id' });
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => {
        database.close();
        databasePromise = undefined;
      };
      resolve(database);
    };
    request.onerror = () => {
      databasePromise = undefined;
      reject(request.error ?? new Error('Cannot open offline audio database'));
    };
    request.onblocked = () => {
      databasePromise = undefined;
      reject(new Error('Offline audio database upgrade is blocked'));
    };
  });

  return databasePromise;
}

export async function putOfflineTrack(track: OfflineTrack, access?: OfflineAudioAccess): Promise<void> {
  const context = accessContext(access);
  assertPrivateWrite(track, context);
  const database = await openOfflineAudioDatabase();
  assertPrivateWrite(track, context);
  const transaction = database.transaction('tracks', 'readwrite');
  const done = transactionDone(transaction), store = transaction.objectStore('tracks');
  const previous = store.get(track.url);
  let writeError: unknown;
  previous.onsuccess = () => {
    try {
      assertPrivateWrite(track, context);
      // Một URL public dùng chung không bị đổi thành private bởi album tải sau.
      if ((previous.result as OfflineTrack | undefined)?.visibility === 'public' && track.visibility === 'private') return;
      store.put({ ...track, albumId: String(track.albumId) });
    } catch (error) { writeError = error; transaction.abort(); }
  };
  await done.catch(error => { throw writeError ?? error; });
  context.assertCurrent();
}

export async function getOfflineTrack(url: string, access?: OfflineAudioAccess): Promise<OfflineTrack | null> {
  const context = accessContext(access);
  const database = await openOfflineAudioDatabase();
  const transaction = database.transaction('tracks', 'readonly');
  const done = transactionDone(transaction);
  const value = await requestResult(transaction.objectStore('tracks').get(url));
  await done;
  context.assertCurrent();
  return value ? readableTrack(value as OfflineTrack, context) : null;
}

export async function getOfflineTracksForAlbum(albumId: string, access?: OfflineAudioAccess): Promise<OfflineTrack[]> {
  const context = accessContext(access), raw = await rawLibrarySnapshot();
  context.ownedAlbums = Promise.resolve(raw.albums);
  context.assertCurrent();
  return albumTracks(String(albumId), raw.albums.find(album => String(album.id) === String(albumId)), raw.tracks, context);
}

export async function canAccessAudioAlbum(album: NonNullable<OfflineAudioAccess['album']>, access?: OfflineAudioAccess): Promise<boolean> {
  const context = accessContext(access);
  if (album.visibility === 'private' && !privileged(context)) return false;
  if (hasVerifiedTalkCatalog(album, context.session)) return true;
  const raw = await rawLibrarySnapshot(); context.assertCurrent();
  const stored = raw.albums.find(item => item.id === album.id);
  if (stored && owned(stored, context)) {
    const urls = new Set(stored.trackUrls ?? raw.tracks.filter(track => track.albumId === album.id && owned(track, context)).map(track => track.url));
    if (album.tracks.every(track => urls.has(track.url))) return true;
  }
  return (await catalogProof(context)).some(proof => proof.id === album.id
    && album.tracks.every(track => proof.tracks.some(item => item.url === track.url)));
}

export async function putOfflineAlbum(album: OfflineAlbum, access?: OfflineAudioAccess): Promise<void> {
  const context = accessContext(access);
  assertPrivateWrite(album, context);
  const database = await openOfflineAudioDatabase();
  assertPrivateWrite(album, context);
  const transaction = database.transaction('albums', 'readwrite');
  transaction.objectStore('albums').put({ ...album, id: String(album.id) });
  await transactionDone(transaction);
  context.assertCurrent();
}

export async function listOfflineAlbums(access?: OfflineAudioAccess): Promise<OfflineAlbum[]> {
  const context = accessContext(access), raw = await rawLibrarySnapshot();
  context.ownedAlbums = Promise.resolve(raw.albums);
  const allowed = await Promise.all(raw.albums.map(album => readableAlbum(album, raw.tracks, context)));
  return allowed.filter((album): album is OfflineAlbum => Boolean(album));
}

export async function deleteOfflineAlbum(albumId: string): Promise<void> {
  const id = String(albumId);
  const context = accessContext();
  // Resolve legacy URL references from local catalog owners before opening IDB writes.
  const proof = await catalogProof(context, true);
  const database = await openOfflineAudioDatabase();
  context.assertCurrent();
  const transaction = database.transaction(['tracks', 'albums'], 'readwrite');
  let principalError: unknown;
  const albums = transaction.objectStore('albums');
  const albumRequest = albums.getAll();
  albumRequest.onsuccess = () => {
    try { context.assertCurrent(); } catch (error) { principalError = error; transaction.abort(); return; }
    const stored = albumRequest.result as OfflineAlbum[];
    const urls = (album: OfflineAlbum) => album.trackUrls?.length ? album.trackUrls
      : proof.filter(item => item.id === String(album.id)).flatMap(item => item.tracks.map(track => track.url));
    const target = stored.find(album => String(album.id) === id);
    const targetUrls = new Set(target ? urls(target) : []);
    const remaining = stored.filter(album => String(album.id) !== id);
    const retainedUrls = new Set(remaining.flatMap(urls));
    // Another principal's legacy catalog is unavailable here: retain bytes until its references can be resolved.
    const unresolvedLegacy = remaining.some(album => !album.trackUrls?.length && urls(album).length === 0);
    const legacyAlbumIds = new Set(remaining.filter(album => !album.trackUrls?.length).map(album => String(album.id)));
    albums.delete(id);
    const cursorRequest = transaction.objectStore('tracks').openCursor();
    cursorRequest.onsuccess = () => {
      try { context.assertCurrent(); } catch (error) { principalError = error; transaction.abort(); return; }
      const cursor = cursorRequest.result;
      if (!cursor) return;
      const track = cursor.value as OfflineTrack;
      if ((String(track.albumId) === id || targetUrls.has(track.url))
        && !unresolvedLegacy && !retainedUrls.has(track.url) && !legacyAlbumIds.has(String(track.albumId))) cursor.delete();
      cursor.continue();
    };
  };
  await transactionDone(transaction).catch(error => { throw principalError ?? error; });
}

export async function offlineAlbumStatus(
  albumId: string,
  trackUrls: readonly string[]
): Promise<OfflineAlbumStatus> {
  const storedUrls = new Set((await getOfflineTracksForAlbum(albumId)).map(track => track.url));
  const completed = trackUrls.filter((url) => storedUrls.has(url)).length;
  if (completed === 0) return 'none';
  return completed >= trackUrls.length ? 'downloaded' : 'partial';
}

export async function offlineStorageBytes(): Promise<number> {
  const database = await openOfflineAudioDatabase();
  const transaction = database.transaction('tracks', 'readonly');
  const tracks = (await requestResult(transaction.objectStore('tracks').getAll())) as OfflineTrack[];
  await transactionDone(transaction);
  return tracks.reduce((total, track) => total + (track.blob?.size ?? 0), 0);
}

async function rawLibrarySnapshot(): Promise<{ albums: OfflineAlbum[]; tracks: OfflineTrack[] }> {
  const database = await openOfflineAudioDatabase();
  const transaction = database.transaction(['albums', 'tracks'], 'readonly');
  const done = transactionDone(transaction);
  const [albums, tracks] = await Promise.all([
    requestResult(transaction.objectStore('albums').getAll()) as Promise<OfflineAlbum[]>,
    requestResult(transaction.objectStore('tracks').getAll()) as Promise<OfflineTrack[]>,
  ]);
  await done;
  return { albums, tracks };
}

export async function readOfflineLibrarySnapshot(access?: OfflineAudioAccess): Promise<OfflineLibrarySnapshot> {
  const context = accessContext(access), raw = await rawLibrarySnapshot();
  context.ownedAlbums = Promise.resolve(raw.albums);
  const allowed = await Promise.all(raw.albums.map(album => readableAlbum(album, raw.tracks, context)));
  const albums = allowed.filter((album): album is OfflineAlbum => Boolean(album));

  const trackCounts: Record<string, number> = {};
  for (const album of albums) {
    trackCounts[album.id] = (await albumTracks(album.id, album, raw.tracks, context)).length;
  }
  const completeIds = new Set(Object.keys(trackCounts));
  for (const track of raw.tracks) {
    const readable = await readableTrack(track, context);
    if (readable && !completeIds.has(readable.albumId)) trackCounts[readable.albumId] = (trackCounts[readable.albumId] ?? 0) + 1;
  }
  // Quota là bytes vật lý, kể cả bản cũ đang chờ bằng chứng quyền; không xóa media.
  const bytes = raw.tracks.reduce((total, track) => total + (track.blob?.size ?? 0), 0);
  return { albums, bytes, trackCounts };
}
