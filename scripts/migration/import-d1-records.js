const SAFE_IDENTIFIER = /^[a-z][a-z0-9_]*$/;

function assertIdentifier(value) {
  if (!SAFE_IDENTIFIER.test(value)) throw new Error(`unsafe-sql-identifier:${value}`);
  return value;
}

function chunks(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

export async function importRecords(db, table, records, batchSize = 50) {
  assertIdentifier(table);
  if (!Number.isInteger(batchSize) || batchSize < 1) throw new Error("invalid-batch-size");
  if (records.length === 0) return 0;
  const columns = Object.keys(records[0]);
  columns.forEach(assertIdentifier);
  if (records.some((record) => {
    const keys = Object.keys(record);
    return keys.length !== columns.length || keys.some((key, index) => key !== columns[index]);
  })) throw new Error(`record-shape-mismatch:${table}`);
  const placeholders = columns.map(() => "?").join(", ");
  const statement = db.prepare(
    `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})`,
  );
  let imported = 0;
  for (const batch of chunks(records, batchSize)) {
    const prepared = batch.map((record) => statement.bind(...columns.map((column) => record[column])));
    const results = await db.batch(prepared);
    if (results.some((result) => result.success === false)) throw new Error(`d1-batch-failed:${table}`);
    imported += batch.length;
  }
  return imported;
}

export async function assertFreshMigrationTarget(db) {
  const existing = await db.prepare("SELECT COUNT(*) AS count FROM migration_runs").first();
  if (Number(existing?.count || 0) !== 0) throw new Error("migration-target-not-fresh");
}

export async function transitionMigrationRun(db, runId, expectedStatus, nextStatus, at) {
  const timestampColumn = {
    imported: "imported_at",
    verified: "verified_at",
    sealed: "sealed_at",
  }[nextStatus];
  if (!timestampColumn) throw new Error(`invalid-migration-transition:${nextStatus}`);
  const result = await db.prepare(
    `UPDATE migration_runs SET status = ?, ${timestampColumn} = ? WHERE id = ? AND status = ?`,
  ).bind(nextStatus, at, runId, expectedStatus).run();
  if (result.meta?.changes !== 1) throw new Error(`migration-transition-conflict:${expectedStatus}:${nextStatus}`);
}

const IMPORT_ORDER = [
  "baiviet", "app_users", "auth_identities", "legacy_accounts", "binh_luan",
  "luot_xem", "phap_thoai", "pt_player_sync", "tap_noi_dung", "user_sync_data",
  "media_objects",
];

export async function importMigrationArtifact(db, artifact, now = new Date().toISOString()) {
  await assertFreshMigrationTarget(db);
  await db.prepare(
    `INSERT INTO migration_runs
      (id, source_sql_sha256, source_manifest_sha256, status, started_at)
     VALUES (?, ?, ?, 'started', ?)`,
  ).bind(
    artifact.migrationRunId, artifact.sourceSqlSha256,
    artifact.sourceManifestSha256, now,
  ).run();
  const stateStatement = db.prepare(
    `INSERT INTO migration_table_state
      (migration_run_id, table_name, expected_row_count, expected_root_sha256)
     VALUES (?, ?, ?, ?)`,
  );
  await db.batch(Object.entries(artifact.tables).map(([table, state]) =>
    stateStatement.bind(
      artifact.migrationRunId, table, state.rowCount, state.rootSha256,
    )));
  for (const table of IMPORT_ORDER) {
    const state = artifact.tables[table];
    if (!state) throw new Error(`migration-artifact-table-missing:${table}`);
    await importRecords(db, table, state.records);
  }
  await transitionMigrationRun(db, artifact.migrationRunId, "started", "imported", now);
  return { migrationRunId: artifact.migrationRunId, status: "imported" };
}
