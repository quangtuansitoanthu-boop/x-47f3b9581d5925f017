import { describe, expect, it, vi } from 'vitest';
import { compareCopy, isBlockedCopyInput, normalizeCopyText } from '../../../src/lib/domain/practice/scripture-copying';
import { createCopyWorkspace } from '../../../src/lib/browser/scripture-copying-workspace';

describe('scripture copying comparison and input', () => {
  it('accepts Vietnamese NFC/NFD and presentation whitespace while keeping Vietnamese accents', () => {
    expect(normalizeCopyText('Nam\u00a0mô\r\nPhật')).toBe('nam mô phật');
    expect(compareCopy('Địa Tạng.', 'Địa Tạng.'.normalize('NFD'), true).complete).toBe(true);
    expect(compareCopy('Địa Tạng.', 'Dia Tang.', true).complete).toBe(false);
    expect(compareCopy('Phật.', 'Phật', true).complete).toBe(true);
  });
  it('locates missing, extra and wrong words without flagging an unwritten tail while typing', () => {
    expect(compareCopy('Nam mô A Di Đà Phật', 'Nam mô', false).issues).toEqual([]);
    expect(compareCopy('Nam mô A Di Đà Phật', 'Nam mô', true).issues[0]).toMatchObject({ kind: 'missing', start: 6 });
    expect(compareCopy('Nam mô Địa Tạng', 'Nam Địa Tạng', true).issues[0]).toMatchObject({ kind: 'missing', expected: 'mô', start: 4 });
    expect(compareCopy('Nam mô Phật', 'Nam mô mô Phật', true).issues.some(i => i.kind === 'extra')).toBe(true);
    expect(compareCopy('Nam mô Phật', 'Nam mo Phật', true).issues[0]).toMatchObject({ kind: 'wrong', expected: 'mô', actual: 'mo', start: 4, end: 6 });
  });
  it('blocks paste/drop without blocking IME composition or undo', () => {
    for (const type of ['insertFromPaste', 'insertFromDrop', 'insertFromPasteAsQuotation']) expect(isBlockedCopyInput(type)).toBe(true);
    for (const type of ['insertText', 'insertCompositionText', 'historyUndo', 'deleteContentBackward']) expect(isBlockedCopyInput(type)).toBe(false);
  });
});

function harness() {
  const records = new Map<string, any>();
  const storage = { read: vi.fn(async (key: string) => records.get(key) ?? null), write: vi.fn(async (key: string, value: any) => { records.set(key, structuredClone(value)); }) };
  const transport = vi.fn(async () => ({ revision: 1, savedAt: '2026-10-23T06:00:00Z' }));
  const workspace = createCopyWorkspace(storage, transport);
  return { workspace, storage, transport, records };
}

