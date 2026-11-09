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
  objectStore: () => {
    indexNames: { contains: () => boolean };
    index: () => { getAll: (owner: string) => RequestMock; openCursor: (owner: string) => RequestMock };
    get: (key: string) => RequestMock;
    put: (record: OfflinePdfRecord) => void;
    delete: (key: string) => void;
  };
}

let records: Map<string, OfflinePdfRecord>;
let database: typeof import('$lib/browser/offline-pdf-database');

beforeEach(async () => {
  vi.resetModules();
  records = new Map();
  const db = {
    objectStoreNames: { contains: () => true },
    transaction: () => {
      const transaction: TransactionMock = {
        oncomplete: null, onabort: null, onerror: null,
        objectStore: () => ({
          indexNames: { contains: () => true },
          index: () => ({ getAll: (owner: string) => request(() => [...records.values()]
            .filter(record => record.ownerId === owner).map(record => ({ ...record }))),
            openCursor: (owner: string) => {
              const values = [...records.values()].filter(record => record.ownerId === owner);
              const cursorRequest: RequestMock = { result: null, onsuccess: null, onerror: null };
              let offset = 0;
              const advance = () => setImmediate(() => {
                const value = values[offset++];
                cursorRequest.result = value ? { value: { ...value }, continue: advance } : null;
                cursorRequest.onsuccess?.();
                if (!value) setImmediate(() => transaction.oncomplete?.());
              });
              advance();
              return cursorRequest;
            },
          }),
          get: (key: string) => request(() => {
            const record = records.get(key);
            return record ? { ...record } : undefined;
          }),
          put: (record: OfflinePdfRecord) => {
            records.set(record.key, { ...record });
            setImmediate(() => transaction.oncomplete?.());
          },
          delete: (key: string) => {
            records.delete(key);
            setImmediate(() => transaction.oncomplete?.());
          },
        }),
      };
      function request(read: () => unknown): RequestMock {
        const result: RequestMock = { result: undefined, onsuccess: null, onerror: null };
        setImmediate(() => {
          result.result = read();
          result.onsuccess?.();
          setImmediate(() => transaction.oncomplete?.());
        });
        return result;
      }
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
  database = await import('$lib/browser/offline-pdf-database');
});

afterEach(() => vi.unstubAllGlobals());

function saveRecord(documentId = 'document'): OfflinePdfRecord {
  const blob = new Blob(['%PDF-offline']);
  const record: OfflinePdfRecord = {
    key: `reader:${documentId}`, ownerId: 'reader', documentId, title: 'PDF',
    sourceUrl: 'https://example.test/document.pdf', sourceVersion: 'v1',
    checksum: '00'.repeat(32), blob, sizeBytes: blob.size, contentType: 'application/pdf',
    savedAt: 1, lastAccessedAt: 1, recordVersion: 1, status: 'complete',
  };
  records.set(record.key, record);
  return record;
}

it.each([1, 10, 30])('lists %i PDF metadata records without hashing or reading blob bytes; serving still verifies', async count => {
  for (let index = 0; index < count; index++) saveRecord(`document-${index}`);
  const foreign = saveRecord('foreign');
  records.set(foreign.key, { ...foreign, ownerId: 'other-owner' });
  const digest = vi.fn().mockResolvedValue(new Uint8Array(32).buffer);
  vi.stubGlobal('crypto', { subtle: { digest } });
  const buffers = vi.spyOn(Blob.prototype, 'arrayBuffer');
  try {
    const result = await database.listOfflinePdfMetadata('reader');
    expect(result).toHaveLength(count);
    expect(result.every(record => !('blob' in record) && record.ownerId === 'reader')).toBe(true);
    expect(digest).not.toHaveBeenCalled();
    expect(buffers).not.toHaveBeenCalled();
    expect(await database.getOfflinePdfByKey(result[0].key)).not.toBeNull();
    expect(digest).toHaveBeenCalledOnce();
    expect(buffers).toHaveBeenCalledOnce();
  } finally { buffers.mockRestore(); }
});

for (const failure of ['missing crypto', 'rejected digest'] as const) {
  function failVerification() {
    if (failure === 'missing crypto') vi.stubGlobal('crypto', {});
    else vi.stubGlobal('crypto', { subtle: { digest: vi.fn().mockRejectedValue(new Error('digest failed')) } });
  }

  it(`preserves a downloaded PDF and rejects unverified reads on ${failure}`, async () => {
    const record = saveRecord();
    failVerification();
    await expect(database.getOfflinePdfByKey(record.key)).rejects.toThrow();
    expect(records.get(record.key)).toEqual(record);
  });

  it(`preserves the downloaded library on ${failure}`, async () => {
    const first = saveRecord('first');
    const second = saveRecord('second');
    failVerification();
    await expect(database.listOfflinePdfs('reader')).rejects.toThrow();
    expect([...records.values()]).toEqual([first, second]);
  });
}

it('still removes an unchanged download when a completed digest proves corruption', async () => {
  const record = saveRecord();
  vi.stubGlobal('crypto', { subtle: { digest: vi.fn().mockResolvedValue(new Uint8Array(32).fill(1).buffer) } });
  expect(await database.getOfflinePdfByKey(record.key)).toBeNull();
  expect(records.has(record.key)).toBe(false);
});

it('still removes corrupt library entries while returning only checksum-verified PDFs', async () => {
  const good = saveRecord('good');
  const corrupt = saveRecord('corrupt');
  records.set(corrupt.key, { ...corrupt, checksum: '01'.repeat(32) });
  vi.stubGlobal('crypto', { subtle: { digest: vi.fn().mockResolvedValue(new Uint8Array(32).buffer) } });
  expect(await database.listOfflinePdfs('reader')).toEqual([good]);
  expect(records.has(corrupt.key)).toBe(false);
  expect(records.get(good.key)).toEqual(good);
});
