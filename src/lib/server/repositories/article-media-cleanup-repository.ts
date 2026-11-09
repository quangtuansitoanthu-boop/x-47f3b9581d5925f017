import type { CloudflareEnvLike } from '../cloudflare-context';

export interface ArticleMediaCleanupEntry {
  article_id: string;
  object_key: string;
  source_field: string;
  status: 'pending' | 'failed' | 'tombstoned';
  last_error_code: string | null;
}

export function createArticleMediaCleanupRepository(env: CloudflareEnvLike) {
  return {
    async upsertEntries(
      articleId: string,
      entries: Array<{ objectKey: string; sourceField: string }>,
      nowIso: string,
    ): Promise<void> {
      if (!entries.length) return;
      await env.DB.batch(entries.map((entry) => env.DB.prepare(`
        INSERT INTO article_media_cleanup_queue
          (article_id, object_key, source_field, status, last_error_code, created_at, updated_at)
        VALUES (?, ?, ?, 'pending', NULL, ?, ?)
        ON CONFLICT(article_id, object_key, source_field) DO UPDATE SET
          status = CASE
            WHEN article_media_cleanup_queue.status = 'tombstoned' THEN article_media_cleanup_queue.status
            ELSE 'pending'
          END,
          last_error_code = CASE
            WHEN article_media_cleanup_queue.status = 'tombstoned' THEN article_media_cleanup_queue.last_error_code
            ELSE NULL
          END,
          updated_at = excluded.updated_at
      `).bind(articleId, entry.objectKey, entry.sourceField, nowIso, nowIso)));
    },

    async listRetryableEntries(articleId: string): Promise<ArticleMediaCleanupEntry[]> {
      const result = await env.DB.prepare(`
        SELECT article_id, object_key, source_field, status, last_error_code
        FROM article_media_cleanup_queue
        WHERE article_id = ? AND status IN ('pending', 'failed')
        ORDER BY source_field, object_key
      `).bind(articleId).all<ArticleMediaCleanupEntry>();
      return result.results ?? [];
    },

    async listGlobalRetryableEntries(limit: number): Promise<ArticleMediaCleanupEntry[]> {
      const result = await env.DB.prepare(`
        SELECT article_id, object_key, source_field, status, last_error_code
        FROM article_media_cleanup_queue AS cleanup
        WHERE status IN ('pending', 'failed')
          AND NOT EXISTS (
            SELECT 1
            FROM baiviet AS source_article
            WHERE source_article.id = cleanup.article_id
          )
        ORDER BY updated_at, article_id, source_field, object_key
        LIMIT ?
      `).bind(limit).all<ArticleMediaCleanupEntry>();
      return result.results ?? [];
    },

    async hasLiveArticleReference(
      objectKey: string,
      publicBaseUrl: string | undefined,
    ): Promise<boolean> {
      const references = liveReferenceForms(objectKey, publicBaseUrl);
      const placeholders = references.map(() => '?').join(', ');
      const match = await env.DB.prepare(`
        SELECT id
        FROM baiviet
        WHERE (CASE WHEN instr(anh_url, '#pos=') > 0
          THEN substr(anh_url, 1, instr(anh_url, '#pos=') - 1) ELSE anh_url END) IN (${placeholders})
          OR (CASE WHEN instr(pdf_url, '#pos=') > 0
            THEN substr(pdf_url, 1, instr(pdf_url, '#pos=') - 1) ELSE pdf_url END) IN (${placeholders})
        LIMIT 1
      `).bind(...references, ...references).first<{ id: string }>();
      return Boolean(match);
    },

    async markEntry(
      articleId: string,
      objectKey: string,
      sourceField: string,
      status: 'failed' | 'tombstoned',
      errorCode: string | null,
      nowIso: string,
    ): Promise<void> {
      await env.DB.prepare(`
        UPDATE article_media_cleanup_queue
        SET status = ?, last_error_code = ?, updated_at = ?
        WHERE article_id = ? AND object_key = ? AND source_field = ?
      `).bind(status, errorCode, nowIso, articleId, objectKey, sourceField).run();
    },
  };
}

export function liveReferenceForms(objectKey: string, publicBaseUrl: string | undefined): string[] {
  const configuredBase = String(publicBaseUrl || '').replace(/\/+$/u, '');
  return Array.from(new Set([
    objectKey,
    `https://media.quangtu.vn/${objectKey}`,
    `/api/media/${objectKey}`,
    ...(configuredBase ? [`${configuredBase}/${objectKey}`] : []),
  ])).sort();
}
