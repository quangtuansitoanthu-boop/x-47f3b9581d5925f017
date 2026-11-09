import { describe, expect, it } from 'vitest';
import { buildRosaryLogEvidence, restoreRosarySessionLog } from '../../../src/lib/domain/practice/rosary-log-sync';
import { mergePracticeLogs } from '../../../src/lib/domain/practice/state';
import type { PracticeLog } from '../../../src/lib/domain/practice/logs';
import { ROSARY_PHRASES } from '../../../src/lib/domain/practice/guided-sessions';
import { normalizePracticeSessionFinishRequest, verifyPracticeSession } from '../../../src/lib/domain/practice/sessions';

const local: PracticeLog = {
  id: 1_799_999_999_999, date: '2026-11-01', created: '2026-11-01T16:59:59.999Z',
  type: 'Trì chú', count: 100, note: 'Lần hạt: Om Mani Padme Hum',
};
const input = { count: 100, date: local.date, phrase: 'Om Mani Padme Hum', type: local.type };
const accepted = (evidenceSummary: Record<string, unknown> = {}) => ({
  activityType: 'rosary', sourceKind: 'guided_rosary', sourceId: 'custom:cp_1793534000000_abc',
  clientSessionId: 'practice:rosary:one', status: 'completed', verificationResult: 'accepted',
  acceptedCount: 100, completedAt: '2026-11-01T17:00:00.001Z',
  evidenceSummary: { phrase: 'Om Mani Padme Hum', note: local.note, ...evidenceSummary },
});

describe('rosary journal identity across local and server completion', () => {
  it('keeps one original journal row even when completion clock and numeric ID differ', () => {
    const evidence = buildRosaryLogEvidence([local], input);
    const server = accepted(evidence);
    const restored = restoreRosarySessionLog(server)!;
    const legacyId = Date.parse(server.completedAt);
    expect(legacyId).not.toBe(local.id);
    expect(mergePracticeLogs([local], [{ ...restored, id: legacyId }])).toHaveLength(2);
    expect(restored).toEqual(local);
    expect(mergePracticeLogs([local], [restored])).toEqual([local]);
  });

  it('keeps a custom mantra type rather than classifying every rosary session as Buddha recollection', () => {
    const restored = restoreRosarySessionLog(accepted(buildRosaryLogEvidence([local], input)));
    expect(restored?.type).toBe('Trì chú');
    expect(restored?.count).toBe(100);
  });

  it('chooses the latest exact local receipt without attaching an unrelated log identity', () => {
    const prior = { ...local, id: local.id - 1 };
    const unrelated = { ...local, id: local.id + 1, note: 'Lần hạt: Danh hiệu khác' };
    expect(buildRosaryLogEvidence([prior, local, unrelated], input)).toMatchObject({ localLogId: local.id, practiceType: 'Trì chú' });
    expect(buildRosaryLogEvidence([unrelated], input)).toEqual({ practiceType: 'Trì chú' });
  });

  it('preserves valid additive metadata through the existing backend normalization and verifier', () => {
    const evidence = { ...buildRosaryLogEvidence([local], input), acceptedCount: 100, minimumIntervalMs: 800, clientElapsedSeconds: 80 };
    const finish = normalizePracticeSessionFinishRequest({ completedAt: accepted().completedAt, evidenceSummary: evidence });
    const verified = verifyPracticeSession({
      activityType: 'rosary', clientSessionId: 'practice:rosary:one', idempotencyKey: 'practice:rosary:one',
      startedAt: '2026-11-01T16:58:40.001Z', sourceId: ROSARY_PHRASES[0], sourceKind: 'guided_rosary',
      targetCount: 108, targetDurationSeconds: null,
    }, finish, { serverElapsedSeconds: 80 });
    expect(verified.verificationResult).toBe('accepted');
    expect(verified.evidenceSummary).toMatchObject({ localLogId: local.id, practiceType: 'Trì chú' });
  });

  it('does not turn local metadata into accepted community practice or alter an accepted amount', () => {
    for (const change of [{ status: 'active' }, { verificationResult: 'implausible' }, { sourceKind: 'manual_log' }, { activityType: 'scripture' }]) {
      expect(restoreRosarySessionLog({ ...accepted(buildRosaryLogEvidence([local], input)), ...change })).toBeNull();
    }
    expect(restoreRosarySessionLog({ ...accepted({ ...buildRosaryLogEvidence([local], input), count: 9999 }), acceptedCount: 2 })?.count).toBe(2);
  });

  it('retains legacy timestamp identity when metadata is missing and infers known canonical mantra type', () => {
    const server = accepted({ phrase: 'Chú Đại Bi' });
    expect(restoreRosarySessionLog(server)).toMatchObject({ id: Date.parse(server.completedAt), type: 'Trì chú', date: '2026-11-02', count: 100 });
    expect(restoreRosarySessionLog(accepted({ phrase: ROSARY_PHRASES[0] }))?.type).toBe('Niệm danh hiệu');
  });

  it('falls back safely for malformed IDs, dates and practice types without changing unrelated records', () => {
    for (const localLogId of [-1, 0, 1.5, Number.POSITIVE_INFINITY, '123']) {
      expect(restoreRosarySessionLog(accepted({ localLogId, practiceType: 'Trì chú' }))?.id).toBe(Date.parse(accepted().completedAt));
    }
    const restored = restoreRosarySessionLog(accepted({ localLogId: local.id, practiceType: 'Ngồi thiền', localLogDate: '2026-02-30', localLogCreatedAt: 'broken' }));
    expect(restored).toMatchObject({ id: local.id, type: 'Niệm danh hiệu', date: '2026-11-02', created: accepted().completedAt });
    expect(restoreRosarySessionLog({ ...accepted(), acceptedCount: -1 })).toBeNull();
  });
});
