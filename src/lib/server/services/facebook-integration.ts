import type { CloudflareEnvLike } from '../cloudflare-context';
import type { InternalSession } from '../auth/types';
import { hmacSha256, randomToken, sha256 } from '../auth/crypto';
import { requiredSecret, revokeProviderSessions } from '../auth/sessions';
import { normalizeWrite, tableDefinition } from '../domain/data-contract';
import { ServerInputError } from '../errors';
import {
  FacebookGraphError,
  facebookGraphVersion,
  getFacebookPost,
  listFacebookPosts,
  type FacebookPost,
} from '../integrations/facebook-graph';
import { decryptFacebookToken } from '../integrations/facebook-token-crypto';
import {
  createFacebookRepository,
  type FacebookArticleRecord,
  type FacebookConnectionRow,
  type FacebookImportRemovalFence,
  type FacebookImportRow,
} from '../repositories/facebook-repository';

const DEFAULT_SOURCE_URL = 'https://www.facebook.com/tranan.buhd';
const SYNC_INTERVAL_MS = 60 * 60 * 1_000;
const LEASE_MS = 5 * 60 * 1_000;
const OVERLAP_MS = 15 * 60 * 1_000;
const DELETION_BATCH_LIMIT = 200;
const DEFAULT_RECONCILE_BATCH = 10;
const DEFAULT_IMPORT_PAGE_SIZE = 50;

export interface FacebookImportSummary {
  attempted: number;
  imported: number;
  updated: number;
  detached: number;
  removed: number;
  skipped: boolean;
  errors: Array<{ connectionId: string; code: string }>;
}

export interface FacebookAdminData {
  configured: boolean;
  enabled: boolean;
  graphVersion: string;
  settings: {
    sourceUrl: string;
    publishPolicy: 'review' | 'auto';
    updatedAt: string;
  };
  connection: null | {
    id: string;
    facebookUserId: string | null;
    displayName: string | null;
    status: string;
    tokenExpiresAt: string | null;
    dataAccessExpiresAt: string | null;
    lastAttemptAt: string | null;
    lastSuccessAt: string | null;
    lastErrorCode: string | null;
  };
  imports: Array<{
    id: string;
    facebookPostId: string;
    articleId: string | null;
    permalinkUrl: string;
    status: string;
    sourceManaged: boolean;
    sourceCreatedAt: string | null;
    lastErrorCode: string | null;
    updatedAt: string;
  }>;
  importsPage: {
    nextOffset: number | null;
    offset: number;
  };
}

