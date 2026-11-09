import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { verifyJobsOwnership } from '../../scripts/deploy/verify-jobs-ownership.js';

async function writeConfig(enabled: boolean) {
  const directory = await mkdtemp(path.join(tmpdir(), 'jobs-ownership-'));
  const file = path.join(directory, 'wrangler.jobs.jsonc');
  await writeFile(file, JSON.stringify({
    env: {
      production: {
        name: 'jobs-worker',
        vars: { JOBS_ENABLED: String(enabled) },
      },
    },
  }));
  return file;
}

describe('jobs ownership verification', () => {
  it('accepts the enabled local jobs configuration', async () => {
    await expect(verifyJobsOwnership({
      jobsConfigPath: await writeConfig(true),
    })).resolves.toMatchObject({ jobsEnabled: true, source: 'local' });
  });

  it('rejects a disabled local jobs owner', async () => {
    await expect(verifyJobsOwnership({
      jobsConfigPath: await writeConfig(false),
    })).rejects.toThrow('jobs-owner-not-enabled');
  });

  it('accepts one fully active deployed jobs version', async () => {
    const runWrangler = async (args: string[]) => args[0] === 'deployments'
      ? { versions: [{ percentage: 100, version_id: 'jobs-version' }] }
      : { resources: { bindings: [
          { name: 'JOBS_ENABLED', type: 'plain_text', text: 'true' },
        ] } };
    await expect(verifyJobsOwnership({
      jobsConfigPath: await writeConfig(true),
      source: 'deployed',
      runWrangler,
    })).resolves.toMatchObject({
      jobsEnabled: true,
      jobsVersionId: 'jobs-version',
      workerName: 'jobs-worker',
    });
  });

  it('rejects a deployed version split', async () => {
    const runWrangler = async () => ({
      versions: [
        { percentage: 50, version_id: 'jobs-a' },
        { percentage: 50, version_id: 'jobs-b' },
      ],
    });
    await expect(verifyJobsOwnership({
      jobsConfigPath: await writeConfig(true),
      source: 'deployed',
      runWrangler,
    })).rejects.toThrow('deployed-version-split:jobs-worker');
  });

  it('rejects a missing deployed jobs Worker', async () => {
    const missing = Object.assign(new Error('Worker does not exist'), { stderr: '10007' });
    await expect(verifyJobsOwnership({
      jobsConfigPath: await writeConfig(true),
      source: 'deployed',
      runWrangler: async () => { throw missing; },
    })).rejects.toThrow('jobs-owner-not-enabled');
  });
});
