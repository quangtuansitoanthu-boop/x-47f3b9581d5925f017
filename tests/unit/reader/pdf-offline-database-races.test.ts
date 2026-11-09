import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { OfflinePdfRecord } from '$lib/browser/offline-pdf-database';

interface RequestMock {
  result: unknown;
  onsuccess: (() => void) | null;
  onerror: (() => void) | null;
}
interface TransactionMock {
  oncomplete: (() => void) | null;
  onabort: (() => void) | null;
  onerror: (() => void) | null;
  objectStore: () => { get(key: string): RequestMock; put(record: OfflinePdfRecord): void; delete(key: string): void };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
let records: Map<string, OfflinePdfRecord>;
let database: typeof import('$lib/browser/offline-pdf-database');
let digestStarted: ReturnType<typeof deferred<void>>;
let digest: ReturnType<typeof deferred<ArrayBuffer>>;
let failWrites: boolean;

beforeEach(async () => {
  vi.resetModules();
  records = new Map();
  failWrites = false;
  digestStarted = deferred<void>();
  digest = deferred<ArrayBuffer>();
  const db = {
    objectStoreNames: { contains: () => true },
    transaction: () => {
      const transaction: TransactionMock = {
        oncomplete: null, onabort: null, onerror: null,
        objectStore: () => ({
          get: (key: string) => {
            const request: RequestMock = { result: undefined, onsuccess: null, onerror: null };
            setImmediate(() => {
              const record = records.get(key);
              request.result = record ? { ...record } : undefined;
              request.onsuccess?.();
              setImmediate(() => transaction.oncomplete?.());
            });
            return request;
          },
          put: (record: OfflinePdfRecord) => {
            if (failWrites) throw new DOMException('Storage full', 'QuotaExceededError');
            records.set(record.key, { ...record });
            setImmediate(() => transaction.oncomplete?.());
          },
          delete: (key: string) => {
            records.delete(key);
            setImmediate(() => transaction.oncomplete?.());
          },
        }),
      };
      return transaction;
    },
  };
  vi.stubGlobal('indexedDB', {
    open: () => {
      const request: RequestMock = { result: db, onsuccess: null, onerror: null };
      setImmediate(() => request.onsuccess?.());
      return request;
    },
  });
  vi.stubGlobal('crypto', { subtle: { digest: () => {
    digestStarted.resolve();
    return digest.promise;
  } } });
  database = await import('$lib/browser/offline-pdf-database');
});
afterEach(() => vi.unstubAllGlobals());

function record(version = 'v1'): OfflinePdfRecord {
  const blob = new Blob([`%PDF-${version}`]);
  return {
    key: 'reader:document', ownerId: 'reader', documentId: 'document', title: 'PDF',
    sourceUrl: 'https://example.test/document.pdf', sourceVersion: version,
    checksum: '00'.repeat(32), blob, sizeBytes: blob.size, contentType: 'application/pdf',
    savedAt: version === 'v1' ? 1 : 2, lastAccessedAt: 1, recordVersion: 1, status: 'complete',
  };
}

it('does not resurrect a PDF deleted while checksum verification is pending', async () => {
  records.set('reader:document', record());
  const reading = database.getOfflinePdfByKey('reader:document');
  await digestStarted.promise;
  await database.removeOfflinePdf('reader', 'document');
  digest.resolve(new Uint8Array(32).buffer);
  await reading;
  await tick();
  expect(records.has('reader:document')).toBe(false);
});

it('does not overwrite a replacement PDF when an old read completes', async () => {
  records.set('reader:document', record());
  const reading = database.getOfflinePdfByKey('reader:document');
  await digestStarted.promise;
  const replacement = record('v2');
  await database.putOfflinePdf(replacement);
  digest.resolve(new Uint8Array(32).buffer);
  await reading;
  await tick();
  expect(records.get('reader:document')).toEqual(replacement);
});

it('does not delete a replacement when verification of the old copy fails', async () => {
  records.set('reader:document', record());
  const reading = database.getOfflinePdfByKey('reader:document');
  await digestStarted.promise;
  const replacement = record('v2');
  await database.putOfflinePdf(replacement);
  digest.resolve(new Uint8Array(32).fill(1).buffer);
  expect(await reading).toBeNull();
  expect(records.get('reader:document')).toEqual(replacement);
});

it('still returns and touches an unchanged PDF after verifying its checksum', async () => {
  records.set('reader:document', record());
  const reading = database.getOfflinePdfByKey('reader:document');
  await digestStarted.promise;
  digest.resolve(new Uint8Array(32).buffer);
  expect(await reading).toMatchObject({ ownerId: 'reader', sourceVersion: 'v1' });
  await tick();
  expect(records.get('reader:document')!.lastAccessedAt).toBeGreaterThan(1);
});

it('keeps a verified PDF readable when updating its access metadata fails', async () => {
  records.set('reader:document', record());
  const reading = database.getOfflinePdfByKey('reader:document');
  await digestStarted.promise;
  failWrites = true;
  digest.resolve(new Uint8Array(32).buffer);
  expect(await reading).toMatchObject({ ownerId: 'reader', sourceVersion: 'v1' });
  expect(records.get('reader:document')!.lastAccessedAt).toBe(1);
});
