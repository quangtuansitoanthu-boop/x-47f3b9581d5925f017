import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PRECEPT_COMPANION_KEY, getDailySessionTestingConduct, getDailySessionConduct, getCompanionDay, loadPreceptCompanion, recordAbstinenceConduct, saveCompanionDay, saveEightSession, saveDailySession } from '../../../src/lib/browser/precept-companion-storage';
import { FIVE_IDS, TEN_IDS, type DailySession, type EightSession, type DayAnswers } from '../../../src/lib/domain/practice/precept-companion';

let rows: Map<string, string>;
let failWrites = false;
const date = '2026-10-28';
const abstinenceKey = 'tutam_thanh_tinh_v1';
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-28T03:00:00Z'));
  rows = new Map(); failWrites = false;
  vi.stubGlobal('window', { localStorage: {
    getItem: (key: string) => rows.get(key) ?? null,
    setItem: (key: string, value: string) => { if (failWrites) throw new DOMException('quota', 'QuotaExceededError'); rows.set(key, value); },
  }, dispatchEvent: vi.fn(() => true) });
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
function session(id = 'eight'): EightSession {
  return { id, startsAt: '2026-10-28T23:00:00+07:00', endsAt: '2026-10-29T23:00:00+07:00', status: 'active', answers: {}, templateId: 'reviewed-template' };
}
function dailySession(group: 'five' | 'ten' = 'five', id: string = group): DailySession {
  return { id, group, startsAt: '2026-10-28T03:00:00Z', endsAt: '2026-10-29T03:00:00Z', status: 'active', answers: {} };
}
function reviewedAnswers(group: 'five' | 'ten'): DayAnswers {
  return Object.fromEntries((group === 'five' ? FIVE_IDS : TEN_IDS).map(id => [id, 'review']));
}

