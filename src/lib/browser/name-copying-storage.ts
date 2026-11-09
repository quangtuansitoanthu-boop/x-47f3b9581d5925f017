import { completedLogNumericId, initializeCompletedLogState } from './practice-log-outbox';
import { getPracticeStorage } from './practice-storage';
import { createPracticeLog } from '$lib/domain/practice/logs';
import { getVietnamIsoDate } from '$lib/domain/practice/stats';
import { createPrincipalStorage } from './principal-storage';
import { createBrowserId } from './random-id';
import type { StorageLike } from './storage-contract';
import { NAME_COPYING_PHRASES, NAME_COPYING_ROUND_SIZE, NAME_COPYING_MANTRA_LEGACY_LABELS, matchesNameCopyingPhrase, type NameCopyingPhrase } from '$lib/domain/practice/name-copying';

const DRAFT_KEY = 'tt_name_copying_draft_v1';

export interface NameCopyingDraft {
  selected: NameCopyingPhrase;
  lines: Record<NameCopyingPhrase, string[]>;
  completed: Record<NameCopyingPhrase, number>;
  completionEpoch?: string;
}

export function createNameCopyingDraft(): NameCopyingDraft {
  return {
    selected: NAME_COPYING_PHRASES[0],
    completed: Object.fromEntries(NAME_COPYING_PHRASES.map(phrase => [phrase, 0])) as Record<NameCopyingPhrase, number>,
    lines: Object.fromEntries(NAME_COPYING_PHRASES.map(phrase => [phrase, Array<string>(NAME_COPYING_ROUND_SIZE).fill('')])) as Record<NameCopyingPhrase, string[]>
  };
}

export function readNameCopyingDraft(storage: StorageLike, principal: string | null): NameCopyingDraft {
  const raw = createPrincipalStorage(storage, principal).getItem(DRAFT_KEY);
  if (raw === null) return createNameCopyingDraft();
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object' || !('selected' in value) || !('lines' in value)
    || !(NAME_COPYING_PHRASES.includes(value.selected as NameCopyingPhrase) || NAME_COPYING_MANTRA_LEGACY_LABELS.includes(String(value.selected)))
    || !value.lines || typeof value.lines !== 'object') throw new Error('invalid_name_copying_draft');
  const draft = createNameCopyingDraft();
  if ('completionEpoch' in value) {
    if (typeof value.completionEpoch !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(value.completionEpoch)) {
      throw new Error('invalid_name_copying_epoch');
    }
    draft.completionEpoch = value.completionEpoch;
  }
  const savedLines = value.lines;
  draft.selected = NAME_COPYING_MANTRA_LEGACY_LABELS.includes(String(value.selected)) ? 'Ôm Ma Ni Pát Mê Hùm' : value.selected as NameCopyingPhrase;
  for (const kind of NAME_COPYING_PHRASES) {
    const legacyKey = kind === 'Ôm Ma Ni Pát Mê Hùm' ? NAME_COPYING_MANTRA_LEGACY_LABELS.find(label => Object.prototype.hasOwnProperty.call(savedLines, label)) : undefined;
    const sourceKey = legacyKey && !Object.prototype.hasOwnProperty.call(savedLines, kind) ? legacyKey : kind;
    // Bổ sung lựa chọn mới mà vẫn giữ bản chép và tổng của phiên bản trước.
    if (kind === 'Ôm Ma Ni Pát Mê Hùm' && !Object.prototype.hasOwnProperty.call(savedLines, sourceKey)) continue;
    const lines: unknown = Reflect.get(savedLines, sourceKey);
    if (!Array.isArray(lines) || lines.length !== NAME_COPYING_ROUND_SIZE
      || !lines.every((line: unknown) => typeof line === 'string' && line.length <= 200)) {
      throw new Error('invalid_name_copying_lines');
    }
    draft.lines[kind] = lines.map((line: string) => line.toLocaleUpperCase('vi-VN'));
    if ('completed' in value) {
      if (!value.completed || typeof value.completed !== 'object') throw new Error('invalid_name_copying_total');
      const total: unknown = Reflect.get(value.completed, sourceKey);
      if (typeof total !== 'number' || !Number.isSafeInteger(total) || total < 0) {
        throw new Error('invalid_name_copying_total');
      }
      draft.completed[kind] = total;
    }
  }
  return draft;
}

