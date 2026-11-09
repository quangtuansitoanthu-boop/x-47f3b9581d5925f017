import { hasRole } from '../auth/rbac.js';
import { HttpInputError } from '../http/request.js';
import {
  buildSelect,
  normalizeWrite,
  serializeRows,
  tableDefinition,
} from '../domain/data-contract.js';

export async function handleData(request, env, session, table) {
  const definition = tableDefinition(table);
  if (definition.owner && (!session || (table === 'user_sync_data' && !session.appUserId))) {
    throw new HttpInputError(session ? 403 : 401, session ? 'account_required' : 'authentication_required',
      session ? 'Cần tài khoản người dùng.' : 'Cần đăng nhập.');
  }
  if (request.method === 'GET') return selectRows(request, env, session, table, definition);
  authorizeWrite(request.method, session, table, definition);
  if (request.method === 'POST') return insertRows(request, env, session, table, definition);
  if (request.method === 'PATCH') return updateRows(request, env, session, table, definition);
  if (request.method === 'DELETE') return deleteRows(request, env, session, table, definition);
  throw new HttpInputError(405, 'method_not_allowed', 'Phương thức không được hỗ trợ.');
}

async function selectRows(request, env, session, table, definition) {
  if (!definition.publicRead && !session?.appUserId) {
    throw new HttpInputError(401, 'authentication_required', 'Cần đăng nhập.');
  }
  const query = buildSelect(table, definition, new URL(request.url), session);
  const result = await env.DB.prepare(query.sql).bind(...query.bindings).all();
  return serializeRows(result.results || [], definition, env);
}

async function insertRows(request, env, session, table, definition) {
  const payload = await readCompatibleJson(request);
  assertPracticeWriteAllowed(env, table, payload);
  const values = (Array.isArray(payload) ? payload : [payload])
    .map((row) => normalizeWrite(table, definition, row, session));
  if (!values.length) throw new HttpInputError(400, 'empty_payload', 'Không có dữ liệu.');
  if (values.length > 100) {
    throw new HttpInputError(413, 'too_many_rows', 'Mỗi yêu cầu chỉ được ghi tối đa 100 bản ghi.');
  }
  if (table === 'phap_thoai') {
    for (const row of values) row.id ||= `pt_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
  }
  const conflict = parseConflict(
    new URL(request.url).searchParams.get('on_conflict') || request.headers.get('x-upsert-key'),
    definition.columns,
  );
  await env.DB.batch(values.map((value) => prepareInsert(env.DB, table, value, conflict)));
  return serializeRows(values, definition, env);
}

async function updateRows(request, env, session, table, definition) {
  const input = await readCompatibleJson(request);
  assertPracticeWriteAllowed(env, table, input);
  const payload = normalizeWrite(table, definition, input, session);
  delete payload.id;
  const filters = buildMutationFilters(new URL(request.url), definition, session, table);
  const columns = Object.keys(payload);
  if (!columns.length || !filters.clauses.length) {
    throw new HttpInputError(400, 'unsafe_mutation', 'Cập nhật cần dữ liệu và bộ lọc.');
  }
  const sql = `UPDATE ${table} SET ${columns.map((column) => `${column} = ?`).join(', ')} WHERE ${filters.clauses.join(' AND ')}`;
  await env.DB.prepare(sql).bind(...columns.map((column) => payload[column]), ...filters.bindings).run();
  return [];
}

function assertPracticeWriteAllowed(env, table, payload) {
  if (table !== 'user_sync_data' || env.AUTOMATIC_PRACTICE_ENABLED !== 'true') return;
  const rows = Array.isArray(payload) ? payload : [payload];
  if (rows.some((row) => Object.prototype.hasOwnProperty.call(row, 'practice_logs'))) {
    throw new HttpInputError(409, 'legacy_practice_write_disabled',
      'Nhật ký tu tập được ghi qua hệ thống phiên tự động.');
  }
}

async function deleteRows(request, env, session, table, definition) {
  if (!hasRole(session, 'admin')) throw new HttpInputError(403, 'forbidden', 'Chỉ quản trị viên được xóa.');
  const filters = buildMutationFilters(new URL(request.url), definition, session, table);
  if (!filters.clauses.length) throw new HttpInputError(400, 'unsafe_mutation', 'Xóa cần bộ lọc.');
  await env.DB.prepare(`DELETE FROM ${table} WHERE ${filters.clauses.join(' AND ')}`)
    .bind(...filters.bindings).run();
  return [];
}

function authorizeWrite(method, session, table, definition) {
  if (table === 'luot_xem') {
    throw new HttpInputError(405, 'use_view_endpoint', 'Dùng endpoint tăng lượt xem.');
  }
  if (table === 'binh_luan') {
    if (method === 'POST') return;
    throw new HttpInputError(405, 'method_not_allowed', 'Bình luận chỉ được tạo qua public API.');
  }
  if (!definition.writeRole || !hasRole(session, definition.writeRole)) {
    throw new HttpInputError(session ? 403 : 401, session ? 'forbidden' : 'authentication_required',
      session ? 'Không đủ quyền.' : 'Cần đăng nhập.');
  }
}

function prepareInsert(db, table, value, conflict) {
  const columns = Object.keys(value).filter((column) => value[column] !== undefined);
  if (!columns.length) throw new HttpInputError(400, 'empty_payload', 'Không có dữ liệu.');
  const placeholders = columns.map(() => '?').join(', ');
  let suffix = '';
  if (conflict.length) {
    const updates = columns.filter((column) => !conflict.includes(column));
    suffix = updates.length
      ? ` ON CONFLICT(${conflict.join(', ')}) DO UPDATE SET ${updates.map((column) => `${column} = excluded.${column}`).join(', ')}`
      : ` ON CONFLICT(${conflict.join(', ')}) DO NOTHING`;
  }
  return db.prepare(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})${suffix}`)
    .bind(...columns.map((column) => value[column]));
}

