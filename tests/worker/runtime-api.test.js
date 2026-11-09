import commentPlaysSchema from '../../migrations/0022-comment-replies-and-album-plays.sql?raw';
import { beforeAll, describe, expect, it } from 'vitest';
import { applyD1Migrations, env, SELF } from 'cloudflare:test';
import applicationSchema from '../../migrations/0001-application-schema.sql?raw';
import authSchema from '../../migrations/0002-auth-and-session-schema.sql?raw';
import memberStatusSchema from '../../migrations/0026-member-status.sql?raw';
import ugcModerationSchema from '../../migrations/0038-ugc-moderation.sql?raw';
import ledgerSchema from '../../migrations/0003-migration-and-media-operation-schema.sql?raw';
import driveSchema from '../../migrations/0007-google-drive-talk-sources.sql?raw';
import presenceSchema from '../../migrations/0008-active-visitors.sql?raw';
import hardeningSchema from '../../migrations/0009-backward-compatible-sync-and-media-hardening.sql?raw';
import atomicMediaSchema from '../../migrations/0010-atomic-article-media-references.sql?raw';
import playerCompatibilitySchema from '../../migrations/0011-bidirectional-player-sync-compatibility.sql?raw';
import authRetentionSchema from '../../migrations/0012-auth-retention-indexes.sql?raw';
import adminDashboardSchema from '../../migrations/0013-admin-dashboard-analytics.sql?raw';
import adminAnalyticsSchema from '../../migrations/0014-admin-analytics-pageviews.sql?raw';
import googleOnlyAuthSchema from '../../migrations/0015-remove-legacy-password-accounts.sql?raw';
import positionedArticleMediaSchema from '../../migrations/0016-positioned-article-media-references.sql?raw';
import userActivitySchema from '../../migrations/0017-user-activity-foundations.sql?raw';
import audioLibrarySchema from '../../migrations/0018-audio-library-and-speaker.sql?raw';
import practiceCommunitySchema from '../../migrations/0020-practice-community-achievements.sql?raw';
import {
  getMedia, purgeExpiredMedia, tombstoneMedia, uploadMedia, uploadMultipartMedia,
} from '../../src/worker/api/media.js';
import { sha256, toBase64Url } from '../../src/worker/auth/crypto.js';

