import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function literal(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

export async function generateD1SealSql({ artifactPath, outputPath, timestamp }) {
  const artifact = JSON.parse(await fs.readFile(artifactPath, 'utf8'));
  const verifiedAt = timestamp || new Date().toISOString();
  const statements = [];

  for (const [table, expected] of Object.entries(artifact.tables)) {
    statements.push(
      `UPDATE migration_table_state SET imported_row_count = ${expected.rowCount}, verified_root_sha256 = ${literal(expected.rootSha256)} WHERE migration_run_id = ${literal(artifact.migrationRunId)} AND table_name = ${literal(table)} AND expected_row_count = ${expected.rowCount} AND expected_root_sha256 = ${literal(expected.rootSha256)};`,
    );
  }
  statements.push(
    `UPDATE migration_runs SET status = 'verified', verified_at = ${literal(verifiedAt)} WHERE id = ${literal(artifact.migrationRunId)} AND status = 'imported';`,
    `UPDATE migration_runs SET status = 'sealed', sealed_at = ${literal(verifiedAt)} WHERE id = ${literal(artifact.migrationRunId)} AND status = 'verified';`,
  );
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${statements.join('\n')}\n`);
  return { migrationRunId: artifact.migrationRunId, tableCount: Object.keys(artifact.tables).length };
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const [artifactPath, outputPath] = process.argv.slice(2);
  generateD1SealSql({ artifactPath, outputPath })
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error) => {
      process.stderr.write(`D1 seal SQL generation failed: ${error.message}\n`);
      process.exitCode = 1;
    });
}
