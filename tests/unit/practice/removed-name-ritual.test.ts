import { readFileSync, existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalizePracticeLogs } from '../../../src/lib/domain/practice/logs';
import { filterPracticeCatalog } from '../../../src/lib/domain/practice/state';

const id = 'tt_1781742129070';
describe('duplicate name ritual removal', () => {
  it('removes only its metadata and chapters while keeping other bundled articles', () => {
    for (const path of ['src/lib/data/offline-bundled-articles.json', 'static/offline-bundled-articles.json']) {
      const rows = JSON.parse(readFileSync(path, 'utf8')) as Array<{ id: string }>;
      expect(rows.some(row => row.id === id)).toBe(false);
      expect(rows.length).toBeGreaterThan(20);
    }
    for (const language of ['vi', 'en']) {
      const rows = JSON.parse(readFileSync(`src/lib/data/offline-books-${language}.json`, 'utf8'));
      expect(Object.keys(rows).some(key => key.endsWith(id))).toBe(false);
    }
    for (const folder of ['chapters', 'chapters-en']) expect(existsSync(`static/offline-data/${folder}/${id}.json`)).toBe(false);
    const availability = JSON.parse(readFileSync('src/lib/data/chapters-en-availability.json', 'utf8'));
    const available = [...availability.ids, ...availability.mtIds] as string[];
    expect(available).not.toContain(id);
    expect(availability.count).toBe(new Set(available).size);
  });
  it('keeps saved name recitation, prostration and rosary history unchanged and hides stale catalog rows', () => {
    const logs = ['Niệm danh hiệu', 'Lễ Phật', 'Trì chú'].map((type, index) => ({
      id: index + 1, date: '2026-10-27', type, count: 108, note: 'Đã lưu', created: '2026-10-27T00:00:00.000Z',
    }));
    expect(normalizePracticeLogs(logs).map(row => ({ id: row.id, type: row.type, count: row.count })))
      .toEqual(expect.arrayContaining(logs.map(({ id, type, count }) => ({ id, type, count }))));
    expect(filterPracticeCatalog([{ id, title: 'Old ritual', category: 'NGHI THỨC KHÁC', author: '', publishedAt: '', imageUrl: '', tags: [], hasTableOfContents: false }], '', 'all')).toEqual([]);
  });
});
