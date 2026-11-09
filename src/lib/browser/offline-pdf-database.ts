export const OFFLINE_PDF_DATABASE = 'tutam_offline_pdfs';
export const OFFLINE_PDF_DATABASE_VERSION = 1;
export const OFFLINE_PDF_RECORD_VERSION = 1;
export const OFFLINE_PDF_STORE = 'documents';
export const ANONYMOUS_PDF_PRINCIPAL = 'anonymous';

export interface OfflinePdfRecord {
  key: string;
  ownerId: string;
  documentId: string;
  title: string;
  sourceUrl: string;
  sourceVersion: string;
  checksum: string;
  blob: Blob;
  sizeBytes: number;
  contentType: string;
  savedAt: number;
  lastAccessedAt: number;
  recordVersion: typeof OFFLINE_PDF_RECORD_VERSION;
  status: 'complete';
}

export type OfflinePdfRecordValidation = 'valid' | 'incomplete' | 'invalid-metadata' | 'size-mismatch';
export type OfflinePdfMetadata = Omit<OfflinePdfRecord, 'blob'>;

let databasePromise: Promise<IDBDatabase> | undefined;

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'));
  });
}

export function normalizePdfPrincipal(principalId: string | null | undefined): string {
  return String(principalId ?? '').trim() || ANONYMOUS_PDF_PRINCIPAL;
}

export function offlinePdfRecordKey(principalId: string | null | undefined, documentId: string): string {
  return `${encodeURIComponent(normalizePdfPrincipal(principalId))}:${encodeURIComponent(String(documentId))}`;
}

export function offlinePdfKeyBelongsToPrincipal(
  key: string,
  principalId: string | null | undefined,
): boolean {
  return key.startsWith(`${encodeURIComponent(normalizePdfPrincipal(principalId))}:`);
}

export function validateOfflinePdfRecord(value: unknown): OfflinePdfRecordValidation {
  const record = value as Partial<OfflinePdfRecord> | null;
  if (!record || record.status !== 'complete') return 'incomplete';
  if (
    record.recordVersion !== OFFLINE_PDF_RECORD_VERSION ||
    typeof record.key !== 'string' || !record.key ||
    typeof record.ownerId !== 'string' || !record.ownerId ||
    typeof record.documentId !== 'string' || !record.documentId ||
    typeof record.sourceUrl !== 'string' || !record.sourceUrl ||
    typeof record.sourceVersion !== 'string' || !record.sourceVersion ||
    typeof record.checksum !== 'string' || !/^[a-f0-9]{64}$/u.test(record.checksum) ||
    typeof record.sizeBytes !== 'number' || !Number.isSafeInteger(record.sizeBytes) || record.sizeBytes <= 0 ||
    !record.blob || typeof record.blob.size !== 'number'
  ) return 'invalid-metadata';
  return record.blob.size === record.sizeBytes ? 'valid' : 'size-mismatch';
}

export function openOfflinePdfDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('offline_pdf_unavailable'));
  if (databasePromise) return databasePromise;

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(OFFLINE_PDF_DATABASE, OFFLINE_PDF_DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(OFFLINE_PDF_STORE)) {
        const store = database.createObjectStore(OFFLINE_PDF_STORE, { keyPath: 'key' });
        store.createIndex('ownerId', 'ownerId', { unique: false });
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => {
        database.close();
        databasePromise = undefined;
      };
      resolve(database);
    };
    request.onerror = () => {
      databasePromise = undefined;
      reject(request.error ?? new Error('offline_pdf_database_open_failed'));
    };
    request.onblocked = () => {
      databasePromise = undefined;
      reject(new Error('offline_pdf_database_blocked'));
    };
  });
  return databasePromise;
}

async function rawOfflinePdf(key: string): Promise<unknown> {
  const database = await openOfflinePdfDatabase();
  const transaction = database.transaction(OFFLINE_PDF_STORE, 'readonly');
  const value = await requestResult(transaction.objectStore(OFFLINE_PDF_STORE).get(key));
  await transactionDone(transaction);
  return value;
}

export async function putOfflinePdf(record: OfflinePdfRecord): Promise<void> {
  if (validateOfflinePdfRecord(record) !== 'valid') throw new Error('offline_pdf_invalid_record');
  const expectedKey = offlinePdfRecordKey(record.ownerId, record.documentId);
  if (record.key !== expectedKey) throw new Error('offline_pdf_owner_mismatch');
  const database = await openOfflinePdfDatabase();
  const transaction = database.transaction(OFFLINE_PDF_STORE, 'readwrite');
  transaction.objectStore(OFFLINE_PDF_STORE).put(record);
  await transactionDone(transaction);
}

