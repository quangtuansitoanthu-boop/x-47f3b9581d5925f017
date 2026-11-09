import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createPromotionManifest,
  DEFAULT_TARGETS,
  verifyPromotionManifest,
} from '../../scripts/deploy/promote-worker-version.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, {
    force: true,
    recursive: true,
  })));
});

describe('immutable promotion artifact', () => {
  it('limits the default manifest boundary to the production web and jobs artifacts', () => {
    expect(DEFAULT_TARGETS).toContain('dist-sveltekit');
    expect(DEFAULT_TARGETS).toContain('wrangler.sveltekit.jsonc');
    expect(DEFAULT_TARGETS).toContain('wrangler.jobs.jsonc');
    expect(DEFAULT_TARGETS).toContain('migrations');
    expect(DEFAULT_TARGETS.some((target) => /legacy|rollback/u.test(target))).toBe(false);
  });

  it('detects changed and newly added files inside artifact directories', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'quangtu-promotion-'));
    temporaryDirectories.push(root);
    const bundle = path.join(root, 'bundle');
    const manifestPath = path.join(root, 'promotion.json');
    await mkdir(bundle);
    await writeFile(path.join(bundle, 'worker.js'), 'version-one');

    await createPromotionManifest(manifestPath, [bundle]);
    await expect(verifyPromotionManifest(manifestPath)).resolves.toBeTruthy();

    await writeFile(path.join(bundle, 'worker.js'), 'version-two');
    await expect(verifyPromotionManifest(manifestPath)).rejects.toThrow(
      'promotion-artifact-mismatch',
    );

    await writeFile(path.join(bundle, 'worker.js'), 'version-one');
    await writeFile(path.join(bundle, 'unexpected.js'), 'unlisted');
    await expect(verifyPromotionManifest(manifestPath)).rejects.toThrow(
      'promotion-artifact-file-set-mismatch',
    );
  });
});