export function nameCopyingTotal(draft: NameCopyingDraft): number {
  return NAME_COPYING_PHRASES.reduce((sum, kind) => sum + draft.completed[kind]
    + draft.lines[kind].filter(line => matchesNameCopyingPhrase(line, kind)).length, 0);
}

export function completeNameCopyingRound(draft: NameCopyingDraft): boolean {
  if (!draft.lines[draft.selected].every(line => matchesNameCopyingPhrase(line, draft.selected))) return false;
  draft.completed[draft.selected] += NAME_COPYING_ROUND_SIZE;
  draft.lines[draft.selected] = Array<string>(NAME_COPYING_ROUND_SIZE).fill('');
  return true;
}

export function saveNameCopyingDraft(storage: StorageLike, principal: string | null, draft: NameCopyingDraft): void {
  createPrincipalStorage(storage, principal).setItem(DRAFT_KEY, JSON.stringify(draft));
}

export function recordCompletedNameCopyingRound(
  storage: StorageLike, principal: string | null, phrase: NameCopyingPhrase, completedTotal: number, now = new Date(),
  completionEpoch?: string,
): void {
  const scoped = createPrincipalStorage(storage, principal);
  initializeCompletedLogState(scoped, now);
  const id = completedLogNumericId(scoped, `name-copying:${phrase}:${completedTotal}${completionEpoch ? `:${completionEpoch}` : ''}`);
  const practice = getPracticeStorage(scoped);
  if (practice.getLogs().some(log => log.id === id) || practice.getDeletedLogIds().has(String(id))) return;
  practice.saveLog(createPracticeLog({ id, type: 'Chép danh hiệu', count: NAME_COPYING_ROUND_SIZE,
    date: getVietnamIsoDate(now), created: now.toISOString(), note: phrase }));
}

export function resetNameCopyingData(storage: StorageLike, principal: string | null): NameCopyingDraft {
  const freshDraft = createNameCopyingDraft();
  // Lượt sau khi chủ động đặt lại phải khác các receipt đã xóa của lượt trước.
  freshDraft.completionEpoch = createBrowserId();
  saveNameCopyingDraft(storage, principal, freshDraft);
  const scoped = createPrincipalStorage(storage, principal);
  const practice = getPracticeStorage(scoped);
  const nameCopyingLogs = practice.getLogs().filter(log => log.type === 'Chép danh hiệu');
  for (const log of nameCopyingLogs) {
    practice.deleteLog(log.id);
  }
  return freshDraft;
}

export function completeNameCopyingSession(
  storage: StorageLike,
  principal: string | null,
  draft: NameCopyingDraft,
  now = new Date(),
): { draft: NameCopyingDraft; recordedCount: number } {
  const phrase = draft.selected;
  const validCount = draft.lines[phrase].filter(line => matchesNameCopyingPhrase(line, phrase)).length;
  // Lỗi ghi nháp phải giữ nguyên các dòng để người dùng thử lại trong cùng phiên.
  const next = { ...draft, completed: { ...draft.completed }, lines: { ...draft.lines } };

  if (validCount > 0) {
    const scoped = createPrincipalStorage(storage, principal);
    initializeCompletedLogState(scoped, now);
    // Tổng sau khi chốt giữ cùng ID khi tải lại nháp chưa xóa sau một lần ghi lỗi.
    const completedTotal = draft.completed[phrase] + validCount;
    const id = completedLogNumericId(scoped, `name-copying:${phrase}:${completedTotal}${draft.completionEpoch ? `:${draft.completionEpoch}` : ''}`);
    const practice = getPracticeStorage(scoped);
    if (!practice.getLogs().some(log => log.id === id) && !practice.getDeletedLogIds().has(String(id))) {
      practice.saveLog(createPracticeLog({
        id,
        type: 'Chép danh hiệu',
        count: validCount,
        date: getVietnamIsoDate(now),
        created: now.toISOString(),
        note: phrase,
      }));
    }
    next.completed[phrase] = completedTotal;
  }

  next.lines[phrase] = Array<string>(NAME_COPYING_ROUND_SIZE).fill('');
  saveNameCopyingDraft(storage, principal, next);
  return { draft: next, recordedCount: validCount };
}
