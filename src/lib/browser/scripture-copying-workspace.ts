// Copy drafts contain JSON data only; avoid APIs absent from the supported older browsers.
function cloneCopy<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
import { createBrowserId } from './random-id';
export const createCopyId = createBrowserId;

export interface CopySaveInput {
  runId: string; sutraId: string; chapter: number; sourceVersion: string;
  texts: string[]; revision: number; mutationId: string;
}
export interface CopyAck { revision: number; savedAt: string }
export interface CopyDraft {
  runId: string; sutraId: string; chapter: number; sourceVersion: string;
  texts: string[]; revision: number; savedAt: string | null; savedTexts: string[];
  pending: CopySaveInput | null; block: number;
  previousRuns?: string[];
  practiceRunId?: string;
  bookRunId?: string;
}
export interface CopyStore { read(key: string): Promise<CopyDraft | null>; write(key: string, value: CopyDraft, expected?: CopyDraft | null): Promise<void> }
export type CopyAuth = { userId: string; csrfToken: string };
export function copyDraftKey(scope: string, sutraId: string, chapter: number, version: string) {
  return `tt_copy_v1:${encodeURIComponent(scope)}:${sutraId}:${version}:${chapter}`;
}
export function createCopyWorkspace(store: CopyStore, send: (input: CopySaveInput, auth: CopyAuth, signal: AbortSignal) => Promise<CopyAck>) {
  let draft: CopyDraft;
  // Only a successful workspace read/write advances the durable receipt.
  let durable: CopyDraft | null = null;
  let key = '', scope = '', generation = 0;
  let writes: Promise<void> = Promise.resolve();
  let controller: AbortController | null = null;
  let saving = false;
  const persist = () => {
    const captured = cloneCopy(draft), target = key;
    const operation = writes.catch(() => undefined).then(async () => {
      await store.write(target, captured, durable);
      durable = cloneCopy(captured);
    });
    writes = operation;
    return operation;
  };
  // Lưu lại bản đang giữ trong bộ nhớ trước khi mở bản khác nếu lần ghi trước lỗi.
  const flushLocal = () => writes.catch(() => persist());
  return {
    async open(nextScope: string, sutraId: string, chapter: number, version: string, blocks: number) {
      generation++; controller?.abort(); saving = false;
      const current = generation;
      await flushLocal();
      if (current !== generation) return;
      const target = copyDraftKey(nextScope, sutraId, chapter, version);
      const stored = await store.read(target);
      if (current !== generation) return;
      key = target; scope = nextScope;
      draft = stored ?? { runId: createCopyId(), sutraId, chapter, sourceVersion: version,
        texts: Array.from({ length: blocks }, () => ''), revision: 0, savedAt: null,
        savedTexts: Array.from({ length: blocks }, () => ''), pending: null, block: 0 };
      if (draft.sourceVersion !== version || draft.texts.length !== blocks || !draft.texts.every(t => typeof t === 'string')) throw new Error('invalid_local_draft');
      durable = stored ? cloneCopy(stored) : null;
    },
    snapshot() { return { ...cloneCopy(draft), dirty: !!draft.pending || JSON.stringify(draft.texts) !== JSON.stringify(draft.savedTexts), saving }; },
    edit(block: number, text: string) { draft.texts[block] = text; draft.block = block; return persist(); },
    selectBlock(block: number) { draft.block = block; return persist(); },
    flushLocal,
    async startNewRun() {
      if (saving) throw new Error('copy_save_in_progress');
      const current = generation, previous = cloneCopy(draft), target = key;
      await flushLocal();
      if (current !== generation) throw new Error('principal_changed');
      // Keep the finished text, including an uncertain cloud receipt, before opening a blank run.
      await store.write(`${target}:run:${previous.runId}`, previous);
      if (current !== generation) throw new Error('principal_changed');
      const next: CopyDraft = { ...previous, runId: createCopyId(), texts: previous.texts.map(() => ''),
        savedTexts: previous.texts.map(() => ''), revision: 0, savedAt: null, pending: null, block: 0,
        previousRuns: [...new Set([...(previous.previousRuns ?? []), previous.runId])] };
      next.practiceRunId = next.runId;
      await store.write(target, next, durable);
      if (current !== generation) throw new Error('principal_changed');
      durable = cloneCopy(next);
      draft = next;
    },
    async readPreviousRun(runId: string) {
      if (!draft.previousRuns?.includes(runId)) return null;
      return store.read(`${key}:run:${runId}`);
    },
    async replaceLocal(value: CopyDraft) {
      if (value.sutraId !== draft.sutraId || value.chapter !== draft.chapter || value.sourceVersion !== draft.sourceVersion || value.texts.length !== draft.texts.length) throw new Error('invalid_restore');
      if (value.bookRunId !== undefined && value.bookRunId !== draft.bookRunId) throw new Error('invalid_restore');
      const next = cloneCopy(value), current = generation, target = key;
      if (draft.bookRunId !== undefined) next.bookRunId = draft.bookRunId;
      const operation = writes.catch(() => undefined).then(async () => {
        await store.write(target, next, durable);
        durable = cloneCopy(next);
      });
      writes = operation;
      await operation;
      if (current !== generation) throw new Error('principal_changed');
      draft = next;
    },
    cancel() { generation++; controller?.abort(); saving = false; },
    async save(auth: CopyAuth | null): Promise<CopyAck | null> {
      if (!auth || !auth.csrfToken) throw new Error('login_required');
      if (scope !== `account:${auth.userId}`) throw new Error('principal_changed');
      if (saving) return null;
      if (!draft.pending && JSON.stringify(draft.texts) === JSON.stringify(draft.savedTexts)) return null;
      saving = true;
      const current = generation;
      const abort = new AbortController(); controller = abort;
      try {
        if (!draft.pending) draft.pending = { runId: draft.runId, sutraId: draft.sutraId, chapter: draft.chapter,
          sourceVersion: draft.sourceVersion, texts: [...draft.texts], revision: draft.revision, mutationId: createCopyId() };
        const captured = cloneCopy(draft.pending);
        await persist(); // Persist the immutable receipt before sending, including uncertain retries.
        if (current !== generation) throw new Error('principal_changed');
        const ack = await send(captured, auth, abort.signal);
        if (current !== generation) throw new Error('principal_changed');
        draft.revision = ack.revision; draft.savedAt = ack.savedAt;
        draft.savedTexts = [...captured.texts]; draft.pending = null;
        await persist();
        return ack;
      } finally {
        if (current === generation) { saving = false; controller = null; }
      }
    },
  };
}
