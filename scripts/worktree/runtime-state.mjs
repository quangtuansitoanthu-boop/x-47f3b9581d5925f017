import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const DEV_PORT = 4173;

const stateDirectoryName = '.wrangler';
const stateFileName = 'codex-worktree-runtime.json';

export function getRuntimeStatePath(root) {
  return path.join(root, stateDirectoryName, stateFileName);
}

export function getRuntimeTitle(root, mode) {
  const id = createHash('sha256').update(root).digest('hex').slice(0, 10);
  return `tutam-worktree-${mode}-${id}`;
}

export async function canonicalRoot(root) {
  return realpath(root);
}

export async function readRuntimeState(root) {
  try {
    return JSON.parse(await readFile(getRuntimeStatePath(root), 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

export async function writeRuntimeState(root, state) {
  const statePath = getRuntimeStatePath(root);
  await mkdir(path.dirname(statePath), { recursive: true });
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
}

export async function removeRuntimeState(root) {
  await rm(getRuntimeStatePath(root), { force: true });
}

export function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

export function readProcessCommand(pid) {
  if (!isProcessAlive(pid)) return '';

  if (process.platform === 'win32') {
    const command = spawnSync('powershell.exe', [
      '-NoProfile',
      '-Command',
      `(Get-CimInstance Win32_Process -Filter \"ProcessId = ${pid}\").CommandLine`,
    ], { encoding: 'utf8', windowsHide: true });
    return command.status === 0 ? command.stdout.trim() : '';
  }

  const command = spawnSync('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8' });
  return command.status === 0 ? command.stdout.trim() : '';
}

export function readProcessStartedAt(pid) {
  if (!isProcessAlive(pid)) return '';

  if (process.platform === 'win32') {
    const startedAt = spawnSync('powershell.exe', [
      '-NoProfile',
      '-Command',
      `(Get-CimInstance Win32_Process -Filter \"ProcessId = ${pid}\").CreationDate.ToUniversalTime().ToString('o')`,
    ], { encoding: 'utf8', windowsHide: true });
    return startedAt.status === 0 ? startedAt.stdout.trim() : '';
  }

  const startedAt = spawnSync('ps', ['-p', String(pid), '-o', 'lstart='], { encoding: 'utf8' });
  return startedAt.status === 0 ? startedAt.stdout.trim() : '';
}

export function isOwnedProcess(pid, marker, expectedStartedAt) {
  if (!marker || !expectedStartedAt) return false;
  return readProcessCommand(pid).includes(marker)
    && readProcessStartedAt(pid) === expectedStartedAt;
}

export function terminateProcessTree(pid, signal = 'SIGTERM') {
  if (!isProcessAlive(pid)) return true;

  if (process.platform === 'win32') {
    const result = spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], {
      encoding: 'utf8',
      windowsHide: true,
    });
    return result.status === 0 || !isProcessAlive(pid);
  }

  try {
    process.kill(pid, signal);
    return true;
  } catch (error) {
    if (error?.code === 'ESRCH') return true;
    return false;
  }
}

export function parseWindowsPortOwners(output, port) {
  return output
    .split(/\r?\n/u)
    .filter((line) => {
      const columns = line.trim().split(/\s+/u);
      if (columns[0] !== 'TCP' || columns[3] !== 'LISTENING') return false;
      return columns[1]?.slice(columns[1].lastIndexOf(':') + 1) === String(port);
    })
    .join('\n')
    .trim();
}

export function inspectPortOwner(port = DEV_PORT) {
  if (process.platform === 'win32') {
    const result = spawnSync('netstat', ['-ano', '-p', 'tcp'], { encoding: 'utf8', windowsHide: true });
    if (result.status !== 0) return '';
    return parseWindowsPortOwners(result.stdout, port);
  }

  const result = spawnSync('lsof', [
    '-nP',
    `-iTCP:${port}`,
    '-sTCP:LISTEN',
  ], { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : '';
}

export async function waitForProcessExit(pid, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isProcessAlive(pid)) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return !isProcessAlive(pid);
}
