import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/svelte-query';

const mocks = vi.hoisted(() => ({
  session: { authenticated: true, user: { id: 'offline-admin-a', email: '', avatarUrl: '', displayName: 'Admin', role: 'admin' }, csrfToken: 'test', expiresAt: null } as {
    authenticated: boolean; user: { id: string; email: string; avatarUrl: string; displayName: string; role: 'admin' | 'ctv' | 'user' } | null; csrfToken: string | null; expiresAt: string | null;
  },
  bundle: null as unknown[] | null,
}));
vi.mock('$lib/stores/session.svelte', () => ({
  getBrowserSessionSnapshot: () => mocks.session,
  refreshBrowserSession: async () => mocks.session,
  isSessionExpired: () => false,
}));
vi.mock('$lib/browser/native-platform', () => ({ isNativeApp: () => true, nativePlatform: () => 'android' }));
vi.mock('$lib/browser/native-api', () => ({ resolveApiUrl: (url: string) => url, isHtmlResponse: () => false, fetchNativeJsonMutation: async () => null }));
vi.mock('$lib/browser/offline-bundled-resolver', () => ({
  resolveOfflineBundledResponse: async () => mocks.bundle ? Response.json(mocks.bundle) : null,
}));

interface MemoryRequest { result: unknown; onsuccess: (() => void) | null; onerror: (() => void) | null; }
type MemoryStore = Map<string, Record<string, unknown>>;
let databases: Map<string, Map<string, MemoryStore>>;
let database: typeof import('$lib/browser/offline-audio-database');
let downloads: typeof import('$lib/browser/audio-downloads');
let catalogs: typeof import('$lib/browser/content-catalogs');
let blockCatalogWrites: boolean;
let beforeCursorEvent: (() => void) | undefined;
const privateAlbum = { id: 'private-offline', title: 'Private offline', desc: '', visibility: 'private' as const, tracks: [{ title: 'Private track', url: '/api/audio/drive/private-file' }] };
const guest = () => ({ authenticated: false, user: null, csrfToken: null, expiresAt: null });

// Mô phỏng request/transaction IDB, giữ bytes thật để kiểm tra đường tải → lưu → đọc.
function memoryIndexedDb() {
  return { open: (name: string) => {
    const stores = databases.get(name) ?? new Map<string, MemoryStore>();
    databases.set(name, stores);
    const db = {
      objectStoreNames: { contains: () => true }, onversionchange: null, close() {},
      transaction: () => {
        let pending = 0, revision = 0, aborted = false;
        const staged = new Map<string, MemoryStore>(), dirty = new Set<string>();
        const complete = () => {
          const expected = ++revision;
          setImmediate(() => {
            if (!aborted && pending === 0 && expected === revision) {
              for (const name of dirty) stores.set(name, staged.get(name)!);
              tx.oncomplete?.();
            }
          });
        };
        const request = (action: () => unknown): MemoryRequest => {
          const result: MemoryRequest = { result: undefined, onsuccess: null, onerror: null };
          pending++; revision++;
          setImmediate(() => {
            if (aborted) return;
            result.result = action(); result.onsuccess?.(); pending--; complete();
          });
          return result;
        };
        const tx = {
          oncomplete: null as (() => void) | null, onabort: null as (() => void) | null, onerror: null as (() => void) | null, error: null,
          abort() { aborted = true; setImmediate(() => tx.onabort?.()); },
          objectStore: (storeName: string) => {
            const rows = staged.get(storeName) ?? new Map([...(stores.get(storeName) ?? [])].map(([key, row]) => [key, { ...row }]));
            staged.set(storeName, rows);
            return {
              get: (key: string) => request(() => rows.has(key) ? { ...rows.get(key)! } : undefined),
              getAll: () => request(() => [...rows.values()].map(row => ({ ...row }))),
              openCursor: () => {
                const keys = [...rows.keys()]; let position = 0;
                const cursorRequest: MemoryRequest = { result: undefined, onsuccess: null, onerror: null };
                const advance = () => {
                  pending++; revision++;
                  setImmediate(() => {
                    if (aborted) return;
                    const hook = beforeCursorEvent; beforeCursorEvent = undefined; hook?.();
                    const key = keys[position++];
                    cursorRequest.result = key === undefined ? null : {
                      value: { ...rows.get(key)! }, delete: () => { dirty.add(storeName); rows.delete(key); complete(); }, continue: advance,
                    };
                    cursorRequest.onsuccess?.(); pending--; complete();
                  });
                };
                advance(); return cursorRequest;
              },
              put: (row: Record<string, unknown>) => {
                if (blockCatalogWrites && name === 'tutam_talk_catalog_v1') throw new DOMException('Quota', 'QuotaExceededError');
                dirty.add(storeName);
                rows.set(String(row[storeName === 'tracks' ? 'url' : storeName === 'meta' ? 'key' : 'id']), { ...row }); complete();
              },
              clear: () => { dirty.add(storeName); rows.clear(); complete(); },
              delete: (key: string) => { dirty.add(storeName); rows.delete(key); complete(); },
            };
          },
        };
        return tx;
      },
    };
    const opening: MemoryRequest = { result: db, onsuccess: null, onerror: null };
    setImmediate(() => opening.onsuccess?.());
    return opening;
  } };
}

