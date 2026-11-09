import { rewriteStorageUrlsToKeys } from "./rewrite-storage-urls.js";

const INTEGER_FIELDS_BY_TABLE = Object.freeze({
  baiviet: new Set(["noi_bat", "so_tap"]),
  binh_luan: new Set(["id"]),
  luot_xem: new Set(["so_luot"]),
  tap_noi_dung: new Set(["id", "so_thu_tu"]),
});
const BOOLEAN_FIELDS = new Set(["has_muc_luc"]);
const JSON_FIELDS = new Set([
  "tap_tieu_de", "tracks", "pt_player_state", "pt_album_positions",
  "pt_recent_albums", "practice_logs", "bookmarks", "listened_history",
]);
const MEDIA_FIELDS = new Set(["anh_url", "pdf_url", "anh_dai_dien"]);

const TARGET_TABLES = new Map([
  ["public.baiviet", "baiviet"],
  ["public.binh_luan", "binh_luan"],
  ["public.luot_xem", "luot_xem"],
  ["public.phap_thoai", "phap_thoai"],
  ["public.pt_player_sync", "pt_player_sync"],
  ["public.tap_noi_dung", "tap_noi_dung"],
  ["public.user_sync_data", "user_sync_data"],
]);

function normalizeInteger(value, field) {
  if (value === null) return null;
  if (!/^-?\d+$/.test(value)) throw new Error(`invalid-integer:${field}`);
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new Error(`unsafe-integer:${field}`);
  return number;
}

function normalizeJson(value, field) {
  if (value === null) return null;
  try {
    return JSON.stringify(rewriteStorageUrlsToKeys(JSON.parse(value)));
  } catch {
    throw new Error(`invalid-json:${field}`);
  }
}

export function normalizeRecord(table, rawRow) {
  const targetTable = TARGET_TABLES.get(table);
  if (!targetTable) throw new Error(`unsupported-application-table:${table}`);
  const record = {};
  for (const [field, value] of Object.entries(rawRow)) {
    if (BOOLEAN_FIELDS.has(field)) {
      if (value !== "t" && value !== "f" && value !== null) throw new Error(`invalid-boolean:${field}`);
      record[field] = value === null ? null : value === "t" ? 1 : 0;
    } else if (INTEGER_FIELDS_BY_TABLE[targetTable]?.has(field) && value !== null) {
      record[field] = normalizeInteger(value, field);
    } else if (JSON_FIELDS.has(field)) {
      record[field] = normalizeJson(value, field);
    } else if (MEDIA_FIELDS.has(field)) {
      record[field] = rewriteStorageUrlsToKeys(value);
    } else {
      record[field] = rewriteStorageUrlsToKeys(value);
    }
  }
  return { table: targetTable, record };
}

export function columnsToRawRecord(columns, values) {
  if (columns.length !== values.length) throw new Error("column-count-mismatch");
  return Object.fromEntries(columns.map((column, index) => [column, values[index]]));
}
