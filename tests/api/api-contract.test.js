import commentPlaysSchema from '../../migrations/0022-comment-replies-and-album-plays.sql?raw';
import performanceSchema from '../../migrations/0025-performance-checkpoints.sql?raw';
import ugcModerationSchema from '../../migrations/0038-ugc-moderation.sql?raw';
import reportVersionsSchema from '../../migrations/0040-ugc-report-versions.sql?raw';
import trackPlaySchema from '../../migrations/0023-track-play-events.sql?raw';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyD1Migrations, env } from 'cloudflare:test';
import applicationSchema from '../../migrations/0001-application-schema.sql?raw';
import authSchema from '../../migrations/0002-auth-and-session-schema.sql?raw';
import memberStatusSchema from '../../migrations/0026-member-status.sql?raw';
import ledgerSchema from '../../migrations/0003-migration-and-media-operation-schema.sql?raw';
import presenceSchema from '../../migrations/0008-active-visitors.sql?raw';
import hardeningSchema from '../../migrations/0009-backward-compatible-sync-and-media-hardening.sql?raw';
import atomicMediaSchema from '../../migrations/0010-atomic-article-media-references.sql?raw';
import playerCompatibilitySchema from '../../migrations/0011-bidirectional-player-sync-compatibility.sql?raw';
import authRetentionSchema from '../../migrations/0012-auth-retention-indexes.sql?raw';
import adminDashboardSchema from '../../migrations/0013-admin-dashboard-analytics.sql?raw';
import adminAnalyticsSchema from '../../migrations/0014-admin-analytics-pageviews.sql?raw';
import googleOnlyAuthSchema from '../../migrations/0015-remove-legacy-password-accounts.sql?raw';
import userActivityFoundationsSchema from '../../migrations/0017-user-activity-foundations.sql?raw';
import audioLibrarySchema from '../../migrations/0018-audio-library-and-speaker.sql?raw';
import facebookAuthSchema from '../../migrations/0019-facebook-auth-import.sql?raw';
import practiceCommunitySchema from '../../migrations/0020-practice-community-achievements.sql?raw';
import facebookScanContinuationSchema from '../../migrations/0021-facebook-import-scan-continuation.sql?raw';
import { POST as apiPost, GET as apiGet } from '../../src/routes/api/[...path]/+server.ts';
import { handle as hookHandle } from '../../src/hooks.server.ts';
import { createSession } from '../../src/lib/server/auth/sessions.ts';
import { createSyncService } from '../../src/lib/server/services/sync.ts';
import { createSyncRepository } from '../../src/lib/server/repositories/sync-repository.ts';
import { writePersonalEvents } from '../../src/lib/server/services/personal-events.ts';
import { POST as nativeVerify } from '../../src/routes/api/auth/native-verify/+server.ts';

beforeAll(async () => {
  await applyD1Migrations(env.DB, [
    { name: '0001-application-schema.sql', queries: splitMigration(applicationSchema) },
    { name: '0002-auth-and-session-schema.sql', queries: splitMigration(authSchema) },
    { name: '0026-member-status.sql', queries: splitMigration(memberStatusSchema) },
    { name: '0003-migration-and-media-operation-schema.sql', queries: splitMigration(ledgerSchema) },
    { name: '0008-active-visitors.sql', queries: splitMigration(presenceSchema) },
    { name: '0009-backward-compatible-sync-and-media-hardening.sql', queries: splitMigration(hardeningSchema) },
    { name: '0010-atomic-article-media-references.sql', queries: splitMigration(atomicMediaSchema) },
    { name: '0011-bidirectional-player-sync-compatibility.sql', queries: splitMigration(playerCompatibilitySchema) },
    { name: '0012-auth-retention-indexes.sql', queries: splitMigration(authRetentionSchema) },
    { name: '0013-admin-dashboard-analytics.sql', queries: splitMigration(adminDashboardSchema) },
    { name: '0014-admin-analytics-pageviews.sql', queries: splitMigration(adminAnalyticsSchema) },
    { name: '0015-remove-legacy-password-accounts.sql', queries: splitMigration(googleOnlyAuthSchema) },
    { name: '0017-user-activity-foundations.sql', queries: splitMigration(userActivityFoundationsSchema) },
    { name: '0018-audio-library-and-speaker.sql', queries: splitMigration(audioLibrarySchema) },
    { name: '0019-facebook-auth-import.sql', queries: splitMigration(facebookAuthSchema) },
    { name: '0020-practice-community-achievements.sql', queries: splitMigration(practiceCommunitySchema) },
    { name: '0021-facebook-import-scan-continuation.sql', queries: splitMigration(facebookScanContinuationSchema) },
    { name: '0022-comment-replies-and-album-plays.sql', queries: splitMigration(commentPlaysSchema) },
    { name: '0023-track-play-events.sql', queries: splitMigration(trackPlaySchema) },
    { name: '0025-performance-checkpoints.sql', queries: splitMigration(performanceSchema) },
    { name: '0038-ugc-moderation.sql', queries: splitMigration(ugcModerationSchema) },
    { name: '0040-ugc-report-versions.sql', queries: splitMigration(reportVersionsSchema) },
  ]);
});

