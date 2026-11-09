import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const route = readFileSync('src/routes/tu-tap/+page.svelte', 'utf8');
const script = route.slice(route.indexOf('>') + 1, route.indexOf('</script>'));
const ast = ts.createSourceFile('practice.ts', script, ts.ScriptTarget.Latest, true);
const names = new Set(['openArticle', 'finishAdminChange', 'settlePracticeBeforePrincipalSwitch', 'mapArticleDetail', 'initialPracticeCacheReceipt']);
const source = ts.transpileModule(ast.statements
  .filter(node => ts.isFunctionDeclaration(node) && names.has(node.name?.text ?? ''))
  .map(node => node.getText(ast)).join('\n'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

interface Harness {
  open: (article: { id: string; title: string }) => Promise<void>;
  changed: () => void;
  switchPrincipal: () => void;
  setEditor: (id: string) => void;
  content: () => string;
  cached: (id: string) => boolean;
  receipt: (id: string, identity: string) => unknown;
}

function harness(fetcher: (url: string) => Promise<Response>): Harness {
  // Chạy owner cache của route, chỉ thay các ranh giới I/O và UI không thuộc ca kiểm tra.
  return runInNewContext(`
    let articleRequestSequence=0, chapterRequestSequence=0, adminEditorSequence=0, adminEditorController=null;
    let lastRequestedArticle=null, failedChapterIndex=null, articleLoadError='', editingArticle=null, adminNotice='';
    let currentArticle=null, chapters=[], loadedChapters={}, currentChapterIndex=null, practicePositionReady=false;
    let screen='catalog', readerProgress={load:async()=>null}, confirmation=null, pendingPracticeBookmark=null;
    const articleDetailCache=new Map();
    ${source}
    ({receipt:typeof initialPracticeCacheReceipt === "function" ? initialPracticeCacheReceipt : () => undefined, open:openArticle, changed:finishAdminChange, switchPrincipal:settlePracticeBeforePrincipalSwitch,
      setEditor(id){editingArticle={id}}, content(){return currentArticle?.content??''}, cached(id){return articleDetailCache.has(id)}});
  `, {
    fetchWithSessionRefresh: fetcher, resolveOfflineBundledResponse: async () => null,
    localeStore: { current: 'vi' }, normalizePracticeCategory: () => 'KINH PHẬT', resolveMediaUrl: (value: string) => value,
    settleActivePracticeProducers() {}, cleanupPracticeResources() {}, closeGuidedMeditation() {},
    stopRhythm() {}, endRoutine() {},
    finishRosaryEvidence() {}, finishScriptureEvidence() {}, reportPracticeEvidenceFailure() {},
    stopModelChant() {}, dismissCatalogOverlays() {}, loadBundledPracticeMantra: async () => null, deleteArticleMutation: { reset() {} },
  }) as Harness;
}

describe('practice article detail cache lifecycle', () => {
  it.each([
    ['member:user', 'member:user', 'member:user', true],
    ['admin:admin', 'admin:admin', 'admin:admin', true],
    [null, null, 'member:user', false],
    ['member:user', null, 'member:user', false],
    ['member:user', 'other:user', 'member:user', false],
    ['member:user', 'member:user', 'other:user', false],
    ['member:user', 'member:user', 'member:admin', false],
  ])('requires matching detail and chapter receipts (%s/%s/%s)', async (detailIdentity, chapterIdentity, nextIdentity, reusable) => {
    let requests = 0;
    const h = harness(async url => {
      requests++;
      const identity = url.includes('/tap_noi_dung?') ? chapterIdentity : detailIdentity;
      return Response.json(url.includes('/tap_noi_dung?')
        ? [{ tieu_de: 'Chapter', tom_tat: 'Preview' }]
        : [{ id: 'a', noi_dung: 'Content', has_muc_luc: 1 }],
        { headers: typeof identity === 'string' ? { 'X-Practice-Content-Identity': identity } : {} });
    });
    await h.open({ id: 'a', title: 'A' });
    expect(Boolean(h.receipt('a', String(nextIdentity)))).toBe(reusable);
    expect(requests).toBe(2);
  });
  it.each([true, false])('starts with the trusted root session (authenticated=%s)', authenticated => {
    const declaration = ast.statements.find(node => ts.isVariableStatement(node)
      && node.declarationList.declarations.some(value => ts.isIdentifier(value.name) && value.name.text === 'syncSession'));
    const initializer = ts.transpileModule(declaration!.getText(ast), {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const guest = { authenticated: false, csrfToken: null, user: null };
    const initial = authenticated
      ? { authenticated: true, csrfToken: 'memory-only', user: { id: 'known-member', role: 'user' } }
      : guest;
    const result = runInNewContext(`${initializer}\nsyncSession;`, {
      $state: <T>(value: T) => value, untrack: <T>(read: () => T) => read(),
      guestSession: guest, sessionStore: { value: initial },
    });
    expect(result).toEqual(initial);
  });
  it('reloads changed content once after editing and keeps other warm entries', async () => {
    let content = 'old';
    const requests: string[] = [];
    const h = harness(async url => {
      requests.push(url);
      const id = new URL(`https://local.test${url}`).searchParams.get('id')!.replace('eq.', '');
      return Response.json([{ id, tieu_de: id, noi_dung: content, has_muc_luc: 0 }]);
    });
    await h.open({ id: 'a', title: 'A' });
    await h.open({ id: 'b', title: 'B' });
    await h.open({ id: 'a', title: 'A' });
    expect(requests).toHaveLength(2);
    content = 'updated';
    h.setEditor('a');
    h.changed();
    await h.open({ id: 'a', title: 'A' });
    expect(h.content()).toBe('updated');
    expect(requests).toHaveLength(3);
    await h.open({ id: 'b', title: 'B' });
    expect(requests).toHaveLength(3);
  });

  it.each(['principal change', 'content save'])('does not repopulate the cache when an old chapter response arrives after %s', async (transition) => {
    let resolveChapter!: (response: Response) => void;
    let chapterRequested!: () => void;
    const requested = new Promise<void>(resolve => chapterRequested = resolve);
    let switched = false;
    let detailRequests = 0;
    const h = harness(async url => {
      if (url.includes('/tap_noi_dung?')) {
        chapterRequested();
        return new Promise<Response>(resolve => resolveChapter = resolve);
      }
      detailRequests++;
      return Response.json([{ id: 'a', tieu_de: 'A', noi_dung: switched ? 'new principal' : 'old principal', has_muc_luc: switched ? 0 : 1 }]);
    });
    const old = h.open({ id: 'a', title: 'A' });
    await requested;
    if (transition === 'principal change') h.switchPrincipal();
    else { h.setEditor('a'); h.changed(); }
    switched = true;
    resolveChapter(Response.json([{ tieu_de: 'Old chapter' }]));
    await old;
    expect(h.cached('a')).toBe(false);
    await h.open({ id: 'a', title: 'A' });
    expect(h.content()).toBe('new principal');
    expect(detailRequests).toBe(2);
  });

  it('clears already warm details when the principal changes', async () => {
    const h = harness(async () => Response.json([{ id: 'a', noi_dung: 'old principal', has_muc_luc: 0 }]));
    await h.open({ id: 'a', title: 'A' });
    expect(h.cached('a')).toBe(true);
    h.switchPrincipal();
    expect(h.cached('a')).toBe(false);
  });
});
