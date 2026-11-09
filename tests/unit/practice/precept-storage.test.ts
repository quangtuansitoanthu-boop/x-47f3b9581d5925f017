import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadPreceptRecords, savePreceptRecords } from '../../../src/lib/browser/precept-storage';
afterEach(() => vi.unstubAllGlobals());
describe('device precept storage', () => {
  it('does not overwrite unreadable data or touch existing abstinence storage', () => {
    const rows = new Map([['tutam_precept_reflections_v1', 'broken'], ['tutam_thanh_tinh_v1', 'existing-history']]);
    vi.stubGlobal('window', { localStorage: { getItem: (key: string) => rows.get(key) ?? null, setItem: (key: string, value: string) => rows.set(key, value) } });
    expect(loadPreceptRecords().error).toBe(true);
    expect(savePreceptRecords([])).toBe(false);
    expect(rows.get('tutam_precept_reflections_v1')).toBe('broken');
    expect(rows.get('tutam_thanh_tinh_v1')).toBe('existing-history');
  });
  it('merges other dates before saving and does not derive records from old streaks', () => {
    const rows = new Map([['tutam_thanh_tinh_v1', '{"longestStreakDays":100}']]);
    vi.stubGlobal('window', { localStorage: { getItem: (key: string) => rows.get(key) ?? null, setItem: (key: string, value: string) => rows.set(key, value) } });
    expect(loadPreceptRecords().records).toEqual([]);
    expect(savePreceptRecords([{ date: '2026-10-27', answers: Array(5).fill('kept') }])).toBe(true);
    expect(savePreceptRecords([{ date: '2026-10-28', answers: Array(5).fill('review') }])).toBe(true);
    expect(loadPreceptRecords().records).toHaveLength(2);
    expect(rows.get('tutam_thanh_tinh_v1')).toBe('{"longestStreakDays":100}');
  });
});
