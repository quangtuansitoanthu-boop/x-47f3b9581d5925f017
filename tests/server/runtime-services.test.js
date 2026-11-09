import commentPlaysSchema from '../../migrations/0022-comment-replies-and-album-plays.sql?raw';
import trackPlaySchema from '../../migrations/0023-track-play-events.sql?raw';
import { recordAlbumPlay, listAlbumPlays } from '../../src/lib/server/services/album-plays.ts';
import { createComment, listComments } from '../../src/worker/api/views-and-comments.js';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyD1Migrations, env } from 'cloudflare:test';
import applicationSchema from '../../migrations/0001-application-schema.sql?raw';
import authSchema from '../../migrations/0002-auth-and-session-schema.sql?raw';
import memberStatusSchema from '../../migrations/0026-member-status.sql?raw';
import mediaSchema from '../../migrations/0003-migration-and-media-operation-schema.sql?raw';
import driveSchema from '../../migrations/0007-google-drive-talk-sources.sql?raw';
import presenceSchema from '../../migrations/0008-active-visitors.sql?raw';
import hardeningSchema from '../../migrations/0009-backward-compatible-sync-and-media-hardening.sql?raw';
import atomicMediaSchema from '../../migrations/0010-atomic-article-media-references.sql?raw';
import playerCompatibilitySchema from '../../migrations/0011-bidirectional-player-sync-compatibility.sql?raw';
import adminDashboardSchema from '../../migrations/0013-admin-dashboard-analytics.sql?raw';
import adminAnalyticsSchema from '../../migrations/0014-admin-analytics-pageviews.sql?raw';
import removeLegacyPasswordsSchema from '../../migrations/0015-remove-legacy-password-accounts.sql?raw';
import positionedArticleMediaSchema from '../../migrations/0016-positioned-article-media-references.sql?raw';
import userActivitySchema from '../../migrations/0017-user-activity-foundations.sql?raw';
import audioLibrarySchema from '../../migrations/0018-audio-library-and-speaker.sql?raw';
import facebookAuthSchema from '../../migrations/0019-facebook-auth-import.sql?raw';
import performanceSchema from '../../migrations/0025-performance-checkpoints.sql?raw';
import ugcModerationSchema from '../../migrations/0038-ugc-moderation.sql?raw';
import reportVersionsSchema from '../../migrations/0040-ugc-report-versions.sql?raw';
import practiceCommunitySchema from '../../migrations/0020-practice-community-achievements.sql?raw';
import facebookScanContinuationSchema from '../../migrations/0021-facebook-import-scan-continuation.sql?raw';
import { normalizeVisitorPath, vietnamDateKey, visitorClientMetadata } from '../../src/lib/server/domain/visitor-client.ts';
import { ServerInputError } from '../../src/lib/server/errors.ts';
import { createAdminDashboardService } from '../../src/lib/server/services/admin-dashboard.ts';
import { createAdminAnalyticsService } from '../../src/lib/server/services/admin-analytics.ts';
import { createAdminCommunityService } from '../../src/lib/server/services/admin-community.ts';
import { createAdminMembersService } from '../../src/lib/server/services/admin-members.ts';
import { createArticlesService } from '../../src/lib/server/services/articles.ts';
import { createPresenceService } from '../../src/lib/server/services/presence.ts';
import { createPracticeCommunityService } from '../../src/lib/server/services/practice-community.ts';
import { createTalksService } from '../../src/lib/server/services/talks.ts';
import { handleApiRequest } from '../../src/lib/server/http/api-handler.ts';
import { createSyncService } from '../../src/lib/server/services/sync.ts';
import { createMediaService } from '../../src/lib/server/services/media.ts';
import { createDataRepository } from '../../src/lib/server/repositories/data-repository.ts';
import { getUserSync as getLegacyUserSync, putUserSync as putLegacyUserSync } from '../../src/worker/api/sync.js';

const ROOT_ID = 'root-audio-test-123';
const FILE_ID = 'drive-audio-file-123';
const APP_ORIGIN = 'http://localhost:8787';
let preMigrationReconciledPlayer;
let dedicatedOnlyReconciledRows;
let removedLegacyAuthenticationRows;

beforeAll(async () => {
  await applyD1Migrations(env.DB, [
    { name: '0001-application-schema.sql', queries: splitMigration(applicationSchema) },
    { name: '0002-auth-and-session-schema.sql', queries: splitMigration(authSchema) },
    { name: '0026-member-status.sql', queries: splitMigration(memberStatusSchema) },
    { name: '0003-migration-and-media-operation-schema.sql', queries: splitMigration(mediaSchema) },
    { name: '0007-google-drive-talk-sources.sql', queries: splitMigration(driveSchema) },
    { name: '0008-active-visitors.sql', queries: splitMigration(presenceSchema) },
    { name: '0009-backward-compatible-sync-and-media-hardening.sql', queries: splitMigration(hardeningSchema) },
    { name: '0010-atomic-article-media-references.sql', queries: splitMigration(atomicMediaSchema) },
    { name: '0011-bidirectional-player-sync-compatibility.sql', queries: splitMigration(playerCompatibilitySchema) },
    { name: '0013-admin-dashboard-analytics.sql', queries: splitMigration(adminDashboardSchema) },
    { name: '0014-admin-analytics-pageviews.sql', queries: splitMigration(adminAnalyticsSchema) },
  ]);
  const migrationNow = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO app_users (id, email, display_name, role, created_at, updated_at)
      VALUES ('migration-google-admin', 'migration-admin@example.com', 'Google admin', 'admin', ?, ?)
    `).bind(migrationNow, migrationNow),
    env.DB.prepare(`
      INSERT INTO auth_sessions
        (id, user_id, token_hash, csrf_token_hash, created_at, expires_at)
      VALUES ('migration-google-session', 'migration-google-admin', 'migration-google-token',
        'migration-google-csrf', ?, ?)
    `).bind(migrationNow, new Date(Date.now() + 86_400_000).toISOString()),
    env.DB.prepare(`
      INSERT INTO legacy_accounts
        (id, username, role, password_algorithm, password_version, password_iterations,
          password_salt, password_hash, created_at, updated_at)
      VALUES (990001, 'migration-legacy-admin', 'admin', 'pbkdf2-sha256', 1, 60000,
        'salt', 'hash', ?, ?)
    `).bind(migrationNow, migrationNow),
    env.DB.prepare(`
      INSERT INTO auth_sessions
        (id, legacy_account_id, token_hash, csrf_token_hash, created_at, expires_at)
      VALUES ('migration-legacy-session', 990001, 'migration-token', 'migration-csrf', ?, ?)
    `).bind(migrationNow, new Date(Date.now() + 86_400_000).toISOString()),
  ]);
  await applyD1Migrations(env.DB, [
    { name: '0015-remove-legacy-password-accounts.sql', queries: splitMigration(removeLegacyPasswordsSchema) },
  ]);
  removedLegacyAuthenticationRows = {
    accounts: await env.DB.prepare('SELECT COUNT(*) AS count FROM legacy_accounts').first(),
    googleAccount: await env.DB.prepare("SELECT role FROM app_users WHERE id = 'migration-google-admin'").first(),
    googleSession: await env.DB.prepare("SELECT user_id FROM auth_sessions WHERE id = 'migration-google-session'").first(),
    sessions: await env.DB.prepare("SELECT COUNT(*) AS count FROM auth_sessions WHERE legacy_account_id IS NOT NULL").first(),
  };
  await env.DB.prepare('DELETE FROM pt_player_sync').run();
  await env.DB.prepare('DELETE FROM user_sync_data').run();
  await env.DB.prepare('DELETE FROM app_users').run();
  const beforeMigration = new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO app_users (id, display_name, role, created_at, updated_at)
    VALUES ('pre-migration-user', 'Pre migration', 'user', ?, ?)
  `).bind(beforeMigration, beforeMigration).run();
  await env.DB.prepare(`
    INSERT INTO app_users (id, display_name, role, created_at, updated_at)
    VALUES ('dedicated-only-user', 'Dedicated only', 'user', ?, ?)
  `).bind(beforeMigration, beforeMigration).run();
  await env.DB.prepare(`
    INSERT INTO user_sync_data
      (id, practice_logs, bookmarks, listened_history, updated_at, pt_player_state, pt_album_positions, pt_recent_albums)
    VALUES ('pre-migration-user', '[]', '[]', '[]', ?, ?, ?, ?)
  `).bind(
    beforeMigration,
    JSON.stringify({ albumId: 'album-a', savedAt: 200 }),
    JSON.stringify({ 'album-a': { currentTime: 20, savedAt: 200 } }),
    JSON.stringify(['album-a']),
  ).run();
  await env.DB.prepare(`
    INSERT INTO pt_player_sync
      (id, pt_player_state, pt_album_positions, pt_recent_albums, updated_at)
    VALUES ('google_pre-migration-user', ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      pt_player_state = excluded.pt_player_state,
      pt_album_positions = excluded.pt_album_positions,
      pt_recent_albums = excluded.pt_recent_albums,
      updated_at = excluded.updated_at
  `).bind(
    JSON.stringify({ albumId: 'stale-state', savedAt: 100 }),
    JSON.stringify({
      'album-a': { currentTime: 10, savedAt: 100 },
      'album-b': { currentTime: 30, savedAt: 300 },
    }),
    JSON.stringify(['album-b']),
    beforeMigration,
  ).run();
  await env.DB.prepare(`
    INSERT INTO pt_player_sync
      (id, pt_player_state, pt_album_positions, pt_recent_albums, updated_at)
    VALUES ('google_dedicated-only-user', ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      pt_player_state = excluded.pt_player_state,
      pt_album_positions = excluded.pt_album_positions,
      pt_recent_albums = excluded.pt_recent_albums,
      updated_at = excluded.updated_at
  `).bind(
    JSON.stringify({ albumId: 'album-a', savedAt: 200 }),
    JSON.stringify({ 'album-a': { currentTime: 20, savedAt: 200 } }),
    JSON.stringify(['album-a']),
    beforeMigration,
  ).run();
  await applyD1Migrations(env.DB, [
    { name: '0010-atomic-article-media-references.sql', queries: splitMigration(atomicMediaSchema) },
    { name: '0011-bidirectional-player-sync-compatibility.sql', queries: splitMigration(playerCompatibilitySchema) },
    { name: '0016-positioned-article-media-references.sql', queries: splitMigration(positionedArticleMediaSchema) },
    { name: '0017-user-activity-foundations.sql', queries: splitMigration(userActivitySchema) },
    { name: '0018-audio-library-and-speaker.sql', queries: splitMigration(audioLibrarySchema) },
    { name: '0019-facebook-auth-import.sql', queries: splitMigration(facebookAuthSchema) },
    { name: '0020-practice-community-achievements.sql', queries: splitMigration(practiceCommunitySchema) },
    { name: '0025-performance-checkpoints.sql', queries: splitMigration(performanceSchema) },
    { name: '0021-facebook-import-scan-continuation.sql', queries: splitMigration(facebookScanContinuationSchema) },
    { name: '0022-comment-replies-and-album-plays.sql', queries: splitMigration(commentPlaysSchema) },
    { name: '0023-track-play-events.sql', queries: splitMigration(trackPlaySchema) },
    { name: '0038-ugc-moderation.sql', queries: splitMigration(ugcModerationSchema) },
    { name: '0040-ugc-report-versions.sql', queries: splitMigration(reportVersionsSchema) },
  ]);
  preMigrationReconciledPlayer = await env.DB.prepare(
    "SELECT * FROM pt_player_sync WHERE id = 'google_pre-migration-user'",
  ).first();
  await env.DB.prepare(`
    INSERT INTO pt_player_sync
      (id, pt_player_state, pt_album_positions, pt_recent_albums, updated_at)
    VALUES ('google_dedicated-only-user', ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      pt_player_state = excluded.pt_player_state,
      pt_album_positions = excluded.pt_album_positions,
      pt_recent_albums = excluded.pt_recent_albums,
      updated_at = excluded.updated_at
  `).bind(
    JSON.stringify({ albumId: 'album-b', savedAt: 300 }),
    JSON.stringify({ 'album-b': { currentTime: 30, savedAt: 300 } }),
    JSON.stringify(['album-b']),
    beforeMigration,
  ).run();
  dedicatedOnlyReconciledRows = {
    aggregate: await env.DB.prepare(
      "SELECT * FROM user_sync_data WHERE id = 'dedicated-only-user'",
    ).first(),
    player: await env.DB.prepare(
      "SELECT * FROM pt_player_sync WHERE id = 'google_dedicated-only-user'",
    ).first(),
  };
});