beforeEach(async () => {
  vi.resetModules();
  databases = new Map();
  blockCatalogWrites = false;
  beforeCursorEvent = undefined;
  mocks.session = { authenticated: true, user: { id: 'offline-admin-a', email: '', avatarUrl: '', displayName: 'Admin', role: 'admin' }, csrfToken: 'test', expiresAt: null };
  mocks.bundle = null;
  vi.stubGlobal('indexedDB', memoryIndexedDb());
  database = await import('$lib/browser/offline-audio-database');
  downloads = await import('$lib/browser/audio-downloads');
  catalogs = await import('$lib/browser/content-catalogs');
});
afterEach(() => vi.unstubAllGlobals());

async function downloadPrivate() {
  await downloads.downloadAlbumForOffline(privateAlbum, { authorize: async () => {}, fetcher: vi.fn(async () => new Response(new Blob(['private bytes']))) });
}

it('does not relabel a private admin download as public through guest native fallback', async () => {
  await downloadPrivate();
  mocks.session = guest();
  const offlineFetcher = vi.fn(async () => { throw new Error('network unavailable'); });
  const albums = await catalogs.fetchTalkAlbums(offlineFetcher as typeof fetch);
  expect(albums.find(album => album.id === privateAlbum.id)).toBeUndefined();
});

it.each(['guest', 'other-admin', 'role-loss'] as const)('does not expose private track bytes or migration rows after principal change (%s)', async (next) => {
  await downloadPrivate();
  mocks.session = next === 'guest' ? guest() : { ...mocks.session, user: {
    ...mocks.session.user!, id: next === 'other-admin' ? 'offline-admin-b' : 'offline-admin-a', role: next === 'role-loss' ? 'user' : 'admin',
  } };
  expect(await database.getOfflineTrack(privateAlbum.tracks[0].url)).toBeNull();
  expect(await database.getOfflineTracksForAlbum(privateAlbum.id)).toEqual([]);
  expect((await database.readOfflineLibrarySnapshot()).albums).toEqual([]);
  expect(databases.get('tutam_offline_audio')?.get('tracks')?.size).toBe(1);
});

it('keeps the same privileged principal private download readable and retains its visibility in fallback', async () => {
  await downloadPrivate();
  expect(await database.getOfflineTrack(privateAlbum.tracks[0].url)).toMatchObject({ visibility: 'private', ownerId: 'offline-admin-a' });
  const albums = await catalogs.fetchTalkAlbums(vi.fn(async () => { throw new Error('network unavailable'); }) as typeof fetch);
  expect(albums.find(album => album.id === privateAlbum.id)).toMatchObject({ visibility: 'private' });
});

