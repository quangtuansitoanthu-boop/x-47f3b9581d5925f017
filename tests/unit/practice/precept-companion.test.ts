import { describe, expect, it } from 'vitest';
import { EIGHT_IDS, FIVE_IDS, TEN_IDS, emptyCompanionState, validCompanionAnswers, validCompanionDate, validCompanionState, validEightSession, validDailySession } from '../../../src/lib/domain/practice/precept-companion';

describe('precept companion contracts', () => {
  it('accepts the twelve combined IDs while keeping old v1 sessions valid', () => {
    const answers = Object.fromEntries([...new Set([...FIVE_IDS, ...TEN_IDS])].map(id => [id, 'review']));
    expect(Object.keys(answers)).toHaveLength(12);
    const session = { id: 'combined', group: 'combined', startsAt: '2026-10-28T03:00:00Z', endsAt: '2026-10-29T03:00:00Z', status: 'active', answers };
    expect(validDailySession(session)).toBe(true);
    expect(validDailySession({ ...session, answers: { celibacy: 'kept' } })).toBe(false);
    expect(validCompanionState({ ...emptyCompanionState(), dailySessions: [session, { ...session, id: 'old-five', group: 'five', answers: {} }, { ...session, id: 'old-ten', group: 'ten', answers: {} }] })).toBe(true);
  });
  it('accepts partial groups without inventing answers or mixing celibacy with conduct', () => {
    expect(validCompanionAnswers({ conduct: 'kept' }, FIVE_IDS)).toBe(true);
    expect(validCompanionAnswers({ kindness: 'review' }, TEN_IDS)).toBe(true);
    expect(validCompanionAnswers({ conduct: 'kept' }, EIGHT_IDS)).toBe(false);
    expect(validCompanionAnswers({ celibacy: 'kept' }, EIGHT_IDS)).toBe(true);
    expect(validCompanionAnswers({ unknown: 'kept' }, FIVE_IDS)).toBe(false);
    expect(validCompanionAnswers({ life: true }, FIVE_IDS)).toBe(false);
    expect(validCompanionAnswers([], FIVE_IDS)).toBe(false);
  });
  it('validates real calendar dates and rejects unknown state versions', () => {
    expect(validCompanionDate('2028-02-29')).toBe(true);
    for (const date of ['2026-02-29', '2026-02-30', '2026-13-01', '2026-1-01']) expect(validCompanionDate(date)).toBe(false);
    expect(validCompanionState(emptyCompanionState())).toBe(true);
    expect(validCompanionState({ ...emptyCompanionState(), version: 2 })).toBe(false);
  });
  it('requires an exact 24-hour Eight Precepts session across timezone offsets', () => {
    const session = { id: 'eight', startsAt: '2026-10-28T06:00:00+07:00', endsAt: '2026-10-29T06:00:00+07:00', status: 'active', answers: {} };
    expect(validEightSession(session)).toBe(true);
    expect(validEightSession({ ...session, endsAt: '2026-10-29T05:59:59+07:00' })).toBe(false);
    expect(validEightSession({ ...session, startsAt: 'broken' })).toBe(false);
    expect(validEightSession({ ...session, status: 'completed' })).toBe(false);
  });
  it('accepts optional independent daily sessions without changing the old v1 empty shape', () => {
    const session = { id: 'five-session', group: 'five', startsAt: '2026-10-28T06:00:00+07:00', endsAt: '2026-10-29T06:00:00+07:00', status: 'active', answers: { conduct: 'review' } };
    expect(emptyCompanionState()).toEqual({ version: 1, days: [], sessions: [], conductDates: [] });
    expect(validDailySession(session)).toBe(true);
    expect(validDailySession({ ...session, group: 'ten', answers: { kindness: 'kept' } })).toBe(true);
    expect(validCompanionState({ ...emptyCompanionState(), dailySessions: [session] })).toBe(true);
    expect(validCompanionState({ ...emptyCompanionState(), dailySessions: [] })).toBe(true);
    for (const dailySessions of [null, {}, [null], [{ ...session, group: 'eight' }]]) {
      expect(validCompanionState({ ...emptyCompanionState(), dailySessions })).toBe(false);
    }
  });
  it('validates the daily group, exact duration, answer IDs and lifecycle without inventing answers', () => {
    const session = { id: 'daily', group: 'five', startsAt: '2026-10-28T06:00:00+07:00', endsAt: '2026-10-29T06:00:00+07:00', status: 'active', answers: {} };
    expect(validDailySession(session)).toBe(true);
    for (const delta of [
      { id: '' }, { id: 'a'.repeat(193) }, { group: 'both' }, { group: 'eight' },
      { startsAt: 'broken' }, { endsAt: '2026-10-29T05:59:59+07:00' }, { status: 'completed' },
      { answers: { celibacy: 'kept' } }, { answers: { kindness: 'review' } }, { answers: { life: true } },
    ]) expect(validDailySession({ ...session, ...delta })).toBe(false);
  });
});