export function createFacebookIntegrationService(
  env: CloudflareEnvLike,
  dependencies: {
    fetchImpl?: typeof fetch;
    now?: () => Date;
    repository?: ReturnType<typeof createFacebookRepository>;
  } = {},
) {
  const repository = dependencies.repository ?? createFacebookRepository(env);
  const fetchImpl = dependencies.fetchImpl || fetch;
  const clock = dependencies.now || (() => new Date());

  return {
    async getAdminData(
      actor: InternalSession,
      input: { importOffset?: number; importLimit?: number } = {},
    ): Promise<FacebookAdminData> {
      requireAdmin(actor);
      const [settings, connection] = await Promise.all([
        repository.getSettings(),
        repository.getConnectionForUser(actor.userId),
      ]);
      const offset = boundedPageNumber(input.importOffset, 0, 100_000);
      const limit = boundedPageNumber(input.importLimit, DEFAULT_IMPORT_PAGE_SIZE, 100);
      const importsPage = connection
        ? await repository.listImportsPage(connection.id, offset, limit)
        : { imports: [], nextOffset: null };
      return {
        configured: facebookConfigurationReady(env),
        enabled: facebookImportEnabled(env),
        graphVersion: safeGraphVersion(env),
        settings: {
          sourceUrl: settings.source_url,
          publishPolicy: settings.publish_policy,
          updatedAt: settings.updated_at,
        },
        connection: connection ? publicConnection(connection) : null,
        imports: importsPage.imports.map(publicImport),
        importsPage: { nextOffset: importsPage.nextOffset, offset },
      };
    },

    async updateSettings(actor: InternalSession, input: Record<string, unknown>) {
      requireAdmin(actor);
      const sourceUrl = normalizeSourceUrl(input.sourceUrl);
      const publishPolicy = input.publishPolicy === 'auto' ? 'auto' : input.publishPolicy === 'review' ? 'review' : null;
      if (!publishPolicy) throw new ServerInputError(400, 'invalid_publish_policy', 'Chính sách xuất bản không hợp lệ.');
      const settings = await repository.updateSettings({
        sourceUrl,
        publishPolicy,
        actorUserId: actor.userId,
        now: clock().toISOString(),
      });
      return { sourceUrl: settings.source_url, publishPolicy: settings.publish_policy, updatedAt: settings.updated_at };
    },

    async syncForAdmin(actor: InternalSession): Promise<FacebookImportSummary> {
      requireAdmin(actor);
      assertImportAvailable(env);
      const connection = await repository.getConnectionForUser(actor.userId);
      if (!connection) throw new ServerInputError(409, 'facebook_not_connected', 'Chưa kết nối Facebook.');
      return syncConnections([connection], clock());
    },

    async syncDueConnections(now = clock(), limit = 10): Promise<FacebookImportSummary> {
      if (!facebookImportEnabled(env)) return emptySummary(true);
      if (!facebookConfigurationReady(env)) {
        return { ...emptySummary(false), errors: [{ connectionId: 'configuration', code: 'configuration_error' }] };
      }
      return syncConnections(await repository.listDueConnections(now.toISOString(), limit), now);
    },

    async disconnect(actor: InternalSession): Promise<void> {
      requireAdmin(actor);
      const connection = await repository.getConnectionForUser(actor.userId);
      if (!connection) return;
      await deleteConnectionData(connection, 'disconnected', clock());
    },

    async manageImport(actor: InternalSession, importId: string, action: string): Promise<void> {
      requireAdmin(actor);
      const item = await repository.getImportForUser(importId, actor.userId);
      if (!item) throw new ServerInputError(404, 'facebook_import_not_found', 'Không tìm thấy bản nhập Facebook.');
      const now = clock().toISOString();
      if (action === 'publish' || action === 'review') {
        if (!item.article_id || !item.source_managed || !item.connection_id || !item.article_content_hash) {
          throw new ServerInputError(409, 'facebook_article_missing', 'Bài viết đã bị xoá hoặc tách.');
        }
        const expectedArticle = await repository.getArticle(item.article_id);
        if (!expectedArticle || await articleFingerprint(expectedArticle) !== item.article_content_hash) {
          throw new ServerInputError(409, 'facebook_import_conflict', 'Bài viết đã thay đổi; hãy tải lại sổ nhập.');
        }
        const articleStatus = action === 'publish' ? 'Hoàn thành' : 'Chờ duyệt';
        const nextArticleHash = await articleFingerprint({
          ...expectedArticle,
          trang_thai: articleStatus,
          updated_at: now,
        });
        const updated = await repository.updateManagedImportPublication({
          item,
          actorUserId: actor.userId,
          expectedArticle,
          articleStatus,
          importStatus: action === 'publish' ? 'published' : 'review',
          nextArticleHash,
          now,
        });
        if (!updated) {
          throw new ServerInputError(409, 'facebook_import_conflict', 'Bài viết đã thay đổi; hãy tải lại sổ nhập.');
        }
        return;
      }
      if (action === 'detach') {
        await repository.detachImport(item.id, null, now);
        return;
      }
      if (action === 'remove') {
        await removeOrDetachImport(item, now, true, {
          mode: 'actor', connectionId: item.connection_id!, appUserId: actor.userId,
        });
        return;
      }
      if (action === 'retry') {
        assertImportAvailable(env);
        const connection = item.connection_id ? await repository.getConnection(item.connection_id) : null;
        if (!connection) throw new ServerInputError(409, 'facebook_not_connected', 'Nguồn Facebook không còn kết nối.');
        await retryImport(connection, item, clock());
        return;
      }
      throw new ServerInputError(400, 'invalid_facebook_import_action', 'Thao tác bản nhập không hợp lệ.');
    },

    async handleSignedCallback(signedRequest: string, kind: 'deauthorize' | 'data-deletion', requestUrl: string) {
      const payload = await verifySignedRequest(env, signedRequest);
      const facebookUserId = String(payload.user_id || '');
      if (!facebookUserId) throw new ServerInputError(400, 'facebook_signed_request_invalid', 'Thiếu định danh Facebook.');
      const now = clock();
      const origin = new URL(env.APP_ORIGIN || requestUrl).origin;
      const subjectHash = await sha256(facebookUserId);
      const requestRecord = kind === 'data-deletion'
        ? await repository.getOrCreateDeletionRequest(
            (await sha256(`${facebookUserId}:${now.toISOString()}:${randomToken(16)}`)).slice(0, 32),
            subjectHash,
            now.toISOString(),
          )
        : null;
      if (requestRecord && requestRecord.status !== 'completed') {
        await repository.setDeletionRequestStatus(
          requestRecord.confirmation_code, 'pending', now.toISOString(), null,
        );
      }
      try {
        const identity = await repository.getFacebookIdentity(facebookUserId);
        const connection = await repository.getConnectionBySubject(facebookUserId);
        if (connection) await deleteConnectionData(connection, kind, now);
        if (identity) {
          await revokeProviderSessions(env, 'facebook', identity.id, now.toISOString());
          await repository.removeIdentityAndDeleteFacebookOnlyUser(identity.id, identity.user_id);
        }
        if (requestRecord) {
          await repository.setDeletionRequestStatus(
            requestRecord.confirmation_code, 'completed', now.toISOString(), null,
          );
        }
      } catch (error) {
        if (!requestRecord) throw error;
        await repository.setDeletionRequestStatus(
          requestRecord.confirmation_code, 'failed', now.toISOString(), errorCode(error),
        );
      }
      if (kind === 'deauthorize') return { deleted: true };
      const confirmationCode = requestRecord!.confirmation_code;
      return {
        url: `${origin}/api/meta/data-deletion/status?code=${encodeURIComponent(confirmationCode)}`,
        confirmation_code: confirmationCode,
      };
    },

    async deletionStatus(code: string): Promise<{ status: string }> {
      if (!/^[A-Za-z0-9_-]{16,64}$/u.test(code)) throw new ServerInputError(404, 'deletion_request_not_found', 'Không tìm thấy yêu cầu xoá.');
      const row = await repository.getDeletionRequest(code);
      if (!row) throw new ServerInputError(404, 'deletion_request_not_found', 'Không tìm thấy yêu cầu xoá.');
      return { status: row.status };
    },
  };

  async function syncConnections(connections: FacebookConnectionRow[], now: Date): Promise<FacebookImportSummary> {
    const summary = emptySummary(false);
    for (const connection of connections) {
      summary.attempted += 1;
      try {
        const counts = await syncOne(connection, now);
        summary.imported += counts.imported;
        summary.updated += counts.updated;
        summary.detached += counts.detached;
        summary.removed += counts.removed;
      } catch (error) {
        const code = errorCode(error);
        summary.errors.push({ connectionId: connection.id, code });
      }
    }
    return summary;
  }

  async function syncOne(connection: FacebookConnectionRow, now: Date) {
    const counts = { imported: 0, updated: 0, detached: 0, removed: 0 };
    const leaseToken = randomToken(24);
    const leased = await repository.acquireLease(
      connection.id,
      Number(connection.generation),
      leaseToken,
      now.toISOString(),
      new Date(now.getTime() + LEASE_MS).toISOString(),
    );
    if (!leased) return counts;
    try {
      if (expired(leased.token_expires_at, now) || expired(leased.data_access_expires_at, now)) {
        throw new FacebookGraphError('reauthorization_required', 'Quyền Facebook đã hết hạn.');
      }
      if (!leased.token_ciphertext || !leased.token_key_version || !leased.facebook_user_id) {
        throw new FacebookGraphError('configuration_error', 'Kết nối Facebook thiếu thông tin bảo mật.');
      }
      let token: string;
      try {
        token = await decryptFacebookToken(
          env, leased.token_ciphertext, leased.token_key_version, leased.id, leased.facebook_user_id,
        );
      } catch (error) {
        const code = (error as Error)?.message === 'facebook-token-key-unavailable'
          ? 'token_key_unavailable'
          : 'token_decryption_failed';
        throw new FacebookGraphError(code, 'Không thể giải mã kết nối Facebook.');
      }
      const settings = await repository.getSettings();
      const removalFence: FacebookImportRemovalFence = {
        mode: 'live', connectionId: leased.id, generation: Number(leased.generation), leaseToken,
      };
      const storedAfter = typeof leased.scan_after_cursor === 'string'
        && leased.scan_after_cursor.length > 0
        && leased.scan_after_cursor.length <= 4_096
        ? leased.scan_after_cursor
        : null;
      const storedSince = Number(leased.scan_since_epoch);
      const continuingScan = Boolean(storedAfter)
        && Number.isSafeInteger(storedSince)
        && storedSince >= 0;
      const sinceEpoch = continuingScan
        ? storedSince
        : Math.floor((leased.watermark_created_time
          ? Math.max(0, Date.parse(leased.watermark_created_time) - OVERLAP_MS)
          : now.getTime() - 90 * 24 * 60 * 60 * 1_000) / 1_000);
      let after: string | null = continuingScan ? storedAfter : null;
      let maxCreated = continuingScan
        ? leased.scan_max_created_time || leased.watermark_created_time
        : leased.watermark_created_time;
      let partialFailure = continuingScan && Number(leased.scan_had_failure) === 1;
      const maxPages = maxPageCount(env);
      let completed = false;
      for (let pageNumber = 0; pageNumber < maxPages; pageNumber += 1) {
        const page = await listFacebookPosts(env, token, {
          after,
          since: sinceEpoch,
        }, fetchImpl);
        for (const post of page.posts) {
          if (!post.id) continue;
          if (String(post.privacy?.value || '').toUpperCase() !== 'EVERYONE') {
            const existing = await repository.getImportByPostId(post.id);
            if (existing) {
              const outcome = await removeOrDetachImport(existing, now.toISOString(), false, removalFence);
              counts[outcome] += 1;
            }
            continue;
          }
          let outcome: Awaited<ReturnType<typeof upsertPost>>;
          try {
            outcome = await upsertPost(leased, leaseToken, post, settings.publish_policy, now.toISOString());
          } catch (error) {
            await recordFailedPost(leased, leaseToken, post, errorCode(error), now.toISOString());
            partialFailure = true;
            continue;
          }
          if (outcome) counts[outcome] += 1;
          if (post.created_time && (!maxCreated || post.created_time > maxCreated)) maxCreated = post.created_time;
        }
        after = page.after;
        if (!after) {
          const cleared = await repository.clearScanContinuation({
            id: leased.id,
            generation: Number(leased.generation),
            leaseToken,
            now: now.toISOString(),
          });
          if (!cleared) {
            throw new FacebookGraphError('connection_fenced', 'Kết nối đã bị thu hồi trong lúc đồng bộ.');
          }
          completed = true;
          break;
        }
        const persisted = await repository.persistScanContinuation({
          id: leased.id,
          generation: Number(leased.generation),
          leaseToken,
          after,
          sinceEpoch,
          maxCreated,
          hadFailure: partialFailure,
          now: now.toISOString(),
        });
        if (!persisted) {
          throw new FacebookGraphError('connection_fenced', 'Kết nối đã bị thu hồi trong lúc đồng bộ.');
        }
      }
      if (!completed) throw new FacebookGraphError('pagination_incomplete', 'Facebook còn trang chưa đọc.', true);
      const reconcileBefore = new Date(now.getTime() - SYNC_INTERVAL_MS).toISOString();
      const reconciliationItems = await repository.listImportsForReconciliation(
        leased.id, reconcileBefore, reconcileBatchSize(env),
      );
      for (const item of reconciliationItems) {
        const post = await getFacebookPost(env, token, item.facebook_post_id, fetchImpl);
        if (post && String(post.privacy?.value || '').toUpperCase() !== 'EVERYONE') {
          const outcome = await removeOrDetachImport(item, now.toISOString(), false, removalFence);
          counts[outcome] += 1;
          continue;
        }
        if (!post) {
          if (await repository.incrementMissing(item.id, now.toISOString()) < 2) {
            await repository.markImportReconciled(item.id, now.toISOString());
            continue;
          }
          const outcome = await removeOrDetachImport(item, now.toISOString(), false, removalFence);
          counts[outcome] += 1;
          continue;
        }
        try {
          const outcome = await upsertPost(leased, leaseToken, post, settings.publish_policy, now.toISOString());
          if (outcome) counts[outcome] += 1;
        } catch (error) {
          await recordFailedPost(leased, leaseToken, post, errorCode(error), now.toISOString());
          partialFailure = true;
        }
      }
      if (partialFailure) {
        throw new FacebookGraphError(
          'post_import_partial_failure',
          'Một hoặc nhiều bài Facebook chưa nhập thành công.',
          true,
        );
      }
      const committed = await repository.markSyncSuccess({
        id: leased.id,
        generation: Number(leased.generation),
        leaseToken,
        now: now.toISOString(),
        nextSyncAt: new Date(now.getTime() + SYNC_INTERVAL_MS).toISOString(),
        watermark: maxCreated,
      });
      if (!committed) throw new FacebookGraphError('connection_fenced', 'Kết nối đã bị thu hồi trong lúc đồng bộ.');
      return counts;
    } catch (error) {
      const code = errorCode(error);
      const retryable = error instanceof FacebookGraphError && error.retryable;
      const status = code === 'reauthorization_required'
        ? 'reauthorization_required'
        : code === 'permission_missing'
          ? 'permission_missing'
          : code === 'permission_unavailable'
            ? 'permission_unavailable'
          : code === 'configuration_error'
            ? 'configuration_error'
            : retryable ? 'backoff' : 'configuration_error';
      const retryAt = retryable ? new Date(now.getTime() + 15 * 60 * 1_000).toISOString() : null;
      await repository.markSyncFailure({
        id: leased.id,
        generation: Number(leased.generation),
        leaseToken,
        now: now.toISOString(),
        status,
        errorCode: code,
        retryAt,
      });
      throw error;
    }
  }

  async function upsertPost(
    connection: FacebookConnectionRow,
    leaseToken: string,
    post: FacebookPost,
    publishPolicy: 'review' | 'auto',
    now: string,
    allowArticleRestore = false,
  ): Promise<'imported' | 'updated' | 'detached' | null> {
    const permalink = normalizeFacebookPermalink(post.permalink_url);
    const sourceHash = await sha256(JSON.stringify(normalizedSource(post)));
    const existing = await repository.getImportByPostId(post.id);
    if (existing && !existing.source_managed) {
      await repository.touchImport(existing.id, now);
      return null;
    }
    let currentArticle: FacebookArticleRecord | null = null;
    if (existing?.article_id) {
      currentArticle = await repository.getArticle(existing.article_id);
      if (!currentArticle || await articleFingerprint(currentArticle) !== existing.article_content_hash) {
        await repository.detachImport(existing.id, 'article_modified', now);
        return 'detached';
      }
      if (existing.source_content_hash === sourceHash) {
        await repository.touchImport(existing.id, now);
        return null;
      }
    }
    const article = await articleFromPost(post, connection, publishPolicy, existing, now);
    const articleHash = await articleFingerprint(article);
    if (existing) {
      if (!existing.article_id) {
        if (existing.status === 'failed' && existing.last_error_code === 'article_deleted' && !allowArticleRestore) {
          await repository.touchImport(existing.id, now);
          return null;
        }
        const restored = await repository.restoreManagedImport({
          connectionId: connection.id,
          generation: Number(connection.generation),
          leaseToken,
          importId: existing.id,
          article,
          permalink,
          privacy: 'EVERYONE',
          sourceCreatedAt: post.created_time || existing.source_created_at,
          sourceUpdatedAt: post.updated_time || null,
          sourceHash,
          articleHash,
          importStatus: article.trang_thai === 'Hoàn thành' ? 'published' : 'review',
          now,
        });
        if (!restored) {
          throw new ServerInputError(409, 'facebook_import_restore_conflict', 'Không thể khôi phục bài viết đã xóa.');
        }
        return 'updated';
      }
      const updated = await repository.updateManagedImport({
        connectionId: connection.id,
        generation: Number(connection.generation),
        leaseToken,
        importId: existing.id,
        article,
        permalink,
        privacy: 'EVERYONE',
        sourceUpdatedAt: post.updated_time || null,
        sourceHash,
        articleHash,
        importStatus: article.trang_thai === 'Hoàn thành' ? 'published' : 'review',
        expectedArticle: currentArticle!,
        expectedArticleHash: existing.article_content_hash!,
        now,
      });
      if (updated) return 'updated';
      if (await repository.detachManagedImportAfterSyncConflict({
        connectionId: connection.id,
        generation: Number(connection.generation),
        leaseToken,
        importId: existing.id,
        articleId: existing.article_id,
        expectedArticle: currentArticle!,
        expectedArticleHash: existing.article_content_hash!,
        now,
      })) {
        return 'detached';
      }
      return null;
    }
    const importId = `fbimp-${(await sha256(post.id)).slice(0, 40)}`;
    const inserted = await repository.insertImport({
      connectionId: connection.id,
      generation: Number(connection.generation),
      leaseToken,
      importId,
      postId: post.id,
      article,
      permalink,
      privacy: 'EVERYONE',
      sourceCreatedAt: post.created_time || null,
      sourceUpdatedAt: post.updated_time || null,
      sourceHash,
      articleHash,
      importStatus: article.trang_thai === 'Hoàn thành' ? 'published' : 'review',
      now,
    });
    if (inserted) return 'imported';
    if (await repository.getImportByPostId(post.id)) return null;
    throw new ServerInputError(409, 'facebook_import_commit_failed', 'Không thể ghi bài viết Facebook.');
  }

  async function removeOrDetachImport(
    item: FacebookImportRow,
    now: string,
    explicit: boolean,
    fence: FacebookImportRemovalFence,
  ): Promise<'detached' | 'removed'> {
    const article = item.article_id ? await repository.getArticle(item.article_id) : null;
    const deleteExpectedArticle = Boolean(
      item.source_managed && article && await articleFingerprint(article) === item.article_content_hash,
    );
    const removed = await repository.removeManagedImportAtomically({
      item, expectedArticle: article, deleteExpectedArticle, explicit, fence, now,
    });
    if (removed.importChanged) {
      return article && (!deleteExpectedArticle || (explicit && !removed.articleDeleted)) ? 'detached' : 'removed';
    }

    const latest = await repository.getImport(item.id);
    if (!latest) return removed.articleDeleted ? 'removed' : 'detached';
    if (!latest.source_managed) return 'detached';
    if (latest.article_id) {
      const latestArticle = await repository.getArticle(latest.article_id);
      if (latestArticle && await articleFingerprint(latestArticle) !== latest.article_content_hash) {
        const detached = await repository.removeManagedImportAtomically({
          item: latest,
          expectedArticle: latestArticle,
          deleteExpectedArticle: false,
          explicit,
          fence,
          now,
        });
        if (detached.importChanged) return 'detached';
      }
    }
    if (fence.mode === 'live') {
      throw new FacebookGraphError(
        'facebook_import_remove_conflict', 'Bản nhập đã thay đổi trong lúc gỡ bỏ.', true,
      );
    }
    throw new ServerInputError(409, 'facebook_import_remove_conflict', 'Bản nhập đã thay đổi trong lúc gỡ bỏ.');
  }

  async function deleteConnectionData(connection: FacebookConnectionRow, reason: string, now: Date): Promise<void> {
    const tombstoned = await repository.tombstoneConnection(connection.id, now.toISOString(), reason);
    if (!tombstoned) {
      throw new ServerInputError(409, 'facebook_connection_delete_conflict', 'Kết nối Facebook đã thay đổi.');
    }
    const removalFence: FacebookImportRemovalFence = {
      mode: 'tombstoned', connectionId: tombstoned.id, generation: Number(tombstoned.generation),
    };
    for (;;) {
      const imports = await repository.listImports(connection.id, DELETION_BATCH_LIMIT);
      if (!imports.length) break;
      for (const item of imports) {
        await removeOrDetachImport(item, now.toISOString(), true, removalFence);
      }
    }
    await repository.completeConnectionDeletion(connection.id, now.toISOString());
  }

  async function retryImport(
    connection: FacebookConnectionRow,
    item: FacebookImportRow,
    now: Date,
  ): Promise<void> {
    const leaseToken = randomToken(24);
    const leased = await repository.acquireLease(
      connection.id,
      Number(connection.generation),
      leaseToken,
      now.toISOString(),
      new Date(now.getTime() + LEASE_MS).toISOString(),
    );
    if (!leased) throw new ServerInputError(409, 'facebook_connection_busy', 'Kết nối Facebook đang được đồng bộ.');
    try {
      if (!leased.token_ciphertext || !leased.token_key_version || !leased.facebook_user_id) {
        throw new FacebookGraphError('reauthorization_required', 'Kết nối Facebook cần cấp quyền lại.');
      }
      const token = await decryptFacebookToken(
        env, leased.token_ciphertext, leased.token_key_version, leased.id, leased.facebook_user_id,
      );
      const post = await getFacebookPost(env, token, item.facebook_post_id, fetchImpl);
      if (!post || String(post.privacy?.value || '').toUpperCase() !== 'EVERYONE') {
        await removeOrDetachImport(item, now.toISOString(), false, {
          mode: 'live', connectionId: leased.id, generation: Number(leased.generation), leaseToken,
        });
      } else {
        const settings = await repository.getSettings();
        await upsertPost(leased, leaseToken, post, settings.publish_policy, now.toISOString(), true);
      }
      await repository.releaseLease(leased.id, Number(leased.generation), leaseToken, now.toISOString());
    } catch (error) {
      await recordFailedPost(
        leased,
        leaseToken,
        { id: item.facebook_post_id, permalink_url: item.permalink_url, privacy: { value: item.privacy } },
        errorCode(error),
        now.toISOString(),
      );
      await repository.releaseLease(leased.id, Number(leased.generation), leaseToken, now.toISOString());
      throw error;
    }
  }

  async function recordFailedPost(
    connection: FacebookConnectionRow,
    leaseToken: string,
    post: FacebookPost,
    code: string,
    now: string,
  ): Promise<void> {
    const sourceHash = await sha256(JSON.stringify(normalizedSource(post)));
    await repository.recordFailedImport({
      connectionId: connection.id,
      generation: Number(connection.generation),
      leaseToken,
      importId: `fbimp-${(await sha256(post.id)).slice(0, 40)}`,
      postId: post.id,
      permalink: normalizeFacebookPermalink(post.permalink_url),
      privacy: String(post.privacy?.value || ''),
      sourceCreatedAt: post.created_time || null,
      sourceUpdatedAt: post.updated_time || null,
      sourceHash,
      errorCode: code,
      now,
    });
  }
}

