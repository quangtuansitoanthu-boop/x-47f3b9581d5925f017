import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isAudioDownloaded,
  downloadAudioTrack,
  deleteAudioTrack,
  resolvePlayableAudioUrl,
  getAudioTrackMeta,
  getPlayablePracticeAudioUrl,
  clearAllPracticeAudioCache,
  PRACTICE_AUDIO_CACHE_NAME
} from '../../../src/lib/browser/practice-audio-cache';

afterEach(async () => {
  await clearAllPracticeAudioCache();
  vi.unstubAllGlobals();
});

describe('practice audio cache and on-demand download', () => {
  function setupMockCache() {
    const store = new Map<string, Response>();
    const mockCache = {
      match: async (key: string) => store.get(key)?.clone() || undefined,
      put: async (key: string, res: Response) => {
        store.set(key, res.clone());
      },
      delete: async (key: string) => {
        return store.delete(key);
      },
      keys: async () => [...store.keys()].map((k) => new Request(k))
    };

    vi.stubGlobal('caches', {
      open: async (name: string) => {
        if (name === PRACTICE_AUDIO_CACHE_NAME) return mockCache;
        throw new Error('Unknown cache');
      }
    });

    return store;
  }

  it.each(['01', '02', '03'])('keeps meditation %s permanently available without download or cache', async (number) => {
    const path = `/assets/audio/nhac-thien-${number}.m4a`;
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const isDownloaded = await isAudioDownloaded(path);
    expect(isDownloaded).toBe(true);
    expect(getAudioTrackMeta(path)?.isDefault).toBe(true);
    expect(await resolvePlayableAudioUrl(path, true)).toBe(path);
    expect(await downloadAudioTrack(path)).toBe(path);
    await deleteAudioTrack(path);
    expect(await isAudioDownloaded(path)).toBe(true);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('recognizes un-cached on-demand track and falls back to remote URL when online', async () => {
    setupMockCache();
    const isDownloaded = await isAudioDownloaded('/assets/audio/ambient/tieng-mua-roi.mp3');
    expect(isDownloaded).toBe(false);

    const meta = getAudioTrackMeta('/assets/audio/ambient/tieng-mua-roi.mp3');
    expect(meta).toBeDefined();
    expect(meta?.isDefault).toBe(false);
    expect(meta?.remoteUrl).toContain('https://media.quangtu.vn/audio/practice/');

    // When not cached, resolvePlayableAudioUrl returns remoteUrl if preferRemote is true
    const playableUrl = await resolvePlayableAudioUrl('/assets/audio/ambient/tieng-mua-roi.mp3', true);
    expect(playableUrl).toBe(meta?.remoteUrl);
  });

  it('downloads track, stores in Cache Storage, and resolves blob URL', async () => {
    const store = setupMockCache();
    const fakeAudioData = new Uint8Array([1, 2, 3, 4, 5]);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(fakeAudioData.buffer, {
        status: 200,
        headers: { 'content-type': 'audio/mp4' }
      })
    ));

    const progressValues: number[] = [];
    const blobUrl = await downloadAudioTrack('/assets/audio/ambient/tieng-mua-roi.mp3', (p) => {
      progressValues.push(p);
    });

    expect(blobUrl).toMatch(/^blob:/u);
    expect(progressValues).toContain(100);

    const isDownloaded = await isAudioDownloaded('/assets/audio/ambient/tieng-mua-roi.mp3');
    expect(isDownloaded).toBe(true);

    // Now resolvePlayableAudioUrl returns blob URL
    const playable = await resolvePlayableAudioUrl('/assets/audio/ambient/tieng-mua-roi.mp3');
    expect(playable).toMatch(/^blob:/u);
  });

  it('deletes track from Cache Storage and revokes cached state', async () => {
    const store = setupMockCache();
    store.set('https://localhost/assets/audio/ambient/tieng-mua-roi.mp3', new Response('audio data'));

    expect(await isAudioDownloaded('/assets/audio/ambient/tieng-mua-roi.mp3')).toBe(true);
    await deleteAudioTrack('/assets/audio/ambient/tieng-mua-roi.mp3');
    expect(await isAudioDownloaded('/assets/audio/ambient/tieng-mua-roi.mp3')).toBe(false);
  });

  it('hydrates a persisted download before reporting it available to synchronous playback', async () => {
    const store = setupMockCache();
    const path = '/assets/audio/ambient/tieng-on-trang.mp3';
    store.set(`https://localhost${path}`, new Response('audio', { headers: { 'content-type': 'audio/mp4' } }));
    expect(await isAudioDownloaded(path)).toBe(true);
    expect(getPlayablePracticeAudioUrl(path)).toMatch(/^blob:/u);
  });

  it('uses remote audio when the local asset fails at network level', async () => {
    setupMockCache();
    const fetcher = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(new Response('audio', { headers: { 'content-type': 'audio/mp4' } }));
    vi.stubGlobal('fetch', fetcher);
    expect(await downloadAudioTrack('/assets/audio/ambient/tieng-mua-roi.mp3')).toMatch(/^blob:/u);
    expect(fetcher.mock.calls[1][0]).toBe(getAudioTrackMeta('/assets/audio/ambient/tieng-mua-roi.mp3')?.remoteUrl);
  });

  it('does not save the native SPA fallback HTML as a successful audio download', async () => {
    const store = setupMockCache();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('', { status: 404 }))
      .mockResolvedValueOnce(new Response('<!doctype html><html>app</html>', { headers: { 'content-type': 'text/html' } })));
    await expect(downloadAudioTrack('/assets/audio/ambient/tieng-mua-roi.mp3')).rejects.toThrow();
    expect(store.size).toBe(0);
  });

  it('removes a previously cached SPA document without clearing valid downloads', async () => {
    const store = setupMockCache();
    const path = '/assets/audio/ambient/tieng-mua-roi.mp3';
    store.set(`https://localhost${path}`, new Response('<html>app</html>', { headers: { 'content-type': 'text/html' } }));
    store.set('https://localhost/assets/audio/ambient/tieng-on-trang.mp3', new Response('valid audio'));
    expect(await isAudioDownloaded(path)).toBe(false);
    expect(store.size).toBe(1);
    expect(getPlayablePracticeAudioUrl(path)).toBe(path);
  });

  it('uses bundled audio without an R2 request and never retries an aborted download', async () => {
    setupMockCache();
    const fetcher = vi.fn<typeof fetch>(async () => new Response('audio', { headers: { 'content-type': 'audio/mp4' } }));
    vi.stubGlobal('fetch', fetcher);
    await downloadAudioTrack('/assets/audio/ambient/tieng-mua-roi.mp3');
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0][0]).toBe('/assets/audio/ambient/tieng-mua-roi.mp3');
    const controller = new AbortController();
    controller.abort();
    fetcher.mockRejectedValueOnce(new DOMException('Aborted', 'AbortError'));
    await expect(downloadAudioTrack('/assets/audio/ambient/tieng-on-trang.mp3', undefined, controller.signal)).rejects.toThrow('Aborted');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
