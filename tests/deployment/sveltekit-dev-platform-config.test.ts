import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('SvelteKit local Cloudflare platform configuration', () => {
  it('pins adapter emulation to the SvelteKit Wrangler config', async () => {
    const source = await readFile(path.resolve('svelte.config.js'), 'utf8');

    expect(source).toMatch(/platformProxy\s*:\s*\{/u);
    expect(source).toMatch(/configPath\s*:\s*['"]wrangler\.sveltekit\.jsonc['"]/u);
    expect(source).toContain('environment: cloudflareEnvironment');
  });

  it('keeps production remote bindings explicit and isolated from ordinary local dev', async () => {
    const [packageSource, workerSource, runnerSource] = await Promise.all([
      readFile(path.resolve('package.json'), 'utf8'),
      readFile(path.resolve('wrangler.sveltekit.jsonc'), 'utf8'),
      readFile(path.resolve('scripts/dev/start-sveltekit-production-remote.mjs'), 'utf8'),
    ]);
    const packageData = JSON.parse(packageSource);
    const workerConfig = JSON.parse(workerSource);
    const remote = workerConfig.env['production-remote'];
    const production = workerConfig.env['production'];

    expect(packageData.scripts['dev:production-remote']).toBe(
      'node scripts/dev/start-sveltekit-production-remote.mjs',
    );
    expect(remote.d1_databases).toEqual([
      expect.objectContaining({ binding: 'DB', database_name: 'quangtu-db', remote: true }),
    ]);
    expect(remote.r2_buckets).toEqual([
      expect.objectContaining({ binding: 'MEDIA', bucket_name: 'quangtu', remote: true }),
    ]);
    expect(remote.secrets).toBeUndefined();
    for (const key of ['SESSION_SECRET', 'OAUTH_STATE_SECRET', 'RATE_LIMIT_SALT']) {
      expect(remote.vars[key]).toBeTruthy();
    }
    expect(production.secrets.required).toEqual(expect.arrayContaining([
      'SESSION_SECRET',
      'OAUTH_STATE_SECRET',
      'RATE_LIMIT_SALT',
      'GOOGLE_CLIENT_ID',
      'GOOGLE_CLIENT_SECRET',
      'GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON',
    ]));
    expect(remote.vars.APP_ORIGIN).toBe('http://127.0.0.1:4173');
    expect(remote.vars.MEDIA_PUBLIC_BASE_URL).toBe('https://media.quangtu.vn');
    expect(remote.vars.MIGRATION_SEAL_REQUIRED).toBe('true');
    expect(remote.vars.PRACTICE_COMMUNITY_ENABLED).toBe('true');
    expect(production.vars.PRACTICE_COMMUNITY_ENABLED).toBe('true');
    expect(workerConfig.d1_databases[0].remote).toBeUndefined();
    expect(workerConfig.r2_buckets[0].remote).toBeUndefined();
    expect(runnerSource).toContain("CLOUDFLARE_ENV: 'production-remote'");
    expect(runnerSource).toContain('Mọi thao tác CRUD tác động dữ liệu thật');
    expect(runnerSource).not.toContain("'d1', 'migrations'");
  });

  it('bypasses the production migration seal only in the local SvelteKit config', async () => {
    const source = await readFile(path.resolve('wrangler.sveltekit.jsonc'), 'utf8');

    expect(source).toContain('"MIGRATION_SEAL_REQUIRED": "false"');
  });

  it('runs local dev with aligned Cloudflare bindings, migrations, and OAuth authentication', async () => {
    const [packageSource, workerSource, runnerSource] = await Promise.all([
      readFile(path.resolve('package.json'), 'utf8'),
      readFile(path.resolve('wrangler.sveltekit.jsonc'), 'utf8'),
      readFile(path.resolve('scripts/dev/start-sveltekit-local.mjs'), 'utf8'),
    ]);
    const packageData = JSON.parse(packageSource);
    const workerConfig = JSON.parse(workerSource);

    expect(packageData.scripts.dev).toBe('node scripts/dev/start-sveltekit-local.mjs');
    expect(packageData.scripts['dev:sveltekit']).toBeUndefined();
    expect(packageData.scripts['dev:vite']).toContain('--port 4173');
    expect(workerConfig.vars.APP_ORIGIN).toBe('http://127.0.0.1:4173');
    for (const key of ['SESSION_SECRET', 'OAUTH_STATE_SECRET', 'RATE_LIMIT_SALT']) {
      expect(workerConfig.vars[key]).toBeTruthy();
      expect(workerConfig.env.production.vars[key]).toBeUndefined();
    }
    expect(workerConfig.vars.LEGACY_PASSWORD_PEPPER).toBeUndefined();
    expect(runnerSource).toContain("'d1', 'migrations', 'apply'");
    expect(runnerSource).not.toContain("'d1', 'execute'");
    expect(runnerSource).toContain("CI: '1'");
    expect(runnerSource).toContain("prepare('PRAGMA wal_checkpoint(TRUNCATE)')");
    expect(runnerSource).toContain('await checkpointLocalD1State()');
    expect(runnerSource).toContain("'--strictPort'");
    expect(runnerSource).toContain('spawn(process.execPath');
    expect(runnerSource).toContain('spawnSync(process.execPath');
    expect(runnerSource).not.toContain("node_modules', '.bin'");
    expect(runnerSource).toContain('Khu vực quản trị sử dụng OAuth');
  });

  it('keeps service worker registration owned by the explicit PWA lifecycle', async () => {
    const configUrl = pathToFileURL(path.resolve('svelte.config.js')).href;
    const { default: config } = await import(configUrl);

    expect(config.kit.serviceWorker.register).toBe(false);
  });

  it('keeps retired staging resources unreachable from ordinary deploy configuration', async () => {
    const [packageSource, webSource, jobsSource] = await Promise.all([
      readFile(path.resolve('package.json'), 'utf8'),
      readFile(path.resolve('wrangler.sveltekit.jsonc'), 'utf8'),
      readFile(path.resolve('wrangler.jobs.jsonc'), 'utf8'),
    ]);
    const packageData = JSON.parse(packageSource);

    expect(packageData.scripts['deploy:staging']).toBeUndefined();
    expect(packageData.scripts['dev:legacy']).toBeUndefined();
    expect(packageData.scripts['deploy:legacy:rollback']).toBeUndefined();
    for (const source of [webSource, jobsSource]) {
      const config = JSON.parse(source);
      expect(config.env?.staging).toBeUndefined();
    }
  });
});
