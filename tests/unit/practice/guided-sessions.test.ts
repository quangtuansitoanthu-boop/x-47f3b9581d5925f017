import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  MEDITATION_DURATION_PRESETS_MINUTES,
  ROSARY_DAILY_GOALS,
  ROSARY_PHRASES,
  ROSARY_SIZES,
  getRosaryPracticeType,
  normalizeCustomRosaryPhrases,
  resolveRosarySelection,
  acceptRosaryInteraction,
  advanceMeditationSession,
  cancelMeditationSession,
  createMeditationSession,
  createRosarySession,
  displayRosaryPhrase,
  reconcileMeditationPlayback,
  meditationDurationSeconds,
  meditationEvidence,
  pauseMeditationSession,
  resolveWoodenFishBpm,
  resumeMeditationSession,
  rosaryEvidence,
  rosaryGoalProgress,
  scheduledCuesDue,
  setMeditationVisibility,
  woodenFishBeatsDue,
} from '../../../src/lib/domain/practice/guided-sessions';
import {
  normalizePracticeSessionFinishRequest,
  normalizePracticeSessionStart,
  verifyPracticeSession,
} from '../../../src/lib/domain/practice/sessions';

describe('native background meditation', () => {
  it('uses native remaining time after suspension and honors native pause rather than elapsed wall time', () => {
    let state = createMeditationSession(900, 0, 30, true);
    state.hidden = true;
    state = reconcileMeditationPlayback(state, 600_000, 630_000, false).state;
    expect(state.phase).toBe('paused');
    expect(state.activeElapsedMs).toBe(300_000);
    const paused = reconcileMeditationPlayback(state, 600_000, 930_000, false);
    expect(paused.state.activeElapsedMs).toBe(300_000);
    state = reconcileMeditationPlayback(paused.state, 0, 1_530_000, false).state;
    expect(state.phase).toBe('completed');
    expect(state.activeElapsedMs).toBe(900_000);
    expect(meditationEvidence(state)).toMatchObject({ activeSeconds: 0, backgroundActiveSeconds: 900 });
  });
});

describe('wooden-fish and practice cue scheduling', () => {
  it('exposes the requested tempo ranges and clamps custom tempo inside its preset', () => {
    expect(resolveWoodenFishBpm('slow')).toBe(45);
    expect(resolveWoodenFishBpm('slow', 20)).toBe(40);
    expect(resolveWoodenFishBpm('medium', 68)).toBe(68);
    expect(resolveWoodenFishBpm('fast', 120)).toBe(108);
  });

  it('derives beats from absolute elapsed time and bounds delayed catch-up', () => {
    expect(woodenFishBeatsDue(0, 3_050, 60)).toEqual([1_000, 2_000, 3_000]);
    expect(woodenFishBeatsDue(3_050, 5_010, 60)).toEqual([4_000, 5_000]);
    expect(woodenFishBeatsDue(0, 10_000, 60, 2)).toEqual([9_000, 10_000]);
  });

  it('emits configured bell, bowl and khanh cues exactly once across a window', () => {
    const cues = [
      { atElapsedMs: 1_000, kind: 'bell' as const, repeat: 3 },
      { atElapsedMs: 5_000, kind: 'bowl' as const },
      { atElapsedMs: 8_000, kind: 'khánh' as const },
    ];
    expect(scheduledCuesDue(cues, 900, 5_000)).toEqual([
      { atElapsedMs: 1_000, kind: 'bell' },
      { atElapsedMs: 1_000, kind: 'bell' },
      { atElapsedMs: 1_000, kind: 'bell' },
      { atElapsedMs: 5_000, kind: 'bowl' },
    ]);
    expect(scheduledCuesDue(cues, 5_000, 8_000)).toEqual([{ atElapsedMs: 8_000, kind: 'khánh' }]);
  });
});