beforeEach(async () => {
  await env.DB.prepare('DELETE FROM practice_campaign_contributions').run();
  await env.DB.prepare('DELETE FROM practice_campaign_members').run();
  await env.DB.prepare('DELETE FROM practice_campaigns').run();
  await env.DB.prepare('DELETE FROM practice_profiles').run();
  await env.DB.prepare('DELETE FROM practice_sessions').run();
  await env.DB.prepare('DELETE FROM active_visitors').run();
  await env.DB.prepare('DELETE FROM visitor_daily_presence').run();
  await env.DB.prepare('DELETE FROM analytics_pageviews').run();
  await env.DB.prepare('DELETE FROM article_media_cleanup_queue').run();
  await env.DB.prepare('DELETE FROM media_operations').run();
  await env.DB.prepare('DELETE FROM media_objects').run();
  await env.DB.prepare('DELETE FROM phap_thoai_drive_files').run();
  await env.DB.prepare('DELETE FROM phap_thoai_drive_sources').run();
  await env.DB.prepare('DELETE FROM phap_thoai').run();
  await env.DB.prepare('DELETE FROM facebook_deletion_requests').run();
  await env.DB.prepare('DELETE FROM facebook_post_imports').run();
  await env.DB.prepare('DELETE FROM facebook_connections').run();
  await env.DB.prepare('DELETE FROM baiviet').run();
  await env.DB.prepare('DELETE FROM user_sync_data').run();
  await env.DB.prepare('DELETE FROM pt_player_sync').run();
  await env.DB.prepare('DELETE FROM app_users').run();

  const now = new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO app_users (id, display_name, role, created_at, updated_at)
    VALUES ('user-1', 'Người dùng', 'user', ?, ?)
  `).bind(now, now).run();
});

describe('server runtime services', () => {
  it('lists newest registrations first independent of name and update time', async () => {
    for (const [id, name, created, updated] of [
      ['older', 'A', '2025-01-01T00:00:00Z', '2026-09-01T00:00:00Z'],
      ['newer', 'Z', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'],
    ]) await env.DB.prepare('INSERT INTO app_users (id, display_name, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').bind(id, name, 'user', created, updated).run();
    const result = await createAdminMembersService(env, { appUserId: 'admin' }).listMembers();
    expect(result.members.map((member) => member.id)).toEqual(['user-1', 'newer', 'older']);
  });

  it('counts each track cycle immediately, deduplicates retries atomically and preserves existing totals', async () => {
    await env.DB.prepare("INSERT INTO phap_thoai (id,tieu_de,visibility,tracks) VALUES ('plays','Album','public',?)").bind(JSON.stringify([{ title: 'One', url: '/one.mp3' }, { title: 'Two', url: '/two.mp3' }])).run();
    await env.DB.prepare("INSERT INTO album_play_totals VALUES ('plays', 7)").run();
    await env.DB.prepare("INSERT INTO album_play_listeners VALUES ('plays', 'old-listener', 1)").run();
    const now = 1_800_000_000_000;
    const first = { playbackId: crypto.randomUUID(), trackUrl: '/one.mp3' };
    expect(await recordAlbumPlay(env, 'plays', first, now)).toMatchObject({ playCount: 8, counted: true });
    expect(await recordAlbumPlay(env, 'plays', first, now + 1)).toMatchObject({ playCount: 8, counted: false });
    const second = { playbackId: crypto.randomUUID(), trackUrl: '/two.mp3' };
    await Promise.all(Array.from({ length: 5 }, () => recordAlbumPlay(env, 'plays', second, now + 2)));
    expect(await listAlbumPlays(env)).toEqual([{ albumId: 'plays', playCount: 9 }]);
    expect(await recordAlbumPlay(env, 'plays', { ...first, playbackId: crypto.randomUUID() }, now + 3)).toMatchObject({ playCount: 10, counted: true });
    expect(await recordAlbumPlay(env, 'plays', first, now + 31 * 60_000)).toMatchObject({ playCount: 10, counted: false });
    expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM album_play_listeners').first()).toEqual({ count: 1 });
    await expect(recordAlbumPlay(env, 'plays', { ...first, trackUrl: '/foreign.mp3' })).rejects.toMatchObject({ status: 400 });
    for (const playback of [{}, { playbackId: 'bad', trackUrl: '/one.mp3' }, { playbackId: crypto.randomUUID(), trackUrl: 1 }]) {
      await expect(recordAlbumPlay(env, 'plays', playback)).rejects.toMatchObject({ status: 400 });
    }
    expect(await listAlbumPlays(env)).toEqual([{ albumId: 'plays', playCount: 10 }]);
  });

  it('excludes private albums and does not count nonexistent albums', async () => {
    await env.DB.prepare("INSERT INTO phap_thoai (id,tieu_de,visibility) VALUES ('private-plays','Private','private')").run();
    for (const id of ['private-plays', 'missing']) await expect(recordAlbumPlay(env, id, {})).rejects.toMatchObject({ status: 404 });
    expect(await listAlbumPlays(env)).toEqual([]);
  });

  it('binds replies to authenticated authors and current roles without leaking email', async () => {
    await env.DB.prepare("INSERT INTO baiviet (id,tieu_de) VALUES ('comment-book','Book'), ('other-book','Other')").run();
    await env.DB.prepare("INSERT INTO app_users (id,email,display_name,role,created_at,updated_at) VALUES ('comment-author','private@example.com','Tên công khai','ctv','2026','2026')").run();
    const request = (body) => new Request('http://localhost/comments', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const session = { appUserId: 'comment-author' };
    const root = await createComment(request({ noi_dung: 'Gốc', ten: 'Fake', role: 'admin' }), env, 'comment-book', session);
    await approveCommentFixture(root.id);
    await env.DB.prepare("INSERT INTO app_users (id,display_name,role,created_at,updated_at) VALUES ('other-author','Thành viên khác','user','2026','2026')").run();
    const reply = await createComment(request({ noi_dung: 'Trả lời', parent_id: root.id, role: 'admin' }), env, 'comment-book', { appUserId: 'other-author' });
    await approveCommentFixture(reply.id);
    expect(reply).toMatchObject({ ten: 'Thành viên khác', role: 'user', parent_id: root.id });
    const nested = await createComment(request({ noi_dung: 'Tiếp tục', parent_id: reply.id }), env, 'comment-book', session);
    await approveCommentFixture(nested.id);
    expect(root).toMatchObject({ ten: 'Tên công khai', role: 'ctv', parent_id: null });
    expect(root).not.toHaveProperty('email');
    expect(nested.parent_id).toBe(root.id);
    await expect(createComment(request({ noi_dung: 'Sai bài', parent_id: root.id }), env, 'other-book', session)).rejects.toMatchObject({ status: 404 });
    await expect(createComment(request({ noi_dung: 'Giả danh' }), env, 'comment-book', null)).rejects.toMatchObject({ status: 401 });
    for (const parent_id of [-1, 1.5, '1']) await expect(createComment(request({ noi_dung: 'Sai cha', parent_id }), env, 'comment-book', session)).rejects.toMatchObject({ status: 400 });
    await env.DB.prepare("UPDATE app_users SET role='user' WHERE id='comment-author'").run();
    expect((await listComments(env, 'comment-book')).every((comment) => comment.role === 'user' && !('email' in comment))).toBe(true);
    await env.DB.prepare('DELETE FROM binh_luan WHERE id = ?').bind(root.id).run();
    expect(await listComments(env, 'comment-book')).toEqual([]);
  });

  it('keeps legacy comments readable without claiming an elevated role', async () => {
    await env.DB.prepare("INSERT INTO baiviet (id,tieu_de) VALUES ('legacy-comment-book','Book')").run();
    await env.DB.prepare("INSERT INTO binh_luan (bai_viet_id,ten,noi_dung) VALUES ('legacy-comment-book','old@example.com','Cũ')").run();
    await env.DB.prepare("UPDATE binh_luan SET moderation_status = 'approved', approved_author_name = ten, approved_author_avatar_url = '' WHERE bai_viet_id = 'legacy-comment-book'").run();
    expect(await listComments(env, 'legacy-comment-book')).toEqual([expect.objectContaining({ ten: 'Thành viên', role: null, noi_dung: 'Cũ' })]);
  });

  it('removes legacy password principals and their sessions during migration', () => {
    expect(removedLegacyAuthenticationRows).toEqual({
      accounts: { count: 0 },
      googleAccount: { role: 'admin' },
      googleSession: { user_id: 'migration-google-admin' },
      sessions: { count: 0 },
    });
  });

  it('rejects member email changes while allowing display-name updates', async () => {
    const now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO app_users (id, email, display_name, role, created_at, updated_at)
        VALUES ('admin-root', 'admin@example.com', 'Quản trị chính', 'admin', ?, ?)
      `).bind(now, now),
      env.DB.prepare(`
        INSERT INTO app_users (id, email, display_name, role, created_at, updated_at)
        VALUES ('member-email-lock', 'member@example.com', 'Thành viên', 'user', ?, ?)
      `).bind(now, now),
    ]);
    const service = createAdminMembersService(env, {
      appUserId: 'admin-root', csrfToken: 'csrf-admin-root', role: 'admin', userId: 'admin-root',
    });

    await expect(service.update('member-email-lock', { email: 'changed@example.com' })).rejects.toMatchObject({
      code: 'immutable_email',
      status: 400,
    });
    await expect(service.update('member-email-lock', { name: 'Tên mới' })).resolves.toMatchObject({
      email: 'member@example.com',
      name: 'Tên mới',
    });
    await expect(env.DB.prepare(
      "SELECT email FROM app_users WHERE id = 'member-email-lock'",
    ).first()).resolves.toMatchObject({ email: 'member@example.com' });
  });

  it('projects Facebook-only and linked ordinary accounts as provider-neutral members', async () => {
    const now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO app_users (id, display_name, role, created_at, updated_at)
        VALUES ('admin-root', 'Quản trị chính', 'admin', ?, ?)
      `).bind(now, now),
      env.DB.prepare(`
        INSERT INTO app_users (id, display_name, role, created_at, updated_at)
        VALUES ('facebook-only-member', 'Thành viên Facebook', 'user', ?, ?)
      `).bind(now, now),
      env.DB.prepare(`
        INSERT INTO app_users (id, display_name, role, created_at, updated_at)
        VALUES ('linked-member', 'Thành viên liên kết', 'user', ?, ?)
      `).bind(now, now),
      env.DB.prepare(`
        INSERT INTO auth_identities (id, user_id, issuer, provider, provider_subject, created_at, updated_at)
        VALUES ('identity-facebook-only', 'facebook-only-member', 'https://www.facebook.com', 'facebook', 'facebook-only-subject', ?, ?)
      `).bind(now, now),
      env.DB.prepare(`
        INSERT INTO auth_identities (id, user_id, issuer, provider, provider_subject, created_at, updated_at)
        VALUES ('identity-linked-facebook', 'linked-member', 'https://www.facebook.com', 'facebook', 'linked-facebook-subject', ?, ?)
      `).bind(now, now),
      env.DB.prepare(`
        INSERT INTO auth_identities (id, user_id, issuer, provider, provider_subject, created_at, updated_at)
        VALUES ('identity-linked-google', 'linked-member', 'https://accounts.google.com', 'google', 'linked-google-subject', ?, ?)
      `).bind(now, now),
    ]);
    const service = createAdminMembersService(env, {
      appUserId: 'admin-root', csrfToken: 'csrf-admin-root', role: 'admin', userId: 'admin-root',
    });

    const { members } = await service.listMembers();
    const facebookOnly = members.find((member) => member.id === 'facebook-only-member');
    const linked = members.find((member) => member.id === 'linked-member');
    expect(facebookOnly).toMatchObject({ accountType: 'member', kind: 'member', role: 'user' });
    expect(linked).toMatchObject({ accountType: 'member', kind: 'member', role: 'user' });
    expect(JSON.stringify([facebookOnly, linked])).not.toContain('google');
  });

  it('protects the active administrator from self-downgrade and self-deletion', async () => {
    const now = new Date().toISOString();
    await env.DB.prepare(`
      INSERT INTO app_users (id, email, display_name, role, created_at, updated_at)
      VALUES ('admin-self', 'self@example.com', 'Quản trị đang dùng', 'admin', ?, ?)
    `).bind(now, now).run();
    const service = createAdminMembersService(env, {
      appUserId: 'admin-self', csrfToken: 'csrf-admin-self', role: 'admin', userId: 'admin-self',
    });

    await expect(service.update('admin-self', { role: 'ctv' })).rejects.toMatchObject({
      code: 'self_role_protected',
      status: 409,
    });
    await expect(service.remove('admin-self')).rejects.toMatchObject({
      code: 'self_delete_protected',
      status: 409,
    });
    await expect(env.DB.prepare(
      "SELECT role FROM app_users WHERE id = 'admin-self'",
    ).first()).resolves.toMatchObject({ role: 'admin' });
  });

  it('updates a member role and revokes its active sessions atomically', async () => {
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 86_400_000).toISOString();
    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO app_users (id, display_name, role, created_at, updated_at)
        VALUES ('admin-root', 'Quản trị chính', 'admin', ?, ?)
      `).bind(now, now),
      env.DB.prepare(`
        INSERT INTO app_users (id, display_name, role, created_at, updated_at)
        VALUES ('member-role-change', 'Thành viên', 'user', ?, ?)
      `).bind(now, now),
      env.DB.prepare(`
        INSERT INTO auth_sessions
          (id, user_id, token_hash, csrf_token_hash, created_at, expires_at)
        VALUES ('session-role-change', 'member-role-change', 'token-role-change', 'csrf-role-change', ?, ?)
      `).bind(now, expiresAt),
    ]);
    const service = createAdminMembersService(env, {
      appUserId: 'admin-root', csrfToken: 'csrf-admin-root', role: 'admin', userId: 'admin-root',
    });

    await expect(service.update('member-role-change', { role: 'ctv' })).resolves.toMatchObject({
      accountType: 'member', id: 'member-role-change', role: 'ctv',
    });
    await expect(env.DB.prepare(
      "SELECT revoked_at FROM auth_sessions WHERE id = 'session-role-change'",
    ).first()).resolves.toMatchObject({ revoked_at: expect.any(String) });
  });

  it('rolls back a member role update when session revocation fails', async () => {
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 86_400_000).toISOString();
    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO app_users (id, display_name, role, created_at, updated_at)
        VALUES ('admin-root', 'Quản trị chính', 'admin', ?, ?)
      `).bind(now, now),
      env.DB.prepare(`
        INSERT INTO app_users (id, display_name, role, created_at, updated_at)
        VALUES ('member-atomic', 'Thành viên atomic', 'user', ?, ?)
      `).bind(now, now),
      env.DB.prepare(`
        INSERT INTO auth_sessions
          (id, user_id, token_hash, csrf_token_hash, created_at, expires_at)
        VALUES ('session-atomic', 'member-atomic', 'token-atomic', 'csrf-atomic', ?, ?)
      `).bind(now, expiresAt),
    ]);
    await env.DB.prepare(`
      CREATE TRIGGER fail_member_session_revocation
      BEFORE UPDATE OF revoked_at ON auth_sessions
      WHEN NEW.user_id = 'member-atomic'
      BEGIN
        SELECT RAISE(ABORT, 'session revocation failed');
      END
    `).run();
    const service = createAdminMembersService(env, {
      appUserId: 'admin-root', csrfToken: 'csrf-admin-root', role: 'admin', userId: 'admin-root',
    });

    try {
      await expect(service.update('member-atomic', { role: 'ctv' })).rejects.toThrow('session revocation failed');
      await expect(env.DB.prepare(
        "SELECT role FROM app_users WHERE id = 'member-atomic'",
      ).first()).resolves.toMatchObject({ role: 'user' });
      await expect(env.DB.prepare(
        "SELECT revoked_at FROM auth_sessions WHERE id = 'session-atomic'",
      ).first()).resolves.toMatchObject({ revoked_at: null });
    } finally {
      await env.DB.prepare('DROP TRIGGER IF EXISTS fail_member_session_revocation').run();
    }
  });

  it('deletes a member that has cascaded authentication sessions', async () => {
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 86_400_000).toISOString();
    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO app_users (id, display_name, role, created_at, updated_at)
        VALUES ('admin-root', 'Quản trị chính', 'admin', ?, ?)
      `).bind(now, now),
      env.DB.prepare(`
        INSERT INTO app_users (id, display_name, role, created_at, updated_at)
        VALUES ('admin-with-session', 'Quản trị đã đăng nhập', 'admin', ?, ?)
      `).bind(now, now),
      env.DB.prepare(`
        INSERT INTO auth_sessions
          (id, user_id, token_hash, csrf_token_hash, created_at, expires_at)
        VALUES ('session-to-cascade', 'admin-with-session', 'token-to-cascade', 'csrf-to-cascade', ?, ?)
      `).bind(now, expiresAt),
    ]);

    const service = createAdminMembersService(env, {
      appUserId: 'admin-root',
      csrfToken: 'csrf-admin-root',
      role: 'admin',
      userId: 'admin-root',
    });

    await expect(service.remove('admin-with-session')).resolves.toBeUndefined();
    await expect(env.DB.prepare(
      "SELECT id FROM app_users WHERE id = 'admin-with-session'",
    ).first()).resolves.toBeNull();
    await expect(env.DB.prepare(
      "SELECT id FROM auth_sessions WHERE id = 'session-to-cascade'",
    ).first()).resolves.toBeNull();
  });

  it('still protects the last administrator from deletion', async () => {
    const now = new Date().toISOString();
    await env.DB.prepare(`
      INSERT INTO app_users (id, display_name, role, created_at, updated_at)
      VALUES ('last-admin', 'Quản trị cuối cùng', 'admin', ?, ?)
    `).bind(now, now).run();
    const service = createAdminMembersService(env, {
      appUserId: 'system-admin',
      csrfToken: 'csrf-system-admin',
      role: 'admin',
      userId: 'system-admin',
    });

    await expect(service.remove('last-admin')).rejects.toMatchObject({
      code: 'last_admin_protected',
      status: 409,
    });
    await expect(env.DB.prepare(
      "SELECT id FROM app_users WHERE id = 'last-admin'",
    ).first()).resolves.toMatchObject({ id: 'last-admin' });
  });

  it.each(['demote', 'delete'])('still protects the last suspended administrator from %s', async (operation) => {
    const now = new Date().toISOString();
    await env.DB.prepare(`
      INSERT INTO app_users (id, display_name, role, status, created_at, updated_at)
      VALUES ('last-suspended-admin', 'Last suspended admin', 'admin', 'suspended', ?, ?)
    `).bind(now, now).run();
    const service = createAdminMembersService(env, {
      appUserId: 'system-admin', csrfToken: 'csrf-system-admin', role: 'admin', userId: 'system-admin',
    });
    await expect(operation === 'delete'
      ? service.remove('last-suspended-admin')
      : service.update('last-suspended-admin', { role: 'user' })).rejects.toMatchObject({
      status: 409, code: 'last_admin_protected',
    });
  });

  it.each(['suspend', 'demote', 'delete'])('keeps one active administrator during concurrent cross-%s and preserves the guarded session', async (operation) => {
    const now = new Date().toISOString();
    for (const [id, status] of [['race-a', 'active'], ['race-b', 'active'], ['race-suspended', 'suspended']]) {
      await env.DB.prepare(`
        INSERT INTO app_users (id, display_name, role, status, created_at, updated_at)
        VALUES (?, ?, 'admin', ?, ?, ?)
      `).bind(id, id, status, now, now).run();
      await env.DB.prepare(`
        INSERT INTO auth_sessions (id, user_id, token_hash, csrf_token_hash, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(`session-${id}`, id, `token-${id}`, `csrf-${id}`, now, new Date(Date.now() + 86_400_000).toISOString()).run();
    }

    // Cả hai request đã đọc quyền cũ trước khi cho các lệnh ghi chạy trên D1 thật.
    let mutationsReady = 0;
    let releaseMutations;
    const mutationsGate = new Promise(resolve => { releaseMutations = resolve; });
    async function waitForBothMutations() {
      if (++mutationsReady === 2) releaseMutations();
      await mutationsGate;
    }
    const queries = [];
    let d1Calls = 0;
    const guardedEnv = { DB: {
      prepare(sql) {
        queries.push(sql);
        const statement = env.DB.prepare(sql);
        return { bind(...values) {
          const bound = statement.bind(...values);
          if (sql.trimStart().startsWith('SELECT')) {
            return { async first(...args) { d1Calls++; return bound.first(...args); } };
          }
          if (!sql.includes('DELETE FROM app_users')) return bound;
          return { async run() { await waitForBothMutations(); d1Calls++; return bound.run(); } };
        } };
      },
      async batch(statements) {
        await waitForBothMutations();
        d1Calls++;
        return env.DB.batch(statements);
      },
    } };
    const actor = id => ({ appUserId: id, csrfToken: `csrf-${id}`, role: 'admin', userId: id });
    const a = createAdminMembersService(guardedEnv, actor('race-a'));
    const b = createAdminMembersService(guardedEnv, actor('race-b'));
    const update = operation === 'suspend' ? { status: 'suspended' } : { role: 'user' };
    const results = await Promise.allSettled(operation === 'delete'
      ? [a.remove('race-b'), b.remove('race-a')]
      : [a.update('race-b', update), b.update('race-a', update)]);

    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected')).toMatchObject([
      { reason: { status: 409, code: 'last_admin_protected' } },
    ]);
    const active = await env.DB.prepare("SELECT id FROM app_users WHERE role = 'admin' AND (status IS NULL OR status = 'active')").all();
    expect(active.results).toHaveLength(1);
    const remainingId = active.results[0].id;
    await expect(env.DB.prepare('SELECT revoked_at FROM auth_sessions WHERE user_id = ?').bind(remainingId).first()).resolves.toEqual({ revoked_at: null });
    if (operation !== 'delete') {
      const changedId = remainingId === 'race-a' ? 'race-b' : 'race-a';
      await expect(env.DB.prepare('SELECT revoked_at FROM auth_sessions WHERE user_id = ?').bind(changedId).first()).resolves.toEqual({ revoked_at: expect.any(String) });
    }
    expect(queries.length).toBeLessThanOrEqual(operation === 'delete' ? 4 : 7);
    expect(d1Calls).toBeLessThanOrEqual(operation === 'delete' ? 4 : 5);
  });

  it('reconciles divergent pre-migration playback rows per field and per album', () => {
    expect(JSON.parse(String(preMigrationReconciledPlayer.pt_player_state))).toEqual({
      albumId: 'album-a',
      savedAt: 200,
    });
    expect(JSON.parse(String(preMigrationReconciledPlayer.pt_album_positions))).toEqual({
      'album-a': { currentTime: 20, savedAt: 200 },
      'album-b': { currentTime: 30, savedAt: 300 },
    });
    expect(JSON.parse(String(preMigrationReconciledPlayer.pt_recent_albums))).toEqual([
      'album-a',
      'album-b',
    ]);
  });

  it('creates the aggregate representation for a dedicated-only legacy user', () => {
    expect(dedicatedOnlyReconciledRows.aggregate).toBeTruthy();
    expect(JSON.parse(String(dedicatedOnlyReconciledRows.aggregate.pt_album_positions))).toEqual({
      'album-a': { currentTime: 20, savedAt: 200 },
      'album-b': { currentTime: 30, savedAt: 300 },
    });
    expect(JSON.parse(String(dedicatedOnlyReconciledRows.player.pt_recent_albums))).toEqual([
      'album-a',
      'album-b',
    ]);
  });

  it('preserves presence heartbeat caps and stable limiter keys', async () => {
    const keys = [];
    const service = createPresenceService(context());
    const limiter = { limit: async ({ key }) => { keys.push(key); return { success: true }; } };
    const userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) EdgA/126.0.0.0 Mobile/15E148 Safari/604.1';
    const first = await service.heartbeat({
      visitorId: 'visitor-aaaaaaaaaaaaaaaaaaaa',
      clientAddress: '127.0.0.1',
      now: 1_000_000,
      rateLimiter: limiter,
      currentPath: '/tu-tap?tab=chanh-niem#section',
      userAgent,
    });
    const second = await service.heartbeat({
      visitorId: 'visitor-bbbbbbbbbbbbbbbbbbbb',
      clientAddress: '127.0.0.1',
      now: 1_001_000,
      rateLimiter: limiter,
      currentPath: '/tu-tap?tab=chanh-niem#section',
      userAgent,
    });
    expect(first).toMatchObject({ enabled: true, activeCount: 1 });
    expect(second.activeCount).toBe(2);
    expect(first).toMatchObject({ heartbeatIntervalSeconds: 60, activeWindowSeconds: 120 });
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
    expect(vietnamDateKey(1_000_000)).toBe('1970-01-01');
    expect(vietnamDateKey(Date.UTC(2026, 7, 5, 16, 59, 59, 999))).toBe('2026-08-05');
    expect(vietnamDateKey(Date.UTC(2026, 7, 5, 17, 0, 0))).toBe('2026-08-06');
    expect(visitorClientMetadata(userAgent)).toEqual({
      browserName: 'Microsoft Edge',
      deviceType: 'Điện thoại',
      operatingSystem: 'iOS / iPadOS',
    });
    expect(normalizeVisitorPath(' /admin/dashboard?tab=traffic#overview ')).toBe('/admin/dashboard');
    expect(normalizeVisitorPath('//evil.example')).toBe('/');
    const stored = await env.DB.prepare(
      'SELECT browser_name, current_path, device_type, operating_system, display_name, role, principal_id FROM active_visitors ORDER BY last_seen_at DESC LIMIT 1',
    ).first();
    expect(stored).toMatchObject({
      browser_name: 'Microsoft Edge',
      current_path: '/tu-tap',
      device_type: 'Điện thoại',
      operating_system: 'iOS / iPadOS',
      display_name: null,
      role: null,
      principal_id: null,
    });
  });

  it('projects practice presence only for an authenticated opted-in profile', async () => {
    const principal = {
      appUserId: 'user-1',
      userId: 'user-1',
      displayName: 'Người dùng',
      role: 'user',
    };
    const service = createPresenceService(context(principal));
    const hidden = await service.heartbeat({
      visitorId: 'visitor-practice-hidden-aaaa',
      clientAddress: '127.0.0.2',
      now: 2_000_000,
      practiceVisible: true,
      practiceActivity: 'meditation',
      practiceStartedAt: 1_990_000,
    });
    expect(hidden).toMatchObject({ practicingCount: 0, practitioners: [] });

    await env.DB.prepare(`
      INSERT INTO practice_profiles (
        owner_id, time_zone, leaderboard_opt_in, presence_opt_in, created_at, updated_at
      ) VALUES ('user-1', 'Asia/Ho_Chi_Minh', 0, 1, ?, ?)
    `).bind(new Date().toISOString(), new Date().toISOString()).run();
    await approvePublicProfileFixture('user-1');
    const visible = await service.heartbeat({
      visitorId: 'visitor-practice-visible-aaa',
      clientAddress: '127.0.0.2',
      now: 2_001_000,
      practiceVisible: true,
      practiceActivity: 'meditation',
      practiceStartedAt: 1_991_000,
    });
    expect(visible).toMatchObject({
      practicingCount: 1,
      practitioners: [{ activity: 'meditation', displayName: 'Người dùng', startedAt: 1_991_000 }],
    });

    const disabled = await createPresenceService(context(principal, {
      PRACTICE_COMMUNITY_ENABLED: 'false',
    })).heartbeat({
      visitorId: 'visitor-practice-visible-aaa',
      clientAddress: '127.0.0.2',
      now: 2_002_000,
      practiceVisible: true,
      practiceActivity: 'meditation',
      practiceStartedAt: 1_992_000,
    });
    expect(disabled).toMatchObject({ practicingCount: 0, practitioners: [] });
  });

  it('withdraws public practice presence immediately after profile opt-out without another owner heartbeat', async () => {
    const principal = { appUserId: 'user-1', userId: 'user-1', displayName: 'Người dùng', role: 'user' };
    const community = createPracticeCommunityService(context(principal));
    const settings = { timeZone: 'Asia/Ho_Chi_Minh', leaderboardOptIn: false, selectedBadge: null };
    await community.updateProfile({ ...settings, presenceOptIn: true });
    await approvePublicProfileFixture('user-1');
    const visible = await createPresenceService(context(principal)).heartbeat({
      visitorId: 'visitor-consent-owner-aaaa', clientAddress: '127.0.0.2', now: 2_000_000,
      practiceVisible: true, practiceActivity: 'meditation', practiceStartedAt: 1_990_000,
    });
    expect(visible.practitioners).toHaveLength(1);

    await community.updateProfile({ ...settings, presenceOptIn: false });
    // A different visitor must observe withdrawn consent even before the owner
    // sends another heartbeat and while the old projection is inside its TTL.
    const guest = await createPresenceService(context()).heartbeat({
      visitorId: 'visitor-consent-guest-aaaa', clientAddress: '127.0.0.3', now: 2_001_000,
    });
    expect(guest).toMatchObject({ practicingCount: 0, practitioners: [] });
    expect(await env.DB.prepare('SELECT presence_opt_in FROM practice_profiles WHERE owner_id = ?')
      .bind('user-1').first()).toMatchObject({ presence_opt_in: 0 });
  });

  it.each(['hide', 'logout', 'switch'])('clears prior public practice on %s inside the heartbeat write throttle', async (transition) => {
    const principal = { appUserId: 'user-1', userId: 'user-1', displayName: 'Người dùng', role: 'user' };
    await createPracticeCommunityService(context(principal)).updateProfile({
      timeZone: 'Asia/Ho_Chi_Minh', leaderboardOptIn: false, presenceOptIn: true,
    });
    await approvePublicProfileFixture('user-1');
    const heartbeat = {
      visitorId: 'visitor-principal-transition', clientAddress: '127.0.0.2',
      practiceVisible: true, practiceActivity: 'meditation', practiceStartedAt: 1_990_000,
    };
    expect((await createPresenceService(context(principal)).heartbeat({ ...heartbeat, now: 2_000_000 }))
      .practitioners).toHaveLength(1);
    const nextPrincipal = transition === 'logout' ? null : transition === 'hide' ? principal
      : { appUserId: 'user-2', userId: 'user-2', displayName: 'Tài khoản khác', role: 'user' };
    if (transition === 'switch') {
      await env.DB.prepare("INSERT INTO app_users (id, display_name, role) VALUES ('user-2', 'Tài khoản khác', 'user')").run();
    }
    const hidden = await createPresenceService(context(nextPrincipal)).heartbeat({
      ...heartbeat, now: 2_001_000, practiceVisible: transition !== 'hide',
    });
    expect(hidden).toMatchObject({ practicingCount: 0, practitioners: [] });
    expect(await env.DB.prepare('SELECT principal_id, practice_visible, practice_activity, practice_started_at FROM active_visitors').first())
      .toMatchObject({ principal_id: nextPrincipal?.userId ?? null, practice_visible: 0, practice_activity: null, practice_started_at: null });
  });

  it('drains expired daily analytics across bounded batches and preserves fresh rows', async () => {
    const now = Date.UTC(2026, 7, 6, 12, 0, 0);
    const expiredAt = now - 401 * 24 * 60 * 60 * 1000;
    const inserts = Array.from({ length: 501 }, (_, index) => env.DB.prepare(`
      INSERT INTO visitor_daily_presence
        (visit_date, visitor_id_hash, network_hash, first_seen_at, last_seen_at, heartbeat_count)
      VALUES ('2025-01-01', ?, ?, ?, ?, 1)
    `).bind(`expired-${index}`, `network-${index}`, expiredAt, expiredAt));
    for (let offset = 0; offset < inserts.length; offset += 100) {
      await env.DB.batch(inserts.slice(offset, offset + 100));
    }
    await env.DB.prepare(`
      INSERT INTO visitor_daily_presence
        (visit_date, visitor_id_hash, network_hash, first_seen_at, last_seen_at, heartbeat_count)
      VALUES (?, 'fresh-visitor', 'fresh-network', ?, ?, 1)
    `).bind(vietnamDateKey(now), now, now).run();

    await expect(createPresenceService(context()).purgeExpired(now)).resolves.toEqual({
      hasMore: false,
      purged: 501,
    });
    await expect(env.DB.prepare(
      "SELECT COUNT(*) AS count FROM visitor_daily_presence WHERE visitor_id_hash LIKE 'expired-%'",
    ).first()).resolves.toMatchObject({ count: 0 });
    await expect(env.DB.prepare(
      "SELECT COUNT(*) AS count FROM visitor_daily_presence WHERE visitor_id_hash = 'fresh-visitor'",
    ).first()).resolves.toMatchObject({ count: 1 });
  });

  it('aggregates dashboard history and members without exposing retired live visitors', async () => {
    const now = Date.UTC(2026, 7, 6, 12, 0, 0);
    const today = vietnamDateKey(now);
    const yesterday = vietnamDateKey(now - 24 * 60 * 60 * 1000);
    const monthStart = `${today.slice(0, 7)}-01`;
    const yearStart = `${today.slice(0, 4)}-01-01`;
    const pastDate = vietnamDateKey(now - 6 * 24 * 60 * 60 * 1000);
    const olderDate = vietnamDateKey(now - 36 * 24 * 60 * 60 * 1000);

    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO app_users (id, display_name, role, created_at, updated_at)
        VALUES ('dashboard-ctv', 'Cộng tác viên', 'ctv', ?, ?)
      `).bind(new Date(now).toISOString(), new Date(now).toISOString()),
      env.DB.prepare(`
        INSERT INTO app_users (id, display_name, role, created_at, updated_at)
        VALUES ('dashboard-admin', 'Quản trị viên', 'admin', ?, ?)
      `).bind(new Date(now).toISOString(), new Date(now).toISOString()),
      env.DB.prepare(`
        INSERT INTO baiviet (id, tieu_de, danh_muc, created_at, updated_at, pdf_url)
        VALUES ('dashboard-article-a', 'Bài A', 'KINH PHẬT', ?, ?, '')
      `).bind(new Date(now).toISOString(), new Date(now).toISOString()),
      env.DB.prepare(`
        INSERT INTO baiviet (id, tieu_de, danh_muc, created_at, updated_at, pdf_url)
        VALUES ('dashboard-article-b', 'Bài B', 'CÁC NGHI THỨC', ?, ?, '/assets/pdfs/sample.pdf')
      `).bind(new Date(now).toISOString(), new Date(now).toISOString()),
      env.DB.prepare(`
        INSERT INTO baiviet (id, tieu_de, danh_muc, created_at, updated_at, pdf_url)
        VALUES ('dashboard-article-c', 'Bài C', 'CHUYỆN NHÂN QUẢ', ?, ?, NULL)
      `).bind(new Date(now).toISOString(), new Date(now).toISOString()),
      env.DB.prepare(`
        INSERT INTO phap_thoai (id, tieu_de, visibility, created_at)
        VALUES ('dashboard-talk-public', 'Pháp thoại công khai', 'public', ?)
      `).bind(new Date(now).toISOString()),
      env.DB.prepare(`
        INSERT INTO phap_thoai (id, tieu_de, visibility, created_at)
        VALUES ('dashboard-talk-private', 'Pháp thoại riêng tư', 'private', ?)
      `).bind(new Date(now).toISOString()),
      env.DB.prepare(`
        INSERT INTO luot_xem (bai_viet_id, so_luot, updated_at)
        VALUES ('dashboard-article-a', 37, ?)
      `).bind(new Date(now).toISOString()),
      env.DB.prepare(`
        INSERT INTO binh_luan (id, bai_viet_id, ten, dien_thoai, email, noi_dung, tao_luc)
        VALUES (1, 'dashboard-article-a', 'Khách', '', '', 'Bình luận', ?)
      `).bind(new Date(now).toISOString()),
      env.DB.prepare(`
        INSERT INTO active_visitors
          (visitor_id_hash, network_hash, last_seen_at, principal_id, display_name, role,
           device_type, browser_name, operating_system, current_path, first_seen_at, is_overflow)
        VALUES ('dashboard-visitor-admin', 'network-admin', ?, 'dashboard-admin', '  Quản trị viên  ', 'admin',
          'Máy tính', 'Google Chrome', 'Windows', '/admin/books?tab=traffic', ?, 0)
      `).bind(now + 4_000, now - 30_000),
      env.DB.prepare(`
        INSERT INTO active_visitors
          (visitor_id_hash, network_hash, last_seen_at, principal_id, display_name, role,
           device_type, browser_name, operating_system, current_path, first_seen_at, is_overflow)
        VALUES ('dashboard-visitor-user', 'network-user', ?, 'dashboard-ctv', 'Cộng tác viên', 'ctv',
          'Điện thoại', 'Mozilla Firefox', 'Android', '/tu-tap', ?, 0)
      `).bind(now + 2_000, now - 45_000),
      env.DB.prepare(`
        INSERT INTO active_visitors
          (visitor_id_hash, network_hash, last_seen_at, display_name, device_type,
           browser_name, operating_system, current_path, first_seen_at, is_overflow)
        VALUES ('dashboard-visitor-overflow', 'network-overflow', ?, NULL, 'Nhiều thiết bị',
          'Nhiều trình duyệt', 'Nhiều hệ điều hành', '/phap-thoai', ?, 1)
      `).bind(now + 6_000, now - 60_000),
      env.DB.prepare(`
        INSERT INTO visitor_daily_presence
          (visit_date, visitor_id_hash, network_hash, first_seen_at, last_seen_at, heartbeat_count)
        VALUES (?, 'dashboard-visitor-admin', 'network-admin', ?, ?, 1)
      `).bind(today, now - 30_000, now + 4_000),
      env.DB.prepare(`
        INSERT INTO visitor_daily_presence
          (visit_date, visitor_id_hash, network_hash, first_seen_at, last_seen_at, heartbeat_count)
        VALUES (?, 'dashboard-visitor-user', 'network-user', ?, ?, 1)
      `).bind(today, now - 45_000, now + 2_000),
      env.DB.prepare(`
        INSERT INTO visitor_daily_presence
          (visit_date, visitor_id_hash, network_hash, first_seen_at, last_seen_at, heartbeat_count)
        VALUES (?, 'dashboard-visitor-yesterday', 'network-yesterday', ?, ?, 1)
      `).bind(yesterday, now - 90_000, now - 86_400_000),
      env.DB.prepare(`
        INSERT INTO visitor_daily_presence
          (visit_date, visitor_id_hash, network_hash, first_seen_at, last_seen_at, heartbeat_count)
        VALUES (?, 'dashboard-visitor-past', 'network-past', ?, ?, 1)
      `).bind(pastDate, now - 120_000, now - 6 * 24 * 60 * 60 * 1000),
      env.DB.prepare(`
        INSERT INTO visitor_daily_presence
          (visit_date, visitor_id_hash, network_hash, first_seen_at, last_seen_at, heartbeat_count)
        VALUES (?, 'dashboard-visitor-older', 'network-older', ?, ?, 1)
      `).bind(olderDate, now - 150_000, now - 36 * 24 * 60 * 60 * 1000),
    ]);

    const dashboard = await createAdminDashboardService(context()).getDashboard(now);

    expect(dashboard.generatedAt).toBe(new Date(now).toISOString());
    expect(dashboard.content).toEqual({
      articles: 3,
      pdfs: 1,
      privateTalks: 1,
      publicTalks: 1,
      rituals: 1,
      sutras: 1,
      talks: 2,
    });
    expect(dashboard.engagement).toEqual({ articleViews: 37, comments: 1 });
    expect(dashboard.members).toEqual({ admins: 1, collaborators: 1, members: 3, users: 1 });
    expect(dashboard.system).toEqual({
      analyticsAvailable: true,
      mediaConfigured: true,
      presenceEnabled: false,
    });
    expect(dashboard.traffic.today).toBe(2);
    expect(dashboard.traffic.thisMonth).toBe(3);
    expect(dashboard.traffic.thisYear).toBe(5);
    expect(dashboard.range).toBe('28d');
    expect(dashboard.traffic.rangeVisitors).toBe(4);
    expect(dashboard.traffic.daily).toHaveLength(28);
    expect(dashboard.traffic.daily.find((point) => point.date === today)).toEqual({ date: today, visitors: 2 });
    expect(dashboard.traffic.daily.find((point) => point.date === yesterday)).toEqual({ date: yesterday, visitors: 1 });
    expect(dashboard.traffic.daily.find((point) => point.date === pastDate)).toEqual({ date: pastDate, visitors: 1 });
    expect(olderDate).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
    expect(dashboard.traffic.daily.some((point) => point.date === olderDate)).toBe(false);
    // Các hàng presence cũ vẫn được seed, nhưng không được tái xuất hiện trên dashboard.
    expect(dashboard.onlineVisitorCount).toBe(0);
    expect(dashboard.onlineVisitors).toEqual([]);
    const serialized = JSON.stringify(dashboard);
    for (const identifier of ['dashboard-visitor-admin', 'network-admin', 'dashboard-visitor-overflow']) {
      expect(serialized).not.toContain(identifier);
    }
  });

  it('keeps authenticated presence private while preserving historical analytics', async () => {
    const now = Date.UTC(2026, 8, 4, 10, 0, 0);
    await createPresenceService(context({
      appUserId: 'user-1',
      userId: 'facebook-subject',
      displayName: 'Thành viên Facebook',
      role: 'user',
    })).heartbeat({
      visitorId: 'visitor-facebook-member-aaaa',
      sessionId: 'session-facebook-member-aaaa',
      pageviewId: 'pageview-facebook-member-aaa',
      clientAddress: '127.0.0.9',
      currentPath: '/tu-tap',
      now,
    });

    const dashboard = await createAdminDashboardService(context()).getDashboard(now);
    expect(dashboard.onlineVisitors).toEqual([]);
    expect(dashboard.onlineVisitorCount).toBe(0);
    expect(dashboard.system.presenceEnabled).toBe(false);
    await expect(env.DB.prepare(
      "SELECT account_type FROM analytics_pageviews WHERE principal_id = 'facebook-subject'",
    ).first()).resolves.toMatchObject({ account_type: 'google' });
  });

  it('marks analytics unavailable without fabricating a healthy presence state when migration 0013 is missing', async () => {
    const missingAnalyticsDb = {
      prepare(query) {
        if (String(query).includes('visitor_daily_presence')) {
          throw new Error('D1_ERROR: no such table: visitor_daily_presence');
        }
        return env.DB.prepare(query);
      },
    };
    const dashboard = await createAdminDashboardService(context(null, {
      DB: missingAnalyticsDb,
      PRESENCE_ENABLED: 'true',
    })).getDashboard(Date.UTC(2026, 7, 6, 12, 0, 0));

    expect(dashboard.system).toEqual({
      analyticsAvailable: false,
      mediaConfigured: true,
      presenceEnabled: false,
    });
    expect(dashboard.onlineVisitorCount).toBe(0);
    expect(dashboard.onlineVisitors).toEqual([]);
    expect(dashboard.traffic).toMatchObject({ today: 0, thisMonth: 0, thisYear: 0 });
    expect(dashboard.range).toBe('28d');
    expect(dashboard.traffic.rangeVisitors).toBe(0);
    expect(dashboard.traffic.daily).toHaveLength(28);
    expect(dashboard.traffic.daily.every((point) => point.visitors === 0)).toBe(true);
  });

  it('returns distinct monthly dashboard and analytics buckets for annual ranges', async () => {
    const now = Date.UTC(2026, 7, 6, 12, 0, 0);
    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO visitor_daily_presence
          (visit_date, visitor_id_hash, network_hash, first_seen_at, last_seen_at, heartbeat_count)
        VALUES
          ('2025-08-01', 'annual-repeat', 'annual-network-a', ?, ?, 1),
          ('2025-08-15', 'annual-repeat', 'annual-network-a', ?, ?, 1),
          ('2025-08-20', 'annual-second', 'annual-network-b', ?, ?, 1),
          ('2026-07-31', 'annual-last', 'annual-network-c', ?, ?, 1),
          ('2026-08-01', 'annual-current-month', 'annual-network-d', ?, ?, 1)
      `).bind(now, now, now, now, now, now, now, now, now, now),
      env.DB.prepare(`
        INSERT INTO analytics_pageviews
          (pageview_id_hash, visit_date, visitor_id_hash, session_id_hash, account_type,
           path, source, device_type, browser_name, operating_system, country_code, region_code, city,
           started_at, last_seen_at, heartbeat_count)
        VALUES
          ('annual-pv-1', '2025-08-01', 'annual-repeat', 'annual-session-a', 'guest',
            '/', 'Trực tiếp', 'Máy tính', 'Chrome', 'Windows', 'VN', 'HN', 'Hà Nội', ?, ?, 1),
          ('annual-pv-2', '2025-08-15', 'annual-repeat', 'annual-session-b', 'guest',
            '/tu-tap', 'Trực tiếp', 'Máy tính', 'Chrome', 'Windows', 'VN', 'HN', 'Hà Nội', ?, ?, 1),
          ('annual-pv-3', '2026-07-31', 'annual-last', 'annual-session-c', 'guest',
            '/phap-thoai', 'Trực tiếp', 'Điện thoại', 'Safari', 'iOS', 'VN', 'HCM', 'Hồ Chí Minh', ?, ?, 1),
          ('annual-pv-4', '2026-08-01', 'annual-current-month', 'annual-session-d', 'guest',
            '/', 'Trực tiếp', 'Máy tính', 'Chrome', 'Windows', 'VN', 'HN', 'Hà Nội', ?, ?, 1)
      `).bind(now, now, now, now, now, now, now, now),
    ]);

    const dashboard = await createAdminDashboardService(context()).getDashboard(now, '365d');
    expect(dashboard.range).toBe('365d');
    expect(dashboard.traffic.interval).toBe('month');
    expect(dashboard.traffic.daily).toHaveLength(12);
    expect(dashboard.traffic.daily[0]).toEqual({ date: '2025-08-01', visitors: 2 });
    expect(dashboard.traffic.daily.at(-1)).toEqual({ date: '2026-07-01', visitors: 1 });
    expect(dashboard.traffic.daily.some((point) => point.date === '2026-08-01')).toBe(false);

    const analytics = await createAdminAnalyticsService(context()).getAnalytics('365d', now);
    expect(analytics.interval).toBe('month');
    expect(analytics.daily).toHaveLength(12);
    expect(analytics.daily[0]).toEqual({
      averageDurationSeconds: 0, bounceRate: 100, date: '2025-08-01', pageviews: 2,
      visitors: 1, visits: 2, viewsPerVisit: 1,
    });
    expect(analytics.daily.at(-1)).toEqual({
      averageDurationSeconds: 0, bounceRate: 100, date: '2026-07-01', pageviews: 1,
      visitors: 1, visits: 1, viewsPerVisit: 1,
    });
    expect(analytics.daily.some((point) => point.date === '2026-08-01')).toBe(false);

    const yearDashboard = await createAdminDashboardService(context()).getDashboard(now, 'year');
    expect(yearDashboard.traffic.interval).toBe('month');
    expect(yearDashboard.traffic.daily).toHaveLength(8);
    expect(yearDashboard.traffic.daily[0]).toEqual({ date: '2026-01-01', visitors: 0 });
    expect(yearDashboard.traffic.daily.at(-1)).toEqual({ date: '2026-08-01', visitors: 1 });

    const yearAnalytics = await createAdminAnalyticsService(context()).getAnalytics('year', now);
    expect(yearAnalytics.interval).toBe('month');
    expect(yearAnalytics.daily).toHaveLength(8);
    expect(yearAnalytics.daily[0]).toEqual({
      averageDurationSeconds: 0, bounceRate: 0, date: '2026-01-01', pageviews: 0,
      visitors: 0, visits: 0, viewsPerVisit: 0,
    });
    expect(yearAnalytics.daily.at(-1)).toEqual({
      averageDurationSeconds: 0, bounceRate: 100, date: '2026-08-01', pageviews: 1,
      visitors: 1, visits: 1, viewsPerVisit: 1,
    });
  });

  it('aggregates real analytics pageviews and redacts raw identifiers', async () => {
    const now = Date.UTC(2026, 7, 6, 12, 0, 0);
    const today = vietnamDateKey(now);
    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO analytics_pageviews
          (pageview_id_hash, visit_date, visitor_id_hash, session_id_hash, principal_id, account_type,
           path, source, device_type, browser_name, operating_system, country_code, region_code, city,
           started_at, last_seen_at, heartbeat_count)
        VALUES
          ('pv-1', ?, 'visitor-google-a', 'session-google-a', 'user-google-a', 'google',
            '/admin', 'Google', 'Máy tính', 'Google Chrome', 'Windows', 'VN', 'HN', 'Hà Nội',
            ?, ?, 2),
          ('pv-2', ?, 'visitor-google-b', 'session-google-b', 'user-google-b', 'google',
            '/tu-tap', 'Google', 'Điện thoại', 'Safari', 'iOS / iPadOS', 'VN', 'HCM', 'Hồ Chí Minh',
            ?, ?, 1),
          ('pv-3', ?, 'visitor-guest-a', 'session-guest-a', NULL, 'guest',
            '/phap-thoai', 'Trực tiếp', 'Máy tính', 'Firefox', 'Windows', 'VN', 'DN', 'Đà Nẵng',
            ?, ?, 1),
          ('pv-4', ?, 'visitor-guest-a', 'session-guest-a', NULL, 'guest',
            '/tu-tap', 'Trực tiếp', 'Máy tính', 'Firefox', 'Windows', 'VN', 'DN', 'Đà Nẵng',
            ?, ?, 1),
          ('pv-5', ?, 'visitor-guest-a', 'session-guest-a', NULL, 'guest',
            '/admin', 'Trực tiếp', 'Máy tính', 'Firefox', 'Windows', 'VN', 'DN', 'Đà Nẵng',
            ?, ?, 1)
      `).bind(
        today, now, now,
        today, now - 5_000, now - 5_000,
        today, now, now + 1_080_000,
        today, now, now + 1_080_000,
        today, now, now + 1_080_000,
      ),
    ]);

    const analytics = await createAdminAnalyticsService(context()).getAnalytics('30d', now);
    expect(analytics.available).toBe(true);
    expect(analytics.range).toBe('30d');
    expect(analytics.metrics).toEqual({
      averageDurationSeconds: 360,
      bounceRate: 66.7,
      pageviews: 5,
      uniqueVisitors: 3,
      viewsPerVisit: 1.67,
      visits: 3,
    });
    expect(analytics.daily.find((point) => point.date === today)).toEqual({
      averageDurationSeconds: 360,
      bounceRate: 66.7,
      date: today,
      pageviews: 5,
      visitors: 3,
      visits: 3,
      viewsPerVisit: 1.67,
    });
    expect(analytics.sources).toEqual([
      { label: 'Google', visitors: 2, visits: 2 },
      { label: 'Trực tiếp', visitors: 1, visits: 1 },
    ]);
    expect(analytics.topPages).toEqual([
      { label: '/admin', visitors: 2, pageviews: 2 },
      { label: '/tu-tap', visitors: 2, pageviews: 2 },
      { label: '/phap-thoai', visitors: 1, pageviews: 1 },
    ]);
    expect(JSON.stringify(analytics)).not.toMatch(/pageview_id_hash|session_id_hash|visitor_id_hash|network_hash|clientAddress|rawReferrer|referrer_url/);
  });

  it('falls back cleanly when analytics migration 0014 is missing', async () => {
    const missingAnalyticsDb = {
      prepare(query) {
        if (String(query).includes('analytics_pageviews')) {
          throw new Error('D1_ERROR: no such table: analytics_pageviews');
        }
        return env.DB.prepare(query);
      },
    };
    const analytics = await createAdminAnalyticsService(context(null, {
      DB: missingAnalyticsDb,
      PRESENCE_ENABLED: 'true',
    })).getAnalytics('30d', Date.UTC(2026, 7, 6, 12, 0, 0));

    expect(analytics.available).toBe(false);
    expect(analytics.metrics).toEqual({
      averageDurationSeconds: 0,
      bounceRate: 0,
      pageviews: 0,
      uniqueVisitors: 0,
      viewsPerVisit: 0,
      visits: 0,
    });
    expect(analytics.sources).toEqual([]);
    expect(analytics.topPages).toEqual([]);
    expect(analytics.daily.every((point) => point.pageviews === 0
      && point.visitors === 0
      && point.visits === 0
      && point.viewsPerVisit === 0
      && point.bounceRate === 0
      && point.averageDurationSeconds === 0)).toBe(true);
  });

  it('aggregates community counts and ranking order without leaking internal identifiers', async () => {
    const now = Date.UTC(2026, 7, 6, 12, 0, 0);
    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO app_users (id, display_name, role, avatar_url, created_at, updated_at)
        VALUES ('member-high', 'Người chăm', 'user', NULL, ?, ?)
      `).bind(new Date(now).toISOString(), new Date(now).toISOString()),
      env.DB.prepare(`
        INSERT INTO app_users (id, display_name, role, avatar_url, created_at, updated_at)
        VALUES ('member-middle', 'Bậc tu', 'user', NULL, ?, ?)
      `).bind(new Date(now).toISOString(), new Date(now).toISOString()),
      env.DB.prepare(`
        INSERT INTO app_users (id, display_name, role, avatar_url, created_at, updated_at)
        VALUES ('member-lower', 'Xếp sau', 'user', NULL, ?, ?)
      `).bind(new Date(now).toISOString(), new Date(now).toISOString()),
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
        new Date(now).toISOString(),
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
        new Date(now).toISOString(),
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
        new Date(now).toISOString(),
      ),
      env.DB.prepare(`
        INSERT INTO active_visitors
          (visitor_id_hash, network_hash, last_seen_at, principal_id, display_name, role,
           device_type, browser_name, operating_system, current_path, first_seen_at, is_overflow)
        VALUES
          ('community-visitor-google', 'community-network-google', ?, 'member-high', 'Người chăm', 'user',
            'Máy tính', 'Google Chrome', 'Windows', '/tu-tap', ?, 0),
          ('community-visitor-guest', 'community-network-guest', ?, NULL, NULL, 'guest',
            'Điện thoại', 'Safari', 'iOS / iPadOS', '/phap-thoai', ?, 0),
          ('community-visitor-internal', 'community-network-internal', ?, 'member-lower', 'Xếp sau', 'admin',
            'Máy tính', 'Firefox', 'Windows', '/admin', ?, 0)
      `).bind(
        now - 10_000, now - 30_000,
        now - 8_000, now - 40_000,
        now - 5_000, now - 20_000,
      ),
    ]);

    const community = await createAdminCommunityService(context()).getCommunity('month', now);
    expect(community.online).toEqual({ members: 0, guests: 0, internal: 0, total: 0, visitors: [] });
    expect(community.ranking.map((row) => row.displayName)).toEqual(['Người chăm', 'Bậc tu', 'Xếp sau']);
    expect(community.ranking[0]).toMatchObject({
      activeDays: 3,
      displayName: 'Người chăm',
      logCount: 3,
      rank: 1,
      streak: 3,
      totalsByType: [{ count: 6, type: 'niệm Phật' }],
    });
    expect(community.ranking[1]).toMatchObject({
      activeDays: 2,
      displayName: 'Bậc tu',
      logCount: 3,
      rank: 2,
      streak: 2,
    });
    expect(community.ranking[1].totalsByType).toEqual(expect.arrayContaining([
      { count: 4, type: 'thiền' },
      { count: 1, type: 'tụng kinh' },
    ]));
    expect(community.ranking[1].totalsByType).toHaveLength(2);
    expect(community.ranking[2]).toMatchObject({
      activeDays: 2,
      displayName: 'Xếp sau',
      logCount: 2,
      rank: 3,
      streak: 2,
      totalsByType: [{ count: 2, type: 'thiền' }],
    });
    expect(JSON.stringify(community)).not.toMatch(/internalId|note|visitor_id_hash|network_hash/);
  });

  it('ignores malformed practice dates and bounds legacy practice totals', async () => {
    const now = Date.UTC(2026, 7, 6, 12, 0, 0);
    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO app_users (id, display_name, role, avatar_url, created_at, updated_at)
        VALUES ('member-legacy-practice', 'Bản ghi cũ', 'user', NULL, ?, ?)
      `).bind(new Date(now).toISOString(), new Date(now).toISOString()),
      env.DB.prepare(`
        INSERT INTO user_sync_data
          (id, practice_logs, bookmarks, listened_history, updated_at)
        VALUES (?, ?, '[]', '[]', ?)
      `).bind(
        'member-legacy-practice',
        JSON.stringify([
          { date: '2026-08-06', type: 'thiền', count: '9223372036854775807' },
          { date: '2026-08-05', type: 'thiền', count: '9223372036854775807' },
          { date: '2026-08-05junk', type: 'thiền', count: 9 },
          { date: '2026-02-30', type: 'thiền', count: 9 },
          'not-an-object',
        ]),
        new Date(now).toISOString(),
      ),
    ]);

    const community = await createAdminCommunityService(context()).getCommunity('month', now);
    expect(community.ranking).toEqual([
      expect.objectContaining({
        activeDays: 2,
        displayName: 'Bản ghi cũ',
        logCount: 2,
        streak: 2,
        totalsByType: [{ count: 2_000_000_000, type: 'thiền' }],
      }),
    ]);
  });

  it('keeps sync rollback-compatible while merging unrelated newer state', async () => {
    const service = createSyncService(context({ appUserId: 'user-1', displayName: 'Người dùng', role: 'user' }));
    await env.DB.prepare(`
      INSERT INTO user_sync_data
        (id, practice_logs, bookmarks, listened_history, updated_at, pt_player_state, pt_album_positions, pt_recent_albums)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      'user-1',
      JSON.stringify([{ date: '2026-07-30', time: 30 }]),
      JSON.stringify([{ id: 'article-newer', scrollTop: 120, date: '2026-07-31T02:00:00.000Z' }]),
      JSON.stringify([{ albumId: 'album-newer', savedAt: 200 }]),
      '2026-07-31T02:00:00.000Z',
      JSON.stringify({ albumId: 'album-2', savedAt: 200 }),
      JSON.stringify({
        'album-1': { savedAt: 300, currentTime: 33 },
        'album-2': { savedAt: 200, currentTime: 44 },
      }),
      JSON.stringify([{ albumId: 'album-2', savedAt: 200 }]),
    ).run();

    const merged = await service.putUserSync({
      bookmarks: [{ id: 'article-older', scrollTop: 10, date: '2026-07-30T00:00:00.000Z' }],
      listened_history: [{ albumId: 'album-older', savedAt: 100 }],
      pt_player_state: { albumId: 'album-1', savedAt: 100 },
      pt_album_positions: {
        'album-1': { savedAt: 100, currentTime: 10 },
        'album-3': { savedAt: 400, currentTime: 55 },
      },
      pt_recent_albums: [{ albumId: 'album-3', savedAt: 400 }],
      updated_at: '2026-07-31T01:00:00.000Z',
    });

    expect(merged.bookmarks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'article-newer' }),
      expect.objectContaining({ id: 'article-older' }),
    ]));
    expect(merged.listened_history).toEqual(expect.arrayContaining([
      expect.objectContaining({ albumId: 'album-newer' }),
      expect.objectContaining({ albumId: 'album-older' }),
    ]));
    expect(merged.pt_album_positions['album-1']).toEqual({ savedAt: 300, currentTime: 33 });
    expect(merged.pt_album_positions['album-3']).toEqual({ savedAt: 400, currentTime: 55 });

    const rollbackReadable = await getLegacyUserSync(env, { appUserId: 'user-1' });
    expect(rollbackReadable.bookmarks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'article-newer' }),
      expect.objectContaining({ id: 'article-older' }),
    ]));
    expect(rollbackReadable.pt_album_positions['album-1']).toEqual({ savedAt: 300, currentTime: 33 });
  });

  it('rejects legacy practice writes only after automatic practice cutover', async () => {
    const principal = { appUserId: 'user-1', displayName: 'Người dùng', role: 'user' };
    const enabled = createSyncService(context(principal, { AUTOMATIC_PRACTICE_ENABLED: 'true' }));
    await expect(enabled.putUserSync({ practice_logs: [] })).rejects.toMatchObject({
      code: 'legacy_practice_write_disabled',
      status: 409,
    });
    await expect(enabled.putUserSync({
      sync_tombstones: { practice_logs: [{ key: 'date:2026-09-04' }] },
    })).rejects.toMatchObject({ code: 'legacy_practice_write_disabled' });

    const disabled = createSyncService(context(principal, { AUTOMATIC_PRACTICE_ENABLED: 'false' }));
    await expect(disabled.putUserSync({ practice_logs: [{ date: '2026-09-04', savedAt: 100 }] })).resolves.toMatchObject({
      practice_logs: [{ date: '2026-09-04', savedAt: 100 }],
    });
    await expect(enabled.getUserSync()).resolves.toMatchObject({
      practice_logs: [{ date: '2026-09-04', savedAt: 100 }],
    });
  });

  it('hydrates the dedicated player owner from legacy aggregate state on a new device', async () => {
    await env.DB.prepare(`
      INSERT INTO user_sync_data
        (id, practice_logs, bookmarks, listened_history, updated_at, pt_player_state, pt_album_positions, pt_recent_albums)
      VALUES ('user-1', '[]', '[]', '[]', ?, ?, ?, ?)
    `).bind(
      '2026-07-31T01:00:00.000Z',
      JSON.stringify({ albumId: 'legacy-album', savedAt: 100 }),
      JSON.stringify({ 'legacy-album': { currentTime: 33, savedAt: 100 } }),
      JSON.stringify([{ albumId: 'legacy-album', savedAt: 100 }]),
    ).run();
    const service = createSyncService(context({ appUserId: 'user-1', displayName: 'Người dùng', role: 'user' }));

    await expect(service.getPlayerSync()).resolves.toMatchObject({
      id: 'google_user-1',
      pt_player_state: { albumId: 'legacy-album', savedAt: 100 },
      pt_album_positions: { 'legacy-album': { currentTime: 33, savedAt: 100 } },
      pt_recent_albums: [{ albumId: 'legacy-album', savedAt: 100 }],
    });
    await expect(env.DB.prepare(
      "SELECT pt_player_state FROM pt_player_sync WHERE id = 'google_user-1'",
    ).first()).resolves.toMatchObject({
      pt_player_state: JSON.stringify({ albumId: 'legacy-album', savedAt: 100 }),
    });
  });

  it('converges audio favorites and listen-later through the normalized player owner', async () => {
    const service = createSyncService(context({ appUserId: 'user-1', displayName: 'Người dùng', role: 'user' }));
    await service.putPlayerSync({
      pt_favorite_albums: [{ albumId: 'favorite-a', savedAt: 100 }],
      pt_listen_later_albums: [{ albumId: 'later-a', savedAt: 110 }],
    });
    const merged = await service.putPlayerSync({
      pt_favorite_albums: [{ albumId: 'favorite-b', savedAt: 200 }],
    });

    expect(merged.pt_favorite_albums).toEqual([
      { albumId: 'favorite-b', savedAt: 200 },
      { albumId: 'favorite-a', savedAt: 100 },
    ]);
    expect(merged.pt_listen_later_albums).toEqual([{ albumId: 'later-a', savedAt: 110 }]);
    await expect(env.DB.prepare(`
      SELECT item_type, item_key FROM player_sync_items
      WHERE owner_id = 'user-1' AND item_type IN ('favorite', 'listen_later')
      ORDER BY item_type, item_key
    `).all()).resolves.toMatchObject({ results: [
      { item_type: 'favorite', item_key: 'favorite-a' },
      { item_type: 'favorite', item_key: 'favorite-b' },
      { item_type: 'listen_later', item_key: 'later-a' },
    ] });

    const removed = await service.putPlayerSync({
      pt_favorite_albums: [],
      sync_tombstones: { pt_favorite_albums: [{ key: 'albumId:favorite-a' }] },
    });
    expect(removed.pt_favorite_albums).toEqual([{ albumId: 'favorite-b', savedAt: 200 }]);
    await expect(env.DB.prepare(`
      SELECT payload, deleted_at FROM player_sync_items
      WHERE owner_id = 'user-1' AND item_type = 'favorite' AND item_key = 'favorite-a'
    `).first()).resolves.toMatchObject({ payload: null, deleted_at: expect.any(Number) });
  });

  it('persists saved-audio tombstones across reads and stale device uploads', async () => {
    const service = createSyncService(context({ appUserId: 'user-1', displayName: 'Người dùng', role: 'user' }));
    const staleDevice = {
      pt_player_state: null,
      pt_album_positions: {},
      pt_recent_albums: [],
      pt_favorite_albums: [{ albumId: 'saved-album', savedAt: 100 }],
      pt_listen_later_albums: [{ albumId: 'saved-album', savedAt: 110 }],
    };
    await service.putPlayerSync(staleDevice);
    const removed = await service.putPlayerSync({
      ...staleDevice,
      pt_favorite_albums: [],
      pt_listen_later_albums: [],
      sync_tombstones: {
        pt_favorite_albums: [{ key: 'albumId:saved-album' }],
        pt_listen_later_albums: [{ key: 'albumId:saved-album' }],
      },
    });
    expect(removed.pt_favorite_albums).toEqual([]);
    expect(removed.pt_listen_later_albums).toEqual([]);
    await expect(env.DB.prepare(`
      SELECT item_type, payload, deleted_at FROM player_sync_items
      WHERE owner_id = 'user-1' AND item_key = 'saved-album'
      ORDER BY item_type
    `).all()).resolves.toMatchObject({ results: [
      { item_type: 'favorite', payload: null, deleted_at: expect.any(Number) },
      { item_type: 'listen_later', payload: null, deleted_at: expect.any(Number) },
    ] });
    const reloaded = await service.getPlayerSync();
    expect(reloaded.sync_tombstones).toEqual(removed.sync_tombstones);
    expect(reloaded.pt_favorite_albums).toEqual([]);
    expect(reloaded.pt_listen_later_albums).toEqual([]);

    await service.putPlayerSync(staleDevice);
    const afterStaleUpload = await service.getPlayerSync();
    expect(afterStaleUpload.pt_favorite_albums).toEqual([]);
    expect(afterStaleUpload.pt_listen_later_albums).toEqual([]);
    expect(afterStaleUpload.sync_tombstones).toEqual(removed.sync_tombstones);

    await service.putUserSync({ ...staleDevice, bookmarks: [{ id: 'reading-bookmark', savedAt: 200 }] });
    await expect(service.getUserSync()).resolves.toMatchObject({
      bookmarks: [{ id: 'reading-bookmark', savedAt: 200 }],
      pt_favorite_albums: [],
      pt_listen_later_albums: [],
      sync_tombstones: removed.sync_tombstones,
    });
    await expect(service.getPlayerSync()).resolves.toMatchObject({
      pt_favorite_albums: [],
      pt_listen_later_albums: [],
      sync_tombstones: removed.sync_tombstones,
    });

    const savedAgainAt = Date.parse(removed.sync_tombstones.pt_favorite_albums[0].deletedAt) + 1;
    await service.putPlayerSync({ pt_favorite_albums: [{ albumId: 'saved-album', savedAt: savedAgainAt }] });
    const savedAgain = await service.getPlayerSync();
    expect(savedAgain.pt_favorite_albums).toEqual([{ albumId: 'saved-album', savedAt: savedAgainAt }]);
    expect(savedAgain.pt_listen_later_albums).toEqual([]);
    expect(savedAgain.sync_tombstones.pt_favorite_albums).toBeUndefined();
    expect(savedAgain.sync_tombstones.pt_listen_later_albums).toEqual(removed.sync_tombstones.pt_listen_later_albums);
  });

  it('bridges playback writes in both directions during the rollback window', async () => {
    const principal = { appUserId: 'user-1', displayName: 'Người dùng', role: 'user' };
    const service = createSyncService(context(principal));
    await putLegacyUserSync(new Request(`${APP_ORIGIN}/api/sync`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        practice_logs: [],
        bookmarks: [],
        listened_history: [],
        pt_player_state: { albumId: 'legacy-write', savedAt: 100 },
        pt_album_positions: { 'legacy-write': { currentTime: 21, savedAt: 100 } },
        pt_recent_albums: [{ albumId: 'legacy-write', savedAt: 100 }],
      }),
    }), env, principal);

    await expect(service.getPlayerSync()).resolves.toMatchObject({
      pt_player_state: { albumId: 'legacy-write', savedAt: 100 },
      pt_album_positions: { 'legacy-write': { currentTime: 21, savedAt: 100 } },
    });

    await env.DB.prepare(`
      UPDATE user_sync_data
      SET sync_metadata = ?
      WHERE id = 'user-1'
    `).bind(JSON.stringify({
      bookmarks: { 'id:deleted-bookmark': 1_000 },
      practice_logs: { 'date:2026-07-30': 1_000 },
    })).run();

    await service.putPlayerSync({
      pt_player_state: { albumId: 'rewrite-write', savedAt: 200 },
      pt_album_positions: { 'rewrite-write': { currentTime: 42, savedAt: 200 } },
      pt_recent_albums: [{ albumId: 'rewrite-write', savedAt: 200 }],
      updated_at: '2026-07-31T04:00:00.000Z',
    });

    await expect(getLegacyUserSync(env, principal)).resolves.toMatchObject({
      pt_player_state: { albumId: 'rewrite-write', savedAt: 200 },
      pt_album_positions: { 'rewrite-write': { currentTime: 42, savedAt: 200 } },
    });

    const dataRepository = createDataRepository(env);
    await dataRepository.insert('user_sync_data', {
      id: 'spoofed-owner',
      practice_logs: [],
      bookmarks: [],
      listened_history: [],
      pt_player_state: { albumId: 'stale-legacy-write', savedAt: 50 },
      pt_album_positions: { 'stale-legacy-write': { currentTime: 5, savedAt: 50 } },
      pt_recent_albums: [{ albumId: 'stale-legacy-write', savedAt: 50 }],
      updated_at: '2026-07-31T05:00:00.000Z',
    }, principal, 'id');

    await expect(service.getPlayerSync()).resolves.toMatchObject({
      pt_player_state: { albumId: 'rewrite-write', savedAt: 200 },
      pt_album_positions: { 'rewrite-write': { currentTime: 42, savedAt: 200 } },
    });
    const aggregate = await env.DB.prepare(
      "SELECT pt_player_state, sync_metadata FROM user_sync_data WHERE id = 'user-1'",
    ).first();
    expect(JSON.parse(String(aggregate?.pt_player_state))).toEqual({ albumId: 'rewrite-write', savedAt: 200 });
    expect(JSON.parse(String(aggregate?.sync_metadata))).toMatchObject({
      bookmarks: { 'id:deleted-bookmark': 1_000 },
      practice_logs: { 'date:2026-07-30': 1_000 },
    });

    await dataRepository.insert('pt_player_sync', {
      id: 'spoofed-player-owner',
      pt_player_state: { albumId: 'stale-dedicated-write', savedAt: 40 },
      pt_album_positions: { 'stale-dedicated-write': { currentTime: 4, savedAt: 40 } },
      pt_recent_albums: [{ albumId: 'stale-dedicated-write', savedAt: 40 }],
      updated_at: '2026-07-31T06:00:00.000Z',
    }, principal, 'id');
    await expect(service.getPlayerSync()).resolves.toMatchObject({
      pt_player_state: { albumId: 'rewrite-write', savedAt: 200 },
      pt_album_positions: { 'rewrite-write': { currentTime: 42, savedAt: 200 } },
    });
  });

  it('retries sync compare-and-swap and preserves concurrent writes deterministically', async () => {
    const row = {
      id: 'user-1',
      bookmarks: JSON.stringify([{ id: 'bookmark-a', date: '2026-07-31T00:00:00.000Z' }]),
      practice_logs: '[]',
      listened_history: '[]',
      updated_at: '2026-07-31T00:00:00.000Z',
      pt_player_state: null,
      pt_album_positions: '{}',
      pt_recent_albums: '[]',
      sync_revision: 1,
      sync_metadata: '{}',
    };
    const repository = {
      getUserSync: vi.fn(async () => ({ ...row })),
      createUserSync: vi.fn(async () => false),
      compareAndSetUserSync: vi.fn(async (_id, expectedRevision, values) => {
        if (expectedRevision === 1) {
          Object.assign(row, {
            bookmarks: JSON.stringify([
              { id: 'bookmark-b', date: '2026-07-31T01:00:00.000Z' },
              { id: 'bookmark-a', date: '2026-07-31T00:00:00.000Z' },
            ]),
            updated_at: '2026-07-31T01:00:00.000Z',
            sync_revision: 2,
          });
          return false;
        }
        Object.assign(row, {
          ...values,
          id: 'user-1',
          sync_revision: expectedRevision + 1,
        });
        return true;
      }),
      getPlayerSync: vi.fn(async () => null),
      createPlayerSync: vi.fn(async () => false),
      compareAndSetPlayerSync: vi.fn(async () => false),
    };
    const service = createSyncService(context({ appUserId: 'user-1', displayName: 'Người dùng', role: 'user' }), { repository });

    const merged = await service.putUserSync({
      bookmarks: [{ id: 'bookmark-c', date: '2026-07-31T02:00:00.000Z' }],
      updated_at: '2026-07-31T02:00:00.000Z',
    });

    expect(repository.compareAndSetUserSync).toHaveBeenCalledTimes(2);
    expect(merged.bookmarks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'bookmark-b' }),
      expect.objectContaining({ id: 'bookmark-c' }),
    ]));
  });

  it('propagates bookmark and album-position tombstones without breaking rollback reads', async () => {
    const service = createSyncService(context({ appUserId: 'user-1', displayName: 'Người dùng', role: 'user' }));
    await env.DB.prepare(`
      INSERT INTO user_sync_data
        (id, practice_logs, bookmarks, listened_history, updated_at, pt_player_state, pt_album_positions, pt_recent_albums, sync_revision, sync_metadata)
      VALUES (?, '[]', ?, '[]', ?, NULL, ?, '[]', 1, '{}')
    `).bind(
      'user-1',
      JSON.stringify([{ id: 'bookmark-remove', date: '2026-07-31T00:00:00.000Z' }]),
      '2026-07-31T00:00:00.000Z',
      JSON.stringify({ 'album-remove': { savedAt: 100, currentTime: 9 } }),
    ).run();

    const merged = await service.putUserSync({
      updated_at: '2026-07-31T03:00:00.000Z',
      sync_tombstones: {
        bookmarks: [{ key: 'id:bookmark-remove', deletedAt: '2026-07-31T03:00:00.000Z' }],
        pt_album_positions: [{ key: 'album-remove', deletedAt: '2026-07-31T03:00:00.000Z' }],
      },
    });

    expect(merged.bookmarks).toEqual([]);
    expect(merged.pt_album_positions).toEqual({});
    expect(merged.sync_tombstones?.bookmarks).toEqual([
      expect.objectContaining({ key: 'id:bookmark-remove' }),
    ]);
    expect(merged.sync_tombstones?.pt_album_positions).toEqual([
      expect.objectContaining({ key: 'album-remove' }),
    ]);
    const rollbackReadable = await getLegacyUserSync(env, { appUserId: 'user-1' });
    expect(rollbackReadable.bookmarks).toEqual([]);
    expect(rollbackReadable.pt_album_positions).toEqual({});
  });

  it('records tombstones at server receipt time instead of trusting a future client clock', async () => {
    const service = createSyncService(context({ appUserId: 'user-1', displayName: 'Người dùng', role: 'user' }));
    const before = Date.now();
    const merged = await service.putUserSync({
      updated_at: '2099-01-01T00:00:00.000Z',
      sync_tombstones: {
        bookmarks: [{ key: 'id:future-clock', deletedAt: '2099-01-01T00:00:00.000Z' }],
      },
    });
    const deletedAt = Date.parse(merged.sync_tombstones?.bookmarks?.[0]?.deletedAt);
    expect(deletedAt).toBeGreaterThanOrEqual(before);
    expect(deletedAt).toBeLessThanOrEqual(Date.now() + 1_000);
  });

  it('continues bounded media reconciliation after a poison stale row', async () => {
    const now = new Date().toISOString();
    await env.DB.prepare(`
      INSERT INTO media_operations
        (id, object_key, operation, status, expected_byte_size, created_at)
      VALUES
        ('stale-ok', 'covers/stale-ok.jpg', 'put', 'pending', 10, ?),
        ('stale-poison', 'covers/stale-poison.jpg', 'put', 'pending', 10, ?),
        ('failed-ok', 'covers/failed-ok.jpg', 'put', 'failed', 10, ?)
    `).bind('2026-07-30T00:00:00.000Z', '2026-07-30T00:00:00.000Z', now).run();
    await env.DB.prepare(`
      INSERT INTO media_operations
        (id, object_key, operation, status, expected_byte_size, created_at, cleanup_claimed_at, finalize_started_at)
      VALUES
        ('stale-cleanup-lease', 'covers/stale-cleanup-lease.jpg', 'put', 'failed', 10, ?, ?, NULL),
        ('stale-finalize-lease', 'covers/stale-finalize-lease.jpg', 'put', 'pending', 10, ?, NULL, ?),
        ('fresh-cleanup-lease', 'covers/fresh-cleanup-lease.jpg', 'put', 'failed', 10, ?, ?, NULL)
    `).bind(
      '2026-07-30T00:00:00.000Z', '2026-07-30T00:00:00.000Z',
      '2026-07-30T00:00:00.000Z', '2026-07-30T00:00:00.000Z',
      '2026-07-30T00:00:00.000Z', '2026-07-30T23:55:00.000Z',
    ).run();
    await env.DB.prepare(`
      INSERT INTO media_objects
        (object_key, source_path, byte_size, sha256, content_type, cache_control, baseline, created_at, deleted_at)
      VALUES (?, ?, ?, ?, 'image/jpeg', 'public, max-age=31536000, immutable', 0, ?, ?)
    `).bind(
      'covers/tombstone.jpg',
      'covers/tombstone.jpg',
      10,
      'digest',
      '2026-07-01T00:00:00.000Z',
      '2026-07-01T00:00:00.000Z',
    ).run();
    await env.DB.prepare(`
      INSERT INTO media_operations
        (id, object_key, operation, status, expected_byte_size, created_at, applied_at, purge_after)
      VALUES ('delete-ok', 'covers/tombstone.jpg', 'delete', 'tombstoned', 10, ?, ?, ?)
    `).bind(
      '2026-07-01T00:00:00.000Z',
      '2026-07-01T00:00:00.000Z',
      '2026-07-15T00:00:00.000Z',
    ).run();

    const deletedKeys = [];
    const service = createMediaService({
      ...context(),
      env: {
        ...env,
        MEDIA: {
          head: async () => null,
          put: async () => ({ size: 1 }),
          get: async () => null,
          delete: async (key) => {
            deletedKeys.push(key);
            if (key === 'covers/stale-poison.jpg') throw new Error('poison');
          },
        },
      },
    });

    const result = await service.purgeExpiredMedia(new Date('2026-07-31T00:00:00.000Z'));
    expect(result.failedUploadsPurged).toBe(4);
    expect(result.purged).toBe(1);
    expect(result.cleanupErrors).toContain('stale-poison');
    expect(deletedKeys).toEqual(expect.arrayContaining([
      'covers/stale-ok.jpg',
      'covers/stale-poison.jpg',
      'covers/failed-ok.jpg',
      'covers/stale-cleanup-lease.jpg',
      'covers/stale-finalize-lease.jpg',
      'covers/tombstone.jpg',
    ]));
    expect(deletedKeys).not.toContain('covers/fresh-cleanup-lease.jpg');
    await expect(env.DB.prepare(
      'SELECT status FROM media_operations WHERE id = ?',
    ).bind('stale-poison').first()).resolves.toMatchObject({ status: 'failed' });
  });

  it('aborts a raw upload that exceeds its declared length without creating a media manifest', async () => {
    let stored = false;
    const service = createMediaService(context({ userId: 'ctv-1', role: 'ctv' }, {
      MEDIA: {
        delete: async () => { stored = false; },
        get: async () => null,
        head: async () => null,
        put: async (_key, stream) => {
          const bytes = await new Response(stream).arrayBuffer();
          stored = true;
          return { size: bytes.byteLength };
        },
      },
    }));
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3, 4]));
        controller.enqueue(new Uint8Array([5, 6]));
        controller.close();
      },
    });
    await expect(service.uploadMedia({
      body,
      contentLength: 4,
      contentType: 'image/jpeg',
      deriveDigest: true,
      fileName: 'oversized.jpg',
      idempotencyKey: 'oversized-raw-upload',
      prefix: 'covers',
      userId: 'ctv-1',
    })).rejects.toMatchObject({ status: 413, code: 'invalid_upload_size' });
    await expect(env.DB.prepare('SELECT COUNT(*) AS count FROM media_objects').first()).resolves.toMatchObject({ count: 0 });
    expect(stored).toBe(false);
  });

  it('makes a relative uploaded PDF unreadable immediately after deleting its only article', async () => {
    const runtimeContext = context({ role: 'admin' }, { MEDIA_PUBLIC_BASE_URL: '/api/media' });
    const mediaService = createMediaService(runtimeContext);
    const articlesService = createArticlesService(runtimeContext);
    const pdfBytes = new TextEncoder().encode('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n');
    const uploaded = await mediaService.uploadMedia({
      userId: 'user-1',
      body: new Response(pdfBytes).body,
      contentLength: pdfBytes.byteLength,
      contentType: 'application/pdf',
      deriveDigest: true,
      fileName: 'article-cleanup.pdf',
      idempotencyKey: 'relative-pdf-cleanup-upload',
      prefix: 'pdfs',
    });
    expect(uploaded).toMatchObject({ status: 'applied', byteSize: pdfBytes.byteLength });
    expect(uploaded.url).toBe(`/api/media/${uploaded.objectKey}`);
    const before = await mediaService.getMedia(uploaded.objectKey, new Request(`${APP_ORIGIN}${uploaded.url}`));
    expect(before.status).toBe(200);
    expect(new Uint8Array(await before.arrayBuffer())).toEqual(pdfBytes);

    const [article] = await articlesService.insertTable('baiviet', {
      id: 'relative-pdf-cleanup-article',
      tieu_de: 'PDF cleanup lifecycle',
      noi_dung: '',
      pdf_url: uploaded.url,
      trang_thai: 'Hoàn thành',
    });
    expect(article.pdf_url).toBe(uploaded.url);
    expect(await env.DB.prepare('SELECT pdf_url FROM baiviet WHERE id = ?').bind(article.id).first())
      .toEqual({ pdf_url: uploaded.url });

    await expect(articlesService.deleteTable('baiviet', { id: `eq.${article.id}` })).resolves.toEqual([]);
    expect(await env.DB.prepare('SELECT id FROM baiviet WHERE id = ?').bind(article.id).first()).toBeNull();
    expect.soft(await env.DB.prepare(`
      SELECT object_key, source_field, status, last_error_code
      FROM article_media_cleanup_queue WHERE article_id = ?
    `).bind(article.id).all()).toMatchObject({ results: [{
      object_key: uploaded.objectKey, source_field: 'pdf_url', status: 'tombstoned', last_error_code: null,
    }] });
    expect.soft(await env.DB.prepare('SELECT deleted_at FROM media_objects WHERE object_key = ?')
      .bind(uploaded.objectKey).first()).toEqual({ deleted_at: expect.any(String) });
    await expect(mediaService.getMedia(uploaded.objectKey, new Request(`${APP_ORIGIN}${uploaded.url}`)))
      .rejects.toMatchObject({ status: 404, code: 'media_not_found' });
    const operation = await env.DB.prepare(`
      SELECT status, applied_at, purge_after FROM media_operations
      WHERE object_key = ? AND operation = 'delete'
    `).bind(uploaded.objectKey).first();
    expect(operation).toMatchObject({ status: 'tombstoned' });
    expect(Date.parse(operation.purge_after) - Date.parse(operation.applied_at)).toBe(30 * 86_400_000);
    expect(await env.MEDIA.head(uploaded.objectKey)).not.toBeNull();
  });

  it('deletes articles first and drains failed media tombstones autonomously', async () => {
    await insertLiveMedia('covers/article-cleanup.jpg');
    await insertLiveMedia('pdfs/article-cleanup.pdf');
    await env.DB.prepare(`
      INSERT INTO baiviet
        (id, tieu_de, anh_url, pdf_url, created_at, updated_at)
      VALUES ('article-cleanup', 'Article', ?, ?, ?, ?)
    `).bind(
      'https://media.quangtu.vn/covers/article-cleanup.jpg',
      'https://media.quangtu.vn/pdfs/article-cleanup.pdf',
      '2026-07-31T00:00:00.000Z',
      '2026-07-31T00:00:00.000Z',
    ).run();
    let failPdf = true;
    const calls = [];
    const idempotencyKeys = [];
    const service = createArticlesService(context({ role: 'admin' }), {
      mediaService: {
        tombstoneMediaForCleanup: async (rawKey, idempotencyKey) => {
          const key = decodeURIComponent(rawKey);
          calls.push(key);
          if (key === 'pdfs/article-cleanup.pdf') idempotencyKeys.push(idempotencyKey);
          if (key === 'pdfs/article-cleanup.pdf' && failPdf) {
            throw new ServerInputError(502, 'media_cleanup_failed', 'retry');
          }
          return { status: 'tombstoned', objectKey: key };
        },
      },
    });

    await service.deleteTable('baiviet', { id: 'eq.article-cleanup' });
    await expect(env.DB.prepare('SELECT id FROM baiviet WHERE id = ?').bind('article-cleanup').first()).resolves.toBeNull();
    await expect(env.DB.prepare(`
      SELECT source_field, status
      FROM article_media_cleanup_queue
      WHERE article_id = 'article-cleanup'
      ORDER BY source_field
    `).all()).resolves.toMatchObject({
      results: [
        { source_field: 'anh_url', status: 'tombstoned' },
        { source_field: 'pdf_url', status: 'failed' },
      ],
    });

    failPdf = false;
    await expect(service.drainMediaCleanupQueue()).resolves.toMatchObject({
      cleanupErrors: [],
      failed: 0,
      processed: 1,
      retained: 0,
      tombstoned: 1,
    });
    await expect(env.DB.prepare(`
      SELECT status
      FROM article_media_cleanup_queue
      WHERE article_id = 'article-cleanup' AND source_field = 'pdf_url'
    `).first()).resolves.toMatchObject({ status: 'tombstoned' });
    expect(calls.filter((key) => key === 'covers/article-cleanup.jpg')).toHaveLength(1);
    expect(calls.filter((key) => key === 'pdfs/article-cleanup.pdf')).toHaveLength(2);
    expect(idempotencyKeys[0]).toBe(idempotencyKeys[1]);
    expect(idempotencyKeys[0].length).toBeLessThanOrEqual(128);
  });

  it('retains media referenced by live articles across every supported reference form', async () => {
    const configuredBase = 'https://cdn.example.test/public-media';
    const references = [
      ['raw-reference', 'covers/shared-raw.jpg'],
      ['canonical-reference', 'https://media.quangtu.vn/covers/shared-canonical.jpg'],
      ['configured-reference', `${configuredBase}/pdfs/shared-configured.pdf`],
      ['api-reference', '/api/media/content/shared-api.png'],
    ];
    const now = '2026-07-31T00:00:00.000Z';
    const queuedKeys = [
      'covers/shared-raw.jpg',
      'covers/shared-canonical.jpg',
      'pdfs/shared-configured.pdf',
      'content/shared-api.png',
    ];
    for (const objectKey of queuedKeys) await insertLiveMedia(objectKey, now);
    for (const [id, reference] of references) {
      await env.DB.prepare(`
        INSERT INTO baiviet (id, tieu_de, anh_url, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `).bind(id, id, reference, now, now).run();
    }
    for (const [index, objectKey] of queuedKeys.entries()) {
      await env.DB.prepare(`
        INSERT INTO article_media_cleanup_queue
          (article_id, object_key, source_field, status, created_at, updated_at)
        VALUES (?, ?, 'anh_url', 'pending', ?, ?)
      `).bind(`deleted-${index}`, objectKey, now, now).run();
    }
    const tombstoneMediaForCleanup = vi.fn();
    const service = createArticlesService(context(null, { MEDIA_PUBLIC_BASE_URL: configuredBase }), {
      mediaService: { tombstoneMediaForCleanup },
    });

    await expect(service.drainMediaCleanupQueue()).resolves.toEqual({
      cleanupErrors: [],
      failed: 0,
      processed: 4,
      retained: 4,
      tombstoned: 0,
    });
    expect(tombstoneMediaForCleanup).not.toHaveBeenCalled();
    await expect(env.DB.prepare(`
      SELECT COUNT(*) AS count
      FROM article_media_cleanup_queue
      WHERE status = 'tombstoned'
    `).first()).resolves.toMatchObject({ count: 4 });
  });

  it('does not drain a queued cleanup intent until its source article is deleted', async () => {
    const now = '2026-07-31T00:00:00.000Z';
    await insertLiveMedia('covers/source.jpg', now);
    await env.DB.prepare(`
      INSERT INTO baiviet (id, tieu_de, anh_url, created_at, updated_at)
      VALUES ('source-still-live', 'Source', 'covers/source.jpg', ?, ?)
    `).bind(now, now).run();
    await env.DB.prepare(`
      INSERT INTO article_media_cleanup_queue
        (article_id, object_key, source_field, status, created_at, updated_at)
      VALUES ('source-still-live', 'covers/source.jpg', 'anh_url', 'pending', ?, ?)
    `).bind(now, now).run();
    const tombstoneMediaForCleanup = vi.fn(async () => ({ status: 'tombstoned' }));
    const service = createArticlesService(context(), {
      mediaService: { tombstoneMediaForCleanup },
    });

    await expect(service.drainMediaCleanupQueue()).resolves.toMatchObject({ processed: 0 });
    expect(tombstoneMediaForCleanup).not.toHaveBeenCalled();
    await expect(env.DB.prepare(`
      SELECT status FROM article_media_cleanup_queue WHERE article_id = 'source-still-live'
    `).first()).resolves.toMatchObject({ status: 'pending' });

    await env.DB.prepare("DELETE FROM baiviet WHERE id = 'source-still-live'").run();
    await expect(service.drainMediaCleanupQueue()).resolves.toMatchObject({
      processed: 1,
      tombstoned: 1,
    });
    expect(tombstoneMediaForCleanup).toHaveBeenCalledOnce();
  });

  it('atomically retains media when a reference appears between precheck and tombstone', async () => {
    const now = '2026-07-31T00:00:00.000Z';
    await env.DB.prepare(`
      INSERT INTO media_objects
        (object_key, source_path, byte_size, sha256, content_type, cache_control, baseline, created_at)
      VALUES ('covers/race.jpg', 'covers/race.jpg', 4, 'digest', 'image/jpeg', 'public', 0, ?)
    `).bind(now).run();
    await env.DB.prepare(`
      INSERT INTO article_media_cleanup_queue
        (article_id, object_key, source_field, status, created_at, updated_at)
      VALUES ('deleted-race', 'covers/race.jpg', 'anh_url', 'pending', ?, ?)
    `).bind(now, now).run();
    const runtimeContext = context(null, { MEDIA_PUBLIC_BASE_URL: '/api/media' });
    const actualMedia = createMediaService(runtimeContext);
    const service = createArticlesService(runtimeContext, {
      mediaService: {
        tombstoneMediaForCleanup: async (rawKey, idempotencyKey, liveReferences) => {
          await env.DB.prepare(`
            INSERT INTO baiviet (id, tieu_de, anh_url, created_at, updated_at)
            VALUES ('concurrent-reference', 'Concurrent', '/api/media/covers/race.jpg', ?, ?)
          `).bind(now, now).run();
          return actualMedia.tombstoneMediaForCleanup(rawKey, idempotencyKey, liveReferences);
        },
      },
    });

    await expect(service.drainMediaCleanupQueue()).resolves.toMatchObject({ retained: 1, tombstoned: 0 });
    await expect(env.DB.prepare(
      "SELECT deleted_at FROM media_objects WHERE object_key = 'covers/race.jpg'",
    ).first()).resolves.toMatchObject({ deleted_at: null });
  });

  it('rejects a new article reference after media entered tombstone state', async () => {
    const now = '2026-07-31T00:00:00.000Z';
    await env.DB.prepare(`
      INSERT INTO media_objects
        (object_key, source_path, byte_size, sha256, content_type, cache_control, baseline, created_at, deleted_at)
      VALUES ('covers/already-deleted.jpg', 'covers/already-deleted.jpg', 4, 'digest', 'image/jpeg', 'public', 0, ?, ?)
    `).bind(now, now).run();
    await expect(env.DB.prepare(`
      INSERT INTO baiviet (id, tieu_de, anh_url, created_at, updated_at)
      VALUES ('late-reference', 'Late', '/api/media/covers/already-deleted.jpg', ?, ?)
    `).bind(now, now).run()).rejects.toThrow('inactive_article_media_reference');
  });

  it('updates positioned article covers while keeping the underlying media protected', async () => {
    const now = '2026-07-31T00:00:00.000Z';
    const objectKey = 'covers/positioned-cover.jpg';
    await insertLiveMedia(objectKey, now);
    await env.DB.prepare(`
      INSERT INTO baiviet (id, tieu_de, anh_url, created_at, updated_at)
      VALUES ('positioned-cover', 'Positioned', ?, ?, ?)
    `).bind(`/api/media/${objectKey}#pos=center%2025%25`, now, now).run();

    const tombstoneMediaForCleanup = vi.fn(async () => ({ status: 'tombstoned' }));
    const service = createArticlesService(context({ role: 'admin' }), {
      mediaService: { tombstoneMediaForCleanup },
    });
    await expect(service.updateTable('baiviet', {
      tieu_de: 'Positioned updated',
      anh_url: `/api/media/${objectKey}#pos=center%2030%25`,
    }, { id: 'eq.positioned-cover' })).resolves.toEqual([]);
    await expect(env.DB.prepare(
      "SELECT tieu_de, anh_url FROM baiviet WHERE id = 'positioned-cover'",
    ).first()).resolves.toMatchObject({
      anh_url: `/api/media/${objectKey}#pos=center%2030%25`,
      tieu_de: 'Positioned updated',
    });
    await expect(env.DB.prepare(
      'UPDATE media_objects SET deleted_at = ? WHERE object_key = ?',
    ).bind(now, objectKey).run()).rejects.toThrow('live_article_media_reference');

    await service.deleteTable('baiviet', { id: 'eq.positioned-cover' });
    expect(tombstoneMediaForCleanup).toHaveBeenCalledWith(
      encodeURIComponent(objectKey),
      expect.stringMatching(/^article-delete:/u),
      expect.arrayContaining([`/api/media/${objectKey}`]),
    );
  });

  it('bounds the global article cleanup batch and keeps deterministic errors', async () => {
    const now = '2026-07-31T00:00:00.000Z';
    for (let index = 0; index < 51; index += 1) {
      await env.DB.prepare(`
        INSERT INTO article_media_cleanup_queue
          (article_id, object_key, source_field, status, created_at, updated_at)
        VALUES (?, ?, 'anh_url', 'pending', ?, ?)
      `).bind(`deleted-${String(index).padStart(2, '0')}`, `covers/${index}.jpg`, now, now).run();
    }
    const service = createArticlesService(context(), {
      mediaService: {
        tombstoneMediaForCleanup: async (rawKey) => {
          const key = decodeURIComponent(rawKey);
          if (key === 'covers/2.jpg' || key === 'covers/10.jpg') {
            throw new ServerInputError(502, 'media_cleanup_failed', 'retry');
          }
        },
      },
    });

    const summary = await service.drainMediaCleanupQueue(500);
    expect(summary.processed).toBe(50);
    expect(summary.failed).toBe(2);
    expect(summary.cleanupErrors).toEqual([...summary.cleanupErrors].sort());
    expect(summary.cleanupErrors).toEqual([
      'deleted-02:anh_url:covers/2.jpg:media_cleanup_failed',
      'deleted-10:anh_url:covers/10.jpg:media_cleanup_failed',
    ]);
    await expect(env.DB.prepare(`
      SELECT COUNT(*) AS count
      FROM article_media_cleanup_queue
      WHERE status = 'pending'
    `).first()).resolves.toMatchObject({ count: 1 });
  });

  it('reads bounded album size metadata in one query with visibility, root scope and unknown bytes preserved', async () => {
    await env.DB.prepare(`
      INSERT INTO phap_thoai (id, tieu_de, tracks, visibility)
      VALUES ('drive-size-album', 'Album', '[]', 'private')
    `).run();
    await env.DB.prepare(`
      INSERT INTO phap_thoai_drive_sources
        (drive_folder_id, album_id, drive_root_folder_id, folder_name, fingerprint, last_scanned_at)
      VALUES ('drive-size-folder', 'drive-size-album', ?, 'Album', 'fingerprint', ?)
    `).bind(ROOT_ID, new Date().toISOString()).run();
    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO phap_thoai_drive_files
          (drive_file_id, drive_folder_id, album_id, file_name, mime_type, byte_size, sort_order)
        VALUES (?, 'drive-size-folder', 'drive-size-album', 'Bài 1.mp3', 'audio/mpeg', 1234567, 0)
      `).bind(FILE_ID),
      env.DB.prepare(`
        INSERT INTO phap_thoai_drive_files
          (drive_file_id, drive_folder_id, album_id, file_name, mime_type, byte_size, sort_order)
        VALUES ('drive-size-unknown', 'drive-size-folder', 'drive-size-album', 'Bài 2.mp3', 'audio/mpeg', NULL, 1)
      `),
    ]);
    const prepared = vi.fn(sql => env.DB.prepare(sql));
    const overrides = {
      GOOGLE_DRIVE_ROOT_FOLDER_ID: ROOT_ID,
      DB: { prepare: prepared, batch: statements => env.DB.batch(statements) },
    };
    const guest = createTalksService(context(null, overrides));
    await expect(guest.readAlbumDownloadSize('drive-size-album')).rejects.toMatchObject({ status: 404 });
    expect(prepared).toHaveBeenCalledTimes(1);
    const ctv = createTalksService(context({ role: 'ctv' }, overrides));
    await expect(ctv.readAlbumDownloadSize('drive-size-album')).resolves.toEqual({
      albumId: 'drive-size-album',
      tracks: [
        { url: `/api/audio/drive/${FILE_ID}`, bytes: 1234567 },
        { url: '/api/audio/drive/drive-size-unknown', bytes: null },
      ],
    });
    expect(prepared).toHaveBeenCalledTimes(2);
    await expect(createTalksService(context({ role: 'admin' }, {
      ...overrides, GOOGLE_DRIVE_ROOT_FOLDER_ID: 'another-root',
    })).readAlbumDownloadSize('drive-size-album')).resolves.toEqual({ albumId: 'drive-size-album', tracks: [] });
    expect(prepared).toHaveBeenCalledTimes(3);
    await env.DB.prepare("UPDATE phap_thoai SET visibility = 'public' WHERE id = 'drive-size-album'").run();
    await expect(guest.readAlbumDownloadSize('drive-size-album')).resolves.toMatchObject({ tracks: [{ bytes: 1234567 }, { bytes: null }] });
    expect(prepared).toHaveBeenCalledTimes(4);
    const routeEvent = method => ({
      request: new Request(`${APP_ORIGIN}/api/talks/drive-size-album/download-size`, { method }),
      locals: { env: context(null, overrides).env, migrationSealed: true },
    });
    const response = await handleApiRequest(routeEvent('GET'));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toMatchObject({ albumId: 'drive-size-album', tracks: [{ bytes: 1234567 }, { bytes: null }] });
    expect(prepared).toHaveBeenCalledTimes(5);
    expect((await handleApiRequest(routeEvent('POST'))).status).toBe(405);
    expect(prepared).toHaveBeenCalledTimes(5);
    await env.DB.prepare("UPDATE phap_thoai SET tieu_de = 'Muôn Kiếp Nhân Sinh' WHERE id = 'drive-size-album'").run();
    await expect(guest.readAlbumDownloadSize('drive-size-album')).rejects.toMatchObject({ status: 403, code: 'audio_online_only' });
    expect(prepared).toHaveBeenCalledTimes(6);
    await expect(guest.readAlbumDownloadSize('%broken')).rejects.toMatchObject({ status: 404 });
    expect(prepared).toHaveBeenCalledTimes(6);
  });

  it('catalog-authorizes Drive audio before the upstream request and keeps safe headers', async () => {
    await env.DB.prepare(`
      INSERT INTO phap_thoai (id, tieu_de, tracks, visibility)
      VALUES ('drive-audio-album', 'Album', '[]', 'private')
    `).run();
    await env.DB.prepare(`
      INSERT INTO phap_thoai_drive_sources
        (drive_folder_id, album_id, drive_root_folder_id, folder_name, fingerprint, last_scanned_at)
      VALUES ('drive-audio-folder', 'drive-audio-album', ?, 'Album', 'fingerprint', ?)
    `).bind(ROOT_ID, new Date().toISOString()).run();
    await env.DB.prepare(`
      INSERT INTO phap_thoai_drive_files
        (drive_file_id, drive_folder_id, album_id, file_name, mime_type, byte_size, sort_order)
      VALUES (?, 'drive-audio-folder', 'drive-audio-album', 'Bài 1.mp3', 'audio/mpeg', 10, 0)
    `).bind(FILE_ID).run();

    const guestFetch = vi.fn();
    const guestService = createTalksService(context(undefined, {
      GOOGLE_DRIVE_ROOT_FOLDER_ID: ROOT_ID,
    }));
    await expect(guestService.getGoogleDriveAudio(
      FILE_ID,
      new Request(`${APP_ORIGIN}/api/audio/drive/${FILE_ID}`),
      { accessToken: 'token', fetchImpl: guestFetch },
    )).rejects.toMatchObject({ status: 404, code: 'audio_not_found' });
    expect(guestFetch).not.toHaveBeenCalled();

    const allowedFetch = vi.fn(async () => new Response('audio', {
      status: 206,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': '5',
        'Content-Range': 'bytes 0-4/10',
        'Set-Cookie': 'must-not-leak=yes',
      },
    }));
    const ctvService = createTalksService(context({ role: 'ctv' }, {
      GOOGLE_DRIVE_ROOT_FOLDER_ID: ROOT_ID,
    }));
    const response = await ctvService.getGoogleDriveAudio(
      FILE_ID,
      new Request(`${APP_ORIGIN}/api/audio/drive/${FILE_ID}`, {
        headers: { Range: 'bytes=0-4' },
      }),
      { accessToken: 'token', fetchImpl: allowedFetch },
    );
    expect(response.status).toBe(206);
    expect(response.headers.has('set-cookie')).toBe(false);
    expect(response.headers.get('content-range')).toBe('bytes 0-4/10');
  });
});

// These cases exercise already-public content, not the moderation approval flow.
async function approveCommentFixture(id) {
  await env.DB.prepare(`UPDATE binh_luan SET moderation_status = 'approved',
    approved_author_name = ten, approved_author_avatar_url = '' WHERE id = ?`).bind(id).run();
}

async function approvePublicProfileFixture(ownerId) {
  await env.DB.prepare(`INSERT INTO ugc_public_profiles (
    public_id, owner_id, submitted_display_name, submitted_avatar_url,
    approved_display_name, approved_avatar_url, moderation_status, submitted_at, approved_revision
  ) SELECT ?, id, display_name, COALESCE(avatar_url, ''), display_name,
    COALESCE(avatar_url, ''), 'approved', '2026-11-04T00:00:00.000Z', 1
    FROM app_users WHERE id = ?
    ON CONFLICT(owner_id) DO UPDATE SET approved_display_name = excluded.approved_display_name,
      approved_avatar_url = excluded.approved_avatar_url, moderation_status = 'approved', approved_revision = ugc_public_profiles.approved_revision + 1`)
    .bind(`fixture-public-${ownerId}`, ownerId).run();
}

function context(principal = null, overrides = {}) {
  return {
    env: {
      ...env,
      APP_ORIGIN,
      RATE_LIMIT_SALT: 'presence-test-salt',
      PRESENCE_ENABLED: 'true',
      PRACTICE_COMMUNITY_ENABLED: 'true',
      ...overrides,
    },
    principal,
    requestId: 'test-request',
  };
}

async function insertLiveMedia(objectKey, createdAt = '2026-07-31T00:00:00.000Z') {
  await env.DB.prepare(`
    INSERT INTO media_objects
      (object_key, source_path, byte_size, sha256, content_type, cache_control, baseline, created_at)
    VALUES (?, ?, 4, 'digest', 'application/octet-stream', 'public', 0, ?)
  `).bind(objectKey, objectKey, createdAt).run();
}

function splitMigration(sql) {
  return sql.trim().split(/;\s*\n\s*\n/gu).map((statement) =>
    statement.trim().endsWith(';') ? statement.trim() : `${statement.trim()};`);
}
