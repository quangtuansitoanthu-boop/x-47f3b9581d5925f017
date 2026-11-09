import type { CopyBook } from '$lib/domain/practice/scripture-copying';
import { copyingChapterCompletion } from '$lib/domain/practice/copying-completion-progress';
import { copyDraftKey, createCopyId, type CopyDraft } from './scripture-copying-workspace';

export interface CopyBookRunStore {
  atomic<T>(keys: readonly string[], change: (values: ReadonlyMap<string, unknown>) => {
    writes: ReadonlyMap<string, unknown>; result: T;
  }): Promise<T>;
}
export interface CopyBookRunManifest {
  runId: string;
  previousRuns: Array<{ runId: string; chapterRunIds: string[] }>;
  legacyCompleted?: boolean;
}
export interface CopyBookRunSnapshot extends CopyBookRunManifest {
  drafts: CopyDraft[];
  complete: boolean;
}
export function copyBookRunKey(scope: string, book: Pick<CopyBook, 'id' | 'version'>) {
  return `tt_copy_book_v1:${encodeURIComponent(scope)}:${book.id}:${book.version}`;
}
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** One transaction owns the active edition and its archived chapter drafts. */
export function createCopyBookRuns(store: CopyBookRunStore) {
  function operate(scope: string, book: CopyBook, action: 'ensure' | 'read' | 'restart') {
    const manifestKey = copyBookRunKey(scope, book);
    const keys = book.chapters.map(chapter => copyDraftKey(scope, book.id, chapter.number, book.version));
    return store.atomic([manifestKey, ...keys], values => {
      const writes = new Map<string, unknown>();
      const stored = values.get(manifestKey) as CopyBookRunManifest | undefined;
      if (!stored && action === 'read') return { writes, result: null };
      if (stored && (typeof stored.runId !== 'string' || !Array.isArray(stored.previousRuns))) throw new Error('invalid_copy_book_run');
      let manifest: CopyBookRunManifest = stored ? clone(stored) : { runId: createCopyId(), previousRuns: [] };
      let drafts = book.chapters.map((chapter, index): CopyDraft => {
        const raw = values.get(keys[index]) as CopyDraft | undefined;
        const draft = raw ? clone(raw) : {
          runId: manifest.runId, sutraId: book.id, chapter: chapter.number, sourceVersion: book.version,
          texts: chapter.blocks.map(() => ''), savedTexts: chapter.blocks.map(() => ''),
          revision: 0, savedAt: null, pending: null, block: 0,
        };
        if (draft.sutraId !== book.id || draft.chapter !== chapter.number || draft.sourceVersion !== book.version
          || typeof draft.runId !== 'string' || !Array.isArray(draft.texts) || draft.texts.length !== chapter.blocks.length
          || !draft.texts.every(text => typeof text === 'string') || (draft.bookRunId && draft.bookRunId !== manifest.runId)) {
          throw new Error('invalid_copy_book_draft');
        }
        if (action === 'ensure' && (!raw || !draft.bookRunId)) {
          draft.bookRunId = manifest.runId;
          writes.set(keys[index], draft);
        }
        return draft;
      });
      let complete = book.chapters.length > 0 && drafts.every((draft, index) => copyingChapterCompletion(book.chapters[index].blocks, draft.texts).accepted);
      // Already-finished editions may have chapter credits in the old log. Keep
      // that history without creating another credit merely by upgrading.
      if (!stored && complete && keys.every(key => {
        const legacy = values.get(key) as CopyDraft | undefined;
        return !!legacy && !legacy.bookRunId;
      })) manifest.legacyCompleted = true;
      if (action === 'restart') {
        if (!stored || !complete) throw new Error('copy_book_incomplete');
        const previous = { runId: manifest.runId, chapterRunIds: drafts.map(draft => draft.runId) };
        manifest = { runId: createCopyId(), previousRuns: [...manifest.previousRuns, previous] };
        drafts = drafts.map((draft, index) => {
          writes.set(`${keys[index]}:run:${draft.runId}`, clone(draft));
          const next: CopyDraft = { ...draft, runId: manifest.runId, bookRunId: manifest.runId, practiceRunId: manifest.runId,
            texts: draft.texts.map(() => ''), savedTexts: draft.texts.map(() => ''), revision: 0,
            savedAt: null, pending: null, block: 0,
            previousRuns: [...new Set([...(draft.previousRuns ?? []), draft.runId])] };
          writes.set(keys[index], next);
          return next;
        });
        complete = false;
      }
      if (!stored || action === 'restart') writes.set(manifestKey, manifest);
      const result: CopyBookRunSnapshot = { ...manifest, drafts, complete };
      return { writes, result };
    });
  }
  return {
    async ensure(scope: string, book: CopyBook) { return (await operate(scope, book, 'ensure'))!; },
    read(scope: string, book: CopyBook) { return operate(scope, book, 'read'); },
    async startNewRun(scope: string, book: CopyBook) { return (await operate(scope, book, 'restart'))!; },
  };
}
