import { describe, expect, it, vi } from 'vitest';
import {
  calculateThanhTinhStats,
  applyDailyThanhTinhCheckIn,
  loadThanhTinhState,
  saveThanhTinhState,
  checkAndApplyMissedCheckIns,
  getDefaultThanhTinhState,
  getThanhTinhAbstinenceInfo,
  THANH_TINH_MILESTONES,
  THANH_TINH_MILESTONES_EN
} from '../../../src/lib/domain/practice/thanh-tinh';

describe('Thanh Tinh Tam Domain Logic', () => {
  it('initializes default state cleanly', () => {
    const state = getDefaultThanhTinhState('2026-10-19T00:00:00.000Z');
    expect(state.joined).toBe(false);
    expect(state.cleanSince).toBe('2026-10-19T00:00:00.000Z');
    expect(state.resistedUrgesCount).toBe(0);
    expect(state.longestStreakDays).toBe(0);
  });

  it('calculates days, hours, minutes and correct milestone', () => {
    const cleanSince = new Date('2026-10-10T00:00:00.000Z').toISOString();
    const state = {
      ...getDefaultThanhTinhState(cleanSince),
      longestStreakDays: 5
    };
    // 9.5 days later
    const now = new Date('2026-10-19T12:30:00.000Z');
    const stats = calculateThanhTinhStats(state, now);

    expect(stats.totalDays).toBe(9);
    expect(stats.hoursRemainder).toBe(12);
    expect(stats.minutesRemainder).toBe(30);
    expect(stats.currentMilestone.days).toBe(7);
    expect(stats.currentMilestone.title).toBe('Nhất Tuần Thanh Tịnh');
    expect(stats.nextMilestone?.days).toBe(14);
    expect(stats.effectiveLongestStreak).toBe(9);
  });

  it('supports English milestones when isEn is true', () => {
    const cleanSince = new Date('2026-10-10T00:00:00.000Z').toISOString();
    const state = getDefaultThanhTinhState(cleanSince);
    const now = new Date('2026-10-19T12:30:00.000Z');
    const statsEn = calculateThanhTinhStats(state, now, true);

    expect(statsEn.currentMilestone.title).toBe('One Week of Purity');
    expect(statsEn.nextMilestone?.title).toBe('Steadfast Diligence');
    expect(THANH_TINH_MILESTONES_EN.length).toBe(THANH_TINH_MILESTONES.length);
  });

  it('handles milestones up to 20 years (7300 days)', () => {
    // 1 year milestone test
    const cleanSince1Y = new Date('2025-01-01T00:00:00.000Z').toISOString();
    const state1Y = getDefaultThanhTinhState(cleanSince1Y);
    const now1Y = new Date('2026-01-05T00:00:00.000Z');
    const stats1Y = calculateThanhTinhStats(state1Y, now1Y);

    expect(stats1Y.totalDays).toBeGreaterThanOrEqual(365);
    expect(stats1Y.currentMilestone.title).toBe('Đại Viên Mãn');
    expect(stats1Y.nextMilestone?.days).toBe(730);
    expect(stats1Y.nextMilestone?.title).toBe('Thân Tâm Trinh Bạch');

    // 20 years milestone test (7305 days)
    const cleanSince20Y = new Date('2006-01-01T00:00:00.000Z').toISOString();
    const state20Y = getDefaultThanhTinhState(cleanSince20Y);
    const now20Y = new Date('2026-01-05T00:00:00.000Z');
    const stats20Y = calculateThanhTinhStats(state20Y, now20Y);

    expect(stats20Y.totalDays).toBeGreaterThanOrEqual(7300);
    expect(stats20Y.currentMilestone.title).toBe('Viên Mãn Kim Cang');
    expect(stats20Y.nextMilestone).toBeNull();
    expect(stats20Y.progressToNextMilestone).toBe(100);
  });

  it('detects missed check-in without assuming relapse or rewriting the previous start', () => {
    // Last checked in on 2026-10-17, current date is 2026-10-19 (missed 2026-10-18)
    const state = {
      ...getDefaultThanhTinhState('2026-10-10T00:00:00.000Z'),
      lastCheckInDate: '2026-10-17'
    };
    const now = new Date('2026-10-19T10:00:00.000Z');
    const { state: updated, missed } = checkAndApplyMissedCheckIns(state, now);

    expect(missed).toBe(true);
    expect(updated).toEqual({ ...state, checkInRunStartedAt: null });
  });

  it('does not reset streak if checked in yesterday and today is ongoing', () => {
    const state = {
      ...getDefaultThanhTinhState('2026-10-10T00:00:00.000Z'),
      lastCheckInDate: '2026-10-18'
    };
    const now = new Date('2026-10-19T10:00:00.000Z');
    const { state: updated, missed } = checkAndApplyMissedCheckIns(state, now);

    expect(missed).toBe(false);
    expect(updated.cleanSince).toBe('2026-10-10T00:00:00.000Z');
  });

  it('detects missed check-in for joined user who never checked in after starting several days ago', () => {
    // Joined 3 days ago on 2026-10-16, now is 2026-10-19, never checked in
    const state = {
      ...getDefaultThanhTinhState('2026-10-16T00:00:00.000Z'),
      joined: true,
      lastCheckInDate: null
    };
    const now = new Date('2026-10-19T10:00:00.000Z');
    const { state: updated, missed } = checkAndApplyMissedCheckIns(state, now);

    expect(missed).toBe(true);
    expect(updated).toEqual({ ...state, checkInRunStartedAt: null });
  });

  it('does not penalize unjoined users even if cleanSince is in the past', () => {
    const state = {
      ...getDefaultThanhTinhState('2026-10-01T00:00:00.000Z'),
      joined: false,
      lastCheckInDate: null
    };
    const now = new Date('2026-10-19T10:00:00.000Z');
    const { missed } = checkAndApplyMissedCheckIns(state, now);

    expect(missed).toBe(false);
  });

  it('does not mark missed if user joined today and has not checked in yet', () => {
    const state = {
      ...getDefaultThanhTinhState('2026-10-19T02:00:00.000Z'),
      joined: true,
      lastCheckInDate: null
    };
    const now = new Date('2026-10-19T10:00:00.000Z');
    const { missed } = checkAndApplyMissedCheckIns(state, now);

    expect(missed).toBe(false);
  });

  it('does not treat a backdated clean start as missed check-ins before joining', () => {
    const state = {
      ...getDefaultThanhTinhState('2026-10-01T00:00:00.000Z'),
      joined: true,
      joinedAt: '2026-10-19T02:00:00.000Z'
    };
    const result = checkAndApplyMissedCheckIns(state, new Date('2026-10-19T10:00:00.000Z'));
    expect(result).toEqual({ state, missed: false });
    expect(result.state.cleanSince).toBe('2026-10-01T00:00:00.000Z');
    expect(result.state.relapseHistory).toEqual([]);
  });

  it('still detects missed days after joining with a backdated start', () => {
    const state = {
      ...getDefaultThanhTinhState('2026-10-01T00:00:00.000Z'),
      joined: true,
      joinedAt: '2026-10-19T02:00:00.000Z'
    };
    expect(checkAndApplyMissedCheckIns(state, new Date('2026-10-20T10:00:00.000Z')).missed).toBe(false);
    expect(checkAndApplyMissedCheckIns(state, new Date('2026-10-21T10:00:00.000Z')).missed).toBe(true);
  });

  it('keeps the last check-in authoritative after joining and uses a later relapse start', () => {
    const joined = {
      ...getDefaultThanhTinhState('2026-10-01T00:00:00.000Z'),
      joined: true,
      joinedAt: '2026-10-19T02:00:00.000Z',
      lastCheckInDate: '2026-10-23'
    };
    const now = new Date('2026-10-24T10:00:00.000Z');
    expect(checkAndApplyMissedCheckIns(joined, now)).toEqual({ state: joined, missed: false });
    const restarted = { ...joined, cleanSince: '2026-10-24T02:00:00.000Z', lastCheckInDate: null };
    expect(checkAndApplyMissedCheckIns(restarted, now)).toEqual({ state: restarted, missed: false });
  });

  it('correctly provides Thọ Khang Bảo Giám and Buddhist holy day abstinence info (VI and EN)', () => {
    // 2026-02-17 is Lunar 1/1 (Tet Nguyen Dan, Via Phat Di Lac, Thap Trai, Tho Khang)
    const infoVi = getThanhTinhAbstinenceInfo(new Date(2026, 1, 17), false);
    expect(infoVi.isAbstinenceDay).toBe(true);
    expect(infoVi.viaName).toContain('Di Lặc');
    expect(infoVi.isThapTrai).toBe(true);
    expect(infoVi.kiengDamReason).toContain('Tết Nguyên Đán');
    expect(infoVi.reasons.length).toBeGreaterThanOrEqual(2);
    expect(infoVi.dayTitle).toContain('Di Lặc');
    expect(infoVi.harmSummary).toBeTruthy();

    const infoEn = getThanhTinhAbstinenceInfo(new Date(2026, 1, 17), true);
    expect(infoEn.isAbstinenceDay).toBe(true);
    expect(infoEn.isThapTrai).toBe(true);
    expect(infoEn.dayTitle).toContain('Holy Day');
    expect(infoEn.reasons.some(r => r.desc.includes('precept'))).toBe(true);
    expect(infoEn.harmSummary).toBeTruthy();
  });
});

