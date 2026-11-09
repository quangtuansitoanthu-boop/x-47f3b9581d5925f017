import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  canonicalJson, normalizedRecordDigest, sha256,
} from "./lib/canonical-data.js";
import { createSourceManifest } from "./create-source-manifest.js";
import { hashLegacyCredential, benchmarkLegacyKdf } from "./hash-legacy-passwords.js";
import {
  columnsToRawRecord, normalizeRecord,
} from "./normalize-application-records.js";
import { parseCopySections } from "./parse-postgres-copy.js";
import { findSupabaseReferences } from "./rewrite-storage-urls.js";

const ALLOWED_TABLES = new Set([
  "auth.identities", "auth.users", "public.baiviet", "public.binh_luan",
  "public.luot_xem", "public.nguoi_dung", "public.phap_thoai",
  "public.pt_player_sync", "public.tap_noi_dung", "public.user_sync_data",
]);

const TARGET_PRIMARY_KEYS = Object.freeze({
  app_users: ["id"],
  auth_identities: ["id"],
  baiviet: ["id"],
  binh_luan: ["id"],
  legacy_accounts: ["id"],
  luot_xem: ["bai_viet_id"],
  media_objects: ["object_key"],
  phap_thoai: ["id"],
  pt_player_sync: ["id"],
  tap_noi_dung: ["id"],
  user_sync_data: ["id"],
});

function targetPrimaryKey(record, columns) {
  return canonicalJson(columns.map((column) => [column, record[column]]));
}

function buildTableArtifact(table, records) {
  const primaryKey = TARGET_PRIMARY_KEYS[table];
  const rows = records.map((record) => ({
    primaryKey: targetPrimaryKey(record, primaryKey),
    digest: normalizedRecordDigest(record),
  })).sort((left, right) => left.primaryKey.localeCompare(right.primaryKey));
  return {
    primaryKey,
    rowCount: records.length,
    rootSha256: sha256(rows.map((row) => `${row.primaryKey}:${row.digest}\n`).join("")),
    columns: records.length > 0 ? Object.keys(records[0]) : [],
    rows,
    records,
  };
}

function normalizeAuthUser(raw) {
  let metadata = {};
  try {
    metadata = raw.raw_user_meta_data ? JSON.parse(raw.raw_user_meta_data) : {};
  } catch {
    throw new Error("invalid-auth-user-metadata");
  }
  return {
    id: raw.id,
    email: raw.email,
    display_name: metadata.full_name || metadata.name || null,
    avatar_url: metadata.avatar_url || metadata.picture || null,
    role: "user",
    created_at: raw.created_at,
    updated_at: raw.updated_at,
  };
}

function normalizeIdentity(raw, knownUsers) {
  if (!knownUsers.has(raw.user_id)) throw new Error("identity-owner-missing");
  let identityData;
  try {
    identityData = JSON.parse(raw.identity_data);
  } catch {
    throw new Error("invalid-identity-metadata");
  }
  const issuer = identityData.iss ||
    (raw.provider === "google" ? "https://accounts.google.com" : null);
  if (!issuer || !raw.provider || !raw.provider_id) throw new Error("identity-key-incomplete");
  if (identityData.sub != null && String(identityData.sub) !== raw.provider_id) {
    throw new Error("identity-subject-mismatch");
  }
  return {
    id: raw.id,
    user_id: raw.user_id,
    issuer,
    provider: raw.provider,
    provider_subject: raw.provider_id,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    last_sign_in_at: raw.last_sign_in_at,
  };
}

