import type { CloudflareRequestContext } from '../cloudflare-context';
import { sha256 } from '../crypto';
import { normalizeWrite, parseConflict, tableDefinition, serializeRows, type QueryOptions } from '../domain/data-contract';
import { ServerInputError } from '../errors';
import { createArticleMediaCleanupRepository, liveReferenceForms } from '../repositories/article-media-cleanup-repository';
import { createDataRepository } from '../repositories/data-repository';
import { createFacebookRepository } from '../repositories/facebook-repository';
import { createMediaService } from './media';

const ARTICLE_TABLES = new Set(['baiviet', 'tap_noi_dung', 'luot_xem', 'binh_luan']);
const ARTICLE_MEDIA_CLEANUP_BATCH_LIMIT = 50;

interface ArticleCleanupMediaService {
  tombstoneMediaForCleanup(
    rawObjectKey: string,
    idempotencyKey: string,
    liveReferences: string[],
  ): Promise<{ status?: string } | void>;
}

export interface ArticleMediaCleanupSummary {
  cleanupErrors: string[];
  failed: number;
  processed: number;
  retained: number;
  tombstoned: number;
}

export function createArticlesService(
  context: CloudflareRequestContext,
  dependencies: { mediaService?: ArticleCleanupMediaService } = {},
) {
  const repository = createDataRepository(context.env);
  const cleanupRepository = createArticleMediaCleanupRepository(context.env);
  const facebookRepository = createFacebookRepository(context['env']);
  const mediaService = dependencies.mediaService ?? createMediaService(context);

  return {
    async selectTable(table: string, options: QueryOptions) {
      ensureSupportedTable(table);
      const definition = tableDefinition(table);
      const rows = await repository.select(table, options, context.principal);
      return serializeRows(rows, definition, context.env);
    },

    async insertTable(
      table: string,
      payload: Record<string, unknown> | Array<Record<string, unknown>>,
      options: { onConflict?: string | null } = {},
    ) {
      ensureSupportedTable(table);
      if (table === 'luot_xem') {
        throw new ServerInputError(405, 'use_view_endpoint', 'Dùng endpoint tăng lượt xem.');
      }
      authorizeWrite(context, table, 'POST');
      const definition = tableDefinition(table);
      if (table === 'tap_noi_dung') {
        const conflict = parseConflict(options.onConflict, definition.columns);
        const values = (Array.isArray(payload) ? payload : [payload])
          .map((row) => normalizeWrite(table, definition, row, context.principal));
        if (!values.length) throw new ServerInputError(400, 'empty_payload', 'Không có dữ liệu.');
        if (values.length > 100) {
          throw new ServerInputError(413, 'too_many_rows', 'Mỗi yêu cầu chỉ được ghi tối đa 100 bản ghi.');
        }
        await facebookRepository.upsertArticleChaptersAndDetachManagedImports({
          values,
          conflict,
          now: new Date().toISOString(),
        });
        return serializeRows(values, definition, context['env']);
      }
      if (table === 'baiviet') {
        const conflict = parseConflict(options.onConflict, definition.columns);
        if (conflict.includes('id')) {
          const values = (Array.isArray(payload) ? payload : [payload])
            .map((row) => normalizeWrite(table, definition, row, context.principal));
          if (!values.length) throw new ServerInputError(400, 'empty_payload', 'Không có dữ liệu.');
          if (values.length > 100) {
            throw new ServerInputError(413, 'too_many_rows', 'Mỗi yêu cầu chỉ được ghi tối đa 100 bản ghi.');
          }
          await facebookRepository.upsertArticlesAndDetachManagedImports({
            values,
            conflict,
            now: new Date().toISOString(),
          });
          return serializeRows(values, definition, context['env']);
        }
      }
      const rows = await repository.insert(table, payload, context.principal, options.onConflict);
      return serializeRows(rows, definition, context.env);
    },

    async updateTable(
      table: string,
      payload: Record<string, unknown>,
      filters: Record<string, string | null | undefined>,
    ) {
      ensureSupportedTable(table);
      if (table === 'luot_xem') {
        throw new ServerInputError(405, 'use_view_endpoint', 'Dùng endpoint tăng lượt xem.');
      }
      authorizeWrite(context, table, 'PATCH');
      if (table === 'tap_noi_dung') {
        const definition = tableDefinition(table);
        const normalized = normalizeWrite(table, definition, payload, context.principal);
        delete normalized.id;
        const now = String(normalized.updated_at || new Date().toISOString());
        await facebookRepository.updateArticleChaptersAndDetachManagedImports({ payload: normalized, filters, now });
        return [];
      }
      if (table === 'baiviet') {
        const definition = tableDefinition(table);
        const normalized = normalizeWrite(table, definition, payload, context.principal);
        delete normalized.id;
        const now = String(normalized.updated_at || new Date().toISOString());
        await facebookRepository.updateArticlesAndDetachManagedImports({ payload: normalized, filters, now });
        return [];
      }
      await repository.update(table, payload, context.principal, filters);
      return [];
    },

    async deleteTable(table: string, filters: Record<string, string | null | undefined>) {
      ensureSupportedTable(table);
      authorizeWrite(context, table, 'DELETE');
      if (table === 'tap_noi_dung') {
        await facebookRepository.deleteArticleChaptersAndDetachManagedImports(filters, new Date().toISOString());
        return [];
      }
      if (table !== 'baiviet') {
        await repository.delete(table, context.principal, filters);
        return [];
      }
      const targets = await facebookRepository.listArticleMutationTargets(filters);
      const nowIso = new Date().toISOString();
      for (const target of targets) {
        await cleanupRepository.upsertEntries(
          target.id,
          extractServerOwnedMediaReferences(target, context['env'].MEDIA_PUBLIC_BASE_URL),
          nowIso,
        );
      }
      await facebookRepository.deleteArticlesAndRecordManagedImports(filters, nowIso);
      for (const target of targets) {
        await flushArticleMediaCleanup(
          await cleanupRepository.listRetryableEntries(target.id),
          mediaService,
          cleanupRepository,
          context['env'].MEDIA_PUBLIC_BASE_URL,
        );
      }
      return [];
    },

    async drainMediaCleanupQueue(limit = ARTICLE_MEDIA_CLEANUP_BATCH_LIMIT): Promise<ArticleMediaCleanupSummary> {
      const boundedLimit = Number.isSafeInteger(limit)
        ? Math.max(1, Math.min(limit, ARTICLE_MEDIA_CLEANUP_BATCH_LIMIT))
        : ARTICLE_MEDIA_CLEANUP_BATCH_LIMIT;
      return flushArticleMediaCleanup(
        await cleanupRepository.listGlobalRetryableEntries(boundedLimit),
        mediaService,
        cleanupRepository,
        context.env.MEDIA_PUBLIC_BASE_URL,
      );
    },
  };
}