export function facebookImportEnabled(env: CloudflareEnvLike): boolean {
  return String(env.FACEBOOK_IMPORT_ENABLED || '').toLowerCase() === 'true';
}

export function facebookConfigurationReady(env: CloudflareEnvLike): boolean {
  try {
    requiredSecret(env, 'FACEBOOK_APP_ID');
    requiredSecret(env, 'FACEBOOK_APP_SECRET');
    if (new TextEncoder().encode(requiredSecret(env, 'FACEBOOK_TOKEN_ENCRYPTION_KEY')).byteLength < 32) return false;
    facebookGraphVersion(env);
    return true;
  } catch {
    return false;
  }
}

export async function verifySignedRequest(
  env: CloudflareEnvLike,
  signedRequest: string,
): Promise<Record<string, unknown>> {
  const [signature, encodedPayload] = String(signedRequest || '').split('.');
  if (!signature || !encodedPayload) throw new ServerInputError(400, 'facebook_signed_request_invalid', 'Chữ ký Facebook không hợp lệ.');
  const expected = await hmacSha256(requiredSecret(env, 'FACEBOOK_APP_SECRET'), encodedPayload);
  if (!constantTimeString(expected, signature)) {
    throw new ServerInputError(403, 'facebook_signed_request_invalid', 'Chữ ký Facebook không hợp lệ.');
  }
  try {
    const normalized = encodedPayload.replaceAll('-', '+').replaceAll('_', '/');
    const json = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='));
    const payload = JSON.parse(new TextDecoder().decode(
      Uint8Array.from(json, (character) => character.charCodeAt(0)),
    )) as Record<string, unknown>;
    if (String(payload.algorithm || '').toUpperCase() !== 'HMAC-SHA256') {
      throw new ServerInputError(400, 'facebook_signed_request_invalid', 'Thuật toán chữ ký Facebook không hợp lệ.');
    }
    return payload;
  } catch {
    throw new ServerInputError(400, 'facebook_signed_request_invalid', 'Dữ liệu Facebook không hợp lệ.');
  }
}

