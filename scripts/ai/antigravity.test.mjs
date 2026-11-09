import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { execute, parseResult, validateWorkspace } from './antigravity.mjs';

const success = (extra = {}) => ({ code: 0, stderr: '', stdout: JSON.stringify({ event: 'result', result: { status: 'SUCCESS', response: 'Reviewed', ...extra } }) });

test('transport preserves Vietnamese, newlines and shell characters via stdin', async () => {
  const prompt = 'Kiểm tra dự án\n`echo` $(whoami) & "quoted"';
  const script = `let input='';process.stdin.setEncoding('utf8');process.stdin.on('data',c=>input+=c);process.stdin.on('end',()=>{const p=JSON.parse(input);console.log(JSON.stringify({event:'result',result:{status:'SUCCESS',response:p.message.content}}));});`;
  const result = await execute(process.execPath, [], { cwd: tmpdir(), prompt, prefix: ['-e', script] });
  assert.equal(parseResult(result).response, prompt);
});

test('rejects failures, missing/multiple/invalid results and denied tools even on exit zero', () => {
  assert.equal(parseResult(success()).status, 'SUCCESS');
  for (const run of [
    { ...success(), code: 1 }, { ...success(), timedOut: true },
    { ...success(), stdout: '' }, { ...success(), stdout: 'not JSON' },
    { ...success(), stdout: `${success().stdout}\n${success().stdout}` },
    success({ status: 'WAITING' }), success({ response: '' }),
    success({ denied_actions: ['run_command'] }), success({ response: 'BLOCKED: missing context' }),
    { ...success(), stderr: 'tool soft-denied: requires approval' },
  ]) assert.throws(() => parseResult(run));
});

test('spawn failure and timeout do not report success', async () => {
  await assert.rejects(execute(path.join(tmpdir(), 'missing-tutam-agy-executable'), [], { cwd: tmpdir() }));
  const result = await execute(process.execPath, [], { cwd: tmpdir(), prefix: ['-e', 'setInterval(()=>{},1000)'], timeoutMs: 100 });
  assert.equal(result.timedOut, true);
  assert.throws(() => parseResult(result));
});

test('edit rejects primary, foreign and dirty workspaces; permits a clean linked worktree', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'tutam-agy-'));
  const source = path.join(directory, 'source');
  const target = path.join(directory, 'worktree');
  const foreign = path.join(directory, 'foreign');
  const git = (cwd, ...args) => {
    const run = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8', windowsHide: true });
    assert.equal(run.status, 0, run.stderr);
  };
  try {
    await mkdir(source); await mkdir(foreign);
    git(source, 'init'); git(foreign, 'init');
    git(source, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '--allow-empty', '-m', 'fixture');
    git(source, 'worktree', 'add', '--detach', target, 'HEAD');
    await assert.rejects(validateWorkspace(source, undefined, 'edit'));
    await assert.rejects(validateWorkspace(source, source, 'edit'));
    await assert.rejects(validateWorkspace(source, foreign, 'edit'));
    assert.equal(await validateWorkspace(source, target, 'edit'), await validateWorkspace(source, target, 'review'));
    await writeFile(path.join(target, 'untracked.txt'), 'keep');
    await assert.rejects(validateWorkspace(source, target, 'edit'));
  } finally {
    // Chỉ xóa thư mục fixture vừa tạo, không đụng workspace dự án.
    assert.ok(path.resolve(directory).startsWith(path.resolve(tmpdir()) + path.sep));
    await rm(directory, { recursive: true, force: true });
  }
});