describe('local autosave and explicit authenticated server save', () => {
  it('keeps the new principal receipt when an old principal new-run write finishes late', async () => {
    const h = harness();
    await h.workspace.open('account:a', 'dia-tang', 1, 'v1', 1);
    await h.workspace.edit(0, 'Bản của A');
    const keyA = [...h.records.keys()][0];
    let release!: () => void;
    let started!: () => void;
    const pendingWrite = new Promise<void>(resolve => { started = resolve; });
    const originalWrite = h.storage.write.getMockImplementation()!;
    h.storage.write.mockImplementation(async (key, value) => {
      if (key === keyA && value.texts.every((text: string) => text === '')) {
        started();
        await new Promise<void>(resolve => { release = resolve; });
      }
      await originalWrite(key, value);
    });
    const restarting = h.workspace.startNewRun();
    const rejected = expect(restarting).rejects.toThrow('principal_changed');
    await pendingWrite;
    await h.workspace.open('account:b', 'dia-tang', 1, 'v1', 1);
    release();
    await rejected;
    await h.workspace.edit(0, 'Bản của B');
    const calls = h.storage.write.mock.calls as unknown as Array<[string, any, any]>;
    const last = calls.at(-1)!;
    expect(last[0]).toContain('account%3Ab');
    expect(last[2]).toBeNull();
    expect(h.workspace.snapshot().texts).toEqual(['Bản của B']);
  });
  it('chains queued edits against the last successful durable receipt', async () => {
    const h = harness();
    await h.workspace.open('guest', 'dia-tang', 1, 'v1', 2);
    const first = h.workspace.edit(0, 'Nam');
    const second = h.workspace.edit(1, 'Phật');
    await Promise.all([first, second]);
    const calls = h.storage.write.mock.calls as unknown as Array<[string, any, any]>;
    expect(calls[0][2]).toBeNull();
    expect(calls[1][2]).toEqual(calls[0][1]);
    expect(calls[1][1].texts).toEqual(['Nam', 'Phật']);
    expect(h.transport).not.toHaveBeenCalled();
  });
  it('preserves the whole-book run when a legacy restore omits metadata and rejects another book run', async () => {
    const h = harness();
    await h.workspace.open('guest', 'dia-tang', 1, 'v1', 1);
    const initial = h.workspace.snapshot();
    // Whole-book adoption annotates the existing chapter key without changing its identity.
    await h.workspace.edit(0, 'Bản cũ');
    const storedKey = [...h.records.keys()][0];
    h.records.set(storedKey, { ...h.workspace.snapshot(), bookRunId: 'book-run-a' });
    await h.workspace.open('guest', 'dia-tang', 1, 'v1', 1);
    const current = h.workspace.snapshot();
    const { bookRunId: _bookRunId, ...legacy } = current;
    await h.workspace.replaceLocal({ ...legacy, texts: ['Bản khôi phục'] });
    expect(h.workspace.snapshot()).toMatchObject({ bookRunId: 'book-run-a', runId: initial.runId, texts: ['Bản khôi phục'] });
    await expect(h.workspace.replaceLocal({ ...current, bookRunId: 'book-run-b' })).rejects.toThrow('invalid_restore');
    expect(h.workspace.snapshot().texts).toEqual(['Bản khôi phục']);
    expect(h.transport).not.toHaveBeenCalled();
  });
  it('recovers a failed local edit before reopening without replacing it with the older stored text', async () => {
    const h = harness();
    await h.workspace.open('guest', 'dia-tang', 1, 'v1', 1);
    await h.workspace.edit(0, 'Nam');
    h.storage.write.mockRejectedValueOnce(new Error('storage_full'));
    await expect(h.workspace.edit(0, 'Nam mô')).rejects.toThrow('storage_full');

    await h.workspace.open('guest', 'dia-tang', 1, 'v1', 1);
    expect(h.workspace.snapshot().texts).toEqual(['Nam mô']);
    const reopened = createCopyWorkspace(h.storage, h.transport);
    await reopened.open('guest', 'dia-tang', 1, 'v1', 1);
    expect(reopened.snapshot().texts).toEqual(['Nam mô']);
    expect(h.transport).not.toHaveBeenCalled();
  });

  it('preserves a failed account edit under its original principal when switching accounts', async () => {
    const h = harness();
    await h.workspace.open('account:a', 'dia-tang', 1, 'v1', 1);
    h.storage.write.mockRejectedValueOnce(new Error('storage_full'));
    await expect(h.workspace.edit(0, 'Bản của A')).rejects.toThrow('storage_full');

    await h.workspace.open('account:b', 'dia-tang', 1, 'v1', 1);
    expect(h.workspace.snapshot().texts).toEqual(['']);
    await h.workspace.edit(0, 'Bản của B');
    await h.workspace.open('account:a', 'dia-tang', 1, 'v1', 1);
    expect(h.workspace.snapshot().texts).toEqual(['Bản của A']);
    expect(h.transport).not.toHaveBeenCalled();
  });

  it('keeps the in-memory draft if local recovery still fails and permits another flush later', async () => {
    const h = harness();
    await h.workspace.open('guest', 'dia-tang', 1, 'v1', 1);
    h.storage.write.mockRejectedValueOnce(new Error('storage_full'));
    await expect(h.workspace.edit(0, 'Nam mô')).rejects.toThrow('storage_full');
    h.storage.write.mockRejectedValueOnce(new Error('storage_full'));
    await expect(h.workspace.open('guest', 'dia-tang', 2, 'v1', 1)).rejects.toThrow('storage_full');
    expect(h.workspace.snapshot()).toMatchObject({ chapter: 1, texts: ['Nam mô'] });
    await h.workspace.flushLocal();
    await h.workspace.open('guest', 'dia-tang', 1, 'v1', 1);
    expect(h.workspace.snapshot().texts).toEqual(['Nam mô']);
    expect(h.transport).not.toHaveBeenCalled();
  });

  it('allows a new run after a failed replacement without archiving the rejected replacement', async () => {
    const h = harness();
    await h.workspace.open('guest', 'dia-tang', 1, 'v1', 1);
    await h.workspace.edit(0, 'Nam mô');
    const previous = h.workspace.snapshot();
    h.storage.write.mockRejectedValueOnce(new Error('storage_full'));
    await expect(h.workspace.replaceLocal({ ...previous, texts: ['Bản thay thế'] })).rejects.toThrow('storage_full');
    await h.workspace.startNewRun();
    expect(h.workspace.snapshot().texts).toEqual(['']);
    expect((await h.workspace.readPreviousRun(previous.runId))?.texts).toEqual(['Nam mô']);
    expect(h.transport).not.toHaveBeenCalled();
  });

  it('makes zero network calls for 1,000 edits and local block navigation', async () => {
    const h = harness();
    await h.workspace.open('account:a', 'dia-tang', 1, 'v1', 2);
    for (let i = 0; i < 1000; i++) await h.workspace.edit(0, `Nam mô ${i}`);
    await h.workspace.selectBlock(1); await h.workspace.flushLocal();
    expect(h.transport).not.toHaveBeenCalled();
  });
  it('persists every edit locally, restores after reopening and never sends it by itself', async () => {
    const h = harness();
    await h.workspace.open('guest', 'dia-tang', 1, 'v1', 2);
    await h.workspace.edit(0, 'Nam mô');
    await h.workspace.edit(1, 'Phật');
    await h.workspace.flushLocal();
    expect(h.transport).not.toHaveBeenCalled();
    const reopened = createCopyWorkspace(h.storage, h.transport);
    await reopened.open('guest', 'dia-tang', 1, 'v1', 2);
    expect(reopened.snapshot().texts).toEqual(['Nam mô', 'Phật']);
  });
  it('requires login, skips an unchanged save, and does not replay on failure', async () => {
    const h = harness();
    await h.workspace.open('account:a', 'dia-tang', 1, 'v1', 1);
    await h.workspace.edit(0, 'Nam');
    await expect(h.workspace.save(null)).rejects.toThrow('login_required');
    expect(h.transport).not.toHaveBeenCalled();
    await h.workspace.save({ userId: 'a', csrfToken: 'csrf' });
    await h.workspace.save({ userId: 'a', csrfToken: 'csrf' });
    expect(h.transport).toHaveBeenCalledTimes(1);
    await h.workspace.edit(0, 'Nam mô');
    h.transport.mockRejectedValueOnce(new Error('offline'));
    await expect(h.workspace.save({ userId: 'a', csrfToken: 'csrf' })).rejects.toThrow('offline');
    await h.workspace.flushLocal();
    expect(h.transport).toHaveBeenCalledTimes(2);
    expect(h.workspace.snapshot().dirty).toBe(true);
  });
  it('does not mark new typing as saved when the older snapshot is acknowledged', async () => {
    const h = harness();
    let acknowledge!: (value: any) => void;
    h.transport.mockImplementationOnce(() => new Promise(resolve => { acknowledge = resolve; }));
    await h.workspace.open('account:a', 'dia-tang', 1, 'v1', 1);
    await h.workspace.edit(0, 'Nam');
    const saving = h.workspace.save({ userId: 'a', csrfToken: 'csrf' });
    await vi.waitFor(() => expect(h.transport).toHaveBeenCalledTimes(1));
    await h.workspace.edit(0, 'Nam mô');
    acknowledge({ revision: 1, savedAt: '2026-10-23T06:00:00Z' });
    await saving;
    expect(h.workspace.snapshot()).toMatchObject({ dirty: true, texts: ['Nam mô'] });
  });
  it('keeps failed mutation IDs stable across retry and scopes drafts by account', async () => {
    const h = harness();
    await h.workspace.open('account:a', 'dia-tang', 1, 'v1', 1);
    await h.workspace.edit(0, 'Nam');
    h.transport.mockRejectedValueOnce(new Error('timeout'));
    await expect(h.workspace.save({ userId: 'a', csrfToken: 'csrf' })).rejects.toThrow();
    const sent = h.transport.mock.calls[0] as unknown[];
    await h.workspace.save({ userId: 'a', csrfToken: 'csrf' });
    expect((h.transport.mock.calls[1] as unknown[])[0]).toEqual(sent[0]);
    await h.workspace.open('account:b', 'dia-tang', 1, 'v1', 1);
    expect(h.workspace.snapshot().texts).toEqual(['']);
  });
  it('retains the failed snapshot across reopening and never marks an old account response as current', async () => {
    const h = harness();
    await h.workspace.open('account:a', 'dia-tang', 1, 'v1', 1);
    await h.workspace.edit(0, 'Nam');
    h.transport.mockRejectedValueOnce(new Error('timeout'));
    await expect(h.workspace.save({ userId: 'a', csrfToken: 'csrf' })).rejects.toThrow();
    const prior = h.workspace.snapshot().pending;
    const reopened = createCopyWorkspace(h.storage, h.transport);
    await reopened.open('account:a', 'dia-tang', 1, 'v1', 1);
    expect(reopened.snapshot().pending).toEqual(prior);
    let done!: (value: any) => void;
    h.transport.mockImplementationOnce(() => new Promise(resolve => { done = resolve; }));
    const saving = reopened.save({ userId: 'a', csrfToken: 'csrf' }).catch(error => error.message);
    await vi.waitFor(() => expect(h.transport).toHaveBeenCalledTimes(2));
    await reopened.open('account:b', 'dia-tang', 1, 'v1', 1);
    done({ revision: 1, savedAt: '2026-10-23T06:00:00Z' });
    expect(await saving).toBe('principal_changed');
    expect(reopened.snapshot()).toMatchObject({ revision: 0, texts: [''] });
  });
});
