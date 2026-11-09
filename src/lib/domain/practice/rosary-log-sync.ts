import { getRosaryPracticeType } from './guided-sessions';
import type { PracticeLog, PracticeType } from './logs';
import { getVietnamIsoDate } from './stats';

function validLogId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function buildRosaryLogEvidence(
  logs: readonly PracticeLog[],
  input: { count: number; date: string; phrase: string; type: PracticeType },
): Record<string, unknown> {
  if (input.type !== 'Niệm danh hiệu' && input.type !== 'Trì chú') return {};
  const note = `Lần hạt: ${input.phrase}`;
  const local = logs.filter(log => validLogId(log.id) && log.count === input.count
    && log.date === input.date && log.type === input.type && log.note === note)
    .reduce<PracticeLog | null>((latest, log) => !latest || log.id > latest.id ? log : latest, null);
  // Receipt giữ ID cũ qua lần thử lại; không dựng ID khác từ thời điểm server nhận xong.
  return {
    practiceType: input.type,
    ...(local ? {
      localLogId: local.id,
      localLogDate: local.date,
      localLogCreatedAt: local.created,
    } : {}),
  };
}

export function restoreRosarySessionLog(session: Record<string, unknown>): PracticeLog | null {
  if (session.activityType !== 'rosary' || session.sourceKind !== 'guided_rosary'
    || session.status !== 'completed' || session.verificationResult !== 'accepted') return null;
  const completedAt = typeof session.completedAt === 'string' ? session.completedAt : '';
  const completedTime = Date.parse(completedAt);
  const count = session.acceptedCount;
  if (!validLogId(completedTime) || typeof count !== 'number' || !Number.isSafeInteger(count) || count < 1) return null;
  const evidence = session.evidenceSummary && typeof session.evidenceSummary === 'object' && !Array.isArray(session.evidenceSummary)
    ? session.evidenceSummary as Record<string, unknown>
    : {};
  const phrase = String(evidence.phrase || evidence.title || session.sourceId || '');
  const type = evidence.practiceType === 'Niệm danh hiệu' || evidence.practiceType === 'Trì chú'
    ? evidence.practiceType
    : getRosaryPracticeType(phrase);
  const created = typeof evidence.localLogCreatedAt === 'string' && Number.isFinite(Date.parse(evidence.localLogCreatedAt))
    ? evidence.localLogCreatedAt
    : completedAt;
  return {
    id: validLogId(evidence.localLogId) ? evidence.localLogId : completedTime,
    type,
    count,
    date: validDate(evidence.localLogDate) ? evidence.localLogDate : getVietnamIsoDate(new Date(completedAt)),
    created,
    note: typeof evidence.note === 'string' && evidence.note ? evidence.note : phrase,
  };
}
