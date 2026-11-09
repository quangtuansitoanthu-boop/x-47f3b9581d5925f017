import type { ContentRow, ContentUpdateItem } from '$lib/contracts/content-updates';

export const CONTENT_INDEX_DATABASE = 'tutam_content_package_index';
export const CONTENT_INDEX_VERSION = 1;
export type SavedContentItem = ContentUpdateItem & { packageKey: string };
export type IndexedContentItem = SavedContentItem & { itemKey: string; chapterData: Blob; revision: number };
interface IndexState { key: 'state'; revision: number; legacyFingerprint?: string; }
export interface ContentIndexSnapshot { items: IndexedContentItem[]; state: IndexState; }
let databasePromise: Promise<IDBDatabase> | undefined;

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('offline_content_index_read_failed'));
  });
}
function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('offline_content_index_commit_failed'));
    transaction.onerror = () => reject(transaction.error ?? new Error('offline_content_index_commit_failed'));
  });
}
async function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') throw new Error('offline_content_index_unavailable');
  if (!databasePromise) databasePromise = new Promise((resolve, reject) => {
    let failed = false;
    const request = indexedDB.open(CONTENT_INDEX_DATABASE, CONTENT_INDEX_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('items')) request.result.createObjectStore('items', { keyPath: 'itemKey' });
      if (!request.result.objectStoreNames.contains('meta')) request.result.createObjectStore('meta', { keyPath: 'key' });
    };
    request.onsuccess = () => {
      const database = request.result;
      if (failed) { database.close(); return; }
      database.onversionchange = () => { database.close(); databasePromise = undefined; };
      resolve(database);
    };
    request.onerror = () => { failed = true; reject(request.error ?? new Error('offline_content_index_unavailable')); };
    request.onblocked = () => { failed = true; reject(new Error('offline_content_index_blocked')); };
  });
  const pending = databasePromise;
  return pending.catch(cause => { if (databasePromise === pending) databasePromise = undefined; throw cause; });
}
export async function readContentIndex(): Promise<ContentIndexSnapshot> {
  const database = await openDatabase();
  const transaction = database.transaction(['items', 'meta'], 'readonly');
  const done = transactionDone(transaction);
  const [items, state] = await Promise.all([
    requestResult(transaction.objectStore('items').getAll()) as Promise<IndexedContentItem[]>,
    requestResult(transaction.objectStore('meta').get('state')) as Promise<IndexState | undefined>,
    done,
  ]);
  return { items, state: state ?? { key: 'state', revision: 0 } };
}
export async function readIndexedContentItem(itemKey: string): Promise<IndexedContentItem | null> {
  const database = await openDatabase();
  const transaction = database.transaction('items', 'readonly');
  const done = transactionDone(transaction);
  const [item] = await Promise.all([requestResult(transaction.objectStore('items').get(itemKey)) as Promise<IndexedContentItem | undefined>, done]);
  return item ?? null;
}
export function indexedItem(item: SavedContentItem, chapters: ContentRow[]): Omit<IndexedContentItem, 'revision'> {
  // Giữ cùng ngữ nghĩa JSON của Cache cũ và tách Proxy state trước khi IDB clone.
  const saved = JSON.parse(JSON.stringify(item)) as SavedContentItem;
  return { ...saved, itemKey: `${saved.kind}:${saved.row.id}`, chapterData: new Blob([JSON.stringify(chapters)], { type: 'application/json' }) };
}
export async function commitContentItem(item: Omit<IndexedContentItem, 'revision'>, expectedRevision: number): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(['items', 'meta'], 'readwrite');
  const done = transactionDone(transaction);
  const items = transaction.objectStore('items');
  const meta = transaction.objectStore('meta');
  const stateRequest = meta.get('state');
  stateRequest.onsuccess = () => {
    const state = stateRequest.result as IndexState | undefined ?? { key: 'state', revision: 0 };
    const currentRequest = items.get(item.itemKey);
    currentRequest.onsuccess = () => {
      const current = currentRequest.result as IndexedContentItem | undefined;
      if (current?.version === item.version) return;
      const incomingTime = Date.parse(String(item.row.updated_at ?? '')) || 0;
      const currentTime = Date.parse(String(current?.row.updated_at ?? '')) || 0;
      const newer = incomingTime > currentTime;
      if ((incomingTime > 0 && currentTime > incomingTime)
        || ((current?.revision ?? 0) !== expectedRevision && !newer)) { transaction.abort(); return; }
      const revision = state.revision + 1;
      items.put({ ...item, revision });
      meta.put({ ...state, revision });
    };
  };
  await done;
}
export async function importLegacyContent(itemsToImport: Omit<IndexedContentItem, 'revision'>[], fingerprint: string): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(['items', 'meta'], 'readwrite');
  const done = transactionDone(transaction);
  const items = transaction.objectStore('items');
  const meta = transaction.objectStore('meta');
  const stateRequest = meta.get('state');
  stateRequest.onsuccess = () => {
    const state = stateRequest.result as IndexState | undefined ?? { key: 'state', revision: 0 };
    if (state.legacyFingerprint === fingerprint) return;
    const revision = state.revision + 1;
    // Mỗi callback chỉ đặt request IDB; không giữ transaction qua Cache/crypto await.
    for (const incoming of itemsToImport) {
      const request = items.get(incoming.itemKey);
      request.onsuccess = () => {
        const current = request.result as IndexedContentItem | undefined;
        const newer = (Date.parse(String(incoming.row.updated_at ?? '')) || 0) > (Date.parse(String(current?.row.updated_at ?? '')) || 0);
        if (!current || (current.version !== incoming.version && newer)) items.put({ ...incoming, revision });
      };
    }
    meta.put({ ...state, revision, legacyFingerprint: fingerprint });
  };
  await done;
}