function normalizeSourceUrl(value: unknown): string {
  const raw = String(value || DEFAULT_SOURCE_URL).trim();
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || !['facebook.com', 'www.facebook.com'].includes(url.hostname.toLowerCase()) || url.username || url.password) {
      throw new Error('invalid');
    }
    url.hash = '';
    return url.toString().slice(0, 2_048);
  } catch {
    throw new ServerInputError(400, 'invalid_facebook_source_url', 'URL nguồn Facebook không hợp lệ.');
  }
}

async function articleFromPost(
  post: FacebookPost,
  connection: FacebookConnectionRow,
  publishPolicy: 'review' | 'auto',
  existing: FacebookImportRow | null,
  now: string,
): Promise<FacebookArticleRecord> {
  const message = String(post.message || post.story || '').trim();
  const title = (message.split(/\r?\n/u).find(Boolean) || 'Bài viết từ Facebook').slice(0, 240);
  const html = message
    ? message.split(/\r?\n/u).filter(Boolean).map((line) => `<p>${escapeHtml(line)}</p>`).join('')
    : '<p>Bài viết từ Facebook.</p>';
  const articleId = existing?.article_id || `facebook-${(await sha256(post.id)).slice(0, 40)}`;
  const keepPublished = existing?.status === 'published';
  const normalized = normalizeWrite('baiviet', tableDefinition('baiviet'), {
    id: articleId,
    tieu_de: title,
    tom_tat: message.slice(0, 500),
    noi_dung: html,
    danh_muc: 'KHÁC',
    tags: 'Facebook',
    tac_gia: connection.facebook_display_name || 'Facebook',
    anh_url: '',
    link_ngoai: normalizeFacebookPermalink(post.permalink_url),
    ngay_dang: post.created_time || now,
    trang_thai: publishPolicy === 'auto' || keepPublished ? 'Hoàn thành' : 'Chờ duyệt',
    created_at: existing ? undefined : now,
    updated_at: now,
  }, { role: 'admin' });
  return { ...normalized, created_at: now, updated_at: now } as unknown as FacebookArticleRecord;
}