beforeAll(async () => {
  await applyD1Migrations(env.DB, [
    { name: '0001-application-schema.sql', queries: splitMigration(applicationSchema) },
    { name: '0002-auth-and-session-schema.sql', queries: splitMigration(authSchema) },
    { name: '0026-member-status.sql', queries: splitMigration(memberStatusSchema) },
    { name: '0003-migration-and-media-operation-schema.sql', queries: splitMigration(ledgerSchema) },
    { name: '0007-google-drive-talk-sources.sql', queries: splitMigration(driveSchema) },
    { name: '0008-active-visitors.sql', queries: splitMigration(presenceSchema) },
    { name: '0009-backward-compatible-sync-and-media-hardening.sql', queries: splitMigration(hardeningSchema) },
    { name: '0010-atomic-article-media-references.sql', queries: splitMigration(atomicMediaSchema) },
    { name: '0011-bidirectional-player-sync-compatibility.sql', queries: splitMigration(playerCompatibilitySchema) },
    { name: '0012-auth-retention-indexes.sql', queries: splitMigration(authRetentionSchema) },
    { name: '0013-admin-dashboard-analytics.sql', queries: splitMigration(adminDashboardSchema) },
    { name: '0014-admin-analytics-pageviews.sql', queries: splitMigration(adminAnalyticsSchema) },
    { name: '0015-remove-legacy-password-accounts.sql', queries: splitMigration(googleOnlyAuthSchema) },
    { name: '0016-positioned-article-media-references.sql', queries: splitMigration(positionedArticleMediaSchema) },
    { name: '0017-user-activity-foundations.sql', queries: splitMigration(userActivitySchema) },
    { name: '0018-audio-library-and-speaker.sql', queries: splitMigration(audioLibrarySchema) },
    { name: '0020-practice-community-achievements.sql', queries: splitMigration(practiceCommunitySchema) },
    { name: '0022-comment-replies-and-album-plays.sql', queries: splitMigration(commentPlaysSchema) },
    { name: '0038-ugc-moderation.sql', queries: splitMigration(ugcModerationSchema) },
  ]);
  const now = new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO migration_runs
      (id, source_sql_sha256, source_manifest_sha256, status, started_at,
       imported_at, verified_at, sealed_at)
    VALUES ('test-seal', 'sql', 'manifest', 'sealed', ?, ?, ?, ?)
  `).bind(now, now, now, now).run();
  await env.DB.prepare(`
    INSERT INTO baiviet (id, tieu_de, noi_dung, trang_thai)
    VALUES ('article-1', 'Bài thử', '<p>Nội dung</p>', 'Hoàn thành')
  `).run();
  await env.DB.prepare(`
    INSERT INTO phap_thoai (id, tieu_de, dien_gia, visibility)
    VALUES
      ('talk-public', 'Công khai', 'Thầy Minh Niệm', 'public'),
      ('talk-private', 'Nội bộ', 'Giảng sư nội bộ', 'private')
  `).run();
  await env.DB.prepare(`
    INSERT INTO binh_luan
      (id, bai_viet_id, ten, dien_thoai, email, noi_dung, tao_luc,
       moderation_status, approved_author_name, approved_author_avatar_url)
    VALUES (1, 'article-1', 'Phật tử', '0900000000', 'private@example.com', 'Hay', ?,
      'approved', 'Phật tử', '')
  `).bind(now).run();
});

function splitMigration(sql) {
  return sql.trim().split(/;\s*\n\s*\n/gu).map((statement) =>
    statement.trim().endsWith(';') ? statement.trim() : `${statement.trim()};`);
}

describe('Worker runtime API', () => {
  it('reports a sealed database', async () => {
    const response = await SELF.fetch('http://localhost:8787/api/health');
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, database: 'sealed' });
  });

  it('returns the frontend-compatible anonymous session shape', async () => {
    const response = await SELF.fetch('http://localhost:8787/api/auth/session');
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ session: null });
  });

  it.each(['/api/auth/login', '/api/auth/legacy'])('does not expose removed password route %s', async (path) => {
    const response = await SELF.fetch(`http://localhost:8787${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Origin: 'http://localhost:8787',
        'X-CSRF-Token': 'login',
      },
      body: JSON.stringify({ username: 'removed', password: 'removed' }),
    });
    expect(response.status).toBe(404);
  });

  it.each([
    ['/tutap.html?from=old', '/tu-tap?from=old'],
    ['/phapthoai.html', '/phap-thoai'],
    ['/huongdan.html', '/huong-dan'],
  ])('permanently redirects legacy page %s', async (legacyPath, expectedPath) => {
    const response = await SELF.fetch(`http://localhost:8787${legacyPath}`, {
      redirect: 'manual',
    });
    expect(response.status).toBe(308);
    expect(new URL(response.headers.get('location')).pathname +
      new URL(response.headers.get('location')).search).toBe(expectedPath);
  });

  it('serves public articles and filters private talks server-side', async () => {
    const articles = await SELF.fetch('http://localhost:8787/api/articles');
    expect(articles.status).toBe(200);
    expect(await articles.json()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'article-1', tieu_de: 'Bài thử' }),
    ]));
    const talks = await SELF.fetch('http://localhost:8787/api/talks');
    expect(talks.status).toBe(200);
    expect(await talks.json()).toEqual([
      expect.objectContaining({
        id: 'talk-public', dien_gia: 'Thầy Minh Niệm', visibility: 'public',
      }),
    ]);
  });

  it('never returns comment contact fields to a guest', async () => {
    const response = await SELF.fetch(
      'http://localhost:8787/api/articles/article-1/comments',
    );
    const [comment] = await response.json();
    expect(comment).toMatchObject({ ten: 'Phật tử', noi_dung: 'Hay' });
    expect(comment).not.toHaveProperty('email');
    expect(comment).not.toHaveProperty('dien_thoai');
  });

  it('increments views atomically through the public write contract', async () => {
    const headers = {
      Origin: 'http://127.0.0.1:4173',
      'Sec-Fetch-Site': 'same-origin',
      'X-CSRF-Token': 'public',
    };
    const first = await SELF.fetch('http://localhost:8787/api/articles/article-1/views', {
      method: 'POST',
      headers,
    });
    const second = await SELF.fetch('http://localhost:8787/api/articles/article-1/views', {
      method: 'POST',
      headers,
    });
    expect(first.status).toBe(200);
    expect((await second.json()).so_luot).toBe(2);
  });

  it('rejects a public mutation without same-origin CSRF proof', async () => {
    const response = await SELF.fetch('http://localhost:8787/api/articles/article-1/views', {
      method: 'POST',
      headers: { Origin: 'https://evil.example' },
    });
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'invalid_origin' },
    });
  });

  it('keeps an uploaded object during the 30-day tombstone retention window', async () => {
    const bytes = new TextEncoder().encode('image fixture');
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const upload = await uploadMedia(new Request('http://localhost:8787/api/media', {
      method: 'POST',
      headers: {
        'Content-Type': 'image/jpeg',
        'Content-Length': String(bytes.byteLength),
        'X-Media-Prefix': 'covers',
        'X-File-Name': 'cover.jpg',
        'X-Content-SHA256': toBase64Url(new Uint8Array(digest)),
        'Idempotency-Key': 'upload-test',
      },
      body: bytes,
    }), env, { userId: 'legacy:1' });
    expect(upload.status).toBe('applied');
    expect(await env.MEDIA.head(upload.objectKey)).not.toBeNull();

    const deleted = await tombstoneMedia(new Request('http://localhost:8787/api/media', {
      method: 'DELETE',
      headers: { 'Idempotency-Key': 'delete-test' },
    }), env, encodeURIComponent(upload.objectKey));
    expect(deleted.status).toBe('tombstoned');
    expect(Date.parse(deleted.purgeAfter)).toBeGreaterThan(Date.now() + 29 * 24 * 60 * 60 * 1000);
    expect(await env.MEDIA.head(upload.objectKey)).not.toBeNull();
    await expect(purgeExpiredMedia(env, new Date())).resolves.toEqual({
      purged: 0,
      failedUploadsPurged: 0,
    });
    expect(await env.MEDIA.head(upload.objectKey)).not.toBeNull();

    const afterRetention = new Date(Date.parse(deleted.purgeAfter) + 1);
    await expect(purgeExpiredMedia(env, afterRetention)).resolves.toEqual({
      purged: 1,
      failedUploadsPurged: 0,
    });
    expect(await env.MEDIA.head(upload.objectKey)).toBeNull();
    expect(await env.DB.prepare(
      'SELECT object_key FROM media_objects WHERE object_key = ?',
    ).bind(upload.objectKey).first()).toBeNull();
    await expect(env.DB.prepare(
      'SELECT status FROM media_operations WHERE id = ?',
    ).bind(deleted.id).first()).resolves.toMatchObject({ status: 'purged' });
  });

  it('derives upload digest and size from the body before applying a manifest row', async () => {
    const bytes = new TextEncoder().encode('trusted body');
    const incorrectBytes = new TextEncoder().encode('different body');
    const incorrectDigest = toBase64Url(new Uint8Array(
      await crypto.subtle.digest('SHA-256', incorrectBytes),
    ));
    const digestOperationId = await sha256('put:legacy:1:bad-digest');
    await expect(uploadMedia(new Request('http://localhost:8787/api/media', {
      method: 'POST',
      headers: {
        'Content-Type': 'image/jpeg',
        'Content-Length': String(bytes.byteLength),
        'X-Media-Prefix': 'covers',
        'X-File-Name': 'bad-digest.jpg',
        'X-Content-SHA256': incorrectDigest,
        'Idempotency-Key': 'bad-digest',
      },
      body: bytes,
    }), env, { userId: 'legacy:1' })).rejects.toMatchObject({
      status: 400,
      code: 'upload_digest_mismatch',
    });
    const failedDigest = await env.DB.prepare(
      'SELECT object_key, status FROM media_operations WHERE id = ?',
    ).bind(digestOperationId).first();
    expect(failedDigest.status).toBe('failed');
    expect(await env.DB.prepare(
      'SELECT object_key FROM media_objects WHERE object_key = ?',
    ).bind(failedDigest.object_key).first()).toBeNull();

    const correctDigest = toBase64Url(new Uint8Array(
      await crypto.subtle.digest('SHA-256', bytes),
    ));
    const sizeOperationId = await sha256('put:legacy:1:bad-size');
    await expect(uploadMedia(new Request('http://localhost:8787/api/media', {
      method: 'POST',
      headers: {
        'Content-Type': 'image/jpeg',
        'Content-Length': String(bytes.byteLength + 1),
        'X-Media-Prefix': 'covers',
        'X-File-Name': 'bad-size.jpg',
        'X-Content-SHA256': correctDigest,
        'Idempotency-Key': 'bad-size',
      },
      body: bytes,
    }), env, { userId: 'legacy:1' })).rejects.toMatchObject({
      status: 400,
      code: 'upload_size_mismatch',
    });
    const failedSize = await env.DB.prepare(
      'SELECT object_key, status FROM media_operations WHERE id = ?',
    ).bind(sizeOperationId).first();
    expect(failedSize.status).toBe('failed');
    expect(await env.DB.prepare(
      'SELECT object_key FROM media_objects WHERE object_key = ?',
    ).bind(failedSize.object_key).first()).toBeNull();
    expect(await env.MEDIA.head(failedSize.object_key)).toBeNull();
  });

  it('marks the ledger failed even when orphan cleanup fails, then reconciles it', async () => {
    const bytes = new TextEncoder().encode('cleanup failure fixture');
    const digest = toBase64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)));
    const operationId = await sha256('put:legacy:1:cleanup-failure');
    const deletedKeys = [];
    const failingEnv = {
      ...env,
      DB: {
        prepare: (...args) => env.DB.prepare(...args),
        batch: async () => { throw new Error('simulated-d1-batch-failure'); },
      },
      MEDIA: {
        head: async () => null,
        put: async () => ({ size: bytes.byteLength }),
        delete: async () => { throw new Error('simulated-r2-delete-failure'); },
      },
    };
    await expect(uploadMedia(new Request('http://localhost:8787/api/media', {
      method: 'POST',
      headers: {
        'Content-Type': 'image/jpeg',
        'Content-Length': String(bytes.byteLength),
        'X-Media-Prefix': 'covers',
        'X-File-Name': 'cleanup.jpg',
        'X-Content-SHA256': digest,
        'Idempotency-Key': 'cleanup-failure',
      },
      body: bytes,
    }), failingEnv, { userId: 'legacy:1' })).rejects.toThrow('simulated-d1-batch-failure');
    const failed = await env.DB.prepare(
      'SELECT object_key, status FROM media_operations WHERE id = ?',
    ).bind(operationId).first();
    expect(failed.status).toBe('failed');

    const reconcilerEnv = {
      ...env,
      MEDIA: {
        delete: async key => { deletedKeys.push(key); },
      },
    };
    const reconciled = await purgeExpiredMedia(reconcilerEnv, new Date());
    expect(reconciled.failedUploadsPurged).toBeGreaterThanOrEqual(1);
    expect(deletedKeys).toContain(failed.object_key);
    await expect(env.DB.prepare(
      'SELECT status FROM media_operations WHERE id = ?',
    ).bind(operationId).first()).resolves.toMatchObject({ status: 'purged' });
  });

  it('derives multipart metadata without requiring a client digest', async () => {
    const bytes = new TextEncoder().encode('multipart body');
    const expectedSha256 = toBase64Url(new Uint8Array(
      await crypto.subtle.digest('SHA-256', bytes),
    ));
    const form = new FormData();
    form.set('folder', 'covers');
    form.set('file', new File([bytes], 'multipart.jpg', { type: 'image/jpeg' }));
    const request = new Request('http://localhost:8787/api/media', {
      method: 'POST',
      headers: { 'Idempotency-Key': 'multipart-derived' },
      body: form,
    });
    const upload = await uploadMultipartMedia(request, env, { userId: 'legacy:1' });
    const manifest = await env.DB.prepare(`
      SELECT byte_size, sha256, baseline FROM media_objects WHERE object_key = ?
    `).bind(upload.objectKey).first();
    expect(manifest).toEqual({
      byte_size: bytes.byteLength,
      sha256: expectedSha256,
      baseline: 0,
    });
  });

  it('serves and tombstones an imported baseline media manifest row', async () => {
    const objectKey = 'covers/imported-baseline.jpg';
    const bytes = new TextEncoder().encode('baseline media');
    const digest = toBase64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)));
    const now = new Date().toISOString();
    await env.MEDIA.put(objectKey, bytes, {
      httpMetadata: { contentType: 'image/jpeg' },
    });
    await env.DB.prepare(`
      INSERT INTO media_objects
        (object_key, source_path, byte_size, sha256, content_type,
         cache_control, baseline, created_at)
      VALUES (?, ?, ?, ?, 'image/jpeg', 'public, max-age=31536000, immutable', 1, ?)
    `).bind(objectKey, objectKey, bytes.byteLength, digest, now).run();

    const response = await getMedia(
      new Request(`http://localhost:8787/api/media/${objectKey}`), env, objectKey,
    );
    expect(response.status).toBe(200);
    expect(new TextDecoder().decode(await response.arrayBuffer())).toBe('baseline media');
    const deleted = await tombstoneMedia(new Request('http://localhost:8787/api/media', {
      method: 'DELETE',
      headers: { 'Idempotency-Key': 'delete-baseline-test' },
    }), env, encodeURIComponent(objectKey));
    expect(deleted.status).toBe('tombstoned');
    expect(await env.MEDIA.head(objectKey)).not.toBeNull();
  });
});
