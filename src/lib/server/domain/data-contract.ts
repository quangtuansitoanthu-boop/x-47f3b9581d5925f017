import type { AuthPrincipal, CloudflareEnvLike } from '../cloudflare-context';
import { ServerInputError } from '../errors';
import { parseJsonFields, resolveMediaReferences, sanitizePlainText, sanitizeStoredHtml } from './content';

export interface TableDefinition {
  columns: string[];
  publicColumns?: string[];
  json: string[];
  rich: string[];
  publicRead?: boolean;
  writeRole?: 'guest' | 'user' | 'ctv' | 'admin' | null;
  owner?: boolean;
}

export interface QueryOptions {
  select?: string;
  filters?: Record<string, string | null | undefined>;
  order?: string | null;
  limit?: number | null;
  offset?: number | null;
}

export const TABLES: Record<string, TableDefinition> = {
  baiviet: {
    columns: ['id', 'tieu_de', 'tom_tat', 'noi_dung', 'danh_muc', 'tags', 'tac_gia', 'anh_url',
      'link_ngoai', 'noi_bat', 'ngay_dang', 'has_muc_luc', 'so_tap', 'trang_thai', 'tap_tieu_de',
      'created_at', 'updated_at', 'pdf_url'],
    json: ['tap_tieu_de'],
    rich: ['noi_dung'],
    publicRead: true,
    writeRole: 'ctv',
  },
  tap_noi_dung: {
    columns: ['id', 'bai_viet_id', 'so_thu_tu', 'tieu_de', 'tom_tat', 'noi_dung', 'updated_at'],
    json: [],
    rich: ['noi_dung'],
    publicRead: true,
    writeRole: 'ctv',
  },
  luot_xem: {
    columns: ['bai_viet_id', 'so_luot', 'updated_at'],
    json: [],
    rich: [],
    publicRead: true,
    writeRole: null,
  },
  binh_luan: {
    columns: ['id', 'bai_viet_id', 'ten', 'dien_thoai', 'email', 'noi_dung', 'tao_luc'],
    publicColumns: ['id', 'bai_viet_id', 'ten', 'noi_dung', 'tao_luc'],
    json: [],
    rich: [],
    publicRead: true,
    writeRole: 'guest',
  },
  phap_thoai: {
    columns: ['id', 'tieu_de', 'mo_ta', 'chu_de', 'dien_gia', 'archive_id', 'tracks', 'ngay_dang',
      'created_at', 'visibility', 'anh_dai_dien'],
    json: ['tracks'],
    rich: ['mo_ta'],
    publicRead: true,
    writeRole: 'ctv',
  },
  user_sync_data: {
    columns: ['id', 'practice_logs', 'bookmarks', 'listened_history', 'updated_at',
      'pt_player_state', 'pt_album_positions', 'pt_recent_albums', 'pt_favorite_albums', 'pt_listen_later_albums'],
    json: ['practice_logs', 'bookmarks', 'listened_history', 'pt_player_state',
      'pt_album_positions', 'pt_recent_albums', 'pt_favorite_albums', 'pt_listen_later_albums'],
    rich: [],
    publicRead: false,
    writeRole: 'user',
    owner: true,
  },
  pt_player_sync: {
    columns: ['id', 'pt_player_state', 'pt_album_positions', 'pt_recent_albums', 'pt_favorite_albums', 'pt_listen_later_albums', 'updated_at'],
    json: ['pt_player_state', 'pt_album_positions', 'pt_recent_albums', 'pt_favorite_albums', 'pt_listen_later_albums'],
    rich: [],
    publicRead: false,
    writeRole: 'user',
    owner: true,
  },
};

export function tableDefinition(name: string): TableDefinition {
  const definition = TABLES[name];
  if (!definition) throw new ServerInputError(404, 'unknown_table', 'Tài nguyên không tồn tại.');
  return definition;
}

