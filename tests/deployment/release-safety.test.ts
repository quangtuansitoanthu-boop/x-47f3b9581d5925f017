import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const core = ['SESSION_SECRET', 'OAUTH_STATE_SECRET', 'RATE_LIMIT_SALT', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON'];
const facebook = ['FACEBOOK_APP_ID', 'FACEBOOK_APP_SECRET', 'FACEBOOK_TOKEN_ENCRYPTION_KEY'];
const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); });

async function fixture() {
  const directory = await mkdtemp(path.join(tmpdir(), 'release-safety-'));
  directories.push(directory);
  const web = JSON.parse(await readFile('wrangler.sveltekit.jsonc', 'utf8'));
  const jobs = JSON.parse(await readFile('wrangler.jobs.jsonc', 'utf8'));
  const webProd = web['env']['production'];
  const jobsProd = jobs['env']['production'];
  webProd.secrets.required = [...core];
  jobsProd.secrets = { required: [] };
  const webConfigPath = path.join(directory, 'web.json');
  const jobsConfigPath = path.join(directory, 'jobs.json');
  const save = async () => {
    await writeFile(webConfigPath, JSON.stringify(web));
    await writeFile(jobsConfigPath, JSON.stringify(jobs));
  };
  await save();
  return { directory, webProd, jobsProd, save, webConfigPath, jobsConfigPath, processEnv: {} };
}

function secretLookup(args: string[], extras: string[] = []) {
  expect(args.slice(0, 2)).toEqual(['secret', 'list']);
  expect(args).toContain('--format');
  expect(args).toContain('json');
  expect(args).not.toContain('--name');
  const web = path.basename(args[args.indexOf('--config') + 1]) === 'web.json';
  return JSON.stringify((web ? [...core, ...extras] : extras).map((name) => ({ name, type: 'secret_text' })));
}

async function fullSql() {
  const schema = await Promise.all(['0001-application-schema.sql', '0002-auth-and-session-schema.sql', '0003-migration-and-media-operation-schema.sql'].map((name) => readFile(path.join('migrations', name), 'utf8')));
  return `PRAGMA foreign_keys=OFF;\n${schema.join('\n').replaceAll('PRAGMA foreign_keys = ON;', '')}
    CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL);
    INSERT INTO d1_migrations VALUES (1, '0001-application-schema.sql', '2026-09-05');
    INSERT INTO baiviet (id, tieu_de) VALUES ('backup-test', 'Recovery content');`;
}

