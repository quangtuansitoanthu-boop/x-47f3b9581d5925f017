import { describe, expect, it } from 'vitest';
import { groupPracticeLogs } from '../../../src/lib/domain/practice/log-groups';
import type { PracticeLog } from '../../../src/lib/domain/practice/logs';

const log: PracticeLog = { id: 1, date: '2026-11-03', type: 'Niệm danh hiệu', count: 108, note: 'Nam mô A Di Đà Phật', created: '2026-11-03T01:00:00Z' };

describe('daily practice display groups', () => {
  it('adds all sessions for a date and phrase including manual and automatic legacy labels', () => {
    const logs = [log, { ...log, id: 2, count: 216, note: `Lần hạt: ${log.note}` }, { ...log, id: 3 }];
    const original = JSON.stringify(logs);
    const result = groupPracticeLogs(logs);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ count: 432, memberIds: [1, 2, 3] });
    expect(JSON.stringify(logs)).toBe(original);
    expect(groupPracticeLogs(logs)[0].count).toBe(432);
  });
  it('keeps dates, phrases and activity units separate', () => {
    const result = groupPracticeLogs([log, { ...log, id: 2, date: '2026-11-04' },
      { ...log, id: 3, note: 'Nam mô Quán Thế Âm Bồ Tát' }, { ...log, id: 4, type: 'Chép danh hiệu' }]);
    expect(result).toHaveLength(4);
    expect(result.map(row => row.count)).toEqual([108, 108, 108, 108]);
  });
  it('normalizes spacing/case/Unicode for grouping while retaining original records and deletion IDs', () => {
    const result = groupPracticeLogs([log, { ...log, id: 2, note: `  ${log.note.toUpperCase().normalize('NFD')}  ` }]);
    expect(result).toHaveLength(1);
    expect(result[0].note).toBe(log.note);
    expect(result[0].memberIds).toEqual([1, 2]);
  });
  it('shows one daily row across campaign contributions without mislabeling or losing the original IDs', () => {
    const result = groupPracticeLogs([{ ...log, campaignId: 'a', campaignTitle: 'A' }, { ...log, id: 2, campaignId: 'b', campaignTitle: 'B' }]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ count: 216, memberIds: [1, 2] });
    expect(result[0].campaignTitle).toBeUndefined();
    expect(groupPracticeLogs([])).toEqual([]);
  });
});