beforeEach(async () => {
  await env.DB.prepare('DELETE FROM practice_campaign_contributions').run();
  await env.DB.prepare('DELETE FROM practice_campaign_members').run();
  await env.DB.prepare('DELETE FROM practice_campaigns').run();
  await env.DB.prepare('DELETE FROM practice_profiles').run();
  await env.DB.prepare('DELETE FROM facebook_deletion_requests').run();
  await env.DB.prepare('DELETE FROM facebook_post_imports').run();
  await env.DB.prepare('DELETE FROM facebook_connections').run();
  await env.DB.prepare('DELETE FROM app_schema_capabilities').run();
  await env.DB.prepare('DELETE FROM reading_annotations').run();
  await env.DB.prepare('DELETE FROM reading_progress').run();
  await env.DB.prepare('DELETE FROM sync_devices').run();
  await env.DB.prepare('DELETE FROM practice_sessions').run();
  await env.DB.prepare('DELETE FROM article_media_cleanup_queue').run();
  await env.DB.prepare('DELETE FROM media_operations').run();
  await env.DB.prepare('DELETE FROM media_objects').run();
  await env.DB.prepare('DELETE FROM visitor_daily_presence').run();
  await env.DB.prepare('DELETE FROM active_visitors').run();
  await env.DB.prepare('DELETE FROM analytics_pageviews').run();
  await env.DB.prepare('DELETE FROM migration_runs').run();
  await env.DB.prepare('DELETE FROM oauth_start_rate_limits').run();
  await env.DB.prepare('DELETE FROM oauth_states').run();
  await env.DB.prepare('DELETE FROM auth_identities').run();
  await env.DB.prepare('DELETE FROM auth_sessions').run();
  await env.DB.prepare('DELETE FROM phap_thoai').run();
  await env.DB.prepare('DELETE FROM luot_xem').run();
  await env.DB.prepare('DELETE FROM baiviet').run();
  await env.DB.prepare('DELETE FROM app_users').run();
  const now = new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO app_users (id, display_name, role, created_at, updated_at)
    VALUES ('download-user', 'User', 'user', ?, ?)
  `).bind(now, now).run();
});

describe('phase 3 api contracts', () => {
  it('health bypasses seal and other APIs fail closed when unsealed', async () => {
    const health = await runApi('GET', '/api/health');
    expect(health.status).toBe(503);
    await expect(health.json()).resolves.toMatchObject({ ok: false, database: 'unsealed' });

    const session = await runApi('GET', '/api/auth/session');
    expect(session.status).toBe(503);
    await expect(session.json()).resolves.toMatchObject({
      error: { code: 'migration_unsealed' },
    });
  });

  it('does not probe the migration seal while rendering non-API routes', async () => {
    let probeCount = 0;
    const request = new Request('https://quangtu.vn/tu-tap');
    const response = await hookHandle({
      event: {
        request,
        locals: {},
        platform: {
          env: {
            ...sealedEnv(),
            DB: {
              prepare() {
                probeCount += 1;
                throw new Error('non-api-route-must-not-query-d1');
              },
            },
          },
        },
      },
      resolve: async () => new Response('tu-tap'),
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('tu-tap');
    expect(probeCount).toBe(0);
  });

  it('renders non-API routes anonymously when a session lookup hits a transient D1 error', async () => {
    const request = new Request('https://quangtu.vn/tu-tap', {
      headers: {
        Cookie: '__Host-quangtu_session=deadbeef',
      },
    });
    const response = await hookHandle({
      event: {
        request,
        locals: {},
        platform: {
          env: {
            ...sealedEnv(),
            DB: {
              prepare() {
                throw new Error('D1_ERROR: internal error');
              },
            },
          },
        },
      },
      resolve: async (event) => Response.json({ session: event.locals.session }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ session: null });
  });

  it('fails the API migration seal closed when D1 returns an internal error', async () => {
    const request = new Request('https://quangtu.vn/api/auth/session');
    const response = await hookHandle({
      event: {
        request,
        locals: {},
        platform: {
          env: {
            ...sealedEnv(),
            DB: {
              prepare() {
                const statement = {
                  bind() {
                    return statement;
                  },
                  async first() {
                    throw new Error('D1_ERROR: internal error');
                  },
                  async all() {
                    throw new Error('D1_ERROR: internal error');
                  },
                };
                return statement;
              },
            },
          },
        },
      },
      resolve: apiGet,
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'migration_unsealed' },
    });
  });

  it('fails closed when user activity is present but the Facebook schema capability is missing', async () => {
    await sealMigrationRun();
    await env.DB.prepare(`
      INSERT INTO app_schema_capabilities (capability, schema_version, applied_at)
      VALUES ('user-activity-foundations-v1', 17, ?)
    `).bind(now()).run();

    const response = await runApi('GET', '/api/auth/session');

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'migration_unsealed' },
    });
  });

  it('fails closed when activity and Facebook schemas exist but practice community is missing', async () => {
    await sealMigrationRun();
    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO app_schema_capabilities (capability, schema_version, applied_at)
        VALUES ('user-activity-foundations-v1', 17, ?)
      `).bind(now()),
      env.DB.prepare(`
        INSERT INTO app_schema_capabilities (capability, schema_version, applied_at)
        VALUES ('facebook-import-v1', 21, ?)
      `).bind(now()),
    ]);

    const response = await runApi('GET', '/api/auth/session');

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'migration_unsealed' },
    });
  });

  it('fails closed when every other required capability exists but audio library schema is missing', async () => {
    await sealMigrationRun();
    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO app_schema_capabilities (capability, schema_version, applied_at)
        VALUES ('user-activity-foundations-v1', 17, ?)
      `).bind(now()),
      env.DB.prepare(`
        INSERT INTO app_schema_capabilities (capability, schema_version, applied_at)
        VALUES ('facebook-import-v1', 21, ?)
      `).bind(now()),
      env.DB.prepare(`
        INSERT INTO app_schema_capabilities (capability, schema_version, applied_at)
        VALUES ('practice-community-v1', 20, ?)
      `).bind(now()),
    ]);

    const response = await runApi('GET', '/api/auth/session');

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'migration_unsealed' },
    });
  });

  it.each([17, 17.5])('fails closed when a required capability has stale or non-integral schema version %s', async (schemaVersion) => {
    await seal();
    await env.DB.prepare(`
      UPDATE app_schema_capabilities
      SET schema_version = ?
      WHERE capability = 'audio-library-and-speaker-v1'
    `).bind(schemaVersion).run();

    const response = await runApi('GET', '/api/auth/session');

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'migration_unsealed' },
    });
  });

  it('accepts a forward-compatible capability schema version above the current minimum', async () => {
    await seal();
    await env.DB.prepare(`
      UPDATE app_schema_capabilities
      SET schema_version = 118
      WHERE capability = 'audio-library-and-speaker-v1'
    `).run();

    const response = await runApi('GET', '/api/auth/session');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ session: null });
  });

  it('returns a controlled 503 when session lookup fails after the seal probe succeeds', async () => {
    const request = new Request('https://quangtu.vn/api/auth/session', {
      headers: { Cookie: '__Host-quangtu_session=opaque-session-token' },
    });
    const response = await hookHandle({
      event: {
        request,
        params: { path: 'auth/session' },
        locals: {},
        platform: {
          env: {
            ...sealedEnv(),
            DB: {
              prepare(sql) {
                if (String(sql).includes('sealed_migration')) {
                  return { async first() { return { id: 'sealed' }; } };
                }
                if (String(sql).includes('app_schema_capabilities')) {
                  return {
                    bind() {
                      return { async all() { return { results: [
                        { capability: 'user-activity-foundations-v1', schema_version: 17 },
                        { capability: 'audio-library-and-speaker-v1', schema_version: 18 },
                        { capability: 'facebook-import-v1', schema_version: 21 },
                        { capability: 'practice-community-v1', schema_version: 20 },
                      ] }; } };
                    },
                  };
                }
                return {
                  bind() {
                    return {
                      async first() {
                        throw new Error('D1_ERROR: session lookup failed');
                      },
                    };
                  },
                };
              },
            },
          },
        },
      },
      resolve: apiGet,
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'migration_unsealed' },
    });
  });

  it('keeps hook body streams readable and injects request id/session runtime', async () => {
    const request = new Request('https://quangtu.vn/api/presence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visitorId: 'visitor-aaaaaaaaaaaaaaaaaaaa' }),
    });
    const response = await hookHandle({
      event: { request, locals: {}, platform: { env: sealedEnv() } },
      resolve: async (event) => {
        const body = await event.request.text();
        expect(body).toContain('visitor-aaaaaaaaaaaaaaaaaaaa');
        expect(event.locals.requestId).toBeTruthy();
        return new Response(body);
      },
    });
    expect(await response.text()).toContain('visitor-aaaaaaaaaaaaaaaaaaaa');
  });

  it('returns json envelope headers and fails closed on duplicate session cookies', async () => {
    await seal();
    const created = await createSession(sealedEnv(), { userId: 'download-user' });
    const cookie = created.cookie.split(';', 1)[0];
    const response = await runApi('POST', '/api/downloads/access', {
      headers: {
        Cookie: `${cookie}; ${cookie}`,
        Origin: 'https://quangtu.vn',
        'Sec-Fetch-Site': 'same-origin',
        'X-CSRF-Token': created.csrfToken,
      },
    });
    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-request-id')).toBeTruthy();
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'authentication_required' },
    });
  });

  it('does not expose removed password login endpoints', async () => {
    await seal();
    const limiterKeys = [];
    const limiter = {
      async limit({ key }) {
        limiterKeys.push(key);
        return { success: true };
      },
    };

    for (const path of ['/api/auth/legacy', '/api/auth/login']) {
      const response = await runApi('POST', path, {
        env: { AUTH_RATE_LIMITER: limiter },
        headers: {
          Origin: 'https://quangtu.vn',
          'Sec-Fetch-Site': 'same-origin',
          'X-CSRF-Token': 'login',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username: 'removed', password: 'removed' }),
      });
      expect(response.status).toBe(404);
      expect(response.headers.get('set-cookie')).toBeNull();
    }
    expect(limiterKeys).toEqual([]);
  });

  it('serves provider-neutral members on the canonical route and preserves the legacy mutation route', async () => {
    await seal();
    const admin = await createAppSession('member-admin', 'admin');
    await createAppSession('member-facebook-only', 'user');
    const timestamp = now();
    await env.DB.prepare(`
      INSERT INTO auth_identities (id, user_id, issuer, provider, provider_subject, created_at, updated_at)
      VALUES ('member-facebook-identity', 'member-facebook-only', 'https://www.facebook.com', 'facebook', 'member-facebook-subject', ?, ?)
    `).bind(timestamp, timestamp).run();

    const list = await runApi('GET', '/api/admin/members', { headers: authedHeaders(admin) });
    expect(list.status).toBe(200);
    const listed = await list.json();
    expect(listed.members).toContainEqual(expect.objectContaining({
      accountType: 'member',
      id: 'member-facebook-only',
      kind: 'member',
    }));

    const canonical = await runApi('PATCH', '/api/admin/members/member-facebook-only', {
      headers: authedHeaders(admin),
      body: JSON.stringify({ name: 'Tên trung lập' }),
    });
    expect(canonical.status).toBe(200);
    await expect(canonical.json()).resolves.toMatchObject({
      member: { accountType: 'member', kind: 'member', name: 'Tên trung lập' },
    });

    const legacy = await runApi('PATCH', '/api/admin/members/google/member-facebook-only', {
      headers: authedHeaders(admin),
      body: JSON.stringify({ name: 'Tên tương thích' }),
    });
    expect(legacy.status).toBe(200);
    await expect(legacy.json()).resolves.toMatchObject({
      member: { accountType: 'member', kind: 'member', name: 'Tên tương thích' },
    });
  });

  it('rate limits both Google OAuth start endpoints before creating durable state', async () => {
    await seal();
    const limiter = { limit: async () => ({ success: false }) };
    const getResponse = await runApi('GET', '/api/auth/google', {
      env: { AUTH_RATE_LIMITER: limiter },
    });
    const postResponse = await runApi('POST', '/api/auth/google/start', {
      env: { AUTH_RATE_LIMITER: limiter },
      headers: {
        Origin: 'https://quangtu.vn',
        'Sec-Fetch-Site': 'same-origin',
        'X-CSRF-Token': 'login',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ returnTo: '/' }),
    });

    expect(getResponse.status).toBe(429);
    expect(postResponse.status).toBe(429);
    expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM oauth_states').first()).toMatchObject({ count: 0 });
  });

  it('canonicalizes the OAuth start origin before creating browser-bound state', async () => {
    await seal();
    const response = await runApi('GET', '/api/auth/google?returnTo=/tu-tap', {
      requestOrigin: 'http://localhost:4173',
      env: { APP_ORIGIN: 'http://127.0.0.1:4173' },
    });

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(
      'http://127.0.0.1:4173/api/auth/google?returnTo=/tu-tap',
    );
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM oauth_states').first()).toMatchObject({ count: 0 });
  });

  it('atomically caps Google OAuth starts across all Worker locations before state creation', async () => {
    await seal();
    const minuteStart = Math.floor(Date.now() / 60_000) * 60_000;
    await env.DB.prepare(`
      INSERT INTO oauth_start_rate_limits (bucket, attempt_count, expires_at)
      VALUES (?, 30, ?)
    `).bind(
      new Date(minuteStart).toISOString(),
      new Date(minuteStart + 10 * 60_000).toISOString(),
    ).run();

    const response = await runApi('GET', '/api/auth/google', {
      env: { AUTH_RATE_LIMITER: { limit: async () => ({ success: true }) } },
    });

    expect(response.status).toBe(429);
    expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM oauth_states').first()).toMatchObject({ count: 0 });
    expect(await env.DB.prepare('SELECT attempt_count FROM oauth_start_rate_limits').first()).toMatchObject({
      attempt_count: 30,
    });
  });


  it('rejects invalid oauth returnTo with exact api error json', async () => {
    await seal();
    const response = await runApi('GET', '/api/auth/google?returnTo=%2F%2Fevil.example');
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'invalid_return_to' },
    });
  });

  it('translates legacy HttpInputError responses into the declared 4xx envelope', async () => {
    await seal();
    const created = await createAppSession('ctv-user', 'ctv');
    const response = await runApi('PATCH', '/api/data/baiviet', {
      headers: authedHeaders(created),
      body: JSON.stringify({ tieu_de: 'Thiếu bộ lọc' }),
    });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'unsafe_mutation', message: 'Cập nhật cần dữ liệu và bộ lọc.' },
    });
  });

  it('detaches source-managed Facebook imports before legacy and canonical article edits', async () => {
    await seal();
    const created = await createAppSession('ctv-facebook-edit', 'ctv');
    const timestamp = now();
    await env.DB.prepare(`
      INSERT INTO baiviet (id, tieu_de, created_at, updated_at)
      VALUES ('facebook-edit', 'Facebook source title', ?, ?)
    `).bind(timestamp, timestamp).run();
    await env.DB.prepare(`
      INSERT INTO facebook_post_imports
        (id, facebook_post_id, article_id, permalink_url, privacy, source_content_hash,
          source_managed, status, created_at, updated_at)
      VALUES ('import-facebook-edit', 'post-facebook-edit', 'facebook-edit',
        'https://www.facebook.com/example/posts/facebook-edit', 'EVERYONE', 'source-hash',
        1, 'review', ?, ?)
    `).bind(timestamp, timestamp).run();

    const response = await runApi('PATCH', '/api/data/baiviet?id=eq.facebook-edit', {
      headers: authedHeaders(created),
      body: JSON.stringify({ tieu_de: 'Editor title' }),
    });

    expect(response.status).toBe(200);
    await expect(env.DB.prepare(
      "SELECT tieu_de FROM baiviet WHERE id = 'facebook-edit'",
    ).first()).resolves.toMatchObject({ tieu_de: 'Editor title' });
    await expect(env.DB.prepare(`
      SELECT article_id, source_managed, status, last_error_code
      FROM facebook_post_imports WHERE id = 'import-facebook-edit'
    `).first()).resolves.toMatchObject({
      article_id: 'facebook-edit',
      last_error_code: 'article_modified',
      source_managed: 0,
      status: 'detached',
    });

    await env.DB.prepare(`
      INSERT INTO baiviet (id, tieu_de, created_at, updated_at)
      VALUES ('facebook-canonical-edit', 'Canonical source title', ?, ?)
    `).bind(timestamp, timestamp).run();
    await env.DB.prepare(`
      INSERT INTO facebook_post_imports
        (id, facebook_post_id, article_id, permalink_url, privacy, source_content_hash,
          source_managed, status, created_at, updated_at)
      VALUES ('import-facebook-canonical-edit', 'post-facebook-canonical-edit',
        'facebook-canonical-edit', 'https://www.facebook.com/example/posts/facebook-canonical-edit',
        'EVERYONE', 'canonical-source-hash', 1, 'published', ?, ?)
    `).bind(timestamp, timestamp).run();

    const canonicalResponse = await runApi('PATCH', '/api/articles/facebook-canonical-edit', {
      headers: authedHeaders(created),
      body: JSON.stringify({ trang_thai: 'nhap' }),
    });

    expect(canonicalResponse.status).toBe(200);
    await expect(env.DB.prepare(`
      SELECT article_id, source_managed, status, last_error_code
      FROM facebook_post_imports WHERE id = 'import-facebook-canonical-edit'
    `).first()).resolves.toMatchObject({
      article_id: 'facebook-canonical-edit',
      last_error_code: 'article_modified',
      source_managed: 0,
      status: 'detached',
    });
  });

  it('atomically detaches Facebook provenance for every legacy chapter mutation', async () => {
    await seal();
    const created = await createAppSession('admin-facebook-chapters', 'admin');
    const timestamp = now();
    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO facebook_connections
          (id, app_user_id, source_url, status, generation, created_at, updated_at)
        VALUES ('chapter-mutation-connection', 'admin-facebook-chapters',
          'https://www.facebook.com/tranan.buhd', 'active', 1, ?, ?)
      `).bind(timestamp, timestamp),
      env.DB.prepare(`
        INSERT INTO baiviet (id, tieu_de, created_at, updated_at) VALUES
          ('facebook-chapter-post', 'Post parent', ?, ?),
          ('facebook-chapter-patch', 'Patch parent', ?, ?),
          ('facebook-chapter-delete', 'Delete parent', ?, ?),
          ('facebook-chapter-rollback', 'Rollback parent', ?, ?)
      `).bind(
        timestamp, timestamp, timestamp, timestamp,
        timestamp, timestamp, timestamp, timestamp,
      ),
      env.DB.prepare(`
        INSERT INTO tap_noi_dung (id, bai_viet_id, so_thu_tu, tieu_de, noi_dung, updated_at) VALUES
          (7101, 'facebook-chapter-patch', 0, 'Patch source', 'Original', ?),
          (7102, 'facebook-chapter-delete', 0, 'Delete source', 'Original', ?),
          (7103, 'facebook-chapter-rollback', 0, 'Rollback source', 'Original', ?)
      `).bind(timestamp, timestamp, timestamp),
      env.DB.prepare(`
        INSERT INTO facebook_post_imports
          (id, connection_id, facebook_post_id, article_id, permalink_url, privacy,
            source_content_hash, source_managed, status, created_at, updated_at) VALUES
          ('import-chapter-post', 'chapter-mutation-connection', 'post-chapter-post',
            'facebook-chapter-post', '', 'EVERYONE', 'source-post', 1, 'review', ?, ?),
          ('import-chapter-patch', 'chapter-mutation-connection', 'post-chapter-patch',
            'facebook-chapter-patch', '', 'EVERYONE', 'source-patch', 1, 'review', ?, ?),
          ('import-chapter-delete', 'chapter-mutation-connection', 'post-chapter-delete',
            'facebook-chapter-delete', '', 'EVERYONE', 'source-delete', 1, 'review', ?, ?),
          ('import-chapter-rollback', 'chapter-mutation-connection', 'post-chapter-rollback',
            'facebook-chapter-rollback', '', 'EVERYONE', 'source-rollback', 1, 'review', ?, ?)
      `).bind(
        timestamp, timestamp, timestamp, timestamp,
        timestamp, timestamp, timestamp, timestamp,
      ),
    ]);

    const inserted = await runApi('POST', '/api/data/tap_noi_dung', {
      headers: authedHeaders(created),
      body: JSON.stringify({
        bai_viet_id: 'facebook-chapter-post', so_thu_tu: 0,
        tieu_de: 'Editor post chapter', noi_dung: 'Editor post content',
      }),
    });
    expect(inserted.status).toBe(200);

    const patched = await runApi('PATCH', '/api/data/tap_noi_dung?id=eq.7101', {
      headers: authedHeaders(created),
      body: JSON.stringify({ noi_dung: 'Editor patch content' }),
    });
    expect(patched.status).toBe(200);

    const deleted = await runApi('DELETE', '/api/data/tap_noi_dung?id=eq.7102', {
      headers: authedHeaders(created),
    });
    expect(deleted.status).toBe(200);

    const rolledBack = await runApi('PATCH', '/api/data/tap_noi_dung?id=eq.7103', {
      headers: authedHeaders(created),
      body: JSON.stringify({ bai_viet_id: 'missing-parent' }),
    });
    expect(rolledBack.status).toBe(500);

    await expect(env.DB.prepare(`
      SELECT id, source_managed, status, last_error_code
      FROM facebook_post_imports ORDER BY id
    `).all()).resolves.toMatchObject({ results: [
      { id: 'import-chapter-delete', source_managed: 0, status: 'detached', last_error_code: 'article_modified' },
      { id: 'import-chapter-patch', source_managed: 0, status: 'detached', last_error_code: 'article_modified' },
      { id: 'import-chapter-post', source_managed: 0, status: 'detached', last_error_code: 'article_modified' },
      { id: 'import-chapter-rollback', source_managed: 1, status: 'review', last_error_code: null },
    ] });
    await expect(env.DB.prepare(`
      SELECT id, bai_viet_id, noi_dung FROM tap_noi_dung ORDER BY id
    `).all()).resolves.toMatchObject({ results: [
      { bai_viet_id: 'facebook-chapter-patch', noi_dung: 'Editor patch content' },
      { bai_viet_id: 'facebook-chapter-rollback', noi_dung: 'Original' },
      { bai_viet_id: 'facebook-chapter-post', noi_dung: 'Editor post content' },
    ] });

    const removeDetachedSource = await runApi(
      'POST',
      '/api/admin/facebook/imports/import-chapter-post/remove',
      { headers: authedHeaders(created) },
    );
    expect(removeDetachedSource.status).toBe(200);
    await expect(env.DB.prepare(`
      SELECT COUNT(*) AS count FROM baiviet WHERE id = 'facebook-chapter-post'
    `).first()).resolves.toMatchObject({ count: 1 });
    await expect(env.DB.prepare(`
      SELECT COUNT(*) AS count FROM tap_noi_dung WHERE bai_viet_id = 'facebook-chapter-post'
    `).first()).resolves.toMatchObject({ count: 1 });
  });

  it('detaches the old managed parent when a numeric chapter-id upsert moves its chapter', async () => {
    await seal();
    const created = await createAppSession('admin-facebook-chapter-move', 'admin');
    const timestamp = now();
    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO facebook_connections
          (id, app_user_id, source_url, status, generation, created_at, updated_at)
        VALUES ('chapter-move-connection', 'admin-facebook-chapter-move',
          'https://www.facebook.com/tranan.buhd', 'active', 1, ?, ?)
      `).bind(timestamp, timestamp),
      env.DB.prepare(`
        INSERT INTO baiviet (id, tieu_de, created_at, updated_at) VALUES
          ('facebook-chapter-move-old', 'Nguồn Facebook cũ', ?, ?),
          ('manual-chapter-move-new', 'Sách biên tập mới', ?, ?)
      `).bind(timestamp, timestamp, timestamp, timestamp),
      env.DB.prepare(`
        INSERT INTO tap_noi_dung (id, bai_viet_id, so_thu_tu, tieu_de, noi_dung, updated_at)
        VALUES (7110, 'facebook-chapter-move-old', 0, 'Chương cũ', 'Nội dung cũ', ?)
      `).bind(timestamp),
      env.DB.prepare(`
        INSERT INTO facebook_post_imports
          (id, connection_id, facebook_post_id, article_id, permalink_url, privacy,
            source_content_hash, source_managed, status, created_at, updated_at)
        VALUES ('import-chapter-move-old', 'chapter-move-connection', 'post-chapter-move-old',
          'facebook-chapter-move-old', '', 'EVERYONE', 'source-move', 1, 'review', ?, ?)
      `).bind(timestamp, timestamp),
    ]);

    const moved = await runApi('POST', '/api/data/tap_noi_dung?on_conflict=id', {
      headers: authedHeaders(created),
      body: JSON.stringify({
        id: 7110,
        bai_viet_id: 'manual-chapter-move-new',
        so_thu_tu: 0,
        tieu_de: 'Chương đã chuyển',
        noi_dung: 'Nội dung do biên tập viên chuyển',
      }),
    });
    expect(moved.status).toBe(200);
    await expect(env.DB.prepare(`
      SELECT source_managed, status, last_error_code
      FROM facebook_post_imports WHERE id = 'import-chapter-move-old'
    `).first()).resolves.toMatchObject({
      source_managed: 0,
      status: 'detached',
      last_error_code: 'article_modified',
    });
    await expect(env.DB.prepare('SELECT bai_viet_id FROM tap_noi_dung WHERE id = 7110').first())
      .resolves.toMatchObject({ bai_viet_id: 'manual-chapter-move-new' });

    const removeDetachedSource = await runApi(
      'POST',
      '/api/admin/facebook/imports/import-chapter-move-old/remove',
      { headers: authedHeaders(created) },
    );
    expect(removeDetachedSource.status).toBe(200);
    await expect(env.DB.prepare(`
      SELECT COUNT(*) AS count FROM baiviet WHERE id = 'facebook-chapter-move-old'
    `).first()).resolves.toMatchObject({ count: 1 });
    await expect(env.DB.prepare(`
      SELECT COUNT(*) AS count FROM tap_noi_dung
      WHERE id = 7110 AND bai_viet_id = 'manual-chapter-move-new'
    `).first()).resolves.toMatchObject({ count: 1 });
  });

  it('atomically detaches every managed import changed by legacy article filters', async () => {
    await seal();
    const created = await createAppSession('admin-facebook-filter-edit', 'admin');
    const timestamp = now();
    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO baiviet (id, tieu_de, danh_muc, created_at, updated_at) VALUES
          ('facebook-filter-edit-a', 'Source A', 'FILTERED', ?, ?),
          ('facebook-filter-edit-b', 'Source B', 'FILTERED', ?, ?),
          ('facebook-filter-edit-other', 'Source Other', 'OTHER', ?, ?)
      `).bind(timestamp, timestamp, timestamp, timestamp, timestamp, timestamp),
      env.DB.prepare(`
        INSERT INTO facebook_post_imports
          (id, facebook_post_id, article_id, permalink_url, privacy, source_content_hash,
            source_managed, status, created_at, updated_at) VALUES
          ('import-filter-edit-a', 'post-filter-edit-a', 'facebook-filter-edit-a', '', 'EVERYONE', 'source-a', 1, 'review', ?, ?),
          ('import-filter-edit-b', 'post-filter-edit-b', 'facebook-filter-edit-b', '', 'EVERYONE', 'source-b', 1, 'published', ?, ?),
          ('import-filter-edit-other', 'post-filter-edit-other', 'facebook-filter-edit-other', '', 'EVERYONE', 'source-other', 1, 'review', ?, ?)
      `).bind(timestamp, timestamp, timestamp, timestamp, timestamp, timestamp),
    ]);

    const response = await runApi('PATCH', '/api/data/baiviet?danh_muc=eq.FILTERED', {
      headers: authedHeaders(created), body: JSON.stringify({ tieu_de: 'Editor bulk title' }),
    });

    expect(response.status).toBe(200);
    await expect(env.DB.prepare(`
      SELECT id, source_managed, status, last_error_code FROM facebook_post_imports ORDER BY id
    `).all()).resolves.toMatchObject({ results: [
      { id: 'import-filter-edit-a', source_managed: 0, status: 'detached', last_error_code: 'article_modified' },
      { id: 'import-filter-edit-b', source_managed: 0, status: 'detached', last_error_code: 'article_modified' },
      { id: 'import-filter-edit-other', source_managed: 1, status: 'review', last_error_code: null },
    ] });

    const noMatch = await runApi(
      'PATCH',
      '/api/data/baiviet?id=eq.facebook-filter-edit-other&danh_muc=eq.FILTERED',
      { headers: authedHeaders(created), body: JSON.stringify({ tieu_de: 'Must not apply' }) },
    );
    expect(noMatch.status).toBe(200);
    await expect(env.DB.prepare(`
      SELECT source_managed, status FROM facebook_post_imports WHERE id = 'import-filter-edit-other'
    `).first()).resolves.toMatchObject({ source_managed: 1, status: 'review' });
    await expect(env.DB.prepare(`
      SELECT tieu_de FROM baiviet WHERE id = 'facebook-filter-edit-other'
    `).first()).resolves.toMatchObject({ tieu_de: 'Source Other' });
  });

  it('rolls back managed provenance when an article update fails', async () => {
    await seal();
    const created = await createAppSession('admin-facebook-update-failure', 'admin');
    const timestamp = now();
    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO baiviet (id, tieu_de, created_at, updated_at)
        VALUES ('facebook-update-failure', 'Source title', ?, ?)
      `).bind(timestamp, timestamp),
      env.DB.prepare(`
        INSERT INTO facebook_post_imports
          (id, facebook_post_id, article_id, permalink_url, privacy, source_content_hash,
            source_managed, status, created_at, updated_at)
        VALUES ('import-update-failure', 'post-update-failure', 'facebook-update-failure', '',
          'EVERYONE', 'source', 1, 'review', ?, ?)
      `).bind(timestamp, timestamp),
    ]);

    const response = await runApi('PATCH', '/api/data/baiviet?id=eq.facebook-update-failure', {
      headers: authedHeaders(created), body: JSON.stringify({ has_muc_luc: 2 }),
    });

    expect(response.status).toBe(500);
    await expect(env.DB.prepare(`
      SELECT source_managed, status, last_error_code FROM facebook_post_imports
      WHERE id = 'import-update-failure'
    `).first()).resolves.toMatchObject({ source_managed: 1, status: 'review', last_error_code: null });
    await expect(env.DB.prepare(`
      SELECT has_muc_luc FROM baiviet WHERE id = 'facebook-update-failure'
    `).first()).resolves.toMatchObject({ has_muc_luc: 0 });
  });

  it('detaches managed provenance when a legacy article id upsert updates an imported row', async () => {
    await seal();
    const created = await createAppSession('admin-facebook-upsert', 'admin');
    const timestamp = now();
    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO baiviet (id, tieu_de, created_at, updated_at)
        VALUES ('facebook-upsert', 'Source title', ?, ?)
      `).bind(timestamp, timestamp),
      env.DB.prepare(`
        INSERT INTO facebook_post_imports
          (id, facebook_post_id, article_id, permalink_url, privacy, source_content_hash,
            source_managed, status, created_at, updated_at)
        VALUES ('import-upsert', 'post-upsert', 'facebook-upsert', '', 'EVERYONE', 'source',
          1, 'review', ?, ?)
      `).bind(timestamp, timestamp),
    ]);

    const response = await runApi('POST', '/api/data/baiviet?on_conflict=id', {
      headers: authedHeaders(created),
      body: JSON.stringify({ id: 'facebook-upsert', tieu_de: 'Editor upsert title' }),
    });

    expect(response.status).toBe(200);
    await expect(env.DB.prepare(`
      SELECT source_managed, status, last_error_code FROM facebook_post_imports WHERE id = 'import-upsert'
    `).first()).resolves.toMatchObject({
      source_managed: 0, status: 'detached', last_error_code: 'article_modified',
    });
  });

  it('keeps the legacy same-origin anonymous view increment without opening generic writes', async () => {
    await seal();
    await env.DB.prepare(`
      INSERT INTO baiviet (id, tieu_de, created_at, updated_at)
      VALUES ('anonymous-view', 'Lượt xem ẩn danh', ?, ?)
    `).bind(now(), now()).run();

    const response = await runApi('POST', '/api/data/luot_xem', {
      headers: {
        Origin: 'https://quangtu.vn',
        'Sec-Fetch-Site': 'same-origin',
        'X-CSRF-Token': 'public',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ bai_viet_id: 'anonymous-view' }),
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([
      expect.objectContaining({ bai_viet_id: 'anonymous-view', so_luot: 1 }),
    ]);

    const crossOrigin = await runApi('POST', '/api/data/luot_xem', {
      headers: {
        Origin: 'https://evil.example',
        'Sec-Fetch-Site': 'cross-site',
        'X-CSRF-Token': 'public',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ bai_viet_id: 'anonymous-view' }),
    });
    expect(crossOrigin.status).toBe(403);
    await expect(crossOrigin.json()).resolves.toMatchObject({ error: { code: 'invalid_origin' } });

    const denied = await runApi('POST', '/api/data/baiviet', {
      headers: {
        Origin: 'https://quangtu.vn',
        'Sec-Fetch-Site': 'same-origin',
        'X-CSRF-Token': 'public',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id: 'anonymous-write', tieu_de: 'Không được phép' }),
    });
    expect(denied.status).toBe(401);
    await expect(denied.json()).resolves.toMatchObject({
      error: { code: 'authentication_required' },
    });
  });

  // Approved UGC security contract: legacy write shapes remain supported, but
  // anonymous creation is no longer allowed to bypass authenticated moderation.
  it('rejects anonymous legacy comments without writing any comment', async () => {
    await seal();
    const timestamp = now();
    await env.DB.prepare(`
      INSERT INTO baiviet (id, tieu_de, created_at, updated_at)
      VALUES ('anonymous-comment', 'Bình luận ẩn danh', ?, ?)
    `).bind(timestamp, timestamp).run();

    const response = await runApi('POST', '/api/data/binh_luan', {
      headers: {
        Origin: 'https://quangtu.vn',
        'Sec-Fetch-Site': 'same-origin',
        'X-CSRF-Token': 'public',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: 987654,
        bai_viet_id: 'anonymous-comment',
        ten: 'Phật tử',
        dien_thoai: '0900000000',
        email: 'phattu@example.test',
        noi_dung: 'Nam mô A Di Đà Phật',
        tao_luc: '1999-01-01T00:00:00.000Z',
      }),
    });
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'authentication_required' } });
    expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM binh_luan').first()).toEqual({ count: 0 });
    expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM ugc_public_profiles').first()).toEqual({ count: 0 });
  });

  it('accepts authenticated legacy comment shapes as server-owned pending submissions and filters reloads', async () => {
    await seal();
    const created = await createAppSession('legacy-comment-owner', 'user');
    await env.DB.prepare("INSERT INTO baiviet (id, tieu_de) VALUES ('legacy-pending-comment', 'Book')").run();
    const before = Date.now();
    const response = await runApi('POST', '/api/data/binh_luan', {
      headers: authedHeaders(created),
      body: JSON.stringify({ id: 987654, bai_viet_id: 'legacy-pending-comment', ten: 'Forged admin',
        email: 'forged@example.test', dien_thoai: '0900000000', noi_dung: 'Nam mô A Di Đà Phật',
        author_user_id: 'another-owner', moderation_status: 'approved', tao_luc: '1999-01-01T00:00:00.000Z' }),
    });
    const after = Date.now();
    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(payload).toEqual([expect.objectContaining({ bai_viet_id: 'legacy-pending-comment',
      ten: 'legacy-comment-owner', noi_dung: 'Nam mô A Di Đà Phật', moderationStatus: 'pending' })]);
    expect(payload[0].id).not.toBe(987654);
    expect(payload[0]).not.toHaveProperty('email');
    expect(Date.parse(payload[0].tao_luc)).toBeGreaterThanOrEqual(before);
    expect(Date.parse(payload[0].tao_luc)).toBeLessThanOrEqual(after);
    expect(await env.DB.prepare('SELECT author_user_id, moderation_status, tao_luc FROM binh_luan WHERE id = ?')
      .bind(payload[0].id).first()).toEqual({ author_user_id: 'legacy-comment-owner', moderation_status: 'pending', tao_luc: payload[0].tao_luc });
    const publicReload = await runApi('GET', '/api/articles/legacy-pending-comment/comments');
    expect(publicReload.status).toBe(200);
    await expect(publicReload.json()).resolves.toEqual([]);
    const ownReload = await runApi('GET', '/api/articles/legacy-pending-comment/comments?includeOwn=1', { headers: authedHeaders(created) });
    expect(ownReload.status).toBe(200);
    await expect(ownReload.json()).resolves.toEqual([expect.objectContaining({ id: payload[0].id, moderationStatus: 'pending' })]);
  });

  it('preserves safe collection filters, upsert keys and legacy 200 statuses on resource routes', async () => {
    await seal();
    const created = await createAppSession('ctv-resource', 'ctv');
    const timestamp = now();
    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO baiviet (id, tieu_de, danh_muc, trang_thai, created_at, updated_at)
        VALUES ('article-filter-a', 'A', 'KINH ĐIỂN', 'Hoàn thành', ?, ?)
      `).bind(timestamp, timestamp),
      env.DB.prepare(`
        INSERT INTO baiviet (id, tieu_de, danh_muc, trang_thai, created_at, updated_at)
        VALUES ('article-filter-b', 'B', 'CHUYỆN NHÂN QUẢ', 'Hoàn thành', ?, ?)
      `).bind(timestamp, timestamp),
      env.DB.prepare(`
        INSERT INTO phap_thoai (id, tieu_de, chu_de, tracks, visibility, created_at)
        VALUES ('talk-filter-a', 'Kinh A', 'Kinh điển', '[]', 'public', ?)
      `).bind(timestamp),
      env.DB.prepare(`
        INSERT INTO phap_thoai (id, tieu_de, chu_de, tracks, visibility, created_at)
        VALUES ('talk-filter-b', 'Pháp ngữ B', 'Pháp ngữ', '[]', 'public', ?)
      `).bind(timestamp),
    ]);

    const articles = await runApi('GET', '/api/articles?danh_muc=eq.KINH%20%C4%90I%E1%BB%82N&select=id,tieu_de');
    expect(articles.status).toBe(200);
    await expect(articles.json()).resolves.toEqual([
      expect.objectContaining({ id: 'article-filter-a', tieu_de: 'A' }),
    ]);

    const talks = await runApi('GET', '/api/talks?chu_de=eq.Kinh%20%C4%91i%E1%BB%83n&select=id,tieu_de');
    expect(talks.status).toBe(200);
    await expect(talks.json()).resolves.toEqual([
      expect.objectContaining({ id: 'talk-filter-a', tieu_de: 'Kinh A' }),
    ]);

    const articleUpsert = await runApi('POST', '/api/articles?on_conflict=id', {
      headers: authedHeaders(created),
      body: JSON.stringify({ id: 'article-filter-a', tieu_de: 'A đã cập nhật', danh_muc: 'KINH ĐIỂN' }),
    });
    expect(articleUpsert.status).toBe(200);
    await expect(articleUpsert.json()).resolves.toEqual([
      expect.objectContaining({ id: 'article-filter-a', tieu_de: 'A đã cập nhật' }),
    ]);
    await expect(env.DB.prepare(
      "SELECT tieu_de FROM baiviet WHERE id = 'article-filter-a'",
    ).first()).resolves.toMatchObject({ tieu_de: 'A đã cập nhật' });

    const talkUpsert = await runApi('POST', '/api/talks', {
      headers: { ...authedHeaders(created), 'X-Upsert-Key': 'id' },
      body: JSON.stringify({
        id: 'talk-filter-a', tieu_de: 'Kinh A đã cập nhật', chu_de: 'Kinh điển',
        dien_gia: 'Thầy Minh', tracks: [],
      }),
    });
    expect(talkUpsert.status).toBe(200);
    await expect(talkUpsert.json()).resolves.toEqual([
      expect.objectContaining({ id: 'talk-filter-a', tieu_de: 'Kinh A đã cập nhật', dien_gia: 'Thầy Minh' }),
    ]);
    const legacySpeaker = await runApi(
      'GET',
      '/api/data/phap_thoai?id=eq.talk-filter-a&select=id,dien_gia',
    );
    expect(legacySpeaker.status).toBe(200);
    await expect(legacySpeaker.json()).resolves.toEqual([
      { id: 'talk-filter-a', dien_gia: 'Thầy Minh' },
    ]);

    const legacyAudioLibrary = await runApi('POST', '/api/data/pt_player_sync?on_conflict=id', {
      headers: authedHeaders(created),
      body: JSON.stringify({
        id: 'attacker-controlled',
        pt_favorite_albums: [{ albumId: 'album-a', savedAt: 10 }],
        pt_listen_later_albums: [{ albumId: 'album-b', savedAt: 20 }],
      }),
    });
    expect(legacyAudioLibrary.status).toBe(200);
    await expect(legacyAudioLibrary.json()).resolves.toEqual([
      expect.objectContaining({
        id: 'google_ctv-resource',
        pt_favorite_albums: [{ albumId: 'album-a', savedAt: 10 }],
        pt_listen_later_albums: [{ albumId: 'album-b', savedAt: 20 }],
      }),
    ]);
  });

  it('enforces parent article visibility on canonical and legacy chapter reads', async () => {
    await seal();
    const timestamp = now();
    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO baiviet (id, tieu_de, trang_thai, created_at, updated_at)
        VALUES ('chapter-public-parent', 'Bài công khai', 'Hoàn thành', ?, ?)
      `).bind(timestamp, timestamp),
      env.DB.prepare(`
        INSERT INTO baiviet (id, tieu_de, trang_thai, created_at, updated_at)
        VALUES ('chapter-draft-parent', 'Bài nội bộ', 'Đang cập nhật', ?, ?)
      `).bind(timestamp, timestamp),
      env.DB.prepare(`
        INSERT INTO tap_noi_dung (bai_viet_id, so_thu_tu, tieu_de, noi_dung, updated_at)
        VALUES ('chapter-public-parent', 1, 'Chương công khai', 'Nội dung công khai', ?)
      `).bind(timestamp),
      env.DB.prepare(`
        INSERT INTO tap_noi_dung (bai_viet_id, so_thu_tu, tieu_de, noi_dung, updated_at)
        VALUES ('chapter-draft-parent', 1, 'Chương bí mật', 'Nội dung bí mật', ?)
      `).bind(timestamp),
    ]);

    const publicChapters = await runApi(
      'GET',
      '/api/articles/chapter-public-parent/chapters?select=bai_viet_id,tieu_de,noi_dung',
    );
    await expect(publicChapters.json()).resolves.toEqual([
      expect.objectContaining({ bai_viet_id: 'chapter-public-parent', tieu_de: 'Chương công khai' }),
    ]);

    const hiddenCanonical = await runApi(
      'GET',
      '/api/articles/chapter-draft-parent/chapters?select=bai_viet_id,tieu_de,noi_dung',
    );
    await expect(hiddenCanonical.json()).resolves.toEqual([]);
    const hiddenLegacy = await runApi(
      'GET',
      '/api/data/tap_noi_dung?bai_viet_id=eq.chapter-draft-parent&select=bai_viet_id,tieu_de,noi_dung',
    );
    await expect(hiddenLegacy.json()).resolves.toEqual([]);

    const ctv = await createAppSession('chapter-ctv', 'ctv');
    const internalChapters = await runApi(
      'GET',
      '/api/articles/chapter-draft-parent/chapters?select=bai_viet_id,tieu_de,noi_dung',
      { headers: authedHeaders(ctv) },
    );
    await expect(internalChapters.json()).resolves.toEqual([
      expect.objectContaining({ bai_viet_id: 'chapter-draft-parent', tieu_de: 'Chương bí mật' }),
    ]);
  });

  it('does not emit draft article or private talk metadata into anonymous HTML', async () => {
    const timestamp = now();
    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO baiviet (id, tieu_de, tom_tat, trang_thai, created_at, updated_at)
        VALUES ('preview-draft', 'Tiêu đề bài bí mật', 'Tóm tắt bài bí mật', 'Đang cập nhật', ?, ?)
      `).bind(timestamp, timestamp),
      env.DB.prepare(`
        INSERT INTO baiviet (id, tieu_de, tom_tat, trang_thai, created_at, updated_at)
        VALUES ('preview-public', 'Tiêu đề bài công khai', 'Tóm tắt bài công khai', 'Hoàn thành', ?, ?)
      `).bind(timestamp, timestamp),
      env.DB.prepare(`
        INSERT INTO phap_thoai (id, tieu_de, mo_ta, visibility, created_at)
        VALUES ('preview-private-talk', 'Pháp thoại bí mật', 'Mô tả bí mật', 'private', ?)
      `).bind(timestamp),
    ]);
    const renderPreview = async (path) => {
      const request = new Request(`https://quangtu.vn${path}`);
      const response = await hookHandle({
        event: { request, locals: {}, platform: { env: sealedEnv() } },
        resolve: async (_event, options) => {
          const html = '<html><head><title>Quang Từ</title><meta name="description" content="Mặc định"><meta property="og:title" content="Quang Từ"><meta property="og:description" content="Mặc định"></head><body></body></html>';
          return new Response(await options.transformPageChunk({ html }));
        },
      });
      return response.text();
    };

    const draftHtml = await renderPreview('/?article=preview-draft');
    expect(draftHtml).not.toContain('Tiêu đề bài bí mật');
    expect(draftHtml).not.toContain('Tóm tắt bài bí mật');
    const privateTalkHtml = await renderPreview('/phap-thoai?album=preview-private-talk');
    expect(privateTalkHtml).not.toContain('Pháp thoại bí mật');
    expect(privateTalkHtml).not.toContain('Mô tả bí mật');
    const publicHtml = await renderPreview('/?article=preview-public');
    expect(publicHtml).toContain('Tiêu đề bài công khai');
    expect(publicHtml).toContain('Tóm tắt bài công khai');
  });

  it('preserves legacy HttpInputError 5xx code and message at the SvelteKit boundary', async () => {
    await seal();
    const created = await createAppSession('admin-drive-error', 'admin');
    const response = await runApi('POST', '/api/admin/talks/drive-scan', {
      headers: authedHeaders(created),
      body: JSON.stringify({ dryRun: true }),
    });
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'drive_credentials_missing',
        message: 'Thiếu cấu hình Service Account.',
      },
    });
  });

  it('rejects guest and ctv dashboard access while serving admin analytics', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-06T12:00:10.000Z'));
    try {
      await seal();
      await seedAdminDashboardAnalytics();
      await seedAdminAnalyticsPageviews();
      await seedAdminCommunityRanking();

      const guest = await runApi('GET', '/api/admin/dashboard');
      expect(guest.status).toBe(401);
      await expect(guest.json()).resolves.toMatchObject({
        error: { code: 'authentication_required' },
      });

      const ctv = await runApi('GET', '/api/admin/dashboard', {
        headers: authedHeaders(await createAppSession('dashboard-ctv', 'ctv')),
      });
      expect(ctv.status).toBe(403);
      await expect(ctv.json()).resolves.toMatchObject({
        error: { code: 'forbidden' },
      });

      const adminSession = await createAppSession('dashboard-admin', 'admin');
      const admin = await runApi('GET', '/api/admin/dashboard', {
        headers: authedHeaders(adminSession),
      });
      expect(admin.status).toBe(200);
      const adminPayload = await admin.json();
      expect(adminPayload).toMatchObject({
        content: { articles: 3, pdfs: 1, privateTalks: 1, publicTalks: 1, rituals: 1, sutras: 1, talks: 2 },
        engagement: { articleViews: 37, comments: 1 },
        members: { admins: 1, collaborators: 1, members: 6, users: 4 },
        onlineVisitorCount: 0,
        onlineVisitors: [],
        range: '28d',
        system: { analyticsAvailable: true, mediaConfigured: true, presenceEnabled: false },
        traffic: { rangeVisitors: 4, today: 2, thisMonth: 3, thisYear: 5 },
      });
      const serializedPayload = JSON.stringify(adminPayload);
      for (const forbiddenKey of ['visitor_id_hash', 'network_hash', 'principal_id', 'rawUserAgent', 'sessionId', 'clientAddress']) {
        expect(serializedPayload).not.toContain(forbiddenKey);
      }

      const analyticsGuest = await runApi('GET', '/api/admin/analytics?range=7d');
      expect(analyticsGuest.status).toBe(401);
      await expect(analyticsGuest.json()).resolves.toMatchObject({
        error: { code: 'authentication_required' },
      });

      const analyticsCtv = await runApi('GET', '/api/admin/analytics?range=7d', {
        headers: authedHeaders(await createAppSession('analytics-ctv', 'ctv')),
      });
      expect(analyticsCtv.status).toBe(403);
      await expect(analyticsCtv.json()).resolves.toMatchObject({
        error: { code: 'forbidden' },
      });

      const adminAnalytics = await runApi('GET', '/api/admin/analytics?range=7d', {
        headers: authedHeaders(adminSession),
      });
      expect(adminAnalytics.status).toBe(200);
      const analyticsPayload = await adminAnalytics.json();
      expect(analyticsPayload).toMatchObject({
        available: true,
        metrics: {
          averageDurationSeconds: 360,
          bounceRate: 66.7,
          pageviews: 5,
          uniqueVisitors: 3,
          viewsPerVisit: 1.67,
          visits: 3,
        },
        range: '7d',
        sources: [
          { label: 'Google', visits: 2, visitors: 2 },
          { label: 'Trực tiếp', visits: 1, visitors: 1 },
        ],
        topPages: [
          { label: '/admin', pageviews: 2, visitors: 2 },
          { label: '/tu-tap', pageviews: 2, visitors: 2 },
          { label: '/phap-thoai', pageviews: 1, visitors: 1 },
        ],
      });
      expect(analyticsPayload.daily.at(-1)).toMatchObject({
        averageDurationSeconds: 360,
        bounceRate: 66.7,
        pageviews: 5,
        visitors: 3,
        visits: 3,
        viewsPerVisit: 1.67,
      });
      const analyticsSerialized = JSON.stringify(analyticsPayload);
      for (const forbiddenKey of ['pageview_id_hash', 'session_id_hash', 'visitor_id_hash', 'network_hash', 'clientAddress', 'rawReferrer', 'referrer_url', 'sessionId']) {
        expect(analyticsSerialized).not.toContain(forbiddenKey);
      }

      const annualAnalytics = await runApi('GET', '/api/admin/analytics?range=365d', {
        headers: authedHeaders(adminSession),
      });
      expect(annualAnalytics.status).toBe(200);
      const annualPayload = await annualAnalytics.json();
      expect(annualPayload).toMatchObject({ interval: 'month', range: '365d' });
      expect(annualPayload.daily).toHaveLength(12);
      expect(annualPayload.daily[0].date).toBe('2025-08-01');
      expect(annualPayload.daily.at(-1).date).toBe('2026-07-01');

      const yearAnalytics = await runApi('GET', '/api/admin/analytics?range=year', {
        headers: authedHeaders(adminSession),
      });
      expect(yearAnalytics.status).toBe(200);
      const yearPayload = await yearAnalytics.json();
      expect(yearPayload).toMatchObject({ interval: 'month', range: 'year' });
      expect(yearPayload.daily).toHaveLength(8);
      expect(yearPayload.daily[0].date).toBe('2026-01-01');
      expect(yearPayload.daily.at(-1).date).toBe('2026-08-01');

      const communityGuest = await runApi('GET', '/api/admin/community?period=month');
      expect(communityGuest.status).toBe(401);
      await expect(communityGuest.json()).resolves.toMatchObject({
        error: { code: 'authentication_required' },
      });

      const communityCtv = await runApi('GET', '/api/admin/community?period=month', {
        headers: authedHeaders(await createAppSession('community-ctv', 'ctv')),
      });
      expect(communityCtv.status).toBe(403);
      await expect(communityCtv.json()).resolves.toMatchObject({
        error: { code: 'forbidden' },
      });

      const adminCommunity = await runApi('GET', '/api/admin/community?period=month', {
        headers: authedHeaders(adminSession),
      });
      expect(adminCommunity.status).toBe(200);
      const communityPayload = await adminCommunity.json();
      expect(communityPayload).toMatchObject({
        online: { members: 0, guests: 0, internal: 0, total: 0, visitors: [] },
        period: 'month',
        ranking: [
          { activeDays: 3, displayName: 'Người chăm', logCount: 3, rank: 1, streak: 3, totalsByType: [{ count: 6, type: 'niệm Phật' }] },
          { activeDays: 2, displayName: 'Bậc tu', logCount: 3, rank: 2, streak: 2 },
          { activeDays: 2, displayName: 'Xếp sau', logCount: 2, rank: 3, streak: 2, totalsByType: [{ count: 2, type: 'thiền' }] },
        ],
      });
      expect(communityPayload.ranking[1].totalsByType).toEqual(expect.arrayContaining([
        { count: 4, type: 'thiền' },
        { count: 1, type: 'tụng kinh' },
      ]));
      expect(communityPayload.ranking[1].totalsByType).toHaveLength(2);
      const communitySerialized = JSON.stringify(communityPayload);
      for (const forbiddenKey of ['internalId', 'note', 'network_hash', 'visitor_id_hash', 'sessionId']) {
        expect(communitySerialized).not.toContain(forbiddenKey);
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects multipart media uploads before body buffering', async () => {
    await seal();
    const created = await createAppSession('ctv-upload', 'ctv');
    const form = new FormData();
    form.set('folder', 'covers');
    form.set('file', new File(['hello'], 'cover.jpg', { type: 'image/jpeg' }));
    const response = await runApi('POST', '/api/media', {
      headers: {
        Cookie: created.cookie.split(';', 1)[0],
        Origin: 'https://quangtu.vn',
        'Sec-Fetch-Site': 'same-origin',
        'X-CSRF-Token': created.csrfToken,
        'Idempotency-Key': 'multipart-test',
      },
      body: form,
    });
    expect(response.status).toBe(415);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'multipart_unsupported' },
    });
  });

  it('accepts the raw admin upload contract and persists the verified object', async () => {
    await seal();
    const created = await createAppSession('admin-upload', 'admin');
    const bytes = new TextEncoder().encode('safe-image-bytes');
    const digest = toBase64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)));
    const response = await runApi('POST', '/api/media', {
      headers: {
        ...authedHeaders(created),
        'Content-Type': 'image/jpeg',
        'Content-Length': String(bytes.byteLength),
        'Idempotency-Key': 'raw-upload-test',
        'X-Content-SHA256': digest,
        'X-File-Name': encodeURIComponent('ảnh bìa.jpg'),
        'X-Media-Prefix': 'covers',
      },
      body: bytes,
    });
    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(payload).toMatchObject({ status: 'applied', byteSize: bytes.byteLength });
    expect(payload.objectKey).toMatch(/^covers\/[A-Za-z0-9-]+-anh-bia\.jpg$/u);
    expect(await env.MEDIA.head(payload.objectKey)).not.toBeNull();
  });

  it('routes legacy article deletion through durable media cleanup', async () => {
    await seal();
    const created = await createAppSession('admin-delete', 'admin');
    const timestamp = now();
    await env.DB.prepare(`
      INSERT INTO media_objects
        (object_key, source_path, byte_size, sha256, content_type, cache_control, baseline, created_at)
      VALUES ('covers/legacy-delete.jpg', 'covers/legacy-delete.jpg', 4, 'digest', 'image/jpeg', 'public', 0, ?)
    `).bind(timestamp).run();
    await env.DB.prepare(`
      INSERT INTO baiviet (id, tieu_de, anh_url, created_at, updated_at)
      VALUES ('legacy-delete', 'Legacy delete', '/api/media/covers/legacy-delete.jpg', ?, ?)
    `).bind(timestamp, timestamp).run();
    await env.DB.prepare(`
      INSERT INTO facebook_post_imports
        (id, facebook_post_id, article_id, permalink_url, privacy, source_content_hash,
          source_managed, status, created_at, updated_at)
      VALUES ('import-legacy-delete', 'post-legacy-delete', 'legacy-delete',
        'https://www.facebook.com/example/posts/legacy-delete', 'EVERYONE', 'source-hash',
        1, 'published', ?, ?)
    `).bind(timestamp, timestamp).run();

    const response = await runApi('DELETE', '/api/data/baiviet?id=eq.legacy-delete', {
      headers: authedHeaders(created),
    });
    expect(response.status).toBe(200);
    await expect(env.DB.prepare(
      "SELECT status FROM article_media_cleanup_queue WHERE article_id = 'legacy-delete'",
    ).first()).resolves.toMatchObject({ status: 'tombstoned' });
    await expect(env.DB.prepare(
      "SELECT deleted_at FROM media_objects WHERE object_key = 'covers/legacy-delete.jpg'",
    ).first()).resolves.toMatchObject({ deleted_at: expect.any(String) });
    await expect(env.DB.prepare(`
      SELECT article_id, source_managed, status, last_error_code
      FROM facebook_post_imports WHERE id = 'import-legacy-delete'
    `).first()).resolves.toMatchObject({
      article_id: null,
      last_error_code: 'article_deleted',
      source_managed: 1,
      status: 'failed',
    });
  });

  it('atomically records every managed import deleted through legacy article filters', async () => {
    await seal();
    const created = await createAppSession('admin-facebook-filter-delete', 'admin');
    const timestamp = now();
    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO baiviet (id, tieu_de, danh_muc, created_at, updated_at) VALUES
          ('facebook-filter-delete-a', 'Delete A', 'DELETE_FILTER', ?, ?),
          ('facebook-filter-delete-b', 'Delete B', 'DELETE_FILTER', ?, ?),
          ('facebook-filter-delete-other', 'Keep', 'OTHER', ?, ?)
      `).bind(timestamp, timestamp, timestamp, timestamp, timestamp, timestamp),
      env.DB.prepare(`
        INSERT INTO facebook_post_imports
          (id, facebook_post_id, article_id, permalink_url, privacy, source_content_hash,
            source_managed, status, created_at, updated_at) VALUES
          ('import-filter-delete-a', 'post-filter-delete-a', 'facebook-filter-delete-a', '', 'EVERYONE', 'source-a', 1, 'review', ?, ?),
          ('import-filter-delete-b', 'post-filter-delete-b', 'facebook-filter-delete-b', '', 'EVERYONE', 'source-b', 1, 'published', ?, ?),
          ('import-filter-delete-other', 'post-filter-delete-other', 'facebook-filter-delete-other', '', 'EVERYONE', 'source-other', 1, 'review', ?, ?)
      `).bind(timestamp, timestamp, timestamp, timestamp, timestamp, timestamp),
    ]);

    const noMatch = await runApi(
      'DELETE',
      '/api/data/baiviet?id=eq.facebook-filter-delete-other&danh_muc=eq.DELETE_FILTER',
      { headers: authedHeaders(created) },
    );
    expect(noMatch.status).toBe(200);
    await expect(env.DB.prepare(`
      SELECT source_managed, status FROM facebook_post_imports WHERE id = 'import-filter-delete-other'
    `).first()).resolves.toMatchObject({ source_managed: 1, status: 'review' });

    const response = await runApi('DELETE', '/api/data/baiviet?danh_muc=eq.DELETE_FILTER', {
      headers: authedHeaders(created),
    });

    expect(response.status).toBe(200);
    await expect(env.DB.prepare(`
      SELECT id FROM baiviet WHERE danh_muc = 'DELETE_FILTER'
    `).all()).resolves.toMatchObject({ results: [] });
    await expect(env.DB.prepare(`
      SELECT id, article_id, source_managed, status, last_error_code
      FROM facebook_post_imports ORDER BY id
    `).all()).resolves.toMatchObject({ results: [
      { id: 'import-filter-delete-a', article_id: null, source_managed: 1, status: 'failed', last_error_code: 'article_deleted' },
      { id: 'import-filter-delete-b', article_id: null, source_managed: 1, status: 'failed', last_error_code: 'article_deleted' },
      { id: 'import-filter-delete-other', article_id: 'facebook-filter-delete-other', source_managed: 1, status: 'review', last_error_code: null },
    ] });
  });

  it('uses a provider-neutral account error for provider-independent app features', async () => {
    const response = await apiGet({
      request: new Request('https://quangtu.vn/api/practice/summary'),
      params: { path: 'practice/summary' },
      locals: {
        env: sealedEnv(), migrationSealed: true, requestId: 'provider-neutral-account',
        session: {
          id: 'legacy-session', userId: 'legacy-user', appUserId: '', email: null,
          displayName: 'Legacy User', avatarUrl: null, role: 'user', expiresAt: '2027-01-01',
          csrfToken: 'csrf', rawToken: 'raw', identityId: null, authProvider: 'facebook',
        },
      },
      platform: { env: sealedEnv() },
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'account_required', message: 'Cần tài khoản người dùng.' },
    });
  });

  it('accepts a validated Archive.org import, rejects loose archive URLs, and preserves legacy rows', async () => {
    await seal();
    const created = await createAppSession('ctv-talks', 'ctv');
    const archiveTrack = { title: 'Archive', url: 'https://archive.org/download/talk-a.mp3' };
    const resourceCreate = await runApi('POST', '/api/talks', {
      headers: authedHeaders(created),
      body: JSON.stringify({ id: 'talk-archive', tieu_de: 'Archive', tracks: [archiveTrack] }),
    });
    expect(resourceCreate.status).toBe(400);
    await expect(resourceCreate.json()).resolves.toMatchObject({
      error: { code: 'invalid_track_url' },
    });

    const structuredImport = await runApi('POST', '/api/talks', {
      headers: authedHeaders(created),
      body: JSON.stringify({
        id: 'talk-archive-import',
        tieu_de: 'Archive import',
        archive_id: 'talk-a',
        tracks: [{ title: 'Bài 1', url: 'https://archive.org/download/talk-a/01.mp3' }],
      }),
    });
    expect(structuredImport.status).toBe(200);
    await expect(structuredImport.json()).resolves.toEqual([
      expect.objectContaining({ id: 'talk-archive-import', archive_id: 'talk-a' }),
    ]);

    const legacyCreate = await runApi('POST', '/api/data/phap_thoai', {
      headers: authedHeaders(created),
      body: JSON.stringify({ id: 'talk-archive-legacy', tieu_de: 'Archive', tracks: [archiveTrack] }),
    });
    expect(legacyCreate.status).toBe(400);
    await expect(legacyCreate.json()).resolves.toMatchObject({
      error: { code: 'invalid_track_url' },
    });

    await env.DB.prepare(`
      INSERT INTO phap_thoai (id, tieu_de, tracks, visibility, created_at)
      VALUES ('legacy-talk', 'Legacy', ?, 'public', ?)
    `).bind(
      JSON.stringify([archiveTrack]),
      '2026-07-31T00:00:00.000Z',
    ).run();
    const unchangedPatch = await runApi('PATCH', '/api/talks/legacy-talk', {
      headers: authedHeaders(created),
      body: JSON.stringify({ tracks: [archiveTrack] }),
    });
    expect(unchangedPatch.status).toBe(200);
    await expect(unchangedPatch.json()).resolves.toEqual([]);

    const unchangedUpsert = await runApi('POST', '/api/talks?on_conflict=id', {
      headers: authedHeaders(created),
      body: JSON.stringify({
        id: 'legacy-talk',
        tieu_de: 'Legacy upsert',
        archive_id: '',
        tracks: [archiveTrack],
      }),
    });
    expect(unchangedUpsert.status).toBe(200);
    await expect(unchangedUpsert.json()).resolves.toEqual([
      expect.objectContaining({ id: 'legacy-talk', tieu_de: 'Legacy upsert' }),
    ]);

    const introducedPatch = await runApi('PATCH', '/api/talks/legacy-talk', {
      headers: authedHeaders(created),
      body: JSON.stringify({
        tracks: [{ title: 'Archive', url: 'https://archive.org/download/talk-b.mp3' }],
      }),
    });
    expect(introducedPatch.status).toBe(400);
    await expect(introducedPatch.json()).resolves.toMatchObject({
      error: { code: 'invalid_track_url' },
    });

    const introducedArchiveId = await runApi('PATCH', '/api/talks/legacy-talk', {
      headers: authedHeaders(created),
      body: JSON.stringify({ archive_id: 'new-archive-source' }),
    });
    expect(introducedArchiveId.status).toBe(400);
    await expect(introducedArchiveId.json()).resolves.toMatchObject({
      error: { code: 'archive_source_unsupported' },
    });
  });

  describe('legacy manual practice compatibility', () => {
    const historical = [{ id: 1, date: '2026-08-01', type: 'Tụng kinh', count: 2 }];
    const replacement = [{ id: 2, date: '2026-09-05', type: 'Tụng kinh', count: 999 }];
    const path = '/api/data/user_sync_data?on_conflict=id';

    async function ownerWithHistory() {
      await seal();
      const owner = await createAppSession('legacy-practice-owner', 'user');
      await env.DB.prepare(`
        INSERT INTO user_sync_data (id, practice_logs, bookmarks, listened_history, updated_at)
        VALUES ('legacy-practice-owner', ?, '[]', '[]', ?)
      `).bind(JSON.stringify(historical), now()).run();
      return owner;
    }

    it.each([
      ['POST upsert', 'POST', { practice_logs: replacement }],
      ['POST empty history', 'POST', { practice_logs: [] }],
      ['POST array', 'POST', [{ listened_history: ['must-not-partially-apply'] }, { practice_logs: replacement }]],
      ['PATCH', 'PATCH', { practice_logs: replacement }],
    ])('rejects %s before changing durable history when automatic practice is enabled', async (_label, method, payload) => {
      const owner = await ownerWithHistory();
      const before = await env.DB.prepare('SELECT * FROM user_sync_data WHERE id = ?').bind('legacy-practice-owner').first();
      const response = await runApi(method, path, {
        headers: authedHeaders(owner), body: JSON.stringify(payload),
        env: { AUTOMATIC_PRACTICE_ENABLED: 'true' },
      });
      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toMatchObject({ error: { code: 'legacy_practice_write_disabled' } });
      expect(await env.DB.prepare('SELECT * FROM user_sync_data WHERE id = ?').bind('legacy-practice-owner').first()).toEqual(before);
    });

    it('preserves historical GET and nonmanual POST/PATCH fields with the guard enabled', async () => {
      const owner = await ownerWithHistory();
      const beforeRead = await runApi('GET', path, {
        headers: authedHeaders(owner), env: { AUTOMATIC_PRACTICE_ENABLED: 'true' },
      });
      expect(beforeRead.status).toBe(200);
      await expect(beforeRead.json()).resolves.toEqual([expect.objectContaining({ practice_logs: historical })]);
      const bookmarks = [{ id: 'compatible-bookmark', scrollTop: 40 }];
      const posted = await runApi('POST', path, {
        headers: authedHeaders(owner), body: JSON.stringify({ id: 'ignored-owner', bookmarks }),
        env: { AUTOMATIC_PRACTICE_ENABLED: 'true' },
      });
      expect(posted.status).toBe(200);
      const patched = await runApi('PATCH', path, {
        headers: authedHeaders(owner), body: JSON.stringify({ listened_history: ['compatible-listen'] }),
        env: { AUTOMATIC_PRACTICE_ENABLED: 'true' },
      });
      expect(patched.status).toBe(200);
      const read = await runApi('GET', '/api/sync', {
        headers: authedHeaders(owner), env: { AUTOMATIC_PRACTICE_ENABLED: 'true' },
      });
      expect(read.status).toBe(200);
      await expect(read.json()).resolves.toMatchObject({ practice_logs: historical, bookmarks, listened_history: ['compatible-listen'] });
      expect(await env.DB.prepare('SELECT id FROM user_sync_data WHERE id = ?').bind('ignored-owner').first()).toBeNull();
    });

    it.each(['false', undefined])('retains prior POST/PATCH behavior when automatic practice is %s', async (flag) => {
      const owner = await ownerWithHistory();
      for (const [method, logs] of [['POST', replacement], ['PATCH', historical]]) {
        const response = await runApi(method, path, {
          headers: authedHeaders(owner), body: JSON.stringify({ practice_logs: logs }),
          env: { AUTOMATIC_PRACTICE_ENABLED: flag },
        });
        expect(response.status).toBe(200);
        const stored = await env.DB.prepare('SELECT practice_logs FROM user_sync_data WHERE id = ?').bind('legacy-practice-owner').first();
        expect(JSON.parse(stored.practice_logs)).toEqual(logs);
      }
    });

    it('enforces authentication and CSRF before the retired-field guard', async () => {
      const owner = await ownerWithHistory();
      const body = JSON.stringify({ practice_logs: replacement });
      const guest = await runApi('POST', path, {
        headers: { Origin: 'https://quangtu.vn', 'Content-Type': 'application/json' },
        body, env: { AUTOMATIC_PRACTICE_ENABLED: 'true' },
      });
      expect(guest.status).toBe(401);
      await expect(guest.json()).resolves.toMatchObject({ error: { code: 'authentication_required' } });
      const invalidCsrf = await runApi('PATCH', path, {
        headers: { ...authedHeaders(owner), 'X-CSRF-Token': 'invalid' },
        body, env: { AUTOMATIC_PRACTICE_ENABLED: 'true' },
      });
      expect(invalidCsrf.status).toBe(403);
      await expect(invalidCsrf.json()).resolves.toMatchObject({ error: { code: 'invalid_csrf' } });
      const stored = await env.DB.prepare('SELECT practice_logs FROM user_sync_data WHERE id = ?').bind('legacy-practice-owner').first();
      expect(JSON.parse(stored.practice_logs)).toEqual(historical);
    });
  });

  it('records automatic practice idempotently, derives evidence and isolates owners', async () => {
    await seal();
    const ownerA = await createAppSession('practice-owner-a', 'user');
    const ownerB = await createAppSession('practice-owner-b', 'user');
    const startedAt = new Date(Date.now() - 10 * 60_000).toISOString();
    const completedAt = new Date().toISOString();
    const startBody = {
      activityType: 'meditation',
      clientSessionId: 'meditation-session-a',
      idempotencyKey: 'meditation-start-a',
      sourceId: null,
      sourceKind: 'guided_meditation',
      startedAt,
      targetDurationSeconds: 600,
    };

    const unauthenticated = await runApi('POST', '/api/practice/sessions', {
      headers: { 'Content-Type': 'application/json', Origin: 'https://quangtu.vn' },
      body: JSON.stringify(startBody),
    });
    expect(unauthenticated.status).toBe(401);

    const invalidRosaryTarget = await runApi('POST', '/api/practice/sessions', {
      headers: authedHeaders(ownerA),
      body: JSON.stringify({
        activityType: 'rosary',
        clientSessionId: 'rosary-unsupported-target',
        idempotencyKey: 'rosary-unsupported-target',
        sourceId: 'Nam mô A Di Đà Phật',
        sourceKind: 'guided_rosary',
        startedAt: new Date().toISOString(),
        targetCount: 19,
      }),
    });
    expect(invalidRosaryTarget.status).toBe(400);
    await expect(invalidRosaryTarget.json()).resolves.toMatchObject({
      error: { code: 'invalid_rosary_target' },
    });

    const started = await runApi('POST', '/api/practice/sessions', {
      headers: authedHeaders(ownerA),
      body: JSON.stringify(startBody),
    });
    expect(started.status).toBe(201);
    await expect(started.json()).resolves.toMatchObject({
      created: true,
      session: { clientSessionId: 'meditation-session-a', status: 'active' },
    });

    const replay = await runApi('POST', '/api/practice/sessions', {
      headers: authedHeaders(ownerA),
      body: JSON.stringify(startBody),
    });
    expect(replay.status).toBe(200);
    await expect(replay.json()).resolves.toMatchObject({ created: false });

    await env.DB.prepare(`
      UPDATE practice_sessions SET created_at = ?
      WHERE owner_id = ? AND client_session_id = ?
    `).bind(startedAt, 'practice-owner-a', 'meditation-session-a').run();

    const crossOwner = await runApi('POST', '/api/practice/sessions/meditation-session-a/complete', {
      headers: authedHeaders(ownerB),
      body: JSON.stringify({
        completedAt,
        evidenceSummary: { activeSeconds: 480, clientElapsedSeconds: 600, hiddenSeconds: 120 },
      }),
    });
    expect(crossOwner.status).toBe(404);

    const completed = await runApi('POST', '/api/practice/sessions/meditation-session-a/complete', {
      headers: authedHeaders(ownerA),
      body: JSON.stringify({
        completedAt,
        evidenceSummary: { activeSeconds: 480, clientElapsedSeconds: 600, hiddenSeconds: 120 },
      }),
    });
    expect(completed.status).toBe(200);
    await expect(completed.json()).resolves.toMatchObject({
      completed: true,
      session: { acceptedDurationSeconds: 480, verificationResult: 'accepted' },
    });

    const completionReplay = await runApi('POST', '/api/practice/sessions/meditation-session-a/complete', {
      headers: authedHeaders(ownerA),
      body: JSON.stringify({
        completedAt,
        evidenceSummary: { activeSeconds: 480, clientElapsedSeconds: 600, hiddenSeconds: 120 },
      }),
    });
    await expect(completionReplay.json()).resolves.toMatchObject({ completed: false });

    const immediateStartedAt = new Date(Date.now() - 1_000).toISOString();
    const immediateStart = await runApi('POST', '/api/practice/sessions', {
      headers: authedHeaders(ownerA),
      body: JSON.stringify({
        activityType: 'meditation',
        clientSessionId: 'meditation-immediate-inflated',
        idempotencyKey: 'meditation-immediate-inflated',
        sourceId: null,
        sourceKind: 'guided_meditation',
        startedAt: immediateStartedAt,
        targetDurationSeconds: 900,
      }),
    });
    expect(immediateStart.status).toBe(201);
    const immediateCompletion = await runApi('POST', '/api/practice/sessions/meditation-immediate-inflated/complete', {
      headers: authedHeaders(ownerA),
      body: JSON.stringify({
        completedAt: new Date().toISOString(),
        evidenceSummary: { activeSeconds: 720, clientElapsedSeconds: 900, hiddenSeconds: 180 },
      }),
    });
    expect(immediateCompletion.status).toBe(200);
    await expect(immediateCompletion.json()).resolves.toMatchObject({
      completed: true,
      contributionsAdded: 0,
      session: {
        acceptedDurationSeconds: 0,
        verificationReason: 'server_elapsed_mismatch',
        verificationResult: 'implausible',
      },
    });

    const summary = await runApi('GET', '/api/practice/summary', { headers: authedHeaders(ownerA) });
    expect(summary.status).toBe(200);
    await expect(summary.json()).resolves.toMatchObject({
      totals: [expect.objectContaining({ activity_type: 'meditation', accepted_duration_seconds: 480 })],
    });
    const otherList = await runApi('GET', '/api/practice/sessions', { headers: authedHeaders(ownerB) });
    await expect(otherList.json()).resolves.toEqual({ sessions: [] });
  });

  it('keeps practice reads available while the automatic-write kill switch is off', async () => {
    await seal();
    const owner = await createAppSession('practice-disabled-owner', 'user');
    const denied = await runApi('POST', '/api/practice/sessions', {
      env: { AUTOMATIC_PRACTICE_ENABLED: 'false' },
      headers: authedHeaders(owner),
      body: JSON.stringify({
        activityType: 'rosary',
        clientSessionId: 'disabled-session',
        idempotencyKey: 'disabled-start',
        sourceId: 'Nam mô A Di Đà Phật',
        sourceKind: 'guided_rosary',
        startedAt: '2026-09-04T10:00:00.000Z',
        targetCount: 108,
      }),
    });
    expect(denied.status).toBe(503);
    await expect(denied.json()).resolves.toMatchObject({ error: { code: 'automatic_practice_disabled' } });

    const readable = await runApi('GET', '/api/practice/sessions', {
      env: { AUTOMATIC_PRACTICE_ENABLED: 'false' },
      headers: authedHeaders(owner),
    });
    expect(readable.status).toBe(200);
    await expect(readable.json()).resolves.toEqual({ sessions: [] });
  });

  it('disables public practice community exposure without blocking private progress', async () => {
    await seal();
    const owner = await createAppSession('practice-community-disabled-owner', 'user');
    const disabledEnv = { PRACTICE_COMMUNITY_ENABLED: 'false' };

    const privateProgress = await runApi('GET', '/api/practice/progress', {
      env: disabledEnv,
      headers: authedHeaders(owner),
    });
    expect(privateProgress.status).toBe(200);
    await expect(privateProgress.json()).resolves.toMatchObject({
      profile: { leaderboardOptIn: true, presenceOptIn: true },
    });

    await expect((await runApi('GET', '/api/practice/leaderboard', {
      env: disabledEnv,
    })).json()).resolves.toMatchObject({ enabled: false, ranking: [] });
    await expect((await runApi('GET', '/api/practice/campaigns', {
      env: disabledEnv,
    })).json()).resolves.toEqual({ enabled: false, campaigns: [] });

    const join = await runApi('POST', '/api/practice/campaigns/hidden-campaign/join', {
      env: disabledEnv,
      headers: authedHeaders(owner),
      body: '{}',
    });
    expect(join.status).toBe(503);
    await expect(join.json()).resolves.toMatchObject({
      error: { code: 'practice_community_disabled' },
    });
  });

  it('syncs reading progress and private annotations with causal and owner guards', async () => {
    await seal();
    const ownerA = await createAppSession('reading-owner-a', 'user');
    const ownerB = await createAppSession('reading-owner-b', 'user');
    const progress = {
      baseRevision: 0,
      clientUpdatedAt: now(),
      contentId: 'book-a',
      contentKind: 'pdf',
      contentVersion: 'v1',
      deviceId: 'device-a',
      deviceSequence: 1,
      epoch: 1,
      percent: 20,
      position: { page: 2 },
      total: 10,
    };
    const missingCsrfHeaders = authedHeaders(ownerA);
    delete missingCsrfHeaders['X-CSRF-Token'];
    const missingCsrf = await runApi('PUT', '/api/reading/progress', {
      headers: missingCsrfHeaders, body: JSON.stringify(progress),
    });
    expect(missingCsrf.status).toBe(403);
    await expect(missingCsrf.json()).resolves.toMatchObject({ error: { code: 'invalid_csrf' } });

    const saved = await runApi('PUT', '/api/reading/progress', {
      headers: authedHeaders(ownerA), body: JSON.stringify(progress),
    });
    expect(saved.status).toBe(200);
    await expect(saved.json()).resolves.toMatchObject({ progress: { revision: 1, percent: 20 } });
    await expect((await runApi('GET', '/api/reading/progress/pdf/book-a', {
      headers: authedHeaders(ownerB),
    })).json()).resolves.toEqual({ progress: null, tombstone: null });

    const stale = await runApi('PUT', '/api/reading/progress', {
      headers: authedHeaders(ownerA), body: JSON.stringify({ ...progress, deviceSequence: 2, percent: 90 }),
    });
    expect(stale.status).toBe(409);
    await expect(stale.json()).resolves.toMatchObject({
      error: {
        code: 'reading_progress_conflict',
        details: { current: { revision: 1, percent: 20 } },
      },
    });

    const removed = await runApi('DELETE', '/api/reading/progress', {
      headers: authedHeaders(ownerA),
      body: JSON.stringify({
        baseRevision: 1, contentId: 'book-a', contentKind: 'pdf',
        deviceId: 'device-a', deviceSequence: 2, epoch: 1,
      }),
    });
    expect(removed.status).toBe(200);
    await expect(removed.json()).resolves.toMatchObject({
      deleted: true,
      tombstone: { contentId: 'book-a', contentKind: 'pdf', epoch: 1, revision: 2 },
    });
    await expect((await runApi('GET', '/api/reading/progress/pdf/book-a', {
      headers: authedHeaders(ownerA),
    })).json()).resolves.toMatchObject({
      progress: null,
      tombstone: { epoch: 1, revision: 2 },
    });

    const recreated = await runApi('PUT', '/api/reading/progress', {
      headers: authedHeaders(ownerA),
      body: JSON.stringify({
        ...progress, baseRevision: 2, deviceSequence: 3, epoch: 2, percent: 5, position: { page: 1 },
      }),
    });
    expect(recreated.status).toBe(200);
    await expect(recreated.json()).resolves.toMatchObject({ progress: { epoch: 2, percent: 5, revision: 3 } });

    const annotationBody = {
      anchorStatus: 'active', color: 'yellow', contentId: 'book-a', contentKind: 'pdf',
      contentVersion: 'v1', contextAfter: 'sau', contextBefore: 'trước', id: 'quote-a',
      idempotencyKey: 'quote-key-a', locator: { page: 2, startOffset: 1, endOffset: 8 },
      note: 'ghi chú', quoteText: 'Lời dạy',
    };
    const annotation = await runApi('POST', '/api/reading/annotations', {
      headers: authedHeaders(ownerA), body: JSON.stringify(annotationBody),
    });
    expect(annotation.status).toBe(201);
    const created = await annotation.json();
    expect(created).toMatchObject({ created: true, annotation: { id: 'quote-a', color: 'yellow' } });
    await expect((await runApi('GET', '/api/reading/annotations/quote-a', {
      headers: authedHeaders(ownerA),
    })).json()).resolves.toMatchObject({ annotation: { id: 'quote-a', color: 'yellow' } });
    await expect((await runApi('GET', '/api/reading/annotations/quote-a', {
      headers: authedHeaders(ownerB),
    })).json()).resolves.toEqual({ annotation: null, tombstone: null });
    await expect((await runApi('GET', '/api/reading/annotations', {
      headers: authedHeaders(ownerB),
    })).json()).resolves.toEqual({ annotations: [], nextCursor: null });

    const updated = await runApi('PATCH', '/api/reading/annotations/quote-a', {
      headers: authedHeaders(ownerA),
      body: JSON.stringify({
        anchorStatus: 'orphaned', baseUpdatedAt: created.annotation.updatedAt, color: 'green',
        contentVersion: 'v2', locator: annotationBody.locator, note: 'ghi chú mới',
      }),
    });
    expect(updated.status).toBe(200);
    await expect(updated.json()).resolves.toMatchObject({
      annotation: { anchorStatus: 'orphaned', color: 'green', note: 'ghi chú mới' },
    });
    const crossDelete = await runApi('DELETE', '/api/reading/annotations/quote-a', {
      headers: authedHeaders(ownerB),
    });
    expect(crossDelete.status).toBe(404);
    const ownDelete = await runApi('DELETE', '/api/reading/annotations/quote-a', {
      headers: authedHeaders(ownerA),
    });
    expect(ownDelete.status).toBe(200);
    await expect((await runApi('GET', '/api/reading/annotations/quote-a', {
      headers: authedHeaders(ownerA),
    })).json()).resolves.toMatchObject({
      annotation: null,
      tombstone: { id: 'quote-a', deletedAt: expect.any(String), updatedAt: expect.any(String) },
    });
    await expect((await runApi('GET', '/api/reading/annotations/quote-a', {
      headers: authedHeaders(ownerB),
    })).json()).resolves.toEqual({ annotation: null, tombstone: null });
  });

  it('keeps practice progress private and gates campaigns by role and explicit opt-in', async () => {
    await seal();
    const owner = await createAppSession('community-owner', 'user');
    const admin = await createAppSession('community-admin', 'admin');
    const initial = await runApi('GET', '/api/practice/progress', { headers: authedHeaders(owner) });
    expect(initial.status).toBe(200);
    await expect(initial.json()).resolves.toMatchObject({
      profile: { leaderboardOptIn: true, presenceOptIn: true },
      heatmap: expect.arrayContaining([expect.objectContaining({ active: false })]),
    });
    const profile = await runApi('PATCH', '/api/practice/progress', {
      headers: authedHeaders(owner),
      body: JSON.stringify({
        leaderboardOptIn: true, presenceOptIn: true, selectedBadge: null,
        timeZone: 'Asia/Ho_Chi_Minh',
      }),
    });
    expect(profile.status).toBe(200);

    const forbiddenCampaign = await runApi('POST', '/api/practice/campaigns', {
      headers: authedHeaders(owner),
      body: JSON.stringify({
        title: 'Không được tạo', metric: 'sessions', goalValue: 10,
        startsAt: new Date(Date.now() - 60_000).toISOString(),
        endsAt: new Date(Date.now() + 3_600_000).toISOString(), status: 'active',
      }),
    });
    expect(forbiddenCampaign.status).toBe(403);
    const campaign = await runApi('POST', '/api/practice/campaigns', {
      headers: authedHeaders(admin),
      body: JSON.stringify({
        title: 'Cùng tinh tấn', description: 'Mục tiêu chung', metric: 'sessions', goalValue: 10,
        startsAt: new Date(Date.now() - 60_000).toISOString(),
        endsAt: new Date(Date.now() + 3_600_000).toISOString(), status: 'active',
      }),
    });
    expect(campaign.status).toBe(201);
    const campaignId = (await campaign.json()).campaign.id;
    const draftCampaign = await runApi('POST', '/api/practice/campaigns', {
      headers: authedHeaders(admin),
      body: JSON.stringify({
        title: 'Bản nháp', description: '', metric: 'sessions', goalValue: 5,
        startsAt: new Date(Date.now() - 60_000).toISOString(),
        endsAt: new Date(Date.now() + 3_600_000).toISOString(), status: 'draft',
      }),
    });
    const draftCampaignId = (await draftCampaign.json()).campaign.id;
    expect((await runApi('GET', '/api/practice/campaigns?includeDrafts=1', {
      headers: authedHeaders(owner),
    })).status).toBe(403);
    await expect((await runApi('GET', '/api/practice/campaigns?includeDrafts=1', {
      headers: authedHeaders(admin),
    })).json()).resolves.toMatchObject({
      campaigns: expect.arrayContaining([expect.objectContaining({ id: draftCampaignId, status: 'draft' })]),
    });
    const joined = await runApi('POST', `/api/practice/campaigns/${campaignId}/join`, {
      headers: authedHeaders(owner), body: JSON.stringify({}),
    });
    expect(joined.status).toBe(200);

    const practiceStartedAt = new Date(Date.now() - 10_000).toISOString();
    const practiceCompletedAt = new Date().toISOString();
    const startedPractice = await runApi('POST', '/api/practice/sessions', {
      headers: authedHeaders(owner),
      body: JSON.stringify({
        activityType: 'meditation', clientSessionId: 'campaign-session',
        idempotencyKey: 'campaign-session-start', startedAt: practiceStartedAt,
        sourceId: null, sourceKind: 'guided_meditation', targetDurationSeconds: 60,
      }),
    });
    expect(startedPractice.status).toBe(201);
    await env.DB.prepare(`
      UPDATE practice_sessions SET created_at = ?
      WHERE owner_id = ? AND client_session_id = ?
    `).bind(
      new Date(Date.now() - 60_000).toISOString(),
      'community-owner',
      'campaign-session',
    ).run();
    const completedPractice = await runApi('POST', '/api/practice/sessions/campaign-session/complete', {
      headers: authedHeaders(owner),
      body: JSON.stringify({
        completedAt: practiceCompletedAt,
        evidenceSummary: { activeSeconds: 48, clientElapsedSeconds: 60, hiddenSeconds: 12 },
      }),
    });
    await expect(completedPractice.json()).resolves.toMatchObject({
      completed: true, contributionsAdded: 1,
      session: { verificationResult: 'accepted' },
    });
    const replayedCompletion = await runApi('POST', '/api/practice/sessions/campaign-session/complete', {
      headers: authedHeaders(owner),
      body: JSON.stringify({
        completedAt: practiceCompletedAt,
        evidenceSummary: { activeSeconds: 48, clientElapsedSeconds: 60, hiddenSeconds: 12 },
      }),
    });
    await expect(replayedCompletion.json()).resolves.toMatchObject({ completed: false });

    const campaignListResponse = await runApi('GET', '/api/practice/campaigns', {
      headers: authedHeaders(owner),
    });
    const campaignList = await campaignListResponse.json();
    expect(campaignList).toMatchObject({
      campaigns: [expect.objectContaining({ id: campaignId, contributionValue: 1, joined: true })],
    });
    const contributedCampaign = campaignList.campaigns[0];
    const lockedDefinition = await runApi('PATCH', `/api/practice/campaigns/${campaignId}`, {
      headers: authedHeaders(admin),
      body: JSON.stringify({
        title: contributedCampaign.title,
        description: contributedCampaign.description,
        metric: 'duration_seconds',
        goalValue: 600,
        startsAt: contributedCampaign.startsAt,
        endsAt: contributedCampaign.endsAt,
        status: contributedCampaign.status,
      }),
    });
    expect(lockedDefinition.status).toBe(409);
    await expect(lockedDefinition.json()).resolves.toMatchObject({
      error: { code: 'campaign_definition_locked' },
    });
    const extendedEndsAt = new Date(Date.parse(contributedCampaign.endsAt) + 7 * 86_400_000).toISOString();
    const mutableCampaignEdit = await runApi('PATCH', `/api/practice/campaigns/${campaignId}`, {
      headers: authedHeaders(admin),
      body: JSON.stringify({
        title: 'Cùng tinh tấn — đã cập nhật',
        description: contributedCampaign.description,
        metric: contributedCampaign.metric,
        goalValue: 20,
        startsAt: contributedCampaign.startsAt,
        endsAt: extendedEndsAt,
        status: contributedCampaign.status,
      }),
    });
    expect(mutableCampaignEdit.status).toBe(200);
    await expect(mutableCampaignEdit.json()).resolves.toMatchObject({
      campaign: { title: 'Cùng tinh tấn — đã cập nhật', endsAt: extendedEndsAt, contributionValue: 0 },
    });
    // The public ranking requires an approved identity in addition to opt-in.
    // Keep approval local to this public projection assertion.
    await env.DB.prepare(`INSERT INTO ugc_public_profiles (
      public_id, owner_id, submitted_display_name, submitted_avatar_url,
      approved_display_name, approved_avatar_url, moderation_status, submitted_at, approved_revision
    ) SELECT 'fixture-community-owner', id, display_name, COALESCE(avatar_url, ''),
      display_name, COALESCE(avatar_url, ''), 'approved', ?, 1
      FROM app_users WHERE id = 'community-owner'
      ON CONFLICT(owner_id) DO UPDATE SET approved_display_name = excluded.approved_display_name,
        approved_avatar_url = excluded.approved_avatar_url, moderation_status = 'approved', approved_revision = ugc_public_profiles.approved_revision + 1`)
      .bind(now()).run();
    await expect((await runApi('GET', '/api/practice/leaderboard')).json()).resolves.toMatchObject({
      metric: { key: 'accepted_count', windowDays: 30 },
      ranking: [expect.objectContaining({ displayName: 'community-owner', activeDays: 1, sessions: 1 })],
    });
    const members = await runApi('GET', `/api/practice/campaigns/${campaignId}/members`, {
      headers: authedHeaders(admin),
    });
    expect(members.status).toBe(200);
    await expect(members.json()).resolves.toMatchObject({
      members: [expect.objectContaining({ ownerId: 'community-owner', identityVisible: true })],
    });
    const deletedDraft = await runApi('DELETE', `/api/practice/campaigns/${draftCampaignId}`, {
      headers: authedHeaders(admin),
    });
    expect(deletedDraft.status).toBe(200);
    await expect(deletedDraft.json()).resolves.toEqual({ deleted: true });
  });

  it('serves public album totals separately from album IDs and protects play writes', async () => {
    await seal();
    await env.DB.prepare("INSERT INTO phap_thoai (id,tieu_de,visibility) VALUES ('counted-album','Album','public'),('hidden-album','Hidden','private')").run();
    await env.DB.prepare("UPDATE phap_thoai SET tracks = ? WHERE id = 'counted-album'").bind(JSON.stringify([{ title: 'One', url: '/one.mp3' }])).run();
    const headers = { origin: 'https://quangtu.vn', 'x-csrf-token': 'public', 'content-type': 'application/json' };
    const body = JSON.stringify({ playbackId: crypto.randomUUID(), trackUrl: '/one.mp3' });
    expect((await runApi('POST', '/api/talks/counted-album/plays')).status).toBe(403);
    expect((await runApi('POST', '/api/talks/hidden-album/plays', { headers, body })).status).toBe(404);
    expect((await runApi('POST', '/api/talks/counted-album/plays', { headers, body: '{}' })).status).toBe(400);
    expect((await runApi('POST', '/api/talks/counted-album/plays', { headers, body })).status).toBe(200);
    expect((await runApi('POST', '/api/talks/counted-album/plays', { headers, body })).status).toBe(200);
    const response = await runApi('GET', '/api/album-plays');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([{ albumId: 'counted-album', playCount: 1 }]);
    expect((await runApi('POST', '/api/talks/counted-album/plays', { headers, body: JSON.stringify({ playbackId: crypto.randomUUID(), trackUrl: '/one.mp3' }) })).status).toBe(200);
    expect(await (await runApi('GET', '/api/album-plays')).json()).toEqual([{ albumId: 'counted-album', playCount: 2 }]);
  });


  it('keeps Meta deletion status public without disclosing unknown subjects', async () => {
    await seal();

    const response = await runApi('GET', '/api/meta/data-deletion/status?code=unknown-confirmation-code');

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'deletion_request_not_found' },
    });
  });
});

describe('personal event data safety', () => {
  beforeEach(async () => { await seal(); });
  const eventApi = (method, path, options = {}) => runApi(method, path, { ...options, body: options.body === undefined ? undefined : JSON.stringify(options.body) });
  const event = { id: 'anniversary-a', title: 'Private anniversary', lunarDay: 15, lunarMonth: 7, frequency: 'yearly', type: 'gio-chap', createdAt: '2026-10-22T00:00:00Z' };
  it('syncs type-only anniversaries from installed apps without changing their stored fields', async () => {
    const session = await createAppSession('events-owner', 'user');
    const headers = authedHeaders(session);
    const typeOnly = { ...event, title: '' };
    const response = await eventApi('POST', '/api/personal-events', { headers, body: { events: [typeOnly], revision: 0 } });
    expect(response.status).toBe(200);
    const saved = await (await eventApi('GET', '/api/personal-events', { headers })).json();
    expect(saved.events).toEqual([typeOnly]);
    expect(saved.revision).toBe(1);
    for (const title of [null, 42, 'x'.repeat(501)]) {
      expect((await eventApi('POST', '/api/personal-events', { headers, body: { events: [{ ...event, title }], revision: 1 } })).status).toBe(400);
    }
    expect((await (await eventApi('GET', '/api/personal-events', { headers })).json()).events).toEqual([typeOnly]);
  });
  it('preserves events through ordinary sync and increments the shared revision', async () => {
    const session = await createAppSession('events-owner', 'user');
    const headers = authedHeaders(session);
    expect((await eventApi('POST', '/api/personal-events', { headers, body: { events: [event], revision: 0 } })).status).toBe(200);
    const row = await env.DB.prepare('SELECT sync_revision FROM user_sync_data WHERE id = ?').bind('events-owner').first();
    expect(row.sync_revision).toBeGreaterThan(0);
    expect((await eventApi('PUT', '/api/sync', { headers, body: { bookmarks: [{ id: 'book-safe' }] } })).status).toBe(200);
    const result = await (await eventApi('GET', '/api/personal-events', { headers })).json();
    expect(result.events).toEqual([event]);
    expect(result.revision).toBe(1);
  });
  it('rejects stale replacements instead of silently losing another device edits', async () => {
    const session = await createAppSession('events-owner', 'user');
    const headers = authedHeaders(session);
    expect((await eventApi('POST', '/api/personal-events', { headers, body: { events: [event], revision: 0 } })).status).toBe(200);
    expect((await eventApi('POST', '/api/personal-events', { headers, body: { events: [], revision: 0 } })).status).toBe(409);
    expect((await (await eventApi('GET', '/api/personal-events', { headers })).json()).events).toEqual([event]);
  });
  it('rejects invalid CSRF and origins while retaining legacy same-origin JSON writes', async () => {
    const session = await createAppSession('events-owner', 'user');
    const headers = authedHeaders(session);
    expect((await eventApi('POST', '/api/personal-events', { headers: { ...headers, 'X-CSRF-Token': 'wrong' }, body: { events: [event] } })).status).toBe(403);
    expect((await eventApi('POST', '/api/personal-events', { headers: { ...headers, Origin: 'https://attacker.test' }, body: { events: [event] } })).status).toBe(403);
    const legacyHeaders = { ...headers };
    delete legacyHeaders['X-CSRF-Token'];
    expect((await eventApi('POST', '/api/personal-events', { headers: legacyHeaders, body: { events: [event] } })).status).toBe(200);
  });
  it('rejects malformed lists without erasing saved events and isolates owners', async () => {
    const session = await createAppSession('events-owner', 'user');
    const headers = authedHeaders(session);
    await eventApi('POST', '/api/personal-events', { headers, body: { events: [event] } });
    expect((await eventApi('POST', '/api/personal-events', { headers, body: { events: 'invalid' } })).status).toBe(400);
    expect((await (await eventApi('GET', '/api/personal-events', { headers })).json()).events).toEqual([event]);
    const other = await createAppSession('events-other', 'user');
    expect((await (await eventApi('GET', '/api/personal-events', { headers: authedHeaders(other) })).json()).events).toEqual([]);
  });
  it('retries ordinary sync CAS after an overlapping personal edit without losing either change', async () => {
    const session = await createAppSession('events-owner', 'user');
    const headers = authedHeaders(session);
    await eventApi('POST', '/api/personal-events', { headers, body: { events: [event], revision: 0 } });
    const repository = createSyncRepository(sealedEnv());
    let overlap = true;
    const service = createSyncService({ env: sealedEnv(), principal: { appUserId: 'events-owner' }, requestId: 'events-race' }, { repository: {
      ...repository,
      compareAndSetUserSync: async (...args) => {
        if (overlap) { overlap = false; await writePersonalEvents(sealedEnv(), 'events-owner', { events: [{ ...event, title: 'Newer device edit' }], revision: 1 }); }
        return repository.compareAndSetUserSync(...args);
      },
    } });
    const bookmark = { id: 'keep-bookmark', updated_at: '2026-10-22T00:00:00Z' };
    await service.putUserSync({ bookmarks: [bookmark] });
    const saved = await (await eventApi('GET', '/api/personal-events', { headers })).json();
    expect(saved).toMatchObject({ events: [{ title: 'Newer device edit' }], revision: 2 });
    expect((await service.getUserSync()).bookmarks).toContainEqual(bookmark);
  });
  it('binds queued writes to the original owner and rejects browser form/cross-site bypasses', async () => {
    const session = await createAppSession('events-owner', 'user');
    const headers = authedHeaders(session);
    expect((await eventApi('POST', '/api/personal-events', { headers, body: { events: [event], ownerId: 'different-owner' } })).status).toBe(403);
    const nativeLegacy = { Cookie: headers.Cookie, 'Content-Type': 'application/json' };
    expect((await eventApi('POST', '/api/personal-events', { headers: nativeLegacy, body: { events: [event] } })).status).toBe(200);
    expect((await eventApi('POST', '/api/personal-events', { headers: { ...nativeLegacy, 'Sec-Fetch-Site': 'cross-site' }, body: { events: [] } })).status).toBe(403);
    expect((await eventApi('POST', '/api/personal-events', { headers: { ...nativeLegacy, 'Content-Type': 'text/plain' }, body: { events: [] } })).status).toBe(415);
  });
});

describe('native authentication with persisted D1 identities', () => {
  beforeEach(async () => { await seal(); });
  it('creates a usable server session and refuses suspended accounts on later sign-in', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json({
      iss: 'https://accounts.google.com', aud: 'google-client-id', sub: 'native-d1-subject',
      exp: String(Math.floor(Date.now() / 1000) + 300), email_verified: 'true', email: 'native-d1@example.test', name: 'Native Member',
    }));
    const login = () => nativeVerify({ request: new Request('https://quangtu.vn/api/auth/native-verify', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '127.0.0.1' }, body: JSON.stringify({ provider: 'google', token: 'native-provider-token' }) }), locals: { env: sealedEnv(), migrationSealed: true } });
    try {
      const response = await login();
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.session.csrfToken).toBeTruthy();
      const headers = { Cookie: response.headers.get('set-cookie').split(';', 1)[0] };
      expect(await (await runApi('GET', '/api/session', { headers })).json()).toMatchObject({ authenticated: true, user: { id: data.userId, role: 'user' }, csrfToken: data.session.csrfToken });
      await env.DB.prepare("UPDATE app_users SET status = 'suspended' WHERE id = ?").bind(data.userId).run();
      expect((await login()).status).toBe(403);
      expect((await env.DB.prepare('SELECT COUNT(*) AS count FROM auth_sessions WHERE user_id = ?').bind(data.userId).first()).count).toBe(1);
    } finally { fetchSpy.mockRestore(); }
  });
});

async function runApi(method, path, options = {}) {
  const request = new Request(`${options.requestOrigin || 'https://quangtu.vn'}${path}`, {
    method,
    headers: options.headers,
    body: options.body,
  });
  const event = {
    request,
    params: { path: path.replace(/^\/api\/?/u, '') },
    locals: {},
    platform: { env: { ...sealedEnv(), ...(options.env || {}) } },
  };
  return hookHandle({
    event,
    resolve: async (hookedEvent) => {
      if (method === 'GET') return apiGet(hookedEvent);
      return apiPost(hookedEvent);
    },
  });
}

function sealedEnv() {
  return {
    ...env,
    APP_ORIGIN: 'https://quangtu.vn',
    MIGRATION_SEAL_REQUIRED: 'true',
    SESSION_SECRET: 'test-session-secret-with-enough-entropy',
    OAUTH_STATE_SECRET: 'test-oauth-state-secret-with-enough-entropy',
    GOOGLE_CLIENT_ID: 'google-client-id',
    GOOGLE_CLIENT_SECRET: 'google-client-secret',
    RATE_LIMIT_SALT: 'rate-limit-salt',
    PRESENCE_ENABLED: 'false',
    PRACTICE_COMMUNITY_ENABLED: 'true',
  };
}

async function seal() {
  await sealMigrationRun();
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO app_schema_capabilities (capability, schema_version, applied_at)
      VALUES ('user-activity-foundations-v1', 17, ?)
    `).bind(now()),
    env.DB.prepare(`
      INSERT INTO app_schema_capabilities (capability, schema_version, applied_at)
      VALUES ('audio-library-and-speaker-v1', 18, ?)
    `).bind(now()),
    env.DB.prepare(`
      INSERT INTO app_schema_capabilities (capability, schema_version, applied_at)
      VALUES ('facebook-import-v1', 21, ?)
    `).bind(now()),
    env.DB.prepare(`
      INSERT INTO app_schema_capabilities (capability, schema_version, applied_at)
      VALUES ('practice-community-v1', 20, ?)
    `).bind(now()),
  ]);
}