export function buildSelect(
  table: string,
  definition: TableDefinition,
  options: QueryOptions,
  principal: AuthPrincipal | null,
): { sql: string; bindings: unknown[]; selected: string[] } {
  const columns = definition.publicColumns && principal?.role !== 'admin'
    ? definition.publicColumns
    : definition.columns;
  const requested = (options.select || '*').split(',').map((value) => value.trim()).filter(Boolean);
  const selected = requested.includes('*') ? columns : requested.filter((column) => columns.includes(column));
  if (!selected.length) throw new ServerInputError(400, 'invalid_select', 'Danh sách cột không hợp lệ.');
  const clauses: string[] = [];
  const bindings: unknown[] = [];
  for (const column of definition.columns) {
    const raw = options.filters?.[column];
    if (!raw) continue;
    const str = String(raw);
    if (str.startsWith('eq.')) {
      clauses.push(`${column} = ?`);
      bindings.push(str.slice(3));
    } else if (str.startsWith('gt.')) {
      clauses.push(`${column} > ?`);
      bindings.push(str.slice(3));
    } else if (str.startsWith('gte.')) {
      clauses.push(`${column} >= ?`);
      bindings.push(str.slice(4));
    } else if (str.startsWith('lt.')) {
      clauses.push(`${column} < ?`);
      bindings.push(str.slice(3));
    } else if (str.startsWith('lte.')) {
      clauses.push(`${column} <= ?`);
      bindings.push(str.slice(4));
    } else {
      throw new ServerInputError(400, 'invalid_filter', 'Chỉ hỗ trợ bộ lọc eq, gt, gte, lt, lte.');
    }
  }
  if (definition.owner) {
    if (!principal?.appUserId && table === 'user_sync_data') {
      throw new ServerInputError(401, 'authentication_required', 'Cần đăng nhập.');
    }
    clauses.push('id = ?');
    bindings.push(ownerId(table, principal));
  }
  if (table === 'phap_thoai' && !['ctv', 'admin'].includes(principal?.role ?? 'guest')) {
    clauses.push("visibility = 'public'");
  }
  if (table === 'baiviet' && !['ctv', 'admin'].includes(principal?.role ?? 'guest')) {
    clauses.push("trang_thai = 'Hoàn thành'");
  }
  if (table === 'tap_noi_dung' && !['ctv', 'admin'].includes(principal?.role ?? 'guest')) {
    clauses.push(`EXISTS (
      SELECT 1 FROM baiviet parent_article
      WHERE parent_article.id = tap_noi_dung.bai_viet_id
        AND parent_article.trang_thai = 'Hoàn thành'
    )`);
  }
  const order = parseOrder(options.order ?? null, definition.columns);
  const defaultLimit = table === 'tap_noi_dung' ? 5000 : 500;
  const maxLimit = table === 'tap_noi_dung' ? 5000 : 1000;
  const requestedLimit = Number(options.limit ?? defaultLimit);
  const requestedOffset = Number(options.offset ?? 0);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(Math.trunc(requestedLimit), 1), maxLimit)
    : defaultLimit;
  const offset = Number.isFinite(requestedOffset)
    ? Math.min(Math.max(Math.trunc(requestedOffset), 0), 1_000_000)
    : 0;
  return {
    sql: `SELECT ${selected.join(', ')} FROM ${table}${clauses.length ? ` WHERE ${clauses.join(' AND ')}` : ''}${order} LIMIT ?${offset ? ' OFFSET ?' : ''}`,
    bindings: [...bindings, limit, ...(offset ? [offset] : [])],
    selected,
  };
}

export function normalizeWrite(
  table: string,
  definition: TableDefinition,
  input: Record<string, unknown>,
  principal: AuthPrincipal | null,
): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const column of definition.columns) {
    if (!(column in input)) continue;
    if (definition.owner && column === 'id') continue;
    const value = input[column];
    if (definition.json.includes(column)) {
      const normalizedJson = table === 'phap_thoai' && column === 'tracks'
        ? normalizeTalkTracks(value)
        : value;
      output[column] = normalizedJson == null ? null : JSON.stringify(normalizedJson);
    } else if (definition.rich.includes(column)) {
      output[column] = sanitizeStoredHtml(value);
    } else if (typeof value === 'string') {
      output[column] = sanitizePlainText(value, column === 'noi_dung' ? 20_000 : 10_000);
    } else {
      output[column] = value;
    }
  }
  if (table === 'baiviet') {
    if (principal?.role === 'ctv') {
      output.trang_thai = 'Chờ duyệt';
    } else if (!output.trang_thai && principal?.role === 'admin') {
      output.trang_thai = 'Đang cập nhật';
    }
  }
  if (output.id != null) {
    output.id = normalizeRecordId(output.id);
  }
  if (definition.owner) output.id = ownerId(table, principal);
  if (table === 'binh_luan') {
    // Anonymous callers never own database identity or creation time.
    delete output.id;
    if (!output.bai_viet_id) throw new ServerInputError(400, 'invalid_field', 'bai_viet_id là bắt buộc.');
    output.ten = sanitizePlainText(input.ten, 100);
    output.noi_dung = sanitizePlainText(input.noi_dung, 5_000);
    if (!output.ten || !output.noi_dung) {
      throw new ServerInputError(400, 'invalid_field', 'Tên và nội dung bình luận là bắt buộc.');
    }
    output.email = sanitizePlainText(input.email, 254);
    output.dien_thoai = sanitizePlainText(input.dien_thoai, 40);
    output.tao_luc = new Date().toISOString();
  }
  if (definition.columns.includes('created_at') && !output.created_at) output.created_at = new Date().toISOString();
  if (definition.columns.includes('updated_at')) output.updated_at = new Date().toISOString();
  return output;
}

