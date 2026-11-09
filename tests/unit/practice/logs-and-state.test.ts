import { describe, expect, it } from 'vitest';

import { createPracticeLog, normalizePracticeLogs } from '../../../src/lib/domain/practice/logs';
import {
  INITIAL_EXIT_STATE,
  cancelExitConfirmation,
  confirmExitConfirmation,
  createPracticeExitDraft,
  filterPracticeCatalog,
  isDiaTangScripture,
  mergePracticeLogs,
  openExitConfirmation,
  sortPracticeCatalog
} from '../../../src/lib/domain/practice/state';

describe('practice logs and exit confirmation', () => {
  it('removes only the retired Buddha-name ritual from Vietnamese and translated catalogs', () => {
    const base = { category: 'CÁC NGHI THỨC' as const, publishedAt: '', author: '', imageUrl: '', hasTableOfContents: false, tags: [] };
    const articles = [
      { ...base, id: 'tt_1781742129070', title: 'NIỆM DANH HIỆU CÁC VỊ PHẬT BỒ TÁT' },
      { ...base, id: 'other', title: 'Nghi thức sám hối' },
    ];
    for (const category of ['all', 'NGHI THỨC KHÁC', 'CÁC NGHI THỨC'] as const) {
      expect(filterPracticeCatalog(articles, '', category).map(item => item.id)).toEqual(['other']);
      expect(filterPracticeCatalog([{ ...articles[0], title: 'Buddha name recitation' }], '', category)).toEqual([]);
    }
    expect(articles).toHaveLength(2);
  });
  it('normalizes and sorts practice logs by date then created', () => {
    const logs = normalizePracticeLogs([
      { id: 2, date: '2026-07-30', type: 'Khác', count: 2, note: '', created: '2026-07-30T00:00:00.000Z' },
      { id: 1, date: '2026-07-31', type: 'Tụng kinh', count: 1, note: '', created: '2026-07-31T00:00:00.000Z' }
    ]);

    expect(logs.map((log) => log.id)).toEqual([1, 2]);
  });

  it('creates a prefilled exit draft for the exact practice category', () => {
    const draft = createPracticeExitDraft(
      { category: 'KINH PHẬT', title: 'Kinh A Di Đà' },
      108,
      new Date('2026-07-31T03:00:00.000Z')
    );

    expect(draft).toEqual({
      count: 108,
      date: '2026-07-31',
      note: 'Công phu: Kinh A Di Đà',
      type: 'Tụng kinh'
    });
  });

  it('commits an exit confirmation exactly once and cancels with zero writes', () => {
    const opened = openExitConfirmation(INITIAL_EXIT_STATE, {
      count: 12,
      date: '2026-07-31',
      note: 'Công phu: Kinh Phổ Môn',
      type: 'Tụng kinh'
    });

    expect(cancelExitConfirmation(opened).open).toBe(false);

    const firstCommit = confirmExitConfirmation(opened);
    const secondCommit = confirmExitConfirmation(firstCommit.next);

    expect(firstCommit.shouldWrite).toBe(true);
    expect(secondCommit.shouldWrite).toBe(false);
  });

  it('preserves created timestamp when editing a manual log', () => {
    const log = createPracticeLog({
      id: 9,
      date: '2026-07-31',
      type: 'Niệm danh hiệu',
      count: 10,
      note: 'Nam mô A Di Đà Phật',
      created: '2026-07-31T12:34:56.000Z'
    });

    expect(log.created).toBe('2026-07-31T12:34:56.000Z');
  });

  it('identifies Kinh Dia Tang by title, id, or tags', () => {
    expect(isDiaTangScripture({ title: 'KINH ĐỊA TẠNG BỒ TẤT BỔN NGUYỆN' })).toBe(true);
    expect(isDiaTangScripture({ title: 'Kinh Địa Tạng' })).toBe(true);
    expect(isDiaTangScripture({ title: 'Kinh Thủ Lăng Nghiêm', tags: ['Địa Tạng'] })).toBe(true);
    expect(isDiaTangScripture({ title: 'Kinh Thủ Lăng Nghiêm', id: 'kinh-dia-tang' })).toBe(true);
    expect(isDiaTangScripture({ title: 'Nghi thức sám hối' })).toBe(false);
  });

  it('always promotes Kinh Dia Tang to the first position in practice catalog', () => {
    const items = [
      { id: '1', title: 'Nghi thức sám hối', category: 'CÁC NGHI THỨC' as const, author: '', imageUrl: '', hasTableOfContents: false, tags: [], publishedAt: '2026-09-01', updatedAt: '2026-09-10' },
      { id: '2', title: 'KINH ĐỊA TẠNG BỒ TẤT BỔN NGUYỆN', category: 'KINH PHẬT' as const, author: '', imageUrl: '', hasTableOfContents: false, tags: [], publishedAt: '2026-01-01', updatedAt: '2026-01-01' },
      { id: '3', title: 'Kinh Thủ Lăng Nghiêm', category: 'KINH PHẬT' as const, author: '', imageUrl: '', hasTableOfContents: false, tags: [], publishedAt: '2026-08-01', updatedAt: '2026-08-01' },
    ];

    const sorted = sortPracticeCatalog(items);
    expect(sorted[0]?.title).toBe('KINH ĐỊA TẠNG BỒ TẤT BỔN NGUYỆN');

    const filteredAll = filterPracticeCatalog(items, '', 'all');
    expect(filteredAll[0]?.title).toBe('KINH ĐỊA TẠNG BỒ TẤT BỔN NGUYỆN');

    const filteredKinh = filterPracticeCatalog(items, '', 'KINH PHẬT');
    expect(filteredKinh[0]?.title).toBe('KINH ĐỊA TẠNG BỒ TẤT BỔN NGUYỆN');
    expect(filteredKinh[1]?.title).toBe('Kinh Thủ Lăng Nghiêm');
  });

  it('safely merges local offline logs with cloud logs without losing records', () => {
    const cloudLogs = [
      createPracticeLog({ id: 101, date: '2026-09-01', type: 'Tụng kinh', count: 1, created: '2026-09-01T10:00:00.000Z' }),
      createPracticeLog({ id: 102, date: '2026-09-02', type: 'Niệm danh hiệu', count: 108, created: '2026-09-02T10:00:00.000Z' }),
    ];
    const localLogs = [
      createPracticeLog({ id: 103, date: '2026-09-03', type: 'Lễ Phật', count: 21, created: '2026-09-03T10:00:00.000Z' }),
    ];

    // Local has 1 log, cloud has 2 logs -> Both must be retained (total 3 logs)
    const merged = mergePracticeLogs(localLogs, cloudLogs);
    expect(merged).toHaveLength(3);
    expect(merged.map((l) => l.id)).toEqual([103, 102, 101]);

    // Same id with newer update in local
    const updatedLocal = [
      createPracticeLog({ id: 102, date: '2026-09-02', type: 'Niệm danh hiệu', count: 1080, note: 'Tăng biến số', created: '2026-09-02T12:00:00.000Z' }),
    ];
    const mergedUpdate = mergePracticeLogs(updatedLocal, cloudLogs);
    expect(mergedUpdate).toHaveLength(2);
    const updatedEntry = mergedUpdate.find((l) => l.id === 102);
    expect(updatedEntry?.count).toBe(1080);
    expect(updatedEntry?.note).toBe('Tăng biến số');
  });
});

