import { beforeEach, expect, it, vi } from 'vitest';
import type { CopyDraft } from '../../../src/lib/browser/scripture-copying-workspace';

const disk = vi.hoisted(() => ({ files: new Map<string, string>(), fail: (_path: string, _data: string): 'before' | 'after' | 'torn' | undefined => undefined as 'before' | 'after' | 'torn' | undefined,
  readFailure: (_path: string, _operation: 'stat' | 'read') => false }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }));
vi.mock('@capacitor/filesystem', () => ({
  Directory: { Data: 'DATA' }, Encoding: { UTF8: 'utf8' },
  Filesystem: {
    stat: vi.fn(async ({ path }: { path: string }) => {
      if (disk.readFailure(path, 'stat')) throw new Error('verification_unavailable');
      if (!disk.files.has(path)) throw Object.assign(new Error('not found'), { code: 'OS-PLUG-FILE-0008' });
      return { type: 'file', size: disk.files.get(path)!.length, ctime: 0, mtime: 0, uri: path };
    }),
    readFile: vi.fn(async ({ path }: { path: string }) => {
      if (disk.readFailure(path, 'read')) throw new Error('verification_unavailable');
      return { data: disk.files.get(path)! };
    }),
    writeFile: vi.fn(async ({ path, data }: { path: string; data: string }) => {
      const failure = disk.fail(path, data);
      if (failure === 'before') throw new Error('disk_full');
      disk.files.set(path, failure === 'torn' ? data.slice(0, 13) : data);
      if (failure === 'after') throw new Error('bridge_lost');
      return { uri: path };
    }),
  },
}));
const keyA = 'tt_copy_v1:guest:dia-tang:v1:1';
const keyB = 'tt_copy_v1:guest:dia-tang:v1:2';
const manifest = 'tt_copy_book_v1:guest:dia-tang:v1';
const draft = (run = 'old', text = 'Bản chép'): CopyDraft => ({ runId: run, bookRunId: run, sutraId: 'dia-tang', chapter: 1, sourceVersion: 'v1', texts: [text], savedTexts: [''], revision: 0, savedAt: null, pending: null, block: 0 });
const digest = async (value: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(byte => byte.toString(16).padStart(2, '0')).join('');
async function seed(key: string, value: unknown, sequence = 1) {
  const payload = JSON.stringify(value);
  disk.files.set(`scripture-copying/${await digest(key)}.${sequence % 2}.json`, JSON.stringify({ sequence, payload, checksum: await digest(payload) }));
}
const load = () => import('../../../src/lib/browser/scripture-copying-storage');
beforeEach(() => { vi.resetModules(); disk.files.clear(); disk.fail = () => undefined; disk.readFailure = () => false; });

it('reads existing native files and falls back from a torn newer slot without changing old paths', async () => {
  await seed(keyA, draft());
  disk.files.set(`scripture-copying/${await digest(keyA)}.0.json`, '{torn');
  const { createCopyStore } = await load();
  expect(await createCopyStore().read(keyA)).toEqual(draft());
  expect(disk.files.size).toBe(2);
});

it('rejects a torn commit before publishing any chapter or manifest changes', async () => {
  await seed(keyA, draft());
  const before = new Map(disk.files);
  disk.fail = (path, data) => path.includes('book-transaction') && JSON.parse(data).sequence === 1 ? 'torn' : undefined;
  const { createCopyBookRunStore, createCopyStore } = await load();
  await expect(createCopyBookRunStore().atomic([keyA], () => ({ writes: new Map([[keyA, draft('new', '')]]), result: 'new' }))).rejects.toThrow();
  for (const [path, data] of before) expect(disk.files.get(path)).toBe(data);
  expect(await createCopyStore().read(keyA)).toEqual(draft());
  vi.resetModules();
  expect(await (await load()).createCopyStore().read(keyA)).toEqual(draft());
});

it('preserves all old records when quota prevents the journal commit', async () => {
  await seed(keyA, draft());
  const before = new Map(disk.files);
  disk.fail = () => 'before';
  const { createCopyBookRunStore, createCopyStore } = await load();
  await expect(createCopyBookRunStore().atomic([keyA], () => ({ writes: new Map([[keyA, draft('new', '')]]), result: 'new' }))).rejects.toThrow('disk_full');
  expect(disk.files).toEqual(before);
  expect(await createCopyStore().read(keyA)).toEqual(draft());
});

it('keeps legacy drafts readable after the initial empty journal bootstrap tears and the app reloads', async () => {
  await seed(keyA, draft());
  disk.fail = path => path.includes('book-transaction') ? 'torn' : undefined;
  const storage = await load();
  await expect(storage.createCopyBookRunStore().atomic([keyA], () => ({ writes: new Map([[keyA, draft('new', '')]]), result: null }))).rejects.toThrow();
  vi.resetModules();
  expect(await (await load()).createCopyStore().read(keyA)).toEqual(draft());
});

it('reads every committed record after an interrupted checkpoint and recovers across reload', async () => {
  await seed(keyA, draft()); await seed(keyB, draft());
  const baseB = await digest(keyB);
  disk.fail = path => path.includes(baseB) ? 'before' : undefined;
  let storage = await load();
  const writes = new Map<string, unknown>([[keyA, draft('new', '')], [keyB, draft('new', '')], [manifest, { runId: 'new', previousRuns: ['old'] }]]);
  expect(await storage.createCopyBookRunStore().atomic([keyA, keyB, manifest], () => ({ writes, result: 'new' }))).toBe('new');
  expect(await storage.createCopyStore().read(keyA)).toEqual(draft('new', ''));
  expect(await storage.createCopyStore().read(keyB)).toEqual(draft('new', ''));
  vi.resetModules(); storage = await load();
  expect(await storage.createCopyStore().read(keyB)).toEqual(draft('new', ''));
  disk.fail = () => undefined;
  expect(await storage.createCopyBookRunStore().atomic([manifest], values => ({ writes: new Map(), result: values.get(manifest) }))).toEqual({ runId: 'new', previousRuns: ['old'] });
  vi.resetModules(); storage = await load();
  expect(await storage.createCopyStore().read(keyB)).toEqual(draft('new', ''));
});

it('retains the journal if clearing it fails and rejects a new mutation until recovery succeeds', async () => {
  await seed(keyA, draft());
  disk.fail = (path, data) => path.includes('book-transaction') && JSON.parse(data).sequence > 0 && JSON.parse(data).payload === '[]' ? 'before' : undefined;
  const storage = await load();
  await storage.createCopyBookRunStore().atomic([keyA], () => ({ writes: new Map([[keyA, draft('new', '')]]), result: null }));
  await expect(storage.createCopyStore().write(keyA, draft('new', 'Tiếp tục'))).rejects.toThrow('disk_full');
  expect(await storage.createCopyStore().read(keyA)).toEqual(draft('new', ''));
  disk.fail = () => undefined;
  await storage.createCopyStore().write(keyA, draft('new', 'Tiếp tục'));
  expect(await storage.createCopyStore().read(keyA)).toEqual(draft('new', 'Tiếp tục'));
});

it('acknowledges a fully durable write even when the bridge reports an uncertain failure', async () => {
  disk.fail = () => 'after';
  const storage = await load();
  await storage.createCopyStore().write(keyA, draft());
  expect(await storage.createCopyStore().read(keyA)).toEqual(draft());
});

it('shares serialization and stale-run guards across factory instances', async () => {
  await seed(keyA, draft());
  const storage = await load();
  const first = storage.createCopyStore(); const second = storage.createCopyStore();
  const transition = storage.createCopyBookRunStore().atomic([keyA], () => ({ writes: new Map([[keyA, draft('new', '')]]), result: null }));
  const stale = expect(second.write(keyA, draft())).rejects.toThrow('copy_book_run_changed');
  await transition; await stale;
  expect(await first.read(keyA)).toEqual(draft('new', ''));
  await first.write(`${keyA}:run:old`, draft());
  expect(await second.read(`${keyA}:run:old`)).toEqual(draft());
});

it.each(['stat', 'read'] as const)('reloads an uncertain committed journal after %s verification fails before accepting another edit', async operation => {
  await seed(keyA, draft());
  const storage = await load();
  let verificationBlocked = false;
  disk.fail = (path, data) => {
    if (path.includes('book-transaction') && JSON.parse(data).sequence === 1) verificationBlocked = true;
    return undefined;
  };
  disk.readFailure = (path, kind) => verificationBlocked && path.endsWith('book-transaction.1.json') && kind === operation;
  await expect(storage.createCopyBookRunStore().atomic([keyA], () => ({ writes: new Map([[keyA, draft('new', '')]]), result: null }))).rejects.toThrow();
  const committedJournal = disk.files.get('scripture-copying/book-transaction.1.json');
  await expect(storage.createCopyStore().write(keyA, draft('old', 'Must not overwrite'))).rejects.toThrow();
  expect(disk.files.get('scripture-copying/book-transaction.1.json')).toBe(committedJournal);
  verificationBlocked = false;
  await expect(storage.createCopyStore().write(keyA, draft('old', 'Must not overwrite'))).rejects.toThrow('copy_book_run_changed');
  expect(await storage.createCopyStore().read(keyA)).toEqual(draft('new', ''));
  vi.resetModules();
  expect(await (await load()).createCopyStore().read(keyA)).toEqual(draft('new', ''));
});

it('never exposes one principal journal records to another principal', async () => {
  const storage = await load();
  disk.fail = path => path.includes('book-transaction') ? undefined : 'before';
  await storage.createCopyBookRunStore().atomic([keyA], () => ({ writes: new Map([[keyA, draft()]]), result: null }));
  expect(await storage.createCopyStore().read(keyA.replace('guest', 'account%3AB'))).toBeNull();
  expect(await storage.createCopyStore().read(keyA)).toEqual(draft());
});

it('compares native writes against the caller receipt even after another consumer rereads the draft', async () => {
  await seed(keyA, draft());
  const storage = await load();
  const first = storage.createCopyStore(), second = storage.createCopyStore();
  const receipt = (await second.read(keyA))!;
  const latest = draft('old', 'Nội dung mới của A');
  await first.write(keyA, latest, receipt);
  expect(await second.read(keyA)).toEqual(latest);
  await expect(second.write(keyA, { ...receipt, block: 1 }, receipt)).rejects.toThrow('copy_draft_changed');
  expect(await first.read(keyA)).toEqual(latest);
  // An uncertain write may already match the requested content on disk.
  await second.write(keyA, latest, receipt);
  expect(await second.read(keyA)).toEqual(latest);
});
