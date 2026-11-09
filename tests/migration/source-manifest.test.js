import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createSourceManifest } from "../../scripts/migration/create-source-manifest.js";

const temporaryDirectories = [];

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "quangtu-manifest-"));
  temporaryDirectories.push(root);
  const storage = path.join(root, "storage");
  await fs.mkdir(path.join(storage, "covers"), { recursive: true });
  await fs.writeFile(path.join(storage, "covers", "a.webp"), "image");
  await fs.writeFile(path.join(storage, ".DS_Store"), "metadata");
  const sql = path.join(root, "backup.sql");
  await fs.writeFile(sql, [
    "COPY public.baiviet (id, tieu_de) FROM stdin;",
    String.raw`tt_1	Tiếng Việt\nline`,
    "\\.",
    "",
  ].join("\n"));
  return { root, storage, sql };
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    fs.rm(directory, { recursive: true, force: true })));
});

describe("source manifest", () => {
  it("is deterministic apart from generation time and excludes filesystem metadata", async () => {
    const paths = await fixture();
    const first = await createSourceManifest({ ...paths, sqlPath: paths.sql, storagePath: paths.storage, generatedAt: "one" });
    const second = await createSourceManifest({ ...paths, sqlPath: paths.sql, storagePath: paths.storage, generatedAt: "two" });
    expect({ ...first, generatedAt: null }).toEqual({ ...second, generatedAt: null });
    expect(first.storage.objectCount).toBe(1);
    expect(first.storage.objects[0]).toMatchObject({
      objectKey: "covers/a.webp",
      sourcePath: "covers/a.webp",
      contentType: "image/webp",
    });
    expect(first.storage.excluded).toEqual([
      { objectKey: ".DS_Store", reason: "filesystem-metadata" },
    ]);
    expect(first.database.tables["public.baiviet"].rowCount).toBe(1);
  });

  it("rejects symlinks", async (ctx) => {
    const paths = await fixture();
    try {
      await fs.symlink(path.join(paths.storage, "covers", "a.webp"), path.join(paths.storage, "covers", "alias.webp"));
    } catch (error) {
      if (error && (error.code === "EPERM" || error.code === "ENOTSUP")) {
        ctx.skip();
        return;
      }
      throw error;
    }
    await expect(createSourceManifest({
      sqlPath: paths.sql,
      storagePath: paths.storage,
    })).rejects.toThrow("storage-symlink-rejected");
  });

});
