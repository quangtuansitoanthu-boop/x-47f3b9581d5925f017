import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const workspace = path.resolve(import.meta.dirname, '../..');

describe('production workflow release gate', () => {
  it('pins the project and Cloudflare deploy action to Node 24', async () => {
    const [nodeVersion, packageJsonSource, packageLockSource, workflow] = await Promise.all([
      readFile(path.join(workspace, '.nvmrc'), 'utf8'),
      readFile(path.join(workspace, 'package.json'), 'utf8'),
      readFile(path.join(workspace, 'package-lock.json'), 'utf8'),
      readFile(path.join(workspace, '.github/workflows/deploy-cloudflare-worker.yml'), 'utf8'),
    ]);
    const packageJson = JSON.parse(packageJsonSource) as {
      engines?: { node?: string };
      devDependencies?: Record<string, string>;
    };
    const packageLock = JSON.parse(packageLockSource) as {
      packages?: Record<
        string,
        { engines?: { node?: string }; devDependencies?: Record<string, string> }
      >;
    };
    const rootPackage = packageLock.packages?.[''];

    expect(nodeVersion.trim()).toBe('24');
    expect(packageJson.engines?.node).toBe('>=24 <25');
    expect(packageJson.devDependencies?.['@types/node']).toMatch(/^24\./);
    expect(rootPackage?.engines?.node).toBe(packageJson.engines?.node);
    expect(rootPackage?.devDependencies?.['@types/node']).toBe(
      packageJson.devDependencies?.['@types/node'],
    );
    expect(workflow).toContain('node-version: 24');
    expect(workflow.match(/uses: cloudflare\/wrangler-action@v4/g)).toHaveLength(2);
    expect(workflow).not.toContain('cloudflare/wrangler-action@v3');
    expect(workflow.match(/wranglerVersion: "4\.127\.0"/g)).toHaveLength(2);
    expect(packageJson.devDependencies?.wrangler).toBe('4.127.0');
  });

  it('runs core before deployment and keeps browser E2E on demand', async () => {
    const [packageJsonSource, workflow] = await Promise.all([
      readFile(path.join(workspace, 'package.json'), 'utf8'),
      readFile(path.join(workspace, '.github/workflows/deploy-cloudflare-worker.yml'), 'utf8'),
    ]);
    const packageJson = JSON.parse(packageJsonSource) as {
      scripts: Record<string, string>;
    };

    expect(packageJson.scripts['test:core']).toBeDefined();
    expect(packageJson.scripts['test:core']).not.toContain('test:e2e');
    expect(packageJson.scripts['test:e2e']).toContain('playwright test');
    expect(packageJson.scripts['test:release']).toBe(
      'npm run test:core && npm run test:e2e',
    );

    const coreGate = 'run: npm run test:core';
    const ownershipGate = 'run: npm run verify:production-ownership';

    expect(workflow).toContain(coreGate);
    expect(workflow).toContain(ownershipGate);
    expect(workflow).not.toMatch(/test:e2e|test:release|--shard/i);
    const browserInstall = 'run: npx playwright install --with-deps chromium';
    expect(workflow).toContain(browserInstall);
    expect(workflow.indexOf(browserInstall)).toBeLessThan(workflow.indexOf(coreGate));
    expect(workflow).not.toContain('test:rewrite');
    expect(workflow.indexOf(coreGate)).toBeLessThan(
      workflow.indexOf(ownershipGate),
    );
  });

  it('keeps the shared E2E presence limiter above shard navigation volume', async () => {
    const configSource = await readFile(
      path.join(workspace, 'tests/e2e/wrangler.sveltekit.jsonc'),
      'utf8',
    );
    const config = JSON.parse(configSource) as {
      ratelimits: Array<{ name: string; simple: { limit: number; period: number } }>;
    };
    const presenceLimiter = config.ratelimits.find(
      (binding) => binding.name === 'PRESENCE_RATE_LIMITER',
    );

    expect(presenceLimiter?.simple.period).toBe(60);
    expect(presenceLimiter?.simple.limit).toBeGreaterThanOrEqual(1_000);
  });
});
