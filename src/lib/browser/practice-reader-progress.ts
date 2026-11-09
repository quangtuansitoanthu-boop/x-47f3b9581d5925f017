import type { StorageLike } from './storage-contract';
import { fetchNativeJsonMutation } from './native-api';
import { LEGACY_LOCAL_STORAGE_KEYS } from './storage-contract';
import { findReaderBookmark, parseReaderBookmark, type ReaderBookmark, type ReaderBookmarkInput } from './reader-bookmarks';
import { createPrincipalStorage } from './principal-storage';
import {
  createReadingActivityClient,
  createThrottledReadingProgressWriter,
  type ReadingActivitySession,
  type ReadingProgressDraft,
} from './reading-activity-client';

interface PracticeReaderProgressInput extends ReaderBookmarkInput {
  chapterCount?: number;
  scrollDepthPercent?: number;
}

function readEntries(storage: StorageLike): unknown[] {
  try {
    const parsed = JSON.parse(storage.getItem(LEGACY_LOCAL_STORAGE_KEYS.bookmarks) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Practice uses the typed reading outbox; bookmarks are fallback until its first save. */
export function createPracticeReaderProgressClient(
  fetcher: typeof fetch,
  storage: StorageLike = window.localStorage,
  onError: (cause: unknown) => void = () => {},
) {
  const guest: ReadingActivitySession = { authenticated: false, csrfToken: null, user: null };
  let session = guest;
  let generation = 0;
  let reads = new AbortController();
  const principalId = () => session.authenticated ? session.user?.id ?? null : null;
  const newClient = () => {
    const capturedGeneration = generation;
    return createReadingActivityClient(async (url, init) => {
      if (capturedGeneration !== generation) throw new Error('reading_principal_changed');
      const requestInit = { ...init, signal: init?.signal ?? reads.signal };
      const native = fetcher === fetch && typeof url === 'string'
        ? await fetchNativeJsonMutation(url, requestInit) : null;
      const response = native ?? await fetcher(url, requestInit);
      if (capturedGeneration !== generation) throw new Error('reading_principal_changed');
      return response;
    }, storage);
  };
  let client = newClient();
  let flushing: Promise<number> | null = null;
  let flushRequested = false;
  const requestFlush = (): Promise<number> => {
    flushRequested = true;
    if (flushing) return flushing;
    const capturedClient = client;
    const capturedGeneration = generation;
    const pending = (async () => {
      let applied = 0;
      while (flushRequested && capturedGeneration === generation) {
        flushRequested = false;
        applied += await capturedClient.flush();
      }
      return applied;
    })();
    flushing = pending;
    void pending.finally(() => { if (flushing === pending) flushing = null; }).catch(() => undefined);
    return pending;
  };

  const draftFor = (input: PracticeReaderProgressInput): ReadingProgressDraft => {
    const cached = client.cachedProgress().find((row) => row.contentKind === 'practice' && row.contentId === input.articleId);
    const depth = Math.min(100, Math.max(0, input.scrollDepthPercent ?? 0));
    const total = input.chapterCount && input.chapterCount > 0 ? input.chapterCount : null;
    return {
      baseRevision: cached?.revision ?? 0,
      clientUpdatedAt: (input.savedAt ?? new Date()).toISOString(),
      contentId: input.articleId,
      contentKind: 'practice',
      contentVersion: null,
      epoch: cached?.epoch ?? 1,
      percent: total && input.chapterIndex !== null
        ? Math.min(100, ((input.chapterIndex + depth / 100) / total) * 100)
        : depth,
      position: {
        // Practice's existing chapter API addresses a zero-based index.
        ...(input.chapterIndex === null ? {} : { chapterId: String(input.chapterIndex) }),
        scrollTop: Math.max(0, Math.round(input.scrollTop)),
      },
      total,
    };
  };
  const save = (draft: ReadingProgressDraft) => {
    client.enqueueProgress(draft);
    const scoped = createPrincipalStorage(storage, principalId());
    const entries = readEntries(scoped);
    const remaining = entries.filter((entry) => parseReaderBookmark(entry)?.id !== draft.contentId);
    if (remaining.length !== entries.length) {
      scoped.setItem(LEGACY_LOCAL_STORAGE_KEYS.bookmarks, JSON.stringify(remaining));
    }
  };
  const writer = createThrottledReadingProgressWriter((draft) => {
    try {
      save(draft);
      void requestFlush().catch(() => undefined);
    } catch (cause) { onError(cause); }
  });

  return {
    async load(articleId: string): Promise<ReaderBookmark | null> {
      const capturedGeneration = generation;
      const capturedClient = client;
      let progress = client.cachedProgress().find((row) => (row.contentKind === 'practice' || row.contentKind === 'book' || row.contentKind === 'article') && row.contentId === articleId) ?? null;
      try {
        if (!progress) progress = await capturedClient.getProgress('practice', articleId);
        if (!progress) progress = await capturedClient.getProgress('book', articleId);
        if (!progress) progress = await capturedClient.getProgress('article', articleId);
      } catch {
        // Offline resumes use the same owner's durable local progress.
      }
      if (capturedGeneration !== generation) return null;
      if (!progress) {
        if (capturedClient.cachedProgressTombstone('practice', articleId) || capturedClient.cachedProgressTombstone('book', articleId)) return null;
        return findReaderBookmark(createPrincipalStorage(storage, principalId()), articleId);
      }
      let chapter: number | null = null;
      if (progress.position.chapterIdx !== undefined && progress.position.chapterIdx !== null) {
        const parsed = Number(progress.position.chapterIdx);
        if (Number.isInteger(parsed) && parsed >= 0) chapter = parsed;
      }
      if (chapter === null && progress.position.chapterId != null) {
        const parsed = Number(progress.position.chapterId);
        if (Number.isInteger(parsed) && parsed >= 0) chapter = parsed;
      }
      return {
        id: articleId,
        title: '',
        chapIdx: chapter,
        chapTitle: '',
        scrollTop: Math.max(0, Math.round(progress.position.scrollTop ?? 0)),
        date: progress.clientUpdatedAt ?? progress.serverUpdatedAt ?? '',
      };
    },
    save(input: PracticeReaderProgressInput): void {
      writer.cancel();
      save(draftFor(input));
    },
    schedule(input: PracticeReaderProgressInput): void {
      writer.schedule(draftFor(input));
    },
    async flush(): Promise<number> {
      writer.flush();
      return requestFlush();
    },
    setSession(next: ReadingActivitySession): void {
      const nextPrincipalId = next.authenticated ? next.user?.id ?? null : null;
      if (nextPrincipalId !== principalId()) {
        writer.cancel();
        generation += 1;
        reads.abort();
        reads = new AbortController();
        client.setSession(guest);
        client = newClient();
        flushing = null;
        flushRequested = false;
      }
      session = next;
      client.setSession(next);
    },
    destroy(): void {
      writer.cancel();
      generation += 1;
      reads.abort();
      client.setSession(guest);
    },
  };
}

export function restorePracticeWindowScroll(
  scrollTop: number,
  scheduleFrame: (callback: FrameRequestCallback) => number = requestAnimationFrame,
  isCurrent: () => boolean = () => true,
): void {
  const target = Math.max(0, Math.round(Number(scrollTop) || 0));
  scheduleFrame(() => scheduleFrame(() => {
    if (isCurrent()) window.scrollTo({ behavior: 'instant', left: window.scrollX, top: target });
  }));
}

export function currentDocumentScrollDepth(): number {
  const maximum = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  if (maximum === 0) return 100;
  return Math.min(100, Math.max(0, (window.scrollY / maximum) * 100));
}

export function practiceReadingMinimumSeconds(content: string): number {
  const words = content
    .replace(/<[^>]*>/gu, ' ')
    .replace(/&\w+;/gu, ' ')
    .trim()
    .split(/\s+/u)
    .filter(Boolean).length;
  return Math.max(30, Math.min(20 * 60, Math.ceil((words / 180) * 60)));
}
