import { Capacitor } from '@capacitor/core';
import type { CopyDraft, CopyStore } from './scripture-copying-workspace';
import type { CopyBookRunStore } from './scripture-copying-book-runs';

function checkExpectedDraft(current: unknown, expected: CopyDraft | null | undefined, incoming: CopyDraft) {
  // The workspace owns this receipt; unrelated reads must not refresh it.
  // Identical content also permits recovery from an uncertain committed write.
  if (expected !== undefined && JSON.stringify(current ?? null) !== JSON.stringify(expected)
    && JSON.stringify(current) !== JSON.stringify(incoming)) throw new Error('copy_draft_changed');
}

function validDraft(value: unknown): value is CopyDraft {
  const d = value as CopyDraft | null;
  return !!d && typeof d.runId === 'string' && typeof d.sourceVersion === 'string' &&
    (d.bookRunId === undefined || typeof d.bookRunId === 'string') &&
    Array.isArray(d.texts) && d.texts.every(t => typeof t === 'string') &&
    Array.isArray(d.savedTexts) && Number.isSafeInteger(d.revision) && d.revision >= 0;
}
export function createCopyStore(): CopyStore {
  return Capacitor.isNativePlatform() ? getNativeStore().drafts : browserStore();
}
function createDatabaseConnection() {
  let connection: Promise<IDBDatabase> | null = null;
  return () => connection ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('tutam-scripture-copying-v1', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('drafts');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { connection = null; reject(request.error); };
    request.onblocked = () => { connection = null; reject(new Error('storage_blocked')); };
  });
}
function browserStore(): CopyStore {
  const open = createDatabaseConnection();
  return {
    async read(key) {
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('drafts', 'readonly');
        const request = tx.objectStore('drafts').get(key);
        tx.oncomplete = () => {
          if (request.result === undefined) resolve(null);
          else if (validDraft(request.result)) resolve(request.result);
          else reject(new Error('invalid_local_draft'));
        };
        tx.onerror = tx.onabort = () => reject(tx.error ?? new Error('storage_read_failed'));
      });
    },
    async write(key, value, expected) {
      const db = await open();
      return new Promise<void>((resolve, reject) => {
        const tx = db.transaction('drafts', 'readwrite');
        const store = tx.objectStore('drafts');
        if (key.startsWith('tt_copy_v1:') && !key.includes(':run:')) {
          const request = store.get(key);
          request.onsuccess = () => {
            const current = request.result as CopyDraft | undefined;
            // Tab khác có thể đã mở lượt mới. Kiểm tra ngay trong giao dịch ghi
            // để tab giữ lượt cũ không ghi đè bản chép mới.
            if (current && (current.bookRunId !== undefined || value.bookRunId !== undefined)
              && current.bookRunId !== value.bookRunId) {
              tx.abort();
              reject(new Error('copy_book_run_changed'));
              return;
            }
            try { checkExpectedDraft(current, expected, value); store.put(value, key); }
            catch (error) { tx.abort(); reject(error); }
          };
        } else store.put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = tx.onabort = () => reject(tx.error ?? new Error('storage_write_failed'));
      });
    },
  };
}

/** One transaction keeps the book manifest and every chapter together, including quota failures. */
export function createCopyBookRunStore(): CopyBookRunStore {
  if (Capacitor.isNativePlatform()) return getNativeStore().books;
  const open = createDatabaseConnection();
  return {
    async atomic<T>(keys: readonly string[], change: (values: ReadonlyMap<string, unknown>) => { writes: ReadonlyMap<string, unknown>; result: T }): Promise<T> {
      const db = await open();
      return new Promise<T>((resolve, reject) => {
        const tx = db.transaction('drafts', 'readwrite');
        const store = tx.objectStore('drafts');
        const values = new Map<string, unknown>();
        let result: T;
        let failed = false;
        const apply = () => {
          try {
            const changed = change(values);
            result = changed.result;
            for (const [key, value] of changed.writes) store.put(value, key);
          } catch (error) {
            failed = true;
            tx.abort();
            reject(error);
          }
        };
        tx.oncomplete = () => { if (!failed) resolve(result); };
        tx.onerror = tx.onabort = () => reject(tx.error ?? new Error('storage_write_failed'));
        const uniqueKeys = [...new Set(keys)];
        let remaining = uniqueKeys.length;
        if (!remaining) apply();
        for (const key of uniqueKeys) {
          const request = store.get(key);
          request.onsuccess = () => {
            if (request.result !== undefined) values.set(key, request.result);
            if (--remaining === 0) apply();
          };
        }
      });
    },
  };
}

