import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

const route = readFileSync('src/routes/tu-tap/+page.svelte', 'utf8');
const script = route.slice(route.indexOf('>') + 1, route.indexOf('</script>'));
const ast = ts.createSourceFile('practice.ts', script, ts.ScriptTarget.Latest, true);
const declaration = ast.statements.find(node => ts.isFunctionDeclaration(node)
  && node.name?.text === 'completeAutomaticRosary');
if (!declaration) throw new Error('automatic_rosary_completion_owner_missing');
const compiled = ts.transpileModule(declaration.getText(ast), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

interface Template { id: string; title: string; text: string }
const template: Template = {
  id: 'bundled-dai-bi-dedication',
  title: 'NGHI THỨC TRÌ TỤNG CHÚ ĐẠI BI',
  text: 'HỒI HƯỚNG\nNguyên văn từ bản đóng offline.\n(1 lạy)',
};

function harness(load: () => Promise<Template[]>, cached: Template[] = [], isEn = false) {
  const resetRosaryCount = vi.fn();
  const finishRosaryEvidence = vi.fn();
  const saveLog = vi.fn();
  const persisted = new Map([['count', '108'], ['completed-log', 'saved-before-dedication']]);
  const api = runInNewContext(`
    let practiceSyncGeneration = 1, screen = 'rosary', rosaryEndStage = null;
    let rosaryEndError = 'previous error', dedicationTemplates = cached, rosaryDedication = null;
    ${compiled}
    ({ complete: completeAutomaticRosary,
      changePrincipal() { practiceSyncGeneration++; rosaryEndError = 'new principal status'; },
      leaveScreen() { screen = 'catalog'; rosaryEndError = 'new screen status'; },
      snapshot() { return { screen, stage: rosaryEndStage, error: rosaryEndError,
        templates: dedicationTemplates, dedication: rosaryDedication }; }
    });
  `, {
    cached, isEn, loadPracticeDedicationTemplates: load,
    resetRosaryCount, finishRosaryEvidence, storage: { saveLog }, persisted,
  }) as {
    complete(): Promise<void>; changePrincipal(): void; leaveScreen(): void;
    snapshot(): { screen: string; stage: string; error: string; templates: Template[];
      dedication: null | { name: string; steps: { kind: string; text: string; sourceId: string }[] } };
  };
  return { ...api, resetRosaryCount, finishRosaryEvidence, saveLog, persisted };
}

describe('automatic rosary opens the exact bundled dedication after saved completion', () => {
  it('uses the cached template without another request, reset, settlement or log write', async () => {
    const load = vi.fn(async () => []);
    const h = harness(load, [template]);
    const before = [...h.persisted.entries()];
    await h.complete();
    expect(h.snapshot()).toMatchObject({ stage: 'complete', error: '', dedication: {
      name: 'HỒI HƯỚNG CÔNG ĐỨC',
      steps: [{ kind: 'dedication', text: template.text, sourceId: template.id }],
    } });
    expect(load).not.toHaveBeenCalled();
    expect(h.resetRosaryCount).not.toHaveBeenCalled();
    expect(h.finishRosaryEvidence).not.toHaveBeenCalled();
    expect(h.saveLog).not.toHaveBeenCalled();
    expect([...h.persisted.entries()]).toEqual(before);
  });

  it('loads the source once and preserves its text and source identity in English UI', async () => {
    const load = vi.fn(async () => [template]);
    const h = harness(load, [], true);
    await h.complete();
    expect(load).toHaveBeenCalledOnce();
    expect(h.snapshot()).toMatchObject({ stage: 'complete', error: '', templates: [template], dedication: {
      name: 'DEDICATION OF MERIT',
      steps: [{ text: template.text, sourceId: template.id }],
    } });
  });

  it.each(['principal', 'screen'] as const)('ignores a delayed source success after %s changes', async transition => {
    let resolve!: (templates: Template[]) => void;
    const load = vi.fn(() => new Promise<Template[]>(done => { resolve = done; }));
    const h = harness(load);
    const pending = h.complete();
    if (transition === 'principal') h.changePrincipal(); else h.leaveScreen();
    resolve([template]);
    await pending;
    expect(h.snapshot()).toMatchObject({ templates: [], dedication: null,
      error: transition === 'principal' ? 'new principal status' : 'new screen status' });
  });

  it.each(['principal', 'screen'] as const)('ignores a delayed source failure after %s changes', async transition => {
    let reject!: (cause: Error) => void;
    const load = vi.fn(() => new Promise<Template[]>((_done, fail) => { reject = fail; }));
    const h = harness(load);
    const pending = h.complete();
    if (transition === 'principal') h.changePrincipal(); else h.leaveScreen();
    reject(new Error('offline'));
    await pending;
    expect(h.snapshot()).toMatchObject({ templates: [], dedication: null,
      error: transition === 'principal' ? 'new principal status' : 'new screen status' });
  });

  it.each(['missing', 'unavailable'] as const)('retains saved completion and exposes an error when source is %s', async failure => {
    const load = vi.fn(async () => { if (failure === 'unavailable') throw new Error('offline'); return []; });
    const h = harness(load);
    const before = [...h.persisted.entries()];
    await h.complete();
    expect(h.snapshot()).toMatchObject({ stage: 'complete', dedication: null,
      error: 'Chưa mở được bài hồi hướng. Công phu đã được lưu.' });
    expect([...h.persisted.entries()]).toEqual(before);
    expect(h.resetRosaryCount).not.toHaveBeenCalled();
    expect(h.finishRosaryEvidence).not.toHaveBeenCalled();
    expect(h.saveLog).not.toHaveBeenCalled();
  });
});
