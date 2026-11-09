import { describe, expect, it } from 'vitest';
import bundledSizes from '../../../src/lib/data/audio-download-sizes.json';
import bundledCatalog from '../../../src/lib/data/offline-talks.json';
import { isOnlineOnlyAudioAlbum } from '../../../src/lib/domain/online-only-policy';

interface CatalogTrack {
  url: string;
  title: string;
}

const catalog = bundledCatalog.map(album => ({
  ...album,
  tracks: (typeof album.tracks === 'string' ? JSON.parse(album.tracks) : album.tracks) as CatalogTrack[],
}));
const downloadableAlbums = catalog.filter(album => album.visibility === 'public'
  && !isOnlineOnlyAudioAlbum(album.tieu_de, album.dien_gia));
const manifestAlbums: Record<string, Record<string, number>> = bundledSizes.albums;

describe('bundled audio download size catalog', () => {
  it('covers exactly the public downloadable catalog without publishing private or unrelated albums', () => {
    expect(downloadableAlbums.length).toBeGreaterThan(0);
    expect(Object.keys(manifestAlbums).sort()).toEqual(downloadableAlbums.map(album => album.id).sort());
    for (const album of downloadableAlbums) {
      expect(Object.keys(manifestAlbums[album.id]).sort(), album.id)
        .toEqual(album.tracks.map(track => track.url).sort());
    }
  });

  it('stores positive safe byte counts under canonical track paths and keeps totals precise', () => {
    for (const [albumId, tracks] of Object.entries(manifestAlbums)) {
      let total = 0;
      expect(Object.keys(tracks).length, albumId).toBeGreaterThan(0);
      for (const [url, bytes] of Object.entries(tracks)) {
        expect(url, albumId).toMatch(/^\/api\/audio\/drive\/[A-Za-z0-9_-]{5,200}$/u);
        expect(Number.isSafeInteger(bytes), `${albumId}: ${url}`).toBe(true);
        expect(bytes, `${albumId}: ${url}`).toBeGreaterThan(0);
        total += bytes;
      }
      expect(Number.isSafeInteger(total), albumId).toBe(true);
    }
  });

  it('records a supported manifest version and an unambiguous valid snapshot timestamp', () => {
    expect(bundledSizes.version).toBe(1);
    expect(bundledSizes.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u);
    const timestamp = Date.parse(bundledSizes.checkedAt);
    expect(Number.isFinite(timestamp)).toBe(true);
    expect(new Date(timestamp).toISOString()).toBe(bundledSizes.checkedAt);
  });

  it('keeps every online-only album excluded from downloadable metadata', () => {
    const onlineOnlyAlbums = catalog.filter(album => isOnlineOnlyAudioAlbum(album.tieu_de, album.dien_gia));
    expect(onlineOnlyAlbums.length).toBeGreaterThan(0);
    for (const album of onlineOnlyAlbums) {
      expect(manifestAlbums).not.toHaveProperty(album.id);
    }
    for (const volume of [1, 2, 3]) {
      expect(isOnlineOnlyAudioAlbum(`MUÔN KIẾP NHÂN SINH - TẬP ${volume} - NGUYÊN PHONG`)).toBe(true);
    }
  });
});
