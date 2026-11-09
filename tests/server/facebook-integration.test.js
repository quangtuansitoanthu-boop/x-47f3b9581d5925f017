import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyD1Migrations, env } from 'cloudflare:test';
import applicationSchema from '../../migrations/0001-application-schema.sql?raw';
import authSchema from '../../migrations/0002-auth-and-session-schema.sql?raw';
import memberStatusSchema from '../../migrations/0026-member-status.sql?raw';
import userActivitySchema from '../../migrations/0017-user-activity-foundations.sql?raw';
import facebookSchema from '../../migrations/0019-facebook-auth-import.sql?raw';
import facebookScanContinuationSchema from '../../migrations/0021-facebook-import-scan-continuation.sql?raw';
import { hmacSha256, sha256 } from '../../src/lib/server/auth/crypto.ts';
import { toBase64Url } from '../../src/lib/server/crypto.ts';
import { encryptFacebookToken } from '../../src/lib/server/integrations/facebook-token-crypto.ts';
import { createFacebookRepository } from '../../src/lib/server/repositories/facebook-repository.ts';
import { importBookAtomically, replaceBookChapters } from '../../src/lib/server/services/book-import.ts';
import { createFacebookIntegrationService } from '../../src/lib/server/services/facebook-integration.ts';

beforeAll(async () => {
  await applyD1Migrations(env.DB, [
    { name: '0001-application-schema.sql', queries: splitMigration(applicationSchema) },
    { name: '0002-auth-and-session-schema.sql', queries: splitMigration(authSchema) },
    { name: '0026-member-status.sql', queries: splitMigration(memberStatusSchema) },
    { name: '0017-user-activity-foundations.sql', queries: splitMigration(userActivitySchema) },
    { name: '0019-facebook-auth-import.sql', queries: splitMigration(facebookSchema) },
    { name: '0021-facebook-import-scan-continuation.sql', queries: splitMigration(facebookScanContinuationSchema) },
  ]);
});

beforeEach(async () => {
  await env.DB.prepare('DELETE FROM facebook_deletion_requests').run();
  await env.DB.prepare('DELETE FROM facebook_post_imports').run();
  await env.DB.prepare('DELETE FROM facebook_connections').run();
  await env.DB.prepare('DELETE FROM auth_sessions').run();
  await env.DB.prepare('DELETE FROM auth_identities').run();
  await env.DB.prepare('DELETE FROM baiviet').run();
  await env.DB.prepare('DELETE FROM app_users').run();
  await env.DB.prepare(`
    UPDATE facebook_import_settings SET source_url = 'https://www.facebook.com/tranan.buhd',
      publish_policy = 'review', source_generation = 0, updated_by = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE id = 1
  `).run();
});

