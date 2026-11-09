import { readdir, readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';

const root = process.cwd();
const directory = path.join(root, 'static/offline-data/chapters-en');
const files = (await readdir(directory)).filter(file => file.endsWith('.json'));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const queue = [];
for (const file of files) {
  const bytes = await readFile(path.join(directory, file));
  const rows = JSON.parse(bytes);
  if (!Array.isArray(rows) || !rows.length || !rows.every(row => typeof row?.noi_dung === 'string')) {
    throw new Error(`Invalid chapters: ${file}`);
  }
  queue.push({ file, hash: digest(bytes) });
}

function upload(file, objectKey = `offline-data/chapters-en/${file}`, sourcePath = path.join(directory, file)) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      path.join(root, 'node_modules/wrangler/bin/wrangler.js'),
      'r2', 'object', 'put', `quangtu/${objectKey}`,
      '--remote', '--file', sourcePath,
      '--content-type', 'application/json; charset=utf-8',
      '--cache-control', 'public, max-age=3600',
      '--config', 'wrangler.sveltekit.jsonc', '--env', 'production',
    ], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(output)));
  });
}

let done = 0;
await Promise.all(Array.from({ length: 4 }, async () => {
  while (queue.length) {
    const { file, hash } = queue.shift();
    await upload(file);
    const response = await fetch(`https://media.quangtu.vn/offline-data/chapters-en/${encodeURIComponent(file)}`, {
      headers: { Origin: 'https://localhost' }, signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok || digest(Buffer.from(await response.arrayBuffer())) !== hash) {
      throw new Error(`Public verification failed: ${file} (${response.status})`);
    }
    const cors = response.headers.get('access-control-allow-origin');
    if (cors !== '*' && cors !== 'https://localhost') throw new Error(`Native CORS failed: ${file}`);
    done += 1;
    console.log(`Uploaded and verified ${done}/${files.length}: ${file}`);
  }
}));
console.log(`Completed: ${done} English chapter files verified against local SHA-256.`);

await upload('english-pack-manifest.json', 'offline-data/english-pack-manifest.json', path.join(root, 'static/offline-data/english-pack-manifest.json'));
console.log('Published English pack manifest after all books were verified.');
