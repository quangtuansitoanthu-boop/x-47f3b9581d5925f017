import { spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, realpathSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const config = 'tests/e2e/wrangler.sveltekit.jsonc';
const prebuilt = process.env.TUTAM_E2E_PREBUILT === '1';
if (prebuilt) {
  const worker = path.join(root, 'dist-sveltekit', '_worker.js');
  if (!existsSync(worker) || !statSync(worker).isFile()) {
    throw new Error('TUTAM_E2E_PREBUILT=1 requires an existing dist-sveltekit/_worker.js build');
  }
  const canonicalRoot = realpathSync(root);
  const canonicalWorker = realpathSync(worker);
  const relativeWorker = path.relative(canonicalRoot, canonicalWorker);
  if (relativeWorker.startsWith(`..${path.sep}`) || path.isAbsolute(relativeWorker)) {
    throw new Error('Prebuilt E2E worker must stay inside the tutam-mobile checkout');
  }
}
const persistence = mkdtempSync(path.join(tmpdir(), 'quangtu-e2e-runtime-'));
const isWindows = process.platform === 'win32';

try {
  const targetAssetsDir = path.join(root, 'dist-sveltekit/assets');
  if (existsSync(targetAssetsDir)) {
    rmSync(targetAssetsDir, { recursive: true, force: true });
  }
} catch {}

if (!prebuilt) run('npm', ['run', 'build']);
try {
  const assetsDir = path.join(root, 'assets');
  const targetAssetsDir = path.join(root, 'dist-sveltekit/assets');
  if (existsSync(assetsDir)) {
    rmSync(targetAssetsDir, { recursive: true, force: true });
    cpSync(assetsDir, targetAssetsDir, { recursive: true, force: true });
  }
} catch (e) {
  console.error('Failed to copy assets:', e);
}
run('npx', ['wrangler', 'd1', 'migrations', 'apply', 'DB', '--local', '--config', config, '--persist-to', persistence]);
run('npx', ['wrangler', 'd1', 'execute', 'DB', '--local', '--config', config, '--persist-to', persistence, '--file', 'tests/e2e/fixtures/local-runtime-seed.sql']);

if (process.env.TUTAM_E2E_DEV_API === '1') {
  const { startLocalDevRuntime } = await import('./local-dev-runtime.mjs');
  await startLocalDevRuntime({
    config: path.join(root, config),
    persistence,
    cleanup: () => rmSync(persistence, { recursive: true, force: true }),
  });
} else {
const server = spawn(process.execPath, [
  path.join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js'),
  'dev', '--local', '--config', config, '--persist-to', persistence,
  '--port', '8787', '--ip', '127.0.0.1'
], { cwd: root, env: process.env, stdio: 'inherit' });

let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    stopping = true;
    server.kill(signal);
  });
}

server.on('exit', (code, signal) => {
  console.error(`[e2e-runtime] Wrangler exited: code=${code ?? 'null'} signal=${signal ?? 'none'} expected=${stopping}`);
  rmSync(persistence, { recursive: true, force: true });
  if (stopping || signal === 'SIGTERM' || signal === 'SIGINT' || code === 143 || code === 130) {
    process.exit(0);
  }
  process.exit(code && code > 0 ? code : 1);
});
}

function run(command, args) {
  const cmd = isWindows ? `${command}.cmd` : command;
  const result = spawnSync(cmd, args, { cwd: root, env: process.env, stdio: 'inherit', shell: isWindows });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
