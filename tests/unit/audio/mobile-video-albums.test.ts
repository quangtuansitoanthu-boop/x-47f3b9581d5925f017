import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchTalkAlbums } from '../../../src/lib/browser/content-catalogs';
import { saveCachedTalkAlbums } from '../../../src/lib/browser/talk-catalog-cache';

const ids = ['pt_drive_f72e42f4cbb7db4312f96f4a1f28e2b4', 'pt_drive_c435791b562e6f6e9d345b414df4a273'];
const bundled = JSON.parse(readFileSync('static/offline-data/talks.json', 'utf8'));
vi.mock('../../../src/lib/browser/native-platform', () => ({ isNativeApp: () => true, nativePlatform: () => 'android' }));
vi.mock('../../../src/lib/browser/native-api', () => ({ resolveApiUrl: (path: string) => path, isHtmlResponse: () => false }));
vi.mock('../../../src/lib/browser/offline-bundled-resolver', () => ({
  resolveOfflineBundledResponse: vi.fn(async () => new Response(readFileSync('static/offline-data/talks.json', 'utf8'), { headers: { 'content-type': 'application/json' } })),
}));

beforeEach(() => {
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
});

describe('mobile streaming talk additions', () => {
  it('ships metadata for 216 audio and 60 video tracks with original remote identities', async () => {
    const fetcher = vi.fn();
    const albums = await fetchTalkAlbums(fetcher);
    expect(fetcher).not.toHaveBeenCalled();
    const audio = albums.find(album => album.id === ids[0])!;
    const video = albums.find(album => album.id === ids[1])!;
    expect(audio.tracks).toHaveLength(216);
    expect(video.tracks).toHaveLength(60);
    expect(video.tracks.every(track => track.media_type === 'video')).toBe(true);
    expect(video.tracks.every(track => track.url.startsWith('/api/audio/drive/'))).toBe(true);
    expect(video.tracks.every(track => !('audio_url' in track))).toBe(true);
    expect(audio.tracks.every(track => !track.media_type)).toBe(true);
  });

  it('adds the two bundled albums to an installed cache without refetching or replacing old rows', async () => {
    await saveCachedTalkAlbums([{ id: 'existing', tieu_de: 'Existing', tracks: [{ title: 'Old', url: '/old.mp3' }] }]);
    const fetcher = vi.fn();
    const albums = await fetchTalkAlbums(fetcher);
    expect(albums.map(album => album.id)).toEqual(expect.arrayContaining([...ids, 'existing']));
    expect(albums.find(album => album.id === 'existing')?.tracks[0].url).toBe('/old.mp3');
    expect(fetcher).not.toHaveBeenCalled();
    expect(bundled.filter((album: { id: string }) => ids.includes(album.id))).toHaveLength(2);
  });
});