function normalizedSource(post: FacebookPost): Record<string, unknown> {
  return {
    id: post.id,
    message: String(post.message || ''),
    story: String(post.story || ''),
    createdTime: post.created_time || null,
    updatedTime: post.updated_time || null,
    permalink: normalizeFacebookPermalink(post.permalink_url),
    privacy: post.privacy?.value || '',
  };
}

function articleFingerprint(article: FacebookArticleRecord): Promise<string> {
  return sha256(JSON.stringify({
    id: article.id,
    title: article.tieu_de,
    summary: article.tom_tat,
    content: article.noi_dung,
    category: article.danh_muc,
    tags: article.tags,
    author: article.tac_gia,
    image: article.anh_url,
    link: article.link_ngoai,
    publishedAt: article.ngay_dang,
  }));
}

function normalizeFacebookPermalink(value: unknown): string {
  if (!value) return '';
  try {
    const url = new URL(String(value));
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || url.username || url.password ||
        (host !== 'facebook.com' && !host.endsWith('.facebook.com'))) return '';
    url.hash = '';
    return url.toString().slice(0, 2_048);
  } catch {
    return '';
  }
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function publicConnection(row: FacebookConnectionRow): NonNullable<FacebookAdminData['connection']> {
  return {
    id: row.id,
    facebookUserId: row.facebook_user_id,
    displayName: row.facebook_display_name,
    status: row.status,
    tokenExpiresAt: row.token_expires_at,
    dataAccessExpiresAt: row.data_access_expires_at,
    lastAttemptAt: row.last_attempt_at,
    lastSuccessAt: row.last_success_at,
    lastErrorCode: row.last_error_code,
  };
}

