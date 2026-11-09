import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSessionStore, GUEST_SESSION, registerBrowserSessionStore } from '../../src/lib/stores/session.svelte';
import { captureTalkCatalogScope, saveCachedTalkAlbums } from '../../src/lib/browser/talk-catalog-cache';
import {
  fetchAdminPracticeArticles,
  fetchAdminTalkAlbums,
  fetchHomepageArticles,
  fetchPracticeCatalog,
  fetchTalkAlbums,
  matchesTalkMetadataFilters,
  talkSpeaker,
} from '../../src/lib/browser/content-catalogs';

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

describe('talk catalog session visibility', () => {
  let unregister: (() => void) | undefined;
  afterEach(() => { unregister?.(); unregister = undefined; vi.unstubAllGlobals(); });
  function adminCatalogSession() {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    });
    const store = createSessionStore({ authenticated: true, user: { id: 'catalog-admin', email: '', avatarUrl: '', displayName: 'Admin', role: 'admin' }, csrfToken: 'test', expiresAt: null });
    unregister = registerBrowserSessionStore(store);
    return store;
  }
  const rows = [
    { id: 'public-talk', tieu_de: 'Public', visibility: 'public', tracks: [{ title: 'Public track', url: '/public.mp3' }] },
    { id: 'private-talk', tieu_de: 'Private', visibility: 'private', tracks: [{ title: 'Private track', url: '/private.mp3' }] },
  ];

  it('keeps a privileged cached catalog usable offline but hides it after logout', async () => {
    const session = adminCatalogSession();
    const fetcher = vi.fn(async () => jsonResponse(rows));
    expect((await fetchTalkAlbums(fetcher as typeof fetch)).map(album => album.id)).toContain('private-talk');
    const offlineFetcher = vi.fn(async () => { throw new Error('offline'); });
    expect((await fetchTalkAlbums(offlineFetcher as typeof fetch)).map(album => album.id)).toContain('private-talk');
    expect(offlineFetcher).not.toHaveBeenCalled();
    session.set(GUEST_SESSION);
    expect((await fetchTalkAlbums(offlineFetcher as typeof fetch)).map(album => album.id)).toEqual(['public-talk']);
    expect(offlineFetcher).not.toHaveBeenCalled();
  });

  it('does not publish or cache a privileged response arriving after logout', async () => {
    const session = adminCatalogSession();
    let finish!: (response: Response) => void;
    const fetcher = vi.fn(() => new Promise<Response>(resolve => { finish = resolve; }));
    const pending = fetchTalkAlbums(fetcher as typeof fetch);
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
    session.set(GUEST_SESSION);
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    finish(jsonResponse(rows));
    await rejected;
    const guestFetcher = vi.fn(async () => jsonResponse([rows[0]]));
    expect((await fetchTalkAlbums(guestFetcher as typeof fetch)).map(album => album.id)).toEqual(['public-talk']);
  });

  it('retains the same privileged principal cache across token refresh and removes it on role loss', async () => {
    const session = adminCatalogSession();
    await fetchTalkAlbums(vi.fn(async () => jsonResponse(rows)) as typeof fetch);
    session.set({ ...session.value, csrfToken: 'refreshed-token' });
    const offlineFetcher = vi.fn(async () => { throw new Error('offline'); });
    expect((await fetchTalkAlbums(offlineFetcher as typeof fetch)).map(album => album.id)).toContain('private-talk');
    session.set({ ...session.value, user: { ...session.value.user!, role: 'user' } });
    expect((await fetchTalkAlbums(offlineFetcher as typeof fetch)).map(album => album.id)).toEqual(['public-talk']);
    expect(localStorage.getItem('quangtu_cached_talk_catalog_v1')).not.toContain('private-talk');
    expect(offlineFetcher).not.toHaveBeenCalled();
  });

  it('restores private offline metadata only for the same privileged principal', async () => {
    const session = adminCatalogSession();
    await fetchTalkAlbums(vi.fn(async () => jsonResponse(rows)) as typeof fetch);
    const savedSession = session.value;
    unregister?.();
    const restored = createSessionStore(savedSession);
    unregister = registerBrowserSessionStore(restored);
    const offlineFetcher = vi.fn(async () => { throw new Error('offline'); });
    expect((await fetchTalkAlbums(offlineFetcher as typeof fetch)).map(album => album.id)).toContain('private-talk');
    restored.set({ ...restored.value, user: { ...restored.value.user!, id: 'other-admin' } });
    expect((await fetchTalkAlbums(offlineFetcher as typeof fetch)).map(album => album.id)).toEqual(['public-talk']);
    expect(localStorage.getItem('quangtu_cached_talk_catalog_v1')).not.toContain('private-talk');
    expect(offlineFetcher).toHaveBeenCalledOnce();
  });

  it('denies private rows while startup guest is unverified and purges on verified guest even without an identity change', async () => {
    adminCatalogSession();
    await fetchTalkAlbums(vi.fn(async () => jsonResponse(rows)) as typeof fetch);
    unregister?.();
    const pendingGuest = createSessionStore(GUEST_SESSION);
    unregister = registerBrowserSessionStore(pendingGuest);
    const offlineFetcher = vi.fn(async () => { throw new Error('offline'); });
    expect((await fetchTalkAlbums(offlineFetcher as typeof fetch)).map(album => album.id)).toEqual(['public-talk']);
    expect(localStorage.getItem('quangtu_cached_talk_catalog_v1')).toContain('private-talk');
    pendingGuest.set(GUEST_SESSION);
    expect(localStorage.getItem('quangtu_cached_talk_catalog_v1')).not.toContain('private-talk');
    expect(offlineFetcher).not.toHaveBeenCalled();
  });

  it('uses the existing root session context before the browser session registration mounts', async () => {
    const session = adminCatalogSession();
    await fetchTalkAlbums(vi.fn(async () => jsonResponse(rows)) as typeof fetch);
    const rootContext = session.value;
    unregister?.(); unregister = undefined;
    const offlineFetcher = vi.fn(async () => { throw new Error('offline'); });
    expect((await fetchTalkAlbums(offlineFetcher as typeof fetch, undefined, rootContext)).map(album => album.id)).toContain('private-talk');
    expect(offlineFetcher).not.toHaveBeenCalled();
  });

  it('purges an old account private cache when the cold-start account is first verified with the same identity', async () => {
    const previous = adminCatalogSession();
    await fetchTalkAlbums(vi.fn(async () => jsonResponse(rows)) as typeof fetch);
    unregister?.();
    const coldAccount = createSessionStore({ ...previous.value, user: { ...previous.value.user!, id: 'cold-account-b' } }, false);
    unregister = registerBrowserSessionStore(coldAccount);
    expect(localStorage.getItem('quangtu_cached_talk_catalog_v1')).toContain('private-talk');
    coldAccount.set({ ...coldAccount.value, csrfToken: 'verified-b' });
    expect(localStorage.getItem('quangtu_cached_talk_catalog_v1')).not.toContain('private-talk');
    expect(localStorage.getItem('quangtu_cached_talk_catalog_v1')).toContain('public-talk');
  });

  it.each(['offline', 'network-error', 'server-error', 'html-response'] as const)('retains inaccessible private disk metadata when startup guest refresh is unverified (%s)', async (failure) => {
    adminCatalogSession();
    await fetchTalkAlbums(vi.fn(async () => jsonResponse(rows)) as typeof fetch);
    unregister?.();
    const pendingGuest = createSessionStore(GUEST_SESSION);
    unregister = registerBrowserSessionStore(pendingGuest);
    vi.stubGlobal('navigator', { onLine: failure !== 'offline' });
    const network = vi.fn(async () => {
      if (failure === 'network-error') throw new Error('offline');
      if (failure === 'html-response') return new Response('<html>Unavailable</html>', { headers: { 'content-type': 'text/html' } });
      return jsonResponse({}, 503);
    });
    vi.stubGlobal('fetch', network);
    await pendingGuest.refresh();
    expect(network).toHaveBeenCalledTimes(failure === 'offline' ? 0 : 1);
    expect(localStorage.getItem('quangtu_cached_talk_catalog_v1')).toContain('private-talk');
    const offlineFetcher = vi.fn(async () => { throw new Error('offline'); });
    expect((await fetchTalkAlbums(offlineFetcher as typeof fetch)).map(album => album.id)).toEqual(['public-talk']);
    expect(offlineFetcher).not.toHaveBeenCalled();
    pendingGuest.set(GUEST_SESSION);
    expect(localStorage.getItem('quangtu_cached_talk_catalog_v1')).not.toContain('private-talk');
  });

  it('returns a public response without overwriting private-only cache while startup guest is unverified', async () => {
    adminCatalogSession();
    await fetchTalkAlbums(vi.fn(async () => jsonResponse([rows[1]])) as typeof fetch);
    unregister?.();
    const pendingGuest = createSessionStore(GUEST_SESSION);
    unregister = registerBrowserSessionStore(pendingGuest);
    const loadPublic = vi.fn(async () => jsonResponse([rows[0]]));
    expect((await fetchTalkAlbums(loadPublic as typeof fetch)).map(album => album.id)).toEqual(['public-talk']);
    expect(loadPublic).toHaveBeenCalledOnce();
    expect(localStorage.getItem('quangtu_cached_talk_catalog_v1')).toContain('private-talk');
  });

  it('preserves an unverified old private cache when bundle additions try to save public rows', async () => {
    adminCatalogSession();
    await fetchTalkAlbums(vi.fn(async () => jsonResponse(rows)) as typeof fetch);
    unregister?.();
    unregister = registerBrowserSessionStore(createSessionStore(GUEST_SESSION));
    const scope = captureTalkCatalogScope(null, 'guest');
    await saveCachedTalkAlbums([rows[0], { ...rows[0], id: 'bundle-addition' }], scope);
    expect(localStorage.getItem('quangtu_cached_talk_catalog_v1')).toContain('private-talk');
  });
});

