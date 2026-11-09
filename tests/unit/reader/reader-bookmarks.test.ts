import { describe, expect, it } from 'vitest';

import {
  createReaderBookmarkAdapter,
  findReaderBookmark,
  parseReaderBookmark,
  restoreReaderScroll,
  toggleReaderBookmark,
} from '../../../src/lib/browser/reader-bookmarks';
import { LEGACY_LOCAL_STORAGE_KEYS, type StorageLike } from '../../../src/lib/browser/storage-contract';

class MemoryStorage implements StorageLike {
  #items = new Map<string, string>();
  get length() { return this.#items.size; }
  getItem(key: string) { return this.#items.get(key) ?? null; }
  key(index: number) { return [...this.#items.keys()][index] ?? null; }
  removeItem(key: string) { this.#items.delete(key); }
  setItem(key: string, value: string) { this.#items.set(key, value); }
}

describe('legacy-compatible reader bookmarks', () => {
  it('stores article, chapter and scroll position with the legacy schema', () => {
    const storage = new MemoryStorage();
    const added = toggleReaderBookmark(storage, {
      articleId: 'book-1',
      articleTitle: 'Kinh Địa Tạng',
      chapterIndex: 11,
      chapterTitle: 'Phẩm thứ mười hai',
      scrollTop: 428.6,
      savedAt: new Date('2026-08-02T01:02:03.000Z'),
    });

    expect(added).toBe(true);
    expect(JSON.parse(storage.getItem(LEGACY_LOCAL_STORAGE_KEYS.bookmarks) || '[]')).toEqual([{
      id: 'book-1',
      title: 'Kinh Địa Tạng',
      chapIdx: 11,
      chapTitle: 'Phẩm thứ mười hai',
      scrollTop: 429,
      date: '2026-08-02T01:02:03.000Z',
    }]);
    expect(findReaderBookmark(storage, 'book-1')).toMatchObject({ chapIdx: 11, scrollTop: 429 });
  });

  it('parses bookmarks with legacy fallback chapter fields', () => {
    const bookmark = parseReaderBookmark({
      id: 'book-legacy',
      title: 'Kinh Pháp Cú',
      chapterIndex: 3,
      chapterTitle: 'Phẩm Tâm',
      scrollTop: 150,
      date: '2026-08-01T00:00:00.000Z',
    });

    expect(bookmark).toEqual({
      id: 'book-legacy',
      title: 'Kinh Pháp Cú',
      chapIdx: 3,
      chapTitle: 'Phẩm Tâm',
      scrollTop: 150,
      date: '2026-08-01T00:00:00.000Z',
    });
  });

  it('removes only the matching bookmark and retains unknown sync entries', () => {
    const storage = new MemoryStorage();
    storage.setItem(LEGACY_LOCAL_STORAGE_KEYS.bookmarks, JSON.stringify([
      { articleId: 'cloud-shape' },
      { id: 'book-1', chapIdx: null, scrollTop: 20 },
    ]));

    expect(toggleReaderBookmark(storage, {
      articleId: 'book-1', articleTitle: '', chapterIndex: null, chapterTitle: '', scrollTop: 0,
    })).toBe(false);
    expect(JSON.parse(storage.getItem(LEGACY_LOCAL_STORAGE_KEYS.bookmarks) || '[]')).toEqual([
      { articleId: 'cloud-shape' },
    ]);
  });

  it('restores scroll only after two animation frames and ignores stale readers', () => {
    const frames: FrameRequestCallback[] = [];
    const schedule = (callback: FrameRequestCallback) => { frames.push(callback); return frames.length; };
    const scrollArea = { scrollTop: 0 } as HTMLElement;
    let current = true;

    restoreReaderScroll(scrollArea, 321, schedule, () => current);
    frames.shift()?.(0);
    expect(scrollArea.scrollTop).toBe(0);
    frames.shift()?.(16);
    expect(scrollArea.scrollTop).toBe(321);

    restoreReaderScroll(scrollArea, 999, schedule, () => current);
    frames.shift()?.(32);
    current = false;
    frames.shift()?.(48);
    expect(scrollArea.scrollTop).toBe(321);
  });

  it('migrates the legacy envelope to anonymous once and isolates account bookmarks', () => {
    const storage = new MemoryStorage();
    storage.setItem(LEGACY_LOCAL_STORAGE_KEYS.bookmarks, JSON.stringify([{ id: 'legacy', scrollTop: 22 }]));
    const anonymous = createReaderBookmarkAdapter(storage);
    const account = createReaderBookmarkAdapter(storage, 'user-a');

    expect(anonymous.find('legacy')).toMatchObject({ id: 'legacy', scrollTop: 22 });
    expect(account.find('legacy')).toBeNull();
    account.toggle({ articleId: 'private', articleTitle: 'Riêng', chapterIndex: null, chapterTitle: '', scrollTop: 4 });
    expect(account.find('private')).not.toBeNull();
    expect(anonymous.find('private')).toBeNull();
    expect(JSON.parse(storage.getItem(LEGACY_LOCAL_STORAGE_KEYS.bookmarks) || '[]')).toEqual([{ id: 'legacy', scrollTop: 22 }]);
  });
});
