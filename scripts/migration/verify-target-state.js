import { createHash } from "node:crypto";
import {
  canonicalJson, normalizedRecordDigest, sha256,
} from "./lib/canonical-data.js";
import { transitionMigrationRun } from "./import-d1-records.js";

const SAFE_IDENTIFIER = /^[a-z][a-z0-9_]*$/;

function assertIdentifier(value) {
  if (!SAFE_IDENTIFIER.test(value)) throw new Error(`unsafe-sql-identifier:${value}`);
  return value;
}

function rootForRecords(records, primaryKey) {
  const rows = records.map((record) => ({
    primaryKey: canonicalJson(primaryKey.map((column) => [column, record[column]])),
    digest: normalizedRecordDigest(record),
  })).sort((left, right) => left.primaryKey.localeCompare(right.primaryKey));
  return sha256(rows.map((row) => `${row.primaryKey}:${row.digest}\n`).join(""));
}

export async function verifyDatabase(artifact, db) {
  const mismatches = [];
  for (const [table, expected] of Object.entries(artifact.tables)) {
    assertIdentifier(table);
    expected.columns.forEach(assertIdentifier);
    const result = await db.prepare(
      `SELECT ${expected.columns.join(", ")} FROM ${table}`,
    ).all();
    const records = result.results || [];
    const rootSha256 = rootForRecords(records, expected.primaryKey);
    if (records.length !== expected.rowCount || rootSha256 !== expected.rootSha256) {
      mismatches.push({ table, expectedCount: expected.rowCount, actualCount: records.length });
    }
  }
  const foreignKeys = await db.prepare("PRAGMA foreign_key_check").all();
  if ((foreignKeys.results || []).length) mismatches.push({ table: "foreign_key_check" });
  if (mismatches.length) throw new Error(`database-verification-failed:${mismatches.length}`);
  return { tableCount: Object.keys(artifact.tables).length, mismatches: [] };
}

export function verifyMediaManifestConsistency(artifact) {
  const table = artifact.tables?.media_objects;
  const objects = artifact.media?.objects;
  if (!table || !Array.isArray(objects) || table.rowCount !== artifact.media.objectCount) {
    throw new Error("media-manifest-artifact-mismatch");
  }
  const expected = objects.map((object) => ({
    object_key: object.objectKey,
    source_path: object.sourcePath || object.objectKey,
    byte_size: object.byteSize,
    sha256: object.sha256,
    content_type: object.contentType,
    baseline: 1,
  })).sort((left, right) => left.object_key.localeCompare(right.object_key));
  const actual = table.records.map((object) => ({
    object_key: object.object_key,
    source_path: object.source_path,
    byte_size: object.byte_size,
    sha256: object.sha256,
    content_type: object.content_type,
    baseline: object.baseline,
  })).sort((left, right) => left.object_key.localeCompare(right.object_key));
  const byteSize = expected.reduce((total, object) => total + object.byte_size, 0);
  if (byteSize !== artifact.media.byteSize || canonicalJson(actual) !== canonicalJson(expected)) {
    throw new Error("media-manifest-artifact-mismatch");
  }
  return { objectCount: expected.length, byteSize };
}

async function hashR2Body(object) {
  const hash = createHash("sha256");
  if (object.body && Symbol.asyncIterator in Object(object.body)) {
    for await (const chunk of object.body) hash.update(chunk);
  } else {
    hash.update(Buffer.from(await object.arrayBuffer()));
  }
  return hash.digest("hex");
}

async function listAllKeys(bucket) {
  const keys = [];
  let cursor;
  do {
    const page = await bucket.list({ cursor });
    keys.push(...page.objects.map((object) => object.key));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return keys.sort();
}

export async function verifyObjects(artifact, bucket, { allowAdditionalObjects = false } = {}) {
  if (!allowAdditionalObjects) {
    const actualKeys = await listAllKeys(bucket);
    const expectedKeys = artifact.media.objects.map((object) => object.objectKey).sort();
    if (canonicalJson(actualKeys) !== canonicalJson(expectedKeys)) {
      throw new Error("r2-key-set-mismatch");
    }
  }
  let byteSize = 0;
  for (const expected of artifact.media.objects) {
    const object = await bucket.get(expected.objectKey);
    if (!object) throw new Error(`r2-object-missing:${expected.objectKey}`);
    const actualHash = await hashR2Body(object);
    if (object.size !== expected.byteSize || actualHash !== expected.sha256) {
      throw new Error(`r2-object-mismatch:${expected.objectKey}`);
    }
    byteSize += object.size;
  }
  if (byteSize !== artifact.media.byteSize) throw new Error("r2-total-byte-mismatch");
  return { objectCount: artifact.media.objectCount, byteSize };
}

export async function verifyAndSealMigration(artifact, db, bucket, now = new Date().toISOString()) {
  verifyMediaManifestConsistency(artifact);
  await verifyDatabase(artifact, db);
  await verifyObjects(artifact, bucket);
  for (const [table, expected] of Object.entries(artifact.tables)) {
    const result = await db.prepare(
      `UPDATE migration_table_state
       SET imported_row_count = ?, verified_root_sha256 = ?
       WHERE migration_run_id = ? AND table_name = ? AND expected_row_count = ? AND expected_root_sha256 = ?`,
    ).bind(
      expected.rowCount, expected.rootSha256, artifact.migrationRunId,
      table, expected.rowCount, expected.rootSha256,
    ).run();
    if (result.meta?.changes !== 1) throw new Error(`migration-table-state-conflict:${table}`);
  }
  await transitionMigrationRun(db, artifact.migrationRunId, "imported", "verified", now);
  await transitionMigrationRun(db, artifact.migrationRunId, "verified", "sealed", now);
  return { migrationRunId: artifact.migrationRunId, sealedAt: now };
}