it('keeps legacy public blobs readable when existing bundled catalog proves album id and track URL', async () => {
  const legacy = { id: 'legacy-public', title: 'Legacy public', desc: '', trackCount: 1, downloadedAt: 1 };
  const track = { url: '/api/audio/drive/legacy-public-file', albumId: legacy.id, title: 'Legacy track', blob: new Blob(['legacy bytes']), downloadedAt: 1 };
  await database.putOfflineTrack(track);
  await database.putOfflineAlbum(legacy);
  mocks.session = guest();
  mocks.bundle = [{ id: legacy.id, tieu_de: legacy.title, visibility: 'public', tracks: [{ title: track.title, url: track.url }] }];
  expect((await database.getOfflineTrack(track.url))?.blob.size).toBe(track.blob.size);
  expect((await database.getOfflineTracksForAlbum(legacy.id)).map(row => row.url)).toEqual([track.url]);
});

it('retains partial public download counts before the album completion record exists', async () => {
  const track = { url: '/api/audio/drive/partial-public', albumId: 'partial-public', title: 'Partial', blob: new Blob(['partial']), downloadedAt: 1 };
  await database.putOfflineTrack(track);
  mocks.session = guest();
  mocks.bundle = [{ id: track.albumId, tieu_de: 'Partial public', visibility: 'public', tracks: [{ title: track.title, url: track.url }] }];
  expect((await database.readOfflineLibrarySnapshot()).trackCounts[track.albumId]).toBe(1);
});

it('retains but does not guess access to legacy blobs when public catalog proof is unavailable', async () => {
  const track = { url: '/api/audio/drive/unknown-legacy-file', albumId: 'unknown-legacy', title: 'Unknown legacy', blob: new Blob(['retained bytes']), downloadedAt: 1 };
  await database.putOfflineTrack(track);
  mocks.session = guest();
  expect(await database.getOfflineTrack(track.url)).toBeNull();
  expect(databases.get('tutam_offline_audio')?.get('tracks')?.get(track.url)?.blob).toBe(track.blob);
});

it('keeps a public download available when a private album writes the same track URL', async () => {
  const url = '/api/audio/drive/shared-public-file';
  const publicTrack = { url, albumId: 'public-shared', title: 'Public title', blob: new Blob(['shared bytes']), downloadedAt: 1, visibility: 'public' as const };
  await database.putOfflineTrack(publicTrack);
  await database.putOfflineAlbum({ id: publicTrack.albumId, title: 'Public shared', desc: '', trackCount: 1, downloadedAt: 1 });
  const privateTrack = { ...publicTrack, albumId: privateAlbum.id, title: 'Private title', visibility: 'private' as const, ownerId: 'offline-admin-a' };
  await database.putOfflineTrack(privateTrack);
  mocks.session = guest();
  mocks.bundle = [{ id: publicTrack.albumId, tieu_de: 'Public shared', visibility: 'public', tracks: [{ title: 'Public title', url }] }];
  expect((await database.getOfflineTracksForAlbum(publicTrack.albumId)).map(row => row.url)).toEqual([url]);
  expect((await database.getOfflineTrack(url))?.blob.size).toBe(publicTrack.blob.size);
});

it('deletes only unreferenced blobs when removing albums that share downloaded public audio', async () => {
  const shared = '/api/audio/drive/shared-delete', onlyA = '/api/audio/drive/a-only-delete';
  for (const url of [shared, onlyA]) await database.putOfflineTrack({ url, albumId: 'delete-a', title: url,
    blob: new Blob([url]), downloadedAt: 1, visibility: 'public' });
  await database.putOfflineAlbum({ id: 'delete-a', title: 'A', desc: '', trackCount: 2, downloadedAt: 1,
    visibility: 'public', trackUrls: [shared, onlyA] });
  await database.putOfflineAlbum({ id: 'delete-b', title: 'B', desc: '', trackCount: 1, downloadedAt: 2,
    visibility: 'public', trackUrls: [shared] });
  expect((await database.getOfflineTracksForAlbum('delete-b')).map(row => row.url)).toEqual([shared]);
  await database.deleteOfflineAlbum('delete-a');
  expect(await database.getOfflineTrack(onlyA)).toBeNull();
  expect((await database.getOfflineTracksForAlbum('delete-b')).map(row => row.url)).toEqual([shared]);
  await database.deleteOfflineAlbum('delete-b');
  expect(databases.get('tutam_offline_audio')?.get('tracks')?.has(shared)).toBe(false);
});

