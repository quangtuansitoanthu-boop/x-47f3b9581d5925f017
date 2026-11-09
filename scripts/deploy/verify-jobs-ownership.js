import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function readLocalState(configPath, environment) {
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  const selected = environment ? config.env?.[environment] : config;
  return {
    enabled: String(selected?.vars?.JOBS_ENABLED ?? '').toLowerCase() === 'true',
    exists: Boolean(selected),
    versionId: null,
    workerName: String(selected?.name || ''),
  };
}

async function defaultWrangler(args) {
  const executable = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const { stdout } = await execFileAsync(executable, ['wrangler', ...args], {
    maxBuffer: 2 * 1024 * 1024,
  });
  return JSON.parse(stdout);
}

async function readDeployedState(configPath, environment, runWrangler) {
  const local = await readLocalState(configPath, environment);
  try {
    const deployment = await runWrangler([
      'deployments', 'status', '--name', local.workerName, '--json',
    ]);
    const activeVersions = (deployment.versions || [])
      .filter((version) => Number(version.percentage) > 0);
    assert(
      activeVersions.length === 1 && Number(activeVersions[0].percentage) === 100,
      `deployed-version-split:${local.workerName}`,
    );
    const active = activeVersions[0];
    assert(active?.version_id, `deployed-version-missing:${local.workerName}`);
    const version = await runWrangler([
      'versions', 'view', active.version_id, '--name', local.workerName, '--json',
    ]);
    const binding = version.resources?.bindings?.find(
      (entry) => entry.name === 'JOBS_ENABLED' && entry.type === 'plain_text',
    );
    return {
      enabled: String(binding?.text || '').toLowerCase() === 'true',
      exists: true,
      versionId: String(active.version_id),
      workerName: local.workerName,
    };
  } catch (error) {
    if (/does not exist|10007/u.test(String(error?.stderr || error?.message || error))) {
      return { enabled: false, exists: false, versionId: null, workerName: local.workerName };
    }
    throw error;
  }
}

export async function verifyJobsOwnership({
  jobsConfigPath = 'wrangler.jobs.jsonc',
  environment = 'production',
  source = 'local',
  runWrangler = defaultWrangler,
} = {}) {
  assert(source === 'local' || source === 'deployed', 'jobs-ownership-source-invalid');
  const state = source === 'deployed'
    ? await readDeployedState(jobsConfigPath, environment, runWrangler)
    : await readLocalState(jobsConfigPath, environment);
  assert(state.exists && state.enabled, 'jobs-owner-not-enabled');
  return {
    jobsEnabled: state.enabled,
    jobsVersionId: state.versionId,
    source,
    workerName: state.workerName,
  };
}

const isDirectExecution = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectExecution) {
  const [environment = 'production', source = 'local'] = process.argv.slice(2);
  verifyJobsOwnership({ environment, source }).then((result) => {
    process.stdout.write(`Jobs ownership verified: ${JSON.stringify(result)}\n`);
  }).catch((error) => {
    process.stderr.write(`Jobs ownership verification failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
