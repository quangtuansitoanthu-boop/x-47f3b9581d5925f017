import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export async function verifyPublicR2({
  artifactPath,
  baseUrl,
  concurrency = 4,
  origin,
}) {
  const artifact = JSON.parse(await fs.readFile(artifactPath, 'utf8'));
  const queue = [...artifact.media.objects];
  let objectCount = 0;
  let byteSize = 0;

  async function worker() {
    while (queue.length > 0) {
      const object = queue.shift();
      const response = await fetch(
        `${baseUrl.replace(/\/$/, '')}/${object.objectKey.split('/').map(encodeURIComponent).join('/')}`,
        origin ? { headers: { Origin: origin } } : undefined,
      );
      if (!response.ok || !response.body) {
        throw new Error(`download-failed:${object.objectKey}:${response.status}`);
      }
      if (origin && response.headers.get('access-control-allow-origin') !== origin) {
        throw new Error(`cors-mismatch:${object.objectKey}`);
      }
      const hash = createHash('sha256');
      let downloadedBytes = 0;
      for await (const chunk of response.body) {
        hash.update(chunk);
        downloadedBytes += chunk.byteLength;
      }
      if (downloadedBytes !== object.byteSize || hash.digest('hex') !== object.sha256) {
        throw new Error(`object-mismatch:${object.objectKey}`);
      }
      objectCount += 1;
      byteSize += downloadedBytes;
      if (objectCount % 10 === 0 || objectCount === artifact.media.objects.length) {
        process.stdout.write(`Verified ${objectCount}/${artifact.media.objects.length}\n`);
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.max(1, Number(concurrency) || 1) }, () => worker()),
  );

  if (objectCount !== artifact.media.objectCount || byteSize !== artifact.media.byteSize) {
    throw new Error('manifest-total-mismatch');
  }
  return { objectCount, byteSize };
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const [artifactPath, baseUrl, concurrency, origin] = process.argv.slice(2);
  verifyPublicR2({ artifactPath, baseUrl, concurrency, origin })
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error) => {
      process.stderr.write(`R2 verification failed: ${error.message}\n`);
      process.exitCode = 1;
    });
}
