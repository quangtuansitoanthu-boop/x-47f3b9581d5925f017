import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

const route = readFileSync('src/routes/tu-tap/+page.svelte', 'utf8');
const script = route.slice(route.indexOf('>') + 1, route.indexOf('</script>'));
const ast = ts.createSourceFile('practice.ts', script, ts.ScriptTarget.Latest, true);
const owner = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'preloadChapter');
if (!owner) throw new Error('Missing route chapter prefetch owner');
const source = ts.transpileModule(owner.getText(ast), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

function harness(fetcher: (url: string) => Promise<Response>, locale = 'vi',
  offline: (url: string) => Promise<Response | null> = async () => null) {
  return runInNewContext(`
    let currentArticle={id:'a',title:'A'}, chapters=[{title:'First'},{title:'Next'}], loadedChapters={};
    let articleRequestSequence=1, chapterRequestSequence=1;
    const localeStore={current:initialLocale};
    ${source}
    ({ preload:preloadChapter, cached(){return loadedChapters[1]},
       changeLocale(locale){localeStore.current=locale;loadedChapters={};chapterRequestSequence++},
       reopenSameArticle(){currentArticle=null;loadedChapters={};articleRequestSequence++;chapterRequestSequence++;
         currentArticle={id:'b',title:'B'};articleRequestSequence++;
         currentArticle={id:'a',title:'A'};articleRequestSequence++;chapterRequestSequence++} });
  `, { initialLocale: locale, fetchWithSessionRefresh: fetcher, resolveOfflineBundledResponse: offline }) as {
    preload: (index: number) => Promise<void>;
    cached: () => { content: string } | undefined;
    changeLocale: (locale: string) => void;
    reopenSameArticle: () => void;
  };
}

const chapter = (content: string) => Response.json([{ noi_dung: content, tieu_de: 'Next', so_thu_tu: 1 }]);

describe('actual route chapter prefetch context', () => {
  it('discards a slow Vietnamese response after the same article changes to English', async () => {
    const pending = deferred<Response>();
    const fetcher = vi.fn(() => pending.promise);
    const h = harness(fetcher);
    const work = h.preload(1);
    h.changeLocale('en');
    pending.resolve(chapter('Old Vietnamese'));
    await work;
    expect(h.cached()).toBeUndefined();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each(['network', 'offline'] as const)('discards a slow %s prefetch after A closes, B opens and A reopens', async boundary => {
    const pending = deferred<Response>();
    const fetcher = vi.fn(() => pending.promise);
    const offline = vi.fn(() => pending.promise);
    const h = harness(fetcher, boundary === 'offline' ? 'en' : 'vi', offline);
    const work = h.preload(1);
    h.reopenSameArticle();
    pending.resolve(chapter('Old article lifecycle'));
    await work;
    expect(h.cached()).toBeUndefined();
    expect(boundary === 'offline' ? offline : fetcher).toHaveBeenCalledTimes(1);
    if (boundary === 'offline') expect(fetcher).not.toHaveBeenCalled();
  });

  it('keeps a valid network prefetch and avoids another GET once cached', async () => {
    const fetcher = vi.fn(async () => chapter('Current text'));
    const h = harness(fetcher);
    await h.preload(1);
    await h.preload(1);
    expect(h.cached()?.content).toBe('Current text');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('keeps a valid English offline prefetch without issuing a network GET', async () => {
    const fetcher = vi.fn(async () => chapter('Unexpected network'));
    const offline = vi.fn(async () => chapter('Current English'));
    const h = harness(fetcher, 'en', offline);
    await h.preload(1);
    await h.preload(1);
    expect(h.cached()?.content).toBe('Current English');
    expect(offline).toHaveBeenCalledTimes(1);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
