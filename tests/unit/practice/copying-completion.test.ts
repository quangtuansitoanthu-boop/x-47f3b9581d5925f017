import { expect, it } from 'vitest';
import { recordCompletedBookCopy, recordCompletedCopy } from '../../../src/lib/browser/copying-completion';
import { getPracticeStorage } from '../../../src/lib/browser/practice-storage';
import { createCopyWorkspace, type CopyDraft } from '../../../src/lib/browser/scripture-copying-workspace';
import type { CopyBook } from '../../../src/lib/domain/practice/scripture-copying';

const book: CopyBook = { id: 'dia-tang', title: 'Kinh Địa Tạng', articleId: 'test', version: 'v1', chapters: [{ number: 1, title: 'Phẩm 1', blocks: ['Nam mô Phật.', '(3 lần)'] }] };
const draft = (): CopyDraft => ({ runId: '11111111-1111-4111-8111-111111111111', sutraId: book.id, chapter: 1, sourceVersion: book.version, texts: ['nam mô phật', ''], savedTexts: ['', ''], revision: 0, savedAt: null, pending: null, block: 0 });
function storage() { const entries = new Map<string,string>(); return { getItem: (key: string) => entries.get(key) ?? null, setItem: (key: string, value: string) => { entries.set(key, value); } }; }
it('records one completed chapter per run, never once per reload or edit', () => {
  const local = storage(), copy = draft();
  expect(recordCompletedCopy(local, book, copy)).toBe(true);
  expect(recordCompletedCopy(local, book, copy)).toBe(false);
  expect(recordCompletedCopy(local, book, { ...copy, runId: '33333333-3333-4333-8333-333333333333', practiceRunId: copy.runId })).toBe(false);
  const practice = getPracticeStorage(local);
  expect(practice.getLogs()).toHaveLength(1);
  expect(practice.getLogs()[0]).toMatchObject({ type: 'Chép kinh', count: 1, note: 'Kinh Địa Tạng · Phẩm 1' });
  expect(recordCompletedCopy(local, book, { ...copy, runId: '22222222-2222-4222-8222-222222222222' })).toBe(true);
  expect(practice.getLogs()).toHaveLength(2);
});
it('keeps the active draft when writing a replacement fails', async () => {
  let fail = false;
  const local = { read: async () => null, write: async () => { if (fail) throw new Error('storage_full'); } };
  const workspace = createCopyWorkspace(local, async () => ({ revision: 1, savedAt: '' }));
  await workspace.open('guest', book.id, 1, book.version, 2);
  await workspace.edit(0, 'Bản đang chép');
  const previous = workspace.snapshot(); fail = true;
  await expect(workspace.replaceLocal({ ...previous, texts: ['Bản thay thế', ''] })).rejects.toThrow('storage_full');
  expect(workspace.snapshot().texts).toEqual(previous.texts);
});
it('does not record an incomplete draft, wrong accents or obsolete source', () => {
  const local = storage();
  expect(recordCompletedCopy(local, book, { ...draft(), texts: ['Nam mo Phat', ''] })).toBe(false);
  expect(recordCompletedCopy(local, book, { ...draft(), sourceVersion: 'old' })).toBe(false);
  expect(getPracticeStorage(local).getLogs()).toHaveLength(0);
});
it('respects a previously deleted completion log', () => {
  const local = storage(); recordCompletedCopy(local, book, draft());
  const practice = getPracticeStorage(local); practice.deleteLog(practice.getLogs()[0].id);
  expect(recordCompletedCopy(local, book, draft())).toBe(false);
});
it('records a chapter at ninety percent once without requiring all review suggestions fixed', () => {
  const local = storage();
  const source = 'một hai ba bốn năm sáu bảy tám chín mười';
  const acceptedBook = { ...book, chapters: [{ number: 1, title: 'Phẩm 1', blocks: [source] }] };
  const copy = { ...draft(), texts: ['một hai ba bốn năm sáu bảy tám chín'] };
  expect(recordCompletedCopy(local, acceptedBook, copy)).toBe(true);
  expect(recordCompletedCopy(local, acceptedBook, copy)).toBe(false);
  expect(getPracticeStorage(local).getLogs()).toHaveLength(1);
});
it('archives the completed text and opens an empty run without any cloud request', async () => {
  const entries = new Map<string,CopyDraft>();
  const local = { read: async (key: string) => entries.get(key) ?? null, write: async (key: string, value: CopyDraft) => { entries.set(key, structuredClone(value)); } };
  let sent = 0;
  const workspace = createCopyWorkspace(local, async () => { sent++; return { revision: 1, savedAt: '' }; });
  await workspace.open('guest', book.id, 1, book.version, 2);
  await workspace.edit(0, 'Nam mô Phật');
  const previous = workspace.snapshot();
  await workspace.startNewRun();
  expect(workspace.snapshot()).toMatchObject({ texts: ['', ''], block: 0, revision: 0, previousRuns: [previous.runId] });
  expect(workspace.snapshot().runId).not.toBe(previous.runId);
  expect(workspace.snapshot().practiceRunId).toBe(workspace.snapshot().runId);
  expect((await workspace.readPreviousRun(previous.runId))?.texts).toEqual(previous.texts);
  expect(sent).toBe(0);
});

