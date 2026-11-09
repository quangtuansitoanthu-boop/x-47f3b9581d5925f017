import { beforeEach, describe, expect, it } from 'vitest';
import {
  getCachedPlayCounts,
  getCachedTalkAlbums,
  getTalkCatalogMeta,
  mergeDeltaTalkAlbums,
  recordTalkCatalogSyncTime,
  saveCachedPlayCounts,
  saveCachedTalkAlbums,
  SEVEN_DAYS_MS,
  type CachedTalkAlbumRow
} from '../../../src/lib/browser/talk-catalog-cache';

function createStorage() {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => [...values.keys()][index] ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value),
    clear: () => values.clear(),
  };
}

describe('talk catalog caching & delta synchronization', () => {
  let storage: ReturnType<typeof createStorage>;

  beforeEach(() => {
    storage = createStorage();
    Object.defineProperty(globalThis, 'localStorage', {
      value: storage,
      configurable: true,
      writable: true,
    });
  });

  it('defines SEVEN_DAYS_MS correctly as 7 days in milliseconds', () => {
    expect(SEVEN_DAYS_MS).toBe(7 * 24 * 60 * 60 * 1000);
    expect(SEVEN_DAYS_MS).toBe(604_800_000);
  });

  it('saves and restores cached albums via fallback storage in node test environment', async () => {
    const albums: CachedTalkAlbumRow[] = [
      { id: 'talk_1', tieu_de: 'Kinh Kim Cang', created_at: '2026-10-01T00:00:00.000Z', tracks: [] },
      { id: 'talk_2', tieu_de: 'Kinh Pháp Cú', created_at: '2026-10-05T00:00:00.000Z', tracks: [] }
    ];

    await saveCachedTalkAlbums(albums);
    const restored = await getCachedTalkAlbums();

    expect(restored).toHaveLength(2);
    expect(restored?.[0]?.id).toBe('talk_1');
    expect(restored?.[1]?.id).toBe('talk_2');

    const meta = await getTalkCatalogMeta();
    expect(meta.albumCount).toBe(2);
    expect(meta.latestCreatedAt).toBe('2026-10-05T00:00:00.000Z');
    expect(meta.lastSyncTime).toBeGreaterThan(0);
  });

  it('merges delta albums onto existing cached list without duplicating entries', async () => {
    const initial: CachedTalkAlbumRow[] = [
      { id: 'talk_1', tieu_de: 'Bài 1', created_at: '2026-10-01T00:00:00.000Z' },
      { id: 'talk_2', tieu_de: 'Bài 2', created_at: '2026-10-02T00:00:00.000Z' }
    ];
    await saveCachedTalkAlbums(initial);

    const delta: CachedTalkAlbumRow[] = [
      { id: 'talk_2', tieu_de: 'Bài 2 (Cập nhật)', created_at: '2026-10-02T00:00:00.000Z' },
      { id: 'talk_3', tieu_de: 'Bài 3 mới', created_at: '2026-10-15T00:00:00.000Z' }
    ];

    const merged = await mergeDeltaTalkAlbums(delta);
    expect(merged).toHaveLength(3);

    const talk2 = merged.find((a) => a.id === 'talk_2');
    expect(talk2?.tieu_de).toBe('Bài 2 (Cập nhật)');

    const talk3 = merged.find((a) => a.id === 'talk_3');
    expect(talk3?.tieu_de).toBe('Bài 3 mới');

    const meta = await getTalkCatalogMeta();
    expect(meta.latestCreatedAt).toBe('2026-10-15T00:00:00.000Z');
    expect(meta.albumCount).toBe(3);
  });

  it('records custom sync timestamps', async () => {
    const timestamp = 1776000000000;
    await recordTalkCatalogSyncTime(timestamp);

    const meta = await getTalkCatalogMeta();
    expect(meta.lastSyncTime).toBe(timestamp);
  });

  it('saves and restores cached play counts', async () => {
    const playCounts = [
      { albumId: 'talk_1', playCount: 42 },
      { albumId: 'talk_2', playCount: 108 }
    ];

    await saveCachedPlayCounts(playCounts);
    const restored = await getCachedPlayCounts();

    expect(restored).toEqual(playCounts);
  });
});
