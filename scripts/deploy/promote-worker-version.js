import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_TARGETS = [
  'dist-sveltekit',
  '.artifacts/wrangler-sveltekit',
  '.artifacts/wrangler-jobs',
  'migrations',
  'wrangler.sveltekit.jsonc',
  'wrangler.jobs.jsonc',
];

export async function createPromotionManifest(outputPath, targets = DEFAULT_TARGETS) {
  await mkdir(path.dirname(path.resolve(outputPath)), { recursive: true });
  const files = {};
  for (const target of targets) {
    for (const file of await listFiles(target)) {
      files[file] = sha256(await readFile(path.resolve(file)));
    }
  }
  const manifest = {
    createdAt: new Date().toISOString(),
    files,
    targetRoots: targets,
  };
  await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

export async function verifyPromotionManifest(manifestPath) {
  const manifest = JSON.parse(await readFile(path.resolve(manifestPath), 'utf8'));
  const actualFiles = (await Promise.all((manifest.targetRoots || []).map(listFiles))).flat().sort();
  const expectedFiles = Object.keys(manifest.files || {}).sort();
  if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
    throw new Error('promotion-artifact-file-set-mismatch');
  }
  for (const [target, expected] of Object.entries(manifest.files || {})) {
    const actual = sha256(await readFile(path.resolve(target)));
    if (actual !== expected) {
      throw new Error(`promotion-artifact-mismatch:${target}`);
    }
  }
  return manifest;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function listFiles(target) {
  const normalized = target.replaceAll('\\', '/').replace(/\/$/, '');
  const absolutePath = path.resolve(normalized);
  const targetStat = await stat(absolutePath);
  if (targetStat.isFile()) return [normalized];
  if (!targetStat.isDirectory()) throw new Error(`promotion-artifact-unsupported:${normalized}`);

  const entries = await readdir(absolutePath, { withFileTypes: true });
  const nested = await Promise.all(entries
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((entry) => listFiles(`${normalized}/${entry.name}`)));
  return nested.flat();
}

const outputPath = process.argv[2];
const mode = process.argv[3];
const isDirectExecution = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution && outputPath && mode === '--verify') {
  verifyPromotionManifest(outputPath).then(() => {
    process.stdout.write(`Promotion artifact verified: ${outputPath}\n`);
  }).catch((error) => {
    process.stderr.write(`Promotion verification failed: ${error.message}\n`);
    process.exitCode = 1;
  });
} else if (isDirectExecution && outputPath) {
  createPromotionManifest(outputPath).then((manifest) => {
    process.stdout.write(`Promotion artifact created with ${Object.keys(manifest.files).length} digests.\n`);
  }).catch((error) => {
    process.stderr.write(`Promotion artifact generation failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