export async function buildMigrationArtifacts({
  sqlPath, storagePath, outputPath, pepper, sourceManifest,
}) {
  if (!pepper) throw new Error("migration-pepper-required");
  const manifest = sourceManifest || await createSourceManifest({ sqlPath, storagePath });
  const recordsByTable = new Map();
  const sourceRows = [];
  for await (const row of parseCopySections(sqlPath, ALLOWED_TABLES)) sourceRows.push(row);
  const authUsers = sourceRows
    .filter((row) => row.table === "auth.users")
    .map((row) => normalizeAuthUser(columnsToRawRecord(row.columns, row.values)));
  const knownUsers = new Set(authUsers.map((user) => user.id));
  recordsByTable.set("app_users", authUsers);
  recordsByTable.set("auth_identities", sourceRows
    .filter((row) => row.table === "auth.identities")
    .map((row) => normalizeIdentity(columnsToRawRecord(row.columns, row.values), knownUsers)));
  for (const row of sourceRows) {
    if (!row.table.startsWith("public.") || row.table === "public.nguoi_dung") continue;
    const normalized = normalizeRecord(row.table, columnsToRawRecord(row.columns, row.values));
    const records = recordsByTable.get(normalized.table) || [];
    records.push(normalized.record);
    recordsByTable.set(normalized.table, records);
  }
  const legacyRecords = sourceRows
    .filter((row) => row.table === "public.nguoi_dung")
    .map((row) => {
      const raw = columnsToRawRecord(row.columns, row.values);
      const credential = hashLegacyCredential(raw.mat_khau, pepper);
      raw.mat_khau = null;
      return {
        id: Number(raw.id),
        username: raw.ten_dang_nhap,
        role: raw.vai_tro,
        ...credential,
        created_at: raw.created_at,
        updated_at: raw.created_at,
      };
    });
  recordsByTable.set("legacy_accounts", legacyRecords);
  recordsByTable.set("media_objects", manifest.storage.objects.map((object) => ({
    object_key: object.objectKey,
    source_path: object.sourcePath || object.objectKey,
    byte_size: object.byteSize,
    sha256: object.sha256,
    content_type: object.contentType,
    cache_control: "public, max-age=31536000, immutable",
    baseline: 1,
    created_at: manifest.generatedAt,
    deleted_at: null,
  })));
  const tables = Object.fromEntries([...recordsByTable.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([table, records]) => [table, buildTableArtifact(table, records)]));
  const oldReferences = findSupabaseReferences(Object.fromEntries(
    Object.entries(tables).map(([table, artifact]) => [table, artifact.records]),
  ));
  if (oldReferences.length) throw new Error(`supabase-reference-remains:${oldReferences.length}`);
  const manifestForHash = { ...manifest, generatedAt: undefined };
  const sourceManifestSha256 = sha256(canonicalJson(manifestForHash));
  const artifact = {
    schemaVersion: 1,
    migrationRunId: `snapshot-${sha256(`${manifest.sql.sha256}:${manifest.storage.rootSha256}`).slice(0, 24)}`,
    sourceSqlSha256: manifest.sql.sha256,
    sourceManifestSha256,
    tables,
    media: manifest.storage,
    kdfBenchmark: benchmarkLegacyKdf(pepper),
  };
  if (outputPath) {
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, `${JSON.stringify(artifact)}\n`, { mode: 0o600 });
  }
  return artifact;
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const [sqlPath, storagePath, outputPath] = process.argv.slice(2);
  const pepper = process.env.MIGRATION_PASSWORD_PEPPER;
  if (!sqlPath || !storagePath || !outputPath || !pepper) {
    process.stderr.write(
      "Usage: MIGRATION_PASSWORD_PEPPER=<secret> node build-migration-artifacts.js <backup.sql> <storage-dir> <output.json>\n",
    );
    process.exitCode = 2;
  } else {
    buildMigrationArtifacts({ sqlPath, storagePath, outputPath, pepper })
      .then((artifact) => {
        process.stdout.write(JSON.stringify({
          migrationRunId: artifact.migrationRunId,
          tableCounts: Object.fromEntries(Object.entries(artifact.tables)
            .map(([table, state]) => [table, state.rowCount])),
          mediaObjectCount: artifact.media.objectCount,
          mediaByteSize: artifact.media.byteSize,
          kdfDurationMs: Math.round(artifact.kdfBenchmark.durationMs),
        }) + "\n");
      })
      .catch((error) => {
        process.stderr.write(`Migration artifact build failed: ${error.message}\n`);
        process.exitCode = 1;
      });
  }
}