async function sealMigrationRun() {
  const timestamp = now();
  await env.DB.prepare(`
    INSERT INTO migration_runs
      (id, source_sql_sha256, source_manifest_sha256, status, started_at, imported_at, verified_at, sealed_at)
    VALUES ('sealed-run', 'sql', 'manifest', 'sealed', ?, ?, ?, ?)
  `).bind(timestamp, timestamp, timestamp, timestamp).run();
}

async function createAppSession(userId, role) {
  const timestamp = now();
  await env.DB.prepare(`
    INSERT INTO app_users (id, email, display_name, role, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(userId, `${userId}@example.test`, userId, role, timestamp, timestamp).run();
  return createSession(sealedEnv(), { userId });
}

async function seedAdminDashboardAnalytics() {
  const nowValue = new Date('2026-08-06T12:00:00.000Z');
  const now = nowValue.toISOString();
  const today = '2026-08-06';
  const yesterday = '2026-08-05';
  const pastDate = '2026-07-31';
  const olderDate = '2026-07-01';

  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO baiviet (id, tieu_de, danh_muc, created_at, updated_at, pdf_url)
      VALUES ('api-dashboard-article-a', 'Bài A', 'KINH PHẬT', ?, ?, '')
    `).bind(now, now),
    env.DB.prepare(`
      INSERT INTO baiviet (id, tieu_de, danh_muc, created_at, updated_at, pdf_url)
      VALUES ('api-dashboard-article-b', 'Bài B', 'CÁC NGHI THỨC', ?, ?, '/assets/pdfs/sample.pdf')
    `).bind(now, now),
    env.DB.prepare(`
      INSERT INTO baiviet (id, tieu_de, danh_muc, created_at, updated_at, pdf_url)
      VALUES ('api-dashboard-article-c', 'Bài C', 'CHUYỆN NHÂN QUẢ', ?, ?, NULL)
    `).bind(now, now),
    env.DB.prepare(`
      INSERT INTO phap_thoai (id, tieu_de, visibility, created_at)
      VALUES ('api-dashboard-talk-public', 'Pháp thoại công khai', 'public', ?)
    `).bind(now),
    env.DB.prepare(`
      INSERT INTO phap_thoai (id, tieu_de, visibility, created_at)
      VALUES ('api-dashboard-talk-private', 'Pháp thoại riêng tư', 'private', ?)
    `).bind(now),
    env.DB.prepare(`
      INSERT INTO luot_xem (bai_viet_id, so_luot, updated_at)
      VALUES ('api-dashboard-article-a', 37, ?)
    `).bind(now),
    env.DB.prepare(`
      INSERT INTO binh_luan (id, bai_viet_id, ten, dien_thoai, email, noi_dung, tao_luc)
      VALUES (1, 'api-dashboard-article-a', 'Khách', '', '', 'Bình luận', ?)
    `).bind(now),
    env.DB.prepare(`
      INSERT INTO active_visitors
        (visitor_id_hash, network_hash, last_seen_at, principal_id, display_name, role,
         device_type, browser_name, operating_system, current_path, first_seen_at, is_overflow)
      VALUES ('api-dashboard-visitor-admin', 'network-admin', ?, 'dashboard-admin', '  Quản trị viên  ', 'admin',
        'Máy tính', 'Google Chrome', 'Windows', '/admin/books?tab=traffic', ?, 0)
    `).bind(Date.parse(now) + 4_000, Date.parse(now) - 30_000),
    env.DB.prepare(`
      INSERT INTO active_visitors
        (visitor_id_hash, network_hash, last_seen_at, principal_id, display_name, role,
         device_type, browser_name, operating_system, current_path, first_seen_at, is_overflow)
      VALUES ('api-dashboard-visitor-user', 'network-user', ?, 'dashboard-ctv', 'Cộng tác viên', 'ctv',
        'Điện thoại', 'Mozilla Firefox', 'Android', '/tu-tap', ?, 0)
    `).bind(Date.parse(now) + 2_000, Date.parse(now) - 45_000),
    env.DB.prepare(`
      INSERT INTO active_visitors
        (visitor_id_hash, network_hash, last_seen_at, display_name, device_type,
         browser_name, operating_system, current_path, first_seen_at, is_overflow)
      VALUES ('api-dashboard-visitor-overflow', 'network-overflow', ?, NULL, 'Nhiều thiết bị',
        'Nhiều trình duyệt', 'Nhiều hệ điều hành', '/phap-thoai', ?, 1)
    `).bind(Date.parse(now) + 6_000, Date.parse(now) - 60_000),
    env.DB.prepare(`
      INSERT INTO visitor_daily_presence
        (visit_date, visitor_id_hash, network_hash, first_seen_at, last_seen_at, heartbeat_count)
      VALUES (?, 'api-dashboard-visitor-admin', 'network-admin', ?, ?, 1)
    `).bind(today, Date.parse(now) - 30_000, Date.parse(now) + 4_000),
    env.DB.prepare(`
      INSERT INTO visitor_daily_presence
        (visit_date, visitor_id_hash, network_hash, first_seen_at, last_seen_at, heartbeat_count)
      VALUES (?, 'api-dashboard-visitor-user', 'network-user', ?, ?, 1)
    `).bind(today, Date.parse(now) - 45_000, Date.parse(now) + 2_000),
    env.DB.prepare(`
      INSERT INTO visitor_daily_presence
        (visit_date, visitor_id_hash, network_hash, first_seen_at, last_seen_at, heartbeat_count)
      VALUES (?, 'api-dashboard-visitor-yesterday', 'network-yesterday', ?, ?, 1)
    `).bind(yesterday, Date.parse(now) - 90_000, Date.parse(now) - 86_400_000),
    env.DB.prepare(`
      INSERT INTO visitor_daily_presence
        (visit_date, visitor_id_hash, network_hash, first_seen_at, last_seen_at, heartbeat_count)
      VALUES (?, 'api-dashboard-visitor-past', 'network-past', ?, ?, 1)
    `).bind(pastDate, Date.parse(now) - 120_000, Date.parse(now) - 6 * 24 * 60 * 60 * 1000),
    env.DB.prepare(`
      INSERT INTO visitor_daily_presence
        (visit_date, visitor_id_hash, network_hash, first_seen_at, last_seen_at, heartbeat_count)
      VALUES (?, 'api-dashboard-visitor-older', 'network-older', ?, ?, 1)
    `).bind(olderDate, Date.parse(now) - 150_000, Date.parse(now) - 36 * 24 * 60 * 60 * 1000),
  ]);
}

