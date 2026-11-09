import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { applyD1Migrations, env } from 'cloudflare:test';
import application from '../../migrations/0001-application-schema.sql?raw';
import auth from '../../migrations/0002-auth-and-session-schema.sql?raw';
import presence from '../../migrations/0008-active-visitors.sql?raw';
import activity from '../../migrations/0017-user-activity-foundations.sql?raw';
import practice from '../../migrations/0020-practice-community-achievements.sql?raw';
import comments from '../../migrations/0022-comment-replies-and-album-plays.sql?raw';
import members from '../../migrations/0026-member-status.sql?raw';
import moderation from '../../migrations/0038-ugc-moderation.sql?raw';
import reportVersions from '../../migrations/0040-ugc-report-versions.sql?raw';
import { handleApiRequest } from '../../src/lib/server/http/api-handler.ts';

const origin = 'http://localhost:8787';
const timestamp = '2026-11-04T00:00:00.000Z';
const session = (id = 'reader', role = 'user') => ({
  id: `session-${id}`, userId: id, appUserId: id, role, csrfToken: 'route-csrf',
  email: `${id}@example.test`, displayName: id, avatarUrl: null, rawToken: 'fixture',
  expiresAt: '2099-01-01T00:00:00.000Z', identityId: null, authProvider: 'google',
});

