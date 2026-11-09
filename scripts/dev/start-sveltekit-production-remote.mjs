import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { DEV_PORT, inspectPortOwner, terminateProcessTree, waitForProcessExit } from '../worktree/runtime-state.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const vite = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');

console.warn('CẢNH BÁO: D1 và R2 đang kết nối production. Mọi thao tác CRUD tác động dữ liệu thật.');
console.warn('Không chạy migration từ command này. Dừng server bằng Ctrl+C.');

// Giải phóng port nếu có tiến trình cũ chiếm dụng
try {
  const portOwnerInfo = inspectPortOwner(DEV_PORT);
  if (portOwnerInfo) {
    const lines = portOwnerInfo.split('\n');
    for (const line of lines) {
      const parts = line.trim().split(/\s+/u);
      const pid = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(pid) && pid > 0 && pid !== process.pid) {
        console.log(`Đang giải phóng cổng ${DEV_PORT} (tiến trình PID ${pid})...`);
        terminateProcessTree(pid);
        await waitForProcessExit(pid, 2000);
      }
    }
  }
} catch {
  // Bỏ qua nếu không inspect được
}

console.log('Opening production-remote runtime: http://127.0.0.1:4173');

const child = spawn(process.execPath, [
  vite, 'dev', '--config', 'vite.config.ts', '--host', '127.0.0.1', '--port', '4173', '--strictPort',
], {
  cwd: root,
  env: { ...process.env, CLOUDFLARE_ENV: 'production-remote' },
  stdio: 'inherit',
});

let stoppingSignal;
let forceStopTimer;
const stop = (signal) => {
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (stoppingSignal) {
    child.kill('SIGKILL');
    return;
  }
  stoppingSignal = signal;
  child.kill(signal);
  forceStopTimer = setTimeout(() => child.kill('SIGKILL'), 5_000);
  forceStopTimer.unref();
};

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop(signal));
child.on('error', (error) => {
  console.error(`Không thể khởi động production-remote runtime: ${error.message}`);
  process.exitCode = 1;
});
child.on('exit', (code, signal) => {
  if (forceStopTimer) clearTimeout(forceStopTimer);
  if (!stoppingSignal && code !== 0) console.error(`Production-remote runtime đã dừng bất thường (${signal || code}).`);
  process.exitCode = stoppingSignal === 'SIGINT' ? 130 : stoppingSignal === 'SIGTERM' ? 143 : (code ?? 1);
});
