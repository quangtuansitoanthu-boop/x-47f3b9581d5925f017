import { afterEach, expect, it, vi } from 'vitest';
import { createCopyBookRunStore, createCopyStore } from '../../../src/lib/browser/scripture-copying-storage';
import { createCopyWorkspace, type CopyDraft } from '../../../src/lib/browser/scripture-copying-workspace';

afterEach(() => vi.unstubAllGlobals());

function databaseHarness(entries: ReadonlyMap<string, unknown>) {
  const requests: Array<{ key: string; request: { result?: unknown; onsuccess?: () => void } }> = [];
  const put = vi.fn();
  const tx = { objectStore: () => ({ get: (key: string) => {
    const request = {};
    requests.push({ key, request });
    return request;
  }, put }), abort: vi.fn(), error: null, oncomplete: undefined as (() => void) | undefined,
    onabort: undefined as (() => void) | undefined, onerror: undefined as (() => void) | undefined };
  const transaction = vi.fn(() => tx);
  const open = { result: { transaction }, onsuccess: undefined as (() => void) | undefined };
  vi.stubGlobal('indexedDB', { open: () => { queueMicrotask(() => open.onsuccess?.()); return open; } });
  const deliverReads = async () => {
    await vi.waitFor(() => expect(requests.length).toBeGreaterThan(0));
    for (const { key, request } of requests) { request.result = entries.get(key); request.onsuccess?.(); }
  };
  return { tx, put, transaction, deliverReads };
}

it('reads and writes all book records in one transaction and resolves only after durable commit', async () => {
  const h = databaseHarness(new Map<string, unknown>([['chapter', { texts: ['old'] }], ['manifest', { runId: 'old' }]]));
  let settled = false;
  const operation = createCopyBookRunStore().atomic(['chapter', 'manifest', 'chapter'], values => {
    expect(values.size).toBe(2);
    expect(values.get('chapter')).toEqual({ texts: ['old'] });
    return { writes: new Map<string, unknown>([['chapter', { texts: [''] }], ['manifest', { runId: 'new' }]]), result: 'new' };
  }).then(result => { settled = true; return result; });
  await h.deliverReads();
  expect(h.transaction).toHaveBeenCalledExactlyOnceWith('drafts', 'readwrite');
  expect(h.put).toHaveBeenCalledTimes(2);
  expect(settled).toBe(false);
  h.tx.oncomplete?.();
  expect(await operation).toBe('new');
});

it('aborts the transaction and preserves the original error when a book change is rejected', async () => {
  const h = databaseHarness(new Map());
  const error = new Error('book_incomplete');
  const operation = createCopyBookRunStore().atomic(['chapter'], () => { throw error; });
  const rejection = expect(operation).rejects.toBe(error);
  await h.deliverReads();
  await rejection;
  expect(h.tx.abort).toHaveBeenCalledOnce();
  expect(h.put).not.toHaveBeenCalled();
});

it('rejects a storage abort after all puts instead of announcing a new book run', async () => {
  const h = databaseHarness(new Map());
  const operation = createCopyBookRunStore().atomic(['chapter'], () => ({ writes: new Map([['chapter', {}]]), result: 'new' }));
  const rejection = expect(operation).rejects.toThrow('storage_write_failed');
  await h.deliverReads();
  h.tx.onabort?.();
  await rejection;
});

const activeKey = 'tt_copy_v1:guest:dia-tang:v1:1';
function chapterDraft(bookRunId?: string): CopyDraft {
  return { runId: 'chapter-id', bookRunId, sutraId: 'dia-tang', chapter: 1, sourceVersion: 'v1',
    texts: ['Bản đang chép'], savedTexts: [''], revision: 0, savedAt: null, pending: null, block: 0 };
}

it.each(['older-book', undefined])('rejects a stale tab with bookRunId %s before it overwrites a newer active chapter', async oldRun => {
  const latest = chapterDraft('new-book');
  const h = databaseHarness(new Map([[activeKey, latest]]));
  const operation = createCopyStore().write(activeKey, chapterDraft(oldRun));
  const rejection = expect(operation).rejects.toThrow('copy_book_run_changed');
  await h.deliverReads();
  await rejection;
  expect(h.transaction).toHaveBeenCalledExactlyOnceWith('drafts', 'readwrite');
  expect(h.put).not.toHaveBeenCalled();
  expect(h.tx.abort).toHaveBeenCalledOnce();
  expect(latest.texts).toEqual(['Bản đang chép']);
});

