import type {
  ReadingAnnotationPatch,
  ReadingAnnotationWrite,
  ReadingProgressDelete,
  ReadingProgressWrite,
} from '$lib/domain/reading/activity';
import type { CloudflareEnvLike, D1ResultRow } from '../cloudflare-context';

export interface ReadingProgressRow extends D1ResultRow {
  owner_id: string;
  content_kind: string;
  content_id: string;
  revision: number;
  epoch: number;
  device_id: string;
  device_sequence: number;
  position_json: string;
  total: number | null;
  percent: number;
  content_version: string | null;
  client_updated_at: string | null;
  server_updated_at: string;
  deleted_at: string | null;
}

export interface ReadingAnnotationRow extends D1ResultRow {
  id: string;
  owner_id: string;
  content_kind: string;
  content_id: string;
  locator_json: string;
  quote_text: string;
  context_before: string;
  context_after: string;
  color: string;
  note: string;
  content_version: string | null;
  anchor_status: string;
  idempotency_key: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export function createReadingActivityRepository(env: CloudflareEnvLike) {
  return {
    getProgress(ownerId: string, contentKind: string, contentId: string) {
      return env.DB.prepare(`
        SELECT * FROM reading_progress
        WHERE owner_id = ? AND content_kind = ? AND content_id = ? AND deleted_at IS NULL
        LIMIT 1
      `).bind(ownerId, contentKind, contentId).first<ReadingProgressRow>();
    },

    getProgressState(ownerId: string, contentKind: string, contentId: string) {
      return env.DB.prepare(`
        SELECT * FROM reading_progress
        WHERE owner_id = ? AND content_kind = ? AND content_id = ?
        LIMIT 1
      `).bind(ownerId, contentKind, contentId).first<ReadingProgressRow>();
    },

    async writeProgress(ownerId: string, input: ReadingProgressWrite, now: string): Promise<boolean> {
      const positionJson = JSON.stringify(input.position);
      const results = await env.DB.batch([
        env.DB.prepare(`
          INSERT INTO sync_devices (
            owner_id, device_id, high_water_sequence, created_at, updated_at, revoked_at
          ) VALUES (?, ?, 0, ?, ?, NULL)
          ON CONFLICT(owner_id, device_id) DO NOTHING
        `).bind(ownerId, input.deviceId, now, now),
        env.DB.prepare(`
        INSERT INTO reading_progress (
          owner_id, content_kind, content_id, revision, epoch, device_id, device_sequence,
          position_json, total, percent, content_version, client_updated_at, server_updated_at, deleted_at
        )
        SELECT ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL
        WHERE EXISTS (
          SELECT 1 FROM sync_devices
          WHERE owner_id = ? AND device_id = ? AND revoked_at IS NULL
            AND high_water_sequence < ?
        )
        ON CONFLICT(owner_id, content_kind, content_id) DO UPDATE SET
          revision = reading_progress.revision + 1,
          epoch = excluded.epoch,
          device_id = excluded.device_id,
          device_sequence = excluded.device_sequence,
          position_json = excluded.position_json,
          total = excluded.total,
          percent = excluded.percent,
          content_version = excluded.content_version,
          client_updated_at = excluded.client_updated_at,
          server_updated_at = excluded.server_updated_at,
          deleted_at = NULL
        WHERE reading_progress.revision = ?
          AND excluded.epoch >= reading_progress.epoch
        `).bind(
          ownerId,
          input.contentKind,
          input.contentId,
          input.epoch,
          input.deviceId,
          input.deviceSequence,
          positionJson,
          input.total,
          input.percent,
          input.contentVersion,
          input.clientUpdatedAt,
          now,
          ownerId,
          input.deviceId,
          input.deviceSequence,
          input.baseRevision,
        ),
        env.DB.prepare(`
          UPDATE sync_devices
          SET high_water_sequence = ?, updated_at = ?
          WHERE owner_id = ? AND device_id = ? AND revoked_at IS NULL
            AND high_water_sequence < ?
            AND EXISTS (
              SELECT 1 FROM reading_progress
              WHERE owner_id = ? AND content_kind = ? AND content_id = ?
                AND epoch = ? AND device_id = ? AND device_sequence = ?
                AND position_json = ? AND deleted_at IS NULL
            )
        `).bind(
          input.deviceSequence,
          now,
          ownerId,
          input.deviceId,
          input.deviceSequence,
          ownerId,
          input.contentKind,
          input.contentId,
          input.epoch,
          input.deviceId,
          input.deviceSequence,
          positionJson,
        ),
      ]);
      return Number(results[1]?.meta?.changes ?? 0) === 1;
    },

    listRecentProgress(ownerId: string, limit: number) {
      return env.DB.prepare(`
        SELECT * FROM reading_progress
        WHERE owner_id = ? AND deleted_at IS NULL
        ORDER BY server_updated_at DESC
        LIMIT ?
      `).bind(ownerId, limit).all<ReadingProgressRow>();
    },

    async deleteProgress(ownerId: string, input: ReadingProgressDelete, now: string): Promise<boolean> {
      const results = await env.DB.batch([
        env.DB.prepare(`
          INSERT INTO sync_devices (
            owner_id, device_id, high_water_sequence, created_at, updated_at, revoked_at
          ) VALUES (?, ?, 0, ?, ?, NULL)
          ON CONFLICT(owner_id, device_id) DO NOTHING
        `).bind(ownerId, input.deviceId, now, now),
        env.DB.prepare(`
          UPDATE reading_progress
          SET revision = revision + 1, epoch = ?, device_id = ?, device_sequence = ?,
              server_updated_at = ?, deleted_at = ?
          WHERE owner_id = ? AND content_kind = ? AND content_id = ?
            AND revision = ? AND epoch <= ? AND deleted_at IS NULL
            AND EXISTS (
              SELECT 1 FROM sync_devices
              WHERE owner_id = ? AND device_id = ? AND revoked_at IS NULL
                AND high_water_sequence < ?
            )
        `).bind(
          input.epoch,
          input.deviceId,
          input.deviceSequence,
          now,
          now,
          ownerId,
          input.contentKind,
          input.contentId,
          input.baseRevision,
          input.epoch,
          ownerId,
          input.deviceId,
          input.deviceSequence,
        ),
        env.DB.prepare(`
          UPDATE sync_devices
          SET high_water_sequence = ?, updated_at = ?
          WHERE owner_id = ? AND device_id = ? AND revoked_at IS NULL
            AND high_water_sequence < ?
            AND EXISTS (
              SELECT 1 FROM reading_progress
              WHERE owner_id = ? AND content_kind = ? AND content_id = ?
                AND device_id = ? AND device_sequence = ? AND deleted_at = ?
            )
        `).bind(
          input.deviceSequence,
          now,
          ownerId,
          input.deviceId,
          input.deviceSequence,
          ownerId,
          input.contentKind,
          input.contentId,
          input.deviceId,
          input.deviceSequence,
          now,
        ),
      ]);
      return Number(results[1]?.meta?.changes ?? 0) === 1;
    },

    async writeAnnotation(ownerId: string, input: ReadingAnnotationWrite, now: string): Promise<boolean> {
      const result = await env.DB.prepare(`
        INSERT INTO reading_annotations (
          id, owner_id, content_kind, content_id, locator_json, quote_text,
          context_before, context_after, color, note, content_version, anchor_status,
          idempotency_key, created_at, updated_at, deleted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
        ON CONFLICT DO NOTHING
      `).bind(
        input.id,
        ownerId,
        input.contentKind,
        input.contentId,
        JSON.stringify(input.locator),
        input.quoteText,
        input.contextBefore,
        input.contextAfter,
        input.color,
        input.note,
        input.contentVersion,
        input.anchorStatus,
        input.idempotencyKey,
        now,
        now,
      ).run();
      return Number(result.meta?.changes ?? 0) === 1;
    },

    getAnnotation(ownerId: string, annotationId: string) {
      return env.DB.prepare(`
        SELECT * FROM reading_annotations
        WHERE owner_id = ? AND id = ? AND deleted_at IS NULL
        LIMIT 1
      `).bind(ownerId, annotationId).first<ReadingAnnotationRow>();
    },

    getAnnotationState(ownerId: string, annotationId: string) {
      return env.DB.prepare(`
        SELECT * FROM reading_annotations
        WHERE owner_id = ? AND id = ?
        LIMIT 1
      `).bind(ownerId, annotationId).first<ReadingAnnotationRow>();
    },

    getAnnotationByIdempotencyKey(ownerId: string, idempotencyKey: string) {
      return env.DB.prepare(`
        SELECT * FROM reading_annotations
        WHERE owner_id = ? AND idempotency_key = ? AND deleted_at IS NULL
        LIMIT 1
      `).bind(ownerId, idempotencyKey).first<ReadingAnnotationRow>();
    },

    listAnnotations(
      ownerId: string,
      limit: number,
      contentKind?: string,
      contentId?: string,
      cursor?: { updatedAt: string; id: string } | null,
    ) {
      return env.DB.prepare(`
        SELECT * FROM reading_annotations
        WHERE owner_id = ? AND deleted_at IS NULL
          AND (? IS NULL OR content_kind = ?)
          AND (? IS NULL OR content_id = ?)
          AND (? IS NULL OR updated_at < ? OR (updated_at = ? AND id < ?))
        ORDER BY updated_at DESC, id DESC
        LIMIT ?
      `).bind(
        ownerId,
        contentKind ?? null,
        contentKind ?? null,
        contentId ?? null,
        contentId ?? null,
        cursor?.updatedAt ?? null,
        cursor?.updatedAt ?? null,
        cursor?.updatedAt ?? null,
        cursor?.id ?? '',
        limit,
      ).all<ReadingAnnotationRow>();
    },

    async updateAnnotation(
      ownerId: string,
      annotationId: string,
      input: ReadingAnnotationPatch,
      now: string,
    ): Promise<boolean> {
      const result = await env.DB.prepare(`
        UPDATE reading_annotations
        SET locator_json = ?, color = ?, note = ?, content_version = ?,
            anchor_status = ?, updated_at = ?
        WHERE id = ? AND owner_id = ? AND updated_at = ? AND deleted_at IS NULL
      `).bind(
        JSON.stringify(input.locator),
        input.color,
        input.note,
        input.contentVersion,
        input.anchorStatus,
        now,
        annotationId,
        ownerId,
        input.baseUpdatedAt,
      ).run();
      return Number(result.meta?.changes ?? 0) === 1;
    },

    async deleteAnnotation(ownerId: string, annotationId: string, now: string): Promise<boolean> {
      const result = await env.DB.prepare(`
        UPDATE reading_annotations
        SET deleted_at = ?, updated_at = ?
        WHERE id = ? AND owner_id = ? AND deleted_at IS NULL
      `).bind(now, now, annotationId, ownerId).run();
      return Number(result.meta?.changes ?? 0) === 1;
    },
  };
}
