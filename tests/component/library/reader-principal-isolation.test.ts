import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import { createSessionContentGuard } from '$lib/browser/session-content-guard';

const read = (path: string) => readFileSync(path, 'utf8');

function sessionHandler(source: string): string {
  const start = Math.max(source.indexOf('const sessionChanged'), source.indexOf('const updateSession'));
  expect(start).toBeGreaterThan(0);
  return source.slice(start, source.indexOf("window.addEventListener(SESSION_CHANGE_EVENT", start));
}

describe('private reader principal isolation', () => {
  it.each(['success', 'failure'] as const)('does not publish an old PDF badge read after switching principal (%s)', async outcome => {
    const source = read('src/routes/kinh-sach/+page.svelte');
    const start = source.indexOf('let downloadedPdfGeneration = 0;');
    const end = source.indexOf('\n  $effect', start);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const session = (id: string) => ({ authenticated: true, user: { id, role: 'user' } });
    const guard = createSessionContentGuard(session('A'));
    let finishA!: (records: { documentId: string }[]) => void;
    let rejectA!: (cause: Error) => void;
    const oldRead = new Promise<{ documentId: string }[]>((resolve, reject) => { finishA = resolve; rejectA = reject; });
    const readDownloads = (principal: string) => principal === 'A' ? oldRead : Promise.resolve([{ documentId: 'only-B' }]);
    // Execute the actual route function with a deferred local-storage read,
    // so this exercises the stale-success and stale-error branches without a DOM mock.
    const create = new Function('readDownloads', 'contentGuard', `
      let effectivePrincipal = 'A';
      let downloadedPdfIds = new Set();
      const listOfflinePdfs = readDownloads, listOfflinePdfMetadata = readDownloads;
      ${ts.transpile(source.slice(start, end), { target: ts.ScriptTarget.ES2022 })}
      return { refresh: refreshDownloadedPdfs, setPrincipal(value) { effectivePrincipal = value; }, ids() { return [...downloadedPdfIds]; } };
    `) as (reader: typeof readDownloads, tokenGuard: typeof guard) => { refresh(): Promise<void>; setPrincipal(id: string): void; ids(): string[] };
    const state = create(readDownloads, guard);
    const stale = state.refresh();
    guard.transition(session('B'));
    state.setPrincipal('B');
    await state.refresh();
    expect(state.ids()).toEqual(['only-B']);
    if (outcome === 'success') finishA([{ documentId: 'private-A' }]);
    else rejectA(new Error('Old principal storage read failed'));
    await stale;
    expect(state.ids()).toEqual(['only-B']);
  });

  it.each([
    ['inline annotations', 'src/lib/components/reader/ReadingAnnotations.svelte'],
    ['PDF annotations', 'src/lib/components/reader/PdfAnnotations.svelte'],
    ['My Quotes', 'src/routes/trich-dan-cua-toi/+page.svelte'],
  ])('clears %s before installing and loading another principal', (_label, path) => {
    const source = read(path);
    const handler = sessionHandler(source);
    expect(source).toContain('createPrivateReadingPrincipalGuard');
    expect(source).toContain('principalGuard.isCurrent(principalToken)');
    expect(source).toContain('function clearPrivateState');
    expect(handler).toContain('principalGuard.transition(next)');
    expect(handler.indexOf('clearPrivateState()')).toBeLessThan(handler.indexOf('client?.setSession(next)'));
  });

  it('blocks stale reader resumes and scroll writes until the new principal load settles', () => {
    const source = read('src/lib/components/library/ReaderBoundary.svelte');
    const handler = sessionHandler(source);
    expect(source).toContain('createPrivateReadingPrincipalGuard');
    expect(source).toContain('let progressReadyForPrincipal=false');
    expect(source).toContain('if(!progressReadyForPrincipal)return;');
    expect(handler).toContain('const principalChanged=principalGuard.transition(nextSession);');
    expect(handler.indexOf('resetPrivateReadingState()')).toBeLessThan(handler.indexOf('readingClient?.setSession(activitySession)'));
    expect(source).toMatch(/const progress=await readingClient\.getProgress[\s\S]*?principalGuard\.isCurrent\(principalToken\)/);
    expect(source).toContain('if(generation===articleGeneration)progressReadyForPrincipal=true;');
  });

  it('resets PDF page progress before installing another principal and fences the deferred resume', () => {
    const source = read('src/lib/components/reader/PdfCanvasReader.svelte');
    const handler = source.slice(
      source.indexOf('const handleSessionChange'),
      source.indexOf("window.addEventListener('resize'"),
    );
    const reset = source.slice(
      source.indexOf('function resetPrivatePdfState'),
      source.indexOf('function applyPrivatePdfResume'),
    );
    expect(source).toContain('createPrivateReadingPrincipalGuard');
    expect(source).toContain('if (!progressReadyForPrincipal || !readingClient || !pageCount) return;');
    expect(source).toMatch(/const progress = await readingClient\.getProgress[\s\S]*?!principalGuard\.isCurrent\(principalToken\)/);
    expect(reset).toContain('progressWriter.cancel()');
    expect(reset).toContain('clearTimeout(scrollSaveTimer)');
    expect(reset).toContain('progressRevision = 0');
    expect(reset).toContain('currentPage = 1');
    expect(reset).toContain('latestScrollY = 0');
    expect(handler.indexOf('resetPrivatePdfState()')).toBeLessThan(handler.indexOf('readingClient?.setSession(detail)'));
    expect(source).toContain('if (!principalGuard.isCurrent(principalToken) || !pageCount) return;');
    expect(source).toContain('const nextPrincipal = await resolvePdfStoragePrincipal(');
    expect(source).toContain('() => getBrowserSession()');
    expect(source).not.toContain('rememberedOfflinePrincipal');
    expect(source).toContain('if (nextPrincipal === null || !principalGuard.isCurrent(principalToken)) return null;');
    expect(source).toContain('storagePrincipal === expectedPrincipal');
    expect(source).toContain('const expectedPrincipal = storagePrincipal;');
    expect(source).toContain('principalGuard.isCurrent(principalToken)');
    expect(source).toContain('principalId: expectedPrincipal');
    expect(source).toContain('stored.ownerId === storagePrincipal');
  });

  it('shows an actionable error when the lossless reading outbox is full', () => {
    const inline = read('src/lib/components/reader/ReadingAnnotations.svelte');
    const pdf = read('src/lib/components/reader/PdfAnnotations.svelte');
    const quotes = read('src/routes/trich-dan-cua-toi/+page.svelte');
    for (const source of [inline, pdf, quotes]) {
      expect(source).toContain('isReadingActivityCapacityError');
      expect(source).toContain('Hàng đợi đọc ngoại tuyến đã đầy');
    }
  });

  it('keeps text and PDF orphan reconciliation behind the same capacity-safe boundary', () => {
    const inline = read('src/lib/components/reader/ReadingAnnotations.svelte');
    const pdf = read('src/lib/components/reader/PdfAnnotations.svelte');
    const boundary = read('src/lib/components/reader/orphan-annotation-reconciliation.ts');
    for (const source of [inline, pdf]) {
      expect(source).toContain('enqueueOrphanAnnotationReconciliation');
      expect(source).toContain('if (!reconciliation.queued)');
    }
    expect(boundary).toContain('isReadingActivityCapacityError');
    expect(boundary).toContain('Hàng đợi đọc ngoại tuyến đã đầy');
  });

  it('hides account A practice data and actions before reloading account B SSR state', () => {
    const source = read('src/lib/components/practice/community/PracticeProgressDashboard.svelte');
    const handler = sessionHandler(source);
    expect(source).toContain('let privateVisible = $state(true);');
    expect(source).toContain('{#if privateVisible}');
    expect(source).toContain('if (!privateVisible || profileMutation.isPending) return;');
    expect(source).toContain('if (!privateVisible || membershipMutation.isPending) return;');
    expect(handler).toContain('session.authenticated && session.user?.id === user.id');
    expect(handler.indexOf('privateVisible = false')).toBeLessThan(handler.indexOf('queryClient.removeQueries'));
    expect(handler.indexOf('queryClient.removeQueries')).toBeLessThan(handler.indexOf('globalThis.location.reload()'));
    expect(handler).toContain('serverStateKeys.practiceCommunity.campaigns(user.id)');
  });

  it('scrubs the homepage reader and privileged tools before accepting another session', () => {
    const source = read('src/routes/+page.svelte');
    const handler = source.slice(
      source.indexOf('const applyHomepageSession'),
      source.indexOf('const onPopState'),
    );
    expect(source).toContain('createSessionContentGuard');
    expect(source).toContain('contentGuard.isCurrent(token)');
    expect(source).toContain('contentGuard.transition(next)');
    expect(handler).toContain('singleArticleRequest += 1');
    expect(handler).toContain('editingArticle = null');
    expect(handler).toContain('importJsonOpen = false');
    expect(handler).toContain('adminNotice = \'\'');
    expect(handler).toContain('closeArticle()');
    expect(source).toContain('window.addEventListener(SESSION_CHANGE_EVENT, applyHomepageSession)');
  });
});
