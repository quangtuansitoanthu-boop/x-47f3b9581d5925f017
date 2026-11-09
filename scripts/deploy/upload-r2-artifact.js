import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `${command} exited with ${code}`));
    });
  });
}

export async function uploadR2Artifact({
  artifactPath,
  sourceRoot,
  bucket,
  concurrency = 4,
}) {
  const artifact = JSON.parse(await fs.readFile(artifactPath, 'utf8'));
  const queue = [...artifact.media.objects];
  let completed = 0;

  async function worker() {
    while (queue.length > 0) {
      const object = queue.shift();
      const sourcePath = path.resolve(sourceRoot, object.sourcePath);
      const stat = await fs.stat(sourcePath);
      if (stat.size !== object.byteSize) {
        throw new Error(`source-size-mismatch:${object.objectKey}`);
      }
      await run('npx', [
        'wrangler',
        'r2',
        'object',
        'put',
        `${bucket}/${object.objectKey}`,
        '--remote',
        '--force',
        '--file',
        sourcePath,
        '--content-type',
        object.contentType,
        '--cache-control',
        'public, max-age=31536000, immutable',
      ]);
      completed += 1;
      if (completed % 10 === 0 || completed === artifact.media.objects.length) {
        process.stdout.write(`Uploaded ${completed}/${artifact.media.objects.length}\n`);
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.max(1, Number(concurrency) || 1) }, () => worker()),
  );

  return {
    objectCount: completed,
    byteSize: artifact.media.byteSize,
  };
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const [artifactPath, sourceRoot, bucket, concurrency] = process.argv.slice(2);
  uploadR2Artifact({ artifactPath, sourceRoot, bucket, concurrency })
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error) => {
      process.stderr.write(`R2 upload failed: ${error.message}\n`);
      process.exitCode = 1;
    });
}