describe('device precept companion storage', () => {
  it('reads early testing conduct without persisting real confirmation and refreshes relapse evidence', () => {
    const active: DailySession = { ...dailySession(), id: 'combined', group: 'combined' };
    expect(saveDailySession(active)).toBe(true);
    const bytes = rows.get(PRECEPT_COMPANION_KEY);
    const write = vi.spyOn(window.localStorage, 'setItem');
    rows.set(abstinenceKey, JSON.stringify({ checkInDates: [date], lastCheckInDate: date, relapseHistory: [] }));
    expect(getDailySessionTestingConduct(active)).toEqual({ answer: 'kept', confirmed: true, error: false });
    for (const at of [active.startsAt, active.endsAt]) {
      rows.set(abstinenceKey, JSON.stringify({ checkInDates: [date], lastCheckInDate: date, relapseHistory: [{ date: at }] }));
      expect(getDailySessionTestingConduct(active)).toEqual({ answer: 'review', confirmed: true, error: false });
    }
    rows.set(abstinenceKey, JSON.stringify({ checkInDates: [date], lastCheckInDate: date, relapseHistory: [{ date: new Date(Date.parse(active.startsAt) - 1).toISOString() }] }));
    expect(getDailySessionTestingConduct(active).answer).toBe('kept');
    expect(getDailySessionConduct(active).confirmed).toBe(false);
    expect(getDailySessionTestingConduct({ ...active, startsAt: '2026-10-28T04:00:00Z' }).confirmed).toBe(false);
    expect(rows.get(PRECEPT_COMPANION_KEY)).toBe(bytes);
    expect(write).not.toHaveBeenCalled();
  });
  it('revokes early testing conduct after source deletion, corruption, or loss of today check-in', () => {
    const active: DailySession = { ...dailySession(), id: 'combined', group: 'combined' };
    expect(saveDailySession(active)).toBe(true);
    rows.set(abstinenceKey, JSON.stringify({ checkInDates: [date], lastCheckInDate: date }));
    expect(getDailySessionTestingConduct(active).confirmed).toBe(true);
    rows.delete(abstinenceKey);
    expect(getDailySessionTestingConduct(active)).toEqual({ answer: undefined, confirmed: false, error: false });
    for (const raw of ['{broken', JSON.stringify({ checkInDates: [date], lastCheckInDate: date, relapseHistory: [{ date: 'broken' }] })]) {
      rows.set(abstinenceKey, raw);
      expect(getDailySessionTestingConduct(active)).toEqual({ answer: undefined, confirmed: false, error: true });
      expect(rows.get(abstinenceKey)).toBe(raw);
    }
    for (const source of [{ checkInDates: [], lastCheckInDate: date }, { checkInDates: [date], lastCheckInDate: '2026-10-27' }]) {
      rows.set(abstinenceKey, JSON.stringify(source));
      expect(getDailySessionTestingConduct(active).confirmed).toBe(false);
    }
    expect(saveDailySession({ ...active, status: 'cancelled' })).toBe(true);
    rows.set(abstinenceKey, JSON.stringify({ checkInDates: [date], lastCheckInDate: date }));
    expect(getDailySessionTestingConduct(active).confirmed).toBe(false);
  });
  it('derives combined conduct only from explicit elapsed-session confirmation and retained source evidence', () => {
    const active: DailySession = { ...dailySession(), id: 'combined', group: 'combined' };
    expect(saveDailySession(active)).toBe(true);
    rows.set(abstinenceKey, JSON.stringify({ checkInDates: [date], lastCheckInDate: date }));
    recordAbstinenceConduct(date);
    expect(getDailySessionConduct(active)).toEqual({ answer: undefined, confirmed: false, error: false });
    vi.setSystemTime(new Date(active.endsAt));
    const completedDate = '2026-10-29';
    rows.set(abstinenceKey, JSON.stringify({ checkInDates: [date, completedDate], lastCheckInDate: completedDate }));
    expect(getDailySessionConduct(active).confirmed).toBe(false);
    expect(saveDailySession({ ...active, conductConfirmation: { completedAt: active.endsAt, checkInDate: completedDate } })).toBe(false);
    expect(recordAbstinenceConduct(completedDate)).toBe(true);
    expect(getDailySessionConduct(active)).toEqual({ answer: 'kept', confirmed: true, error: false });
    expect(loadPreceptCompanion().state.dailySessions?.[0].answers).toEqual({});
    expect(getDailySessionConduct({ ...active, startsAt: '2026-10-28T04:00:00Z' }).confirmed).toBe(false);
    rows.set(abstinenceKey, JSON.stringify({ checkInDates: [completedDate], relapseHistory: [{ date: '2026-10-28T12:00:00Z' }] }));
    expect(getDailySessionConduct(active).answer).toBe('review');
    rows.set(abstinenceKey, JSON.stringify({ checkInDates: [] }));
    expect(getDailySessionConduct(active)).toEqual({ answer: undefined, confirmed: false, error: false });
  });
  it('keeps legacy groups while enforcing one combined session and partial 24-hour completion', () => {
    const active: DailySession = { ...dailySession(), id: 'combined', group: 'combined' };
    expect(saveDailySession(dailySession('five'))).toBe(true);
    expect(saveDailySession(dailySession('ten'))).toBe(true);
    const bytes = rows.get(PRECEPT_COMPANION_KEY);
    expect(loadPreceptCompanion().state.dailySessions).toHaveLength(2);
    expect(rows.get(PRECEPT_COMPANION_KEY)).toBe(bytes);
    expect(saveDailySession(active)).toBe(true);
    expect(saveDailySession({ ...active, id: 'second' })).toBe(false);
    expect(saveDailySession({ ...active, answers: { speech: 'review', kindness: 'kept' } })).toBe(true);
    vi.setSystemTime(new Date(Date.parse(active.endsAt) - 1));
    expect(saveDailySession({ ...active, status: 'ended' })).toBe(false);
    vi.setSystemTime(new Date(active.endsAt));
    const before = rows.get(PRECEPT_COMPANION_KEY);
    failWrites = true;
    expect(saveDailySession({ ...active, status: 'ended' })).toBe(false);
    expect(rows.get(PRECEPT_COMPANION_KEY)).toBe(before);
    failWrites = false;
    expect(saveDailySession({ ...active, status: 'ended' })).toBe(true);
    expect(loadPreceptCompanion().state.dailySessions?.[2].answers).toEqual({ speech: 'review', kindness: 'kept' });
    expect(saveDailySession(active)).toBe(false);
    const next = { ...active, id: 'next', startsAt: active.endsAt, endsAt: '2026-10-30T03:00:00Z' };
    expect(saveDailySession(next)).toBe(true);
    expect(saveDailySession({ ...next, status: 'cancelled' })).toBe(true);
    expect(saveDailySession(next)).toBe(false);
  });
  it('notifies only after durable write and keeps success if a notification listener fails', () => {
    const notify = vi.spyOn(window, 'dispatchEvent').mockImplementation(event => {
      expect(event.type).toBe('tutam:precept-companion-saved');
      expect(JSON.parse(rows.get(PRECEPT_COMPANION_KEY)!)).toMatchObject({ days: [{ date, group: 'five', answers: { life: 'kept' } }] });
      return true;
    });
    expect(saveCompanionDay('five', date, { life: 'kept' })).toBe(true);
    expect(notify).toHaveBeenCalledOnce();
    notify.mockImplementation(() => { throw new Error('listener failed'); });
    expect(saveCompanionDay('five', date, { speech: 'review' })).toBe(true);
    expect(getCompanionDay('five', date).answers).toEqual({ life: 'kept', speech: 'review' });
    notify.mockClear(); failWrites = true;
    const before = rows.get(PRECEPT_COMPANION_KEY);
    expect(saveCompanionDay('five', date, { property: 'kept' })).toBe(false);
    expect(rows.get(PRECEPT_COMPANION_KEY)).toBe(before);
    expect(notify).not.toHaveBeenCalled();
    failWrites = false;
    vi.stubGlobal('window', { localStorage: window.localStorage });
    expect(saveCompanionDay('five', date, { property: 'kept' })).toBe(true);
    expect(getCompanionDay('five', date).answers).toEqual({ life: 'kept', speech: 'review', property: 'kept' });
  });
  it('merges partial deltas independently for five, ten and other calendar days', () => {
    expect(saveCompanionDay('five', date, { life: 'review' })).toBe(true);
    expect(saveCompanionDay('five', date, { property: 'kept' })).toBe(true);
    expect(saveCompanionDay('ten', date, { kindness: 'kept' })).toBe(true);
    expect(saveCompanionDay('five', '2026-10-27', { speech: 'kept' })).toBe(true);
    expect(getCompanionDay('five', date).answers).toEqual({ life: 'review', property: 'kept' });
    expect(getCompanionDay('ten', date).answers).toEqual({ kindness: 'kept' });
    expect(loadPreceptCompanion().state.days).toHaveLength(3);
  });
  it('reads complete old five-precept records without writing either old storage key', () => {
    const old = JSON.stringify([{ date, answers: ['kept', 'review', 'kept', 'review', 'kept'] }]);
    rows.set('tutam_precept_reflections_v1', old);
    rows.set(abstinenceKey, '{"longestStreakDays":42}');
    expect(getCompanionDay('five', date).answers).toEqual({ life: 'kept', property: 'review', conduct: 'kept', speech: 'review', sobriety: 'kept' });
    expect(saveCompanionDay('five', date, { speech: 'kept' })).toBe(true);
    expect(rows.get('tutam_precept_reflections_v1')).toBe(old);
    expect(rows.get(abstinenceKey)).toBe('{"longestStreakDays":42}');
    expect(getCompanionDay('ten', date).answers).toEqual({});
  });
  it('requires a new explicit marker plus durable check-in and derives only conduct on that date', () => {
    expect(recordAbstinenceConduct(date)).toBe(false);
    rows.set(abstinenceKey, JSON.stringify({ checkInDates: [date] }));
    expect(getCompanionDay('five', date).answers).toEqual({});
    expect(recordAbstinenceConduct(date)).toBe(true);
    expect(recordAbstinenceConduct(date)).toBe(true);
    for (const group of ['five', 'ten'] as const) expect(getCompanionDay(group, date)).toEqual({ answers: { conduct: 'kept' }, derivedConduct: true, error: false });
    expect(getCompanionDay('five', '2026-10-29').answers).toEqual({});
    const state = loadPreceptCompanion().state;
    expect(state.conductDates).toEqual([date]); expect(state.days).toEqual([]); expect(state.sessions).toEqual([]);
    rows.set(abstinenceKey, JSON.stringify({ checkInDates: [date, '2026-10-27'] }));
    expect(recordAbstinenceConduct('2026-10-27')).toBe(false);
  });
  it('never overwrites manual conduct and removes only derivation when source check-in is undone', () => {
    rows.set(abstinenceKey, JSON.stringify({ checkInDates: [date] }));
    saveCompanionDay('five', date, { conduct: 'review', speech: 'kept' });
    recordAbstinenceConduct(date);
    expect(getCompanionDay('five', date).answers).toEqual({ conduct: 'review', speech: 'kept' });
    rows.set(abstinenceKey, JSON.stringify({ checkInDates: [] }));
    expect(getCompanionDay('ten', date).answers).toEqual({});
    expect(getCompanionDay('five', date).answers).toEqual({ conduct: 'review', speech: 'kept' });
  });
  it('preserves corrupt companion bytes and rejects every write without clearing old data', () => {
    rows.set(PRECEPT_COMPANION_KEY, '{broken');
    rows.set(abstinenceKey, JSON.stringify({ checkInDates: [date] }));
    expect(loadPreceptCompanion().error).toBe(true);
    expect(saveCompanionDay('five', date, { life: 'kept' })).toBe(false);
    expect(recordAbstinenceConduct(date)).toBe(false);
    expect(saveEightSession(session())).toBe(false);
    expect(rows.get(PRECEPT_COMPANION_KEY)).toBe('{broken');
  });
  it('blocks old malformed five records and reports quota failures without advancing persisted state', () => {
    for (const old of ['broken', JSON.stringify([{ date, answers: ['kept'] }])]) {
      rows.set('tutam_precept_reflections_v1', old);
      expect(saveCompanionDay('five', date, { life: 'kept' })).toBe(false);
      expect(rows.has(PRECEPT_COMPANION_KEY)).toBe(false);
      expect(rows.get('tutam_precept_reflections_v1')).toBe(old);
    }
    rows.delete('tutam_precept_reflections_v1');
    saveCompanionDay('ten', date, { life: 'review' });
    const before = rows.get(PRECEPT_COMPANION_KEY);
    rows.set(abstinenceKey, JSON.stringify({ checkInDates: [date] })); failWrites = true;
    expect(saveCompanionDay('ten', date, { conduct: 'kept' })).toBe(false);
    expect(recordAbstinenceConduct(date)).toBe(false);
    expect(saveEightSession(session())).toBe(false);
    expect(rows.get(PRECEPT_COMPANION_KEY)).toBe(before);
    expect(getCompanionDay('ten', date).answers).toEqual({ life: 'review' });
  });
  it('persists an isolated 24-hour session, merges answers, and permits only valid terminal lifecycle', () => {
    const active = session();
    expect(saveEightSession(active)).toBe(true);
    expect(saveEightSession({ ...active, answers: { celibacy: 'kept' } })).toBe(true);
    expect(saveEightSession({ ...active, answers: { meal: 'review' } })).toBe(true);
    expect(saveEightSession(session('second'))).toBe(false);
    expect(saveEightSession({ ...active, endsAt: '2026-10-30T23:00:00+07:00' })).toBe(false);
    expect(saveEightSession({ ...active, templateId: 'changed' })).toBe(false);
    expect(saveEightSession({ ...active, status: 'ended' })).toBe(true);
    expect(saveEightSession(active)).toBe(false);
    expect(saveEightSession({ ...active, status: 'cancelled' })).toBe(false);
    expect(loadPreceptCompanion().state.sessions[0]).toEqual({ ...active, status: 'ended', answers: { celibacy: 'kept', meal: 'review' } });
    expect(getCompanionDay('five', date).answers).toEqual({});
    expect(getCompanionDay('ten', date).answers).toEqual({});
  });
  it('starts one daily session per group and merges drafts independently without changing legacy owners', () => {
    saveCompanionDay('five', date, { speech: 'review' });
    rows.set(abstinenceKey, JSON.stringify({ checkInDates: [date] }));
    recordAbstinenceConduct(date);
    saveEightSession(session());
    const old = loadPreceptCompanion().state;
    expect(saveDailySession(dailySession())).toBe(true);
    expect(saveDailySession(dailySession('ten'))).toBe(true);
    expect(saveDailySession(dailySession('five', 'other-five'))).toBe(false);
    expect(saveDailySession({ ...dailySession(), answers: { conduct: 'review' } })).toBe(true);
    expect(saveDailySession({ ...dailySession(), answers: { life: 'kept' } })).toBe(true);
    const state = loadPreceptCompanion().state;
    expect(state.dailySessions).toHaveLength(2);
    expect(state.dailySessions?.[0].answers).toEqual({ conduct: 'review', life: 'kept' });
    expect(state.dailySessions?.[1].answers).toEqual({});
    expect({ ...state, dailySessions: undefined }).toMatchObject(old);
    expect(state.days).toEqual(old.days); expect(state.sessions).toEqual(old.sessions); expect(state.conductDates).toEqual(old.conductDates);
  });
  it('writes daily completion atomically only at the 24-hour boundary and preserves bytes on quota failure', () => {
    const active = dailySession();
    expect(saveDailySession(active)).toBe(true);
    const complete: DailySession = { ...active, status: 'ended', answers: reviewedAnswers('five') };
    const write = vi.spyOn(window.localStorage, 'setItem');
    const notify = vi.mocked(window.dispatchEvent);
    write.mockClear(); notify.mockClear();
    const before = rows.get(PRECEPT_COMPANION_KEY);
    vi.setSystemTime(new Date('2026-10-29T02:59:59.999Z'));
    expect(saveDailySession(complete)).toBe(false);
    expect(write).not.toHaveBeenCalled();
    vi.setSystemTime(new Date('2026-10-29T03:00:00Z'));
    failWrites = true;
    expect(saveDailySession(complete)).toBe(false);
    expect(rows.get(PRECEPT_COMPANION_KEY)).toBe(before);
    expect(notify).not.toHaveBeenCalled();
    write.mockClear(); failWrites = false;
    expect(saveDailySession(complete)).toBe(true);
    expect(write).toHaveBeenCalledTimes(1); expect(notify).toHaveBeenCalledTimes(1);
    expect(loadPreceptCompanion().state.dailySessions).toEqual([complete]);
    expect(loadPreceptCompanion().state.days).toEqual([]);
  });
  it('keeps terminal daily sessions immutable and starts the next 24-hour session with a new ID', () => {
    const active = dailySession();
    expect(saveDailySession(active)).toBe(true);
    expect(saveDailySession({ ...active, group: 'ten' })).toBe(false);
    expect(saveDailySession({ ...active, startsAt: '2026-10-28T04:00:00Z', endsAt: '2026-10-29T04:00:00Z' })).toBe(false);
    vi.setSystemTime(new Date(active.endsAt));
    const complete: DailySession = { ...active, status: 'ended', answers: reviewedAnswers('five') };
    expect(saveDailySession(complete)).toBe(true);
    const bytes = rows.get(PRECEPT_COMPANION_KEY);
    expect(saveDailySession(active)).toBe(false);
    expect(saveDailySession({ ...complete, status: 'cancelled' })).toBe(false);
    expect(saveDailySession({ ...complete, answers: { ...complete.answers, life: 'kept' } })).toBe(false);
    expect(rows.get(PRECEPT_COMPANION_KEY)).toBe(bytes);
    const next = { ...dailySession('five', 'next-five'), startsAt: active.endsAt, endsAt: '2026-10-30T03:00:00Z' };
    expect(saveDailySession(next)).toBe(true);
    expect(loadPreceptCompanion().state.dailySessions).toEqual([complete, next]);
    expect(saveDailySession({ ...dailySession('ten'), status: 'ended' })).toBe(false);
  });
  it('records early cancellation without claiming 24 hours or rewriting session timestamps', () => {
    const active = dailySession('five');
    expect(saveDailySession({ ...active, answers: { property: 'review' } })).toBe(true);
    const stopped: DailySession = { ...active, status: 'cancelled', answers: { life: 'kept' } };
    expect(saveDailySession(stopped)).toBe(true);
    expect(loadPreceptCompanion().state.dailySessions).toEqual([
      { ...stopped, answers: { property: 'review', life: 'kept' } },
    ]);
    const bytes = rows.get(PRECEPT_COMPANION_KEY);
    expect(saveDailySession(active)).toBe(false);
    expect(saveDailySession({ ...stopped, status: 'ended' })).toBe(false);
    expect(rows.get(PRECEPT_COMPANION_KEY)).toBe(bytes);
    expect(saveDailySession(dailySession('five', 'next-five'))).toBe(true);
    expect(loadPreceptCompanion().state.dailySessions).toHaveLength(2);
  });
  it('preserves additive daily sessions when old v1 writers update another owner', () => {
    expect(saveDailySession(dailySession('ten'))).toBe(true);
    const daily = loadPreceptCompanion().state.dailySessions;
    expect(saveCompanionDay('five', date, { life: 'review' })).toBe(true);
    expect(saveEightSession(session())).toBe(true);
    rows.set(abstinenceKey, JSON.stringify({ checkInDates: [date] }));
    expect(recordAbstinenceConduct(date)).toBe(true);
    expect(loadPreceptCompanion().state.dailySessions).toEqual(daily);
    // Writer v1 cũ giữ các trường chưa biết khi parse, sửa owner cũ rồi stringify.
    const oldWriter = JSON.parse(rows.get(PRECEPT_COMPANION_KEY)!);
    oldWriter.days.push({ group: 'ten', date, answers: { kindness: 'review' } });
    rows.set(PRECEPT_COMPANION_KEY, JSON.stringify(oldWriter));
    expect(loadPreceptCompanion().state.dailySessions).toEqual(daily);
  });
  it('ends with partial or review answers without filling missing commitments or touching daily records', () => {
    const active = dailySession('ten');
    expect(saveDailySession({ ...active, answers: { conduct: 'review' } })).toBe(true);
    vi.setSystemTime(new Date(active.endsAt));
    expect(saveDailySession({ ...active, status: 'ended', answers: { kindness: 'kept' } })).toBe(true);
    const ended = loadPreceptCompanion().state.dailySessions?.[0];
    expect(ended).toEqual({ ...active, status: 'ended', answers: { conduct: 'review', kindness: 'kept' } });
    expect(loadPreceptCompanion().state.days).toEqual([]);
    const write = vi.spyOn(window.localStorage, 'setItem');
    expect(saveDailySession({ ...ended!, answers: {} })).toBe(true);
    expect(write).not.toHaveBeenCalled();
  });
  it('preserves malformed additive session bytes and reports load errors without resetting old data', () => {
    const corrupted = JSON.stringify({ version: 1, days: [], sessions: [], conductDates: [], dailySessions: [{ ...dailySession(), endsAt: 'broken' }] });
    rows.set(PRECEPT_COMPANION_KEY, corrupted);
    expect(loadPreceptCompanion().error).toBe(true);
    expect(saveDailySession(dailySession())).toBe(false);
    expect(rows.get(PRECEPT_COMPANION_KEY)).toBe(corrupted);
  });
});