export async function removeOfflinePdfByKey(key: string): Promise<void> {
  const database = await openOfflinePdfDatabase();
  const transaction = database.transaction(OFFLINE_PDF_STORE, 'readwrite');
  transaction.objectStore(OFFLINE_PDF_STORE).delete(key);
  await transactionDone(transaction);
}

export async function removeOfflinePdf(principalId: string | null | undefined, documentId: string): Promise<void> {
  await removeOfflinePdfByKey(offlinePdfRecordKey(principalId, documentId));
}

export async function sha256Blob(blob: Blob): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('offline_pdf_checksum_unavailable');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function verifyOfflinePdfRecord(value: unknown): Promise<boolean> {
  if (validateOfflinePdfRecord(value) !== 'valid') return false;
  const record = value as OfflinePdfRecord;
  // Lỗi bộ kiểm tra không chứng minh tệp hỏng; phải giữ bản tải và báo lỗi đọc.
  return await sha256Blob(record.blob) === record.checksum;
}

function sameOfflinePdfVersion(current: unknown, expected: unknown): boolean {
  if (!current || !expected || typeof current !== 'object' || typeof expected !== 'object') return false;
  const left = current as Partial<OfflinePdfRecord>;
  const right = expected as Partial<OfflinePdfRecord>;
  return left.key === right.key && left.ownerId === right.ownerId && left.documentId === right.documentId
    && left.savedAt === right.savedAt && left.checksum === right.checksum
    && left.sourceUrl === right.sourceUrl && left.sourceVersion === right.sourceVersion
    && left.sizeBytes === right.sizeBytes && left.recordVersion === right.recordVersion && left.status === right.status;
}

/** Retire only the exact saved copy selected by the current caller. */
export async function retireOfflinePdf(
  expected: OfflinePdfMetadata,
  isCurrent: () => boolean,
): Promise<boolean> {
  if (!isCurrent() || expected.key !== offlinePdfRecordKey(expected.ownerId, expected.documentId)) return false;
  const database = await openOfflinePdfDatabase();
  if (!isCurrent()) return false;
  const transaction = database.transaction(OFFLINE_PDF_STORE, 'readwrite');
  const done = transactionDone(transaction);
  const store = transaction.objectStore(OFFLINE_PDF_STORE);
  const request = store.get(expected.key);
  let deleted = false;
  // Keep comparison and deletion in the same IDB callback, without checksum/network awaits.
  request.onsuccess = () => {
    if (!isCurrent() || !sameOfflinePdfVersion(request.result, expected)) return;
    store.delete(expected.key);
    deleted = true;
  };
  await done;
  return deleted;
}

async function finishOfflinePdfRead(key: string, expected: unknown, valid: boolean): Promise<OfflinePdfRecord | null> {
  const database = await openOfflinePdfDatabase();
  const transaction = database.transaction(OFFLINE_PDF_STORE, 'readwrite');
  const done = transactionDone(transaction);
  const store = transaction.objectStore(OFFLINE_PDF_STORE);
  const request = store.get(key);
  let result: OfflinePdfRecord | null = null;
  // Chỉ đối chiếu/ghi trong callback IDB; không giữ transaction qua bước await checksum.
  request.onsuccess = () => {
    const current: unknown = request.result;
    if (!sameOfflinePdfVersion(current, expected)) return;
    if (!valid) { store.delete(key); return; }
    if (validateOfflinePdfRecord(current) !== 'valid') return;
    const record = current as OfflinePdfRecord;
    result = record;
    const accessed = { ...record, lastAccessedAt: Date.now() };
    try {
      store.put(accessed);
      result = accessed;
    } catch {
      // Giữ khả năng đọc bản đã xác minh khi metadata truy cập không ghi được.
    }
  };
  // Lỗi cập nhật thời điểm truy cập không được làm mất bản PDF vừa xác minh.
  await done.catch(() => undefined);
  return result;
}

export async function getOfflinePdfByKey(key: string): Promise<OfflinePdfRecord | null> {
  const value = await rawOfflinePdf(key);
  if (value === undefined) return null;
  if (!await verifyOfflinePdfRecord(value)) {
    await finishOfflinePdfRead(key, value, false).catch(() => undefined);
    return null;
  }
  return finishOfflinePdfRead(key, value, true);
}

