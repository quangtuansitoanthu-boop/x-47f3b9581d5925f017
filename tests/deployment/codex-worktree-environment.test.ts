import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  DEV_PORT,
  getRuntimeStatePath,
  getRuntimeTitle,
  isOwnedProcess,
  isProcessAlive,
  parseWindowsPortOwners,
  readProcessCommand,
  readProcessStartedAt,
  terminateProcessTree,
  waitForProcessExit,
} from '../../scripts/worktree/runtime-state.mjs';

describe('Codex worktree environment', () => {
  it('installs dependencies and exposes local, production-remote, and stop actions', async () => {
    const [packageSource, environmentSource] = await Promise.all([
      readFile(path.resolve('package.json'), 'utf8'),
      readFile(path.resolve('.codex/environments/environment.toml'), 'utf8'),
    ]);
    const packageData = JSON.parse(packageSource);

    expect(packageData.scripts['worktree:setup']).toBe('npm ci --no-audit --no-fund');
    expect(packageData.scripts['environment:start']).toBe(
      'node scripts/worktree/start-worktree.mjs local',
    );
    expect(packageData.scripts['environment:start:remote']).toBe(
      'node scripts/worktree/start-worktree.mjs production-remote',
    );
    expect(packageData.scripts['environment:stop']).toBe(
      'node scripts/worktree/stop-worktree.mjs',
    );
    expect(packageData.scripts['worktree:cleanup']).toBe(
      'node scripts/worktree/stop-worktree.mjs --cleanup',
    );

    expect(environmentSource).toContain('name = "tutam"');
    expect(environmentSource).toContain('cd "$CODEX_WORKTREE_PATH"');
    expect(environmentSource).toContain('npm run worktree:setup');
    expect(environmentSource).toContain('npm run worktree:cleanup');
    expect(environmentSource).toContain('name = "Start local"');
    expect(environmentSource).toContain('command = "npm run environment:start"');
    expect(environmentSource).toContain('name = "Start production remote"');
    expect(environmentSource).toContain('command = "npm run environment:start:remote"');
    expect(environmentSource).toContain('name = "Stop dev server"');
    expect(environmentSource).toContain('command = "npm run environment:stop"');

    const actionsSource = environmentSource.slice(environmentSource.indexOf('[[actions]]'));
    expect(actionsSource).not.toContain('CODEX_WORKTREE_PATH');
  });

  it('keeps runtime identity deterministic and scoped to its checkout', () => {
    const firstTitle = getRuntimeTitle('/tmp/worktree-a', 'local');

    expect(DEV_PORT).toBe(4173);
    expect(firstTitle).toBe(getRuntimeTitle('/tmp/worktree-a', 'local'));
    expect(firstTitle).not.toBe(getRuntimeTitle('/tmp/worktree-b', 'local'));
    expect(firstTitle).not.toBe(getRuntimeTitle('/tmp/worktree-a', 'production-remote'));
    expect(getRuntimeStatePath('/tmp/worktree-a')).toBe(
      path.join('/tmp/worktree-a', '.wrangler', 'codex-worktree-runtime.json'),
    );
    expect(isProcessAlive(-1)).toBe(false);
  });

  it('uses process start identity to reject stale or recycled PID state', () => {
    const command = readProcessCommand(process.pid);
    const startedAt = readProcessStartedAt(process.pid);

    expect(command).not.toBe('');
    expect(startedAt).not.toBe('');
    expect(isOwnedProcess(process.pid, command, startedAt)).toBe(true);
    expect(isOwnedProcess(process.pid, command, `${startedAt}-stale`)).toBe(false);
    // Windows process identity uses several PowerShell/CIM queries. Keep a
    // bounded allowance for loaded CI machines without weakening PID checks.
  }, 15_000);

  it('terminates a controlled owned process and observes its exit', async () => {
    const marker = `tutam-worktree-test-${Date.now()}`;
    const child = spawn(
      process.execPath,
      ['-e', 'process.title = process.argv[1]; setInterval(() => {}, 1000);', marker],
      { stdio: 'ignore', windowsHide: true },
    );

    try {
      await once(child, 'spawn');
      const startedAt = readProcessStartedAt(child.pid);

      expect(isOwnedProcess(child.pid, marker, startedAt)).toBe(true);
      expect(terminateProcessTree(child.pid, 'SIGTERM')).toBe(true);
      expect(await waitForProcessExit(child.pid)).toBe(true);
    } finally {
      if (child.pid && isProcessAlive(child.pid)) {
        terminateProcessTree(child.pid, 'SIGKILL');
        await waitForProcessExit(child.pid, 1_000);
      }
    }
  }, 10_000);

  it('matches the exact Windows listening port instead of a numeric prefix', () => {
    const netstat = [
      '  TCP    127.0.0.1:4173    0.0.0.0:0    LISTENING    101',
      '  TCP    127.0.0.1:41730   0.0.0.0:0    LISTENING    202',
    ].join('\r\n');

    expect(parseWindowsPortOwners(netstat, 4173)).toContain('101');
    expect(parseWindowsPortOwners(netstat, 4173)).not.toContain('202');
  });

  it('strips an ambient production selector from the local action', () => {
    const result = spawnSync(
      process.execPath,
      [path.resolve('scripts/worktree/start-worktree.mjs'), 'local', '--dry-run'],
      {
        cwd: path.resolve('.'),
        encoding: 'utf8',
        env: { ...process['env'], CLOUDFLARE_ENV: 'production-remote' },
      },
    );

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).cloudflareEnvironment).toBeNull();
  });

  it.each([
    ['local', 'scripts/dev/start-sveltekit-local.mjs'],
    ['production-remote', 'scripts/dev/start-sveltekit-production-remote.mjs'],
  ])('resolves the %s action without starting a server', (mode, expectedScript) => {
    const result = spawnSync(
      process.execPath,
      [path.resolve('scripts/worktree/start-worktree.mjs'), mode, '--dry-run'],
      { cwd: path.resolve('.'), encoding: 'utf8' },
    );

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(expect.objectContaining({
      mode,
      port: 4173,
      root: path.resolve('.'),
      childScript: path.resolve(expectedScript),
    }));
  });
});
