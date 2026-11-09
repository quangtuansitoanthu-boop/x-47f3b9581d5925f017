import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as sessionStore from '$lib/stores/session.svelte';

const getOfflineTrack = vi.fn();
const offlineStorageBytes = vi.fn();
const putOfflineTrack = vi.fn();
const putOfflineAlbum = vi.fn();
const bundledSizes = vi.hoisted(() => ({
  version: 1,
  checkedAt: '2026-11-04T00:00:00.000Z',
  albums: {} as Record<string, Record<string, number>>,
}));

vi.mock('$lib/data/audio-download-sizes.json', () => ({ default: bundledSizes }));

vi.mock('$lib/browser/offline-audio-database', () => ({
  getOfflineTrack,
  offlineStorageBytes,
  putOfflineTrack,
  putOfflineAlbum
}));

const {
  ZIP_DOWNLOAD_MAX_BYTES,
  archiveAlbumZipUrl,
  readAlbumDownloadSize,
  downloadAlbumAsZip,
  downloadAlbumForOffline,
  downloadSingleTrackFile,
} = await import('$lib/browser/audio-downloads');

describe('offline album downloads', () => {
  it('does not export a cached track if cancelled while its local read is pending', async () => {
    const controller = new AbortController();
    getOfflineTrack.mockImplementationOnce(async () => {
      controller.abort();
      return { blob: new Blob(['saved']) };
    });
    const fetcher = vi.fn();
    await expect(downloadSingleTrackFile({ title: 'Cached', url: '/cached.mp3' }, {
      signal: controller.signal, authorize: vi.fn().mockResolvedValue(undefined), fetcher,
    })).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('does not open a direct archive ZIP after cancellation during authorization', async () => {
    const controller = new AbortController();
    const fetcher = vi.fn();
    const authorize = vi.fn(async () => { controller.abort(); });
    await expect(downloadAlbumAsZip({ id: 'cancel-archive', title: 'Album', desc: '', archiveId: 'valid-archive',
      tracks: [{ title: 'Track', url: '/track.mp3' }],
    }, { signal: controller.signal, authorize, fetcher })).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('does not export a fetched track when cancellation arrives with the final body chunk', async () => {
    const controller = new AbortController();
    const fetcher = vi.fn(async () => new Response(new ReadableStream({
      start(stream) { stream.enqueue(new Uint8Array([1])); },
      pull(stream) { controller.abort(); stream.close(); },
    })));
    await expect(downloadSingleTrackFile({ title: 'Track', url: '/track.mp3' }, {
      signal: controller.signal, authorize: vi.fn().mockResolvedValue(undefined), fetcher,
    })).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('rejects a known remaining album size before authorization or media fetch when safe quota is insufficient', async () => {
    const authorize = vi.fn();
    const fetcher = vi.fn();
    await expect(downloadAlbumForOffline({ id: 'quota-preflight', title: 'Audio', desc: '', tracks: [
      { title: 'Track', url: '/track.mp3' },
    ] }, { authorize, fetcher, expectedRemainingBytes: 91, quota: { usageBytes: 100, quotaBytes: 200 } }))
      .rejects.toThrow('offline_audio_quota_exceeded');
    expect(authorize).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
    expect(putOfflineTrack).not.toHaveBeenCalled();
  });

  it('stops a chunked track at the remaining quota and retains already completed tracks for resume', async () => {
    const authorize = vi.fn().mockResolvedValue(undefined);
    const cancel = vi.fn();
    const fetcher = vi.fn().mockResolvedValueOnce(new Response('first')).mockResolvedValueOnce(new Response(new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(86)); }, cancel,
    })));
    await expect(downloadAlbumForOffline({ id: 'quota-stream', title: 'Audio', desc: '', tracks: [
      { title: 'First', url: '/first.mp3' }, { title: 'Second', url: '/second.mp3' },
    ] }, { authorize, fetcher, quota: { usageBytes: 0, quotaBytes: 100 } })).rejects.toThrow('offline_audio_quota_exceeded');
    expect(cancel).toHaveBeenCalled();
    expect(putOfflineTrack).toHaveBeenCalledTimes(1);
    expect(putOfflineTrack).toHaveBeenCalledWith(expect.objectContaining({ title: 'First' }), expect.any(Object));
    expect(putOfflineAlbum).not.toHaveBeenCalled();
  });

  it('keeps unknown-quota downloads available without a metadata request or an arbitrary ZIP-size cap', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('audio'));
    await downloadAlbumForOffline({ id: 'quota-unknown', title: 'Audio', desc: '', tracks: [
      { title: 'Track', url: '/track.mp3' },
    ] }, { authorize: vi.fn().mockResolvedValue(undefined), fetcher, quota: { usageBytes: 0, quotaBytes: null }, expectedRemainingBytes: 228291585 });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(putOfflineTrack).toHaveBeenCalledTimes(1);
  });

  it('reads one metadata payload, sums only album tracks and skips local blobs', async () => {
    getOfflineTrack.mockResolvedValueOnce({ blob: new Blob(['saved']) }).mockResolvedValueOnce(null);
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ result: [
      { name: 'one.mp3', size: '100' }, { name: 'two.mp3', size: '2000000' },
      { name: 'cover.jpg', size: '99999999' },
    ] })));
    expect(await readAlbumDownloadSize({ id: 'a', title: 'A', desc: '', tracks: [
      { title: 'One', url: 'https://archive.org/download/example/one.mp3' },
      { title: 'Two', url: 'https://archive.org/download/example/two.mp3' },
    ] }, { fetcher })).toEqual({ bytes: 2000000, remaining: 1 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('does not probe unsupported sources or invent bytes for missing metadata', async () => {
    const fetcher = vi.fn();
    expect(await readAlbumDownloadSize({ id: 'a', title: 'A', desc: '', tracks: [
      { title: 'One', url: 'https://example.com/one.mp3' },
    ] }, { fetcher })).toEqual({ bytes: null, remaining: 1 });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('reads one Drive metadata response and sums only tracks still missing offline', async () => {
    getOfflineTrack.mockResolvedValueOnce({ blob: new Blob(['saved']) }).mockResolvedValueOnce(null);
    const controller = new AbortController();
    const fetcher = vi.fn().mockResolvedValue(Response.json({ albumId: 'drive album', tracks: [
      { url: '/api/audio/drive/first-track', bytes: 100 },
      { url: '/api/audio/drive/second-track', bytes: 2000000 },
      { url: '/api/audio/drive/not-in-album', bytes: 99999999 },
    ] }));
    expect(await readAlbumDownloadSize({ id: 'drive album', title: 'A', desc: '', tracks: [
      { title: 'One', url: '/api/audio/drive/first-track' },
      { title: 'Two', url: '/api/audio/drive/second-track' },
    ] }, { fetcher, signal: controller.signal })).toEqual({ bytes: 2000000, remaining: 1 });
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(
      '/api/talks/drive%20album/download-size', { signal: controller.signal, credentials: 'include' },
    );
    expect(putOfflineTrack).not.toHaveBeenCalled();
    expect(putOfflineAlbum).not.toHaveBeenCalled();
  });

  it('uses verified bundled Drive sizes without an API request and skips saved tracks', async () => {
    bundledSizes.albums.a = {
      '/api/audio/drive/first-track': 100,
      '/api/audio/drive/second-track': 2000000,
    };
    getOfflineTrack.mockResolvedValueOnce({ blob: new Blob(['saved']) }).mockResolvedValueOnce(null);
    const fetcher = vi.fn();
    expect(await readAlbumDownloadSize({ id: 'a', title: 'A', desc: '', tracks: [
      { title: 'One', url: '/api/audio/drive/first-track' },
      { title: 'Two', url: '/api/audio/drive/second-track' },
    ] }, { fetcher })).toEqual({ bytes: 2000000, remaining: 1 });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each(['changed-url', 'missing-album', 'unknown-version', 'unsafe-size'] as const)(
    'falls back to one Drive metadata request for bundled metadata with %s', async mode => {
      bundledSizes.albums.a = { '/api/audio/drive/old-track': 100 };
      if (mode === 'missing-album') bundledSizes.albums = {};
      if (mode === 'unknown-version') bundledSizes.version = 2;
      if (mode === 'unsafe-size') bundledSizes.albums.a = { '/api/audio/drive/first-track': -1 };
      const fetcher = vi.fn().mockResolvedValue(Response.json({ albumId: 'a', tracks: [
        { url: '/api/audio/drive/first-track', bytes: 12345 },
      ] }));
      expect(await readAlbumDownloadSize({ id: 'a', title: 'A', desc: '', tracks: [
        { title: 'One', url: '/api/audio/drive/first-track' },
      ] }, { fetcher })).toEqual({ bytes: 12345, remaining: 1 });
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    { albumId: 'other-album', tracks: [{ url: '/api/audio/drive/first-track', bytes: 10 }] },
    { albumId: 'a', tracks: [] },
    { albumId: 'a', tracks: [{ url: '/api/audio/drive/first-track', bytes: null }] },
    { albumId: 'a', tracks: [{ url: '/api/audio/drive/first-track', bytes: -1 }] },
    { albumId: 'a', tracks: [{ url: '/api/audio/drive/first-track', bytes: '100' }] },
    { albumId: 'a', tracks: [{ url: '/api/audio/drive/first-track', bytes: 1.5 }] },
    { albumId: 'a', tracks: [{ url: 'https://other.example/api/audio/drive/first-track', bytes: 100 }] },
    { albumId: 'a', tracks: [
      { url: '/api/audio/drive/first-track', bytes: 100 },
      { url: '/api/audio/drive/first-track', bytes: 200 },
    ] },
  ])('keeps unknown size for incomplete or invalid Drive metadata %#', async data => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(data));
    expect(await readAlbumDownloadSize({ id: 'a', title: 'A', desc: '', tracks: [
      { title: 'One', url: '/api/audio/drive/first-track' },
    ] }, { fetcher })).toEqual({ bytes: null, remaining: 1 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('accepts known zero-byte Drive files but rejects an unsafe total', async () => {
    const album = { id: 'a', title: 'A', desc: '', tracks: [
      { title: 'One', url: '/api/audio/drive/first-track' },
      { title: 'Two', url: '/api/audio/drive/second-track' },
    ] };
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json({ albumId: 'a', tracks: album.tracks.map(track => ({ ...track, bytes: 0 })) }))
      .mockResolvedValueOnce(Response.json({ albumId: 'a', tracks: album.tracks.map(track => ({ ...track, bytes: Number.MAX_SAFE_INTEGER })) }));
    expect(await readAlbumDownloadSize(album, { fetcher })).toEqual({ bytes: 0, remaining: 2 });
    expect(await readAlbumDownloadSize(album, { fetcher })).toEqual({ bytes: null, remaining: 2 });
  });

  it('makes no Drive metadata request if all tracks are offline or the read is aborted', async () => {
    const album = { id: 'a', title: 'A', desc: '', tracks: [{ title: 'One', url: '/api/audio/drive/first-track' }] };
    const fetcher = vi.fn();
    getOfflineTrack.mockResolvedValue({ blob: new Blob(['saved']) });
    expect(await readAlbumDownloadSize(album, { fetcher })).toEqual({ bytes: 0, remaining: 0 });
    const controller = new AbortController(); controller.abort();
    await expect(readAlbumDownloadSize(album, { fetcher, signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('rejects a Drive metadata response after cancellation even if the fetcher ignores abort', async () => {
    const controller = new AbortController();
    const fetcher = vi.fn().mockImplementation(async () => {
      controller.abort();
      return Response.json({ albumId: 'a', tracks: [{ url: '/api/audio/drive/first-track', bytes: 100 }] });
    });
    await expect(readAlbumDownloadSize({ id: 'a', title: 'A', desc: '', tracks: [
      { title: 'One', url: '/api/audio/drive/first-track' },
    ] }, { fetcher, signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('rejects Drive metadata returned after the principal changes', async () => {
    const original = sessionStore.getBrowserSessionSnapshot();
    const session = vi.spyOn(sessionStore, 'getBrowserSessionSnapshot').mockReturnValue(original);
    const fetcher = vi.fn().mockImplementation(async () => {
      session.mockReturnValue({ authenticated: true, csrfToken: null, expiresAt: null,
        user: { id: 'other-owner', email: '', avatarUrl: '', displayName: '', role: 'user' } });
      return Response.json({ albumId: 'a', tracks: [{ url: '/api/audio/drive/first-track', bytes: 100 }] });
    });
    try {
      await expect(readAlbumDownloadSize({ id: 'a', title: 'A', desc: '', tracks: [
        { title: 'One', url: '/api/audio/drive/first-track' },
      ] }, { fetcher })).rejects.toMatchObject({ name: 'AbortError' });
    } finally { session.mockRestore(); }
  });

  it('reports a missing Drive metadata endpoint as an error for the existing unknown-size fallback', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
    await expect(readAlbumDownloadSize({ id: 'a', title: 'A', desc: '', tracks: [
      { title: 'One', url: '/api/audio/drive/first-track' },
    ] }, { fetcher })).rejects.toThrow('audio_metadata_failed:404');
  });

  it('reports unknown if metadata omits a track and makes no authorization or write', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ result: [] })));
    expect(await readAlbumDownloadSize({ id: 'a', title: 'A', desc: '', tracks: [
      { title: 'One', url: 'https://archive.org/download/example/one.mp3' },
    ] }, { fetcher })).toEqual({ bytes: null, remaining: 1 });
    expect(putOfflineTrack).not.toHaveBeenCalled();
    expect(putOfflineAlbum).not.toHaveBeenCalled();
  });

  it('makes no metadata request when every track is already saved', async () => {
    getOfflineTrack.mockResolvedValue({ blob: new Blob(['saved']) });
    const fetcher = vi.fn();
    expect(await readAlbumDownloadSize({ id: 'a', title: 'A', desc: '', tracks: [
      { title: 'One', url: 'https://archive.org/download/example/one.mp3' },
    ] }, { fetcher })).toEqual({ bytes: 0, remaining: 0 });
    expect(fetcher).not.toHaveBeenCalled();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    bundledSizes.version = 1;
    bundledSizes.albums = {};
    getOfflineTrack.mockResolvedValue(null);
    offlineStorageBytes.mockResolvedValue(0);
    putOfflineTrack.mockResolvedValue(undefined);
    putOfflineAlbum.mockResolvedValue(undefined);
  });

  it('builds a safe direct Archive.org MP3 ZIP URL for large legacy albums', () => {
    expect(archiveAlbumZipUrl('lucto-1-01_202607')).toBe(
      'https://archive.org/compress/lucto-1-01_202607/formats=VBR%20MP3&file=/lucto-1-01_202607.zip',
    );
    expect(archiveAlbumZipUrl('../invalid')).toBeNull();
    expect(archiveAlbumZipUrl('')).toBeNull();
  });

  it('coalesces duplicate starts and persists each completed track once', async () => {
    const authorize = vi.fn().mockResolvedValue(undefined);
    const fetcher = vi.fn().mockImplementation(async (url: string) =>
      new Response(new Blob([url]), { status: 200 })
    );
    const album = {
      id: 'album-1', title: 'Kinh thử', desc: 'Mô tả',
      tracks: [{ title: 'Bài 1', url: 'https://media.quangtu.vn/1.mp3' }]
    };

    const first = downloadAlbumForOffline(album, { authorize, fetcher });
    const second = downloadAlbumForOffline(album, { authorize, fetcher });
    expect(second).toBe(first);
    await first;

    expect(authorize).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(putOfflineTrack).toHaveBeenCalledTimes(1);
    expect(putOfflineAlbum).toHaveBeenCalledWith(expect.objectContaining({ id: 'album-1', trackCount: 1 }), expect.any(Object));
  });

  it('resumes an album without downloading tracks already present in v1 IndexedDB', async () => {
    getOfflineTrack.mockResolvedValue({ url: 'https://media.quangtu.vn/1.mp3', blob: new Blob(['saved']) });
    const fetcher = vi.fn();

    await downloadAlbumForOffline(
      { id: 'album-2', title: 'Đã tải dở', desc: '', tracks: [{ title: 'Bài 1', url: 'https://media.quangtu.vn/1.mp3' }] },
      { authorize: vi.fn().mockResolvedValue(undefined), fetcher }
    );

    expect(fetcher).not.toHaveBeenCalled();
    expect(putOfflineTrack).not.toHaveBeenCalled();
    expect(putOfflineAlbum).toHaveBeenCalledTimes(1);
  });

  it('stops an in-flight album cleanly and allows the same album to resume', async () => {
    const album = {
      id: 'album-stop-resume',
      title: 'Album tải tiếp',
      desc: '',
      tracks: [{ title: 'Bài 1', url: 'https://media.quangtu.vn/1.mp3' }]
    };
    const controller = new AbortController();
    const waitingFetch = vi.fn().mockImplementation((_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(init.signal?.reason ?? new DOMException('Aborted', 'AbortError'));
        }, { once: true });
      })
    );

    const stopped = downloadAlbumForOffline(album, {
      authorize: vi.fn().mockResolvedValue(undefined),
      fetcher: waitingFetch,
      signal: controller.signal
    });
    controller.abort(new DOMException('Aborted', 'AbortError'));

    await expect(stopped).rejects.toMatchObject({ name: 'AbortError' });
    expect(putOfflineTrack).not.toHaveBeenCalled();
    expect(putOfflineAlbum).not.toHaveBeenCalled();

    const resumedFetch = vi.fn().mockResolvedValue(new Response(new Blob(['audio']), { status: 200 }));
    await downloadAlbumForOffline(album, {
      authorize: vi.fn().mockResolvedValue(undefined),
      fetcher: resumedFetch
    });

    expect(resumedFetch).toHaveBeenCalledTimes(1);
    expect(putOfflineTrack).toHaveBeenCalledTimes(1);
    expect(putOfflineAlbum).toHaveBeenCalledWith(expect.objectContaining({ id: album.id }), expect.any(Object));
  });

  it('aborts zip creation when cumulative album size crosses the conservative browser bound', async () => {
    const trackBytes = Math.floor(ZIP_DOWNLOAD_MAX_BYTES / 2) + 8_192;
    const fetcher = vi.fn().mockImplementation(() => new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(trackBytes));
          controller.close();
        },
      }),
      { status: 200 },
    ));

    await expect(downloadAlbumAsZip(
      {
        id: 'album-zip',
        title: 'Album quá lớn',
        desc: '',
        tracks: [
          { title: 'Bài 1', url: 'https://media.quangtu.vn/1.mp3' },
          { title: 'Bài 2', url: 'https://media.quangtu.vn/2.mp3' },
        ],
      },
      { authorize: vi.fn().mockResolvedValue(undefined), fetcher },
    )).rejects.toThrow('zip_album_too_large');

    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('reuses offline track blob when present and triggers download directly', async () => {
    const offlineBlob = new Blob(['cached-audio'], { type: 'audio/mpeg' });
    getOfflineTrack.mockResolvedValue({ url: 'https://media.quangtu.vn/saved.mp3', blob: offlineBlob });
    const authorize = vi.fn().mockResolvedValue(undefined);
    const fetcher = vi.fn();
    const onProgress = vi.fn();

    await downloadSingleTrackFile(
      { title: 'Bài lưu sẵn', url: 'https://media.quangtu.vn/saved.mp3' },
      { authorize, fetcher, onProgress },
    );

    expect(authorize).toHaveBeenCalledTimes(1);
    expect(fetcher).not.toHaveBeenCalled();
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({
      completed: 1,
      total: 1,
      bytesDownloaded: offlineBlob.size,
    }));
  });

  it('streams track from network with progress when not offline', async () => {
    const trackBytes = new Uint8Array([1, 2, 3, 4]);
    const authorize = vi.fn().mockResolvedValue(undefined);
    const fetcher = vi.fn().mockResolvedValue(new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(trackBytes);
          controller.close();
        },
      }),
      { status: 200, headers: { 'content-type': 'audio/mpeg', 'content-length': '4' } },
    ));
    const onProgress = vi.fn();

    await downloadSingleTrackFile(
      { title: 'Bài mới', url: 'https://media.quangtu.vn/new.mp3' },
      { authorize, fetcher, onProgress },
    );

    expect(authorize).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({
      completed: 1,
      total: 1,
      bytesDownloaded: 4,
    }));
  });
});