export async function getOfflinePdf(
  principalId: string | null | undefined,
  documentId: string,
): Promise<OfflinePdfRecord | null> {
  return getOfflinePdfByKey(offlinePdfRecordKey(principalId, documentId));
}

export async function listOfflinePdfs(principalId: string | null | undefined): Promise<OfflinePdfRecord[]> {
  const ownerId = normalizePdfPrincipal(principalId);
  const database = await openOfflinePdfDatabase();
  const transaction = database.transaction(OFFLINE_PDF_STORE, 'readonly');
  const store = transaction.objectStore(OFFLINE_PDF_STORE);
  const records = store.indexNames.contains('ownerId')
    ? await requestResult(store.index('ownerId').getAll(ownerId))
    : await requestResult(store.getAll());
  await transactionDone(transaction);
  const owned = (records as OfflinePdfRecord[]).filter((record) => record.ownerId === ownerId);
  const checked = await Promise.all(owned.map(async (record) => ({
    record,
    valid: await verifyOfflinePdfRecord(record),
  })));
  await Promise.all(checked
    .filter(({ valid }) => !valid)
    .map(({ record }) => finishOfflinePdfRead(record.key, record, false).catch(() => undefined)));
  return checked
    .filter(({ valid }) => valid)
    .map(({ record }) => record)
    .sort((left, right) => right.savedAt - left.savedAt);
}

/** Listing is not proof of content integrity: serving still verifies the full blob. */
export async function listOfflinePdfMetadata(principalId: string | null | undefined): Promise<OfflinePdfMetadata[]> {
  const ownerId = normalizePdfPrincipal(principalId);
  const database = await openOfflinePdfDatabase();
  const transaction = database.transaction(OFFLINE_PDF_STORE, 'readonly');
  const done = transactionDone(transaction);
  const store = transaction.objectStore(OFFLINE_PDF_STORE);
  const request = store.indexNames.contains('ownerId') ? store.index('ownerId').openCursor(ownerId) : store.openCursor();
  const metadata: OfflinePdfMetadata[] = [];
  await Promise.all([done, new Promise<void>((resolve, reject) => {
    request.onerror = () => reject(request.error ?? new Error('offline_pdf_metadata_read_failed'));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) { resolve(); return; }
      const value: unknown = cursor.value;
      if (validateOfflinePdfRecord(value) === 'valid') {
        const record = value as OfflinePdfRecord;
        if (record.ownerId === ownerId && record.key === offlinePdfRecordKey(ownerId, record.documentId)) {
          metadata.push({
            key: record.key, ownerId: record.ownerId, documentId: record.documentId, title: record.title,
            sourceUrl: record.sourceUrl, sourceVersion: record.sourceVersion, checksum: record.checksum,
            sizeBytes: record.sizeBytes, contentType: record.contentType, savedAt: record.savedAt,
            lastAccessedAt: record.lastAccessedAt, recordVersion: record.recordVersion, status: record.status,
          });
        }
      }
      cursor.continue();
    };
  })]);
  return metadata.sort((left, right) => right.savedAt - left.savedAt);
}

export async function offlinePdfStorageBytes(principalId: string | null | undefined): Promise<number> {
  return (await listOfflinePdfMetadata(principalId)).reduce((total, record) => total + record.sizeBytes, 0);
}

export async function resolveOfflinePdfResponse(
  key: string,
  principalId: string | null | undefined,
  reader: (recordKey: string) => Promise<OfflinePdfRecord | null> = getOfflinePdfByKey,
): Promise<Response> {
  if (!offlinePdfKeyBelongsToPrincipal(key, principalId)) return offlinePdfResponseForRecord(null);
  const record = await reader(key);
  if (
    !record
    || record.ownerId !== normalizePdfPrincipal(principalId)
    || record.key !== offlinePdfRecordKey(record.ownerId, record.documentId)
    || record.key !== key
  ) return offlinePdfResponseForRecord(null);
  return offlinePdfResponseForRecord(record);
}

export function offlinePdfResponseForRecord(record: OfflinePdfRecord | null): Response {
  if (!record || validateOfflinePdfRecord(record) !== 'valid') {
    return new Response('Offline PDF not found', { status: 404 });
  }
  return new Response(record.blob, {
    status: 200,
    headers: {
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, no-store',
      'Content-Length': String(record.sizeBytes),
      'Content-Type': record.contentType || 'application/pdf',
      'ETag': `"sha256-${record.checksum}"`,
      'X-Content-Type-Options': 'nosniff',
      'X-Offline-PDF': '1',
    },
  });
}