describe('meditation session state machine', () => {
  it('counts a locked-screen session when explicitly enabled and keeps disjoint legacy evidence', () => {
    let state = createMeditationSession(900, 0, 30, true);
    state = advanceMeditationSession(state, 30_000).state;
    state = setMeditationVisibility(state, true, 30_000).state;
    state = advanceMeditationSession(state, 630_000).state;
    expect(state.activeElapsedMs).toBe(600_000);
    expect(meditationEvidence(state)).toMatchObject({
      activeSeconds: 0, hiddenSeconds: 600, backgroundActiveSeconds: 600, clientElapsedSeconds: 630,
    });
    const completed = advanceMeditationSession(state, 930_000);
    expect(completed.state.phase).toBe('completed');
    expect(completed.cues).toEqual(['end_bell']);
    expect(advanceMeditationSession(completed.state, 1_000_000).cues).toEqual([]);
  });


  it('supports all requested presets plus validated custom duration', () => {
    expect(MEDITATION_DURATION_PRESETS_MINUTES).toEqual([15, 30, 45, 60]);
    expect(meditationDurationSeconds(22)).toBe(1_320);
    expect(() => meditationDurationSeconds(0)).toThrow('invalid_meditation_duration');
  });

  it('prepares for 30 seconds, emits three start bells, then one end bell', () => {
    let transition = advanceMeditationSession(createMeditationSession(60, 0), 29_000);
    expect(transition.state.phase).toBe('preparing');
    expect(transition.cues).toEqual([]);

    transition = advanceMeditationSession(transition.state, 31_000);
    expect(transition.state.phase).toBe('active');
    expect(transition.state.activeElapsedMs).toBe(1_000);
    expect(transition.cues).toEqual(['start_bell', 'start_bell', 'start_bell']);

    transition = advanceMeditationSession(transition.state, 90_000);
    expect(transition.state.phase).toBe('completed');
    expect(transition.cues).toEqual(['end_bell']);
    expect(advanceMeditationSession(transition.state, 120_000).cues).toEqual([]);
  });

  it('pauses hidden and explicit pause time while retaining honest evidence', () => {
    let transition = advanceMeditationSession(createMeditationSession(60, 0, 0), 10_000);
    transition = setMeditationVisibility(transition.state, true, 10_000);
    transition = advanceMeditationSession(transition.state, 30_000);
    transition = setMeditationVisibility(transition.state, false, 30_000);
    transition = pauseMeditationSession(transition.state, 40_000);
    transition = advanceMeditationSession(transition.state, 55_000);
    transition = resumeMeditationSession(transition.state, 55_000);
    transition = advanceMeditationSession(transition.state, 90_000);

    expect(transition.state.phase).toBe('active');
    expect(meditationEvidence(transition.state)).toEqual({
      activeSeconds: 55,
      clientElapsedSeconds: 90,
      hiddenSeconds: 20,
    });
  });

  it('ignores a backwards monotonic clock and supports cancellation', () => {
    let transition = advanceMeditationSession(createMeditationSession(60, 1_000, 0), 11_000);
    transition = advanceMeditationSession(transition.state, 5_000);
    expect(transition.state.activeElapsedMs).toBe(10_000);
    expect(cancelMeditationSession(transition.state, 12_000).state.phase).toBe('cancelled');
  });
});