function route(path, { principal = null, method = 'GET', body, csrf = true } = {}) {
  const headers = { Origin: origin, 'Content-Type': 'application/json' };
  if (csrf) headers['X-CSRF-Token'] = 'route-csrf';
  return handleApiRequest({
    request: new Request(`${origin}${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }),
    locals: { env: { ...env, APP_ORIGIN: origin, RATE_LIMIT_SALT: 'route-fixture' },
      session: principal, migrationSealed: true, requestId: 'moderation-route-test' },
  });
}

beforeAll(async () => {
  await applyD1Migrations(env.DB, [application, auth, presence, activity, practice, comments, members, moderation, reportVersions]
    .map((sql, index) => ({ name: `community-route-${index}.sql`, queries: sql.trim().split(/;\s*\n\s*\n/gu)
      .map(statement => statement.trim().endsWith(';') ? statement.trim() : `${statement.trim()};`) })));
});

beforeEach(async () => {
  for (const table of ['ugc_reports', 'ugc_user_blocks', 'binh_luan', 'ugc_public_profiles', 'baiviet', 'app_users']) {
    await env.DB.prepare(`DELETE FROM ${table}`).run();
  }
  for (const [id, role] of [['reader', 'user'], ['author', 'user'], ['admin', 'admin'], ['editor', 'ctv']]) {
    await env.DB.prepare('INSERT INTO app_users (id, email, display_name, role) VALUES (?, ?, ?, ?)')
      .bind(id, `${id}@example.test`, id, role).run();
    await env.DB.prepare(`INSERT INTO ugc_public_profiles
      (public_id, owner_id, submitted_display_name, approved_display_name, moderation_status, submitted_at, approved_revision)
      VALUES (?, ?, ?, ?, 'approved', ?, 1)`).bind(`public-${id}`, id, id, id, timestamp).run();
  }
  await env.DB.prepare("INSERT INTO baiviet (id, tieu_de) VALUES ('article', 'Article')").run();
  for (const [id, owner, status] of [[1, 'author', 'approved'], [2, 'reader', 'pending'], [3, 'reader', 'rejected'], [4, 'author', 'pending']]) {
    await env.DB.prepare(`INSERT INTO binh_luan
      (id, bai_viet_id, ten, email, dien_thoai, noi_dung, tao_luc, author_user_id,
       moderation_status, moderation_reason, approved_author_name)
      VALUES (?, 'article', ?, 'private@example.test', '0900000000', ?, ?, ?, ?, 'private reason', ?)`)
      .bind(id, owner, `comment-${id}`, timestamp, owner, status, owner).run();
  }
});

describe('central community moderation routes with migrated D1', () => {
  it('keeps old dedicated reads approved-only; includeOwn exposes only this reader drafts and reasons', async () => {
    const old = await route('/api/articles/article/comments', { principal: session() });
    expect(old.status).toBe(200);
    expect((await old.json()).map(row => row.id)).toEqual([1]);
    const own = await route('/api/articles/article/comments?includeOwn=1', { principal: session() });
    expect(own.status).toBe(200);
    const rows = await own.json();
    expect(rows.map(row => row.id)).toEqual([1, 2, 3]);
    expect(rows[0]).not.toHaveProperty('moderationReason');
    expect(rows[1]).toMatchObject({ isOwnProfile: true, moderationStatus: 'pending', moderationReason: 'private reason' });
    for (const row of rows) {
      expect(row).not.toHaveProperty('email');
      expect(row).not.toHaveProperty('dien_thoai');
    }
    const anonymous = await route('/api/articles/article/comments?includeOwn=1');
    expect((await anonymous.json()).map(row => row.id)).toEqual([1]);
  });

  it('keeps generic filtering and private contacts consistent, including blocked authors', async () => {
    const path = '/api/data/binh_luan?bai_viet_id=eq.article&select=*&order=id.asc';
    const response = await route(path, { principal: session() });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([{
      id: 1, bai_viet_id: 'article', ten: 'author', noi_dung: 'comment-1', tao_luc: timestamp,
    }]);
    // Explicit private-column requests cannot bypass the public select allowlist.
    const explicit = await route(path.replace('select=*', 'select=id,email,dien_thoai'), { principal: session() });
    expect(explicit.status).toBe(200);
    expect(await explicit.json()).toEqual([{ id: 1 }]);
    const blocked = await route('/api/community/blocks/public-author', { principal: session(), method: 'PUT' });
    expect(blocked.status).toBe(200);
    expect(await blocked.json()).toEqual({ blocked: true });
    for (const endpoint of [path, '/api/articles/article/comments']) {
      const hidden = await route(endpoint, { principal: session() });
      expect(hidden.status).toBe(200);
      expect(await hidden.json()).toEqual([]);
    }
    const publicRead = await route('/api/articles/article/comments');
    expect((await publicRead.json()).map(row => row.id)).toEqual([1]);
  });

  it.each([
    ['/api/community/reports', 'POST', { targetType: 'comment', targetId: '1', reason: 'spam' }],
    ['/api/community/blocks/public-author', 'PUT', undefined],
  ])('requires authentication and CSRF before %s writes', async (path, method, body) => {
    expect((await route(path, { method, body })).status).toBe(401);
    const denied = await route(path, { method, body, principal: session(), csrf: false });
    expect(denied.status).toBe(403);
    expect((await denied.json()).error.code).toBe('invalid_csrf');
    expect((await env.DB.prepare('SELECT COUNT(*) AS count FROM ugc_reports').first()).count).toBe(0);
    expect((await env.DB.prepare('SELECT COUNT(*) AS count FROM ugc_user_blocks').first()).count).toBe(0);
    expect((await route(path, { method, body, principal: session() })).status).toBe(200);
  });

  it('denies CTV moderation and returns 409 for a repeated administrator revision', async () => {
    const path = '/api/admin/community/moderation/comments/2';
    const body = { action: 'approve', revision: 1 };
    expect((await route('/api/admin/community/moderation?kind=comments', { principal: session('editor', 'ctv') })).status).toBe(403);
    expect((await route(path, { method: 'PATCH', body, principal: session('editor', 'ctv') })).status).toBe(403);
    expect((await route(path, { method: 'PATCH', body, principal: session('admin', 'admin'), csrf: false })).status).toBe(403);
    expect((await route(path, { method: 'PATCH', body, principal: session('admin', 'admin') })).status).toBe(200);
    const stale = await route(path, { method: 'PATCH', body, principal: session('admin', 'admin') });
    expect(stale.status).toBe(409);
    expect((await stale.json()).error.code).toBe('moderation_conflict');
    expect(await env.DB.prepare('SELECT moderation_status, moderation_revision FROM binh_luan WHERE id = 2').first())
      .toEqual({ moderation_status: 'approved', moderation_revision: 2 });
  });
});
