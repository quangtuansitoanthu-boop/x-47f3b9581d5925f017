import type { CloudflareEnvLike, D1PreparedStatement, D1ResultRow } from '../cloudflare-context';
import { tableDefinition } from '../domain/data-contract';
import { ServerInputError } from '../errors';

export type FacebookConnectionStatus =
  | 'disabled'
  | 'permission_missing'
  | 'permission_unavailable'
  | 'active'
  | 'backoff'
  | 'reauthorization_required'
  | 'configuration_error';

export interface FacebookSettingsRow {
  source_url: string;
  publish_policy: 'review' | 'auto';
  source_generation: number;
  updated_at: string;
}

export interface FacebookConnectionRow extends D1ResultRow {
  id: string;
  app_user_id: string;
  facebook_user_id: string | null;
  facebook_display_name: string | null;
  source_url: string;
  token_ciphertext: string | null;
  token_key_version: string | null;
  granted_scopes: string;
  token_expires_at: string | null;
  data_access_expires_at: string | null;
  status: FacebookConnectionStatus;
  generation: number;
  watermark_created_time: string | null;
  scan_after_cursor: string | null;
  scan_since_epoch: number | null;
  scan_max_created_time: string | null;
  scan_had_failure: number;
  next_sync_at: string | null;
  backoff_until: string | null;
  lease_token: string | null;
  lease_expires_at: string | null;
  last_attempt_at: string | null;
  last_success_at: string | null;
  last_error_code: string | null;
  tombstoned_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FacebookImportRow extends D1ResultRow {
  id: string;
  connection_id: string | null;
  facebook_post_id: string;
  article_id: string | null;
  permalink_url: string;
  privacy: string;
  source_created_at: string | null;
  source_updated_at: string | null;
  source_content_hash: string;
  article_content_hash: string | null;
  source_managed: number;
  status: 'review' | 'published' | 'detached' | 'removed' | 'failed';
  missing_count: number;
  last_seen_at: string | null;
  last_reconciled_at: string | null;
  last_error_code: string | null;
  created_at: string;
  updated_at: string;
}

export interface FacebookArticleRecord {
  id: string;
  tieu_de: string;
  tom_tat: string;
  noi_dung: string;
  danh_muc: string;
  tags: string;
  tac_gia: string;
  anh_url: string;
  link_ngoai: string;
  ngay_dang: string;
  trang_thai: string;
  created_at: string;
  updated_at: string;
}

export type FacebookImportRemovalFence =
  | { mode: 'live'; connectionId: string; generation: number; leaseToken: string }
  | { mode: 'tombstoned'; connectionId: string; generation: number }
  | { mode: 'actor'; connectionId: string; appUserId: string };

export function prepareManagedImportDetachByArticleIds(
  env: CloudflareEnvLike,
  articleIds: string[],
  now: string,
): D1PreparedStatement | null {
  const ids = Array.from(new Set(articleIds.map((id) => String(id).trim()).filter(Boolean)));
  if (!ids.length) return null;
  return env.DB.prepare(`
    UPDATE facebook_post_imports
    SET source_managed = 0, status = 'detached',
      last_error_code = 'article_modified', updated_at = ?
    WHERE source_managed = 1
      AND article_id IN (${ids.map(() => '?').join(', ')})
  `).bind(now, ...ids);
}

export function createFacebookRepository(env: CloudflareEnvLike) {
  const getConnection = async (id: string) => env.DB.prepare(
    'SELECT * FROM facebook_connections WHERE id = ?',
  ).bind(id).first<FacebookConnectionRow>();

  return {
    async getConnection(id: string): Promise<FacebookConnectionRow | null> {
      return getConnection(id);
    },

    async getSettings(): Promise<FacebookSettingsRow> {
      const row = await env.DB.prepare(
        'SELECT source_url, publish_policy, source_generation, updated_at FROM facebook_import_settings WHERE id = 1',
      ).first<FacebookSettingsRow>();
      return row || {
        source_url: 'https://www.facebook.com/tranan.buhd',
        publish_policy: 'review',
        source_generation: 0,
        updated_at: '',
      };
    },

    async updateSettings(input: { sourceUrl: string; publishPolicy: 'review' | 'auto'; actorUserId: string; now: string }) {
      const current = await this.getSettings();
      const sourceChanged = current.source_url !== input.sourceUrl;
      const statements = [env.DB.prepare(`
        UPDATE facebook_import_settings
        SET source_url = ?, publish_policy = ?, source_generation = source_generation + ?, updated_by = ?, updated_at = ?
        WHERE id = 1
      `).bind(input.sourceUrl, input.publishPolicy, sourceChanged ? 1 : 0, input.actorUserId, input.now)];
      if (sourceChanged) {
        statements.push(env.DB.prepare(`
          UPDATE facebook_connections
          SET source_url = ?, token_ciphertext = NULL, token_key_version = NULL,
            status = 'reauthorization_required', generation = generation + 1,
            lease_token = NULL, lease_expires_at = NULL, next_sync_at = NULL,
            scan_after_cursor = NULL, scan_since_epoch = NULL, scan_max_created_time = NULL,
            scan_had_failure = 0,
            last_error_code = 'source_reconfirmation_required', updated_at = ?
          WHERE tombstoned_at IS NULL
        `).bind(input.sourceUrl, input.now));
      }
      await env.DB.batch(statements);
      return this.getSettings();
    },

    async getConnectionForUser(userId: string): Promise<FacebookConnectionRow | null> {
      return env.DB.prepare(
        'SELECT * FROM facebook_connections WHERE app_user_id = ? LIMIT 1',
      ).bind(userId).first<FacebookConnectionRow>();
    },

    async getConnectionBySubject(facebookUserId: string): Promise<FacebookConnectionRow | null> {
      return env.DB.prepare(
        'SELECT * FROM facebook_connections WHERE facebook_user_id = ? LIMIT 1',
      ).bind(facebookUserId).first<FacebookConnectionRow>();
    },

    async saveConnection(input: {
      actorUserId: string;
      connectionId: string;
      expectedGeneration: number;
      facebookUserId: string;
      displayName: string;
      sourceUrl: string;
      ciphertext: string;
      keyVersion: string;
      scopes: string[];
      tokenExpiresAt: string | null;
      dataAccessExpiresAt: string | null;
      now: string;
    }): Promise<FacebookConnectionRow | null> {
      const existing = await this.getConnectionForUser(input.actorUserId);
      if (!existing) {
        if (input.expectedGeneration !== 0) return null;
        await env.DB.prepare(`
          INSERT INTO facebook_connections
            (id, app_user_id, facebook_user_id, facebook_display_name, source_url,
              token_ciphertext, token_key_version, granted_scopes, token_expires_at,
              data_access_expires_at, status, generation, next_sync_at, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 1, ?, ?, ?)
        `).bind(
          input.connectionId, input.actorUserId, input.facebookUserId, input.displayName,
          input.sourceUrl, input.ciphertext, input.keyVersion, JSON.stringify(input.scopes),
          input.tokenExpiresAt, input.dataAccessExpiresAt, input.now, input.now, input.now,
        ).run();
        return getConnection(input.connectionId);
      }
      const result = await env.DB.prepare(`
        UPDATE facebook_connections
        SET facebook_user_id = ?, facebook_display_name = ?, source_url = ?,
          token_ciphertext = ?, token_key_version = ?, granted_scopes = ?,
          token_expires_at = ?, data_access_expires_at = ?, status = 'active',
          generation = generation + 1, next_sync_at = ?, backoff_until = NULL,
          lease_token = NULL, lease_expires_at = NULL, last_error_code = NULL,
          scan_after_cursor = NULL, scan_since_epoch = NULL, scan_max_created_time = NULL,
          scan_had_failure = 0,
          tombstoned_at = NULL, updated_at = ?
        WHERE id = ? AND app_user_id = ? AND generation = ?
      `).bind(
        input.facebookUserId, input.displayName, input.sourceUrl, input.ciphertext,
        input.keyVersion, JSON.stringify(input.scopes), input.tokenExpiresAt,
        input.dataAccessExpiresAt, input.now, input.now, existing.id,
        input.actorUserId, input.expectedGeneration,
      ).run();
      return Number(result.meta?.changes || 0) === 1 ? getConnection(existing.id) : null;
    },

    async markPermissionMissing(input: {
      actorUserId: string;
      expectedGeneration: number;
      facebookUserId: string;
      displayName: string;
      sourceUrl: string;
      scopes: string[];
      now: string;
    }): Promise<void> {
      const existing = await this.getConnectionForUser(input.actorUserId);
      if (!existing && input.expectedGeneration === 0) {
        await env.DB.prepare(`
          INSERT INTO facebook_connections
            (id, app_user_id, facebook_user_id, facebook_display_name, source_url,
              granted_scopes, status, generation, last_error_code, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, 'permission_missing', 1, 'user_posts_missing', ?, ?)
        `).bind(
          crypto.randomUUID(), input.actorUserId, input.facebookUserId, input.displayName,
          input.sourceUrl, JSON.stringify(input.scopes), input.now, input.now,
        ).run();
        return;
      }
      await env.DB.prepare(`
        UPDATE facebook_connections
        SET facebook_user_id = ?, facebook_display_name = ?, source_url = ?,
          token_ciphertext = NULL, token_key_version = NULL, granted_scopes = ?,
          status = 'permission_missing', generation = generation + 1,
          lease_token = NULL, lease_expires_at = NULL, last_error_code = 'user_posts_missing',
          scan_after_cursor = NULL, scan_since_epoch = NULL, scan_max_created_time = NULL,
          scan_had_failure = 0,
          tombstoned_at = NULL, updated_at = ?
        WHERE app_user_id = ? AND generation = ?
      `).bind(
        input.facebookUserId, input.displayName, input.sourceUrl, JSON.stringify(input.scopes),
        input.now, input.actorUserId, input.expectedGeneration,
      ).run();
    },

    async listDueConnections(now: string, limit = 10): Promise<FacebookConnectionRow[]> {
      const response = await env.DB.prepare(`
        SELECT * FROM facebook_connections
        WHERE tombstoned_at IS NULL
          AND status IN ('active', 'backoff')
          AND token_ciphertext IS NOT NULL
          AND (next_sync_at IS NULL OR next_sync_at <= ?)
          AND (backoff_until IS NULL OR backoff_until <= ?)
          AND (lease_expires_at IS NULL OR lease_expires_at <= ?)
        ORDER BY COALESCE(next_sync_at, created_at), id
        LIMIT ?
      `).bind(now, now, now, Math.max(1, Math.min(limit, 25))).all<FacebookConnectionRow>();
      return response.results || [];
    },

    async acquireLease(id: string, expectedGeneration: number, leaseToken: string, now: string, expiresAt: string) {
      const result = await env.DB.prepare(`
        UPDATE facebook_connections
        SET lease_token = ?, lease_expires_at = ?, last_attempt_at = ?, updated_at = ?
        WHERE id = ? AND generation = ? AND tombstoned_at IS NULL
          AND status IN ('active', 'backoff')
          AND (lease_expires_at IS NULL OR lease_expires_at <= ?)
      `).bind(leaseToken, expiresAt, now, now, id, expectedGeneration, now).run();
      return Number(result.meta?.changes || 0) === 1 ? getConnection(id) : null;
    },

    async markSyncSuccess(input: {
      id: string; generation: number; leaseToken: string; now: string;
      nextSyncAt: string; watermark: string | null;
    }): Promise<boolean> {
      const result = await env.DB.prepare(`
        UPDATE facebook_connections
        SET status = 'active', watermark_created_time = COALESCE(?, watermark_created_time),
          next_sync_at = ?, backoff_until = NULL, lease_token = NULL, lease_expires_at = NULL,
          scan_after_cursor = NULL, scan_since_epoch = NULL, scan_max_created_time = NULL,
          scan_had_failure = 0,
          last_success_at = ?, last_error_code = NULL, updated_at = ?
        WHERE id = ? AND generation = ? AND lease_token = ? AND tombstoned_at IS NULL
      `).bind(
        input.watermark, input.nextSyncAt, input.now, input.now,
        input.id, input.generation, input.leaseToken,
      ).run();
      return Number(result.meta?.changes || 0) === 1;
    },

    async markSyncFailure(input: {
      id: string; generation: number; leaseToken: string; now: string;
      status: FacebookConnectionStatus; errorCode: string; retryAt: string | null;
    }): Promise<void> {
      await env.DB.prepare(`
        UPDATE facebook_connections
        SET status = ?, next_sync_at = ?, backoff_until = ?, lease_token = NULL,
          lease_expires_at = NULL, last_error_code = ?, updated_at = ?,
          scan_after_cursor = CASE WHEN ? = 'backoff' THEN scan_after_cursor ELSE NULL END,
          scan_since_epoch = CASE WHEN ? = 'backoff' THEN scan_since_epoch ELSE NULL END,
          scan_max_created_time = CASE WHEN ? = 'backoff' THEN scan_max_created_time ELSE NULL END,
          scan_had_failure = CASE WHEN ? = 'backoff' THEN scan_had_failure ELSE 0 END,
          token_ciphertext = CASE WHEN ? IN ('reauthorization_required', 'permission_missing', 'permission_unavailable') THEN NULL ELSE token_ciphertext END,
          token_key_version = CASE WHEN ? IN ('reauthorization_required', 'permission_missing', 'permission_unavailable') THEN NULL ELSE token_key_version END
        WHERE id = ? AND generation = ? AND lease_token = ? AND tombstoned_at IS NULL
      `).bind(
        input.status, input.retryAt, input.retryAt, input.errorCode, input.now,
        input.status, input.status, input.status, input.status, input.status, input.status,
        input.id, input.generation, input.leaseToken,
      ).run();
    },

    async persistScanContinuation(input: {
      id: string; generation: number; leaseToken: string; after: string;
      sinceEpoch: number; maxCreated: string | null; hadFailure: boolean; now: string;
    }): Promise<boolean> {
      const result = await env.DB.prepare(`
        UPDATE facebook_connections
        SET scan_after_cursor = ?, scan_since_epoch = ?, scan_max_created_time = ?,
          scan_had_failure = ?, updated_at = ?
        WHERE id = ? AND generation = ? AND lease_token = ? AND tombstoned_at IS NULL
          AND status IN ('active', 'backoff')
      `).bind(
        input.after, input.sinceEpoch, input.maxCreated, input.hadFailure ? 1 : 0, input.now,
        input.id, input.generation, input.leaseToken,
      ).run();
      return Number(result.meta?.changes || 0) === 1;
    },

    async clearScanContinuation(input: {
      id: string; generation: number; leaseToken: string; now: string;
    }): Promise<boolean> {
      const result = await env.DB.prepare(`
        UPDATE facebook_connections
        SET scan_after_cursor = NULL, scan_since_epoch = NULL, scan_max_created_time = NULL,
          scan_had_failure = 0,
          updated_at = ?
        WHERE id = ? AND generation = ? AND lease_token = ? AND tombstoned_at IS NULL
          AND status IN ('active', 'backoff')
      `).bind(input.now, input.id, input.generation, input.leaseToken).run();
      return Number(result.meta?.changes || 0) === 1;
    },

    async releaseLease(id: string, generation: number, leaseToken: string, now: string): Promise<void> {
      await env.DB.prepare(`
        UPDATE facebook_connections SET lease_token = NULL, lease_expires_at = NULL, updated_at = ?
        WHERE id = ? AND generation = ? AND lease_token = ?
      `).bind(now, id, generation, leaseToken).run();
    },

    async listImports(connectionId?: string | null, limit = 100): Promise<FacebookImportRow[]> {
      const statement = connectionId
        ? env.DB.prepare(`
            SELECT * FROM facebook_post_imports WHERE connection_id = ?
            ORDER BY COALESCE(source_created_at, created_at) DESC LIMIT ?
          `).bind(connectionId, Math.max(1, Math.min(limit, 200)))
        : env.DB.prepare(`
            SELECT * FROM facebook_post_imports
            ORDER BY COALESCE(source_created_at, created_at) DESC LIMIT ?
          `).bind(Math.max(1, Math.min(limit, 200)));
      const response = await statement.all<FacebookImportRow>();
      return response.results || [];
    },

    async listImportsPage(
      connectionId: string | null,
      offset = 0,
      limit = 50,
    ): Promise<{ imports: FacebookImportRow[]; nextOffset: number | null }> {
      const boundedLimit = Math.max(1, Math.min(limit, 100));
      const boundedOffset = Math.max(0, Math.min(offset, 100_000));
      const statement = connectionId
        ? env.DB.prepare(`
            SELECT * FROM facebook_post_imports WHERE connection_id = ?
            ORDER BY COALESCE(source_created_at, created_at) DESC, id DESC LIMIT ? OFFSET ?
          `).bind(connectionId, boundedLimit + 1, boundedOffset)
        : env.DB.prepare(`
            SELECT * FROM facebook_post_imports
            ORDER BY COALESCE(source_created_at, created_at) DESC, id DESC LIMIT ? OFFSET ?
          `).bind(boundedLimit + 1, boundedOffset);
      const results = (await statement.all<FacebookImportRow>()).results ?? [];
      return {
        imports: results.slice(0, boundedLimit),
        nextOffset: results.length > boundedLimit ? boundedOffset + boundedLimit : null,
      };
    },

    async listImportsForReconciliation(connectionId: string, before: string, limit = 10): Promise<FacebookImportRow[]> {
      const response = await env.DB.prepare(`
        SELECT * FROM facebook_post_imports
        WHERE connection_id = ? AND source_managed = 1 AND status NOT IN ('removed', 'detached')
          AND COALESCE(last_reconciled_at, created_at) < ?
        ORDER BY last_reconciled_at IS NOT NULL, last_reconciled_at ASC, id ASC
        LIMIT ?
      `).bind(connectionId, before, Math.max(1, Math.min(limit, 25))).all<FacebookImportRow>();
      return response.results ?? [];
    },

    async getImport(id: string): Promise<FacebookImportRow | null> {
      return env.DB.prepare('SELECT * FROM facebook_post_imports WHERE id = ?')
        .bind(id).first<FacebookImportRow>();
    },

    async getImportForUser(id: string, appUserId: string): Promise<FacebookImportRow | null> {
      return env.DB.prepare(`
        SELECT imported.*
        FROM facebook_post_imports imported
        INNER JOIN facebook_connections connection ON connection.id = imported.connection_id
        WHERE imported.id = ? AND connection.app_user_id = ?
        LIMIT 1
      `).bind(id, appUserId).first<FacebookImportRow>();
    },

    async getImportByPostId(postId: string): Promise<FacebookImportRow | null> {
      return env.DB.prepare('SELECT * FROM facebook_post_imports WHERE facebook_post_id = ?')
        .bind(postId).first<FacebookImportRow>();
    },

    async getArticle(id: string): Promise<FacebookArticleRecord | null> {
      return env.DB.prepare(`
        SELECT id, tieu_de, tom_tat, noi_dung, danh_muc, tags, tac_gia,
          anh_url, link_ngoai, ngay_dang, trang_thai, created_at, updated_at
        FROM baiviet WHERE id = ?
      `).bind(id).first<FacebookArticleRecord>();
    },

    async insertImport(input: {
      connectionId: string; generation: number; leaseToken: string; importId: string;
      postId: string; article: FacebookArticleRecord; permalink: string; privacy: string;
      sourceCreatedAt: string | null; sourceUpdatedAt: string | null;
      sourceHash: string; articleHash: string; importStatus: 'review' | 'published'; now: string;
    }): Promise<boolean> {
      const a = input.article;
      const results = await env.DB.batch([
        env.DB.prepare(`
          INSERT OR IGNORE INTO baiviet
            (id, tieu_de, tom_tat, noi_dung, danh_muc, tags, tac_gia, anh_url,
              link_ngoai, ngay_dang, trang_thai, created_at, updated_at)
          SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
          WHERE EXISTS (
            SELECT 1 FROM facebook_connections WHERE id = ? AND generation = ?
              AND lease_token = ? AND tombstoned_at IS NULL AND status IN ('active', 'backoff')
          )
        `).bind(
          a.id, a.tieu_de, a.tom_tat, a.noi_dung, a.danh_muc, a.tags, a.tac_gia,
          a.anh_url, a.link_ngoai, a.ngay_dang, a.trang_thai, a.created_at, a.updated_at,
          input.connectionId, input.generation, input.leaseToken,
        ),
        env.DB.prepare(`
          INSERT OR IGNORE INTO facebook_post_imports
            (id, connection_id, facebook_post_id, article_id, permalink_url, privacy,
              source_created_at, source_updated_at, source_content_hash, article_content_hash,
              source_managed, status, missing_count, last_seen_at, last_reconciled_at, created_at, updated_at)
          SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 0, ?, ?, ?, ?
          WHERE EXISTS (
            SELECT 1 FROM facebook_connections WHERE id = ? AND generation = ?
              AND lease_token = ? AND tombstoned_at IS NULL AND status IN ('active', 'backoff')
          ) AND EXISTS (
            SELECT 1 FROM baiviet imported_article
            WHERE imported_article.id = ? AND imported_article.tieu_de IS ?
              AND imported_article.tom_tat IS ? AND imported_article.noi_dung IS ?
              AND imported_article.danh_muc IS ? AND imported_article.tags IS ?
              AND imported_article.tac_gia IS ? AND imported_article.anh_url IS ?
              AND imported_article.link_ngoai IS ? AND imported_article.ngay_dang IS ?
              AND imported_article.trang_thai IS ? AND imported_article.created_at IS ?
              AND imported_article.updated_at IS ?
          )
        `).bind(
          input.importId, input.connectionId, input.postId, a.id, input.permalink,
          input.privacy, input.sourceCreatedAt, input.sourceUpdatedAt, input.sourceHash,
          input.articleHash, input.importStatus, input.now, input.now, input.now, input.now,
          input.connectionId, input.generation, input.leaseToken,
          a.id, a.tieu_de, a.tom_tat, a.noi_dung, a.danh_muc, a.tags, a.tac_gia,
          a.anh_url, a.link_ngoai, a.ngay_dang, a.trang_thai, a.created_at, a.updated_at,
        ),
      ]);
      return Number(results[0]?.meta?.changes || 0) === 1 && Number(results[1]?.meta?.changes || 0) === 1;
    },

    async updateManagedImport(input: {
      connectionId: string; generation: number; leaseToken: string; importId: string;
      article: FacebookArticleRecord; permalink: string; privacy: string;
      sourceUpdatedAt: string | null; sourceHash: string; articleHash: string;
      importStatus: 'review' | 'published'; now: string;
      expectedArticle: FacebookArticleRecord; expectedArticleHash: string;
    }): Promise<boolean> {
      const a = input.article;
      const results = await env.DB.batch([
        env.DB.prepare(`
          UPDATE baiviet SET tieu_de = ?, tom_tat = ?, noi_dung = ?, danh_muc = ?,
            tags = ?, tac_gia = ?, anh_url = ?, link_ngoai = ?, ngay_dang = ?,
            trang_thai = ?, updated_at = ?
          WHERE id = ?
            AND tieu_de IS ? AND tom_tat IS ? AND noi_dung IS ? AND danh_muc IS ?
            AND tags IS ? AND tac_gia IS ? AND anh_url IS ? AND link_ngoai IS ?
            AND ngay_dang IS ? AND trang_thai IS ? AND created_at IS ? AND updated_at IS ?
            AND EXISTS (
            SELECT 1 FROM facebook_post_imports owned_import
            WHERE owned_import.id = ? AND owned_import.article_id = baiviet.id
              AND owned_import.connection_id = ? AND owned_import.source_managed = 1
              AND owned_import.article_content_hash = ?
          ) AND EXISTS (
            SELECT 1 FROM facebook_connections WHERE id = ? AND generation = ?
              AND lease_token = ? AND tombstoned_at IS NULL AND status IN ('active', 'backoff')
          )
        `).bind(
          a.tieu_de, a.tom_tat, a.noi_dung, a.danh_muc, a.tags, a.tac_gia,
          a.anh_url, a.link_ngoai, a.ngay_dang, a.trang_thai, a.updated_at, a.id,
          input.expectedArticle.tieu_de, input.expectedArticle.tom_tat,
          input.expectedArticle.noi_dung, input.expectedArticle.danh_muc,
          input.expectedArticle.tags, input.expectedArticle.tac_gia,
          input.expectedArticle.anh_url, input.expectedArticle.link_ngoai,
          input.expectedArticle.ngay_dang, input.expectedArticle.trang_thai,
          input.expectedArticle.created_at, input.expectedArticle.updated_at,
          input.importId, input.connectionId, input.expectedArticleHash,
          input.connectionId, input.generation, input.leaseToken,
        ),
        env.DB.prepare(`
          UPDATE facebook_post_imports SET permalink_url = ?, privacy = ?, source_updated_at = ?,
            source_content_hash = ?, article_content_hash = ?, status = ?, missing_count = 0,
            last_seen_at = ?, last_reconciled_at = ?, last_error_code = NULL, updated_at = ?
          WHERE id = ? AND source_managed = 1 AND connection_id = ? AND EXISTS (
            SELECT 1 FROM baiviet current_article
            WHERE current_article.id = facebook_post_imports.article_id
              AND current_article.tieu_de IS ? AND current_article.tom_tat IS ?
              AND current_article.noi_dung IS ? AND current_article.danh_muc IS ?
              AND current_article.tags IS ? AND current_article.tac_gia IS ?
              AND current_article.anh_url IS ? AND current_article.link_ngoai IS ?
              AND current_article.ngay_dang IS ? AND current_article.trang_thai IS ?
              AND current_article.updated_at IS ?
          ) AND EXISTS (
            SELECT 1 FROM facebook_connections WHERE id = ? AND generation = ?
              AND lease_token = ? AND tombstoned_at IS NULL AND status IN ('active', 'backoff')
          )
        `).bind(
          input.permalink, input.privacy, input.sourceUpdatedAt, input.sourceHash,
          input.articleHash, input.importStatus, input.now, input.now, input.now, input.importId,
          input.connectionId, a.tieu_de, a.tom_tat, a.noi_dung, a.danh_muc,
          a.tags, a.tac_gia, a.anh_url, a.link_ngoai, a.ngay_dang, a.trang_thai,
          a.updated_at, input.connectionId, input.generation, input.leaseToken,
        ),
      ]);
      return Number(results[0]?.meta?.changes || 0) === 1 && Number(results[1]?.meta?.changes || 0) === 1;
    },

    async restoreManagedImport(input: {
      connectionId: string; generation: number; leaseToken: string; importId: string;
      article: FacebookArticleRecord; permalink: string; privacy: string;
      sourceCreatedAt: string | null; sourceUpdatedAt: string | null;
      sourceHash: string; articleHash: string; importStatus: 'review' | 'published'; now: string;
    }): Promise<boolean> {
      const a = input.article;
      const results = await env.DB.batch([
        env.DB.prepare(`
          INSERT OR IGNORE INTO baiviet
            (id, tieu_de, tom_tat, noi_dung, danh_muc, tags, tac_gia, anh_url,
              link_ngoai, ngay_dang, trang_thai, created_at, updated_at)
          SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
          WHERE EXISTS (
            SELECT 1 FROM facebook_post_imports owned_import
            WHERE owned_import.id = ? AND owned_import.connection_id = ?
              AND owned_import.source_managed = 1 AND owned_import.article_id IS NULL
          ) AND EXISTS (
            SELECT 1 FROM facebook_connections WHERE id = ? AND generation = ?
              AND lease_token = ? AND tombstoned_at IS NULL AND status IN ('active', 'backoff')
          )
        `).bind(
          a.id, a.tieu_de, a.tom_tat, a.noi_dung, a.danh_muc, a.tags, a.tac_gia,
          a.anh_url, a.link_ngoai, a.ngay_dang, a.trang_thai, a.created_at, a.updated_at,
          input.importId, input.connectionId, input.connectionId, input.generation, input.leaseToken,
        ),
        env.DB.prepare(`
          UPDATE facebook_post_imports
          SET article_id = ?, permalink_url = ?, privacy = ?, source_created_at = ?,
            source_updated_at = ?, source_content_hash = ?, article_content_hash = ?,
            source_managed = 1, status = ?, missing_count = 0, last_seen_at = ?,
            last_reconciled_at = ?, last_error_code = NULL, updated_at = ?
          WHERE id = ? AND connection_id = ? AND source_managed = 1 AND article_id IS NULL
            AND EXISTS (
              SELECT 1 FROM baiviet restored_article
              WHERE restored_article.id = ? AND restored_article.tieu_de IS ?
                AND restored_article.tom_tat IS ? AND restored_article.noi_dung IS ?
                AND restored_article.danh_muc IS ? AND restored_article.tags IS ?
                AND restored_article.tac_gia IS ? AND restored_article.anh_url IS ?
                AND restored_article.link_ngoai IS ? AND restored_article.ngay_dang IS ?
                AND restored_article.trang_thai IS ? AND restored_article.created_at IS ?
                AND restored_article.updated_at IS ?
            )
            AND EXISTS (
              SELECT 1 FROM facebook_connections WHERE id = ? AND generation = ?
                AND lease_token = ? AND tombstoned_at IS NULL AND status IN ('active', 'backoff')
            )
        `).bind(
          a.id, input.permalink, input.privacy, input.sourceCreatedAt, input.sourceUpdatedAt,
          input.sourceHash, input.articleHash, input.importStatus, input.now, input.now, input.now,
          input.importId, input.connectionId,
          a.id, a.tieu_de, a.tom_tat, a.noi_dung, a.danh_muc, a.tags, a.tac_gia,
          a.anh_url, a.link_ngoai, a.ngay_dang, a.trang_thai, a.created_at, a.updated_at,
          input.connectionId, input.generation, input.leaseToken,
        ),
      ]);
      return Number(results[0]?.meta?.changes || 0) === 1 && Number(results[1]?.meta?.changes || 0) === 1;
    },

    async touchImport(id: string, now: string): Promise<void> {
      await env.DB.prepare(`
        UPDATE facebook_post_imports SET missing_count = 0, last_seen_at = ?,
          last_reconciled_at = ?, updated_at = ? WHERE id = ?
      `).bind(now, now, now, id).run();
    },

    async markImportReconciled(id: string, now: string): Promise<void> {
      await env.DB.prepare('UPDATE facebook_post_imports SET last_reconciled_at = ?, updated_at = ? WHERE id = ?')
        .bind(now, now, id).run();
    },

    async recordFailedImport(input: {
      connectionId: string; generation: number; leaseToken: string; importId: string;
      postId: string; permalink: string; privacy: string; sourceCreatedAt: string | null;
      sourceUpdatedAt: string | null; sourceHash: string; errorCode: string; now: string;
    }): Promise<void> {
      await env.DB.prepare(`
        INSERT INTO facebook_post_imports
          (id, connection_id, facebook_post_id, article_id, permalink_url, privacy,
            source_created_at, source_updated_at, source_content_hash, article_content_hash,
            source_managed, status, missing_count, last_seen_at, last_reconciled_at,
            last_error_code, created_at, updated_at)
        SELECT ?, ?, ?, NULL, ?, ?, ?, ?, ?, NULL, 1, 'failed', 0, ?, ?, ?, ?, ?
        WHERE EXISTS (
          SELECT 1 FROM facebook_connections WHERE id = ? AND generation = ?
            AND lease_token = ? AND tombstoned_at IS NULL AND status IN ('active', 'backoff')
        )
        ON CONFLICT(facebook_post_id) DO UPDATE SET
          status = CASE WHEN facebook_post_imports.article_id IS NULL THEN 'failed' ELSE facebook_post_imports.status END,
          last_error_code = excluded.last_error_code,
          last_reconciled_at = excluded.last_reconciled_at,
          updated_at = excluded.updated_at
        WHERE facebook_post_imports.connection_id = excluded.connection_id
          AND facebook_post_imports.source_managed = 1
      `).bind(
        input.importId, input.connectionId, input.postId, input.permalink, input.privacy,
        input.sourceCreatedAt, input.sourceUpdatedAt, input.sourceHash, input.now, input.now,
        input.errorCode, input.now, input.now, input.connectionId, input.generation, input.leaseToken,
      ).run();
    },

    async incrementMissing(id: string, now: string): Promise<number> {
      await env.DB.prepare(`
        UPDATE facebook_post_imports SET missing_count = missing_count + 1, updated_at = ? WHERE id = ?
      `).bind(now, id).run();
      const row = await this.getImport(id);
      return Number(row?.missing_count || 0);
    },

    async markImportRemoved(id: string, now: string): Promise<void> {
      await env.DB.prepare(`
        UPDATE facebook_post_imports SET article_id = NULL, source_managed = 0,
          status = 'removed', permalink_url = '', last_error_code = NULL, updated_at = ?
        WHERE id = ?
      `).bind(now, id).run();
    },

    async detachImport(id: string, errorCode: string | null, now: string): Promise<void> {
      await env.DB.prepare(`
        UPDATE facebook_post_imports SET source_managed = 0, status = 'detached',
          last_error_code = ?, updated_at = ? WHERE id = ?
      `).bind(errorCode, now, id).run();
    },

    async updateManagedImportPublication(input: {
      item: FacebookImportRow;
      actorUserId: string;
      expectedArticle: FacebookArticleRecord;
      articleStatus: string;
      importStatus: 'review' | 'published';
      nextArticleHash: string;
      now: string;
    }): Promise<boolean> {
      if (!input.item.connection_id || !input.item.article_id || !input.item.article_content_hash) return false;
      const before = input.expectedArticle;
      const after = { ...before, trang_thai: input.articleStatus, updated_at: input.now };
      const results = await env.DB.batch([
        env.DB.prepare(`
          UPDATE baiviet SET trang_thai = ?, updated_at = ?
          WHERE id = ?
            AND tieu_de IS ? AND tom_tat IS ? AND noi_dung IS ? AND danh_muc IS ?
            AND tags IS ? AND tac_gia IS ? AND anh_url IS ? AND link_ngoai IS ?
            AND ngay_dang IS ? AND trang_thai IS ? AND created_at IS ? AND updated_at IS ?
            AND EXISTS (
              SELECT 1 FROM facebook_post_imports owned_import
              INNER JOIN facebook_connections owned_connection
                ON owned_connection.id = owned_import.connection_id
              WHERE owned_import.id = ? AND owned_import.article_id = baiviet.id
                AND owned_import.connection_id = ? AND owned_import.source_managed = 1
                AND owned_import.article_content_hash = ?
                AND owned_connection.app_user_id = ? AND owned_connection.tombstoned_at IS NULL
            )
        `).bind(
          input.articleStatus, input.now, before.id,
          before.tieu_de, before.tom_tat, before.noi_dung, before.danh_muc,
          before.tags, before.tac_gia, before.anh_url, before.link_ngoai,
          before.ngay_dang, before.trang_thai, before.created_at, before.updated_at,
          input.item.id, input.item.connection_id, input.item.article_content_hash, input.actorUserId,
        ),
        env.DB.prepare(`
          UPDATE facebook_post_imports
          SET status = ?, article_content_hash = ?, last_error_code = NULL, updated_at = ?
          WHERE id = ? AND connection_id = ? AND article_id = ? AND source_managed = 1
            AND article_content_hash = ?
            AND EXISTS (
              SELECT 1 FROM facebook_connections owned_connection
              WHERE owned_connection.id = facebook_post_imports.connection_id
                AND owned_connection.app_user_id = ? AND owned_connection.tombstoned_at IS NULL
            )
            AND EXISTS (
              SELECT 1 FROM baiviet current_article
              WHERE current_article.id = facebook_post_imports.article_id
                AND current_article.tieu_de IS ? AND current_article.tom_tat IS ?
                AND current_article.noi_dung IS ? AND current_article.danh_muc IS ?
                AND current_article.tags IS ? AND current_article.tac_gia IS ?
                AND current_article.anh_url IS ? AND current_article.link_ngoai IS ?
                AND current_article.ngay_dang IS ? AND current_article.trang_thai IS ?
                AND current_article.created_at IS ? AND current_article.updated_at IS ?
            )
        `).bind(
          input.importStatus, input.nextArticleHash, input.now,
          input.item.id, input.item.connection_id, input.item.article_id,
          input.item.article_content_hash, input.actorUserId,
          after.tieu_de, after.tom_tat, after.noi_dung, after.danh_muc,
          after.tags, after.tac_gia, after.anh_url, after.link_ngoai,
          after.ngay_dang, after.trang_thai, after.created_at, after.updated_at,
        ),
      ]);
      return Number(results[0]?.meta?.changes || 0) === 1
        && Number(results[1]?.meta?.changes || 0) === 1;
    },

    async deleteArticle(articleId: string): Promise<void> {
      await env.DB.prepare('DELETE FROM baiviet WHERE id = ?').bind(articleId).run();
    },

    async deleteImport(id: string): Promise<void> {
      await env.DB.prepare('DELETE FROM facebook_post_imports WHERE id = ?').bind(id).run();
    },

    async removeManagedImportAtomically(input: {
      item: FacebookImportRow;
      expectedArticle: FacebookArticleRecord | null;
      deleteExpectedArticle: boolean;
      explicit: boolean;
      fence: FacebookImportRemovalFence;
      now: string;
    }): Promise<{ articleDeleted: boolean; importChanged: boolean }> {
      const statements = [];
      let articleDeleteIndex = -1;
      if (input.expectedArticle && input.deleteExpectedArticle && input.item.article_id) {
        const article = input.expectedArticle;
        const fence = facebookImportRemovalFence('owned_import', input.fence);
        articleDeleteIndex = statements.length;
        statements.push(env.DB.prepare(`
          DELETE FROM baiviet
          WHERE id = ?
            AND tieu_de IS ? AND tom_tat IS ? AND noi_dung IS ? AND danh_muc IS ?
            AND tags IS ? AND tac_gia IS ? AND anh_url IS ? AND link_ngoai IS ?
            AND ngay_dang IS ? AND trang_thai IS ? AND created_at IS ? AND updated_at IS ?
            AND EXISTS (
              SELECT 1 FROM facebook_post_imports owned_import
              WHERE owned_import.id = ? AND owned_import.connection_id = ?
                AND owned_import.article_id = baiviet.id AND owned_import.source_managed = 1
                AND owned_import.article_content_hash IS ? AND ${fence.sql}
            )
        `).bind(
          article.id, article.tieu_de, article.tom_tat, article.noi_dung, article.danh_muc,
          article.tags, article.tac_gia, article.anh_url, article.link_ngoai,
          article.ngay_dang, article.trang_thai, article.created_at, article.updated_at,
          input.item.id, input.fence.connectionId, input.item.article_content_hash,
          ...fence.bindings,
        ));
      }

      const ledgerIndex = statements.length;
      const ledgerFence = facebookImportRemovalFence('facebook_post_imports', input.fence);
      if (input.explicit) {
        statements.push(env.DB.prepare(`
          DELETE FROM facebook_post_imports
          WHERE id = ? AND connection_id = ? AND ${ledgerFence.sql}
        `).bind(input.item.id, input.fence.connectionId, ...ledgerFence.bindings));
      } else if (input.expectedArticle && !input.deleteExpectedArticle && input.item.article_id) {
        const article = input.expectedArticle;
        statements.push(env.DB.prepare(`
          UPDATE facebook_post_imports
          SET source_managed = 0, status = 'detached', last_error_code = 'article_modified', updated_at = ?
          WHERE id = ? AND connection_id = ? AND article_id = ? AND source_managed = 1
            AND article_content_hash IS ? AND ${ledgerFence.sql}
            AND EXISTS (
              SELECT 1 FROM baiviet
              WHERE id = facebook_post_imports.article_id
                AND tieu_de IS ? AND tom_tat IS ? AND noi_dung IS ? AND danh_muc IS ?
                AND tags IS ? AND tac_gia IS ? AND anh_url IS ? AND link_ngoai IS ?
                AND ngay_dang IS ? AND trang_thai IS ? AND created_at IS ? AND updated_at IS ?
            )
        `).bind(
          input.now, input.item.id, input.fence.connectionId, input.item.article_id,
          input.item.article_content_hash, ...ledgerFence.bindings,
          article.tieu_de, article.tom_tat, article.noi_dung, article.danh_muc,
          article.tags, article.tac_gia, article.anh_url, article.link_ngoai,
          article.ngay_dang, article.trang_thai, article.created_at, article.updated_at,
        ));
      } else {
        statements.push(env.DB.prepare(`
          UPDATE facebook_post_imports
          SET article_id = NULL, source_managed = 0, status = 'removed', permalink_url = '',
            last_error_code = NULL, updated_at = ?
          WHERE id = ? AND connection_id = ? AND source_managed = 1 AND article_id IS NULL
            AND article_content_hash IS ? AND ${ledgerFence.sql}
        `).bind(
          input.now, input.item.id, input.fence.connectionId, input.item.article_content_hash,
          ...ledgerFence.bindings,
        ));
      }

      const results = await env.DB.batch(statements);
      return {
        articleDeleted: articleDeleteIndex >= 0 && Number(results[articleDeleteIndex]?.meta?.changes || 0) === 1,
        importChanged: Number(results[ledgerIndex]?.meta?.changes || 0) === 1,
      };
    },

    async listArticleMutationTargets(
      filters: Record<string, string | null | undefined>,
    ): Promise<Array<{ id: string; anh_url: string; pdf_url: string | null }>> {
      const mutationFilters = buildArticleMutationFilters(filters);
      if (!mutationFilters.clauses.length) {
        throw new ServerInputError(400, 'unsafe_mutation', 'Xóa cần bộ lọc.');
      }
      const response = await env.DB.prepare(`
        SELECT id, anh_url, pdf_url FROM baiviet
        WHERE ${mutationFilters.clauses.join(' AND ')}
      `).bind(...mutationFilters.bindings).all<{ id: string; anh_url: string; pdf_url: string | null }>();
      return response.results ?? [];
    },

    async updateArticlesAndDetachManagedImports(input: {
      payload: Record<string, unknown>;
      filters: Record<string, string | null | undefined>;
      now: string;
    }): Promise<number> {
      const mutationFilters = buildArticleMutationFilters(input.filters);
      const columns = Object.keys(input.payload).filter((column) => articleColumns().includes(column) && column !== 'id');
      if (!columns.length || !mutationFilters.clauses.length) {
        throw new ServerInputError(400, 'unsafe_mutation', 'Cập nhật cần dữ liệu và bộ lọc.');
      }
      const where = mutationFilters.clauses.join(' AND ');
      const results = await env.DB.batch([
        env.DB.prepare(`
          UPDATE facebook_post_imports
          SET source_managed = 0, status = 'detached', last_error_code = 'article_modified', updated_at = ?
          WHERE source_managed = 1 AND article_id IN (
            SELECT id FROM baiviet WHERE ${where}
          )
        `).bind(input.now, ...mutationFilters.bindings),
        env.DB.prepare(`
          UPDATE baiviet SET ${columns.map((column) => `${column} = ?`).join(', ')}
          WHERE ${where}
        `).bind(...columns.map((column) => input.payload[column]), ...mutationFilters.bindings),
      ]);
      return Number(results[1]?.meta?.changes || 0);
    },

    async upsertArticleChaptersAndDetachManagedImports(input: {
      values: Array<Record<string, unknown>>;
      conflict: string[];
      now: string;
    }): Promise<void> {
      const targetArticleIds = Array.from(new Set(input.values
        .map((value) => value.bai_viet_id)
        .filter((id): id is string => typeof id === 'string' && Boolean(id))));
      const existingChapterIds = Array.from(new Set(input.values
        .map((value) => normalizeChapterId(value.id))
        .filter((id): id is number => id !== null)));
      const detachClauses: string[] = [];
      const detachBindings: unknown[] = [input.now];
      if (targetArticleIds.length) {
        detachClauses.push(`article_id IN (${targetArticleIds.map(() => '?').join(', ')})`);
        detachBindings.push(...targetArticleIds);
      }
      if (existingChapterIds.length) {
        detachClauses.push(`article_id IN (
          SELECT bai_viet_id FROM tap_noi_dung
          WHERE id IN (${existingChapterIds.map(() => '?').join(', ')})
        )`);
        detachBindings.push(...existingChapterIds);
      }
      const statements = detachClauses.length
        ? [env.DB.prepare(`
            UPDATE facebook_post_imports
            SET source_managed = 0, status = 'detached',
              last_error_code = 'article_modified', updated_at = ?
            WHERE source_managed = 1 AND (${detachClauses.join(' OR ')})
          `).bind(...detachBindings)]
        : [];
      statements.push(...input.values.map((value) => prepareChapterUpsert(env, value, input.conflict)));
      await env.DB.batch(statements);
    },

    async updateArticleChaptersAndDetachManagedImports(input: {
      payload: Record<string, unknown>;
      filters: Record<string, string | null | undefined>;
      now: string;
    }): Promise<number> {
      const mutationFilters = buildChapterMutationFilters(input.filters);
      const columns = Object.keys(input.payload).filter((column) => chapterColumns().includes(column) && column !== 'id');
      if (!columns.length || !mutationFilters.clauses.length) {
        throw new ServerInputError(400, 'unsafe_mutation', 'Cập nhật cần dữ liệu và bộ lọc.');
      }
      const where = mutationFilters.clauses.join(' AND ');
      const nextArticleId = typeof input.payload.bai_viet_id === 'string' && input.payload.bai_viet_id
        ? input.payload.bai_viet_id
        : null;
      const results = await env.DB.batch([
        env.DB.prepare(`
          UPDATE facebook_post_imports
          SET source_managed = 0, status = 'detached',
            last_error_code = 'article_modified', updated_at = ?
          WHERE source_managed = 1 AND (
            article_id IN (SELECT bai_viet_id FROM tap_noi_dung WHERE ${where})
            ${nextArticleId ? 'OR article_id = ?' : ''}
          )
        `).bind(input.now, ...mutationFilters.bindings, ...(nextArticleId ? [nextArticleId] : [])),
        env.DB.prepare(`
          UPDATE tap_noi_dung SET ${columns.map((column) => `${column} = ?`).join(', ')}
          WHERE ${where}
        `).bind(...columns.map((column) => input.payload[column]), ...mutationFilters.bindings),
      ]);
      return Number(results[1]?.meta?.changes || 0);
    },

    async deleteArticleChaptersAndDetachManagedImports(
      filters: Record<string, string | null | undefined>,
      now: string,
    ): Promise<number> {
      const mutationFilters = buildChapterMutationFilters(filters);
      if (!mutationFilters.clauses.length) {
        throw new ServerInputError(400, 'unsafe_mutation', 'Xóa cần bộ lọc.');
      }
      const where = mutationFilters.clauses.join(' AND ');
      const results = await env.DB.batch([
        env.DB.prepare(`
          UPDATE facebook_post_imports
          SET source_managed = 0, status = 'detached',
            last_error_code = 'article_modified', updated_at = ?
          WHERE source_managed = 1 AND article_id IN (
            SELECT bai_viet_id FROM tap_noi_dung WHERE ${where}
          )
        `).bind(now, ...mutationFilters.bindings),
        env.DB.prepare(`DELETE FROM tap_noi_dung WHERE ${where}`)
          .bind(...mutationFilters.bindings),
      ]);
      return Number(results[1]?.meta?.changes || 0);
    },

    async upsertArticlesAndDetachManagedImports(input: {
      values: Array<Record<string, unknown>>;
      conflict: string[];
      now: string;
    }): Promise<void> {
      const existingIds = Array.from(new Set(input.values
        .map((value) => value.id)
        .filter((id): id is string => typeof id === 'string' && Boolean(id))));
      const statements = existingIds.length
        ? [env.DB.prepare(`
            UPDATE facebook_post_imports
            SET source_managed = 0, status = 'detached', last_error_code = 'article_modified', updated_at = ?
            WHERE source_managed = 1 AND article_id IN (${existingIds.map(() => '?').join(', ')})
              AND EXISTS (SELECT 1 FROM baiviet WHERE baiviet.id = facebook_post_imports.article_id)
          `).bind(input.now, ...existingIds)]
        : [];
      statements.push(...input.values.map((value) => prepareArticleUpsert(env, value, input.conflict)));
      await env.DB.batch(statements);
    },

    async deleteArticlesAndRecordManagedImports(
      filters: Record<string, string | null | undefined>,
      now: string,
    ): Promise<number> {
      const mutationFilters = buildArticleMutationFilters(filters);
      if (!mutationFilters.clauses.length) {
        throw new ServerInputError(400, 'unsafe_mutation', 'Xóa cần bộ lọc.');
      }
      const where = mutationFilters.clauses.join(' AND ');
      const results = await env.DB.batch([
        env.DB.prepare(`
          UPDATE facebook_post_imports
          SET status = 'failed', last_error_code = 'article_deleted', updated_at = ?
          WHERE source_managed = 1 AND article_id IN (
            SELECT id FROM baiviet WHERE ${where}
          )
        `).bind(now, ...mutationFilters.bindings),
        env.DB.prepare(`DELETE FROM baiviet WHERE ${where}`)
          .bind(...mutationFilters.bindings),
      ]);
      return Number(results[1]?.meta?.changes || 0);
    },

    async detachManagedImportByArticle(articleId: string, now: string): Promise<void> {
      await env.DB.prepare(`
        UPDATE facebook_post_imports SET source_managed = 0, status = 'detached',
          last_error_code = 'article_modified', updated_at = ?
        WHERE article_id = ? AND source_managed = 1
      `).bind(now, articleId).run();
    },

    async detachManagedImportAfterSyncConflict(input: {
      connectionId: string;
      generation: number;
      leaseToken: string;
      importId: string;
      articleId: string;
      expectedArticle: FacebookArticleRecord;
      expectedArticleHash: string;
      now: string;
    }): Promise<boolean> {
      const expected = input.expectedArticle;
      const result = await env.DB.prepare(`
        UPDATE facebook_post_imports
        SET source_managed = 0, status = 'detached',
          last_error_code = 'article_modified_during_sync', updated_at = ?
        WHERE id = ? AND connection_id = ? AND article_id = ? AND source_managed = 1
          AND article_content_hash = ?
          AND EXISTS (
            SELECT 1 FROM facebook_connections
            WHERE id = ? AND generation = ? AND lease_token = ?
              AND tombstoned_at IS NULL AND status IN ('active', 'backoff')
          )
          AND EXISTS (
            SELECT 1 FROM baiviet current_article
            WHERE current_article.id = facebook_post_imports.article_id
              AND NOT (
                current_article.tieu_de IS ? AND current_article.tom_tat IS ?
                AND current_article.noi_dung IS ? AND current_article.danh_muc IS ?
                AND current_article.tags IS ? AND current_article.tac_gia IS ?
                AND current_article.anh_url IS ? AND current_article.link_ngoai IS ?
                AND current_article.ngay_dang IS ? AND current_article.trang_thai IS ?
                AND current_article.created_at IS ? AND current_article.updated_at IS ?
              )
          )
      `).bind(
        input.now, input.importId, input.connectionId, input.articleId,
        input.expectedArticleHash, input.connectionId, input.generation, input.leaseToken,
        expected.tieu_de, expected.tom_tat, expected.noi_dung, expected.danh_muc,
        expected.tags, expected.tac_gia, expected.anh_url, expected.link_ngoai,
        expected.ngay_dang, expected.trang_thai, expected.created_at, expected.updated_at,
      ).run();
      return Number(result.meta?.changes || 0) === 1;
    },

    async markManagedImportArticleDeleted(articleId: string, now: string): Promise<void> {
      await env.DB.prepare(`
        UPDATE facebook_post_imports SET status = 'failed', last_error_code = 'article_deleted', updated_at = ?
        WHERE article_id = ? AND source_managed = 1
      `).bind(now, articleId).run();
    },

    async tombstoneConnection(id: string, now: string, errorCode: string): Promise<FacebookConnectionRow | null> {
      await env.DB.prepare(`
        UPDATE facebook_connections
        SET token_ciphertext = NULL, token_key_version = NULL, granted_scopes = '[]', token_expires_at = NULL,
          data_access_expires_at = NULL, status = 'disabled', generation = generation + 1,
          next_sync_at = NULL, backoff_until = NULL, lease_token = NULL, lease_expires_at = NULL,
          scan_after_cursor = NULL, scan_since_epoch = NULL, scan_max_created_time = NULL,
          scan_had_failure = 0,
          last_error_code = ?, tombstoned_at = ?, updated_at = ?
        WHERE id = ?
      `).bind(errorCode, now, now, id).run();
      return getConnection(id);
    },

    async completeConnectionDeletion(id: string, now: string): Promise<void> {
      await env.DB.prepare(`
        UPDATE facebook_connections SET facebook_user_id = NULL, facebook_display_name = NULL, updated_at = ?
        WHERE id = ? AND tombstoned_at IS NOT NULL
      `).bind(now, id).run();
    },

    async removeIdentityAndDeleteFacebookOnlyUser(identityId: string, userId: string): Promise<void> {
      await env.DB.batch([
        env.DB.prepare('DELETE FROM auth_identities WHERE id = ? AND provider = \'facebook\'')
          .bind(identityId),
        env.DB.prepare(`
          DELETE FROM app_users WHERE id = ?
            AND NOT EXISTS (SELECT 1 FROM auth_identities WHERE user_id = ?)
        `).bind(userId, userId),
      ]);
    },

    async getFacebookIdentity(facebookUserId: string): Promise<{ id: string; user_id: string } | null> {
      return env.DB.prepare(`
        SELECT id, user_id FROM auth_identities
        WHERE provider = 'facebook' AND provider_subject = ? LIMIT 1
      `).bind(facebookUserId).first<{ id: string; user_id: string }>();
    },

    async getOrCreateDeletionRequest(code: string, subjectHash: string, now: string): Promise<{ confirmation_code: string; status: string }> {
      await env.DB.prepare(`
        INSERT INTO facebook_deletion_requests
          (confirmation_code, facebook_user_id_hash, status, requested_at)
        VALUES (?, ?, 'pending', ?)
        ON CONFLICT(facebook_user_id_hash) DO NOTHING
      `).bind(code, subjectHash, now).run();
      return (await env.DB.prepare(`
        SELECT confirmation_code, status FROM facebook_deletion_requests
        WHERE facebook_user_id_hash = ? LIMIT 1
      `).bind(subjectHash).first<{ confirmation_code: string; status: string }>())!;
    },

    async setDeletionRequestStatus(code: string, status: 'pending' | 'completed' | 'failed', now: string, errorCode: string | null): Promise<void> {
      await env.DB.prepare(`
        UPDATE facebook_deletion_requests SET status = ?, completed_at = ?, error_code = ?
        WHERE confirmation_code = ?
      `).bind(status, status === 'pending' ? null : now, errorCode, code).run();
    },

    async getDeletionRequest(code: string): Promise<{ status: string } | null> {
      return env.DB.prepare('SELECT status FROM facebook_deletion_requests WHERE confirmation_code = ?')
        .bind(code).first<{ status: string }>();
    },
  };
}

function articleColumns(): string[] {
  return tableDefinition('baiviet').columns;
}

function chapterColumns(): string[] {
  return tableDefinition('tap_noi_dung').columns;
}

function normalizeChapterId(value: unknown): number | null {
  if (typeof value === 'number') return Number.isSafeInteger(value) ? value : null;
  if (typeof value !== 'string' || !/^-?\d+$/u.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function facebookImportRemovalFence(
  importAlias: string,
  fence: FacebookImportRemovalFence,
): { sql: string; bindings: unknown[] } {
  if (fence.mode === 'live') {
    return {
      sql: `EXISTS (
        SELECT 1 FROM facebook_connections removal_connection
        WHERE removal_connection.id = ${importAlias}.connection_id
          AND removal_connection.id = ? AND removal_connection.generation = ?
          AND removal_connection.lease_token = ? AND removal_connection.tombstoned_at IS NULL
          AND removal_connection.status IN ('active', 'backoff')
      )`,
      bindings: [fence.connectionId, fence.generation, fence.leaseToken],
    };
  }
  if (fence.mode === 'tombstoned') {
    return {
      sql: `EXISTS (
        SELECT 1 FROM facebook_connections removal_connection
        WHERE removal_connection.id = ${importAlias}.connection_id
          AND removal_connection.id = ? AND removal_connection.generation = ?
          AND removal_connection.tombstoned_at IS NOT NULL
      )`,
      bindings: [fence.connectionId, fence.generation],
    };
  }
  return {
    sql: `EXISTS (
      SELECT 1 FROM facebook_connections removal_connection
      WHERE removal_connection.id = ${importAlias}.connection_id
        AND removal_connection.id = ? AND removal_connection.app_user_id = ?
    )`,
    bindings: [fence.connectionId, fence.appUserId],
  };
}

function buildArticleMutationFilters(
  filters: Record<string, string | null | undefined>,
): { clauses: string[]; bindings: unknown[] } {
  const clauses: string[] = [];
  const bindings: unknown[] = [];
  for (const column of articleColumns()) {
    const value = filters[column];
    if (!value) continue;
    if (!String(value).startsWith('eq.')) {
      throw new ServerInputError(400, 'invalid_filter', 'Chỉ hỗ trợ bộ lọc eq.');
    }
    clauses.push(`${column} = ?`);
    bindings.push(String(value).slice(3));
  }
  return { clauses, bindings };
}

function buildChapterMutationFilters(
  filters: Record<string, string | null | undefined>,
): { clauses: string[]; bindings: unknown[] } {
  const clauses: string[] = [];
  const bindings: unknown[] = [];
  for (const column of chapterColumns()) {
    const value = filters[column];
    if (!value) continue;
    if (!String(value).startsWith('eq.')) {
      throw new ServerInputError(400, 'invalid_filter', 'Chỉ hỗ trợ bộ lọc eq.');
    }
    clauses.push(`${column} = ?`);
    bindings.push(String(value).slice(3));
  }
  return { clauses, bindings };
}

function prepareArticleUpsert(
  env: CloudflareEnvLike,
  value: Record<string, unknown>,
  conflict: string[],
) {
  const columns = Object.keys(value).filter((column) => articleColumns().includes(column) && value[column] !== undefined);
  if (!columns.length) throw new ServerInputError(400, 'empty_payload', 'Không có dữ liệu.');
  const placeholders = columns.map(() => '?').join(', ');
  let suffix = '';
  if (conflict.length) {
    const updates = columns.filter((column) => !conflict.includes(column));
    suffix = updates.length
      ? ` ON CONFLICT(${conflict.join(', ')}) DO UPDATE SET ${updates.map((column) => `${column} = excluded.${column}`).join(', ')}`
      : ` ON CONFLICT(${conflict.join(', ')}) DO NOTHING`;
  }
  return env.DB.prepare(`INSERT INTO baiviet (${columns.join(', ')}) VALUES (${placeholders})${suffix}`)
    .bind(...columns.map((column) => value[column]));
}

function prepareChapterUpsert(
  env: CloudflareEnvLike,
  value: Record<string, unknown>,
  conflict: string[],
) {
  const columns = Object.keys(value).filter((column) => chapterColumns().includes(column) && value[column] !== undefined);
  if (!columns.length) throw new ServerInputError(400, 'empty_payload', 'Không có dữ liệu.');
  const placeholders = columns.map(() => '?').join(', ');
  let suffix = '';
  if (conflict.length) {
    const updates = columns.filter((column) => !conflict.includes(column));
    suffix = updates.length
      ? ` ON CONFLICT(${conflict.join(', ')}) DO UPDATE SET ${updates.map((column) => `${column} = excluded.${column}`).join(', ')}`
      : ` ON CONFLICT(${conflict.join(', ')}) DO NOTHING`;
  }
  return env.DB.prepare(`INSERT INTO tap_noi_dung (${columns.join(', ')}) VALUES (${placeholders})${suffix}`)
    .bind(...columns.map((column) => value[column]));
}
