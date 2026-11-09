import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import ts from 'typescript';
import { editCopyingPage } from '../../../src/lib/domain/practice/copying-pages';

const route = readFileSync('src/routes/tu-tap/chep-kinh/+page.svelte', 'utf8');
const script = route.match(/<script lang="ts">([\s\S]*?)<\/script>/u)![1];
const ast = ts.createSourceFile('copying-route.ts', script, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const owners = ['goBlock', 'refreshEditor', 'input'];
const functions = ast.statements.filter(node => ts.isFunctionDeclaration(node) && owners.includes(node.name?.text ?? ''));
const compiled = ts.transpileModule(functions.map(node => node.getText(ast)).join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

it.each(['resolve', 'reject'] as const)('places typing in the selected passage before local selection acknowledgement can %s', async outcome => {
  let finish: () => void = () => {};
  const pending = new Promise<void>((resolve, reject) => { finish = () => outcome === 'resolve' ? resolve() : reject(new Error('storage unavailable')); });
  const oldRaw = 'Bản cũ'.normalize('NFD');
  const nextRaw = 'Bản mới'.normalize('NFD');
  const typed = nextRaw + ' mô'.normalize('NFD');
  const workspaceDraft = { block: 0, texts: [oldRaw, nextRaw] };
  const snapshot = () => ({ ...workspaceDraft, texts: [...workspaceDraft.texts] });
  const state: Record<string, any> = {
    chapter: { blocks: ['source 0', 'source 1'] }, restarting: false, networkBusy: false, composing: false,
    ticket: 1, editTicket: 0, block: 0, text: oldRaw, draft: snapshot(), sourceElement: null,
    editorPages: [0], editorPage: 0, canPaste: true, localError: false,
    cancelAutoAdvance: vi.fn(), workspace: {
      selectBlock: vi.fn((next: number) => { workspaceDraft.block = next; return pending; }),
      edit: vi.fn((block: number, value: string) => { workspaceDraft.block = block; workspaceDraft.texts[block] = value; return Promise.resolve(); }),
    },
    syncView() { state.draft = snapshot(); }, tick: async () => {}, scheduleEditorReflow: vi.fn(),
    followEditorCaret: vi.fn(), checkTypingAutoAdvance: vi.fn(), editCopyingPage,
    localizeUi: (value: string) => value, isBlockedCopyInput: () => false,
  };
  // Execute actual route owners; the workspace retains its synchronous block mutation.
  const scope = new Proxy(state, {
    has: (_target, key) => !owners.includes(String(key)),
    get: (target, key) => Reflect.has(target, key) ? Reflect.get(target, key) : Reflect.has(globalThis, key) ? Reflect.get(globalThis, key) : false,
    set: (target, key, value) => Reflect.set(target, key, value),
  });
  const runtime = new Function('scope', `with(scope) { ${compiled}; return { goBlock, input }; }`)(scope);
  const operation = runtime.goBlock(1);
  try {
    expect(state.workspace.selectBlock).toHaveBeenCalledWith(1);
    expect(state.block).toBe(1);
    expect(state.text).toBe(nextRaw);
    runtime.input(typed, 'insertCompositionText');
    expect(state.workspace.edit).toHaveBeenCalledWith(1, typed);
    expect(workspaceDraft.texts).toEqual([oldRaw, typed]);
  } finally { finish(); await operation; }
  expect(state.block).toBe(1);
  expect(state.text).toBe(typed);
  expect(workspaceDraft.texts).toEqual([oldRaw, typed]);
});
