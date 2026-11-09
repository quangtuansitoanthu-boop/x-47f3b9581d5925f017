import { describe, expect, it } from 'vitest';

import {
  meditationVerification,
  normalizePracticeSessionCompletion,
  normalizePracticeSessionFinishRequest,
  normalizePracticeSessionStart,
  verifyPracticeSession,
} from '../../../src/lib/domain/practice/sessions';

describe('automatic practice session contracts', () => {
  it('accepts10800played recitations using the shipped108bead necklace contract', () => {
    const start = practiceStart('rosary', { targetCount: 108 });
    const completed = normalizePracticeSessionFinishRequest({
      completedAt: '2026-09-04T16:00:08.000Z',
      evidenceSummary: { acceptedCount: 10800, clientElapsedSeconds: 21608, minimumIntervalMs: 2000 },
    });
    expect(verifyPracticeSession(start, completed, { serverElapsedSeconds: 21608 }))
      .toMatchObject({ acceptedCount: 10800, verificationResult: 'accepted' });
  });
  it('requires a supported automatic activity type', () => {
    expect(normalizePracticeSessionStart({
      activityType: 'rosary',
      clientSessionId: 'session-1',
      idempotencyKey: 'start-1',
      sourceId: 'Nam mô A Di Đà Phật',
      sourceKind: 'guided_rosary',
      startedAt: '2026-09-04T10:00:00.000Z',
      targetCount: 108,
    })).toMatchObject({ activityType: 'rosary', targetCount: 108 });

    expect(() => normalizePracticeSessionStart({
      activityType: 'manual',
      clientSessionId: 'session-2',
      idempotencyKey: 'start-2',
    })).toThrow('invalid_activity_type');
  });

  it('allows shipped targets and bounded custom meditation durations', () => {
    for (const targetDurationSeconds of [60, 600, 900, 1_800, 2_700, 3_600, 86_400]) {
      expect(practiceStart('meditation', { targetDurationSeconds })).toMatchObject({ targetDurationSeconds });
    }
    for (const targetCount of [18, 27, 54, 108]) {
      expect(practiceStart('rosary', { targetCount })).toMatchObject({ targetCount });
    }
    expect(practiceStart('scripture', { targetDurationSeconds: 30 })).toMatchObject({ targetDurationSeconds: 30 });
    expect(practiceStart('scripture', { targetDurationSeconds: 1_200 })).toMatchObject({ targetDurationSeconds: 1_200 });
    expect(practiceStart('model_chant', { targetDurationSeconds: 1 })).toMatchObject({ targetDurationSeconds: 1 });
    expect(practiceStart('dharma_talk', { targetDurationSeconds: null })).toMatchObject({ targetDurationSeconds: null });
  });

  it('accepts the new rosary mantra in the server session contract', () => {
    expect(practiceStart('rosary', {
      sourceId: 'Diệt Định Nghiệp Chân Ngôn — Ôm Pờ Ra Ma Ni Đa Ni Xoa Ha',
      targetCount: 18,
    })).toMatchObject({ sourceId: 'Diệt Định Nghiệp Chân Ngôn — Ôm Pờ Ra Ma Ni Đa Ni Xoa Ha' });
  });

  it.each([
    'Tâm Chú Lăng Nghiêm — Ôm, A Na Lê, Vi Sa Đê, Vi Ra Va Chờ Ra Đa Rê, Ban Đa, Ban Đa Ni, Va Chờ Ra Ba Ni, Phạt, Hùm, Trùm, Phạt, Soa ha.',
    'Ngũ Đại Tâm Chú Lăng Nghiêm — Che Đa Nim, A Ca La, Mơ Ri Tiu, Pa Ri, Tờ Ra Da, Na Ca Rim',
  ])('accepts the Vietnamese ritual source: %s', (sourceId) => {
    expect(practiceStart('rosary', { sourceId, targetCount: 18 })).toMatchObject({ sourceId });
  });

  it('accepts bounded custom rosary identities without relaxing verification', () => {
    const start = practiceStart('rosary', { sourceId: 'custom:cp_1793421000000_abc12', targetCount: 18 });
    expect(verify(start, { acceptedCount: 18, clientElapsedSeconds: 18, minimumIntervalMs: 400 }))
      .toMatchObject({ acceptedCount: 18, verificationResult: 'accepted' });
    expect(verify(start, { acceptedCount: 18, clientElapsedSeconds: 18, minimumIntervalMs: 399 }))
      .toMatchObject({ acceptedCount: 0, verificationReason: 'rosary_interaction_rate' });
    expect(() => practiceStart('rosary', { sourceId: start.sourceId, targetCount: 19 }))
      .toThrow('invalid_rosary_target');
  });

  it.each([
    'custom:', 'custom:cp_123_abc', 'custom:cp_1793421000000_',
    'custom:cp_1793421000000_ABC', 'custom:cp_1793421000000_abcdefghijklm',
    'custom:cp_17934210000000000_abc', 'custom:other_1793421000000_abc',
  ])('rejects malformed custom rosary identity: %s', (sourceId) => {
    expect(() => practiceStart('rosary', { sourceId, targetCount: 18 })).toThrow('invalid_rosary_source');
  });

  it.each(['custom:cp_1793421000000_abc\ninvalid', 'custom:' + 'x'.repeat(192)])(
    'keeps metadata bounds for custom rosary identities', (sourceId) => {
      expect(() => practiceStart('rosary', { sourceId, targetCount: 18 })).toThrow('invalid_source_id');
    },
  );

  it('rejects targets and source metadata outside shipped producer contracts', () => {
    expect(() => practiceStart('meditation', { targetDurationSeconds: 61 })).toThrow('invalid_meditation_target');
    expect(() => practiceStart('meditation', { targetDurationSeconds: 86_460 })).toThrow('invalid_meditation_target');
    expect(() => practiceStart('rosary', { targetCount: 19 })).toThrow('invalid_rosary_target');
    expect(() => practiceStart('rosary', { sourceId: 'Unsupported phrase', targetCount: 18 }))
      .toThrow('invalid_rosary_source');
    expect(() => practiceStart('scripture', { targetDurationSeconds: 29 })).toThrow('invalid_scripture_target');
    expect(() => practiceStart('scripture', { sourceId: null, targetDurationSeconds: 30 }))
      .toThrow('invalid_scripture_source');
    expect(() => practiceStart('model_chant', { targetDurationSeconds: 86_401 }))
      .toThrow('invalid_model_chant_target');
    expect(() => practiceStart('dharma_talk', { sourceKind: 'album', targetDurationSeconds: null }))
      .toThrow('invalid_dharma_talk_source');
    expect(() => practiceStart('dharma_talk', { targetDurationSeconds: 86_401 }))
      .toThrow('invalid_dharma_talk_target');
  });

  it('applies the meditation 80 percent threshold', () => {
    expect(meditationVerification({ activeSeconds: 720, targetSeconds: 900 })).toMatchObject({
      acceptedDurationSeconds: 720,
      verificationResult: 'accepted',
    });
    expect(meditationVerification({ activeSeconds: 719, targetSeconds: 900 })).toMatchObject({
      acceptedDurationSeconds: 0,
      verificationReason: 'meditation_below_80_percent',
      verificationResult: 'below_threshold',
    });
  });

  it('rejects negative accepted evidence', () => {
    expect(() => normalizePracticeSessionCompletion({
      acceptedCount: -1,
      acceptedDurationSeconds: 0,
      completedAt: '2026-09-04T10:00:00.000Z',
      evidenceSummary: {},
      verificationResult: 'accepted',
    })).toThrow('invalid_accepted_count');
  });

  it('accepts meditation only at 80 percent active time and rejects hidden-time mismatches', () => {
    const start = practiceStart('meditation', { targetDurationSeconds: 600 });
    expect(verify(start, {
      activeSeconds: 480,
      clientElapsedSeconds: 600,
      hiddenSeconds: 120,
    })).toMatchObject({ acceptedDurationSeconds: 480, verificationResult: 'accepted' });
    expect(verify(start, {
      activeSeconds: 480,
      clientElapsedSeconds: 500,
      hiddenSeconds: 100,
    })).toMatchObject({ acceptedDurationSeconds: 0, verificationReason: 'meditation_elapsed_mismatch' });
  });

  it('accepts bounded background meditation without changing legacy foreground/hidden meanings', () => {
    const start = practiceStart('meditation', { targetDurationSeconds: 600 });
    expect(verify(start, {
      activeSeconds: 0, backgroundActiveSeconds: 600, hiddenSeconds: 600, clientElapsedSeconds: 630,
    })).toMatchObject({ acceptedDurationSeconds: 600, verificationResult: 'accepted' });
    for (const backgroundActiveSeconds of [-1, 601, 100_000]) {
      expect(verify(start, {
        activeSeconds: 0, backgroundActiveSeconds, hiddenSeconds: 600, clientElapsedSeconds: 630,
      })).toMatchObject({ acceptedDurationSeconds: 0, verificationResult: 'implausible' });
    }
  });

  it('rejects overlapping foreground and hidden meditation evidence', () => {
    const start = practiceStart('meditation', { targetDurationSeconds: 600 });
    expect(verify(start, { activeSeconds: 600, hiddenSeconds: 600, backgroundActiveSeconds: 600, clientElapsedSeconds: 630 }))
      .toMatchObject({ acceptedDurationSeconds: 0, verificationResult: 'implausible' });
  });
  it('treats motion aggregates as optional support rather than an acceptance gate', () => {
    const start = practiceStart('meditation', { targetDurationSeconds: 600 });
    expect(verify(start, {
      activeSeconds: 480,
      clientElapsedSeconds: 480,
      hiddenSeconds: 0,
      motionStatus: 'denied',
    })).toMatchObject({ acceptedDurationSeconds: 480, verificationResult: 'accepted' });
    expect(verify(start, {
      activeSeconds: 479,
      clientElapsedSeconds: 479,
      hiddenSeconds: 0,
      motionSampleCount: 1_000,
      motionStatus: 'sampling',
      motionStillnessPercent: 100,
    })).toMatchObject({
      acceptedDurationSeconds: 0,
      verificationReason: 'meditation_below_80_percent',
      verificationResult: 'below_threshold',
    });
  });

  it('enforces the rosary 0.4 second anti-spam boundary', () => {
    const start = practiceStart('rosary', { targetCount: 108 });
    expect(verify(start, {
      acceptedCount: 18,
      clientElapsedSeconds: 18,
      minimumIntervalMs: 400,
    })).toMatchObject({ acceptedCount: 18, verificationResult: 'accepted' });
    expect(verify(start, {
      acceptedCount: 18,
      clientElapsedSeconds: 18,
      minimumIntervalMs: 399,
    })).toMatchObject({ acceptedCount: 0, verificationReason: 'rosary_interaction_rate' });
  });

  it('requires complete scripture reading and sequential model audio', () => {
    expect(verify(
      practiceStart('scripture', { targetDurationSeconds: 300 }),
      { activeSeconds: 300, clientElapsedSeconds: 320, scrollDepthPercent: 100 },
    )).toMatchObject({ acceptedCount: 1, verificationResult: 'accepted' });
    expect(verify(
      practiceStart('scripture', { targetDurationSeconds: 300 }),
      { activeSeconds: 299, clientElapsedSeconds: 320, scrollDepthPercent: 100 },
    )).toMatchObject({ verificationReason: 'scripture_not_completed' });
    expect(verify(
      practiceStart('model_chant', { targetDurationSeconds: 120 }),
      { clientElapsedSeconds: 120, playedSeconds: 120, sequential: true, skippedSeconds: 0 },
    )).toMatchObject({ acceptedDurationSeconds: 120, verificationResult: 'accepted' });
    expect(verify(
      practiceStart('model_chant', { targetDurationSeconds: 120 }),
      { clientElapsedSeconds: 120, playedSeconds: 120, sequential: true, skippedSeconds: 1 },
    )).toMatchObject({ verificationReason: 'model_audio_not_sequential' });
  });

  it('qualifies Dharma-talk listening by real played minutes and bounds finish evidence', () => {
    const start = practiceStart('dharma_talk');
    expect(verify(start, { clientElapsedSeconds: 90, playedSeconds: 90 }))
      .toMatchObject({ acceptedDurationSeconds: 90, verificationResult: 'accepted' });
    expect(verify(start, { clientElapsedSeconds: 59, playedSeconds: 59 }))
      .toMatchObject({ verificationReason: 'dharma_talk_below_one_minute' });
    expect(verify(practiceStart('dharma_talk', { targetDurationSeconds: 80 }), {
      clientElapsedSeconds: 90,
      playedSeconds: 90,
    })).toMatchObject({ verificationReason: 'dharma_talk_duration_mismatch' });
    expect(() => normalizePracticeSessionFinishRequest({
      completedAt: 'not-a-date', evidenceSummary: {},
    })).toThrow('invalid_completed_at');
  });
});

