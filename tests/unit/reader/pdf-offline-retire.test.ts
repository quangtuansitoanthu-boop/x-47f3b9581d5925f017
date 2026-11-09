import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { OfflinePdfMetadata, OfflinePdfRecord } from '$lib/browser/offline-pdf-database';

interface RequestMock {
  result: unknown;
  onsuccess: (() => void) | null;
  onerror: (() => void) | null;
}
let records: Map<string, OfflinePdfRecord>;
let database: typeof import('$lib/browser/offline-pdf-database');
let beforeRead: () => void;
let failTransaction: boolean;
let completeTransaction: () => void;
let holdCommit: boolean;
let readStarted: () => void;

beforeEach(async () => {
  vi.resetModules();
  records = new Map();
  beforeRead = () => {};
  failTransaction = false;
  holdCommit = false;
  readStarted = () => {};
  const db = {
    transaction: vi.fn((_store: string, mode: string) => {
      expect(mode).toBe('readwrite');
      let pendingDelete: string | undefined;
      const transaction = {
        oncomplete: null as (() => void) | null,
        onabort: null as (() => void) | null,
        onerror: null as (() => void) | null,
        error: new Error('IDB failed'),
        objectStore: () => ({
          get: (key: string) => {
            const request: RequestMock = { result: undefined, onsuccess: null, onerror: null };
            setImmediate(() => {
              beforeRead();
              request.result = records.get(key);
              request.onsuccess?.();
              readStarted();
              completeTransaction = () => {
                if (failTransaction) { transaction.onabort?.(); return; }
                if (pendingDelete) records.delete(pendingDelete);
                transaction.oncomplete?.();
              };
              if (!holdCommit) setImmediate(completeTransaction);
            });
            return request;
          },
          delete: (key: string) => { pendingDelete = key; },
        }),
      };
      return transaction;
    }),
  };
  vi.stubGlobal('indexedDB', {
    open: () => {
      const request: RequestMock = { result: db, onsuccess: null, onerror: null };
      setImmediate(() => request.onsuccess?.());
      return request;
    },
  });
  database = await import('$lib/browser/offline-pdf-database');
});
afterEach(() => vi.unstubAllGlobals());

function record(): OfflinePdfRecord {
  const blob = new Blob(['%PDF-v1']);
  return {
    key: 'reader:document', ownerId: 'reader', documentId: 'document', title: 'PDF',
    sourceUrl: 'https://example.test/document.pdf', sourceVersion: 'v1',
    checksum: '00'.repeat(32), blob, sizeBytes: blob.size, contentType: 'application/pdf',
    savedAt: 1, lastAccessedAt: 1, recordVersion: 1, status: 'complete',
  };
}
function seed(): OfflinePdfMetadata {
  const original = record();
  records.set(original.key, original);
  const { blob: _blob, ...metadata } = original;
  return metadata;
}

it('retires only the matching PDF and resolves true after commit', async () => {
  const expected = seed();
  holdCommit = true;
  let settled = false;
  const read = new Promise<void>(resolve => { readStarted = resolve; });
  const retiring = database.retireOfflinePdf(expected, () => true).then(result => { settled = true; return result; });
  await read;
  expect(settled).toBe(false);
  expect(records.has(expected.key)).toBe(true);
  completeTransaction();
  expect(await retiring).toBe(true);
  expect(records.has(expected.key)).toBe(false);
});

it.each([
  ['ownerId', 'other'], ['documentId', 'other'], ['key', 'other:key'],
  ['savedAt', 2], ['checksum', '11'.repeat(32)], ['sourceUrl', 'https://example.test/new.pdf'],
  ['sourceVersion', 'v2'], ['sizeBytes', 100], ['recordVersion', 2], ['status', 'pending'],
])('preserves a replacement with changed %s', async (field, value) => {
  const expected = seed();
  const replacement = { ...record(), [field]: value } as OfflinePdfRecord;
  beforeRead = () => records.set(expected.key, replacement);
  expect(await database.retireOfflinePdf(expected, () => true)).toBe(false);
  expect(records.get(expected.key)).toBe(replacement);
});

it('does not treat access metadata changes as a replacement', async () => {
  const expected = seed();
  records.set(expected.key, { ...record(), lastAccessedAt: 99 });
  expect(await database.retireOfflinePdf(expected, () => true)).toBe(true);
});

it('preserves the record when principal changes before the IDB read callback', async () => {
  const expected = seed();
  let principal = 'reader';
  beforeRead = () => { principal = 'other'; };
  expect(await database.retireOfflinePdf(expected, () => principal === expected.ownerId)).toBe(false);
  expect(records.has(expected.key)).toBe(true);
});

it('preserves the record when the caller cancels', async () => {
  const expected = seed();
  const abort = new AbortController();
  beforeRead = () => abort.abort();
  expect(await database.retireOfflinePdf(expected, () => !abort.signal.aborted)).toBe(false);
  expect(records.has(expected.key)).toBe(true);
});

it('returns false for a missing record', async () => {
  expect(await database.retireOfflinePdf(record(), () => true)).toBe(false);
});

it('rejects an IDB failure without deleting the saved record', async () => {
  const expected = seed();
  failTransaction = true;
  await expect(database.retireOfflinePdf(expected, () => true)).rejects.toThrow('IDB failed');
  expect(records.has(expected.key)).toBe(true);
});

it('refuses metadata whose key does not belong to its owner and document', async () => {
  const expected = seed();
  const malformed = { ...expected, ownerId: 'other' };
  records.set(expected.key, { ...record(), ownerId: 'other' });
  expect(await database.retireOfflinePdf(malformed, () => true)).toBe(false);
  expect(records.has(expected.key)).toBe(true);
});