describe('daily check-in streak', () => {
  const first = new Date('2026-10-28T03:15:00.000Z');
  const second = new Date('2026-10-29T03:15:00.000Z');
  const third = new Date('2026-10-30T03:15:00.000Z');
  const start = () => ({ ...getDefaultThanhTinhState(first.toISOString()), joined: true, joinedAt: first.toISOString() });

  it('counts consecutive check-ins 1, 2, 3 and counts each Vietnamese date once', () => {
    const one = applyDailyThanhTinhCheckIn(start(), first);
    const two = applyDailyThanhTinhCheckIn(one, second);
    const three = applyDailyThanhTinhCheckIn(two, third);
    expect(calculateThanhTinhStats(one, first).checkInStreakDays).toBe(1);
    expect(calculateThanhTinhStats(two, second).checkInStreakDays).toBe(2);
    expect(calculateThanhTinhStats(three, third).checkInStreakDays).toBe(3);
    expect(applyDailyThanhTinhCheckIn(three, new Date('2026-10-30T12:00:00Z'))).toEqual(three);
    expect(three.checkInDates).toEqual(['2026-10-28', '2026-10-29', '2026-10-30']);
  });

  it('uses Vietnamese midnight independently of elapsed 24-hour periods', () => {
    const before = new Date('2026-10-28T16:59:00Z');
    const after = new Date('2026-10-28T17:01:00Z');
    const one = applyDailyThanhTinhCheckIn(start(), before);
    const two = applyDailyThanhTinhCheckIn(one, after);
    expect(calculateThanhTinhStats(two, after).checkInStreakDays).toBe(2);
    expect(two.checkInDates).toEqual(['2026-10-28', '2026-10-29']);
  });

  it('pauses at zero after a whole missed day without inventing relapse or rewriting history', () => {
    const two = applyDailyThanhTinhCheckIn(applyDailyThanhTinhCheckIn(start(), first), second);
    two.longestStreakDays = 9;
    two.relapseHistory = [{ date: '2026-10-01T01:00:00Z', reason: 'explicit' }];
    const snapshot = structuredClone(two);
    const missedAt = new Date('2026-10-30T17:00:00Z');
    const result = checkAndApplyMissedCheckIns(two, missedAt);
    expect(result.missed).toBe(true);
    expect(result.state).toEqual({ ...snapshot, checkInRunStartedAt: null });
    expect(two).toEqual(snapshot);
    for (const later of [missedAt, new Date('2026-11-01T12:30:45Z')]) {
      const stats = calculateThanhTinhStats(result.state, later);
      expect([stats.checkInStreakDays, stats.checkInHoursRemainder, stats.checkInMinutesRemainder, stats.checkInSecondsRemainder]).toEqual([0, 0, 0, 0]);
    }
    const restarted = applyDailyThanhTinhCheckIn(result.state, missedAt);
    expect(calculateThanhTinhStats(restarted, missedAt).checkInStreakDays).toBe(1);
    expect(calculateThanhTinhStats(restarted, missedAt).checkInDiffMs).toBe(0);
    expect(restarted.cleanSince).toBe(two.cleanSince);
    expect(restarted.checkInDates).toEqual([...two.checkInDates, '2026-10-31']);
    expect(restarted.relapseHistory).toEqual(two.relapseHistory);
    expect(restarted.longestStreakDays).toBe(9);
  });

  it('does not reset yesterday while today is still ongoing and preserves the active clock', () => {
    const one = applyDailyThanhTinhCheckIn(start(), first);
    const later = new Date('2026-10-29T04:16:02Z');
    expect(checkAndApplyMissedCheckIns(one, later).missed).toBe(false);
    const stats = calculateThanhTinhStats(one, later);
    expect([stats.checkInStreakDays, stats.checkInHoursRemainder, stats.checkInMinutesRemainder, stats.checkInSecondsRemainder]).toEqual([1, 1, 1, 2]);
  });

  it('adopts only explicit valid legacy check-ins and never fabricates elapsed time', () => {
    const legacy = { ...start(), lastCheckInDate: '2026-10-29', checkInDates: ['2026-10-27', '2026-10-28', '2026-10-29', '2026-10-29', '2026-02-30', '2099-01-01'] };
    const stats = calculateThanhTinhStats(legacy, third);
    expect(stats.checkInStreakDays).toBe(2);
    expect(stats.checkInDiffMs).toBe(0);
    const continued = applyDailyThanhTinhCheckIn(legacy, third);
    expect(calculateThanhTinhStats(continued, third).checkInStreakDays).toBe(3);
    expect(calculateThanhTinhStats(continued, third).checkInDiffMs).toBe(0);
    const lastOnly = { ...start(), lastCheckInDate: '2026-10-29', checkInDates: [] };
    expect(calculateThanhTinhStats(lastOnly, third).checkInStreakDays).toBe(1);
    expect(calculateThanhTinhStats(start(), first).checkInStreakDays).toBe(0);
  });

  it('keeps a new run separate from old same-day dates after an explicit relapse/reset', () => {
    const old = applyDailyThanhTinhCheckIn(start(), first);
    const reset = { ...old, cleanSince: '2026-10-28T04:00:00Z', lastCheckInDate: null, checkInRunStartedAt: null };
    expect(calculateThanhTinhStats(reset, new Date('2026-10-28T04:05:00Z')).checkInStreakDays).toBe(0);
    const restarted = applyDailyThanhTinhCheckIn(reset, new Date('2026-10-28T04:05:00Z'));
    expect(calculateThanhTinhStats(restarted, new Date('2026-10-28T04:05:00Z')).checkInStreakDays).toBe(1);
    expect(restarted.checkInDates).toEqual(old.checkInDates);
  });

  it('retains an earned check-in record after interruption without changing the old record field', () => {
    const two = applyDailyThanhTinhCheckIn(applyDailyThanhTinhCheckIn(start(), first), second);
    const paused = checkAndApplyMissedCheckIns(two, new Date('2026-11-01T00:00:00Z')).state;
    expect(calculateThanhTinhStats(paused, new Date('2026-11-01T00:00:00Z')).checkInEffectiveLongestStreak).toBe(2);
    expect(paused.longestStreakDays).toBe(0);
  });

  it('restarts the two-consecutive-check-in recovery after a gap following an actual relapse', () => {
    const recovering = {
      ...applyDailyThanhTinhCheckIn(start(), first),
      hasRecentRelapse: true,
      consecutiveCheckInsSinceRelapse: 1,
      relapseHistory: [{ date: '2026-10-27T03:00:00Z', reason: 'explicit relapse' }]
    };
    const result = checkAndApplyMissedCheckIns(recovering, third);
    expect(result.missed).toBe(true);
    expect(result.state).toEqual({ ...recovering, checkInRunStartedAt: null, consecutiveCheckInsSinceRelapse: 0 });
    expect(recovering.consecutiveCheckInsSinceRelapse).toBe(1);
    expect(result.state.hasRecentRelapse).toBe(true);
    expect(result.state.relapseHistory).toEqual(recovering.relapseHistory);
  });

  it('repairs a stale last date without crediting an already recorded day twice', () => {
    const two = applyDailyThanhTinhCheckIn(applyDailyThanhTinhCheckIn(start(), first), second);
    const stale = { ...two, lastCheckInDate: '2026-10-28' };
    const repaired = applyDailyThanhTinhCheckIn(stale, second);
    expect(repaired.lastCheckInDate).toBe('2026-10-29');
    expect(repaired.longestCheckInStreakDays).toBe(2);
    expect(calculateThanhTinhStats(repaired, second).checkInStreakDays).toBe(2);
  });

  it('loads legacy state without adding a false pause and round-trips the new run metadata', () => {
    let stored = JSON.stringify({ ...start(), lastCheckInDate: '2026-10-29', checkInDates: ['2026-10-28', '2026-10-29'] });
    const storage = { getItem: () => stored, setItem: (_key: string, value: string) => { stored = value; } };
    vi.stubGlobal('localStorage', storage);
    vi.stubGlobal('window', { localStorage: storage, dispatchEvent: () => true });
    try {
      const legacy = loadThanhTinhState();
      expect(legacy.checkInRunStartedAt).toBeUndefined();
      expect(calculateThanhTinhStats(legacy, third).checkInStreakDays).toBe(2);
      const continued = applyDailyThanhTinhCheckIn(legacy, third);
      expect(saveThanhTinhState(continued)).toBe(true);
      expect(loadThanhTinhState()).toEqual(continued);
      stored = JSON.stringify({ ...continued, checkInRunStartedAt: 'invalid', checkInRunStartDate: '2026-02-30' });
      expect(loadThanhTinhState().checkInRunStartedAt).toBeNull();
      expect(loadThanhTinhState().checkInRunStartDate).toBeUndefined();
    } finally { vi.unstubAllGlobals(); }
  });
});
