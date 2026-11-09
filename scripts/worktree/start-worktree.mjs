import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  DEV_PORT,
  canonicalRoot,
  getRuntimeTitle,
  inspectPortOwner,
  isOwnedProcess,
  readProcessStartedAt,
  readRuntimeState,
  removeRuntimeState,
  terminateProcessTree,
  waitForProcessExit,
  writeRuntimeState,
} from './runtime-state.mjs';

const requestedMode = process.argv[2] ?? 'local';
const dryRun = process.argv.includes('--dry-run');
const modes = {
  local: 'scripts/dev/start-sveltekit-local.mjs',
  'production-remote': 'scripts/dev/start-sveltekit-production-remote.mjs',
};

if (!(requestedMode in modes)) {
  console.error(`Chế độ environment không hợp lệ: ${requestedMode}`);
  process.exit(2);
}

const root = await canonicalRoot(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'));
const childScript = path.join(root, modes[requestedMode]);
const runtimeTitle = getRuntimeTitle(root, requestedMode);

if (requestedMode === 'local') delete process['env'].CLOUDFLARE_ENV;

if (dryRun) {
  console.log(JSON.stringify({
    mode: requestedMode,
    port: DEV_PORT,
    root,
    childScript,
    cloudflareEnvironment: process['env'].CLOUDFLARE_ENV ?? null,
  }, null, 2));
  process.exit(0);
}

const existingState = await readRuntimeState(root);
if (existingState) {
  const parentOwned = isOwnedProcess(
    existingState.parentPid,
    existingState.parentMarker,
    existingState.parentStartedAt,
  );
  const childOwned = isOwnedProcess(
    existingState.childPid,
    existingState.childScript,
    existingState.childStartedAt,
  );
  if (parentOwned || childOwned) {
    console.error(
      `Worktree này đã chạy ${existingState.mode} trên cổng ${existingState.port} `
      + `(PID ${existingState.childPid ?? existingState.parentPid}).`,
    );
    console.error('Dùng `npm run environment:stop` trước khi khởi động lại.');
    process.exit(1);
  }
  await removeRuntimeState(root);
}

const portOwner = inspectPortOwner(DEV_PORT);
if (portOwner) {
  console.error(`Không thể khởi động: cổng ${DEV_PORT} đang được sử dụng.`);
  console.error(portOwner);
  console.error('Dừng đúng tiến trình đang giữ cổng; script sẽ không tự đổi cổng hoặc tắt tiến trình lạ.');
  process.exit(1);
}

process.title = runtimeTitle;

if (requestedMode === 'production-remote') {
  console.warn('ACTION NÀY KẾT NỐI D1/R2 PRODUCTION VÀ CÓ THỂ THAY ĐỔI DỮ LIỆU THẬT.');
}

const child = spawn(process.execPath, [childScript], {
  cwd: root,
  detached: process.platform !== 'win32',
  env: process.env,
  stdio: 'inherit',
});

let stoppingSignal;
let forceStopTimer;
let childProcessError;

child.on('error', (error) => {
  childProcessError = error;
  console.error(`Lỗi tiến trình runtime environment: ${error.message}`);
});

const signalChild = (signal) => {
  if (!child.pid) return true;
  if (process.platform === 'win32') return terminateProcessTree(child.pid, signal);
  try {
    return child.kill(signal);
  } catch (error) {
    childProcessError = error;
    return error?.code === 'ESRCH';
  }
};

const stop = (signal) => {
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (stoppingSignal) {
    signalChild('SIGKILL');
    return;
  }
  stoppingSignal = signal;
  signalChild(signal);
  forceStopTimer = setTimeout(() => signalChild('SIGKILL'), 5_000);
  forceStopTimer.unref();
};

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop(signal));

const childExit = new Promise((resolve) => {
  child.once('exit', (code, signal) => resolve({ code, signal }));
});

try {
  await once(child, 'spawn');
  const parentMarker = process.platform === 'win32'
    ? fileURLToPath(import.meta.url)
    : runtimeTitle;

  await writeRuntimeState(root, {
    version: 1,
    root,
    mode: requestedMode,
    port: DEV_PORT,
    parentPid: process.pid,
    parentMarker,
    parentStartedAt: readProcessStartedAt(process.pid),
    childPid: child.pid,
    childScript,
    childStartedAt: readProcessStartedAt(child.pid),
    createdAt: new Date().toISOString(),
  });
} catch (error) {
  stop('SIGTERM');
  if (child.pid) {
    let stopped = await waitForProcessExit(child.pid);
    if (!stopped) {
      signalChild('SIGKILL');
      stopped = await waitForProcessExit(child.pid, 1_000);
    }
    if (!stopped) {
      console.error('Runtime chưa dừng; giữ action mở để tránh bỏ lại tiến trình không được theo dõi.');
      await childExit;
    }
  }
  await removeRuntimeState(root);
  console.error(`Không thể khởi động runtime environment: ${error.message}`);
  process.exit(1);
}

const { code, signal } = await childExit;
if (forceStopTimer) clearTimeout(forceStopTimer);
const currentState = await readRuntimeState(root);
if (currentState?.parentPid === process.pid) await removeRuntimeState(root);
if (!stoppingSignal && code !== 0) {
  console.error(`Runtime environment đã dừng bất thường (${signal || code}).`);
}
const childExitCode = childProcessError && code === 0 ? 1 : (code ?? 1);
process.exitCode = stoppingSignal === 'SIGINT'
  ? 130
  : stoppingSignal === 'SIGTERM'
    ? 143
    : childExitCode;
