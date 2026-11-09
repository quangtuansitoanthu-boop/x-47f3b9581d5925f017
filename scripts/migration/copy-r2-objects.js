import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { assertStableMediaKey } from "./lib/media-files.js";

export function createR2CopyPlan(sourceRoot, sourceManifest) {
  const storage = sourceManifest.storage || sourceManifest.media;
  if (!storage?.objects) throw new Error("r2-source-manifest-invalid");
  return storage.objects.map((object) => {
    assertStableMediaKey(object.objectKey);
    const relativeSourcePath = object.sourcePath || object.objectKey;
    assertStableMediaKey(relativeSourcePath);
    const sourcePath = path.resolve(sourceRoot, ...relativeSourcePath.split("/"));
    if (!sourcePath.startsWith(`${path.resolve(sourceRoot)}${path.sep}`)) {
      throw new Error("r2-source-path-escape");
    }
    return {
      sourcePath,
      objectKey: object.objectKey,
      byteSize: object.byteSize,
      sha256: object.sha256,
      httpMetadata: { contentType: object.contentType },
      customMetadata: { sha256: object.sha256, baseline: "true" },
    };
  });
}

export async function copyObjects(sourceRoot, bucket, sourceManifest) {
  const plan = createR2CopyPlan(sourceRoot, sourceManifest);
  for (const item of plan) {
    const stat = await fs.lstat(item.sourcePath);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== item.byteSize) {
      throw new Error(`r2-source-changed:${item.objectKey}`);
    }
    await bucket.put(item.objectKey, createReadStream(item.sourcePath), {
      httpMetadata: item.httpMetadata,
      customMetadata: item.customMetadata,
    });
  }
  return { objectCount: plan.length, byteSize: plan.reduce((sum, item) => sum + item.byteSize, 0) };
}