async function seedAdminAnalyticsPageviews() {
  const timestamp = Date.parse('2026-08-06T11:58:00.000Z');
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO analytics_pageviews
        (pageview_id_hash, visit_date, visitor_id_hash, session_id_hash, principal_id, account_type,
         path, source, device_type, browser_name, operating_system, country_code, region_code, city,
         started_at, last_seen_at, heartbeat_count)
      VALUES
        ('pv-1', '2026-08-06', 'visitor-google-a', 'session-google-a', 'user-google-a', 'google',
          '/admin', 'Google', 'Máy tính', 'Google Chrome', 'Windows', 'VN', 'HN', 'Hà Nội',
          ?, ?, 2),
        ('pv-2', '2026-08-06', 'visitor-google-b', 'session-google-b', 'user-google-b', 'google',
          '/tu-tap', 'Google', 'Điện thoại', 'Safari', 'iOS / iPadOS', 'VN', 'HCM', 'Hồ Chí Minh',
          ?, ?, 1),
        ('pv-3', '2026-08-06', 'visitor-guest-a', 'session-guest-a', NULL, 'guest',
          '/phap-thoai', 'Trực tiếp', 'Máy tính', 'Firefox', 'Windows', 'VN', 'DN', 'Đà Nẵng',
          ?, ?, 1),
        ('pv-4', '2026-08-06', 'visitor-guest-a', 'session-guest-a', NULL, 'guest',
          '/tu-tap', 'Trực tiếp', 'Máy tính', 'Firefox', 'Windows', 'VN', 'DN', 'Đà Nẵng',
          ?, ?, 1),
        ('pv-5', '2026-08-06', 'visitor-guest-a', 'session-guest-a', NULL, 'guest',
          '/admin', 'Trực tiếp', 'Máy tính', 'Firefox', 'Windows', 'VN', 'DN', 'Đà Nẵng',
          ?, ?, 1)
      `).bind(
        timestamp, timestamp,
        timestamp - 5_000, timestamp - 5_000,
        timestamp, timestamp + 1_080_000,
        timestamp, timestamp + 1_080_000,
        timestamp, timestamp + 1_080_000,
      ),
    ]);
  }

async function seedAdminCommunityRanking() {
  const now = '2026-08-06T12:00:00.000Z';
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO app_users (id, display_name, role, avatar_url, created_at, updated_at)
      VALUES ('member-high', 'Người chăm', 'user', NULL, ?, ?)
    `).bind(now, now),
    env.DB.prepare(`
      INSERT INTO app_users (id, display_name, role, avatar_url, created_at, updated_at)
      VALUES ('member-middle', 'Bậc tu', 'user', NULL, ?, ?)
    `).bind(now, now),
    env.DB.prepare(`
      INSERT INTO app_users (id, display_name, role, avatar_url, created_at, updated_at)
      VALUES ('member-lower', 'Xếp sau', 'user', NULL, ?, ?)
    `).bind(now, now),
    env.DB.prepare(`
      INSERT INTO user_sync_data
        (id, practice_logs, bookmarks, listened_history, updated_at)
      VALUES (?, ?, '[]', '[]', ?)
    `).bind(
      'member-high',
      JSON.stringify([
        { date: '2026-08-06', type: 'niệm Phật', count: 2 },
        { date: '2026-08-05', type: 'niệm Phật', count: 2 },
        { date: '2026-08-04', type: 'niệm Phật', count: 2 },
      ]),
      now,
    ),
    env.DB.prepare(`
      INSERT INTO user_sync_data
        (id, practice_logs, bookmarks, listened_history, updated_at)
      VALUES (?, ?, '[]', '[]', ?)
    `).bind(
      'member-middle',
      JSON.stringify([
        { date: '2026-08-06', type: 'thiền', count: 2 },
        { date: '2026-08-06', type: 'tụng kinh', count: 1 },
        { date: '2026-08-05', type: 'thiền', count: 2 },
      ]),
      now,
    ),
    env.DB.prepare(`
      INSERT INTO user_sync_data
        (id, practice_logs, bookmarks, listened_history, updated_at)
      VALUES (?, ?, '[]', '[]', ?)
    `).bind(
      'member-lower',
      JSON.stringify([
        { date: '2026-08-06', type: 'thiền', count: 1 },
        { date: '2026-08-05', type: 'thiền', count: 1 },
      ]),
      now,
    ),
    env.DB.prepare(`
      INSERT INTO active_visitors
        (visitor_id_hash, network_hash, last_seen_at, principal_id, display_name, role,
         device_type, browser_name, operating_system, current_path, first_seen_at, is_overflow)
      VALUES
        ('community-visitor-google', 'community-network-google', ?, 'member-middle', 'Bậc tu', 'user',
          'Máy tính', 'Google Chrome', 'Windows', '/tu-tap', ?, 0),
        ('community-visitor-guest', 'community-network-guest', ?, NULL, NULL, 'guest',
          'Điện thoại', 'Safari', 'iOS / iPadOS', '/phap-thoai', ?, 0),
        ('community-visitor-internal', 'community-network-internal', ?, 'member-lower', 'Xếp sau', 'admin',
          'Máy tính', 'Firefox', 'Windows', '/admin', ?, 0)
    `).bind(
      Date.parse(now) - 10_000, Date.parse(now) - 30_000,
      Date.parse(now) - 8_000, Date.parse(now) - 40_000,
      Date.parse(now) - 5_000, Date.parse(now) - 20_000,
    ),
  ]);
}

function authedHeaders(created) {
  return {
    Cookie: created.cookie.split(';', 1)[0],
    Origin: 'https://quangtu.vn',
    'Sec-Fetch-Site': 'same-origin',
    'X-CSRF-Token': created.csrfToken,
    'Content-Type': 'application/json',
  };
}

function toBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function splitMigration(sql) {
  return sql.trim().split(/;\s*\n\s*\n/gu).map((statement) =>
    statement.trim().endsWith(';') ? statement.trim() : `${statement.trim()};`);
}

function now() {
  return new Date().toISOString();
}
