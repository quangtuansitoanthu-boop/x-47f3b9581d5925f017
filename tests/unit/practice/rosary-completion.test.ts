import { describe, expect, it } from 'vitest';
import { createRosaryCompletion, ROSARY_COMPLETION_KEY } from '$lib/browser/rosary-completion';
import { getPracticeStorage } from '$lib/browser/practice-storage';
import { createPrincipalStorage } from '$lib/browser/principal-storage';

const date = '2026-10-30', phrase = 'Nam mô A Di Đà Phật';
function harness() {
  const values = new Map<string, string>();
  let failure: ((key: string, value: string) => boolean) | null = null;
  const storage = { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (failure?.(key, value)) throw new Error('quota');
      values.set(key, value);
    } };
  const practice = getPracticeStorage(storage);
  const completion = createRosaryCompletion(storage);
  return { storage, values, practice, completion, fail: (next: typeof failure) => { failure = next; } };
}
const total = (h: ReturnType<typeof harness>) => h.practice.getLogs().reduce((sum, log) => sum + log.count, 0);

describe('principal-local rosary completion receipts', () => {
  it('requires settled credit before carrying an unfinished counter into another day', () => {
    const h = harness();
    expect(() => h.completion.continueCounter(3, '2026-10-31')).toThrow('rosary_unsettled_counter');
    expect(h.values.has(ROSARY_COMPLETION_KEY)).toBe(false);
    h.completion.settle(3, 3, date, phrase);
    h.completion.continueCounter(3, '2026-10-31');
    const reloaded = createRosaryCompletion(h.storage);
    expect(reloaded.getCounterDate()).toBe('2026-10-31');
    expect(reloaded.unaccountedCount(3, '2026-10-31')).toBe(0);
    reloaded.settle(4, 1, '2026-10-31', phrase);
    expect(h.practice.getLogs()).toEqual(expect.arrayContaining([
      expect.objectContaining({ date, count: 3 }),
      expect.objectContaining({ date: '2026-10-31', count: 1 }),
    ]));
    expect(total(h)).toBe(4);
  });
  it('retries a failed carry with the same pending ID and preserves tombstones', () => {
    for (const deleted of [false, true]) {
      const h = harness();
      h.fail(key => key === 'tt_practice_logs_v1');
      expect(() => h.completion.settle(3, 3, date, phrase)).toThrow('quota');
      const pending = JSON.parse(h.values.get(ROSARY_COMPLETION_KEY)!).pending;
      expect(() => h.completion.continueCounter(3, '2026-10-31')).toThrow('quota');
      expect(JSON.parse(h.values.get(ROSARY_COMPLETION_KEY)!).pending.id).toBe(pending.id);
      expect(h.completion.getCounterDate()).toBeNull();
      h.fail(null);
      if (deleted) h.practice.deleteLog(pending.id);
      h.completion.continueCounter(3, '2026-10-31');
      expect(h.practice.getLogs()).toEqual(deleted ? [] : [pending]);
      expect(h.completion.getCounterDate()).toBe('2026-10-31');
    }
  });
  it('carries an upgraded legacy counter without crediting its already recorded beads again', () => {
    const h = harness();
    const legacy = { id: 1, date, type: 'Niệm danh hiệu' as const, count: 28,
      note: `Lần hạt: ${phrase}`, created: '2026-10-30T01:00:00Z' };
    h.practice.savePreferences({ rosaryCount: 28 });
    h.practice.saveLog(legacy);
    h.completion.initializeRestoredCount(28, date);
    h.completion.continueCounter(28, '2026-10-31');
    h.completion.settle(29, 1, '2026-10-31', phrase);
    expect(h.practice.getLogs()).toEqual(expect.arrayContaining([
      legacy, expect.objectContaining({ date: '2026-10-31', count: 1 }),
    ]));
    expect(total(h)).toBe(29);
  });
  it('isolates carried dates and credits by principal', () => {
    const h = harness();
    const aStorage = createPrincipalStorage(h.storage, 'a');
    const bStorage = createPrincipalStorage(h.storage, 'b');
    const a = createRosaryCompletion(aStorage);
    const b = createRosaryCompletion(bStorage);
    a.settle(3, 3, date, phrase);
    b.settle(7, 7, date, phrase);
    a.continueCounter(3, '2026-10-31');
    expect(a.getCounterDate()).toBe('2026-10-31');
    expect(b.getCounterDate()).toBeNull();
    expect(b.unaccountedCount(8, date)).toBe(1);
    a.settle(4, 1, '2026-10-31', phrase);
    expect(getPracticeStorage(aStorage).getLogs().reduce((sum, log) => sum + log.count, 0)).toBe(4);
    expect(getPracticeStorage(bStorage).getLogs().reduce((sum, log) => sum + log.count, 0)).toBe(7);
  });
  it('does not carry during an interrupted reset and clears its carry date after recovery', () => {
    const h = harness();
    h.practice.savePreferences({ rosaryCount: 3 });
    h.completion.settle(3, 3, date, phrase);
    h.completion.continueCounter(3, '2026-10-31');
    h.fail(key => key === 'tt_rosary_count');
    expect(() => h.completion.resetCounter('2026-10-31', () => h.practice.savePreferences({ rosaryCount: 0 }))).toThrow('quota');
    expect(() => h.completion.continueCounter(3, '2026-11-01')).toThrow('rosary_reset_pending');
    h.fail(null);
    h.completion.recoverReset(() => h.practice.savePreferences({ rosaryCount: 0 }));
    expect(h.completion.getCounterDate()).toBeNull();
    expect(h.practice.getPreferences().rosaryCount).toBe(0);
    expect(total(h)).toBe(3);
  });
  it('baselines an upgraded display total without crediting existing legacy activity again', () => {
    const h = harness();
    h.practice.savePreferences({ rosaryCount: 28 });
    const legacy = { id: 1, date, type: 'Niệm danh hiệu' as const, count: 28, note: `Lần hạt: ${phrase}`, created: '2026-10-30T01:00:00Z' };
    h.practice.saveLog(legacy);
    h.completion.initializeRestoredCount(28, date);
    h.completion.settle(28, 28, date, phrase);
    expect(h.practice.getLogs()).toEqual([legacy]);
    expect(h.practice.getPreferences().rosaryCount).toBe(28);
    h.completion.settle(29, 1, date, phrase);
    expect(total(h)).toBe(29);
    expect(h.practice.getLogs()).toHaveLength(2);
  });
  it('seeds zero before new taps and recovers an interrupted current-version partial once', () => {
    const h = harness();
    h.completion.initializeRestoredCount(0, date);
    h.practice.savePreferences({ rosaryCount: 2 });
    const reopened = createRosaryCompletion(h.storage);
    reopened.initializeRestoredCount(2, date);
    reopened.settle(2, 2, date, phrase);
    expect(total(h)).toBe(2);
    expect(h.practice.getPreferences().rosaryCount).toBe(2);
    createRosaryCompletion(h.storage).initializeRestoredCount(2, date);
    reopened.settle(2, 2, date, phrase);
    expect(h.practice.getLogs()).toHaveLength(1);
  });
  it.each([false, true])('leaves an existing receipt unchanged, including resetPending=%s', resetPending => {
    const h = harness();
    const receipt = JSON.stringify({ date, accounted: 3, pending: null, resetPending });
    h.values.set(ROSARY_COMPLETION_KEY, receipt);
    h.completion.initializeRestoredCount(12, '2026-10-31');
    expect(h.values.get(ROSARY_COMPLETION_KEY)).toBe(receipt);
    expect(h.practice.getLogs()).toEqual([]);
  });
  it('does not acknowledge or replace a pending receipt during initial restore', () => {
    const h = harness();
    h.fail(key => key === 'tt_practice_logs_v1');
    expect(() => h.completion.settle(3, 3, date, phrase)).toThrow('quota');
    const receipt = h.values.get(ROSARY_COMPLETION_KEY);
    h.fail(null);
    h.completion.initializeRestoredCount(7, date);
    expect(h.values.get(ROSARY_COMPLETION_KEY)).toBe(receipt);
    expect(h.practice.getLogs()).toEqual([]);
  });
  it('reads unaccounted counts without writes and rejects corrupt receipts', () => {
    const h = harness();
    expect(h.completion.unaccountedCount(5, date)).toBe(5);
    expect(h.values.has(ROSARY_COMPLETION_KEY)).toBe(false);
    h.completion.settle(5, 5, date, phrase);
    const recorded = h.values.get(ROSARY_COMPLETION_KEY);
    expect(h.completion.unaccountedCount(5, date)).toBe(0);
    expect(h.completion.unaccountedCount(3, date)).toBe(0);
    expect(h.completion.unaccountedCount(7, date)).toBe(2);
    expect(h.completion.unaccountedCount(5, '2026-10-31')).toBe(5);
    expect(h.values.get(ROSARY_COMPLETION_KEY)).toBe(recorded);
    h.values.set(ROSARY_COMPLETION_KEY, JSON.stringify({ date, accounted: -1, pending: null, resetPending: false }));
    expect(() => h.completion.unaccountedCount(5, date)).toThrow('invalid_rosary_receipt');
  });
  it('classifies all canonical mantra receipts correctly without an explicit type', () => {
    const h = harness();
    const phrases = [
      'Án Ma Ni Bát Mê Hồng',
      'Diệt Định Nghiệp Chân Ngôn — Ôm Pờ Ra Ma Ni Đa Ni Xoa Ha',
      'Tâm Chú Lăng Nghiêm — Ôm, A Na Lê, Vi Sa Đê, Vi Ra Va Chờ Ra Đa Rê, Ban Đa, Ban Đa Ni, Va Chờ Ra Ba Ni, Phạt, Hùm, Trùm, Phạt, Soa ha.',
      'Ngũ Đại Tâm Chú Lăng Nghiêm — Che Đa Nim, A Ca La, Mơ Ri Tiu, Pa Ri, Tờ Ra Da, Na Ca Rim',
    ];
    phrases.forEach((value, index) => h.completion.settle(index + 1, 1, date, value));
    expect(h.practice.getLogs()).toHaveLength(4);
    expect(h.practice.getLogs().every(log => log.type === 'Trì chú')).toBe(true);
  });
  it('credits only new interactions after leaving, reopening, and finishing with zero new taps', () => {
    const h = harness();
    h.practice.savePreferences({ rosaryCount: 3 });
    h.completion.settle(3, 3, date, phrase);
    expect(h.practice.getPreferences().rosaryCount).toBe(3);
    createRosaryCompletion(h.storage).settle(3, 3, date, phrase);
    expect(total(h)).toBe(3);
    h.completion.settle(5, 2, date, phrase);
    expect(total(h)).toBe(5);
  });
  it('preserves an existing daily display total without inventing credit for an old session', () => {
    const h = harness();
    h.completion.settle(109, 2, date, phrase);
    expect(total(h)).toBe(2);
    h.completion.settle(109, 109, date, phrase);
    expect(total(h)).toBe(2);
  });
  it('retains an exact pending log when its durable write fails and replays it once', () => {
    const h = harness();
    h.fail(key => key === 'tt_practice_logs_v1');
    expect(() => h.completion.settle(3, 3, date, phrase)).toThrow('quota');
    const pending = JSON.parse(h.values.get(ROSARY_COMPLETION_KEY)!).pending;
    expect(h.practice.getLogs()).toEqual([]);
    h.fail(null);
    h.completion.settle(3, 3, date, phrase);
    expect(h.practice.getLogs()).toMatchObject([{ id: pending.id, count: 3 }]);
  });
  it('replays an unacknowledged saved log with its stable ID instead of adding credit twice', () => {
    const h = harness();
    h.fail((key, value) => key === ROSARY_COMPLETION_KEY && JSON.parse(value).pending === null);
    expect(() => h.completion.settle(3, 3, date, phrase)).toThrow('quota');
    expect(total(h)).toBe(3);
    h.fail(null);
    h.completion.settle(5, 2, date, phrase);
    expect(total(h)).toBe(5);
    expect(h.practice.getLogs()).toHaveLength(2);
  });
  it('does not resurrect a deleted pending log', () => {
    const h = harness();
    h.fail((key, value) => key === ROSARY_COMPLETION_KEY && JSON.parse(value).pending === null);
    expect(() => h.completion.settle(3, 3, date, phrase)).toThrow('quota');
    h.fail(null);
    h.practice.deleteLog(h.practice.getLogs()[0].id);
    h.completion.settle(3, 3, date, phrase);
    expect(h.practice.getLogs()).toEqual([]);
  });
  it('does not reset the displayed draft before a pending log can be saved', () => {
    const h = harness();
    h.practice.savePreferences({ rosaryCount: 3 });
    h.fail(key => key === 'tt_practice_logs_v1');
    expect(() => h.completion.settle(3, 3, date, phrase)).toThrow('quota');
    expect(() => h.completion.resetCounter(date, () => h.practice.savePreferences({ rosaryCount: 0 }))).toThrow('quota');
    expect(h.practice.getPreferences().rosaryCount).toBe(3);
  });
  it('recovers an interrupted explicit reset and starts a new count without losing old credit', () => {
    const h = harness();
    h.practice.savePreferences({ rosaryCount: 3 });
    h.completion.settle(3, 3, date, phrase);
    h.fail(key => key === 'tt_rosary_count');
    expect(() => h.completion.resetCounter(date, () => h.practice.savePreferences({ rosaryCount: 0 }))).toThrow('quota');
    h.fail(null);
    createRosaryCompletion(h.storage).recoverReset(() => h.practice.savePreferences({ rosaryCount: 0 }));
    expect(h.practice.getPreferences().rosaryCount).toBe(0);
    h.completion.settle(2, 2, date, phrase);
    expect(total(h)).toBe(5);
  });
  it('scopes receipts by principal and starts a separate daily counter', () => {
    const h = harness();
    const a = createRosaryCompletion(createPrincipalStorage(h.storage, 'a'));
    const b = createRosaryCompletion(createPrincipalStorage(h.storage, 'b'));
    a.settle(3, 3, date, phrase);
    b.settle(3, 3, date, phrase);
    a.settle(2, 2, '2026-10-31', phrase);
    expect(getPracticeStorage(createPrincipalStorage(h.storage, 'a')).getLogs().map(log => log.count).sort()).toEqual([2, 3]);
    expect(getPracticeStorage(createPrincipalStorage(h.storage, 'b')).getLogs().map(log => log.count)).toEqual([3]);
  });
  it('records custom practice type and custom phrase correctly when supplied', () => {
    const h = harness();
    h.completion.settle(10, 10, date, 'Om Tare Tuttare Ture Soha', 'Trì chú');
    const logs = h.practice.getLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].type).toBe('Trì chú');
    expect(logs[0].note).toBe('Lần hạt: Om Tare Tuttare Ture Soha');
    expect(logs[0].count).toBe(10);

    h.completion.settle(15, 5, date, 'Nam mô Tiêu Tai Diên Thọ Dược Sư Phật', 'Niệm danh hiệu');
    const nextLogs = h.practice.getLogs();
    expect(nextLogs).toHaveLength(2);
    const customLog = nextLogs.find(l => l.note.includes('Tiêu Tai Diên Thọ'));
    expect(customLog?.type).toBe('Niệm danh hiệu');
    expect(customLog?.note).toBe('Lần hạt: Nam mô Tiêu Tai Diên Thọ Dược Sư Phật');
    expect(customLog?.count).toBe(5);
  });
  it('isolates custom phrases per principal and falls back to anonymous storage for guest', () => {
    const h = harness();
    const storageA = createPrincipalStorage(h.storage, 'user_123');
    const storageB = createPrincipalStorage(h.storage, 'user_456');
    const storageGuest = createPrincipalStorage(h.storage, null);

    const key = 'tt_custom_rosary_phrases_v1';
    storageA.setItem(key, JSON.stringify([{ id: '1', text: 'Nam mô Dược Sư', type: 'Niệm danh hiệu' }]));
    storageB.setItem(key, JSON.stringify([{ id: '2', text: 'Om Mani Padme Hum', type: 'Trì chú' }]));
    storageGuest.setItem(key, JSON.stringify([{ id: '3', text: 'Nam mô A Di Đà Phật', type: 'Niệm danh hiệu' }]));

    expect(JSON.parse(storageA.getItem(key)!)[0].text).toBe('Nam mô Dược Sư');
    expect(JSON.parse(storageB.getItem(key)!)[0].text).toBe('Om Mani Padme Hum');
    expect(JSON.parse(storageGuest.getItem(key)!)[0].text).toBe('Nam mô A Di Đà Phật');
  });
});
