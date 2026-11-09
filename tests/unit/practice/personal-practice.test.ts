import { describe, expect, it } from 'vitest';
import { createPersonalPracticeStorage } from '../../../src/lib/browser/personal-practice-storage';
import { isDailyRoutine, isReflectionEntry, moveRoutineStep, type DailyRoutine } from '../../../src/lib/domain/practice/personal-practice';
import { acknowledgePersonalSync, changePersonalSyncState, failPersonalSync, initialPersonalSyncState, personalSyncTicket, PERSONAL_SYNC_INTERVAL_MS as interval } from '../../../src/lib/domain/practice/personal-sync-policy';
import { normalizePersonalSettings } from '../../../src/lib/domain/practice/personal-settings';

function memory() {
  const rows = new Map<string, string>();
  return { rows, getItem: (key: string) => rows.get(key) ?? null, setItem: (key: string, value: string) => { rows.set(key, value); } };
}
const reflection = { date: '2026-11-07', repentance: 'Private reflection', goodDeeds: 'Private good deed', updatedAt: '2026-11-07T10:00:00Z' };
const routine: DailyRoutine = { id: 'evening', name: 'Thời Khóa Tối', updatedAt: reflection.updatedAt, steps: [
  { id: 'bow', kind: 'prostration', phrase: 'Nam Mô A Di Đà Phật', count: 3 },
  { id: 'dedicate', kind: 'dedication', text: 'Lời hồi hướng riêng' },
] };

describe('personal practice local ownership', () => {
  it('isolates private entries and nickname across users and anonymous storage', () => {
    const storage = memory(); const a = createPersonalPracticeStorage(storage, 'a'); const b = createPersonalPracticeStorage(storage, 'b');
    a.saveReflection(reflection); a.saveNickname('Diệu Âm');
    expect(a.getReflections()).toEqual([reflection]); expect(b.getReflections()).toEqual([]);
    expect(b.getNickname()).toBe(''); expect(createPersonalPracticeStorage(storage, null).getReflections()).toEqual([]);
  });
  it('replaces only the same day and retains both independent private sections', () => {
    const owner = createPersonalPracticeStorage(memory(), 'a'); owner.saveReflection(reflection);
    owner.saveReflection({ ...reflection, date: '2026-11-06' });
    const saved = owner.saveReflection({ ...reflection, goodDeeds: 'Updated' });
    expect(saved).toHaveLength(2); expect(saved[0]).toMatchObject({ repentance: reflection.repentance, goodDeeds: 'Updated' });
  });
  it('does not silently overwrite corrupted storage or report quota failures as saved', () => {
    const storage = memory(); const owner = createPersonalPracticeStorage(storage, 'a'); owner.saveReflection(reflection);
    const key = [...storage.rows.keys()][0]; storage.rows.set(key, '{broken');
    expect(() => owner.saveReflection(reflection)).toThrow('personal_practice_storage_invalid'); expect(storage.rows.get(key)).toBe('{broken');
    const blocked = createPersonalPracticeStorage({ getItem: () => null, setItem: () => { throw new Error('quota'); } }, 'a');
    expect(() => blocked.saveRoutine(routine)).toThrow('quota');
  });
  it('validates real calendar dates, duplicate step ids and tool bounds', () => {
    expect(isReflectionEntry({ ...reflection, date: '2026-02-30' })).toBe(false);
    expect(isDailyRoutine(routine)).toBe(true);
    expect(isDailyRoutine({ ...routine, steps: [routine.steps[0], routine.steps[0]] })).toBe(false);
    expect(isDailyRoutine({ ...routine, steps: [{ id: 'm', kind: 'meditation', minutes: -1 }] })).toBe(false);
    const moved = moveRoutineStep(routine, 1, 0); expect(moved.steps[0]).toEqual(routine.steps[1]); expect(routine.steps[0].kind).toBe('prostration');
  });
  it('keeps old meditation steps without cue and preserves each supported selected cue through sync', () => {
    const legacy: DailyRoutine = { ...routine, steps: [{ id: 'meditate', kind: 'meditation', minutes: 15 }] };
    expect(isDailyRoutine(legacy)).toBe(true);
    expect(normalizePersonalSettings({ routines: [legacy], nickname: '' }).routines[0].steps[0]).toEqual(legacy.steps[0]);
    for (const cue of ['bell', 'bowl', 'khánh'] as const) {
      const selected: DailyRoutine = { ...routine, steps: [{ id: 'meditate', kind: 'meditation', minutes: 15, cue }] };
      expect(isDailyRoutine(selected)).toBe(true);
      expect(normalizePersonalSettings({ routines: [selected], nickname: '' }).routines[0].steps[0]).toEqual(selected.steps[0]);
    }
    expect(isDailyRoutine({ ...legacy, steps: [{ ...legacy.steps[0], cue: 'unsupported' }] })).toBe(false);
  });
  it('atomically replaces settings on explicit restore without touching private reflections', () => {
    const storage = memory(); const owner = createPersonalPracticeStorage(storage, 'a');
    owner.saveReflection(reflection); owner.saveNickname('Old'); owner.saveRoutine(routine);
    const before = new Map(storage.rows);
    owner.replaceSettings({ nickname: 'Restored', routines: [] });
    expect(owner.getSettings()).toEqual({ nickname: 'Restored', routines: [] });
    expect(owner.getReflections()).toEqual([reflection]);
    const changedKeys = [...storage.rows.keys()].filter(key => storage.rows.get(key) !== before.get(key));
    expect(changedKeys).toHaveLength(1);
    expect(() => owner.replaceSettings({ nickname: 'X', routines: [{ ...routine, steps: [] }] })).toThrow();
    expect(owner.getNickname()).toBe('Restored');
  });
  it('keeps both settings fields intact if the atomic restore write fails', () => {
    const base = memory(); let fail = false;
    const owner = createPersonalPracticeStorage({ getItem: base.getItem, setItem: (key, value) => { if (fail) throw new Error('quota'); base.setItem(key, value); } }, 'a');
    owner.saveRoutine(routine); owner.saveNickname('Original'); fail = true;
    expect(() => owner.replaceSettings({ nickname: 'Replacement', routines: [] })).toThrow('quota');
    expect(owner.getRoutines()).toEqual([routine]); expect(owner.getNickname()).toBe('Original');
  });
  it('does not dirty or rewrite unchanged routines when the editor refreshes only updatedAt', () => {
    const storage = memory(); const owner = createPersonalPracticeStorage(storage, 'a');
    const second = { ...routine, id: 'morning', name: 'Thời Khóa Sáng' };
    owner.saveRoutine(routine); owner.saveRoutine(second);
    const before = new Map(storage.rows);
    const saved = owner.saveRoutine({ ...routine, updatedAt: '2026-11-09T10:00:00Z' });
    expect(saved.map(item => item.id)).toEqual(['evening', 'morning']);
    expect(saved[0].updatedAt).toBe(routine.updatedAt);
    expect(storage.rows).toEqual(before);
  });
  it('replaces changed routines in place while preserving other routines and private journal data', () => {
    const owner = createPersonalPracticeStorage(memory(), 'a');
    const second = { ...routine, id: 'morning', name: 'Thời Khóa Sáng' };
    owner.saveRoutine(routine); owner.saveRoutine(second); owner.saveReflection(reflection);
    const changed = { ...routine, name: 'Thời Khóa Tối mới', updatedAt: '2026-11-09T10:00:00Z' };
    expect(owner.saveRoutine(changed)).toEqual([changed, second]);
    expect(owner.getReflections()).toEqual([reflection]);
  });
});