describe('Facebook post importer', () => {
  it('imports only public posts through the moderation boundary and is idempotent', async () => {
    const actor = await seedAdmin();
    const workerEnv = facebookEnv();
    await seedConnection(workerEnv, actor.userId);
    const fetchImpl = postsFetch([
      {
        id: 'fb-post-public', message: '<script>alert(1)</script> Lời Phật dạy',
        created_time: '2026-09-03T10:00:00+0000', updated_time: '2026-09-03T10:00:00+0000',
        permalink_url: 'https://www.facebook.com/story.php?story_fbid=1', privacy: { value: 'EVERYONE' },
        full_picture: 'https://scontent.example/private-cdn.jpg',
      },
      {
        id: 'fb-post-friends', message: 'Không công khai', created_time: '2026-09-03T11:00:00+0000',
        permalink_url: 'https://www.facebook.com/story.php?story_fbid=2', privacy: { value: 'FRIENDS' },
      },
    ]);
    const service = createFacebookIntegrationService(workerEnv, {
      fetchImpl, now: () => new Date('2026-09-04T00:00:00.000Z'),
    });

    await expect(service.syncForAdmin(actor)).resolves.toMatchObject({ imported: 1, errors: [] });
    const article = await env.DB.prepare('SELECT * FROM baiviet').first();
    expect(article).toMatchObject({ trang_thai: 'Chờ duyệt', anh_url: '' });
    expect(article.noi_dung).not.toContain('<script>');
    expect(article.link_ngoai).toContain('facebook.com/story.php');
    expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM facebook_post_imports').first()).toMatchObject({ count: 1 });

    await expect(service.syncForAdmin(actor)).resolves.toMatchObject({ imported: 0, updated: 0 });
    expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM baiviet').first()).toMatchObject({ count: 1 });
  });

  it('publishes an imported article and advances its provenance hash coherently', async () => {
    const actor = await seedAdmin();
    const workerEnv = facebookEnv();
    await seedConnection(workerEnv, actor.userId);
    const post = {
      id: 'fb-post-publish', message: 'Bài chờ xuất bản', created_time: '2026-09-03T10:00:00+0000',
      updated_time: '2026-09-03T10:00:00+0000', permalink_url: 'https://www.facebook.com/posts/publish',
      privacy: { value: 'EVERYONE' },
    };
    const initialService = createFacebookIntegrationService(workerEnv, {
      fetchImpl: postsFetch([post]), now: () => new Date('2026-09-04T00:00:00.000Z'),
    });
    await initialService.syncForAdmin(actor);
    const before = await env.DB.prepare('SELECT * FROM facebook_post_imports').first();
    const publishService = createFacebookIntegrationService(workerEnv, {
      fetchImpl: postsFetch([post]), now: () => new Date('2026-09-04T00:10:00.000Z'),
    });

    await expect(publishService.manageImport(actor, before.id, 'publish')).resolves.toBeUndefined();
    const published = await env.DB.prepare('SELECT * FROM facebook_post_imports WHERE id = ?').bind(before.id).first();
    expect(published).toMatchObject({ status: 'published', source_managed: 1, last_error_code: null });
    // Moderation status is intentionally outside the provider-content fingerprint.
    expect(published.article_content_hash).toBe(before.article_content_hash);
    expect(await env.DB.prepare('SELECT trang_thai, updated_at FROM baiviet WHERE id = ?')
      .bind(before.article_id).first()).toMatchObject({
      trang_thai: 'Hoàn thành', updated_at: '2026-09-04T00:10:00.000Z',
    });

    const nextSync = createFacebookIntegrationService(workerEnv, {
      fetchImpl: postsFetch([post]), now: () => new Date('2026-09-04T00:20:00.000Z'),
    });
    await expect(nextSync.syncForAdmin(actor)).resolves.toMatchObject({ detached: 0, errors: [], updated: 0 });
    expect(await env.DB.prepare('SELECT status, source_managed FROM facebook_post_imports WHERE id = ?')
      .bind(before.id).first()).toMatchObject({ status: 'published', source_managed: 1 });
  });

  it('does not partially publish when an editor changes the article after the service preflight', async () => {
    const actor = await seedAdmin();
    const workerEnv = facebookEnv();
    await seedConnection(workerEnv, actor.userId);
    const post = {
      id: 'fb-post-publish-race', message: 'Bản nguồn', created_time: '2026-09-03T10:00:00+0000',
      updated_time: '2026-09-03T10:00:00+0000', permalink_url: 'https://www.facebook.com/posts/publish-race',
      privacy: { value: 'EVERYONE' },
    };
    await createFacebookIntegrationService(workerEnv, {
      fetchImpl: postsFetch([post]), now: () => new Date('2026-09-04T00:00:00.000Z'),
    }).syncForAdmin(actor);
    const actualRepository = createFacebookRepository(workerEnv);
    const item = await actualRepository.getImportByPostId(post.id);
    const racingRepository = {
      ...actualRepository,
      async updateManagedImportPublication(input) {
        await env.DB.prepare("UPDATE baiviet SET tieu_de = 'Biên tập chen ngang', updated_at = ? WHERE id = ?")
          .bind('2026-09-04T00:09:00.000Z', input.item.article_id).run();
        return actualRepository.updateManagedImportPublication(input);
      },
    };
    const service = createFacebookIntegrationService(workerEnv, {
      repository: racingRepository,
      fetchImpl: postsFetch([post]),
      now: () => new Date('2026-09-04T00:10:00.000Z'),
    });

    await expect(service.manageImport(actor, item.id, 'publish')).rejects.toMatchObject({
      status: 409, code: 'facebook_import_conflict',
    });
    expect(await env.DB.prepare('SELECT tieu_de, trang_thai, updated_at FROM baiviet WHERE id = ?')
      .bind(item.article_id).first()).toMatchObject({
      tieu_de: 'Biên tập chen ngang', trang_thai: 'Chờ duyệt', updated_at: '2026-09-04T00:09:00.000Z',
    });
    expect(await env.DB.prepare('SELECT status, article_content_hash FROM facebook_post_imports WHERE id = ?')
      .bind(item.id).first()).toMatchObject({
      status: 'review', article_content_hash: item.article_content_hash,
    });
  });

  it('detaches a manually edited article instead of overwriting it when Facebook changes', async () => {
    const actor = await seedAdmin();
    const workerEnv = facebookEnv();
    await seedConnection(workerEnv, actor.userId);
    let posts = [{
      id: 'fb-post-edit', message: 'Bản đầu', created_time: '2026-09-03T10:00:00+0000',
      updated_time: '2026-09-03T10:00:00+0000', permalink_url: 'https://www.facebook.com/posts/1',
      privacy: { value: 'EVERYONE' },
    }];
    const service = createFacebookIntegrationService(workerEnv, {
      fetchImpl: vi.fn(async () => Response.json({ data: posts })),
      now: () => new Date('2026-09-04T00:00:00.000Z'),
    });
    await service.syncForAdmin(actor);
    const item = await env.DB.prepare('SELECT * FROM facebook_post_imports').first();
    await env.DB.prepare("UPDATE baiviet SET tieu_de = 'Quản trị viên đã sửa' WHERE id = ?").bind(item.article_id).run();
    posts = [{ ...posts[0], message: 'Bản Facebook mới', updated_time: '2026-09-04T01:00:00+0000' }];

    await expect(service.syncForAdmin(actor)).resolves.toMatchObject({ detached: 1 });
    expect(await env.DB.prepare('SELECT source_managed, status FROM facebook_post_imports').first())
      .toMatchObject({ source_managed: 0, status: 'detached' });
    expect(await env.DB.prepare('SELECT tieu_de FROM baiviet').first()).toMatchObject({ tieu_de: 'Quản trị viên đã sửa' });
  });

  it('fences an insert after a connection tombstone so a stale sync cannot resurrect content', async () => {
    const actor = await seedAdmin();
    const workerEnv = facebookEnv();
    const repository = createFacebookRepository(workerEnv);
    const connection = await seedConnection(workerEnv, actor.userId);
    const lease = await repository.acquireLease(
      connection.id, connection.generation, 'lease-stale', '2026-09-04T00:00:00.000Z', '2026-09-04T00:05:00.000Z',
    );
    await repository.tombstoneConnection(connection.id, '2026-09-04T00:01:00.000Z', 'deauthorize');
    const inserted = await repository.insertImport({
      connectionId: connection.id, generation: lease.generation, leaseToken: 'lease-stale',
      importId: 'fbimp-stale', postId: 'post-stale', permalink: '', privacy: 'EVERYONE',
      sourceCreatedAt: null, sourceUpdatedAt: null, sourceHash: 'source', articleHash: 'article',
      importStatus: 'review', now: '2026-09-04T00:02:00.000Z',
      article: {
        id: 'facebook-stale', tieu_de: 'Stale', tom_tat: '', noi_dung: '<p>Stale</p>',
        danh_muc: 'KHÁC', tags: 'Facebook', tac_gia: 'Owner', anh_url: '', link_ngoai: '',
        ngay_dang: '2026-09-04T00:00:00.000Z', trang_thai: 'Chờ duyệt',
        created_at: '2026-09-04T00:00:00.000Z', updated_at: '2026-09-04T00:00:00.000Z',
      },
    });
    expect(inserted).toBe(false);
    expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM baiviet').first()).toMatchObject({ count: 0 });
  });

  it('deauthorization revokes only Facebook sessions and preserves a linked Google identity/session', async () => {
    const actor = await seedAdmin();
    const workerEnv = facebookEnv();
    await seedConnection(workerEnv, actor.userId);
    const now = '2026-09-04T00:00:00.000Z';
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO auth_identities
        (id, user_id, issuer, provider, provider_subject, created_at, updated_at)
        VALUES ('google-id', ?, 'https://accounts.google.com', 'google', 'google-sub', ?, ?)`
      ).bind(actor.userId, now, now),
      env.DB.prepare(`INSERT INTO auth_identities
        (id, user_id, issuer, provider, provider_subject, created_at, updated_at)
        VALUES ('facebook-id', ?, 'https://www.facebook.com', 'facebook', 'fb-owner', ?, ?)`
      ).bind(actor.userId, now, now),
      env.DB.prepare(`INSERT INTO auth_sessions
        (id, user_id, identity_id, auth_provider, token_hash, csrf_token_hash, created_at, expires_at)
        VALUES ('google-session', ?, 'google-id', 'google', 'google-token', 'google-csrf', ?, '2027-01-01')`
      ).bind(actor.userId, now),
      env.DB.prepare(`INSERT INTO auth_sessions
        (id, user_id, identity_id, auth_provider, token_hash, csrf_token_hash, created_at, expires_at)
        VALUES ('facebook-session', ?, 'facebook-id', 'facebook', 'facebook-token', 'facebook-csrf', ?, '2027-01-01')`
      ).bind(actor.userId, now),
    ]);
    const payload = toBase64Url(new TextEncoder().encode(JSON.stringify({ algorithm: 'HMAC-SHA256', user_id: 'fb-owner' })));
    const signature = await hmacSha256(workerEnv.FACEBOOK_APP_SECRET, payload);
    await createFacebookIntegrationService(workerEnv, { now: () => new Date(now) })
      .handleSignedCallback(`${signature}.${payload}`, 'deauthorize', 'https://quangtu.vn/api/meta/deauthorize');
    expect(await env.DB.prepare("SELECT revoked_at FROM auth_sessions WHERE id = 'facebook-session'").first())
      .toMatchObject({ revoked_at: now });
    expect(await env.DB.prepare("SELECT revoked_at FROM auth_sessions WHERE id = 'google-session'").first())
      .toMatchObject({ revoked_at: null });
    expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM auth_identities WHERE provider = 'google'").first())
      .toMatchObject({ count: 1 });
    expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM auth_identities WHERE provider = 'facebook'").first())
      .toMatchObject({ count: 0 });
  });

  it('backs off on Graph rate limits without advancing the last good watermark', async () => {
    const actor = await seedAdmin();
    const workerEnv = facebookEnv();
    const connection = await seedConnection(workerEnv, actor.userId);
    await env.DB.prepare('UPDATE facebook_connections SET watermark_created_time = ? WHERE id = ?')
      .bind('2026-09-03T08:00:00.000Z', connection.id).run();
    const service = createFacebookIntegrationService(workerEnv, {
      fetchImpl: vi.fn(async () => Response.json({ error: { code: 4 } }, { status: 429 })),
      now: () => new Date('2026-09-04T00:00:00.000Z'),
    });

    await expect(service.syncForAdmin(actor)).resolves.toMatchObject({
      errors: [{ connectionId: connection.id, code: 'rate_limited' }],
    });
    expect(await env.DB.prepare(`
      SELECT status, watermark_created_time, backoff_until FROM facebook_connections WHERE id = ?
    `).bind(connection.id).first()).toMatchObject({
      status: 'backoff',
      watermark_created_time: '2026-09-03T08:00:00.000Z',
      backoff_until: '2026-09-04T00:15:00.000Z',
    });
  });

  it('distinguishes an app-level user_posts denial from missing user consent', async () => {
    const actor = await seedAdmin();
    const workerEnv = facebookEnv();
    const connection = await seedConnection(workerEnv, actor.userId);
    const service = createFacebookIntegrationService(workerEnv, {
      fetchImpl: vi.fn(async () => Response.json({ error: { code: 10 } }, { status: 403 })),
      now: () => new Date('2026-09-04T00:00:00.000Z'),
    });

    await expect(service.syncForAdmin(actor)).resolves.toMatchObject({
      errors: [{ connectionId: connection.id, code: 'permission_unavailable' }],
    });
    expect(await env.DB.prepare(`
      SELECT status, token_ciphertext FROM facebook_connections WHERE id = ?
    `).bind(connection.id).first()).toMatchObject({
      status: 'permission_unavailable', token_ciphertext: null,
    });
  });

  it('treats bounded pagination as retryable and leaves the watermark unchanged', async () => {
    const actor = await seedAdmin();
    const workerEnv = { ...facebookEnv(), FACEBOOK_IMPORT_MAX_PAGES: '1' };
    const connection = await seedConnection(workerEnv, actor.userId);
    const service = createFacebookIntegrationService(workerEnv, {
      fetchImpl: vi.fn(async () => Response.json({
        data: [{
          id: 'paged-post', message: 'Trang còn dữ liệu', created_time: '2026-09-03T10:00:00+0000',
          privacy: { value: 'EVERYONE' }, permalink_url: 'https://www.facebook.com/posts/paged',
        }],
        paging: { cursors: { after: 'next-page' } },
      })),
      now: () => new Date('2026-09-04T00:00:00.000Z'),
    });

    await expect(service.syncForAdmin(actor)).resolves.toMatchObject({
      errors: [{ connectionId: connection.id, code: 'pagination_incomplete' }],
    });
    expect(await env.DB.prepare(`
      SELECT status, watermark_created_time, backoff_until, scan_after_cursor,
        scan_since_epoch, scan_max_created_time, scan_had_failure
      FROM facebook_connections WHERE id = ?
    `).bind(connection.id).first()).toMatchObject({
      status: 'backoff', watermark_created_time: null, backoff_until: '2026-09-04T00:15:00.000Z',
      scan_after_cursor: 'next-page',
      scan_since_epoch: Math.floor(Date.parse('2026-06-06T00:00:00.000Z') / 1_000),
      scan_max_created_time: '2026-09-03T10:00:00+0000',
      scan_had_failure: 0,
    });
  });

  it('resumes a five-page scan from its durable cursor without duplicates', async () => {
    const actor = await seedAdmin();
    const workerEnv = facebookEnv();
    const connection = await seedConnection(workerEnv, actor.userId);
    const seenAfter = [];
    const seenSince = [];
    const pageByAfter = new Map([
      [null, { index: 1, next: 'page-2' }],
      ['page-2', { index: 2, next: 'page-3' }],
      ['page-3', { index: 3, next: 'page-4' }],
      ['page-4', { index: 4, next: 'page-5' }],
      ['page-5', { index: 5, next: null }],
    ]);
    const fetchImpl = vi.fn(async (input) => {
      const url = new URL(String(input));
      const after = url.searchParams.get('after');
      const page = pageByAfter.get(after);
      if (!page) throw new Error(`unexpected cursor: ${after}`);
      seenAfter.push(after);
      seenSince.push(url.searchParams.get('since'));
      const created = `2026-09-03T0${page.index}:00:00+0000`;
      return Response.json({
        data: [{
          id: `five-page-post-${page.index}`,
          message: `Bài trang ${page.index}`,
          created_time: created,
          updated_time: created,
          permalink_url: `https://www.facebook.com/posts/five-page-${page.index}`,
          privacy: { value: 'EVERYONE' },
        }],
        paging: page.next ? { cursors: { after: page.next } } : undefined,
      });
    });

    const first = createFacebookIntegrationService(workerEnv, {
      fetchImpl,
      now: () => new Date('2026-09-04T00:00:00.000Z'),
    });
    await expect(first.syncForAdmin(actor)).resolves.toMatchObject({
      imported: 0,
      errors: [{ connectionId: connection.id, code: 'pagination_incomplete' }],
    });
    expect(seenAfter).toEqual([null, 'page-2', 'page-3', 'page-4']);
    const checkpoint = await env.DB.prepare(`
      SELECT watermark_created_time, scan_after_cursor, scan_since_epoch,
        scan_max_created_time, scan_had_failure
      FROM facebook_connections WHERE id = ?
    `).bind(connection.id).first();
    expect(checkpoint).toMatchObject({
      watermark_created_time: null,
      scan_after_cursor: 'page-5',
      scan_max_created_time: '2026-09-03T04:00:00+0000',
      scan_had_failure: 0,
    });

    const second = createFacebookIntegrationService(workerEnv, {
      fetchImpl,
      now: () => new Date('2026-09-04T00:16:00.000Z'),
    });
    await expect(second.syncForAdmin(actor)).resolves.toMatchObject({
      imported: 1,
      errors: [],
    });
    expect(seenAfter).toEqual([null, 'page-2', 'page-3', 'page-4', 'page-5']);
    expect(new Set(seenSince)).toEqual(new Set([String(checkpoint.scan_since_epoch)]));
    expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM facebook_post_imports').first())
      .toMatchObject({ count: 5 });
    expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM baiviet').first())
      .toMatchObject({ count: 5 });
    expect(await env.DB.prepare(`
      SELECT status, watermark_created_time, scan_after_cursor, scan_since_epoch,
        scan_max_created_time, scan_had_failure
      FROM facebook_connections WHERE id = ?
    `).bind(connection.id).first()).toMatchObject({
      status: 'active',
      watermark_created_time: '2026-09-03T05:00:00+0000',
      scan_after_cursor: null,
      scan_since_epoch: null,
      scan_max_created_time: null,
      scan_had_failure: 0,
    });
  });

  it('wipes an expired connector token and keeps the global kill switch readable', async () => {
    const actor = await seedAdmin();
    const workerEnv = facebookEnv();
    const connection = await seedConnection(workerEnv, actor.userId);
    await env.DB.prepare('UPDATE facebook_connections SET token_expires_at = ? WHERE id = ?')
      .bind('2026-09-03T00:00:00.000Z', connection.id).run();
    const fetchImpl = vi.fn();
    const service = createFacebookIntegrationService(workerEnv, {
      fetchImpl, now: () => new Date('2026-09-04T00:00:00.000Z'),
    });

    await expect(service.syncForAdmin(actor)).resolves.toMatchObject({
      errors: [{ connectionId: connection.id, code: 'reauthorization_required' }],
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(await env.DB.prepare(`
      SELECT status, token_ciphertext, token_key_version FROM facebook_connections WHERE id = ?
    `).bind(connection.id).first()).toMatchObject({
      status: 'reauthorization_required', token_ciphertext: null, token_key_version: null,
    });
    await expect(createFacebookIntegrationService({ ...workerEnv, FACEBOOK_IMPORT_ENABLED: 'false' })
      .syncDueConnections()).resolves.toMatchObject({ skipped: true, attempted: 0 });
  });

  it('requires source reconfirmation and only auto-publishes after an explicit setting change', async () => {
    const actor = await seedAdmin();
    const workerEnv = facebookEnv();
    const connection = await seedConnection(workerEnv, actor.userId);
    const service = createFacebookIntegrationService(workerEnv, {
      fetchImpl: postsFetch([{
        id: 'auto-post', message: 'Bài tự động', created_time: '2026-09-03T10:00:00+0000',
        privacy: { value: 'EVERYONE' }, permalink_url: 'https://www.facebook.com/posts/auto',
      }]),
      now: () => new Date('2026-09-04T00:00:00.000Z'),
    });
    await service.updateSettings(actor, {
      sourceUrl: 'https://www.facebook.com/tranan.buhd', publishPolicy: 'auto',
    });
    await service.syncForAdmin(actor);
    expect(await env.DB.prepare('SELECT trang_thai FROM baiviet').first())
      .toMatchObject({ trang_thai: 'Hoàn thành' });

    await service.updateSettings(actor, {
      sourceUrl: 'https://www.facebook.com/another.owner', publishPolicy: 'review',
    });
    expect(await env.DB.prepare(`
      SELECT status, token_ciphertext, generation, last_error_code FROM facebook_connections WHERE id = ?
    `).bind(connection.id).first()).toMatchObject({
      status: 'reauthorization_required',
      token_ciphertext: null,
      generation: connection.generation + 1,
      last_error_code: 'source_reconfirmation_required',
    });
  });

  it('deletes unedited imports but preserves and detaches manually edited articles on data deletion', async () => {
    const actor = await seedAdmin();
    const workerEnv = facebookEnv();
    await seedConnection(workerEnv, actor.userId);
    const service = createFacebookIntegrationService(workerEnv, {
      fetchImpl: postsFetch([
        { id: 'delete-clean', message: 'Bản sạch', privacy: { value: 'EVERYONE' } },
        { id: 'delete-edited', message: 'Bản sẽ sửa', privacy: { value: 'EVERYONE' } },
      ]),
      now: () => new Date('2026-09-04T00:00:00.000Z'),
    });
    await service.syncForAdmin(actor);
    const edited = await env.DB.prepare(`
      SELECT article_id FROM facebook_post_imports WHERE facebook_post_id = 'delete-edited'
    `).first();
    await env.DB.prepare("UPDATE baiviet SET tieu_de = 'Nội dung quản trị giữ lại' WHERE id = ?")
      .bind(edited.article_id).run();
    const payload = toBase64Url(new TextEncoder().encode(JSON.stringify({
      algorithm: 'HMAC-SHA256', user_id: 'fb-owner',
    })));
    const signature = await hmacSha256(workerEnv.FACEBOOK_APP_SECRET, payload);

    const deletion = await service.handleSignedCallback(
      `${signature}.${payload}`, 'data-deletion', 'https://quangtu.vn/api/meta/data-deletion',
    );

    expect(deletion).toMatchObject({ confirmation_code: expect.any(String), url: expect.stringContaining('/api/meta/data-deletion/status') });
    expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM facebook_post_imports').first()).toMatchObject({ count: 0 });
    expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM baiviet').first()).toMatchObject({ count: 1 });
    expect(await env.DB.prepare('SELECT tieu_de FROM baiviet').first()).toMatchObject({ tieu_de: 'Nội dung quản trị giữ lại' });
    expect(await env.DB.prepare('SELECT facebook_user_id, tombstoned_at FROM facebook_connections').first())
      .toMatchObject({ facebook_user_id: null, tombstoned_at: '2026-09-04T00:00:00.000Z' });
    await expect(service.deletionStatus(deletion.confirmation_code)).resolves.toEqual({ status: 'completed' });
  });

  it('detaches book imports and chapter replacements before provider removal', async () => {
    const actor = await seedAdmin();
    const workerEnv = facebookEnv();
    await seedConnection(workerEnv, actor.userId);
    const service = createFacebookIntegrationService(workerEnv, {
      fetchImpl: postsFetch([
        { id: 'book-import-source', message: 'Nguồn sẽ import sách', privacy: { value: 'EVERYONE' } },
        { id: 'chapter-replace-source', message: 'Nguồn sẽ thay chương', privacy: { value: 'EVERYONE' } },
      ]),
      now: () => new Date('2026-09-04T00:00:00.000Z'),
    });
    await service.syncForAdmin(actor);
    const imported = await env.DB.prepare(`
      SELECT id, facebook_post_id, article_id FROM facebook_post_imports ORDER BY facebook_post_id
    `).all();
    const bookImport = imported.results.find((item) => item.facebook_post_id === 'book-import-source');
    const chapterReplace = imported.results.find((item) => item.facebook_post_id === 'chapter-replace-source');

    await importBookAtomically(workerEnv, actor, {
      book: { id: bookImport.article_id, tieu_de: 'Sách biên tập giữ lại' },
      chapters: [{ tieu_de: 'Chương import', noi_dung: 'Nội dung do biên tập viên import' }],
    });
    await replaceBookChapters(workerEnv, actor, chapterReplace.article_id, [
      { tieu_de: 'Chương thay thế', noi_dung: 'Nội dung do biên tập viên thay thế' },
    ]);

    await expect(env.DB.prepare(`
      SELECT facebook_post_id, source_managed, status, last_error_code
      FROM facebook_post_imports ORDER BY facebook_post_id
    `).all()).resolves.toMatchObject({ results: [
      { facebook_post_id: 'book-import-source', source_managed: 0, status: 'detached', last_error_code: 'article_modified' },
      { facebook_post_id: 'chapter-replace-source', source_managed: 0, status: 'detached', last_error_code: 'article_modified' },
    ] });

    await service.manageImport(actor, bookImport.id, 'remove');
    await service.manageImport(actor, chapterReplace.id, 'remove');
    await expect(env.DB.prepare(`
      SELECT COUNT(*) AS count FROM baiviet
      WHERE id IN (?, ?)
    `).bind(bookImport.article_id, chapterReplace.article_id).first()).resolves.toMatchObject({ count: 2 });
    await expect(env.DB.prepare(`
      SELECT COUNT(*) AS count FROM tap_noi_dung
      WHERE bai_viet_id IN (?, ?)
    `).bind(bookImport.article_id, chapterReplace.article_id).first()).resolves.toMatchObject({ count: 2 });
  });

  it('preserves an article edited after deletion cleanup reads it and still removes provider provenance', async () => {
    const actor = await seedAdmin();
    const workerEnv = facebookEnv();
    const actualRepository = createFacebookRepository(workerEnv);
    await seedConnection(workerEnv, actor.userId);
    await createFacebookIntegrationService(workerEnv, {
      fetchImpl: postsFetch([{
        id: 'delete-after-read', message: 'Bản thuộc Facebook', privacy: { value: 'EVERYONE' },
      }]),
      now: () => new Date('2026-09-04T00:00:00.000Z'),
    }).syncForAdmin(actor);
    const item = await env.DB.prepare(`
      SELECT id, article_id FROM facebook_post_imports WHERE facebook_post_id = 'delete-after-read'
    `).first();
    const articleRead = deferred();
    const editorFinished = deferred();
    const racingRepository = {
      ...actualRepository,
      async getArticle(id) {
        const article = await actualRepository.getArticle(id);
        if (id === item.article_id) {
          articleRead.resolve();
          await editorFinished.promise;
        }
        return article;
      },
    };
    const service = createFacebookIntegrationService(workerEnv, {
      repository: racingRepository,
      now: () => new Date('2026-09-04T00:05:00.000Z'),
    });
    const { signedRequest } = await signedRequestFor(workerEnv, 'fb-owner');
    const deletionPromise = service.handleSignedCallback(
      signedRequest, 'data-deletion', 'https://quangtu.vn/api/meta/data-deletion',
    );

    await articleRead.promise;
    await actualRepository.updateArticlesAndDetachManagedImports({
      filters: { id: `eq.${item.article_id}` },
      payload: { tieu_de: 'Nội dung biên tập phải được giữ', updated_at: '2026-09-04T00:06:00.000Z' },
      now: '2026-09-04T00:06:00.000Z',
    });
    editorFinished.resolve();

    const deletion = await deletionPromise;
    await expect(service.deletionStatus(deletion.confirmation_code)).resolves.toEqual({ status: 'completed' });
    expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM facebook_post_imports').first())
      .toMatchObject({ count: 0 });
    expect(await env.DB.prepare('SELECT id, tieu_de FROM baiviet').first()).toMatchObject({
      id: item.article_id,
      tieu_de: 'Nội dung biên tập phải được giữ',
    });
  });

  it('deletes every ledger page before completing a signed deletion request', async () => {
    const actor = await seedAdmin();
    const workerEnv = facebookEnv();
    const connection = await seedConnection(workerEnv, actor.userId);
    const statements = Array.from({ length: 205 }, (_, index) => env.DB.prepare(`
      INSERT INTO facebook_post_imports
        (id, connection_id, facebook_post_id, permalink_url, privacy, source_content_hash,
          source_managed, status, created_at, updated_at)
      VALUES (?, ?, ?, '', 'EVERYONE', ?, 1, 'failed', ?, ?)
    `).bind(
      `bulk-import-${index}`, connection.id, `bulk-post-${index}`, `source-${index}`,
      '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z',
    ));
    for (let index = 0; index < statements.length; index += 75) {
      await env.DB.batch(statements.slice(index, index + 75));
    }
    const { signedRequest } = await signedRequestFor(workerEnv, 'fb-owner');
    const service = createFacebookIntegrationService(workerEnv, {
      now: () => new Date('2026-09-04T00:00:00.000Z'),
    });

    await expect(service.getAdminData(actor, { importOffset: 0, importLimit: 50 })).resolves.toMatchObject({
      imports: expect.arrayContaining([expect.objectContaining({ status: 'failed' })]),
      importsPage: { nextOffset: 50, offset: 0 },
    });
    await expect(service.getAdminData(actor, { importOffset: 200, importLimit: 50 })).resolves.toMatchObject({
      imports: expect.any(Array), importsPage: { nextOffset: null, offset: 200 },
    });

    const deletion = await service.handleSignedCallback(
      signedRequest, 'data-deletion', 'https://quangtu.vn/api/meta/data-deletion',
    );

    expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM facebook_post_imports').first())
      .toMatchObject({ count: 0 });
    expect(await env.DB.prepare('SELECT facebook_user_id FROM facebook_connections').first())
      .toMatchObject({ facebook_user_id: null });
    await expect(service.deletionStatus(deletion.confirmation_code)).resolves.toEqual({ status: 'completed' });
  });

  it('keeps deletion lookup durable after a partial failure and completes idempotently on retry', async () => {
    const actor = await seedAdmin();
    const workerEnv = facebookEnv();
    const connection = await seedConnection(workerEnv, actor.userId);
    await env.DB.prepare(`
      INSERT INTO facebook_post_imports
        (id, connection_id, facebook_post_id, permalink_url, privacy, source_content_hash,
          source_managed, status, created_at, updated_at)
      VALUES ('retry-cleanup', ?, 'retry-cleanup-post', '', 'EVERYONE', 'source', 1, 'failed', ?, ?)
    `).bind(connection.id, '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z').run();
    const actualRepository = createFacebookRepository(workerEnv);
    const failingRepository = {
      ...actualRepository,
      removeManagedImportAtomically: vi.fn(async () => { throw new Error('simulated-delete-failure'); }),
    };
    const { signedRequest } = await signedRequestFor(workerEnv, 'fb-owner');
    const failedService = createFacebookIntegrationService(workerEnv, {
      repository: failingRepository,
      now: () => new Date('2026-09-04T00:00:00.000Z'),
    });

    const first = await failedService.handleSignedCallback(
      signedRequest, 'data-deletion', 'https://quangtu.vn/api/meta/data-deletion',
    );
    await expect(failedService.deletionStatus(first.confirmation_code)).resolves.toEqual({ status: 'failed' });
    expect(await env.DB.prepare('SELECT facebook_user_id, tombstoned_at FROM facebook_connections').first())
      .toMatchObject({ facebook_user_id: 'fb-owner', tombstoned_at: expect.any(String) });

    const retryService = createFacebookIntegrationService(workerEnv, {
      now: () => new Date('2026-09-04T00:05:00.000Z'),
    });
    const retried = await retryService.handleSignedCallback(
      signedRequest, 'data-deletion', 'https://quangtu.vn/api/meta/data-deletion',
    );
    expect(retried.confirmation_code).toBe(first.confirmation_code);
    await expect(retryService.deletionStatus(first.confirmation_code)).resolves.toEqual({ status: 'completed' });
    expect(await env.DB.prepare('SELECT facebook_user_id FROM facebook_connections').first())
      .toMatchObject({ facebook_user_id: null });
  });

  it('deletes a Facebook-only account but preserves users that still have another identity', async () => {
    const now = '2026-09-04T00:00:00.000Z';
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO app_users (id, email, display_name, avatar_url, role, created_at, updated_at)
        VALUES ('facebook-only', 'fb@example.test', 'Facebook PII', 'https://facebook.example/avatar', 'user', ?, ?)`)
        .bind(now, now),
      env.DB.prepare(`INSERT INTO auth_identities
        (id, user_id, issuer, provider, provider_subject, created_at, updated_at)
        VALUES ('facebook-only-id', 'facebook-only', 'https://www.facebook.com', 'facebook', 'fb-only-subject', ?, ?)`)
        .bind(now, now),
    ]);
    const workerEnv = facebookEnv();
    const { signedRequest } = await signedRequestFor(workerEnv, 'fb-only-subject');

    await createFacebookIntegrationService(workerEnv, { now: () => new Date(now) })
      .handleSignedCallback(signedRequest, 'deauthorize', 'https://quangtu.vn/api/meta/deauthorize');

    expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM app_users WHERE id = 'facebook-only'").first())
      .toMatchObject({ count: 0 });
  });

  it('eventually revisits and updates an old source-managed post outside the ingestion overlap', async () => {
    const actor = await seedAdmin();
    const workerEnv = facebookEnv();
    await seedConnection(workerEnv, actor.userId);
    const original = {
      id: 'old-managed-post', message: 'Bản cũ', created_time: '2026-08-01T10:00:00+0000',
      updated_time: '2026-08-01T10:00:00+0000', permalink_url: 'https://www.facebook.com/posts/old',
      privacy: { value: 'EVERYONE' },
    };
    await createFacebookIntegrationService(workerEnv, {
      fetchImpl: postsFetch([original]), now: () => new Date('2026-09-04T00:00:00.000Z'),
    }).syncForAdmin(actor);
    const updated = { ...original, message: 'Bản Facebook đã sửa lâu sau đó', updated_time: '2026-09-04T02:00:00+0000' };
    const fetchImpl = vi.fn(async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/me/posts')) return Response.json({ data: [] });
      if (url.pathname.endsWith('/old-managed-post')) return Response.json(updated);
      throw new Error(`unexpected graph request: ${url.pathname}`);
    });

    await expect(createFacebookIntegrationService(workerEnv, {
      fetchImpl, now: () => new Date('2026-09-04T02:00:00.000Z'),
    }).syncForAdmin(actor)).resolves.toMatchObject({ updated: 1, errors: [] });

    expect(await env.DB.prepare('SELECT tieu_de FROM baiviet').first())
      .toMatchObject({ tieu_de: 'Bản Facebook đã sửa lâu sau đó' });
  });

  it('reconciles an old deleted post after two bounded checks outside the ingestion overlap', async () => {
    const actor = await seedAdmin();
    const workerEnv = facebookEnv();
    await seedConnection(workerEnv, actor.userId);
    const post = {
      id: 'old-deleted-post', message: 'Sẽ bị xóa', created_time: '2026-08-01T10:00:00+0000',
      permalink_url: 'https://www.facebook.com/posts/deleted', privacy: { value: 'EVERYONE' },
    };
    await createFacebookIntegrationService(workerEnv, {
      fetchImpl: postsFetch([post]), now: () => new Date('2026-09-04T00:00:00.000Z'),
    }).syncForAdmin(actor);
    const missingFetch = vi.fn(async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/me/posts')) return Response.json({ data: [] });
      if (url.pathname.endsWith('/old-deleted-post')) {
        return Response.json({ error: { code: 100 } }, { status: 400 });
      }
      throw new Error(`unexpected graph request: ${url.pathname}`);
    });

    await expect(createFacebookIntegrationService(workerEnv, {
      fetchImpl: missingFetch, now: () => new Date('2026-09-04T02:00:00.000Z'),
    }).syncForAdmin(actor)).resolves.toMatchObject({ removed: 0, errors: [] });
    expect(await env.DB.prepare('SELECT missing_count FROM facebook_post_imports').first())
      .toMatchObject({ missing_count: 1 });
    await expect(createFacebookIntegrationService(workerEnv, {
      fetchImpl: missingFetch, now: () => new Date('2026-09-04T04:00:00.000Z'),
    }).syncForAdmin(actor)).resolves.toMatchObject({ removed: 1, errors: [] });
    expect(await env.DB.prepare('SELECT status, article_id FROM facebook_post_imports').first())
      .toMatchObject({ status: 'removed', article_id: null });
    expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM baiviet').first()).toMatchObject({ count: 0 });
  });

  it('removes an old post immediately when reconciliation confirms it is no longer public', async () => {
    const actor = await seedAdmin();
    const workerEnv = facebookEnv();
    await seedConnection(workerEnv, actor.userId);
    const post = {
      id: 'old-private-post', message: 'Đang công khai', created_time: '2026-08-01T10:00:00+0000',
      permalink_url: 'https://www.facebook.com/posts/private', privacy: { value: 'EVERYONE' },
    };
    await createFacebookIntegrationService(workerEnv, {
      fetchImpl: postsFetch([post]), now: () => new Date('2026-09-04T00:00:00.000Z'),
    }).syncForAdmin(actor);
    const privateFetch = vi.fn(async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/me/posts')) return Response.json({ data: [] });
      if (url.pathname.endsWith('/old-private-post')) {
        return Response.json({ ...post, privacy: { value: 'FRIENDS' } });
      }
      throw new Error(`unexpected graph request: ${url.pathname}`);
    });

    await expect(createFacebookIntegrationService(workerEnv, {
      fetchImpl: privateFetch, now: () => new Date('2026-09-04T02:00:00.000Z'),
    }).syncForAdmin(actor)).resolves.toMatchObject({ removed: 1, errors: [] });
    expect(await env.DB.prepare('SELECT status, article_id FROM facebook_post_imports').first())
      .toMatchObject({ status: 'removed', article_id: null });
  });

  it('keeps a normally deleted managed article absent until the item retry action', async () => {
    const actor = await seedAdmin();
    const workerEnv = facebookEnv();
    await seedConnection(workerEnv, actor.userId);
    const post = {
      id: 'retry-deleted-post', message: 'Bài cần khôi phục', created_time: '2026-09-03T10:00:00+0000',
      permalink_url: 'https://www.facebook.com/posts/retry', privacy: { value: 'EVERYONE' },
    };
    const service = createFacebookIntegrationService(workerEnv, {
      fetchImpl: postsFetch([post]), now: () => new Date('2026-09-04T00:00:00.000Z'),
    });
    await service.syncForAdmin(actor);
    const item = await env.DB.prepare('SELECT * FROM facebook_post_imports').first();
    const repository = createFacebookRepository(workerEnv);
    await repository.markManagedImportArticleDeleted(item.article_id, '2026-09-04T00:05:00.000Z');
    await repository.deleteArticle(item.article_id);
    const scheduledService = createFacebookIntegrationService(workerEnv, {
      fetchImpl: postsFetch([post]), now: () => new Date('2026-09-04T00:06:00.000Z'),
    });

    await expect(scheduledService.syncForAdmin(actor)).resolves.toMatchObject({ updated: 0, errors: [] });
    expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM baiviet').first()).toMatchObject({ count: 0 });
    expect(await env.DB.prepare('SELECT article_id, status, last_error_code FROM facebook_post_imports').first())
      .toMatchObject({ article_id: null, status: 'failed', last_error_code: 'article_deleted' });

    const retryService = createFacebookIntegrationService(workerEnv, {
      fetchImpl: vi.fn(async (input) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith('/retry-deleted-post')) return Response.json(post);
        throw new Error(`unexpected graph request: ${url.pathname}`);
      }),
      now: () => new Date('2026-09-04T00:10:00.000Z'),
    });

    await expect(retryService.manageImport(actor, item.id, 'retry')).resolves.toBeUndefined();
    expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM baiviet').first()).toMatchObject({ count: 1 });
    expect(await env.DB.prepare('SELECT article_id, status, last_error_code FROM facebook_post_imports').first())
      .toMatchObject({ article_id: expect.any(String), status: 'review', last_error_code: null });
  });

  it.each([
    { label: 'disabled', overrides: { FACEBOOK_IMPORT_ENABLED: 'false' }, code: 'facebook_import_disabled' },
    { label: 'unconfigured', overrides: { FACEBOOK_APP_ID: '' }, code: 'facebook_configuration_error' },
  ])('rejects $label item retry before acquiring a lease or restoring a deleted article', async ({ overrides, code }) => {
    const actor = await seedAdmin();
    const workerEnv = facebookEnv();
    const connection = await seedConnection(workerEnv, actor.userId);
    const post = {
      id: 'unavailable-retry-post', message: 'Bài đã xoá phải được giữ nguyên',
      created_time: '2026-09-03T10:00:00+0000',
      permalink_url: 'https://www.facebook.com/posts/unavailable-retry', privacy: { value: 'EVERYONE' },
    };
    await expect(createFacebookIntegrationService(workerEnv, {
      fetchImpl: postsFetch([post]), now: () => new Date('2026-09-04T00:00:00.000Z'),
    }).syncForAdmin(actor)).resolves.toMatchObject({ imported: 1, errors: [] });
    const item = await env.DB.prepare('SELECT * FROM facebook_post_imports').first();
    const repository = createFacebookRepository(workerEnv);
    await repository.markManagedImportArticleDeleted(item.article_id, '2026-09-04T00:05:00.000Z');
    await repository.deleteArticle(item.article_id);
    const originalImport = await repository.getImport(item.id);
    expect(originalImport).toMatchObject({ article_id: null, status: 'failed', last_error_code: 'article_deleted' });
    const originalConnectionHash = await sha256(JSON.stringify(await repository.getConnection(connection.id)));
    const acquireLease = vi.spyOn(repository, 'acquireLease');
    const restoreManagedImport = vi.spyOn(repository, 'restoreManagedImport');
    const fetchImpl = vi.fn(async (input) => {
      expect(new URL(String(input)).pathname).toBe(`/v26.0/${post.id}`);
      return Response.json(post);
    });
    const service = createFacebookIntegrationService({ ...workerEnv, ...overrides }, {
      repository, fetchImpl, now: () => new Date('2026-09-04T00:10:00.000Z'),
    });

    const outcome = await service.manageImport(actor, item.id, 'retry').catch((error) => error);

    expect.soft(outcome).toMatchObject({ status: 503, code });
    expect.soft(fetchImpl.mock.calls.length).toBe(0);
    expect.soft(acquireLease.mock.calls.length).toBe(0);
    expect.soft(restoreManagedImport.mock.calls.length).toBe(0);
    expect.soft(await repository.getImport(item.id)).toEqual(originalImport);
    expect.soft(await sha256(JSON.stringify(await repository.getConnection(connection.id))))
      .toBe(originalConnectionHash);
    expect.soft(await env.DB.prepare('SELECT COUNT(*) AS count FROM baiviet').first()).toEqual({ count: 0 });
  });

  it('keeps removal and disconnect available while importing is disabled and unconfigured', async () => {
    const actor = await seedAdmin();
    const workerEnv = facebookEnv();
    const connection = await seedConnection(workerEnv, actor.userId);
    await expect(createFacebookIntegrationService(workerEnv, {
      fetchImpl: postsFetch([
        { id: 'disabled-remove-post', message: 'Bài gỡ riêng', privacy: { value: 'EVERYONE' } },
        { id: 'disabled-disconnect-post', message: 'Bài gỡ khi ngắt kết nối', privacy: { value: 'EVERYONE' } },
      ]),
      now: () => new Date('2026-09-04T00:00:00.000Z'),
    }).syncForAdmin(actor)).resolves.toMatchObject({ imported: 2, errors: [] });
    const item = await env.DB.prepare('SELECT * FROM facebook_post_imports WHERE facebook_post_id = ?')
      .bind('disabled-remove-post').first();
    const fetchImpl = vi.fn(async () => { throw new Error('Deletion must not call Facebook.'); });
    const repository = createFacebookRepository(workerEnv);
    const acquireLease = vi.spyOn(repository, 'acquireLease');
    const service = createFacebookIntegrationService({
      ...workerEnv, FACEBOOK_IMPORT_ENABLED: 'false', FACEBOOK_APP_ID: '',
      FACEBOOK_APP_SECRET: '', FACEBOOK_TOKEN_ENCRYPTION_KEY: '',
    }, { repository, fetchImpl, now: () => new Date('2026-09-04T00:10:00.000Z') });

    await expect(service.manageImport(actor, item.id, 'remove')).resolves.toBeUndefined();
    expect(await repository.getImport(item.id)).toBeNull();
    expect(await repository.getArticle(item.article_id)).toBeNull();
    expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM facebook_post_imports').first()).toEqual({ count: 1 });
    expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM baiviet').first()).toEqual({ count: 1 });

    await expect(service.disconnect(actor)).resolves.toBeUndefined();
    expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM facebook_post_imports').first()).toEqual({ count: 0 });
    expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM baiviet').first()).toEqual({ count: 0 });
    expect(await repository.getConnection(connection.id)).toMatchObject({
      facebook_user_id: null, token_ciphertext: null, token_key_version: null,
      tombstoned_at: '2026-09-04T00:10:00.000Z',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(acquireLease).not.toHaveBeenCalled();
  });

  it('keeps deletion cleanup authoritative when tombstoning fences a stale sync update', async () => {
    const actor = await seedAdmin();
    const workerEnv = facebookEnv();
    const actualRepository = createFacebookRepository(workerEnv);
    await seedConnection(workerEnv, actor.userId);
    const original = {
      id: 'delete-race-post', message: 'Bản đầu', created_time: '2026-09-03T10:00:00+0000',
      updated_time: '2026-09-03T10:00:00+0000',
      permalink_url: 'https://www.facebook.com/posts/delete-race', privacy: { value: 'EVERYONE' },
    };
    await createFacebookIntegrationService(workerEnv, {
      fetchImpl: postsFetch([original]), now: () => new Date('2026-09-04T00:00:00.000Z'),
    }).syncForAdmin(actor);
    await env.DB.prepare(`
      UPDATE facebook_post_imports SET last_reconciled_at = '2026-09-04T02:00:00.000Z'
      WHERE facebook_post_id = 'delete-race-post'
    `).run();

    const tombstoned = deferred();
    const syncReachedCas = deferred();
    const syncReachedCommit = deferred();
    const racingRepository = {
      ...actualRepository,
      async updateManagedImport(input) {
        syncReachedCas.resolve();
        await tombstoned.promise;
        return actualRepository.updateManagedImport(input);
      },
      async tombstoneConnection(id, now, reason) {
        const result = await actualRepository.tombstoneConnection(id, now, reason);
        tombstoned.resolve();
        return result;
      },
      async listImports(connectionId, limit) {
        await syncReachedCommit.promise;
        return actualRepository.listImports(connectionId, limit);
      },
      async markSyncSuccess(input) {
        syncReachedCommit.resolve();
        return actualRepository.markSyncSuccess(input);
      },
      async clearScanContinuation(input) {
        const cleared = await actualRepository.clearScanContinuation(input);
        syncReachedCommit.resolve();
        return cleared;
      },
      async detachManagedImportAfterSyncConflict(input) {
        return actualRepository.detachManagedImportAfterSyncConflict(input);
      },
    };
    const changed = { ...original, message: 'Facebook mới', updated_time: '2026-09-04T01:00:00+0000' };
    const service = createFacebookIntegrationService(workerEnv, {
      repository: racingRepository,
      fetchImpl: postsFetch([changed]),
      now: () => new Date('2026-09-04T02:00:00.000Z'),
    });
    const sync = service.syncForAdmin(actor);
    await syncReachedCas.promise;
    const { signedRequest } = await signedRequestFor(workerEnv, 'fb-owner');
    const deletion = service.handleSignedCallback(
      signedRequest, 'data-deletion', 'https://quangtu.vn/api/meta/data-deletion',
    );

    await expect(sync).resolves.toMatchObject({
      errors: [{ connectionId: 'facebook-connection', code: 'connection_fenced' }],
    });
    const deleted = await deletion;
    await expect(service.deletionStatus(deleted.confirmation_code)).resolves.toEqual({ status: 'completed' });
    expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM facebook_post_imports').first())
      .toMatchObject({ count: 0 });
    expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM baiviet').first())
      .toMatchObject({ count: 0 });
  });

  it('rejects import actions outside the actor connector without disclosing whether the id exists', async () => {
    const owner = await seedAdmin();
    const other = await seedAdmin('other-facebook-admin');
    const workerEnv = facebookEnv();
    const ownerConnection = await seedConnection(workerEnv, owner.userId);
    const otherConnection = await seedConnection(workerEnv, other.userId, {
      connectionId: 'other-facebook-connection', facebookUserId: 'other-fb-owner',
    });
    const timestamp = '2026-09-04T00:00:00.000Z';
    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO baiviet (id, tieu_de, created_at, updated_at)
        VALUES ('other-managed-article', 'Không thuộc connector này', ?, ?)
      `).bind(timestamp, timestamp),
      env.DB.prepare(`
        INSERT INTO facebook_post_imports
          (id, connection_id, facebook_post_id, article_id, permalink_url, privacy,
            source_content_hash, source_managed, status, created_at, updated_at)
        VALUES ('other-managed-import', ?, 'other-managed-post', 'other-managed-article', '',
          'EVERYONE', 'source', 1, 'review', ?, ?)
      `).bind(otherConnection.id, timestamp, timestamp),
    ]);
    expect(ownerConnection.id).not.toBe(otherConnection.id);
    const service = createFacebookIntegrationService(workerEnv, {
      fetchImpl: vi.fn(), now: () => new Date(timestamp),
    });

    const missing = await service.manageImport(owner, 'missing-import', 'detach').catch((error) => error);
    const forbidden = await service.manageImport(owner, 'other-managed-import', 'detach').catch((error) => error);

    expect(forbidden).toMatchObject({ status: 404, code: 'facebook_import_not_found' });
    expect(forbidden).toMatchObject({ status: missing.status, code: missing.code, message: missing.message });
    expect(await env.DB.prepare(`
      SELECT source_managed, status FROM facebook_post_imports WHERE id = 'other-managed-import'
    `).first()).toMatchObject({ source_managed: 1, status: 'review' });
  });

  it('uses article-and-ledger compare-and-swap so an editor interleaving cannot be overwritten', async () => {
    const actor = await seedAdmin();
    const workerEnv = facebookEnv();
    const repository = createFacebookRepository(workerEnv);
    const connection = await seedConnection(workerEnv, actor.userId);
    await createFacebookIntegrationService(workerEnv, {
      fetchImpl: postsFetch([{
        id: 'cas-post', message: 'Bản đầu', permalink_url: 'https://www.facebook.com/posts/cas',
        privacy: { value: 'EVERYONE' },
      }]),
      now: () => new Date('2026-09-04T00:00:00.000Z'),
    }).syncForAdmin(actor);
    const item = await repository.getImportByPostId('cas-post');
    const expectedArticle = await repository.getArticle(item.article_id);
    await env.DB.prepare("UPDATE baiviet SET tieu_de = 'Biên tập chen ngang', updated_at = ? WHERE id = ?")
      .bind('2026-09-04T01:00:00.000Z', item.article_id).run();
    const leased = await repository.acquireLease(
      connection.id, connection.generation, 'cas-lease', '2026-09-04T02:00:00.000Z', '2026-09-04T02:05:00.000Z',
    );
    const changedArticle = { ...expectedArticle, tieu_de: 'Facebook mới', updated_at: '2026-09-04T02:00:00.000Z' };
    const updated = await repository.updateManagedImport({
      connectionId: connection.id, generation: leased.generation, leaseToken: 'cas-lease',
      importId: item.id, article: changedArticle, permalink: item.permalink_url, privacy: 'EVERYONE',
      sourceUpdatedAt: null, sourceHash: 'new-source', articleHash: 'new-article', importStatus: 'review',
      expectedArticle, expectedArticleHash: item.article_content_hash, now: '2026-09-04T02:00:00.000Z',
    });

    expect(updated).toBe(false);
    await expect(repository.detachManagedImportAfterSyncConflict({
      connectionId: connection.id, generation: leased.generation, leaseToken: 'cas-lease',
      importId: item.id, articleId: item.article_id, expectedArticle,
      expectedArticleHash: item.article_content_hash, now: '2026-09-04T02:00:00.000Z',
    })).resolves.toBe(true);
    expect(await env.DB.prepare('SELECT tieu_de FROM baiviet WHERE id = ?').bind(item.article_id).first())
      .toMatchObject({ tieu_de: 'Biên tập chen ngang' });
    expect(await env.DB.prepare(`
      SELECT source_content_hash, source_managed, status FROM facebook_post_imports WHERE id = ?
    `).bind(item.id).first()).toMatchObject({
      source_content_hash: item.source_content_hash, source_managed: 0, status: 'detached',
    });
  });

  it('records a per-post commit failure and makes item retry restore the article', async () => {
    const actor = await seedAdmin();
    const workerEnv = facebookEnv();
    await seedConnection(workerEnv, actor.userId);
    const post = {
      id: 'failed-boundary-post', message: 'Nội dung Facebook',
      permalink_url: 'https://www.facebook.com/posts/failed-boundary', privacy: { value: 'EVERYONE' },
    };
    const collidingArticleId = `facebook-${(await sha256(post.id)).slice(0, 40)}`;
    await env.DB.prepare(`
      INSERT INTO baiviet (id, tieu_de, created_at, updated_at)
      VALUES (?, 'Nội dung không thuộc Facebook', ?, ?)
    `).bind(collidingArticleId, '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z').run();
    const service = createFacebookIntegrationService(workerEnv, {
      fetchImpl: postsFetch([post]), now: () => new Date('2026-09-04T00:00:00.000Z'),
    });

    await expect(service.syncForAdmin(actor)).resolves.toMatchObject({
      errors: [{ connectionId: 'facebook-connection', code: 'post_import_partial_failure' }],
    });
    const failed = await env.DB.prepare('SELECT * FROM facebook_post_imports').first();
    expect(failed).toMatchObject({
      article_id: null, status: 'failed', last_error_code: 'facebook_import_commit_failed',
    });
    expect(await env.DB.prepare(`
      SELECT status, watermark_created_time, backoff_until FROM facebook_connections
      WHERE id = 'facebook-connection'
    `).first()).toMatchObject({
      status: 'backoff', watermark_created_time: null, backoff_until: '2026-09-04T00:15:00.000Z',
    });
    const collisionRetryService = createFacebookIntegrationService(workerEnv, {
      fetchImpl: vi.fn(async (input) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith('/failed-boundary-post')) return Response.json(post);
        throw new Error(`unexpected graph request: ${url.pathname}`);
      }),
      now: () => new Date('2026-09-04T00:05:00.000Z'),
    });
    await expect(collisionRetryService.manageImport(actor, failed.id, 'retry'))
      .rejects.toMatchObject({ code: 'facebook_import_restore_conflict' });
    expect(await env.DB.prepare('SELECT tieu_de FROM baiviet WHERE id = ?').bind(collidingArticleId).first())
      .toMatchObject({ tieu_de: 'Nội dung không thuộc Facebook' });
    expect(await env.DB.prepare(`
      SELECT article_id, status, last_error_code FROM facebook_post_imports WHERE id = ?
    `).bind(failed.id).first()).toMatchObject({
      article_id: null, status: 'failed', last_error_code: 'facebook_import_restore_conflict',
    });
    await env.DB.prepare('DELETE FROM baiviet WHERE id = ?').bind(collidingArticleId).run();
    const retryService = createFacebookIntegrationService(workerEnv, {
      fetchImpl: vi.fn(async (input) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith('/failed-boundary-post')) return Response.json(post);
        throw new Error(`unexpected graph request: ${url.pathname}`);
      }),
      now: () => new Date('2026-09-04T00:10:00.000Z'),
    });

    await expect(retryService.manageImport(actor, failed.id, 'retry')).resolves.toBeUndefined();
    expect(await env.DB.prepare('SELECT status, article_id, last_error_code FROM facebook_post_imports').first())
      .toMatchObject({ status: 'review', article_id: collidingArticleId, last_error_code: null });
  });

  it('does not advance the watermark past an older failed post when a newer post succeeds', async () => {
    const actor = await seedAdmin();
    const workerEnv = facebookEnv();
    const connection = await seedConnection(workerEnv, actor.userId);
    const olderPost = {
      id: 'partial-failed-older', message: 'Bài cũ chưa ghi được',
      created_time: '2026-09-03T08:00:00+0000',
      permalink_url: 'https://www.facebook.com/posts/partial-failed-older', privacy: { value: 'EVERYONE' },
    };
    const newerPost = {
      id: 'partial-success-newer', message: 'Bài mới ghi thành công',
      created_time: '2026-09-03T09:00:00+0000',
      permalink_url: 'https://www.facebook.com/posts/partial-success-newer', privacy: { value: 'EVERYONE' },
    };
    const collidingArticleId = `facebook-${(await sha256(olderPost.id)).slice(0, 40)}`;
    await env.DB.prepare(`
      INSERT INTO baiviet (id, tieu_de, created_at, updated_at)
      VALUES (?, 'Không thuộc Facebook', ?, ?)
    `).bind(collidingArticleId, '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z').run();

    const first = createFacebookIntegrationService(workerEnv, {
      fetchImpl: postsFetch([olderPost, newerPost]),
      now: () => new Date('2026-09-04T00:00:00.000Z'),
    });
    await expect(first.syncForAdmin(actor)).resolves.toMatchObject({
      errors: [{ connectionId: connection.id, code: 'post_import_partial_failure' }],
    });
    expect(await env.DB.prepare(`
      SELECT status, watermark_created_time, backoff_until FROM facebook_connections WHERE id = ?
    `).bind(connection.id).first()).toMatchObject({
      status: 'backoff', watermark_created_time: null, backoff_until: '2026-09-04T00:15:00.000Z',
    });
    expect(await env.DB.prepare(`
      SELECT status FROM facebook_post_imports WHERE facebook_post_id = ?
    `).bind(olderPost.id).first()).toMatchObject({ status: 'failed' });
    expect(await env.DB.prepare(`
      SELECT status FROM facebook_post_imports WHERE facebook_post_id = ?
    `).bind(newerPost.id).first()).toMatchObject({ status: 'review' });

    await env.DB.prepare('DELETE FROM baiviet WHERE id = ?').bind(collidingArticleId).run();
    const retry = createFacebookIntegrationService(workerEnv, {
      fetchImpl: postsFetch([olderPost, newerPost]),
      now: () => new Date('2026-09-04T00:16:00.000Z'),
    });
    await expect(retry.syncForAdmin(actor)).resolves.toMatchObject({ errors: [], updated: 1 });
    expect(await env.DB.prepare(`
      SELECT status, watermark_created_time, backoff_until FROM facebook_connections WHERE id = ?
    `).bind(connection.id).first()).toMatchObject({
      status: 'active', watermark_created_time: '2026-09-03T09:00:00+0000', backoff_until: null,
    });
    expect(await env.DB.prepare(`
      SELECT status FROM facebook_post_imports WHERE facebook_post_id = ?
    `).bind(olderPost.id).first()).toMatchObject({ status: 'review' });
  });
});