async function flushArticleMediaCleanup(
  entries: Awaited<ReturnType<ReturnType<typeof createArticleMediaCleanupRepository>['listGlobalRetryableEntries']>>,
  mediaService: ArticleCleanupMediaService,
  cleanupRepository: ReturnType<typeof createArticleMediaCleanupRepository>,
  publicBaseUrl: string | undefined,
): Promise<ArticleMediaCleanupSummary> {
  const summary: ArticleMediaCleanupSummary = {
    cleanupErrors: [],
    failed: 0,
    processed: 0,
    retained: 0,
    tombstoned: 0,
  };
  for (const entry of entries) {
    summary.processed += 1;
    const nowIso = new Date().toISOString();
    try {
      if (await cleanupRepository.hasLiveArticleReference(entry.object_key, publicBaseUrl)) {
        await cleanupRepository.markEntry(
          entry.article_id,
          entry.object_key,
          entry.source_field,
          'tombstoned',
          null,
          nowIso,
        );
        summary.retained += 1;
        continue;
      }
      const result = await mediaService.tombstoneMediaForCleanup(
        encodeURIComponent(entry.object_key),
        `article-delete:${await sha256(`${entry.article_id}:${entry.source_field}:${entry.object_key}`)}`,
        liveReferenceForms(entry.object_key, publicBaseUrl),
      );
      if (result?.status === 'retained') {
        await cleanupRepository.markEntry(
          entry.article_id, entry.object_key, entry.source_field, 'tombstoned', null, nowIso,
        );
        summary.retained += 1;
        continue;
      }
      await cleanupRepository.markEntry(
        entry.article_id,
        entry.object_key,
        entry.source_field,
        'tombstoned',
        null,
        nowIso,
      );
      summary.tombstoned += 1;
    } catch (error) {
      if (error instanceof ServerInputError && error.code === 'media_not_found') {
        await cleanupRepository.markEntry(
          entry.article_id,
          entry.object_key,
          entry.source_field,
          'tombstoned',
          null,
          nowIso,
        );
        summary.tombstoned += 1;
        continue;
      }
      const errorCode = error instanceof ServerInputError ? error.code : 'media_cleanup_failed';
      await cleanupRepository.markEntry(
        entry.article_id,
        entry.object_key,
        entry.source_field,
        'failed',
        errorCode,
        nowIso,
      );
      summary.failed += 1;
      summary.cleanupErrors.push(cleanupErrorId(entry, errorCode));
    }
  }
  summary.cleanupErrors.sort();
  return summary;
}

