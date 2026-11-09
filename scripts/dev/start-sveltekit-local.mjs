import { spawn, spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const config = 'wrangler.sveltekit.jsonc';
const localD1StateDirectory = path.join(
  root,
  '.wrangler',
  'state',
  'v3',
  'd1',
  'miniflare-D1DatabaseObject',
);
const entrypoints = {
  vite: path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'),
  wrangler: path.join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js'),
};

run('wrangler', ['d1', 'migrations', 'apply', 'DB', '--local', '--config', config]);

// Wrangler can leave WAL recovery work for Vite's parallel workerd instances. Checkpoint the
// local-only SQLite state first so startup never races over SQLITE_BUSY_RECOVERY.
await checkpointLocalD1State();

console.log('Khu vực quản trị sử dụng OAuth. Cấu hình credentials của nhà cung cấp để đăng nhập local.');
console.log('Opening runtime: http://127.0.0.1:4173');

const vite = spawn(process.execPath, [
  entrypoints.vite, 'dev', '--config', 'vite.config.ts', '--host', '127.0.0.1', '--port', '4173', '--strictPort',
], { cwd: root, env: process.env, stdio: 'inherit' });

let stoppingSignal;
let forceStopTimer;
const stop = (signal) => {
  if (vite.exitCode !== null || vite.signalCode !== null) return;
  if (stoppingSignal) {
    vite.kill('SIGKILL');
    return;
  }

  stoppingSignal = signal;
  vite.kill(signal);
  forceStopTimer = setTimeout(() => vite.kill('SIGKILL'), 5_000);
  forceStopTimer.unref();
};

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop(signal));
vite.on('error', (error) => {
  console.error(`Không thể khởi động Vite: ${error.message}`);
  process.exitCode = 1;
});
vite.on('exit', (code, signal) => {
  if (forceStopTimer) clearTimeout(forceStopTimer);
  if (!stoppingSignal && code !== 0) console.error(`Vite đã dừng bất thường (${signal || code}).`);
  process.exitCode = stoppingSignal === 'SIGINT' ? 130 : stoppingSignal === 'SIGTERM' ? 143 : (code ?? 1);
});

function run(command, args) {
  const result = spawnSync(process.execPath, [entrypoints[command], ...args], {
    cwd: root,
    env: { ...process.env, CI: '1' },
    stdio: 'inherit',
  });
  if (result.error) {
    console.error(`Không thể chạy ${command}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

async function checkpointLocalD1State() {
  let sqliteFiles;
  try {
    sqliteFiles = readdirSync(localD1StateDirectory).filter((file) => file.endsWith('.sqlite'));
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }

  for (const file of sqliteFiles) {
    await checkpointSqliteFile(path.join(localD1StateDirectory, file));
  }
}

async function checkpointSqliteFile(file) {
  const maximumAttempts = 10;

  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    let database;
    try {
      database = new DatabaseSync(file, { timeout: 500 });
      const [result] = database.prepare('PRAGMA wal_checkpoint(TRUNCATE)').all();
      if (result?.busy === 0) return;
    } catch (error) {
      if (!String(error?.code ?? '').includes('SQLITE_BUSY') || attempt === maximumAttempts) throw error;
    } finally {
      database?.close();
    }

    if (attempt === maximumAttempts) {
      throw new Error(`Không thể checkpoint local D1 SQLite: ${path.basename(file)}`);
    }
    await delay(100);
  }
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