function buildMutationFilters(url, definition, session, table) {
  const clauses = [];
  const bindings = [];
  for (const column of definition.columns) {
    const value = url.searchParams.get(column);
    if (!value) continue;
    if (!value.startsWith('eq.')) throw new HttpInputError(400, 'invalid_filter', 'Chỉ hỗ trợ bộ lọc eq.');
    clauses.push(`${column} = ?`);
    bindings.push(value.slice(3));
  }
  if (definition.owner) {
    clauses.push('id = ?');
    if (table === 'user_sync_data') {
      bindings.push(session.appUserId);
    } else {
      const username = String(session.displayName || '').normalize('NFKC').trim().toLocaleLowerCase('vi');
      bindings.push(session.appUserId ? `google_${session.appUserId}` : `local_${username}`);
    }
  }
  return { clauses, bindings };
}

function parseConflict(value, columns) {
  if (!value) return [];
  const parsed = value.split(',').map((column) => column.trim());
  if (!parsed.length || parsed.some((column) => !columns.includes(column))) {
    throw new HttpInputError(400, 'invalid_conflict', 'Khóa upsert không hợp lệ.');
  }
  return parsed;
}

async function readCompatibleJson(request) {
  const contentType = request.headers.get('content-type') || '';
  if (!contentType.startsWith('application/json')) {
    throw new HttpInputError(415, 'content_type', 'Yêu cầu phải dùng application/json.');
  }
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > 1_000_000) {
    throw new HttpInputError(413, 'payload_too_large', 'Dữ liệu gửi lên vượt giới hạn.');
  }
  try {
    const parsed = JSON.parse(body);
    if (!parsed || typeof parsed !== 'object') throw new Error();
    if (Array.isArray(parsed) && parsed.some((row) => !row || typeof row !== 'object' || Array.isArray(row))) {
      throw new Error();
    }
    return parsed;
  } catch {
    throw new HttpInputError(400, 'invalid_json', 'JSON không hợp lệ.');
  }
}
