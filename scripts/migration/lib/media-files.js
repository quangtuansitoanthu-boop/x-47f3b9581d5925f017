import path from "node:path";

const MIME_TYPES = new Map([
  [".avif", "image/avif"],
  [".gif", "image/gif"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".mp3", "audio/mpeg"],
  [".pdf", "application/pdf"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
]);

export function normalizeObjectKey(sourceRoot, filePath) {
  const relative = path.relative(sourceRoot, filePath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("object-path-escape");
  }
  const key = relative.split(path.sep).join("/");
  if (key.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error("invalid-object-key");
  }
  return key;
}

export function shouldExcludeFile(filePath) {
  return path.basename(filePath) === ".DS_Store";
}

export function inferContentType(objectKey) {
  return MIME_TYPES.get(path.extname(objectKey).toLowerCase()) || "application/octet-stream";
}

export function assertStableMediaKey(objectKey) {
  if (!/^(covers|content|pdfs)\/[^/]+$/.test(objectKey)) {
    throw new Error(`unsupported-media-key:${objectKey}`);
  }
  return objectKey;
}