it('retains a shared private blob for its other album without granting another principal access', async () => {
  const url = '/api/audio/drive/private-shared-delete';
  await database.putOfflineTrack({ url, albumId: 'private-delete-a', title: 'Private', blob: new Blob(['private']),
    downloadedAt: 1, visibility: 'private', ownerId: 'offline-admin-a' });
  for (const id of ['private-delete-a', 'private-delete-b']) await database.putOfflineAlbum({ id, title: id, desc: '',
    trackCount: 1, downloadedAt: 1, visibility: 'private', ownerId: 'offline-admin-a', trackUrls: [url] });
  await database.deleteOfflineAlbum('private-delete-a');
  expect((await database.getOfflineTracksForAlbum('private-delete-b')).map(row => row.url)).toEqual([url]);
  mocks.session = { ...mocks.session, user: { ...mocks.session.user!, id: 'offline-admin-b' } };
  expect(await database.getOfflineTrack(url)).toBeNull();
  mocks.session = { ...mocks.session, user: { ...mocks.session.user!, id: 'offline-admin-a' } };
  await database.deleteOfflineAlbum('private-delete-b');
  expect(databases.get('tutam_offline_audio')?.get('tracks')?.has(url)).toBe(false);
});

it('retains catalog-proven shared audio for a legacy album without trackUrls until its final removal', async () => {
  const url = '/api/audio/drive/legacy-shared-delete';
  await database.putOfflineTrack({ url, albumId: 'legacy-delete-a', title: 'Shared', blob: new Blob(['legacy shared']),
    downloadedAt: 1, visibility: 'public' });
  for (const id of ['legacy-delete-a', 'legacy-delete-b']) await database.putOfflineAlbum({ id, title: id, desc: '',
    trackCount: 1, downloadedAt: 1, visibility: 'public' });
  mocks.bundle = ['legacy-delete-a', 'legacy-delete-b'].map(id => ({ id, tieu_de: id, visibility: 'public', tracks: [{ url, title: 'Shared' }] }));
  expect((await database.getOfflineTracksForAlbum('legacy-delete-b')).map(row => row.url)).toEqual([url]);
  await database.deleteOfflineAlbum('legacy-delete-a');
  expect((await database.getOfflineTracksForAlbum('legacy-delete-b')).map(row => row.url)).toEqual([url]);
  await database.deleteOfflineAlbum('legacy-delete-b');
  expect(databases.get('tutam_offline_audio')?.get('tracks')?.has(url)).toBe(false);
});

it('rejects album deletion without changing stored bytes when local catalog resolution fails', async () => {
  const url = '/api/audio/drive/delete-proof-failure';
  await database.putOfflineTrack({ url, albumId: 'proof-failure', title: 'Retain', blob: new Blob(['retained']), downloadedAt: 1, visibility: 'public' });
  await database.putOfflineAlbum({ id: 'proof-failure', title: 'Retain', desc: '', trackCount: 1, downloadedAt: 1 });
  const resolver = await import('$lib/browser/offline-bundled-resolver');
  const spy = vi.spyOn(resolver, 'resolveOfflineBundledResponse').mockRejectedValueOnce(new Error('local storage failed'));
  try {
    await expect(database.deleteOfflineAlbum('proof-failure')).rejects.toThrow('local storage failed');
    expect(databases.get('tutam_offline_audio')?.get('albums')?.has('proof-failure')).toBe(true);
    expect(databases.get('tutam_offline_audio')?.get('tracks')?.has(url)).toBe(true);
  } finally { spy.mockRestore(); }
});