function publicImport(row: FacebookImportRow): FacebookAdminData['imports'][number] {
  return {
    id: row.id,
    facebookPostId: row.facebook_post_id,
    articleId: row.article_id,
    permalinkUrl: row.permalink_url,
    status: row.status,
    sourceManaged: row.source_managed === 1,
    sourceCreatedAt: row.source_created_at,
    lastErrorCode: row.last_error_code,
    updatedAt: row.updated_at,
  };
}

function requireAdmin(actor: InternalSession): void {
  if (actor.role !== 'admin') throw new ServerInputError(403, 'forbidden', 'Chỉ quản trị viên được quản lý Facebook.');
}

function assertImportAvailable(env: CloudflareEnvLike): void {
  if (!facebookImportEnabled(env)) throw new ServerInputError(503, 'facebook_import_disabled', 'Nhập Facebook đang tắt.');
  if (!facebookConfigurationReady(env)) throw new ServerInputError(503, 'facebook_configuration_error', 'Facebook chưa được cấu hình.');
}

function safeGraphVersion(env: CloudflareEnvLike): string {
  try { return facebookGraphVersion(env); } catch { return 'invalid'; }
}

function expired(value: string | null, now: Date): boolean {
  return Boolean(value && Date.parse(value) <= now.getTime());
}

function maxPageCount(env: CloudflareEnvLike): number {
  const value = Number(env.FACEBOOK_IMPORT_MAX_PAGES || 4);
  return Number.isSafeInteger(value) ? Math.max(1, Math.min(value, 10)) : 4;
}

function reconcileBatchSize(env: CloudflareEnvLike): number {
  return boundedPageNumber(Number(env.FACEBOOK_RECONCILE_BATCH), DEFAULT_RECONCILE_BATCH, 25);
}

function boundedPageNumber(value: unknown, fallback: number, maximum: number): number {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? Math.min(number, maximum) : fallback;
}

function errorCode(error: unknown): string {
  if (error instanceof FacebookGraphError || error instanceof ServerInputError) return error.code;
  return 'facebook_import_failed';
}

function emptySummary(skipped: boolean): FacebookImportSummary {
  return { attempted: 0, imported: 0, updated: 0, detached: 0, removed: 0, skipped, errors: [] };
}

function constantTimeString(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}
