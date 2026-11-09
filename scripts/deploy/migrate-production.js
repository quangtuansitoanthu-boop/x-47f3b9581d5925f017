import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertRelease, readProductionReleaseConfig, runWrangler, verifyReleasePreflight } from './release-preflight.js';
import { backupProductionD1, verifyBackupMetadata } from './backup-production-d1.js';

export async function migrateProduction({
  approval = process.env.CLOUDFLARE_PRODUCTION_APPROVED,
  githubActions = process.env.GITHUB_ACTIONS === 'true',
  metadataPath = process.env.CLOUDFLARE_D1_BACKUP_METADATA,
  archiveId = process.env.CLOUDFLARE_D1_BACKUP_ARTIFACT_ID,
  runWrangler: execute = runWrangler,
  ...options
} = {}) {
  assertRelease(approval === 'yes', 'production-approval-required');
  assertRelease(!githubActions || (metadataPath && /^[1-9]\d*$/u.test(archiveId || '')), 'private-backup-archive-required');
  const target = await readProductionReleaseConfig(options);
  await verifyReleasePreflight({ ...options, runWrangler: execute });
  const backup = githubActions
    ? await verifyBackupMetadata({ ...options, metadataPath })
    : (await backupProductionD1({ ...options, runWrangler: execute })).metadata;
  await execute(['d1', 'migrations', 'apply', target.databaseName, '--remote', '--config', target.webConfigPath, '--env', 'production']);
  return { backup };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  (async () => {
    assertRelease(process.argv.length === 2, 'migration-arguments-not-supported');
    const result = await migrateProduction();
    process.stdout.write(`Production migration completed; backup: ${JSON.stringify(result.backup)}\n`);
  })().catch((error) => {
    process.stderr.write(`Production migration blocked or failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