describe('production release safety', () => {
  it('requires only the six core web secrets while Facebook import remains disabled', async () => {
    const web = JSON.parse(await readFile('wrangler.sveltekit.jsonc', 'utf8'))['env']['production'];
    const jobs = JSON.parse(await readFile('wrangler.jobs.jsonc', 'utf8'))['env']['production'];
    expect(web.vars.FACEBOOK_IMPORT_ENABLED).toBe('false');
    expect(jobs.vars.FACEBOOK_IMPORT_ENABLED).toBe('false');
    expect([...web.secrets.required].sort()).toEqual([...core].sort());
    expect(jobs.secrets?.required ?? []).toEqual([]);
  });

  it('orders readiness, verified backup, private archival, migration and deployment without bypasses', async () => {
    const workflow = await readFile('.github/workflows/deploy-cloudflare-worker.yml', 'utf8');
    const ordered = ['npm run verify:release-preflight', 'npm run backup:production', 'actions/upload-artifact@', 'npm run migrate:production', 'command: deploy --config wrangler.sveltekit.jsonc'];
    for (const step of ordered) expect(workflow).toContain(step);
    for (let index = 1; index < ordered.length; index++) expect(workflow.indexOf(ordered[index - 1])).toBeLessThan(workflow.indexOf(ordered[index]));
    for (const required of ['if-no-files-found: error', 'include-hidden-files: true', 'github.event.repository.private', 'steps.backup-archive.outputs.artifact-id']) expect(workflow).toContain(required);
    expect(workflow).not.toMatch(/continue-on-error:\s*true|if:\s*always\(\)/u);
    expect(workflow).not.toContain('run: npx wrangler d1 migrations apply');
  });

  it('guards the local migration command and synchronizes the patch version', async () => {
    const pkg = JSON.parse(await readFile('package.json', 'utf8'));
    const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
    expect(pkg.scripts['migrate:production']).toBe('node scripts/deploy/migrate-production.js');
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/u);
    expect(lock.version).toBe(pkg.version);
    expect(lock.packages[''].version).toBe(pkg.version);
    const android = await readFile('android/app/build.gradle', 'utf8');
    expect(android.match(/versionName\s+"([^"]+)"/u)?.[1]).toBe(pkg.version);
  });

  it('looks up both workers even when jobs has no required secrets', async () => {
    const { verifyReleasePreflight } = await import('../../scripts/deploy/release-preflight.js');
    const calls: string[][] = [];
    await verifyReleasePreflight({ ...await fixture(), runWrangler: async (args: string[]) => { calls.push(args); return secretLookup(args); } });
    expect(calls.map((args) => path.basename(args[args.indexOf('--config') + 1]))).toEqual(['web.json', 'jobs.json']);
  });

  for (const missing of core) it(`rejects missing core web secret ${missing}`, async () => {
    const { verifyReleasePreflight } = await import('../../scripts/deploy/release-preflight.js');
    await expect(verifyReleasePreflight({ ...await fixture(), runWrangler: async (args: string[]) => JSON.stringify(JSON.parse(secretLookup(args)).filter((entry: { name: string }) => entry.name !== missing)) })).rejects.toThrow(`missing-worker-secrets:quangtu-web:${missing}`);
  });

  for (const worker of ['web', 'jobs'] as const) {
    for (const missing of facebook) it(`requires ${missing} for enabled ${worker} import`, async () => {
      const { verifyReleasePreflight } = await import('../../scripts/deploy/release-preflight.js');
      const input = await fixture();
      input[worker === 'web' ? 'webProd' : 'jobsProd'].vars.FACEBOOK_IMPORT_ENABLED = 'true';
      await input.save();
      await expect(verifyReleasePreflight({ ...input, runWrangler: async (args: string[]) => secretLookup(args, facebook.filter((name) => name !== missing)) })).rejects.toThrow(`missing-worker-secrets:quangtu-${worker}:${missing}`);
    });
    it(`sanitizes ${worker} lookup failure`, async () => {
      const { verifyReleasePreflight } = await import('../../scripts/deploy/release-preflight.js');
      await expect(verifyReleasePreflight({ ...await fixture(), runWrangler: async (args: string[]) => {
        if (path.basename(args[args.indexOf('--config') + 1]) === `${worker}.json`) throw new Error('provider-output-must-not-be-logged');
        return secretLookup(args);
      } })).rejects.toThrow(`secret-lookup-failed:quangtu-${worker}`);
    });
  }

  it('accepts enabled Facebook only with its secrets and configured version', async () => {
    const { verifyReleasePreflight } = await import('../../scripts/deploy/release-preflight.js');
    const input = await fixture();
    input.webProd.vars.FACEBOOK_IMPORT_ENABLED = 'true';
    input.jobsProd.vars.FACEBOOK_IMPORT_ENABLED = 'true';
    await input.save();
    await expect(verifyReleasePreflight({ ...input, runWrangler: async (args: string[]) => secretLookup(args, facebook) })).resolves.toBeDefined();
    input.jobsProd.vars.FACEBOOK_GRAPH_API_VERSION = '';
    await input.save();
    await expect(verifyReleasePreflight({ ...input, runWrangler: async (args: string[]) => secretLookup(args, facebook) })).rejects.toThrow('facebook-config-invalid:quangtu-jobs');
  });

  for (const malformed of ['', '{}', '[null]', '[{"name":"SESSION_SECRET","type":"plain_text"}]', 'not-json']) it(`rejects malformed list ${JSON.stringify(malformed)}`, async () => {
    const { verifyReleasePreflight } = await import('../../scripts/deploy/release-preflight.js');
    await expect(verifyReleasePreflight({ ...await fixture(), runWrangler: async () => malformed })).rejects.toThrow('secret-list-invalid:quangtu-web');
  });

  it('rejects different configured D1 targets before lookup', async () => {
    const { verifyReleasePreflight } = await import('../../scripts/deploy/release-preflight.js');
    const input = await fixture();
    input.jobsProd.d1_databases[0].database_id = crypto.randomUUID();
    await input.save();
    let called = false;
    await expect(verifyReleasePreflight({ ...input, runWrangler: async () => { called = true; return '[]'; } })).rejects.toThrow('production-database-target-mismatch');
    expect(called).toBe(false);
  });

  it('exports the exact full database and verifies real SQLite recovery with private files', async () => {
    const { backupProductionD1, verifyBackupMetadata } = await import('../../scripts/deploy/backup-production-d1.js');
    const input = await fixture();
    const sql = await fullSql();
    const calls: string[][] = [];
    const backup = await backupProductionD1({ ...input, backupRoot: path.join(input.directory, 'backups'), runWrangler: async (args: string[]) => {
      calls.push(args); await writeFile(args[args.indexOf('--output') + 1], sql); return '';
    } });
    expect(calls[0].slice(0, 3)).toEqual(['d1', 'export', input.webProd.d1_databases[0].database_name]);
    expect(calls[0]).toContain('--remote');
    for (const flag of ['--table', '--no-data', '--no-schema']) expect(calls[0]).not.toContain(flag);
    const metadata = JSON.parse(await readFile(backup.metadataPath, 'utf8'));
    expect(Object.keys(metadata).sort()).toEqual(['accountId', 'databaseId', 'databaseName', 'exportPath', 'sha256', 'sizeBytes', 'timestamp'].sort());
    expect(metadata.sha256).toBe(createHash('sha256').update(sql).digest('hex'));
    expect(metadata.sizeBytes).toBe(Buffer.byteLength(sql));
    if (process.platform !== 'win32') {
      expect((await stat(backup.directory)).mode & 0o777).toBe(0o700);
      for (const file of [backup.metadataPath, metadata.exportPath]) expect((await stat(file)).mode & 0o777).toBe(0o600);
    }
    await expect(verifyBackupMetadata({ ...input, metadataPath: backup.metadataPath })).resolves.toMatchObject(metadata);
    await writeFile(metadata.exportPath, `${sql}\n-- changed`);
    await expect(verifyBackupMetadata({ ...input, metadataPath: backup.metadataPath })).rejects.toThrow('backup-hash-mismatch');
  });

  for (const failure of ['lookup', 'export', 'invalid-sql', 'schema-only']) it(`never migrates after ${failure} failure`, async () => {
    const { migrateProduction } = await import('../../scripts/deploy/migrate-production.js');
    const input = await fixture();
    const calls: string[][] = [];
    await expect(migrateProduction({ ...input, approval: 'yes', backupRoot: path.join(input.directory, 'backups'), runWrangler: async (args: string[]) => {
      calls.push(args);
      if (args[0] === 'secret') { if (failure === 'lookup') throw new Error('lookup failed'); return secretLookup(args); }
      if (args[1] === 'export') {
        if (failure === 'export') throw new Error('export failed');
        await writeFile(args[args.indexOf('--output') + 1], failure === 'invalid-sql' ? 'invalid export' : (await fullSql()).replace(/INSERT INTO[^;]+;/gu, ''));
      }
      return '';
    } })).rejects.toThrow();
    expect(calls.some((args) => args.includes('migrations'))).toBe(false);
  });

  it('requires approval and successful CI archival before any work', async () => {
    const { migrateProduction } = await import('../../scripts/deploy/migrate-production.js');
    const input = await fixture();
    const runWrangler = async () => { throw new Error('must not invoke wrangler'); };
    await expect(migrateProduction({ ...input, approval: '', runWrangler })).rejects.toThrow('production-approval-required');
    await expect(migrateProduction({ ...input, approval: 'yes', githubActions: true, runWrangler })).rejects.toThrow('private-backup-archive-required');
  });

  it('applies only after both workers pass and a local full backup verifies', async () => {
    const { migrateProduction } = await import('../../scripts/deploy/migrate-production.js');
    const input = await fixture();
    const calls: string[][] = [];
    const result = await migrateProduction({ ...input, approval: 'yes', githubActions: false, backupRoot: path.join(input.directory, 'backups'), runWrangler: async (args: string[]) => {
      calls.push(args);
      if (args[0] === 'secret') return secretLookup(args);
      if (args[1] === 'export') await writeFile(args[args.indexOf('--output') + 1], await fullSql());
      return '';
    } });
    expect(calls.map((args) => args.slice(0, 2))).toEqual([['secret', 'list'], ['secret', 'list'], ['d1', 'export'], ['d1', 'migrations']]);
    expect(calls.at(-1)).toEqual(['d1', 'migrations', 'apply', input.webProd.d1_databases[0].database_name, '--remote', '--config', input.webConfigPath, '--env', 'production']);
    expect(result.backup.sha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(await readdir(path.dirname(result.backup.exportPath))).toEqual(['database.sql', 'metadata.json']);
  });

  it('restores exported views before their INSTEAD OF triggers without altering the original backup', async () => {
    const { verifyFullD1Export, orderD1ExportForRestore } = await import('../../scripts/deploy/backup-production-d1.js');
    const input = await fixture();
    const sql = `${await fullSql()}
      CREATE TABLE recovery_events (value TEXT);
      CREATE TRIGGER recovery_insert INSTEAD OF INSERT ON recovery_input BEGIN
        INSERT INTO recovery_events VALUES (NEW.value);
      END;
      CREATE VIEW recovery_input AS SELECT value FROM recovery_events;
      INSERT INTO baiviet (id, tieu_de) VALUES ('quoted-sql', 'CREATE VIEW not_a_view AS SELECT 1;');`;
    const file = path.join(input.directory, 'raw.sql');
    await writeFile(file, sql);
    await expect(verifyFullD1Export(file)).resolves.toMatchObject({ sizeBytes: Buffer.byteLength(sql) });
    expect(await readFile(file, 'utf8')).toBe(sql);
    const restored = new DatabaseSync(':memory:');
    try {
      restored.exec(orderD1ExportForRestore(sql));
      restored.exec("INSERT INTO recovery_input VALUES ('restored')");
      expect(restored.prepare('SELECT value FROM recovery_events').get()?.value).toBe('restored');
      expect(restored.prepare("SELECT tieu_de FROM baiviet WHERE id = 'quoted-sql'").get()?.tieu_de).toBe('CREATE VIEW not_a_view AS SELECT 1;');
    } finally { restored.close(); }
  });

  it('rejects malformed jobs metadata after a successful web lookup', async () => {
    const { verifyReleasePreflight } = await import('../../scripts/deploy/release-preflight.js');
    await expect(verifyReleasePreflight({ ...await fixture(), runWrangler: async (args: string[]) =>
      path.basename(args[args.indexOf('--config') + 1]) === 'web.json' ? secretLookup(args) : '{}',
    })).rejects.toThrow('secret-list-invalid:quangtu-jobs');
  });

  for (const failure of ['empty', 'missing-schema', 'foreign-key']) it(`rejects a ${failure} recovery image`, async () => {
    const { verifyFullD1Export } = await import('../../scripts/deploy/backup-production-d1.js');
    const input = await fixture();
    const file = path.join(input.directory, 'invalid.sql');
    const sql = failure === 'empty' ? '' : `${await fullSql()}\n${failure === 'missing-schema'
      ? 'DROP TABLE media_objects;'
      : "INSERT INTO binh_luan (id, bai_viet_id) VALUES (1, 'missing-article');"}`;
    await writeFile(file, sql);
    await expect(verifyFullD1Export(file)).rejects.toThrow(failure === 'empty' ? 'backup-file-invalid'
      : failure === 'missing-schema' ? 'backup-schema-missing:media_objects' : 'backup-foreign-key-failed');
  });

  it('revalidates the exact archived CI backup and rejects tampering before migration', async () => {
    const { backupProductionD1 } = await import('../../scripts/deploy/backup-production-d1.js');
    const { migrateProduction } = await import('../../scripts/deploy/migrate-production.js');
    const input = await fixture();
    const sql = await fullSql();
    const backup = await backupProductionD1({ ...input, backupRoot: path.join(input.directory, 'backups'), runWrangler: async (args: string[]) => {
      await writeFile(args[args.indexOf('--output') + 1], sql); return '';
    } });
    const calls: string[][] = [];
    const options = { ...input, approval: 'yes', githubActions: true, archiveId: '123', metadataPath: backup.metadataPath,
      runWrangler: async (args: string[]) => { calls.push(args); return args[0] === 'secret' ? secretLookup(args) : ''; },
    };
    await expect(migrateProduction(options)).resolves.toMatchObject({ backup: backup.metadata });
    expect(calls.map((args) => args.slice(0, 2))).toEqual([['secret', 'list'], ['secret', 'list'], ['d1', 'migrations']]);
    calls.length = 0;
    await writeFile(backup.metadata.exportPath, `${sql}\n-- changed after archive`);
    await expect(migrateProduction(options)).rejects.toThrow('backup-hash-mismatch');
    expect(calls.some((args) => args.includes('migrations'))).toBe(false);
    calls.length = 0;
    await expect(migrateProduction({ ...options, archiveId: '' })).rejects.toThrow('private-backup-archive-required');
    expect(calls).toEqual([]);
  });
});
