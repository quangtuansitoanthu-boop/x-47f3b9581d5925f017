import {
  READING_CONTENT_KINDS,
  normalizeReadingAnnotationPatch,
  normalizeReadingAnnotationWrite,
  normalizeReadingProgressDelete,
  normalizeReadingProgressWrite,
  type ReadingContentKind,
} from '../../domain/reading/activity';
import type { CloudflareRequestContext } from '../cloudflare-context';
import { fromBase64Url, toBase64Url } from '../crypto';
import { ServerInputError } from '../errors';
import {
  createReadingActivityRepository,
  type ReadingAnnotationRow,
  type ReadingProgressRow,
} from '../repositories/reading-activity-repository';

type Repository = ReturnType<typeof createReadingActivityRepository>;

export function createReadingActivityService(
  context: CloudflareRequestContext,
  dependencies: { repository?: Repository; now?: () => Date } = {},
) {
  const { env: bindings } = context;
  const repository = dependencies.repository ?? createReadingActivityRepository(bindings);
  const now = dependencies.now ?? (() => new Date());
  const ownerId = () => {
    const owner = context.principal?.appUserId;
    if (!owner) throw new ServerInputError(401, 'authentication_required', 'Cần đăng nhập.');
    return owner;
  };

  return {
    async getProgress(contentKind: string, contentId: string) {
      const identity = normalizeContentIdentity(contentKind, contentId);
      const row = await repository.getProgressState(ownerId(), identity.contentKind, identity.contentId);
      return progressStatePayload(row);
    },

    async listProgress(limitValue: string | null) {
      const rows = await repository.listRecentProgress(ownerId(), boundedLimit(limitValue));
      return { progress: (rows.results ?? []).map(serializeProgress) };
    },

    async writeProgress(rawInput: unknown) {
      const input = normalizeDomain(() => normalizeReadingProgressWrite(rawInput), 'invalid_reading_progress');
      const written = await repository.writeProgress(ownerId(), input, now().toISOString());
      const row = await repository.getProgressState(ownerId(), input.contentKind, input.contentId);
      if (!written) {
        throw new ServerInputError(409, 'reading_progress_conflict', 'Tiến độ đã thay đổi trên thiết bị khác.', {
          ...progressConflictPayload(row),
        });
      }
      if (!row || row.deleted_at) throw new ServerInputError(409, 'reading_progress_conflict', 'Không thể lưu tiến độ đọc.');
      return { progress: serializeProgress(row) };
    },

    async deleteProgress(rawInput: unknown) {
      const input = normalizeDomain(() => normalizeReadingProgressDelete(rawInput), 'invalid_reading_progress_delete');
      const deleted = await repository.deleteProgress(ownerId(), input, now().toISOString());
      if (!deleted) {
        const current = await repository.getProgressState(ownerId(), input.contentKind, input.contentId);
        throw new ServerInputError(409, 'reading_progress_conflict', 'Tiến độ đã thay đổi trên thiết bị khác.', {
          ...progressConflictPayload(current),
        });
      }
      const tombstone = await repository.getProgressState(ownerId(), input.contentKind, input.contentId);
      return { deleted: true, tombstone: tombstone?.deleted_at ? serializeProgressTombstone(tombstone) : null };
    },

    async listAnnotations(input: {
      contentKind: string | null;
      contentId: string | null;
      cursor: string | null;
      limit: string | null;
    }) {
      const contentKind = input.contentKind ? normalizeContentKind(input.contentKind) : undefined;
      const contentId = input.contentId ? normalizeId(input.contentId, 'content_id') : undefined;
      const limit = boundedLimit(input.limit);
      const rows = await repository.listAnnotations(
        ownerId(), limit + 1, contentKind, contentId, decodeAnnotationCursor(input.cursor),
      );
      const page = rows.results ?? [];
      const annotations = page.slice(0, limit);
      const last = annotations.at(-1);
      return {
        annotations: annotations.map(serializeAnnotation),
        nextCursor: page.length > limit && last
          ? encodeAnnotationCursor({ updatedAt: last.updated_at, id: last.id })
          : null,
      };
    },

    async getAnnotation(annotationId: string) {
      const row = await repository.getAnnotationState(ownerId(), normalizeId(annotationId, 'annotation_id'));
      return {
        annotation: row && !row.deleted_at ? serializeAnnotation(row) : null,
        tombstone: row?.deleted_at ? serializeAnnotationTombstone(row) : null,
      };
    },

    async createAnnotation(rawInput: unknown) {
      const input = normalizeDomain(() => normalizeReadingAnnotationWrite(rawInput), 'invalid_annotation');
      const owner = ownerId();
      const created = await repository.writeAnnotation(owner, input, now().toISOString());
      const row = created
        ? await repository.getAnnotation(owner, input.id)
        : await repository.getAnnotationByIdempotencyKey(owner, input.idempotencyKey);
      if (!row) throw new ServerInputError(409, 'annotation_conflict', 'Không thể lưu trích dẫn.');
      return { annotation: serializeAnnotation(row), created };
    },

    async updateAnnotation(annotationId: string, rawInput: unknown) {
      const id = normalizeId(annotationId, 'annotation_id');
      const input = normalizeDomain(() => normalizeReadingAnnotationPatch(rawInput), 'invalid_annotation_patch');
      const owner = ownerId();
      const updated = await repository.updateAnnotation(owner, id, input, now().toISOString());
      const row = await repository.getAnnotation(owner, id);
      if (!row) throw new ServerInputError(404, 'annotation_not_found', 'Không tìm thấy trích dẫn.');
      if (!updated) {
        throw new ServerInputError(409, 'annotation_conflict', 'Trích dẫn đã thay đổi trên thiết bị khác.', {
          current: serializeAnnotation(row),
        });
      }
      return { annotation: serializeAnnotation(row) };
    },

    async deleteAnnotation(annotationId: string) {
      const id = normalizeId(annotationId, 'annotation_id');
      const deleted = await repository.deleteAnnotation(ownerId(), id, now().toISOString());
      if (!deleted) throw new ServerInputError(404, 'annotation_not_found', 'Không tìm thấy trích dẫn.');
      return { deleted: true };
    },
  };
}

