import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { REQUIRED_SECRETS } from './verify-secret-continuity.js';

const execFileAsync = promisify(execFile);
const wranglerEntrypoint = fileURLToPath(new URL('../../node_modules/wrangler/bin/wrangler.js', import.meta.url));
const FACEBOOK_SECRETS = ['FACEBOOK_APP_ID', 'FACEBOOK_APP_SECRET', 'FACEBOOK_TOKEN_ENCRYPTION_KEY'];
export function assertRelease(condition, message) {
  if (!condition) throw new Error(message);
}

export async function runWrangler(args) {
  try {
    // execFile cannot launch .cmd on Windows. Run the pinned local CLI directly
    // through Node, without a shell or argument re-parsing.
    const { stdout } = await execFileAsync(process.execPath, [wranglerEntrypoint, ...args], {
      maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env, CI: '1', WRANGLER_SEND_METRICS: 'false' },
    });
    return stdout;
  } catch {
    // Provider output can contain credentials or database content.
    throw new Error(`wrangler-command-failed:${args[0]}:${args[1]}`);
  }
}

export async function readProductionReleaseConfig({
  webConfigPath = 'wrangler.sveltekit.jsonc',
  jobsConfigPath = 'wrangler.jobs.jsonc',
  processEnv = process.env,
} = {}) {
  const configs = [];
  for (const configPath of [webConfigPath, jobsConfigPath]) {
    let root;
    try { root = JSON.parse(await readFile(configPath, 'utf8')); }
    catch { throw new Error(`production-config-invalid:${configPath}`); }
    const selected = root['env']?.production;
    const database = selected?.d1_databases?.find((entry) => entry.binding === 'DB');
    assertRelease(selected?.name && /^[a-zA-Z0-9_-]+$/u.test(selected.name), 'production-worker-name-invalid');
    assertRelease(/^[a-f0-9]{32}$/u.test(root.account_id || ''), 'production-account-invalid');
    assertRelease(!processEnv.CLOUDFLARE_ACCOUNT_ID || processEnv.CLOUDFLARE_ACCOUNT_ID === root.account_id, 'production-account-override-mismatch');
    assertRelease(database?.database_name && /^[a-f0-9-]{36}$/u.test(database.database_id || ''), 'production-database-invalid');
    const enabled = selected.vars?.FACEBOOK_IMPORT_ENABLED;
    assertRelease(enabled === 'true' || enabled === 'false', `facebook-flag-invalid:${selected.name}`);
    if (enabled === 'true') {
      assertRelease(/^v\d+\.\d+$/u.test(selected.vars.FACEBOOK_GRAPH_API_VERSION || '')
        && /^[A-Za-z0-9_-]{1,32}$/u.test(selected.vars.FACEBOOK_TOKEN_KEY_VERSION || ''), `facebook-config-invalid:${selected.name}`);
    }
    const declared = selected.secrets?.required ?? [];
    assertRelease(Array.isArray(declared) && declared.every((name) => /^[A-Z][A-Z0-9_]*$/u.test(name)), `required-secrets-invalid:${selected.name}`);
    configs.push({
      accountId: root.account_id, configPath, database,
      workerName: selected.name, facebookImportEnabled: enabled === 'true',
      requiredSecrets: [...new Set([
        ...(configs.length === 0 ? REQUIRED_SECRETS : []), ...declared,
        ...(enabled === 'true' ? FACEBOOK_SECRETS : []),
      ])],
    });
  }
  const [web, jobs] = configs;
  assertRelease(web.workerName !== jobs.workerName, 'production-worker-target-duplicate');
  assertRelease(web.accountId === jobs.accountId && web.database.database_id === jobs.database.database_id
    && web.database.database_name === jobs.database.database_name, 'production-database-target-mismatch');
  return { accountId: web.accountId, databaseId: web.database.database_id, databaseName: web.database.database_name, webConfigPath, workers: configs };
}

export async function verifyReleasePreflight({ runWrangler: execute = runWrangler, ...options } = {}) {
  const config = await readProductionReleaseConfig(options);
  const workers = [];
  for (const worker of config.workers) {
    let raw;
    try { raw = await execute(['secret', 'list', '--config', worker.configPath, '--env', 'production', '--format', 'json']); }
    catch { throw new Error(`secret-lookup-failed:${worker.workerName}`); }
    let entries;
    try { entries = JSON.parse(raw); }
    catch { throw new Error(`secret-list-invalid:${worker.workerName}`); }
    assertRelease(Array.isArray(entries) && entries.every((entry) => entry && entry.type === 'secret_text'
      && /^[A-Z][A-Z0-9_]*$/u.test(entry.name || '')), `secret-list-invalid:${worker.workerName}`);
    const names = new Set(entries.map((entry) => entry.name));
    assertRelease(names.size === entries.length, `secret-list-invalid:${worker.workerName}`);
    const missing = worker.requiredSecrets.filter((name) => !names.has(name));
    assertRelease(!missing.length, `missing-worker-secrets:${worker.workerName}:${missing.join(',')}`);
    workers.push({ workerName: worker.workerName, facebookImportEnabled: worker.facebookImportEnabled, requiredSecrets: worker.requiredSecrets });
  }
  return { accountId: config.accountId, databaseId: config.databaseId, databaseName: config.databaseName, workers };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  verifyReleasePreflight().then((result) => process.stdout.write(`${JSON.stringify(result)}\n`)).catch((error) => {
    process.stderr.write(`Release preflight failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
