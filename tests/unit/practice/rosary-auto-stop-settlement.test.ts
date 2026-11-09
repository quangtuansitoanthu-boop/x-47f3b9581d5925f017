import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

const route = readFileSync('src/routes/tu-tap/+page.svelte', 'utf8');
const ast = ts.createSourceFile('route.ts', route.slice(route.indexOf('>') + 1, route.indexOf('</script>')), ts.ScriptTarget.Latest, true);
const code = ts.transpileModule(ast.statements.filter(node => ts.isFunctionDeclaration(node)
  && ['stopRhythm', 'stopRosaryRhythm'].includes(node.name?.text ?? '')).map(node => node.getText(ast)).join('\n'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

function harness() {
  let resolve!: () => void, reject!: (cause: Error) => void;
  const pending = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  const transport = { pause: vi.fn(), refresh: vi.fn(() => pending), stop: vi.fn() };
  const context: any = { rhythm: transport, rhythmBusy: false, practiceSyncGeneration: 1,
    syncSession: { user: { id: 'a' } }, sessionPrincipalId: (session: any) => session.user.id,
    rhythmState: { count: 10, target: 108, playing: true, completed: false, error: '' }, isEn: false,
    reportPracticeEvidenceFailure: vi.fn() };
  runInNewContext(code + '\nthis.stop = stopRosaryRhythm;', context);
  return { context, transport, resolve, reject, stop: () => context.stop() as Promise<void> };
}

describe('explicit automatic rosary stop settles before releasing native playback', () => {
  it('pauses and waits for the final position before invalidating native callbacks', async () => {
    const h = harness();
    const pending = h.stop();
    expect(h.transport.pause).toHaveBeenCalledOnce();
    expect(h.transport.refresh).toHaveBeenCalledOnce();
    expect(h.transport.stop).not.toHaveBeenCalled();
    expect(h.context.rhythmBusy).toBe(true);
    // The route onState owner can still persist newly heard beats while the queue is retained.
    h.context.rhythmState.count = 12;
    h.transport.stop.mockImplementation(() => expect(h.context.rhythmState.count).toBe(12));
    h.resolve(); await pending;
    expect(h.transport.stop).toHaveBeenCalledOnce();
    expect(h.context.rhythmState.target).toBe(0);
    expect(h.context.rhythmBusy).toBe(false);
  });
  it('does not release a replacement owner after principal change', async () => {
    const h = harness();
    const pending = h.stop();
    const replacement = { pause: vi.fn(), refresh: vi.fn(), stop: vi.fn() };
    h.context.rhythm = replacement; h.context.practiceSyncGeneration++; h.context.syncSession.user.id = 'b';
    h.resolve(); await pending;
    expect(h.transport.stop).not.toHaveBeenCalled();
    expect(replacement.stop).not.toHaveBeenCalled();
  });
  it('keeps the paused count retryable if authoritative refresh fails', async () => {
    const h = harness();
    const pending = h.stop();
    h.reject(new Error('bridge unavailable')); await pending;
    expect(h.transport.stop).not.toHaveBeenCalled();
    expect(h.context.rhythmState).toMatchObject({ count: 10, target: 108, playing: false });
    expect(h.context.rhythmState.error).toContain('bấm Dừng lại');
    expect(h.context.rhythmBusy).toBe(false);
  });
  it('coalesces repeated button presses while a stop is settling', async () => {
    const h = harness();
    const first = h.stop(), second = h.stop();
    expect(h.transport.refresh).toHaveBeenCalledOnce();
    h.resolve(); await Promise.all([first, second]);
    expect(h.transport.stop).toHaveBeenCalledOnce();
  });
});
