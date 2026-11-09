import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  importRecords, transitionMigrationRun,
} from "../../scripts/migration/import-d1-records.js";

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    fs.rm(directory, { recursive: true, force: true })));
});

function canRunSqlite() {
  try {
    execFileSync("sqlite3", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

describe("D1 schema and prepared importer", () => {
  it("writes every feature capability seal only after its schema work", async () => {
    const workspace = path.resolve(import.meta.dirname, "../..");
    const cases = [
      ["0017-user-activity-foundations.sql", "user-activity-foundations-v1"],
      ["0018-audio-library-and-speaker.sql", "audio-library-and-speaker-v1"],
      ["0021-facebook-import-scan-continuation.sql", "facebook-import-v1"],
      ["0020-practice-community-achievements.sql", "practice-community-v1"],
    ];

    for (const [file, capability] of cases) {
      const source = await fs.readFile(path.join(workspace, "migrations", file), "utf8");
      const sealIndex = source.lastIndexOf(`VALUES ('${capability}'`);
      expect(sealIndex, `${file} capability seal`).toBeGreaterThan(0);
      expect(source.slice(sealIndex)).not.toMatch(/\b(?:CREATE|ALTER)\s+(?:TABLE|INDEX)\b/iu);
    }
  });

  it.skipIf(!canRunSqlite())("applies all migrations with foreign keys and ownership constraints", async () => {
    const workspace = path.resolve(import.meta.dirname, "../..");
    const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "quangtu-schema-"));
    temporaryDirectories.push(temporary);
    const database = path.join(temporary, "schema.sqlite");
    const migrationDirectory = path.join(workspace, "migrations");
    const migrationFiles = (await fs.readdir(migrationDirectory))
      .filter((file) => file.endsWith(".sql"))
      .sort();
    const migrationSources = await Promise.all(migrationFiles.map(async (file) => ({
      file,
      source: await fs.readFile(path.join(migrationDirectory, file), "utf8"),
    })));
    const baselineMigrations = migrationSources
      .filter(({ file }) => file < "0017")
      .map(({ source }) => source);
    const upgradeMigrations = migrationSources
      .filter(({ file }) => file >= "0017")
      .map(({ source }) => source);
    const output = execFileSync("sqlite3", [database], {
      input: `${baselineMigrations.join("\n")}
        INSERT INTO app_users (id, role) VALUES ('user-1', 'user');
        INSERT INTO media_objects
          (object_key, source_path, byte_size, sha256, content_type, baseline, created_at)
        VALUES ('covers/baseline.webp', 'covers/baseline.webp', 1, 'digest', 'image/webp', 1, 'now');
        INSERT INTO phap_thoai (id, tieu_de) VALUES ('talk-1', 'Preserved talk');
        INSERT INTO user_sync_data (id, updated_at) VALUES ('user-1', 'now');
        ${upgradeMigrations.join("\n")}
        SELECT tieu_de || ':' || COALESCE(dien_gia, 'none') FROM phap_thoai WHERE id = 'talk-1';
        DELETE FROM app_users WHERE id = 'user-1';
        SELECT COUNT(*) FROM user_sync_data;
        SELECT group_concat(capability || ':' || schema_version, ',')
        FROM (
          SELECT capability, schema_version
          FROM app_schema_capabilities
          ORDER BY capability
        );
        SELECT COUNT(*) FROM pragma_table_info('phap_thoai') WHERE name = 'dien_gia';
        SELECT instr(sql, '''favorite''') > 0 AND instr(sql, '''listen_later''') > 0
        FROM sqlite_master WHERE type = 'table' AND name = 'player_sync_items';
        PRAGMA foreign_key_check;`,
      encoding: "utf8",
    }).trim();
    expect(output).toBe([
      "Preserved talk:none",
      "0",
      "audio-library-and-speaker-v1:18,facebook-import-v1:21,practice-community-v1:20,user-activity-foundations-v1:17",
      "1",
      "1",
    ].join("\n"));
  });

  it("uses short prepared SQL and bounded D1 batches", async () => {
    const bound = [];
    const batch = vi.fn(async (statements) => {
      bound.push(...statements);
      return statements.map(() => ({ success: true }));
    });
    const statement = { bind: vi.fn((...values) => ({ values })) };
    const db = { prepare: vi.fn(() => statement), batch };
    const records = Array.from({ length: 5 }, (_, id) => ({ id, body: "x".repeat(463_000) }));
    await expect(importRecords(db, "baiviet", records, 2)).resolves.toBe(5);
    expect(db.prepare.mock.calls[0][0].length).toBeLessThan(100);
    expect(batch).toHaveBeenCalledTimes(3);
    expect(bound[0].values[1]).toHaveLength(463_000);
  });

  it("requires compare-and-set ledger transitions", async () => {
    const run = vi.fn(async () => ({ meta: { changes: 0 } }));
    const bind = vi.fn(() => ({ run }));
    const db = { prepare: vi.fn(() => ({ bind })) };
    await expect(transitionMigrationRun(
      db, "run", "imported", "verified", "now",
    )).rejects.toThrow("migration-transition-conflict");
  });
});