function practiceStart(
  activityType: 'meditation' | 'rosary' | 'scripture' | 'model_chant' | 'dharma_talk',
  overrides: Partial<ReturnType<typeof normalizePracticeSessionStart>> = {},
) {
  return normalizePracticeSessionStart({
    activityType,
    clientSessionId: `session-${activityType}`,
    idempotencyKey: `start-${activityType}`,
    sourceId: activityType === 'rosary'
      ? 'Nam mô A Di Đà Phật'
      : activityType === 'meditation'
        ? null
        : `${activityType}-source`,
    sourceKind: {
      dharma_talk: 'dharma_talk',
      meditation: 'guided_meditation',
      model_chant: 'practice_article_speech',
      rosary: 'guided_rosary',
      scripture: 'practice_article',
    }[activityType],
    startedAt: '2026-09-04T10:00:00.000Z',
    ...overrides,
  });
}

function finish(evidenceSummary: Record<string, unknown>) {
  return normalizePracticeSessionFinishRequest({
    completedAt: '2026-09-04T10:20:00.000Z',
    evidenceSummary,
  });
}

function verify(
  start: ReturnType<typeof practiceStart>,
  evidenceSummary: Record<string, unknown>,
  serverElapsedSeconds = 1_200,
) {
  return verifyPracticeSession(start, finish(evidenceSummary), { serverElapsedSeconds });
}