const bookRunId = '44444444-4444-4444-8444-444444444444';
const wholeBook: CopyBook = { ...book, chapters: [
  { number: 1, title: 'Phẩm 1', blocks: ['một hai ba bốn năm sáu bảy tám chín mười'] },
  { number: 2, title: 'Phẩm 2', blocks: ['Nam mô Phật.', 'Nam mô Bồ Tát.'] },
] };
const wholeDrafts = () => wholeBook.chapters.map(chapter => ({ ...draft(),
  chapter: chapter.number, texts: [...chapter.blocks], bookRunId,
}));

it('records one whole book only after every chapter reaches ninety percent', () => {
  const local = storage(), copies = wholeDrafts();
  expect(recordCompletedBookCopy(local, wholeBook, copies.slice(0, 1), bookRunId)).toBe(false);
  expect(recordCompletedBookCopy(local, wholeBook, [copies[0], { ...copies[1], texts: ['', ''] }], bookRunId)).toBe(false);
  copies[0].texts = ['một hai ba bốn năm sáu bảy tám chín'];
  expect(recordCompletedBookCopy(local, wholeBook, copies, bookRunId, new Date('2026-10-30T12:00:00Z'))).toBe(true);
  expect(getPracticeStorage(local).getLogs()).toEqual([expect.objectContaining({ type: 'Chép kinh', count: 1,
    note: wholeBook.title, date: '2026-10-30', created: '2026-10-30T12:00:00.000Z' })]);
});

it('rejects missing, duplicate, stale or mismatched chapters and book runs', () => {
  const copies = wholeDrafts();
  const invalid = [
    [copies[0], copies[0]],
    [copies[0], { ...copies[1], sourceVersion: 'old' }],
    [copies[0], { ...copies[1], sutraId: 'other' }],
    [copies[0], { ...copies[1], chapter: 3 }],
    [copies[0], { ...copies[1], texts: [copies[1].texts[0]] }],
    [copies[0], { ...copies[1], bookRunId: 'other' }],
    [copies[0], { ...copies[1], bookRunId: undefined }],
    [...copies, copies[0]],
  ];
  const local = storage();
  for (const candidate of invalid) expect(recordCompletedBookCopy(local, wholeBook, candidate, bookRunId)).toBe(false);
  expect(recordCompletedBookCopy(local, { ...wholeBook, chapters: [] }, [], bookRunId)).toBe(false);
  expect(getPracticeStorage(local).getLogs()).toHaveLength(0);
});

it('keeps whole-book completion idempotent through reloads and chapter run replacements, permits a new book run and respects deletion', () => {
  const local = storage(), copies = wholeDrafts();
  expect(recordCompletedBookCopy(local, wholeBook, copies, bookRunId)).toBe(true);
  expect(recordCompletedBookCopy(local, wholeBook, wholeDrafts().reverse(), bookRunId)).toBe(false);
  expect(recordCompletedBookCopy(local, wholeBook, copies.map(copy => ({ ...copy, practiceRunId: copy.runId, runId: 'new-chapter-run' })), bookRunId)).toBe(false);
  const practice = getPracticeStorage(local);
  practice.deleteLog(practice.getLogs()[0].id);
  expect(recordCompletedBookCopy(local, wholeBook, copies, bookRunId)).toBe(false);
  const nextRunId = '55555555-5555-4555-8555-555555555555';
  expect(recordCompletedBookCopy(local, wholeBook, copies.map(copy => ({ ...copy, bookRunId: nextRunId, runId: nextRunId })), nextRunId)).toBe(true);
  expect(practice.getLogs()).toHaveLength(1);
});

it.each(['shared', 'mixed'])('does not credit the same %s cloud edition again after another device restores it', mode => {
  const local = storage();
  const source = wholeDrafts().map((copy, index) => ({ ...copy,
    runId: mode === 'shared' || index === 0 ? '11111111-1111-4111-8111-111111111111' : '22222222-2222-4222-8222-222222222222' }));
  expect(recordCompletedBookCopy(local, wholeBook, source, bookRunId)).toBe(true);
  const otherManifest = '66666666-6666-4666-8666-666666666666';
  const restored = source.map(copy => ({ ...copy, bookRunId: otherManifest, practiceRunId: copy.runId }));
  expect(recordCompletedBookCopy(local, wholeBook, restored.reverse(), otherManifest)).toBe(false);
  const practice = getPracticeStorage(local);
  expect(practice.getLogs()).toHaveLength(1);
  practice.deleteLog(practice.getLogs()[0].id);
  expect(recordCompletedBookCopy(local, wholeBook, restored, otherManifest)).toBe(false);
  expect(practice.getLogs()).toHaveLength(0);
  const newRun = '77777777-7777-4777-8777-777777777777';
  expect(recordCompletedBookCopy(local, wholeBook, source.map(copy => ({ ...copy, runId: newRun, bookRunId: newRun })), newRun)).toBe(true);
  expect(practice.getLogs()).toHaveLength(1);
});

it.each([false, true])('preserves interim manifest-based credits and their deletion tombstones (deleted=%s)', deleted => {
  const local = storage(), practice = getPracticeStorage(local);
  const oldId = Number.parseInt(bookRunId.replace(/-/g, '').slice(-13), 16);
  practice.saveLog({ id: oldId, type: 'Chép kinh', count: 1, note: wholeBook.title, date: '2026-10-30', created: '2026-10-30T12:00:00.000Z' });
  if (deleted) practice.deleteLog(oldId);
  expect(recordCompletedBookCopy(local, wholeBook, wholeDrafts(), bookRunId)).toBe(false);
  expect(practice.getLogs()).toHaveLength(deleted ? 0 : 1);
});
