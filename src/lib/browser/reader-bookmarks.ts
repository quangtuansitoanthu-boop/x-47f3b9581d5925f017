import { LEGACY_LOCAL_STORAGE_KEYS, type StorageLike } from './storage-contract';
import {
  ANONYMOUS_STORAGE_PRINCIPAL,
  copyLegacyKeysToAnonymousNamespace,
  createPrincipalStorage,
} from './principal-storage';

export interface ReaderBookmark {
  chapIdx: number | null;
  chapTitle: string;
  date: string;
  id: string;
  scrollTop: number;
  title: string;
}

export interface ReaderBookmarkInput {
  articleId: string;
  articleTitle: string;
  chapterIndex: number | null;
  chapterTitle: string;
  savedAt?: Date;
  scrollTop: number;
}

type ScheduleFrame = (callback: FrameRequestCallback) => number;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readRawEntries(storage: StorageLike): unknown[] {
  try {
    const parsed = JSON.parse(storage.getItem(LEGACY_LOCAL_STORAGE_KEYS.bookmarks) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeChapterIndex(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function normalizeScrollTop(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
}

export function parseReaderBookmark(value: unknown): ReaderBookmark | null {
  if (!isRecord(value) || value.id === null || value.id === undefined) return null;
  const id = String(value.id).trim();
  if (!id) return null;

  const chapIdx = normalizeChapterIndex(value.chapIdx ?? value.chapterIndex ?? (value as Record<string, unknown>).chap_idx);
  const chapTitleRaw = typeof value.chapTitle === 'string'
    ? value.chapTitle
    : (typeof value.chapterTitle === 'string' ? value.chapterTitle : '');

  return {
    id,
    title: typeof value.title === 'string' ? value.title : '',
    chapIdx,
    chapTitle: chapTitleRaw,
    scrollTop: normalizeScrollTop(value.scrollTop),
    date: typeof value.date === 'string' ? value.date : '',
  };
}

export function findReaderBookmark(storage: StorageLike, articleId: string): ReaderBookmark | null {
  for (const entry of readRawEntries(storage)) {
    const bookmark = parseReaderBookmark(entry);
    if (bookmark?.id === String(articleId)) return bookmark;
  }
  return null;
}

/**
 * Compatibility boundary for the retired aggregate bookmark envelope.
 * New readers use exactly one principal-scoped copy; the old origin key is read
 * once into the anonymous namespace and is never written in parallel.
 */
export function createReaderBookmarkAdapter(
  storage: StorageLike,
  principalId: string | null | undefined = ANONYMOUS_STORAGE_PRINCIPAL,
) {
  copyLegacyKeysToAnonymousNamespace(storage, [LEGACY_LOCAL_STORAGE_KEYS.bookmarks]);
  const scoped = createPrincipalStorage(storage, principalId);
  return {
    find(articleId: string): ReaderBookmark | null {
      return findReaderBookmark(scoped, articleId);
    },
    toggle(input: ReaderBookmarkInput): boolean {
      return toggleReaderBookmark(scoped, input);
    },
  };
}

/**
 * Add/remove a bookmark using the exact object fields written by the legacy reader.
 * Unknown aggregate-sync entries are retained instead of being discarded.
 */
export function toggleReaderBookmark(storage: StorageLike, input: ReaderBookmarkInput): boolean {
  const entries = readRawEntries(storage);
  const index = entries.findIndex((entry) => {
    const bookmark = parseReaderBookmark(entry);
    return bookmark?.id === String(input.articleId);
  });

  if (index >= 0) {
    entries.splice(index, 1);
    storage.setItem(LEGACY_LOCAL_STORAGE_KEYS.bookmarks, JSON.stringify(entries));
    return false;
  }

  entries.unshift({
    id: String(input.articleId),
    title: input.articleTitle,
    chapIdx: normalizeChapterIndex(input.chapterIndex),
    chapTitle: input.chapterIndex === null ? '' : input.chapterTitle,
    scrollTop: normalizeScrollTop(input.scrollTop),
    date: (input.savedAt ?? new Date()).toISOString(),
  } satisfies ReaderBookmark);
  storage.setItem(LEGACY_LOCAL_STORAGE_KEYS.bookmarks, JSON.stringify(entries));
  return true;
}

/** Match the legacy double-rAF restore so chapter HTML has completed layout first. */
export function restoreReaderScroll(
  scrollArea: HTMLElement,
  scrollTop: number,
  scheduleFrame: ScheduleFrame = requestAnimationFrame,
  isCurrent: () => boolean = () => true,
): void {
  const target = normalizeScrollTop(scrollTop);
  scheduleFrame(() => {
    scheduleFrame(() => {
      if (isCurrent()) scrollArea.scrollTop = target;
    });
  });
}
