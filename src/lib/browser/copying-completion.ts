import { getPracticeStorage } from './practice-storage';
import type { StorageLike } from './storage-contract';
import type { CopyDraft } from './scripture-copying-workspace';
import { type CopyBook } from '$lib/domain/practice/scripture-copying';
import { copyingChapterCompletion } from '$lib/domain/practice/copying-completion-progress';
import { createPracticeLog } from '$lib/domain/practice/logs';
import { getVietnamIsoDate } from '$lib/domain/practice/stats';

function copyRunNumericId(runId: string): number {
  const id = Number.parseInt(runId.replace(/-/g, '').slice(-13), 16);
  if (!Number.isSafeInteger(id)) throw new Error('invalid_copy_run');
  return id;
}

function bookCreditId(book: CopyBook, chapters: ReadonlyMap<number, CopyDraft>): number {
  const identities = [...book.chapters].sort((a, b) => a.number - b.number).map(chapter => {
    const draft = chapters.get(chapter.number)!;
    return [chapter.number, draft.practiceRunId ?? draft.runId] as const;
  });
  if (identities.every(([, identity]) => identity === identities[0][1])) return copyRunNumericId(identities[0][1]);
  // Giữ phép băm giới hạn như completedLogNumericId nhưng bỏ namespace thiết bị,
  // để cùng các phẩm cũ được phục hồi vẫn có một định danh công phu ổn định.
  let hash = 14695981039346656037n;
  for (const char of JSON.stringify(['copy-book-v1', book.id, book.version, identities])) {
    hash = BigInt.asUintN(64, (hash ^ BigInt(char.codePointAt(0)!)) * 1099511628211n);
  }
  return Number(hash & ((1n << 52n) - 1n)) || 1;
}

/** Stable per-run ID makes completion idempotent across reloads and device sync. */
export function recordCompletedCopy(storage: StorageLike, book: CopyBook, draft: CopyDraft, now = new Date()): boolean {
  const chapter = book.chapters.find(item => item.number === draft.chapter);
  if (draft.sutraId !== book.id || draft.sourceVersion !== book.version || !chapter || draft.texts.length !== chapter.blocks.length) return false;
  if (!copyingChapterCompletion(chapter.blocks, draft.texts).accepted) return false;
  const id = Number.parseInt((draft.practiceRunId ?? draft.runId).replace(/-/g, '').slice(-13), 16);
  if (!Number.isSafeInteger(id)) throw new Error('invalid_copy_run');
  const practice = getPracticeStorage(storage);
  if (practice.getLogs().some(log => log.id === id) || practice.getDeletedLogIds().has(String(id))) return false;
  practice.saveLog(createPracticeLog({ id, type: 'Chép kinh', count: 1, date: getVietnamIsoDate(now), created: now.toISOString(), note: `${book.title} · ${chapter.title}` }));
  return true;
}

/** Chỉ ghi nhận trọn bộ; không dùng nháp thuộc lượt chép khác để bù phẩm còn thiếu. */
export function recordCompletedBookCopy(storage: StorageLike, book: CopyBook, drafts: readonly CopyDraft[], bookRunId: string, now = new Date()): boolean {
  if (!bookRunId || !book.chapters.length || drafts.length !== book.chapters.length) return false;
  const chapters = new Map(drafts.map(draft => [draft.chapter, draft]));
  if (chapters.size !== book.chapters.length || new Set(book.chapters.map(chapter => chapter.number)).size !== book.chapters.length) return false;
  for (const chapter of book.chapters) {
    const draft = chapters.get(chapter.number);
    if (!draft || draft.bookRunId !== bookRunId || draft.sutraId !== book.id || draft.sourceVersion !== book.version
      || draft.texts.length !== chapter.blocks.length || !copyingChapterCompletion(chapter.blocks, draft.texts).accepted) return false;
  }
  const id = bookCreditId(book, chapters);
  const previousId = copyRunNumericId(bookRunId);
  const practice = getPracticeStorage(storage);
  const deleted = practice.getDeletedLogIds();
  if (practice.getLogs().some(log => log.id === id || log.id === previousId)
    || deleted.has(String(id)) || deleted.has(String(previousId))) return false;
  practice.saveLog(createPracticeLog({ id, type: 'Chép kinh', count: 1, date: getVietnamIsoDate(now), created: now.toISOString(), note: book.title }));
  return true;
}
