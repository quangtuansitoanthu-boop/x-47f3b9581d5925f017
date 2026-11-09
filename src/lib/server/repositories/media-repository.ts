import type { CloudflareEnvLike, D1ResultRow, R2PutOptionsLike } from '../cloudflare-context';

export interface MediaOperationRow extends D1ResultRow {
  id: string;
  object_key: string;
  status: string;
  expected_byte_size?: number | null;
  expected_sha256?: string | null;
  created_at?: string | null;
  purge_after?: string | null;
  error_code?: string | null;
  cleanup_claimed_at?: string | null;
  finalize_started_at?: string | null;
}

export function createMediaRepository(env: CloudflareEnvLike) {
  return {
    async findOperation(id: string): Promise<MediaOperationRow | null> {
      return env.DB.prepare(
        'SELECT id, object_key, status, expected_byte_size, expected_sha256, created_at, purge_after, error_code FROM media_operations WHERE id = ?',
      ).bind(id).first<MediaOperationRow>();
    },

    async beginFinalizePut(operationId: string, finalizedAt: string, staleLeaseCutoff: string): Promise<boolean> {
      const result = await env.DB.prepare(`
        UPDATE media_operations
        SET finalize_started_at = ?, cleanup_claimed_at = NULL
        WHERE id = ?
          AND operation = 'put'
          AND status = 'pending'
          AND finalize_started_at IS NULL
          AND (cleanup_claimed_at IS NULL OR cleanup_claimed_at <= ?)
      `).bind(finalizedAt, operationId, staleLeaseCutoff).run();
      return result.meta?.changes === 1;
    },

    async insertPendingPut(
      operationId: string,
      objectKey: string,
      expectedSha256: string | null,
      expectedByteSize: number,
      createdAt: string,
    ): Promise<void> {
      await env.DB.prepare(`
        INSERT INTO media_operations
          (id, object_key, operation, status, expected_sha256, expected_byte_size, created_at)
        VALUES (?, ?, 'put', 'pending', ?, ?, ?)
      `).bind(operationId, objectKey, expectedSha256, expectedByteSize, createdAt).run();
    },

    async applyUploadedObject(
      operationId: string,
      objectKey: string,
      byteSize: number,
      sha256: string,
      contentType: string,
      createdAt: string,
      appliedAt: string,
      finalizedAt: string,
    ): Promise<boolean> {
      const results = await env.DB.batch([
        env.DB.prepare(`
          INSERT INTO media_objects
            (object_key, source_path, byte_size, sha256, content_type,
             cache_control, baseline, created_at)
          VALUES (?, ?, ?, ?, ?, 'public, max-age=31536000, immutable', 0, ?)
        `).bind(objectKey, objectKey, byteSize, sha256, contentType, createdAt),
        env.DB.prepare(`
          UPDATE media_operations
          SET status = 'applied', expected_sha256 = ?, expected_byte_size = ?, applied_at = ?, finalize_started_at = NULL
          WHERE id = ? AND status = 'pending' AND finalize_started_at = ?
        `).bind(sha256, byteSize, appliedAt, operationId, finalizedAt),
      ]);
      return results.every((result) => result.success !== false) && results[1]?.meta?.changes === 1;
    },

    async markOperationStatus(
      operationId: string,
      status: 'failed' | 'purged',
      errorCode: string | null,
      expectedCurrentStatus = 'pending',
    ): Promise<void> {
      if (status === 'failed') {
        await env.DB.prepare(
          'UPDATE media_operations SET status = ?, error_code = ?, cleanup_claimed_at = NULL, finalize_started_at = NULL WHERE id = ? AND status = ?',
        ).bind(status, errorCode, operationId, expectedCurrentStatus).run();
        return;
      }
      await env.DB.prepare(
        'UPDATE media_operations SET status = ?, applied_at = ?, cleanup_claimed_at = NULL, finalize_started_at = NULL WHERE id = ? AND status = ?',
      ).bind(status, new Date().toISOString(), operationId, expectedCurrentStatus).run();
    },

    async claimCleanupOperation(
      operationId: string,
      expectedStatus: 'failed' | 'pending',
      cutoffIso: string,
      claimedAt: string,
    ): Promise<boolean> {
      const statement = expectedStatus === 'pending'
        ? env.DB.prepare(`
          UPDATE media_operations
          SET cleanup_claimed_at = ?, finalize_started_at = NULL
          WHERE id = ?
            AND operation = 'put'
            AND status = 'pending'
            AND created_at <= ?
            AND (cleanup_claimed_at IS NULL OR cleanup_claimed_at <= ?)
            AND (finalize_started_at IS NULL OR finalize_started_at <= ?)
        `).bind(claimedAt, operationId, cutoffIso, cutoffIso, cutoffIso)
        : env.DB.prepare(`
          UPDATE media_operations
          SET cleanup_claimed_at = ?, finalize_started_at = NULL
          WHERE id = ?
            AND operation = 'put'
            AND status = 'failed'
            AND (cleanup_claimed_at IS NULL OR cleanup_claimed_at <= ?)
            AND (finalize_started_at IS NULL OR finalize_started_at <= ?)
        `).bind(claimedAt, operationId, cutoffIso, cutoffIso);
      const result = await statement.run();
      return result.meta?.changes === 1;
    },

    async releaseCleanupClaim(operationId: string, expectedCurrentStatus: 'failed' | 'pending'): Promise<void> {
      await env.DB.prepare(`
        UPDATE media_operations
        SET cleanup_claimed_at = NULL
        WHERE id = ? AND status = ?
      `).bind(operationId, expectedCurrentStatus).run();
    },

    async getActiveObject(objectKey: string): Promise<{ content_type: string; cache_control: string } | null> {
      return env.DB.prepare(
        'SELECT content_type, cache_control FROM media_objects WHERE object_key = ? AND deleted_at IS NULL',
      ).bind(objectKey).first<{ content_type: string; cache_control: string }>();
    },

    async getLiveObjectRecord(objectKey: string): Promise<{ byte_size: number; sha256: string } | null> {
      return env.DB.prepare(
        'SELECT byte_size, sha256 FROM media_objects WHERE object_key = ? AND deleted_at IS NULL',
      ).bind(objectKey).first<{ byte_size: number; sha256: string }>();
    },

    async tombstoneObject(
      operationId: string,
      objectKey: string,
      sha256: string,
      byteSize: number,
      nowIso: string,
      purgeAfter: string,
    ): Promise<void> {
      await env.DB.batch([
        env.DB.prepare(
          'UPDATE media_objects SET deleted_at = ? WHERE object_key = ? AND deleted_at IS NULL',
        ).bind(nowIso, objectKey),
        env.DB.prepare(`
          INSERT INTO media_operations
            (id, object_key, operation, status, expected_sha256, expected_byte_size,
             created_at, applied_at, purge_after)
          VALUES (?, ?, 'delete', 'tombstoned', ?, ?, ?, ?, ?)
        `).bind(operationId, objectKey, sha256, byteSize, nowIso, nowIso, purgeAfter),
      ]);
    },

    async tombstoneObjectIfUnreferenced(
      operationId: string,
      objectKey: string,
      sha256: string,
      byteSize: number,
      nowIso: string,
      purgeAfter: string,
      liveReferences: string[],
    ): Promise<boolean> {
      if (!liveReferences.length) return false;
      const placeholders = liveReferences.map(() => '?').join(', ');
      const results = await env.DB.batch([
        env.DB.prepare(`
          UPDATE media_objects
          SET deleted_at = ?
          WHERE object_key = ?
            AND deleted_at IS NULL
            AND NOT EXISTS (
              SELECT 1 FROM baiviet
              WHERE anh_url IN (${placeholders}) OR pdf_url IN (${placeholders})
            )
        `).bind(nowIso, objectKey, ...liveReferences, ...liveReferences),
        env.DB.prepare(`
          INSERT INTO media_operations
            (id, object_key, operation, status, expected_sha256, expected_byte_size,
             created_at, applied_at, purge_after)
          SELECT ?, ?, 'delete', 'tombstoned', ?, ?, ?, ?, ?
          WHERE EXISTS (
            SELECT 1 FROM media_objects WHERE object_key = ? AND deleted_at = ?
          )
        `).bind(
          operationId, objectKey, sha256, byteSize, nowIso, nowIso, purgeAfter,
          objectKey, nowIso,
        ),
      ]);
      return results[0]?.meta?.changes === 1 && results[1]?.meta?.changes === 1;
    },

    async listFailedOrStalePutOperations(
      cutoffIso: string,
      limit: number,
    ): Promise<Array<{ id: string; object_key: string; status: string }>> {
      const result = await env.DB.prepare(`
        SELECT id, object_key, status
        FROM media_operations
        WHERE operation = 'put'
          AND (cleanup_claimed_at IS NULL OR cleanup_claimed_at <= ?)
          AND (finalize_started_at IS NULL OR finalize_started_at <= ?)
          AND (
            status = 'failed'
            OR (status = 'pending' AND created_at <= ?)
          )
        ORDER BY created_at, id
        LIMIT ?
      `).bind(cutoffIso, cutoffIso, cutoffIso, limit).all<{ id: string; object_key: string; status: string }>();
      return result.results ?? [];
    },

    async listExpiredTombstones(timestamp: string, limit: number): Promise<Array<{ id: string; object_key: string }>> {
      const result = await env.DB.prepare(`
        SELECT operations.id, operations.object_key
        FROM media_operations AS operations
        INNER JOIN media_objects AS objects
          ON objects.object_key = operations.object_key
        WHERE operations.operation = 'delete'
          AND operations.status = 'tombstoned'
          AND operations.purge_after IS NOT NULL
          AND operations.purge_after <= ?
          AND objects.deleted_at IS NOT NULL
        ORDER BY operations.purge_after, operations.id
        LIMIT ?
      `).bind(timestamp, limit).all<{ id: string; object_key: string }>();
      return result.results ?? [];
    },

    async purgeTombstone(operationId: string, objectKey: string, timestamp: string): Promise<boolean> {
      const results = await env.DB.batch([
        env.DB.prepare(`
          DELETE FROM media_objects
          WHERE object_key = ? AND deleted_at IS NOT NULL
        `).bind(objectKey),
        env.DB.prepare(`
          UPDATE media_operations
          SET status = 'purged', applied_at = ?
          WHERE id = ? AND status = 'tombstoned' AND purge_after <= ?
        `).bind(timestamp, operationId, timestamp),
      ]);
      return !results.some((result) => result.success === false);
    },

    async headObject(objectKey: string) {
      return env.MEDIA?.head(objectKey) ?? null;
    },

    async putObject(objectKey: string, body: ReadableStream<Uint8Array>, options: R2PutOptionsLike) {
      if (!env.MEDIA) throw new Error('media-binding-missing');
      return env.MEDIA.put(objectKey, body, options);
    },

    async getObject(objectKey: string, rangeHeaders?: Headers) {
      if (!env.MEDIA) throw new Error('media-binding-missing');
      return env.MEDIA.get(objectKey, rangeHeaders ? { range: rangeHeaders } : undefined);
    },

    async deleteObject(objectKey: string): Promise<void> {
      if (!env.MEDIA) throw new Error('media-binding-missing');
      await env.MEDIA.delete(objectKey);
    },

    async isTombstoned(key: string): Promise<boolean> {
      const row = await env.DB.prepare(`
        SELECT id FROM media_operations
        WHERE object_key = ? AND status = 'tombstoned'
        LIMIT 1
      `).bind(key).first();
      return Boolean(row);
    },
  };
}
