import { createHash } from "node:crypto";
import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  primaryKeyDigest, rowDigest, sha256, tableRootDigest,
} from "./lib/canonical-data.js";
import {
  inferContentType, normalizeObjectKey, shouldExcludeFile,
} from "./lib/media-files.js";
import { parseCopySections } from "./parse-postgres-copy.js";

export const SOURCE_PRIMARY_KEYS = Object.freeze({
  "auth.identities": ["id"],
  "auth.users": ["id"],
  "public.baiviet": ["id"],
  "public.binh_luan": ["id"],
  "public.luot_xem": ["bai_viet_id"],
  "public.nguoi_dung": ["id"],
  "public.phap_thoai": ["id"],
  "public.pt_player_sync": ["id"],
  "public.tap_noi_dung": ["id"],
  "public.user_sync_data": ["id"],
});

async function hashFile(filePath) {
  const hash = createHash("sha256");
  let byteSize = 0;
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk);
    byteSize += chunk.length;
  }
  return { byteSize, sha256: hash.digest("hex") };
}

async function inventoryStorage(sourceRoot) {
  const objects = [];
  const excluded = [];
  const seen = new Set();
  async function visit(directory) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const filePath = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error("storage-symlink-rejected");
      if (entry.isDirectory()) {
        await visit(filePath);
      } else if (entry.isFile()) {
        const objectKey = normalizeObjectKey(sourceRoot, filePath);
        if (shouldExcludeFile(filePath)) {
          excluded.push({ objectKey, reason: "filesystem-metadata" });
          continue;
        }
        if (seen.has(objectKey)) throw new Error(`duplicate-object-key:${objectKey}`);
        seen.add(objectKey);
        const digest = await hashFile(filePath);
        objects.push({
          objectKey,
          sourcePath: objectKey,
          ...digest,
          contentType: inferContentType(objectKey),
        });
      }
    }
  }
  await visit(sourceRoot);
  objects.sort((left, right) => left.objectKey.localeCompare(right.objectKey));
  return { objects, excluded };
}

async function inventoryDatabase(sqlPath) {
  const tables = new Map();
  const allowedTables = new Set(Object.keys(SOURCE_PRIMARY_KEYS));
  for await (const row of parseCopySections(sqlPath, allowedTables)) {
    const digests = tables.get(row.table) || [];
    digests.push({
      primaryKeyDigest: primaryKeyDigest(SOURCE_PRIMARY_KEYS[row.table], row.columns, row.values),
      rowDigest: rowDigest(row.columns, row.values),
    });
    tables.set(row.table, digests);
  }
  return Object.fromEntries([...allowedTables].sort().map((table) => {
    const rows = tables.get(table) || [];
    return [table, { rowCount: rows.length, rootSha256: tableRootDigest(rows), rows }];
  }));
}

export async function createSourceManifest({
  sqlPath, storagePath, outputPath, generatedAt = new Date().toISOString(),
}) {
  const [sql, storage, tables] = await Promise.all([
    hashFile(sqlPath),
    inventoryStorage(storagePath),
    inventoryDatabase(sqlPath),
  ]);
  const objectBytes = storage.objects.reduce((total, object) => total + object.byteSize, 0);
  const manifest = {
    schemaVersion: 1,
    generatedAt,
    sourceBoundary: "local-backup-only-no-live-delta",
    sql,
    database: { tables },
    storage: {
      objectCount: storage.objects.length,
      byteSize: objectBytes,
      rootSha256: sha256(storage.objects.map((object) =>
        `${object.objectKey}:${object.byteSize}:${object.sha256}\n`).join("")),
      objects: storage.objects,
      excluded: storage.excluded,
    },
  };
  if (outputPath) {
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  }
  return manifest;
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const [sqlPath, storagePath, outputPath] = process.argv.slice(2);
  if (!sqlPath || !storagePath || !outputPath) {
    process.stderr.write("Usage: node create-source-manifest.js <backup.sql> <storage-dir> <output.json>\n");
    process.exitCode = 2;
  } else {
    createSourceManifest({ sqlPath, storagePath, outputPath })
      .then((manifest) => {
        process.stdout.write(JSON.stringify({
          tableCount: Object.keys(manifest.database.tables).length,
          objectCount: manifest.storage.objectCount,
          byteSize: manifest.storage.byteSize,
        }) + "\n");
      })
      .catch((error) => {
        process.stderr.write(`Source manifest failed: ${error.message}\n`);
        process.exitCode = 1;
      });
  }
}
