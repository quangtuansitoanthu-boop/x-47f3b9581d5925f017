import { describe, expect, it } from 'vitest';
import { createPrivateReadingPrincipalGuard } from '$lib/browser/private-reading-principal-lifecycle';
import { resolvePdfStoragePrincipal } from '$lib/components/reader/PdfCanvasReader.svelte';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

const session = (userId: string | null) => userId
  ? { authenticated: true, csrfToken: `csrf-${userId}`, user: { id: userId } }
  : { authenticated: false, csrfToken: null, user: null };

describe('private reading principal lifecycle', () => {
  it('invalidates deferred A and failing B work before either can restore private state', async () => {
    const guard = createPrivateReadingPrincipalGuard(session('user-a'));
    const a = deferred<string[]>();
    const b = deferred<string[]>();
    let visible = ['A private note'];
    let error = '';

    const apply = async (request: Promise<string[]>, token: ReturnType<typeof guard.capture>) => {
      try {
        const rows = await request;
        if (guard.isCurrent(token)) visible = rows;
      } catch {
        if (guard.isCurrent(token)) error = 'load failed';
      }
    };

    const pendingA = apply(a.promise, guard.capture());
    expect(guard.transition(session('user-b'))).toBe(true);
    visible = [];
    const pendingB = apply(b.promise, guard.capture());
    expect(guard.transition(session(null))).toBe(true);
    visible = [];
    error = '';

    b.reject(new Error('B failed'));
    a.resolve(['late A private note']);
    await Promise.all([pendingA, pendingB]);

    expect(visible).toEqual([]);
    expect(error).toBe('');
  });

  it('keeps a request current across credential refreshes for the same principal', () => {
    const guard = createPrivateReadingPrincipalGuard(session('user-a'));
    const token = guard.capture();

    expect(guard.transition({ authenticated: true, csrfToken: 'rotated', user: { id: 'user-a' } })).toBe(false);
    expect(guard.isCurrent(token)).toBe(true);
  });

  it('blocks an interim B scroll until B progress resolves and ignores late A progress', async () => {
    const guard = createPrivateReadingPrincipalGuard(session('user-a'));
    const a = deferred<{ page: number; revision: number }>();
    const b = deferred<{ page: number; revision: number }>();
    let page = 12;
    let revision = 9;
    let ready = true;
    const writes: Array<{ page: number; revision: number }> = [];
    const schedule = () => { if (ready) writes.push({ page, revision }); };
    const apply = async (request: Promise<{ page: number; revision: number }>, token: ReturnType<typeof guard.capture>) => {
      const progress = await request;
      if (!guard.isCurrent(token)) return;
      page = progress.page;
      revision = progress.revision;
      ready = true;
    };

    const pendingA = apply(a.promise, guard.capture());
    guard.transition(session('user-b'));
    ready = false;
    page = 1;
    revision = 0;
    const pendingB = apply(b.promise, guard.capture());

    page = 3;
    schedule();
    a.resolve({ page: 12, revision: 9 });
    b.resolve({ page: 7, revision: 2 });
    await Promise.all([pendingA, pendingB]);
    schedule();

    expect(writes).toEqual([{ page: 7, revision: 2 }]);
  });

  it('does not restore A storage after the PDF startup session lookup loses an A to B race', async () => {
    const guard = createPrivateReadingPrincipalGuard(session('user-a'));
    const lookup = deferred<ReturnType<typeof session>>();
    const token = guard.capture();
    let storagePrincipal = 'user-a';
    const pending = resolvePdfStoragePrincipal(
      () => lookup.promise,
      () => guard.isCurrent(token),
    ).then((principal) => {
      if (principal !== null) storagePrincipal = principal;
    });

    expect(guard.transition(session('user-b'))).toBe(true);
    storagePrincipal = 'user-b';
    lookup.resolve(session('user-a'));
    await pending;

    expect(storagePrincipal).toBe('user-b');
  });

  it('uses the anonymous namespace instead of a remembered account on a cold offline reload', async () => {
    await expect(resolvePdfStoragePrincipal(
      async () => null,
      () => true,
    )).resolves.toBe('anonymous');
  });

  it('does not clear B offline UI when a deferred A removal finishes after the account switch', async () => {
    const guard = createPrivateReadingPrincipalGuard(session('user-a'));
    const removal = deferred<void>();
    let storagePrincipal = 'user-a';
    let offlineGeneration = 0;
    let visibleOfflineOwner: string | null = 'user-a';
    let notice = '';
    const principalToken = guard.capture();
    const expectedPrincipal = storagePrincipal;
    const generation = ++offlineGeneration;
    const pending = removal.promise.then(() => {
      const current = generation === offlineGeneration
        && storagePrincipal === expectedPrincipal
        && guard.isCurrent(principalToken);
      if (!current) return;
      visibleOfflineOwner = null;
      notice = 'Đã xóa bản ngoại tuyến';
    });

    expect(guard.transition(session('user-b'))).toBe(true);
    storagePrincipal = 'user-b';
    offlineGeneration += 1;
    visibleOfflineOwner = 'user-b';
    removal.resolve();
    await pending;

    expect(visibleOfflineOwner).toBe('user-b');
    expect(notice).toBe('');
  });
});