function cleanupErrorId(
  entry: { article_id: string; object_key: string; source_field: string },
  errorCode: string,
): string {
  return `${entry.article_id}:${entry.source_field}:${entry.object_key}:${errorCode}`;
}

function ensureSupportedTable(table: string): void {
  if (!ARTICLE_TABLES.has(table)) {
    throw new ServerInputError(404, 'unknown_table', 'Tài nguyên không tồn tại.');
  }
}

function authorizeWrite(context: CloudflareRequestContext, table: string, method: 'POST' | 'PATCH' | 'DELETE'): void {
  const role = context.principal?.role ?? 'guest';
  if (table === 'binh_luan') {
    if (method === 'POST') return;
    throw new ServerInputError(405, 'method_not_allowed', 'Bình luận chỉ được tạo qua public API.');
  }
  if (method === 'DELETE') {
    if (role !== 'admin') throw new ServerInputError(context.principal ? 403 : 401, context.principal ? 'forbidden' : 'authentication_required', context.principal ? 'Không đủ quyền.' : 'Cần đăng nhập.');
    return;
  }
  if (role !== 'ctv' && role !== 'admin') {
    throw new ServerInputError(context.principal ? 403 : 401, context.principal ? 'forbidden' : 'authentication_required', context.principal ? 'Không đủ quyền.' : 'Cần đăng nhập.');
  }
}

function extractServerOwnedMediaReferences(
  row: Record<string, unknown>,
  baseUrl: string | undefined,
): Array<{ objectKey: string; sourceField: string }> {
  const references: Array<{ objectKey: string; sourceField: string }> = [];
  for (const sourceField of ['anh_url', 'pdf_url'] as const) {
    const objectKey = normalizeMediaReference(row[sourceField], baseUrl);
    if (objectKey) references.push({ objectKey, sourceField });
  }
  return references;
}

function normalizeMediaReference(value: unknown, baseUrl: string | undefined): string | null {
  const raw = String(value || '').trim().split('#pos=')[0];
  if (!raw) return null;
  if (/^(covers|content|pdfs)\/[A-Za-z0-9._/-]+$/u.test(raw) && !raw.includes('..')) {
    return raw;
  }
  if (raw.startsWith('/api/media/')) {
    const objectKey = raw.slice('/api/media/'.length);
    return /^(covers|content|pdfs)\/[A-Za-z0-9._/-]+$/u.test(objectKey) && !objectKey.includes('..')
      ? objectKey
      : null;
  }
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === 'https:' && parsed.hostname === 'media.quangtu.vn') {
      const objectKey = parsed.pathname.replace(/^\/+/u, '');
      return /^(covers|content|pdfs)\/[A-Za-z0-9._/-]+$/u.test(objectKey) && !objectKey.includes('..')
        ? objectKey
        : null;
    }
  } catch {
    // Fall through to configured public base matching.
  }
  if (!baseUrl) return null;
  const normalizedBase = String(baseUrl).replace(/\/+$/u, '');
  if (!normalizedBase || !raw.startsWith(`${normalizedBase}/`)) return null;
  const objectKey = raw.slice(normalizedBase.length + 1);
  return /^(covers|content|pdfs)\/[A-Za-z0-9._/-]+$/u.test(objectKey) && !objectKey.includes('..')
    ? objectKey
    : null;
}