it.each([
  ['same run', chapterDraft('current'), chapterDraft('current')],
  ['legacy caller', chapterDraft(), chapterDraft()],
  ['new draft', undefined, chapterDraft('current')],
  ['archive', chapterDraft('other'), chapterDraft('current')],
] as const)('keeps compatible writes for %s and acknowledges only transaction commit', async (kind, stored, incoming) => {
  const key = kind === 'archive' ? `${activeKey}:run:archived-id` : activeKey;
  const h = databaseHarness(new Map(stored ? [[key, stored]] : []));
  let settled = false;
  const operation = createCopyStore().write(key, incoming).then(() => { settled = true; });
  if (kind !== 'archive') await h.deliverReads();
  else await vi.waitFor(() => expect(h.put).toHaveBeenCalledOnce());
  expect(h.put).toHaveBeenCalledExactlyOnceWith(incoming, key);
  expect(settled).toBe(false);
  h.tx.oncomplete?.();
  await operation;
  expect(settled).toBe(true);
});

it('rejects a failed checked write without acknowledging or replacing the active chapter', async () => {
  const h = databaseHarness(new Map([[activeKey, chapterDraft('current')]]));
  const error = new Error('clone_failed');
  h.put.mockImplementation(() => { throw error; });
  const rejection = expect(createCopyStore().write(activeKey, chapterDraft('current'))).rejects.toBe(error);
  await h.deliverReads();
  await rejection;
  expect(h.tx.abort).toHaveBeenCalledOnce();
});

it.each(['edit', 'select block'] as const)('preserves a newer same-run draft when another tab attempts a stale %s', async action => {
  const initial = { ...chapterDraft('current'), texts: ['Bản đầu', ''], savedTexts: ['', ''] };
  const records = new Map<string, unknown>([[activeKey, structuredClone(initial)]]);
  // Separate stores model separate tabs. Each transaction reads the shared durable
  // records, stages its writes, and commits only after request callbacks finish.
  const db = { transaction: () => {
    const requests: Array<{ key: string; request: { result?: unknown; onsuccess?: () => void } }> = [];
    const staged = new Map<string, unknown>();
    let aborted = false;
    const tx = {
      error: null,
      oncomplete: undefined as (() => void) | undefined,
      onabort: undefined as (() => void) | undefined,
      onerror: undefined as (() => void) | undefined,
      abort() { aborted = true; },
      objectStore: () => ({
        get(key: string) { const request = {}; requests.push({ key, request }); return request; },
        put(value: unknown, key: string) { staged.set(key, structuredClone(value)); },
      }),
    };
    queueMicrotask(() => {
      for (const { key, request } of requests) {
        request.result = structuredClone(records.get(key));
        request.onsuccess?.();
      }
      queueMicrotask(() => {
        if (aborted) { tx.onabort?.(); return; }
        for (const [key, value] of staged) records.set(key, value);
        tx.oncomplete?.();
      });
    });
    return tx;
  } };
  vi.stubGlobal('indexedDB', { open: () => {
    const request = { result: db, onsuccess: undefined as (() => void) | undefined };
    queueMicrotask(() => request.onsuccess?.());
    return request;
  } });
  const firstTab = createCopyStore(), secondTab = createCopyStore();
  const send = vi.fn();
  const firstWorkspace = createCopyWorkspace(firstTab, send);
  const staleWorkspace = createCopyWorkspace(secondTab, send);
  await firstWorkspace.open('guest', 'dia-tang', 1, 'v1', 2);
  await staleWorkspace.open('guest', 'dia-tang', 1, 'v1', 2);
  await firstWorkspace.edit(0, 'Nội dung mới đã lưu của tab A');
  const first = await firstTab.read(activeKey);
  expect(first?.texts[0]).toBe('Nội dung mới đã lưu của tab A');
  // A progress-list read on the same store must not bless the stale workspace.
  expect(await secondTab.read(activeKey)).toEqual(first);
  const operation = action === 'edit'
    ? staleWorkspace.edit(1, 'Nội dung nhập ở tab B')
    : staleWorkspace.selectBlock(1);
  await expect(operation).rejects.toThrow('copy_draft_changed');
  expect(records.get(activeKey)).toEqual(first);
  expect(send).not.toHaveBeenCalled();
});