function normalizeContentIdentity(contentKind: string, contentId: string) {
  return { contentKind: normalizeContentKind(contentKind), contentId: normalizeId(contentId, 'content_id') };
}

function normalizeContentKind(value: string): ReadingContentKind {
  const normalized = String(value || '') as ReadingContentKind;
  if (!READING_CONTENT_KINDS.includes(normalized)) {
    throw new ServerInputError(400, 'invalid_content_kind', 'Loại nội dung không hợp lệ.');
  }
  return normalized;
}

function normalizeId(value: string, field: string): string {
  const normalized = String(value || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/u.test(normalized)) {
    throw new ServerInputError(400, `invalid_${field}`, 'Mã dữ liệu không hợp lệ.');
  }
  return normalized;
}

function boundedLimit(value: string | null): number {
  const parsed = Number(value ?? 50);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 200) {
    throw new ServerInputError(400, 'invalid_limit', 'Giới hạn phải từ 1 đến 200.');
  }
  return parsed;
}

function encodeAnnotationCursor(cursor: { updatedAt: string; id: string }): string {
  return toBase64Url(new TextEncoder().encode(JSON.stringify(cursor)));
}

function decodeAnnotationCursor(value: string | null): { updatedAt: string; id: string } | null {
  if (!value) return null;
  try {
    if (value.length > 1_024) throw new Error('invalid_cursor');
    const parsed = JSON.parse(new TextDecoder().decode(fromBase64Url(value))) as Record<string, unknown>;
    const updatedAt = String(parsed.updatedAt || '');
    const date = new Date(updatedAt);
    if (!Number.isFinite(date.getTime()) || date.toISOString() !== updatedAt) throw new Error('invalid_cursor');
    return { updatedAt, id: normalizeId(String(parsed.id || ''), 'cursor_id') };
  } catch {
    throw new ServerInputError(400, 'invalid_cursor', 'Con trỏ phân trang không hợp lệ.');
  }
}

function normalizeDomain<T>(operation: () => T, fallback: string): T {
  try {
    return operation();
  } catch (cause) {
    const code = cause instanceof Error ? cause.message : fallback;
    throw new ServerInputError(400, code, 'Dữ liệu hoạt động đọc không hợp lệ.');
  }
}

function serializeProgress(row: ReadingProgressRow) {
  return {
    contentKind: row.content_kind,
    contentId: row.content_id,
    revision: row.revision,
    epoch: row.epoch,
    deviceId: row.device_id,
    deviceSequence: row.device_sequence,
    position: parseObject(row.position_json),
    total: row.total,
    percent: row.percent,
    contentVersion: row.content_version,
    clientUpdatedAt: row.client_updated_at,
    serverUpdatedAt: row.server_updated_at,
  };
}

function progressStatePayload(row: ReadingProgressRow | null) {
  return {
    progress: row && !row.deleted_at ? serializeProgress(row) : null,
    tombstone: row?.deleted_at ? serializeProgressTombstone(row) : null,
  };
}

function progressConflictPayload(row: ReadingProgressRow | null) {
  const state = progressStatePayload(row);
  return { current: state.progress, tombstone: state.tombstone };
}

function serializeProgressTombstone(row: ReadingProgressRow) {
  return {
    contentKind: row.content_kind,
    contentId: row.content_id,
    revision: row.revision,
    epoch: row.epoch,
    serverUpdatedAt: row.server_updated_at,
    deletedAt: row.deleted_at,
  };
}

function serializeAnnotation(row: ReadingAnnotationRow) {
  return {
    id: row.id,
    contentKind: row.content_kind,
    contentId: row.content_id,
    locator: parseObject(row.locator_json),
    quoteText: row.quote_text,
    contextBefore: row.context_before,
    contextAfter: row.context_after,
    color: row.color,
    note: row.note,
    contentVersion: row.content_version,
    anchorStatus: row.anchor_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeAnnotationTombstone(row: ReadingAnnotationRow) {
  return {
    id: row.id,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

function parseObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}