describe('client content catalogs', () => {
  it('loads complete homepage records, merges views and preserves role visibility', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('luot_xem')) return jsonResponse([{ bai_viet_id: 'story', so_luot: 12 }]);
      return jsonResponse([
        { id: 'story', tieu_de: 'Chuyện lành', noi_dung: '<p>Đủ nội dung</p>', danh_muc: 'CHUYỆN NHÂN QUẢ', trang_thai: 'Hoàn thành' },
        { id: 'sutra', tieu_de: 'Kinh', noi_dung: '<p>Kinh</p>', danh_muc: 'KINH PHẬT', trang_thai: 'Hoàn thành' }
      ]);
    });

    const guest = await fetchHomepageArticles(fetcher as typeof fetch, 'guest');
    const admin = await fetchHomepageArticles(fetcher as typeof fetch, 'admin');

    expect(guest).toHaveLength(1);
    expect(guest[0]).toMatchObject({ id: 'story', content: '<p>Đủ nội dung</p>', viewCount: 12 });
    expect(admin.map((article) => article.id)).toEqual(['story', 'sutra']);
  });

  it('normalizes full talk tracks from the single catalog response', async () => {
    const fetcher = vi.fn(async () => jsonResponse([{
      id: 'album-1',
      tieu_de: 'Pháp thoại',
      tracks: JSON.stringify([{ title: 'Bài 1', url: '/api/audio/drive/file-1', duration_sec: 10.4 }])
    }]));

    const albums = await fetchTalkAlbums(fetcher as typeof fetch);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(albums[0].tracks).toEqual([{ title: 'Bài 1', url: '/api/audio/drive/file-1', duration_sec: 10 }]);
  });

  it('normalizes speaker metadata, keeps a legacy fallback, and combines speaker with duration filters', async () => {
    const fetcher = vi.fn(async () => jsonResponse([
      { id: 'short', tieu_de: 'Ngắn', dien_gia: 'Thầy A', tracks: [{ title: 'Bài', url: '/a', duration_sec: 600 }] },
      { id: 'long', tieu_de: 'Dài', dien_gia: 'Thầy A', tracks: [{ title: 'Bài', url: '/b', duration_sec: 3600 }] },
      { id: 'legacy', tieu_de: 'Cũ', tracks: [{ title: 'Bài', url: '/c' }] },
    ]));
    const albums = await fetchTalkAlbums(fetcher as typeof fetch);

    expect(talkSpeaker(albums.find((album) => album.id === 'legacy')!)).toBe('Chưa xác định');
    expect(albums.filter((album) => matchesTalkMetadataFilters(album, 'Thầy A', 'short')).map((album) => album.id)).toEqual(['short']);
    expect(albums.filter((album) => matchesTalkMetadataFilters(album, 'Chưa xác định', 'unknown')).map((album) => album.id)).toEqual(['legacy']);
    expect(String(fetcher.mock.calls[0][0])).toContain('dien_gia');
  });

  it('keeps empty talk albums for the admin catalog while the public catalog hides them', async () => {
    const fetcher = vi.fn(async () => jsonResponse([
      {
        id: 'album-empty',
        tieu_de: 'Album trống',
        visibility: 'public',
        tracks: []
      },
      {
        id: 'album-public',
        tieu_de: 'Album có track',
        visibility: 'public',
        tracks: [{ title: 'Bài 1', url: '/api/audio/drive/file-1', duration_sec: 9.5 }]
      }
    ]));

    const publicAlbums = await fetchTalkAlbums(fetcher as typeof fetch);
    const adminAlbums = await fetchAdminTalkAlbums(fetcher as typeof fetch);

    expect(publicAlbums.map((album) => album.id)).toEqual(['album-public']);
    expect(adminAlbums.map((album) => album.id)).toEqual(['album-empty', 'album-public']);
  });

  it('keeps only practice categories in the CSR practice catalog', async () => {
    const fetcher = vi.fn(async () => jsonResponse([
      { id: 'kinh', tieu_de: 'Kinh', danh_muc: 'KINH PHẬT' },
      { id: 'ritual', tieu_de: 'Nghi thức', danh_muc: 'CÁC NGHI THỨC' },
      { id: 'story', tieu_de: 'Chuyện', danh_muc: 'CHUYỆN NHÂN QUẢ' }
    ]));

    const articles = await fetchPracticeCatalog(fetcher as typeof fetch);

    expect(articles.map((article) => article.id)).toEqual(['kinh', 'ritual']);
  });

  it('keeps only practice categories in the admin practice catalog too', async () => {
    const fetcher = vi.fn(async () => jsonResponse([
      { id: 'kinh', tieu_de: 'Kinh', danh_muc: 'KINH PHẬT' },
      { id: 'ritual', tieu_de: 'Nghi thức', danh_muc: 'CÁC NGHI THỨC' },
      { id: 'story', tieu_de: 'Chuyện', danh_muc: 'CHUYỆN NHÂN QUẢ' }
    ]));

    const articles = await fetchAdminPracticeArticles(fetcher as typeof fetch);

    expect(articles.map((article) => article.id)).toEqual(['kinh', 'ritual']);
  });

  it('loads every page for admin catalogs instead of reporting a truncated total', async () => {
    const firstPage = Array.from({ length: 500 }, (_, index) => ({
      id: `kinh-${index}`,
      tieu_de: `Kinh ${index}`,
      danh_muc: 'KINH PHẬT'
    }));
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      return jsonResponse(url.includes('offset=500')
        ? [{ id: 'nghi-thuc-cuoi', tieu_de: 'Nghi thức cuối', danh_muc: 'CÁC NGHI THỨC' }]
        : firstPage);
    });

    const articles = await fetchAdminPracticeArticles(fetcher as typeof fetch);

    expect(articles).toHaveLength(501);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual([
      expect.stringContaining('limit=500&offset=0'),
      expect.stringContaining('limit=500&offset=500')
    ]);
  });
});
