import { expect, it } from 'vitest';
import { createCopyBookRuns, copyBookRunKey, type CopyBookRunStore } from '../../../src/lib/browser/scripture-copying-book-runs';
import { copyDraftKey, type CopyDraft } from '../../../src/lib/browser/scripture-copying-workspace';
import type { CopyBook } from '../../../src/lib/domain/practice/scripture-copying';

const book: CopyBook = { id: 'dia-tang', title: 'Kinh Địa Tạng', articleId: 'source', version: 'v1', chapters: [
  { number: 1, title: 'Phẩm 1', blocks: ['Nam mô Phật'] },
  { number: 2, title: 'Phẩm 2', blocks: ['Nam mô Bồ Tát'] },
] };
function fixture() {
  const entries = new Map<string, unknown>();
  let fail = false;
  const store: CopyBookRunStore = {
    async atomic(keys, change) {
      const values = new Map(keys.filter(key => entries.has(key)).map(key => [key, structuredClone(entries.get(key))]));
      const { writes, result } = change(values);
      if (fail) throw new Error('storage_full');
      for (const [key, value] of writes) entries.set(key, structuredClone(value));
      return result;
    },
  };
  return { entries, runs: createCopyBookRuns(store), fail: () => { fail = true; } };
}
function complete(entries: Map<string, unknown>, scope = 'guest') {
  for (const chapter of book.chapters) {
    const key = copyDraftKey(scope, book.id, chapter.number, book.version);
    const draft = entries.get(key) as CopyDraft;
    entries.set(key, { ...draft, texts: [...chapter.blocks] });
  }
}

it('creates one stable run per principal and edition without cross-account data', async () => {
  const { runs } = fixture();
  expect(await runs.read('guest', book)).toBeNull();
  const first = await runs.ensure('guest', book);
  expect(first.drafts).toHaveLength(2);
  expect(first.complete).toBe(false);
  expect((await runs.ensure('guest', book)).runId).toBe(first.runId);
  expect((await runs.ensure('account:A', book)).runId).not.toBe(first.runId);
  expect((await runs.ensure('guest', { ...book, version: 'v2' })).runId).not.toBe(first.runId);
});

it('requires every chapter and archives all text before activating a new book run', async () => {
  const { runs, entries } = fixture();
  const first = await runs.ensure('guest', book);
  const key = copyDraftKey('guest', book.id, 1, book.version);
  entries.set(key, { ...entries.get(key) as CopyDraft, texts: ['Nam mô Phật'] });
  await expect(runs.startNewRun('guest', book)).rejects.toThrow('copy_book_incomplete');
  expect((await runs.read('guest', book))?.runId).toBe(first.runId);
  complete(entries);
  expect((await runs.read('guest', book))?.complete).toBe(true);
  const next = await runs.startNewRun('guest', book);
  expect(next.runId).not.toBe(first.runId);
  expect(next.complete).toBe(false);
  expect(next.previousRuns).toEqual([{ runId: first.runId, chapterRunIds: first.drafts.map(draft => draft.runId) }]);
  for (const [index, chapter] of book.chapters.entries()) {
    const chapterKey = copyDraftKey('guest', book.id, chapter.number, book.version);
    expect(entries.get(`${chapterKey}:run:${first.drafts[index].runId}`)).toMatchObject({ texts: chapter.blocks });
    expect(next.drafts[index]).toMatchObject({ texts: [''], bookRunId: next.runId, runId: next.runId, revision: 0, pending: null });
  }
  complete(entries);
  const third = await runs.startNewRun('guest', book);
  expect(third.previousRuns.map(run => run.runId)).toEqual([first.runId, next.runId]);
  expect(entries.get(`${key}:run:${first.drafts[0].runId}`)).toMatchObject({ texts: book.chapters[0].blocks });
  expect(entries.get(`${key}:run:${next.runId}`)).toMatchObject({ texts: book.chapters[0].blocks });
});

it('adopts old chapter drafts without changing their IDs, receipts or text and suppresses upgrade credit', async () => {
  const { runs, entries } = fixture();
  for (const chapter of book.chapters) {
    entries.set(copyDraftKey('guest', book.id, chapter.number, book.version), {
      runId: `old-${chapter.number}`, sutraId: book.id, chapter: chapter.number, sourceVersion: book.version,
      texts: chapter.blocks, savedTexts: chapter.blocks, revision: 7, savedAt: 'saved', pending: null, block: 0,
    });
  }
  const adopted = await runs.ensure('guest', book);
  expect(adopted).toMatchObject({ complete: true, legacyCompleted: true });
  expect(adopted.drafts[0]).toMatchObject({ runId: 'old-1', texts: book.chapters[0].blocks, revision: 7, savedAt: 'saved' });
  const next = await runs.startNewRun('guest', book);
  expect(next.legacyCompleted).toBeUndefined();
  expect((await runs.read('guest', book))?.runId).toBe(next.runId);
});

it('keeps the old active run and drafts when the atomic archive transaction fails', async () => {
  const state = fixture();
  await state.runs.ensure('guest', book);
  complete(state.entries);
  const before = structuredClone(state.entries);
  state.fail();
  await expect(state.runs.startNewRun('guest', book)).rejects.toThrow('storage_full');
  expect(state.entries).toEqual(before);
  expect(state.entries.has(copyBookRunKey('guest', book))).toBe(true);
});

it('rejects chapter drafts belonging to another active run', async () => {
  const { runs, entries } = fixture();
  await runs.ensure('guest', book);
  const key = copyDraftKey('guest', book.id, 1, book.version);
  entries.set(key, { ...entries.get(key) as CopyDraft, bookRunId: 'another-run' });
  await expect(runs.read('guest', book)).rejects.toThrow('invalid_copy_book_draft');
});
