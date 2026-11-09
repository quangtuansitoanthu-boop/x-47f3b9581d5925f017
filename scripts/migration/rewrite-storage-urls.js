const SUPABASE_PUBLIC_OBJECT =
  /^https:\/\/[^/]+\.supabase\.co\/storage\/v1\/object\/public\/quangtu\/([^?#]+)([?#].*)?$/i;

export function storageUrlToKey(value) {
  if (typeof value !== "string") return null;
  const match = value.match(SUPABASE_PUBLIC_OBJECT);
  if (!match) return null;
  const decoded = match[1].split("/").map((part) => decodeURIComponent(part)).join("/");
  if (!/^(covers|content|pdfs)\/[^/]+$/.test(decoded)) {
    throw new Error("unsupported-storage-url-key");
  }
  return `${decoded}${match[2] || ""}`;
}

export function rewriteStorageUrlsToKeys(value) {
  if (typeof value === "string") {
    const directKey = storageUrlToKey(value);
    if (directKey) return directKey;
    return value.replace(
      /https:\/\/[^/"'<>\s]+\.supabase\.co\/storage\/v1\/object\/public\/quangtu\/([^?#"'<>\s]+)/gi,
      (_url, encodedKey) => decodeURIComponent(encodedKey),
    );
  }
  if (Array.isArray(value)) return value.map(rewriteStorageUrlsToKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, rewriteStorageUrlsToKeys(child)]));
  }
  return value;
}

export function findSupabaseReferences(value, path = "$") {
  const hits = [];
  if (typeof value === "string" && /supabase\.co/i.test(value)) hits.push(path);
  if (Array.isArray(value)) {
    value.forEach((child, index) => hits.push(...findSupabaseReferences(child, `${path}[${index}]`)));
  } else if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, child]) => {
      hits.push(...findSupabaseReferences(child, `${path}.${key}`));
    });
  }
  return hits;
}
