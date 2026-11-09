import { HttpInputError } from '../http/request.js';
import { parseJsonFields, resolveMediaReferences, sanitizePlainText, sanitizeStoredHtml } from './content.js';

export const TABLES = {
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

export function tableDefinition(name) {
  const definition = TABLES[name];
  if (!definition) throw new HttpInputError(404, 'unknown_table', 'Tài nguyên không tồn tại.');
  return definition;
}

export function buildSelect(table, definition, url, session) {
  const columns = definition.publicColumns && session?.role !== 'admin'
    ? definition.publicColumns
    : definition.columns;
  const requested = (url.searchParams.get('select') || '*').split(',').map((value) => value.trim());
  const selected = requested.includes('*') ? columns : requested.filter((column) => columns.includes(column));
  if (!selected.length) throw new HttpInputError(400, 'invalid_select', 'Danh sách cột không hợp lệ.');
  const clauses = [];
  const bindings = [];
  for (const column of definition.columns) {
    const raw = url.searchParams.get(column);
    if (!raw) continue;
    if (!raw.startsWith('eq.')) throw new HttpInputError(400, 'invalid_filter', 'Chỉ hỗ trợ bộ lọc eq.');
    clauses.push(`${column} = ?`);
    bindings.push(raw.slice(3));
  }
  if (definition.owner) {
    if (!session?.appUserId) throw new HttpInputError(401, 'authentication_required', 'Cần đăng nhập.');
    clauses.push('id = ?');
    bindings.push(ownerId(table, session));
  }
  if (table === 'phap_thoai' && !['ctv', 'admin'].includes(session?.role)) {
    clauses.push("visibility = 'public'");
  }
  if (table === 'baiviet' && !['ctv', 'admin'].includes(session?.role)) {
    clauses.push("trang_thai = 'Hoàn thành'");
  }
  if (table === 'tap_noi_dung' && !['ctv', 'admin'].includes(session?.role)) {
    clauses.push(`EXISTS (
      SELECT 1 FROM baiviet parent_article
      WHERE parent_article.id = tap_noi_dung.bai_viet_id
        AND parent_article.trang_thai = 'Hoàn thành'
    )`);
  }
  const order = parseOrder(url.searchParams.get('order'), definition.columns);
  const defaultLimit = table === 'tap_noi_dung' ? 5000 : 500;
  const maxLimit = table === 'tap_noi_dung' ? 5000 : 1000;
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || defaultLimit), 1), maxLimit);
  return {
    sql: `SELECT ${selected.join(', ')} FROM ${table}${clauses.length ? ` WHERE ${clauses.join(' AND ')}` : ''}${order} LIMIT ?`,
    bindings: [...bindings, limit],
  };
}

export function normalizeWrite(table, definition, input, session) {
  const output = {};
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
    if (session?.role === 'ctv') {
      output.trang_thai = 'Chờ duyệt';
    } else if (!output.trang_thai && session?.role === 'admin') {
      output.trang_thai = 'Đang cập nhật';
    }
  }
  if (output.id != null) {
    output.id = normalizeRecordId(output.id);
  }
  if (definition.owner) output.id = ownerId(table, session);
  if (table === 'binh_luan') {
    // Anonymous callers never own database identity or creation time.
    delete output.id;
    if (!output.bai_viet_id) throw new HttpInputError(400, 'invalid_field', 'bai_viet_id là bắt buộc.');
    output.ten = sanitizePlainText(input.ten, 100);
    output.noi_dung = sanitizePlainText(input.noi_dung, 5_000);
    if (!output.ten || !output.noi_dung) {
      throw new HttpInputError(400, 'invalid_field', 'Tên và nội dung bình luận là bắt buộc.');
    }
    output.email = sanitizePlainText(input.email, 254);
    output.dien_thoai = sanitizePlainText(input.dien_thoai, 40);
    output.tao_luc = new Date().toISOString();
  }
  if (definition.columns.includes('created_at') && !output.created_at) output.created_at = new Date().toISOString();
  if (definition.columns.includes('updated_at')) output.updated_at = new Date().toISOString();
  return output;
}

function normalizeTalkTracks(value) {
  if (!Array.isArray(value) || value.length > 500) {
    throw new HttpInputError(400, 'invalid_tracks', 'Danh sách pháp thoại không hợp lệ.');
  }
  return value.map((track, index) => {
    if (!track || typeof track !== 'object' || Array.isArray(track)) {
      throw new HttpInputError(400, 'invalid_tracks', `Bài pháp thoại ${index + 1} không hợp lệ.`);
    }
    const url = normalizeTrackUrl(track.url);
    const title = sanitizePlainText(track.title || `Bài ${index + 1}`, 500);
    const duration = track.duration_sec == null ? null : Number(track.duration_sec);
    if (!title || (duration != null && (!Number.isFinite(duration) || duration < 0 || duration > 86_400))) {
      throw new HttpInputError(400, 'invalid_tracks', `Bài pháp thoại ${index + 1} không hợp lệ.`);
    }
    return {
      url,
      title,
      ...(duration == null ? {} : { duration_sec: Math.round(duration) }),
    };
  });
}

function normalizeTrackUrl(value) {
  const raw = String(value || '').normalize('NFKC').trim();
  if (/^content\/[A-Za-z0-9._/-]+$/u.test(raw) && !raw.includes('..')) return raw;
  if (/^\/api\/audio\/drive\/[A-Za-z0-9_-]{10,200}$/u.test(raw)) return raw;
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new HttpInputError(400, 'invalid_track_url', 'URL pháp thoại không hợp lệ.');
  }
  const host = url.hostname.toLowerCase();
  const allowedHost = host === 'archive.org' || host.endsWith('.archive.org') ||
    host === 'media.quangtu.vn' || host === 'quangtu.vn';
  if (url.protocol !== 'https:' || !allowedHost || url.username || url.password) {
    throw new HttpInputError(400, 'invalid_track_url', 'URL pháp thoại không thuộc nguồn được phép.');
  }
  return url.toString();
}

function normalizeRecordId(value) {
  const id = String(value).normalize('NFKC').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(id)) {
    throw new HttpInputError(400, 'invalid_id', 'ID chỉ được chứa chữ, số, dấu gạch ngang và gạch dưới.');
  }
  return id;
}

export function serializeRows(rows, definition, env) {
  return rows.map((row) =>
    resolveMediaReferences(parseJsonFields(row, definition.json), env.MEDIA_PUBLIC_BASE_URL));
}

export function ownerId(table, session) {
  if (table === 'user_sync_data') return session.appUserId;
  if (session.appUserId) return `google_${session.appUserId}`;
  const username = String(session.displayName || '').normalize('NFKC').trim().toLocaleLowerCase('vi');
  return `local_${username}`;
}

function parseOrder(value, columns) {
  if (!value) return '';
  const [column, direction] = value.split('.');
  if (!columns.includes(column)) throw new HttpInputError(400, 'invalid_order', 'Sắp xếp không hợp lệ.');
  return ` ORDER BY ${column} ${direction === 'asc' ? 'ASC' : 'DESC'}`;
}