it('rejects a stale-principal deletion after local proof resolution and keeps the album', async () => {
  await database.putOfflineAlbum({ id: 'stale-delete', title: 'Retain', desc: '', trackCount: 0, downloadedAt: 1 });
  const resolver = await import('$lib/browser/offline-bundled-resolver');
  const spy = vi.spyOn(resolver, 'resolveOfflineBundledResponse').mockImplementationOnce(async () => {
    mocks.session = guest(); return Response.json([]);
  });
  try {
    await expect(database.deleteOfflineAlbum('stale-delete')).rejects.toMatchObject({ name: 'AbortError' });
    expect(databases.get('tutam_offline_audio')?.get('albums')?.has('stale-delete')).toBe(true);
  } finally { spy.mockRestore(); }
});

it('preserves all albums and blobs if reading the local cached catalog rejects before deletion', async () => {
  await database.putOfflineTrack({ url: '/api/audio/drive/cached-failure', albumId: 'cached-failure', title: 'Retain',
    blob: new Blob(['retained']), downloadedAt: 1, visibility: 'public' });
  await database.putOfflineAlbum({ id: 'cached-failure', title: 'Retain', desc: '', trackCount: 1, downloadedAt: 1 });
  const beforeAlbums = [...databases.get('tutam_offline_audio')!.get('albums')!.entries()];
  const beforeTracks = [...databases.get('tutam_offline_audio')!.get('tracks')!.entries()];
  const cache = await import('$lib/browser/talk-catalog-cache');
  const spy = vi.spyOn(cache, 'readCachedTalkCatalog').mockRejectedValueOnce(new Error('cached catalog failed'));
  try {
    await expect(database.deleteOfflineAlbum('cached-failure')).rejects.toThrow('cached catalog failed');
    expect([...databases.get('tutam_offline_audio')!.get('albums')!.entries()]).toEqual(beforeAlbums);
    expect([...databases.get('tutam_offline_audio')!.get('tracks')!.entries()]).toEqual(beforeTracks);
  } finally { spy.mockRestore(); }
});

it('rolls back album and blob deletion when principal changes before the queued cursor event', async () => {
  const url = '/api/audio/drive/stale-cursor-delete';
  await database.putOfflineTrack({ url, albumId: 'stale-cursor', title: 'Private', blob: new Blob(['private']),
    downloadedAt: 1, visibility: 'private', ownerId: 'offline-admin-a' });
  await database.putOfflineAlbum({ id: 'stale-cursor', title: 'Private', desc: '', trackCount: 1,
    downloadedAt: 1, visibility: 'private', ownerId: 'offline-admin-a', trackUrls: [url] });
  const beforeAlbums = [...databases.get('tutam_offline_audio')!.get('albums')!.entries()];
  const beforeTracks = [...databases.get('tutam_offline_audio')!.get('tracks')!.entries()];
  beforeCursorEvent = () => { mocks.session = { ...mocks.session, user: { ...mocks.session.user!, id: 'offline-admin-b' } }; };
  await expect(database.deleteOfflineAlbum('stale-cursor')).rejects.toMatchObject({ name: 'AbortError' });
  expect([...databases.get('tutam_offline_audio')!.get('albums')!.entries()]).toEqual(beforeAlbums);
  expect([...databases.get('tutam_offline_audio')!.get('tracks')!.entries()]).toEqual(beforeTracks);
});

