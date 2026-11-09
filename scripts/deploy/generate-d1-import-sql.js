import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_FILE_BYTES = 500_000;
const MAX_LITERAL_BYTES = 30_000;
const SAFE_IDENTIFIER = /^[a-z][a-z0-9_]*$/u;

function identifier(value) {
  if (!SAFE_IDENTIFIER.test(value)) throw new Error(`unsafe-identifier:${value}`);
  return value;
}

function literal(value) {
  if (value == null) return 'NULL';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('non-finite-number');
    return String(value);
  }
  if (typeof value === 'boolean') return value ? '1' : '0';
  return `'${String(value).replaceAll("'", "''")}'`;
}

function splitUtf8(value, maximumBytes = MAX_LITERAL_BYTES) {
  const chunks = [];
  let current = '';
  let currentBytes = 0;
  for (const character of String(value)) {
    const bytes = Buffer.byteLength(character);
    if (current && currentBytes + bytes > maximumBytes) {
      chunks.push(current);
      current = '';
      currentBytes = 0;
    }
    current += character;
    currentBytes += bytes;
  }
  if (current) chunks.push(current);
  return chunks;
}

function insertStatements(table, record, primaryKey) {
  const columns = Object.keys(record).map(identifier);
  const deferred = [];
  const values = columns.map((column) => {
    const value = record[column];
    if (typeof value === 'string' && Buffer.byteLength(value) > MAX_LITERAL_BYTES) {
      deferred.push({ column, value });
      return "''";
    }
    return literal(value);
  });
  const statements = [
    `INSERT INTO ${identifier(table)} (${columns.join(', ')}) VALUES (${values.join(', ')});`,
  ];
  if (!deferred.length) return statements;
  const where = primaryKey.map((column) =>
    `${identifier(column)} = ${literal(record[column])}`).join(' AND ');
  for (const { column, value } of deferred) {
    for (const chunk of splitUtf8(value)) {
      statements.push(
        `UPDATE ${identifier(table)} SET ${identifier(column)} = ${identifier(column)} || ${literal(chunk)} WHERE ${where};`,
      );
    }
  }
  return statements;
}

function buildStatements(artifact, timestamp) {
  const statements = [
    `INSERT INTO migration_runs (id, source_sql_sha256, source_manifest_sha256, status, started_at) VALUES (${literal(artifact.migrationRunId)}, ${literal(artifact.sourceSqlSha256)}, ${literal(artifact.sourceManifestSha256)}, 'started', ${literal(timestamp)});`,
  ];
  for (const [table, state] of Object.entries(artifact.tables)) {
    statements.push(
      `INSERT INTO migration_table_state (migration_run_id, table_name, expected_row_count, expected_root_sha256) VALUES (${literal(artifact.migrationRunId)}, ${literal(table)}, ${state.rowCount}, ${literal(state.rootSha256)});`,
    );
  }
  const order = [
    'baiviet', 'app_users', 'auth_identities', 'legacy_accounts', 'binh_luan',
    'luot_xem', 'phap_thoai', 'pt_player_sync', 'tap_noi_dung', 'user_sync_data',
    'media_objects',
  ];
  for (const table of order) {
    const state = artifact.tables[table];
    if (!state) throw new Error(`missing-table:${table}`);
    for (const record of state.records) {
      statements.push(...insertStatements(table, record, state.primaryKey));
    }
  }
  statements.push(
    `UPDATE migration_runs SET status = 'imported', imported_at = ${literal(timestamp)} WHERE id = ${literal(artifact.migrationRunId)} AND status = 'started';`,
  );
  return statements;
}

export async function generateD1ImportSql({ artifactPath, outputDir, timestamp = new Date().toISOString() }) {
  const artifact = JSON.parse(await fs.readFile(artifactPath, 'utf8'));
  const statements = buildStatements(artifact, timestamp);
  await fs.rm(outputDir, { recursive: true, force: true });
  await fs.mkdir(outputDir, { recursive: true, mode: 0o700 });
  const files = [];
  let buffer = '';
  let index = 1;
  async function flush() {
    if (!buffer) return;
    const file = path.join(outputDir, `${String(index).padStart(3, '0')}-import.sql`);
    await fs.writeFile(file, buffer, { mode: 0o600 });
    files.push(file);
    index += 1;
    buffer = '';
  }
  for (const statement of statements) {
    if (Buffer.byteLength(statement) > 95_000) throw new Error('statement-too-large');
    const line = `${statement}\n`;
    if (buffer && Buffer.byteLength(buffer) + Buffer.byteLength(line) > MAX_FILE_BYTES) await flush();
    buffer += line;
  }
  await flush();
  return {
    migrationRunId: artifact.migrationRunId,
    statementCount: statements.length,
    files,
  };
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const [artifactPath, outputDir] = process.argv.slice(2);
  if (!artifactPath || !outputDir) {
    process.stderr.write('Usage: node generate-d1-import-sql.js <artifact.json> <output-dir>\n');
    process.exitCode = 2;
  } else {
    generateD1ImportSql({ artifactPath, outputDir })
      .then((result) => process.stdout.write(JSON.stringify({
        migrationRunId: result.migrationRunId,
        statementCount: result.statementCount,
        fileCount: result.files.length,
      }) + '\n'))
      .catch((error) => {
        process.stderr.write(`D1 SQL generation failed: ${error.message}\n`);
        process.exitCode = 1;
      });
  }
}
