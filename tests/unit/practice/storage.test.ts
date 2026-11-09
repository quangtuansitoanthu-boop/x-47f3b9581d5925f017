import { describe, expect, it } from 'vitest';

import { createManualPracticeLog, getPracticeStorage } from '../../../src/lib/browser/practice-storage';

class MemoryStorage implements Storage {
  #map = new Map<string, string>();

  get length() {
    return this.#map.size;
  }

  clear(): void {
    this.#map.clear();
  }

  getItem(key: string): string | null {
    return this.#map.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.#map.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.#map.delete(key);
  }

  setItem(key: string, value: string): void {
    this.#map.set(key, value);
  }
}

describe('practice storage parity', () => {
  it('persists exact tt_* and ttr_* keys for prefs and logs', () => {
    const memory = new MemoryStorage();
    const storage = getPracticeStorage(memory);

    storage.savePreferences({
      fontSize: 18,
      practiceBackground: 'gray',
      practiceBold: true,
      readBackground: 'cream',
      rosaryCount: 108,
      rosaryDirection: 'down',
      rosarySoundEnabled: true,
      trackerOpen: true
    });

    storage.saveFabPosition({ x: 16, y: 32 });
    storage.saveLog(createManualPracticeLog({
      count: 2,
      date: '2026-07-31',
      note: 'Ghi tay',
      type: 'Khác'
    }));

    expect(memory.getItem('tt_fs')).toBe('18');
    expect(memory.getItem('tt_practice_bg')).toBe('gray');
    expect(memory.getItem('tt_practice_bold')).toBe('1');
    expect(memory.getItem('tt_bg')).toBe('cream');
    expect(memory.getItem('tt_rosary_count')).toBe('108');
    expect(memory.getItem('tt_rosary_dir')).toBe('down');
    expect(memory.getItem('tt_rosary_sound')).toBe('1');
    expect(memory.getItem('ttTrackerOpen')).toBe('1');
    expect(memory.getItem('ttr_fab_pos')).toContain('"x":16');
    expect(memory.getItem('tt_practice_logs_v1')).toContain('"type":"Khác"');
  });

  it('deletes logs without disturbing the exact stored array shape and tracks deleted tombstones', () => {
    const memory = new MemoryStorage();
    const storage = getPracticeStorage(memory);
    const created = createManualPracticeLog({
      id: 11,
      count: 1,
      date: '2026-07-31',
      note: '',
      type: 'Niệm danh hiệu'
    });
    storage.saveLog(created);
    const remaining = storage.deleteLog(11);

    expect(remaining).toEqual([]);
    expect(memory.getItem('tt_practice_logs_v1')).toBe('[]');
    expect(storage.getDeletedLogIds().has('11')).toBe(true);
  });

  it('ignores corrupted persisted FAB coordinates', () => {
    const memory = new MemoryStorage();
    memory.setItem('ttr_fab_pos', JSON.stringify({ x: 'left', y: null }));

    expect(getPracticeStorage(memory).getFabPosition()).toBeNull();
  });
});
