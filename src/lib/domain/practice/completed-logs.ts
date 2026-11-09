export const COMPLETED_LOG_TYPES = ['Lễ Phật', 'Chép kinh', 'Chép danh hiệu'] as const;
export type CompletedLogType = (typeof COMPLETED_LOG_TYPES)[number];
export const COMPLETED_LOG_BATCH_LIMIT = 20;
export const PRACTICE_LOG_CHANGED_EVENT = 'quangtu:practice-log-changed';
export const COMPLETED_LOG_COPY = {
  pending: 'Công phu đã lưu trên máy; đang chờ đồng bộ với cộng đồng.',
  pendingEn: 'Your practice is saved on this device and is waiting to sync with the community.',
};

export interface CompletedPracticeLog {
  logId: string;
  localLogId: number;
  type: CompletedLogType;
  count: number;
  completedAt: string;
  note: string;
}

export function isCompletedLogType(type: string): type is CompletedLogType {
  return COMPLETED_LOG_TYPES.includes(type as CompletedLogType);
}

export function normalizeCompletedLogs(raw: unknown, now: Date): CompletedPracticeLog[] {
  const values = raw && typeof raw === 'object' ? Reflect.get(raw, 'logs') : null;
  if (!Array.isArray(values) || !values.length || values.length > COMPLETED_LOG_BATCH_LIMIT) {
    throw new Error('invalid_completed_logs');
  }
  const ids = new Set<string>();
  return values.map((value: unknown) => {
    if (!value || typeof value !== 'object') throw new Error('invalid_completed_log');
    const row = value as Record<string, unknown>;
    const logId = typeof row.logId === 'string' ? row.logId.trim() : '';
    const type = typeof row.type === 'string' ? row.type : '';
    const count = row.count;
    const localLogId = row.localLogId;
    const completedAt = typeof row.completedAt === 'string' ? row.completedAt : '';
    const time = Date.parse(completedAt);
    const note = typeof row.note === 'string' ? row.note : '';
    if (!logId || logId.length > 192 || ids.has(logId) || !isCompletedLogType(type)
      || typeof localLogId !== 'number' || !Number.isSafeInteger(localLogId) || localLogId <= 0
      || logId !== `log:${localLogId}`
      || typeof count !== 'number' || !Number.isSafeInteger(count) || count < 1 || count > 1_000_000
      || !Number.isFinite(time) || time > now.getTime() + 5_000 || note.length > 2_000) {
      throw new Error('invalid_completed_log');
    }
    ids.add(logId);
    return { logId, localLogId, type, count, completedAt: new Date(time).toISOString(), note };
  });
}
import type { PracticeLog } from './logs';
import { getVietnamIsoDate } from './stats';


export function restoreCompletedToolLog(session: Record<string, unknown>): PracticeLog | null {
  if (session.status !== 'completed' || session.verificationResult !== 'accepted'
    || session.sourceKind !== 'manual_log' || !String(session.sourceId).startsWith('completed-tool:')) return null;
  const evidence = session.evidenceSummary;
  if (!evidence || typeof evidence !== 'object') return null;
  const row = evidence as Record<string, unknown>;
  const id = row.localLogId;
  const type = String(row.type ?? '');
  const created = String(session.completedAt ?? '');
  const count = Number(session.acceptedCount);
  if (row.origin !== 'completed_tool' || typeof id !== 'number' || !Number.isSafeInteger(id)
    || id <= 0 || !isCompletedLogType(type) || !Number.isFinite(Date.parse(created)) || !Number.isSafeInteger(count) || count < 1) return null;
  return { id, type, count, created, date: getVietnamIsoDate(new Date(created)), note: String(row.note ?? '') };
}