describe('rosary session evidence', () => {
  it.each([2, 18])('preserves server credit for %i legal beads completed at the 400ms boundary', (count) => {
    const startedAt = Date.parse('2026-11-01T10:00:00.000Z');
    let state = createRosarySession({
      dailyGoal: 1_000, phrase: ROSARY_PHRASES[0], size: 18, startedAtMs: 0,
    });
    for (let index = 0; index < count; index++) {
      if (index > 0) {
        expect(acceptRosaryInteraction(state, index * 400 - 1).accepted).toBe(false);
      }
      const result = acceptRosaryInteraction(state, index * 400);
      expect(result.accepted).toBe(true);
      state = result.state;
    }
    const elapsedMs = (count - 1) * 400;
    const start = normalizePracticeSessionStart({
      activityType: 'rosary', clientSessionId: `boundary-${count}`, idempotencyKey: `boundary-${count}`,
      sourceId: ROSARY_PHRASES[0], sourceKind: 'guided_rosary', targetCount: 18,
      startedAt: new Date(startedAt).toISOString(),
    });
    const finish = normalizePracticeSessionFinishRequest({
      completedAt: new Date(startedAt + elapsedMs).toISOString(),
      evidenceSummary: rosaryEvidence(state, elapsedMs),
    });

    expect(verifyPracticeSession(start, finish, { serverElapsedSeconds: Math.floor(elapsedMs / 1_000) }))
      .toMatchObject({ acceptedCount: count, verificationResult: 'accepted' });
    expect(verifyPracticeSession(start, {
      ...finish, evidenceSummary: { ...finish.evidenceSummary, minimumIntervalMs: 399 },
    }, { serverElapsedSeconds: Math.floor(elapsedMs / 1_000) }))
      .toMatchObject({ acceptedCount: 0, verificationReason: 'rosary_interaction_rate' });
  });

  it('classifies every canonical mantra without changing canonical phrase values', () => {
    for (const phrase of ROSARY_PHRASES.slice(9, 13)) {
      expect(getRosaryPracticeType(phrase)).toBe('Trì chú');
      expect(resolveRosarySelection(phrase, [])).toEqual({ phrase, type: 'Trì chú' });
    }
    for (const phrase of ROSARY_PHRASES.slice(0, 9)) {
      expect(resolveRosarySelection(phrase, [])).toEqual({ phrase, type: 'Niệm danh hiệu' });
    }
    expect(getRosaryPracticeType('DIỆT ĐỊNH NGHIỆP CHÂN NGÔN')).toBe('Trì chú');
  });

  it('rejects placeholders and missing selections while resolving saved custom text and explicit type', () => {
    const custom = [{ id: 'cp_1793400000000_abc12', text: 'Nam mô Dược Sư', type: 'Niệm danh hiệu' as const }];
    expect(resolveRosarySelection('custom:cp_1793400000000_abc12', custom)).toEqual({ phrase: 'Nam mô Dược Sư', type: 'Niệm danh hiệu' });
    for (const phrase of ['Tùy chọn', 'custom:missing', '', 'unknown']) {
      expect(resolveRosarySelection(phrase, custom)).toBeNull();
    }
  });

  it('normalizes only safe unique custom phrases and preserves optional creation text', () => {
    const good = { id: 'cp_1793400000000_abc12', text: '  Om Tare  ', type: 'Trì chú', createdAt: '2026-10-31' };
    expect(normalizeCustomRosaryPhrases([
      null, good, { ...good, text: 'Duplicate' },
      { ...good, id: 'bad' }, { ...good, id: 'cp_1793400000001_a', text: ' ' },
      { ...good, id: 'cp_1793400000002_a', text: 'x'.repeat(121) },
      { ...good, id: 'cp_1793400000003_a', type: 'Khác' },
      { ...good, id: 'cp_1793400000004_ABC' }, { ...good, id: 'cp_123_a' },
      { ...good, id: 'cp_12345678901234567_a' }, { ...good, id: 'cp_1793400000005_abcdefghijklm' },
      { ...good, id: 'cp_1793400000006_a', text: 'Nam mô\nPhật' },
      { ...good, id: 'cp_1793400000007_a', text: 'Nam mô\u0085Phật' },
      { id: 'cp_1793400000008_a', text: 'Nam mô A Di Đà Phật', type: 'Niệm danh hiệu', createdAt: 3 },
    ])).toEqual([
      { ...good, text: 'Om Tare' },
      { id: 'cp_1793400000008_a', text: 'Nam mô A Di Đà Phật', type: 'Niệm danh hiệu' },
    ]);
    expect(normalizeCustomRosaryPhrases({})).toEqual([]);
    expect(normalizeCustomRosaryPhrases(null)).toEqual([]);
  });
  it('exposes all requested sizes, phrases and daily goals', () => {
    expect(ROSARY_SIZES).toEqual([18, 27, 54, 108]);
    expect(ROSARY_DAILY_GOALS).toEqual([1_000, 3_000, 10_000]);
    expect(ROSARY_PHRASES).toEqual([
      'Nam mô A Di Đà Phật',
      'Nam mô Quán Thế Âm Bồ Tát',
      'Nam mô Bổn Sư Thích Ca Mâu Ni Phật',
      'Nam mô Địa Tạng Vương Bồ Tát',
      'Nam mô Dược Sư Lưu Ly Quang Vương Phật',
      'Nam mô Đại Trí Văn Thù Sư Lợi Bồ Tát',
      'Nam mô Đại Hạnh Phổ Hiền Bồ Tát',
      'Nam mô Đại Thế Chí Bồ Tát',
      'Nam mô Chuẩn Đề Vương Bồ Tát',
      'Án Ma Ni Bát Mê Hồng',
      'Diệt Định Nghiệp Chân Ngôn — Ôm Pờ Ra Ma Ni Đa Ni Xoa Ha',
      'Tâm Chú Lăng Nghiêm — Ôm, A Na Lê, Vi Sa Đê, Vi Ra Va Chờ Ra Đa Rê, Ban Đa, Ban Đa Ni, Va Chờ Ra Ba Ni, Phạt, Hùm, Trùm, Phạt, Soa ha.',
      'Ngũ Đại Tâm Chú Lăng Nghiêm — Che Đa Nim, A Ca La, Mơ Ri Tiu, Pa Ri, Tờ Ra Da, Na Ca Rim',
      'Tùy chọn',
    ]);
  });

  it.each([
    'Diệt Định Nghiệp Chân Ngôn — Ôm Pờ Ra Ma Ni Đa Ni Xoa Ha',
    'Tâm Chú Lăng Nghiêm — Ôm, A Na Lê, Vi Sa Đê, Vi Ra Va Chờ Ra Đa Rê, Ban Đa, Ban Đa Ni, Va Chờ Ra Ba Ni, Phạt, Hùm, Trùm, Phạt, Soa ha.',
    'Ngũ Đại Tâm Chú Lăng Nghiêm — Che Đa Nim, A Ca La, Mơ Ri Tiu, Pa Ri, Tờ Ra Da, Na Ca Rim',
  ])('keeps the requested mantra unchanged in Vietnamese and English: %s', (mantra) => {
    const phrase = ROSARY_PHRASES.find((value) => String(value) === mantra);
    expect(phrase).toBe(mantra);
    if (!phrase) throw new Error('missing_rosary_mantra');
    expect(displayRosaryPhrase(phrase, 'vi')).toBe(mantra);
    expect(displayRosaryPhrase(phrase, 'en')).toBe(mantra);
  });

  it('matches the two Shurangama mantras to the bundled Vietnamese ritual', () => {
    const chapters = JSON.parse(readFileSync(new URL('../../../static/offline-data/chapters/tt_1781275267452.json', import.meta.url), 'utf8')) as Array<{ noi_dung: string }>;
    for (const phrase of ROSARY_PHRASES.filter((value) => value.includes('Tâm Chú Lăng Nghiêm'))) {
      expect(chapters[0].noi_dung).toContain(phrase.split(' — ')[1]);
    }
  });

  it('rejects interactions below 400ms and reports accepted evidence only', () => {
    let state = createRosarySession({
      dailyGoal: 1_000,
      phrase: ROSARY_PHRASES[0],
      size: 18,
      startedAtMs: 1_000,
    });
    let result = acceptRosaryInteraction(state, 1_000);
    expect(result.accepted).toBe(true);
    state = result.state;
    result = acceptRosaryInteraction(state, 1_399);
    expect(result.accepted).toBe(false);
    result = acceptRosaryInteraction(state, 1_400);
    expect(result.accepted).toBe(true);
    state = result.state;
    expect(rosaryEvidence(state, 2_000)).toEqual({
      acceptedCount: 2,
      clientElapsedSeconds: 1,
      minimumIntervalMs: 400,
    });
  });

  it('announces cycle and goal crossings and caps circular progress', () => {
    let state = createRosarySession({
      dailyCountBeforeSession: 999,
      dailyGoal: 1_000,
      phrase: ROSARY_PHRASES[1],
      size: 18,
      startedAtMs: 0,
    });
    let result = acceptRosaryInteraction(state, 0);
    expect(result.reachedDailyGoal).toBe(true);
    state = result.state;
    for (let count = 1; count < 18; count += 1) {
      result = acceptRosaryInteraction(state, count * 400);
      state = result.state;
    }
    expect(result.completedCycle).toBe(true);
    expect(rosaryGoalProgress(state)).toBe(1);
  });
});