it('retains shared public bytes for an unresolved other-principal legacy album without reading its private catalog', async () => {
  const url = '/api/audio/drive/cross-principal-legacy-delete';
  await database.putOfflineTrack({ url, albumId: 'public-delete-a', title: 'Public', blob: new Blob(['shared public']),
    downloadedAt: 1, visibility: 'public' });
  await database.putOfflineAlbum({ id: 'public-delete-a', title: 'Public', desc: '', trackCount: 1,
    downloadedAt: 1, visibility: 'public', trackUrls: [url] });
  mocks.session = { ...mocks.session, user: { ...mocks.session.user!, id: 'offline-admin-b' } };
  await database.putOfflineAlbum({ id: 'private-legacy-b', title: 'B private', desc: '', trackCount: 1,
    downloadedAt: 2, visibility: 'private', ownerId: 'offline-admin-b' });
  const cache = await import('$lib/browser/talk-catalog-cache');
  await cache.saveCachedTalkAlbums([{ id: 'private-legacy-b', tieu_de: 'B private', visibility: 'private', tracks: [{ url, title: 'Shared' }] }],
    cache.captureTalkCatalogScope('offline-admin-b', 'admin'));
  expect((await database.getOfflineTracksForAlbum('private-legacy-b')).map(row => row.url)).toEqual([url]);
  mocks.session = { ...mocks.session, user: { ...mocks.session.user!, id: 'offline-admin-a' } };
  const read = vi.spyOn(cache, 'readCachedTalkCatalog');
  try {
    await database.deleteOfflineAlbum('public-delete-a');
    expect(read.mock.calls.every(([scope]) => scope?.principalId !== 'offline-admin-b')).toBe(true);
  } finally { read.mockRestore(); }
  mocks.session = { ...mocks.session, user: { ...mocks.session.user!, id: 'offline-admin-b' } };
  expect((await database.getOfflineTracksForAlbum('private-legacy-b')).map(row => row.url)).toEqual([url]);
  await database.deleteOfflineAlbum('private-legacy-b');
  expect(databases.get('tutam_offline_audio')?.get('tracks')?.has(url)).toBe(false);
});

it('lets another privileged account reuse a private blob only after its own catalog proves the same album and URL', async () => {
  await downloadPrivate();
  mocks.session = { ...mocks.session, user: { ...mocks.session.user!, id: 'offline-admin-b' } };
  expect(await database.getOfflineTrack(privateAlbum.tracks[0].url)).toBeNull();
  const cache = await import('$lib/browser/talk-catalog-cache');
  const scope = cache.captureTalkCatalogScope(mocks.session.user!.id, 'admin');
  await cache.saveCachedTalkAlbums([{ id: privateAlbum.id, tieu_de: privateAlbum.title, visibility: 'private', tracks: privateAlbum.tracks }], scope);
  expect((await database.getOfflineTrack(privateAlbum.tracks[0].url))?.blob.size).toBe(new Blob(['private bytes']).size);
  mocks.session = { ...mocks.session, user: { ...mocks.session.user!, id: 'offline-admin-a' } };
  expect((await database.getOfflineTrack(privateAlbum.tracks[0].url))?.blob.size).toBe(new Blob(['private bytes']).size);
});

it('does not treat a fabricated public descriptor as proof to reuse another account private blob', async () => {
  await downloadPrivate();
  mocks.session = { ...mocks.session, user: { ...mocks.session.user!, id: 'offline-admin-b' } };
  expect(await database.canAccessAudioAlbum({ id: privateAlbum.id, visibility: 'public', tracks: privateAlbum.tracks })).toBe(false);
});

it('reuses private bytes for a current live catalog proof when persistent catalog writes fail', async () => {
  await downloadPrivate();
  mocks.session = { ...mocks.session, user: { ...mocks.session.user!, id: 'offline-admin-b' } };
  blockCatalogWrites = true;
  const fetched = await catalogs.fetchTalkAlbums(vi.fn(async () => Response.json([{
    id: privateAlbum.id, tieu_de: privateAlbum.title, visibility: 'private', tracks: privateAlbum.tracks,
  }])) as typeof fetch);
  const proof = await import('$lib/browser/talk-catalog-proof');
  const descriptor = proof.copyVerifiedTalkCatalog({ ...privateAlbum }, fetched[0]);
  const media = vi.fn(async () => new Response(new Blob(['unexpected refetch'])));
  await downloads.downloadAlbumForOffline(descriptor, { authorize: async () => {}, fetcher: media as typeof fetch });
  expect(media).not.toHaveBeenCalled();
  expect((await database.getOfflineTrack(privateAlbum.tracks[0].url))?.blob.size).toBe(new Blob(['private bytes']).size);
  const newBTrack = { url: '/api/audio/drive/b-only-new-file', albumId: privateAlbum.id, title: 'B-only track', blob: new Blob(['B-only bytes']), downloadedAt: 2, visibility: 'private' as const, ownerId: 'offline-admin-b' };
  await database.putOfflineTrack(newBTrack);
  await database.putOfflineAlbum({ id: privateAlbum.id, title: 'B-only album name', desc: 'B-only private description', trackCount: 2,
    downloadedAt: 2, visibility: 'private', ownerId: 'offline-admin-b', trackUrls: [privateAlbum.tracks[0].url, newBTrack.url] });
  mocks.session = { ...mocks.session, user: { ...mocks.session.user!, id: 'offline-admin-a' } };
  expect((await database.getOfflineTrack(privateAlbum.tracks[0].url))?.blob.size).toBe(new Blob(['private bytes']).size);
  const ownAlbum = (await database.listOfflineAlbums()).find(album => album.id === privateAlbum.id)!;
  expect(ownAlbum).toMatchObject({ title: privateAlbum.tracks[0].title, desc: '', trackCount: 1, trackUrls: [privateAlbum.tracks[0].url] });
  expect(JSON.stringify(ownAlbum)).not.toContain('B-only');
  expect((await database.getOfflineTracksForAlbum(privateAlbum.id)).map(track => track.url)).toEqual([privateAlbum.tracks[0].url]);
});

