import { createHash } from "node:crypto";

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

export function canonicalSourceRow(columns, values) {
  if (columns.length !== values.length) {
    throw new Error(`column-count-mismatch:${columns.length}:${values.length}`);
  }
  return columns.map((column, index) => [
    column,
    values[index] === null ? ["null"] : ["text", values[index]],
  ]);
}

export function rowDigest(columns, values) {
  return sha256(canonicalJson(canonicalSourceRow(columns, values)));
}

export function primaryKeyDigest(primaryKeyColumns, columns, values) {
  const keyed = primaryKeyColumns.map((column) => {
    const index = columns.indexOf(column);
    if (index < 0 || values[index] === null) throw new Error(`invalid-primary-key:${column}`);
    return [column, values[index]];
  });
  return sha256(canonicalJson(keyed));
}

export function tableRootDigest(rows) {
  const entries = [...rows]
    .sort((left, right) => left.primaryKeyDigest.localeCompare(right.primaryKeyDigest))
    .map((row) => `${row.primaryKeyDigest}:${row.rowDigest}\n`);
  return sha256(entries.join(""));
}

export function normalizedRecordDigest(record) {
  return sha256(canonicalJson(record));
}