describe('48-hour changed-only personal sync policy', () => {
  it('waits48h from first edit without moving the window on subsequent edits and excludes guests', () => {
    let state = changePersonalSyncState(initialPersonalSyncState('old'), 'first', 100);
    state = changePersonalSyncState(state, 'latest', 1000);
    expect(personalSyncTicket(state, 'a', interval + 99)).toBeNull();
    expect(personalSyncTicket(state, 'a', interval + 100)?.payload).toBe('latest');
    expect(personalSyncTicket(state, null, interval * 3)).toBeNull(); expect(personalSyncTicket(state, 'anonymous', interval * 3)).toBeNull();
  });
  it('sends nothing for unchanged content or editing back to the acknowledged content', () => {
    const initial = initialPersonalSyncState('old'); expect(changePersonalSyncState(initial, 'old', 10)).toBe(initial);
    const changed = changePersonalSyncState(initial, 'new', 10);
    expect(personalSyncTicket(changePersonalSyncState(changed, 'old', 20), 'a', interval * 3)).toBeNull();
  });
  it('keeps edits made during upload dirty and rejects ACK from previous principal or older revision', () => {
    let state = changePersonalSyncState(initialPersonalSyncState(), 'first', 0);
    const ticket = personalSyncTicket(state, 'a', interval)!;
    state = changePersonalSyncState(state, 'second', interval + 1);
    expect(acknowledgePersonalSync(state, ticket, 'b', interval + 2)).toBe(state);
    state = acknowledgePersonalSync(state, ticket, 'a', interval + 2);
    expect(state.current).toBe('second'); expect(state.acknowledged).toBe('first');
    expect(personalSyncTicket(state, 'a', interval * 2 + 1)).toBeNull();
    const latest = personalSyncTicket(state, 'a', interval * 2 + 2)!;
    state = acknowledgePersonalSync(state, latest, 'a', interval * 2 + 3);
    expect(acknowledgePersonalSync(state, ticket, 'a', interval * 2 + 4)).toBe(state);
    expect(personalSyncTicket(state, 'a', interval * 4)).toBeNull();
  });
  it('failed uploads preserve dirty content and successful timestamp while backing off retries', () => {
    let state = changePersonalSyncState(initialPersonalSyncState(), 'first', 0);
    const ticket = personalSyncTicket(state, 'a', interval)!;
    state = failPersonalSync(state, ticket, 'a', interval);
    expect(state.lastSuccessAt).toBeNull(); expect(state.current).toBe('first');
    expect(personalSyncTicket(state, 'a', interval + 29_999)).toBeNull();
    expect(personalSyncTicket(state, 'a', interval + 30_000)).not.toBeNull();
  });
});
