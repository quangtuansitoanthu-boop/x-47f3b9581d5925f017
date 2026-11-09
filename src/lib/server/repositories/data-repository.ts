import type { AuthPrincipal, CloudflareEnvLike, D1PreparedStatement, D1ResultRow } from '../cloudflare-context';
import { ServerInputError } from '../errors';
import { buildSelect, normalizeWrite, parseConflict, tableDefinition, type QueryOptions } from '../domain/data-contract';

export interface MutationFilters {
  [key: string]: string | null | undefined;
}

export function createDataRepository(env: CloudflareEnvLike) {
  return {
    async select(table: string, options: QueryOptions, principal: AuthPrincipal | null): Promise<D1ResultRow[]> {
      const definition = tableDefinition(table);
      const query = buildSelect(table, definition, options, principal);
      if (table === 'binh_luan') {
        // Keep the legacy allowlisted select/filter/order/limit contract outside
        // this moderated projection. Old clients never receive private drafts.
        query.sql = query.sql.replace(' FROM binh_luan', ` FROM (
          SELECT c.id, c.bai_viet_id, COALESCE(c.approved_author_name, c.ten) AS ten,
            ${principal?.role === 'admin' ? 'c.dien_thoai' : "''"} AS dien_thoai,
            ${principal?.role === 'admin' ? 'c.email' : "''"} AS email, c.noi_dung, c.tao_luc
          FROM binh_luan c
          LEFT JOIN app_users author ON author.id = c.author_user_id
          LEFT JOIN ugc_public_profiles identity ON identity.owner_id = c.author_user_id
          WHERE c.moderation_status = 'approved'
            AND (c.author_user_id IS NULL OR (author.status = 'active' AND identity.approved_display_name IS NOT NULL))
            AND NOT EXISTS (SELECT 1 FROM ugc_user_blocks blocked WHERE blocked.blocker_id = ? AND blocked.blocked_owner_id = c.author_user_id)
        ) AS binh_luan`);
        query.bindings.unshift(principal?.appUserId ?? null);
      }
      const result = await env.DB.prepare(query.sql).bind(...query.bindings).all<D1ResultRow>();
      return result.results ?? [];
    },

    async insert(
      table: string,
      payload: Record<string, unknown> | Array<Record<string, unknown>>,
      principal: AuthPrincipal | null,
      conflictValue?: string | null,
    ): Promise<Record<string, unknown>[]> {
      const definition = tableDefinition(table);
      const values = (Array.isArray(payload) ? payload : [payload])
        .map((row) => normalizeWrite(table, definition, row, principal));
      if (!values.length) throw new ServerInputError(400, 'empty_payload', 'Không có dữ liệu.');
      if (values.length > 100) {
        throw new ServerInputError(413, 'too_many_rows', 'Mỗi yêu cầu chỉ được ghi tối đa 100 bản ghi.');
      }
      if (table === 'phap_thoai') {
        for (const row of values) row.id ||= `pt_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
      }
      const conflict = parseConflict(conflictValue, definition.columns);
      await env.DB.batch(values.map((value) => prepareInsert(env.DB.prepare.bind(env.DB), table, value, conflict)));
      return values;
    },

    async update(
      table: string,
      payload: Record<string, unknown>,
      principal: AuthPrincipal | null,
      filters: MutationFilters,
    ): Promise<void> {
      const definition = tableDefinition(table);
      const normalized = normalizeWrite(table, definition, payload, principal);
      delete normalized.id;
      const mutationFilters = buildMutationFilters(table, definition.columns, definition.owner, principal, filters);
      const columns = Object.keys(normalized);
      if (!columns.length || !mutationFilters.clauses.length) {
        throw new ServerInputError(400, 'unsafe_mutation', 'Cập nhật cần dữ liệu và bộ lọc.');
      }
      await env.DB.prepare(
        `UPDATE ${table} SET ${columns.map((column) => `${column} = ?`).join(', ')} WHERE ${mutationFilters.clauses.join(' AND ')}`,
      ).bind(
        ...columns.map((column) => normalized[column]),
        ...mutationFilters.bindings,
      ).run();
    },

    async delete(
      table: string,
      principal: AuthPrincipal | null,
      filters: MutationFilters,
    ): Promise<number> {
      const definition = tableDefinition(table);
      const mutationFilters = buildMutationFilters(table, definition.columns, definition.owner, principal, filters);
      if (!mutationFilters.clauses.length) {
        throw new ServerInputError(400, 'unsafe_mutation', 'Xóa cần bộ lọc.');
      }
      const result = await env.DB.prepare(
        `DELETE FROM ${table} WHERE ${mutationFilters.clauses.join(' AND ')}`,
      ).bind(...mutationFilters.bindings).run();
      return Number(result.meta?.changes || 0);
    },
  };
}

function prepareInsert(
  prepare: (query: string) => D1PreparedStatement,
  table: string,
  value: Record<string, unknown>,
  conflict: string[],
): D1PreparedStatement {
  const columns = Object.keys(value).filter((column) => value[column] !== undefined);
  if (!columns.length) throw new ServerInputError(400, 'empty_payload', 'Không có dữ liệu.');
  const placeholders = columns.map(() => '?').join(', ');
  let suffix = '';
  if (conflict.length) {
    const updates = columns.filter((column) => !conflict.includes(column));
    suffix = updates.length
      ? ` ON CONFLICT(${conflict.join(', ')}) DO UPDATE SET ${updates.map((column) => `${column} = excluded.${column}`).join(', ')}`
      : ` ON CONFLICT(${conflict.join(', ')}) DO NOTHING`;
  }
  return prepare(
    `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})${suffix}`,
  ).bind(...columns.map((column) => value[column]));
}

function buildMutationFilters(
  table: string,
  columns: string[],
  owner: boolean | undefined,
  principal: AuthPrincipal | null,
  filters: MutationFilters,
): { clauses: string[]; bindings: unknown[] } {
  const clauses: string[] = [];
  const bindings: unknown[] = [];
  for (const column of columns) {
    const value = filters[column];
    if (!value) continue;
    if (!String(value).startsWith('eq.')) {
      throw new ServerInputError(400, 'invalid_filter', 'Chỉ hỗ trợ bộ lọc eq.');
    }
    clauses.push(`${column} = ?`);
    bindings.push(String(value).slice(3));
  }
  if (owner) {
    clauses.push('id = ?');
    if (table === 'user_sync_data') {
      if (!principal?.appUserId) throw new ServerInputError(401, 'authentication_required', 'Cần đăng nhập.');
      bindings.push(principal.appUserId);
    } else {
      const username = String(principal?.displayName || '').normalize('NFKC').trim().toLocaleLowerCase('vi');
      bindings.push(principal?.appUserId ? `google_${principal.appUserId}` : `local_${username}`);
    }
  }
  return { clauses, bindings };
}
