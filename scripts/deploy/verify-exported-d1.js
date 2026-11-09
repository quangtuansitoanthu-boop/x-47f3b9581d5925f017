import { promises as fs } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { verifyDatabase, verifyMediaManifestConsistency } from '../migration/verify-target-state.js';

class ExportedD1 {
  constructor(database) {
    this.database = database;
  }

  prepare(sql) {
    const statement = this.database.prepare(sql);
    const bound = (values = []) => ({
      bind: (...next) => bound(next),
      first: async () => statement.get(...values),
      all: async () => ({ success: true, results: statement.all(...values) }),
    });
    return bound();
  }
}

export async function verifyExportedD1({
  artifactPath,
  exportPath,
  migrationsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../migrations'),
}) {
  const artifact = JSON.parse(await fs.readFile(artifactPath, 'utf8'));
  const sql = await fs.readFile(exportPath, 'utf8');
  const database = new DatabaseSync(':memory:');
  try {
    const migrationFiles = (await fs.readdir(migrationsDir))
      .filter((file) => file.endsWith('.sql'))
      .sort();
    for (const migrationFile of migrationFiles) {
      database.exec(await fs.readFile(path.join(migrationsDir, migrationFile), 'utf8'));
    }
    database.exec('PRAGMA foreign_keys = OFF;');
    database.exec(sql);
    database.exec('PRAGMA foreign_keys = ON;');
    const foreignKeyViolation = database.prepare('PRAGMA foreign_key_check;').get();
    if (foreignKeyViolation) {
      throw new Error(`foreign-key-violation:${foreignKeyViolation.table}`);
    }
    const result = await verifyDatabase(artifact, new ExportedD1(database));
    const run = database.prepare(
      'SELECT status, source_sql_sha256, source_manifest_sha256 FROM migration_runs WHERE id = ?',
    ).get(artifact.migrationRunId);
    if (!run || run.status !== 'imported' ||
        run.source_sql_sha256 !== artifact.sourceSqlSha256 ||
        run.source_manifest_sha256 !== artifact.sourceManifestSha256) {
      throw new Error('migration-run-state-mismatch');
    }
    const media = verifyMediaManifestConsistency(artifact);
    return { ...result, ...media, migrationRunId: artifact.migrationRunId };
  } finally {
    database.close();
  }
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const [artifactPath, exportPath, migrationsDir] = process.argv.slice(2);
  verifyExportedD1({ artifactPath, exportPath, migrationsDir })
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error) => {
      process.stderr.write(`D1 export verification failed: ${error.message}\n`);
      process.exitCode = 1;
    });
}