it('carries current live proof through real Query structural sharing despite catalog quota failure', async () => {
  blockCatalogWrites = true;
  const proof = await import('$lib/browser/talk-catalog-proof');
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, structuralSharing: proof.shareVerifiedTalkCatalog } } });
  let version = 1;
  const fetcher = vi.fn(async () => Response.json([{
    id: 'live-public', tieu_de: `Live public ${version}`, visibility: 'public',
    tracks: [{ title: 'Live track', url: `/api/audio/drive/live-public-${version}` }],
  }]));
  const query = { queryKey: ['live-public-proof'], queryFn: () => catalogs.fetchTalkAlbums(fetcher as typeof fetch), staleTime: 0 };
  try {
    await client.fetchQuery(query);
    version = 2;
    const changed = await client.fetchQuery(query);
    expect(changed[0].tieu_de).toBe('Live public 2');
    const mapped = proof.copyVerifiedTalkCatalog({ id: changed[0].id, visibility: changed[0].visibility, title: changed[0].tieu_de, tracks: changed[0].tracks }, changed[0]);
    expect(proof.hasVerifiedTalkCatalog(mapped)).toBe(true);
    expect(await database.canAccessAudioAlbum(mapped, { album: mapped })).toBe(true);
    const cached = client.getQueryData<typeof changed>(query.queryKey)!;
    expect(cached[0].tieu_de).toBe('Live public 2');
    expect(proof.hasVerifiedTalkCatalog(cached[0])).toBe(true);
    const unchanged = client.setQueryData<typeof changed>(query.queryKey, changed.slice())!;
    expect(unchanged).toBe(cached);
    expect(unchanged[0]).toBe(cached[0]);
    client.setQueryData(query.queryKey, JSON.parse(JSON.stringify(changed)));
    expect(proof.hasVerifiedTalkCatalog(client.getQueryData<typeof changed>(query.queryKey)![0])).toBe(false);
    const fresh = await client.fetchQuery(query);
    mocks.session = { ...mocks.session, user: { ...mocks.session.user!, id: 'other-admin' } };
    expect(proof.hasVerifiedTalkCatalog(fresh[0])).toBe(false);
    mocks.session = { ...mocks.session, user: { ...mocks.session.user!, id: 'offline-admin-a', role: 'user' } };
    expect(proof.hasVerifiedTalkCatalog(fresh[0])).toBe(false);
  } finally { client.clear(); }
});

it('does not finish writing a private download after the initiating principal logs out', async () => {
  let finish!: (response: Response) => void;
  const fetcher = vi.fn(() => new Promise<Response>(resolve => { finish = resolve; }));
  const pending = downloads.downloadAlbumForOffline(privateAlbum, { authorize: async () => {}, fetcher: fetcher as typeof fetch });
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
  mocks.session = guest();
  const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  finish(new Response(new Blob(['late private bytes'])));
  await rejected;
  expect(databases.get('tutam_offline_audio')?.get('tracks')?.size ?? 0).toBe(0);
});