async function seedAdmin(userId = 'facebook-admin') {
  const now = '2026-09-01T00:00:00.000Z';
  await env.DB.prepare(`
    INSERT INTO app_users (id, email, display_name, role, created_at, updated_at)
    VALUES (?, ?, 'Facebook Admin', 'admin', ?, ?)
  `).bind(userId, `${userId}@example.test`, now, now).run();
  return {
    id: `admin-session-${userId}`, userId, appUserId: userId,
    email: `${userId}@example.test`, displayName: 'Facebook Admin', avatarUrl: null,
    role: 'admin', expiresAt: '2027-01-01T00:00:00.000Z', csrfToken: 'csrf', rawToken: 'raw',
    identityId: null, authProvider: 'google',
  };
}

async function seedConnection(workerEnv, appUserId, options = {}) {
  const repository = createFacebookRepository(workerEnv);
  const connectionId = options.connectionId || 'facebook-connection';
  const facebookUserId = options.facebookUserId || 'fb-owner';
  const encrypted = await encryptFacebookToken(workerEnv, 'facebook-access-token', connectionId, facebookUserId);
  return repository.saveConnection({
    actorUserId: appUserId, connectionId, expectedGeneration: 0, facebookUserId,
    displayName: 'Facebook Owner', sourceUrl: 'https://www.facebook.com/tranan.buhd',
    ciphertext: encrypted.ciphertext, keyVersion: encrypted.keyVersion, scopes: ['public_profile', 'user_posts'],
    tokenExpiresAt: '2027-01-01T00:00:00.000Z', dataAccessExpiresAt: '2027-01-01T00:00:00.000Z',
    now: '2026-09-01T00:00:00.000Z',
  });
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function postsFetch(posts) {
  return vi.fn(async (input) => {
    const url = new URL(String(input));
    expect(url.pathname).toBe('/v26.0/me/posts');
    expect(url.searchParams.get('access_token')).toBe('facebook-access-token');
    expect(url.searchParams.get('appsecret_proof')).toMatch(/^[a-f0-9]{64}$/u);
    return Response.json({ data: posts });
  });
}

async function signedRequestFor(workerEnv, facebookUserId) {
  const payload = toBase64Url(new TextEncoder().encode(JSON.stringify({
    algorithm: 'HMAC-SHA256', user_id: facebookUserId,
  })));
  const signature = await hmacSha256(workerEnv.FACEBOOK_APP_SECRET, payload);
  return { signedRequest: `${signature}.${payload}` };
}

function facebookEnv() {
  return {
    ...env,
    APP_ORIGIN: 'https://quangtu.vn',
    FACEBOOK_APP_ID: 'facebook-app-id', FACEBOOK_APP_SECRET: 'facebook-app-secret',
    FACEBOOK_TOKEN_ENCRYPTION_KEY: 'facebook-token-encryption-key-with-enough-entropy',
    FACEBOOK_TOKEN_KEY_VERSION: 'v1', FACEBOOK_GRAPH_API_VERSION: 'v26.0',
    FACEBOOK_IMPORT_ENABLED: 'true', FACEBOOK_IMPORT_MAX_PAGES: '4',
  };
}

function splitMigration(sql) {
  return sql.trim().split(/;\s*\n\s*\n/gu).map((statement) =>
    statement.trim().endsWith(';') ? statement.trim() : `${statement.trim()};`);
}
