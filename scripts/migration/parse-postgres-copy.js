import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

const COPY_HEADER =
  /^COPY\s+((?:"[^"]+"|[a-zA-Z_][\w$]*)\.(?:"[^"]+"|[a-zA-Z_][\w$]*))\s+\((.+)\)\s+FROM\s+stdin;$/;

function unquoteIdentifier(identifier) {
  const trimmed = identifier.trim();
  return trimmed.startsWith('"') ? trimmed.slice(1, -1).replaceAll('""', '"') : trimmed;
}

function decodeEscape(line, index) {
  const next = line[index + 1];
  const simple = { b: "\b", f: "\f", n: "\n", r: "\r", t: "\t", v: "\v", "\\": "\\" };
  if (next in simple) return { value: simple[next], consumed: 2 };
  if (next === "x") {
    const match = line.slice(index + 2).match(/^[0-9a-fA-F]{1,2}/);
    if (match) return { value: String.fromCodePoint(Number.parseInt(match[0], 16)), consumed: 2 + match[0].length };
  }
  const octal = line.slice(index + 1).match(/^[0-7]{1,3}/);
  if (octal) return { value: String.fromCodePoint(Number.parseInt(octal[0], 8)), consumed: 1 + octal[0].length };
  return { value: next ?? "", consumed: next === undefined ? 1 : 2 };
}

export function parseCopyLine(line) {
  const values = [];
  let field = "";
  let rawField = "";
  for (let index = 0; index < line.length;) {
    const character = line[index];
    if (character === "\\") {
      const decoded = decodeEscape(line, index);
      field += decoded.value;
      rawField += line.slice(index, index + decoded.consumed);
      index += decoded.consumed;
    } else if (character === "\t") {
      values.push(rawField === "\\N" ? null : field);
      field = "";
      rawField = "";
      index += 1;
    } else {
      field += character;
      rawField += character;
      index += 1;
    }
  }
  values.push(rawField === "\\N" ? null : field);
  return values;
}

export async function* parseCopySections(input, allowedTables) {
  const lines = typeof input === "string"
    ? createInterface({ input: createReadStream(input), crlfDelay: Infinity })
    : createInterface({ input, crlfDelay: Infinity });
  let section = null;
  let rowNumber = 0;
  for await (const line of lines) {
    if (!section) {
      const match = line.match(COPY_HEADER);
      if (!match) continue;
      const table = match[1].split(".").map(unquoteIdentifier).join(".");
      section = {
        table,
        columns: match[2].split(",").map(unquoteIdentifier),
        allowed: allowedTables == null || allowedTables.has(table),
      };
      rowNumber = 0;
      continue;
    }
    if (line === "\\.") {
      section = null;
      continue;
    }
    rowNumber += 1;
    if (!section.allowed) continue;
    const values = parseCopyLine(line);
    if (values.length !== section.columns.length) {
      throw new Error(`copy-column-count:${section.table}:${rowNumber}`);
    }
    yield { table: section.table, columns: section.columns, values, rowNumber };
  }
  if (section) throw new Error(`unterminated-copy-section:${section.table}`);
}