function normalizeTalkTracks(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value) || value.length > 500) {
    throw new ServerInputError(400, 'invalid_tracks', 'Danh sách pháp thoại không hợp lệ.');
  }
  return value.map((track, index) => {
    if (!track || typeof track !== 'object' || Array.isArray(track)) {
      throw new ServerInputError(400, 'invalid_tracks', `Bài pháp thoại ${index + 1} không hợp lệ.`);
    }
    const typedTrack = track as Record<string, unknown>;
    const url = normalizeTrackUrl(typedTrack.url);
    const title = sanitizePlainText(typedTrack.title || `Bài ${index + 1}`, 500);
    const duration = typedTrack.duration_sec == null ? null : Number(typedTrack.duration_sec);
    if (!title || (duration != null && (!Number.isFinite(duration) || duration < 0 || duration > 86_400))) {
      throw new ServerInputError(400, 'invalid_tracks', `Bài pháp thoại ${index + 1} không hợp lệ.`);
    }
    return {
      url,
      title,
      ...(duration == null ? {} : { duration_sec: Math.round(duration) }),
    };
  });
}

function normalizeTrackUrl(value: unknown): string {
  const raw = String(value || '').normalize('NFKC').trim();
  if (/^content\/[A-Za-z0-9._/-]+$/u.test(raw) && !raw.includes('..')) return raw;
  if (/^\/api\/audio\/drive\/[A-Za-z0-9_-]{10,200}$/u.test(raw)) return raw;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ServerInputError(400, 'invalid_track_url', 'URL pháp thoại không hợp lệ.');
  }
  const host = url.hostname.toLowerCase();
  const allowedHost = host === 'archive.org' || host.endsWith('.archive.org') ||
    host === 'media.quangtu.vn' || host === 'quangtu.vn';
  if (url.protocol !== 'https:' || !allowedHost || url.username || url.password) {
    throw new ServerInputError(400, 'invalid_track_url', 'URL pháp thoại không thuộc nguồn được phép.');
  }
  return url.toString();
}

function normalizeRecordId(value: unknown): string {
  const id = String(value).normalize('NFKC').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(id)) {
    throw new ServerInputError(400, 'invalid_id', 'ID chỉ được chứa chữ, số, dấu gạch ngang và gạch dưới.');
  }
  return id;
}

export function serializeRows<T extends Record<string, unknown>>(
  rows: T[],
  definition: TableDefinition,
  env: CloudflareEnvLike,
): T[] {
  return rows.map((row) =>
    resolveMediaReferences(parseJsonFields(row, definition.json), env.MEDIA_PUBLIC_BASE_URL));
}

export function ownerId(table: string, principal: AuthPrincipal | null): string {
  if (table === 'user_sync_data') {
    if (!principal?.appUserId) throw new ServerInputError(401, 'authentication_required', 'Cần đăng nhập.');
    return principal.appUserId;
  }
  if (principal?.appUserId) return `google_${principal.appUserId}`;
  const username = String(principal?.displayName || '').normalize('NFKC').trim().toLocaleLowerCase('vi');
  return `local_${username}`;
}

export function parseConflict(value: string | null | undefined, columns: string[]): string[] {
  if (!value) return [];
  const parsed = value.split(',').map((column) => column.trim());
  if (!parsed.length || parsed.some((column) => !columns.includes(column))) {
    throw new ServerInputError(400, 'invalid_conflict', 'Khóa upsert không hợp lệ.');
  }
  return parsed;
}

function parseOrder(value: string | null, columns: string[]): string {
  if (!value) return '';
  const [column, direction] = value.split('.');
  if (!columns.includes(column)) throw new ServerInputError(400, 'invalid_order', 'Sắp xếp không hợp lệ.');
  return ` ORDER BY ${column} ${direction === 'asc' ? 'ASC' : 'DESC'}`;
}