interface NativeEnvelope { sequence: number; payload: string; checksum: string }
type NativeWrites = Array<[string, unknown]>;
let nativeStorage: ReturnType<typeof createNativeStorage> | undefined;
function getNativeStore() { return nativeStorage ??= createNativeStorage(); }

function createNativeStorage() {
  let queue: Promise<unknown> = Promise.resolve();
  let journalLoaded = false;
  let journalExists = false;
  let journalSequence = 0;
  let pending: NativeWrites = [];
  const journalPath = 'scripture-copying/book-transaction';
  const hash = async (value: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(byte => byte.toString(16).padStart(2, '0')).join('');
  const path = async (key: string) => `scripture-copying/${await hash(key)}`;
  const serialized = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = queue.catch(() => undefined).then(operation);
    queue = result;
    return result;
  };
  const missing = (error: unknown) => String((error as { code?: string })?.code) === 'OS-PLUG-FILE-0008'
    || /not exist|not found|ENOENT/i.test(String((error as Error)?.message));
  async function readEnvelope(base: string, valid: (value: unknown) => boolean): Promise<NativeEnvelope | null> {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
    const candidates: NativeEnvelope[] = [];
    let corrupt = false;
    const presentSlots: number[] = [];
    for (const slot of [0, 1]) {
      const file = `${base}.${slot}.json`;
      try { await Filesystem.stat({ path: file, directory: Directory.Data }); }
      catch (error) { if (missing(error)) continue; throw error; }
      presentSlots.push(slot);
      let raw: { data: string | Blob };
      try { raw = await Filesystem.readFile({ path: file, directory: Directory.Data, encoding: Encoding.UTF8 }); }
      catch (error) {
        // Lỗi bridge đọc journal không chứng minh commit hỏng; không lui về lượt cũ.
        if (base === journalPath) throw error;
        corrupt = true;
        continue;
      }
      try {
        const envelope = JSON.parse(String(raw.data)) as NativeEnvelope;
        if (!Number.isSafeInteger(envelope.sequence) || envelope.sequence < 0 || typeof envelope.payload !== 'string'
          || envelope.checksum !== await hash(envelope.payload) || !valid(JSON.parse(envelope.payload))) throw new Error('invalid');
        candidates.push(envelope);
      } catch { corrupt = true; }
    }
    candidates.sort((left, right) => right.sequence - left.sequence);
    if (!candidates.length && corrupt) {
      // Chỉ slot 0 có thể là bootstrap rỗng bị đứt; commit đầu luôn ở slot 1.
      if (base === journalPath && presentSlots.length === 1 && presentSlots[0] === 0) return null;
      throw new Error('invalid_local_draft');
    }
    return candidates[0] ?? null;
  }
  async function writeEnvelope(base: string, sequence: number, value: unknown, valid: (value: unknown) => boolean) {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
    const payload = JSON.stringify(value);
    const envelope: NativeEnvelope = { sequence, payload, checksum: await hash(payload) };
    let failure: unknown;
    try {
      await Filesystem.writeFile({ path: `${base}.${sequence % 2}.json`, directory: Directory.Data,
        encoding: Encoding.UTF8, recursive: true, data: JSON.stringify(envelope) });
    } catch (error) { failure = error; }
    // Bridge có thể báo lỗi sau khi đã ghi. Chỉ xác nhận khi đọc lại đúng commit.
    try {
      const stored = await readEnvelope(base, valid);
      if (stored?.sequence !== sequence || stored.payload !== payload) throw failure ?? new Error('storage_write_failed');
    } catch (error) {
      // Commit có thể đã bền vững dù chưa xác minh được; lần sau phải đọc lại journal.
      if (base === journalPath) journalLoaded = false;
      throw error;
    }
  }
  const validWrites = (value: unknown): value is NativeWrites => Array.isArray(value) && value.every(entry =>
    Array.isArray(entry) && entry.length === 2 && typeof entry[0] === 'string' && entry[1] !== undefined);
  async function loadJournal() {
    if (journalLoaded) return;
    const envelope = await readEnvelope(journalPath, validWrites);
    journalSequence = envelope?.sequence ?? 0;
    journalExists = envelope !== null;
    pending = envelope ? JSON.parse(envelope.payload) as NativeWrites : [];
    journalLoaded = true;
  }
  async function readRecord(key: string): Promise<unknown> {
    const overlay = pending.find(([storedKey]) => storedKey === key);
    if (overlay) return overlay[1];
    const envelope = await readEnvelope(await path(key), key.startsWith('tt_copy_v1:') ? validDraft : () => true);
    return envelope ? JSON.parse(envelope.payload) as unknown : undefined;
  }
  async function writeRecord(key: string, value: unknown) {
    const base = await path(key);
    const envelope = await readEnvelope(base, () => true);
    await writeEnvelope(base, (envelope?.sequence ?? 0) + 1, value, () => true);
  }
  async function checkpoint() {
    if (!pending.length) return;
    // Replay lặp lại an toàn; không xóa journal trước khi mọi bản chép đã bền vững.
    for (const [key, value] of pending) await writeRecord(key, value);
    await writeEnvelope(journalPath, journalSequence + 1, [], validWrites);
    journalSequence++;
    pending = [];
  }
  const drafts: CopyStore = {
    read(key) { return serialized(async () => {
      await loadJournal();
      const value = await readRecord(key);
      if (value === undefined) return null;
      if (!validDraft(value)) throw new Error('invalid_local_draft');
      return value;
    }); },
    write(key, value, expected) { return serialized(async () => {
      await loadJournal();
      await checkpoint();
      if (key.startsWith('tt_copy_v1:') && !key.includes(':run:')) {
        const current = await readRecord(key) as CopyDraft | undefined;
        if (current && (current.bookRunId !== undefined || value.bookRunId !== undefined)
          && current.bookRunId !== value.bookRunId) throw new Error('copy_book_run_changed');
        checkExpectedDraft(current, expected, value);
      }
      await writeRecord(key, value);
    }); },
  };
  const books: CopyBookRunStore = {
    atomic<T>(keys: readonly string[], change: (values: ReadonlyMap<string, unknown>) => { writes: ReadonlyMap<string, unknown>; result: T }): Promise<T> {
      return serialized(async () => {
        await loadJournal();
        await checkpoint();
        const values = new Map<string, unknown>();
        for (const key of new Set(keys)) {
          const value = await readRecord(key);
          if (value !== undefined) values.set(key, value);
        }
        const changed = change(values);
        if (!changed.writes.size) return changed.result;
        const next = JSON.parse(JSON.stringify([...changed.writes])) as NativeWrites;
        // Giữ một commit rỗng hợp lệ để lần ghi journal đầu bị đứt vẫn có bản lui.
        if (!journalExists) {
          await writeEnvelope(journalPath, 0, [], validWrites);
          journalExists = true;
        }
        await writeEnvelope(journalPath, journalSequence + 1, next, validWrites);
        journalSequence++;
        pending = next;
        try { await checkpoint(); }
        catch {
          // Journal đã commit là nguồn thật; đọc dùng overlay và lần ghi sau phục hồi.
        }
        return changed.result;
      });
    },
  };
  return { drafts, books };
}
