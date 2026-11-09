import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { applyD1Migrations, env } from 'cloudflare:test';
import application from '../../migrations/0001-application-schema.sql?raw';
import auth from '../../migrations/0002-auth-and-session-schema.sql?raw';
import visitors from '../../migrations/0008-active-visitors.sql?raw';
import analytics from '../../migrations/0013-admin-dashboard-analytics.sql?raw';
import activity from '../../migrations/0017-user-activity-foundations.sql?raw';
import community from '../../migrations/0020-practice-community-achievements.sql?raw';
import replies from '../../migrations/0022-comment-replies-and-album-plays.sql?raw';
import members from '../../migrations/0026-member-status.sql?raw';
import moderation from '../../migrations/0038-ugc-moderation.sql?raw';
import reportVersions from '../../migrations/0040-ugc-report-versions.sql?raw';
import { createCommunityModerationRepository } from '../../src/lib/server/repositories/community-moderation-repository.ts';
import { createPracticeCommunityRepository } from '../../src/lib/server/repositories/practice-community-repository.ts';
import { createPresenceRepository } from '../../src/lib/server/repositories/presence-repository.ts';
import { createDataRepository } from '../../src/lib/server/repositories/data-repository.ts';

beforeAll(async () => {
  await applyD1Migrations(env.DB, [application, auth, visitors, analytics, activity, community, replies, members].map((sql, index) => ({
    name: `ugc-test-${index}.sql`, queries: sql.split(';').map(part => part.trim()).filter(Boolean).map(part => `${part};`),
  })));
  await env.DB.prepare("INSERT INTO baiviet(id,tieu_de) VALUES ('legacy-article','Legacy article')").run();
  await env.DB.prepare("INSERT INTO binh_luan(bai_viet_id,ten,noi_dung) VALUES ('legacy-article','Legacy','Existing content')").run();
  await applyD1Migrations(env.DB, [{ name: 'ugc-test-moderation.sql', queries: moderation.split(';').map(part => part.trim()).filter(Boolean).map(part => `${part};`) }]);
  await applyD1Migrations(env.DB, [{ name: '0040-ugc-report-versions.sql', queries: reportVersions.split(';').map(part => part.trim()).filter(Boolean).map(part => `${part};`) }]);
});
beforeEach(async () => {
  for (const table of ['active_visitors', 'practice_profiles', 'practice_sessions', 'ugc_reports', 'ugc_user_blocks', 'ugc_public_profiles', 'app_users']) {
    await env.DB.prepare(`DELETE FROM ${table}`).run();
  }
  await env.DB.prepare("DELETE FROM binh_luan WHERE bai_viet_id <> 'legacy-article'").run();
  await env.DB.prepare("DELETE FROM baiviet WHERE id <> 'legacy-article'").run();
  await env.DB.prepare("INSERT INTO baiviet(id,tieu_de) VALUES ('article-a','Article A')").run();
  for (const id of ['a', 'b', 'c']) {
    await env.DB.prepare('INSERT INTO app_users(id,display_name,avatar_url,status) VALUES (?,?,?,?)')
      .bind(id, `Name ${id}`, `https://example.test/${id}.png`, 'active').run();
  }
});
const repository = () => createCommunityModerationRepository(env);
const now = '2026-11-04T00:00:00Z';
async function comment(owner = 'a', content = 'Comment', parentId = null) {
  return repository().createComment(owner, 'article-a', { content, parentId }, `public-${owner}`, now);
}
async function approve(id) {
  await env.DB.prepare("UPDATE binh_luan SET moderation_status='approved' WHERE id=?").bind(id).run();
  await env.DB.prepare(`UPDATE ugc_public_profiles SET approved_revision=approved_revision+1, approved_display_name=(SELECT approved_author_name FROM binh_luan WHERE id=?),
    approved_avatar_url=(SELECT approved_author_avatar_url FROM binh_luan WHERE id=?)
    WHERE owner_id=(SELECT author_user_id FROM binh_luan WHERE id=?) AND approved_display_name IS NULL`).bind(id, id, id).run();
}

describe('UGC moderation SQL and preservation', () => {
  it('preserves the user-approved legacy public rows while keeping subsequent SQL inserts pending', async () => {
    expect(await env.DB.prepare("SELECT moderation_status, noi_dung FROM binh_luan WHERE bai_viet_id='legacy-article'").first())
      .toEqual({ moderation_status: 'approved', noi_dung: 'Existing content' });
    await env.DB.prepare("INSERT INTO binh_luan(bai_viet_id,ten,noi_dung) VALUES ('article-a','New','New content')").run();
    expect(await env.DB.prepare("SELECT moderation_status FROM binh_luan WHERE bai_viet_id='article-a'").first())
      .toEqual({ moderation_status: 'pending' });
  });
  it('withholds pending comments publicly while showing the owner pending/rejected state and private reason', async () => {
    const created = await comment();
    expect(created).toMatchObject({ moderationStatus: 'pending', authorId: 'public-a' });
    expect(await repository().listComments('article-a', null, { after: null, limit: 50 })).toEqual([]);
    expect(await repository().listComments('article-a', 'b', { after: null, limit: 50 })).toEqual([]);
    expect(await repository().listComments('article-a', 'a', { after: null, limit: 50 })).toEqual([]);
    await env.DB.prepare("UPDATE binh_luan SET moderation_status='rejected', moderation_reason='Private reason' WHERE id=?").bind(created.id).run();
    expect(await repository().listComments('article-a', 'a', { after: null, limit: 50 }, false, true))
      .toEqual([expect.objectContaining({ moderationStatus: 'rejected', moderationReason: 'Private reason', isOwnProfile: true })]);
  });
  it('publishes the reviewed identity snapshot rather than a later provider name', async () => {
    const created = await comment(); await approve(created.id);
    await env.DB.prepare("UPDATE app_users SET display_name='Unreviewed replacement' WHERE id='a'").run();
    const [row] = await repository().listComments('article-a', 'b', { after: null, limit: 50 });
    expect(row).toMatchObject({ ten: 'Name a', authorId: 'public-a', moderationStatus: 'approved' });
    expect(row).not.toHaveProperty('moderationReason');
    expect(row).not.toHaveProperty('email');
    expect(row).not.toHaveProperty('dien_thoai');
  });
  it('filters blocked authors before LIMIT and keeps a different viewer unaffected', async () => {
    const first = await comment(); await approve(first.id);
    for (let index = 1; index < 51; index++) {
      await env.DB.prepare("INSERT INTO binh_luan(bai_viet_id,ten,noi_dung,tao_luc,author_user_id,moderation_status,approved_author_name) VALUES ('article-a','Name a','Blocked',?,'a','approved','Name a')").bind(now).run();
    }
    const visible = await comment('c', 'Visible'); await approve(visible.id);
    expect(await repository().block('b', 'public-a', now)).toBe(true);
    expect(await repository().listComments('article-a', 'b', { after: null, limit: 50 }))
      .toEqual([expect.objectContaining({ id: visible.id, noi_dung: 'Visible' })]);
    expect(await repository().listComments('article-a', null, { after: null, limit: 50 })).toHaveLength(50);
    await repository().unblock('b', 'public-a');
    expect(await repository().listComments('article-a', 'b', { after: null, limit: 50 })).toHaveLength(50);
  });
  it('keeps approved replies visible when the parent is removed without erasing another author', async () => {
    const parent = await comment(); await approve(parent.id);
    const reply = await comment('b', 'A reply', parent.id); await approve(reply.id);
    await env.DB.prepare("UPDATE binh_luan SET moderation_status='rejected',noi_dung='' WHERE id=?").bind(parent.id).run();
    expect(await repository().listComments('article-a', null, { after: null, limit: 50 }))
      .toEqual([expect.objectContaining({ id: reply.id, parent_id: parent.id })]);
  });
  it('does not expose another author pending comment through a forged parent ID', async () => {
    const pending = await comment();
    expect(await comment('b', 'Unauthorized reply', pending.id)).toBeNull();
  });
  it('deduplicates reports and preserves acknowledgement after the target is hidden', async () => {
    const created = await comment(); await approve(created.id);
    const input = { targetType: 'comment', targetId: String(created.id), reason: 'spam', details: 'Context' };
    expect(await repository().report('b', input, 'report-one', now)).toBe(true);
    await env.DB.prepare("UPDATE binh_luan SET moderation_status='rejected' WHERE id=?").bind(created.id).run();
    expect(await repository().report('b', input, 'report-two', now)).toBe(true);
    expect(await repository().report('c', input, 'report-three', now)).toBe(false);
    expect(await env.DB.prepare('SELECT COUNT(*) AS total FROM ugc_reports').first()).toEqual({ total: 1 });
  });
  it('receipts a new report after a resolved profile publishes a changed reviewed identity, retaining the previous complaint', async () => {
    await repository().submitProfile('a', 'public-a', now);
    await repository().moderate('profiles', 'public-a', { action: 'approve', revision: 1, reason: '' }, 'c', '2026-11-04T00:01:00Z');
    await repository().report('b', { targetType: 'profile', targetId: 'public-a', reason: 'spam', details: 'Original complaint details' }, 'profile-report', '2026-11-04T00:02:00Z');
    await repository().moderate('reports', 'profile-report', { action: 'resolve', revision: 1, reason: 'Original resolution note' }, 'c', '2026-11-04T00:03:00Z');
    await env.DB.prepare("UPDATE app_users SET display_name='Changed reviewed identity' WHERE id='a'").run();
    const updated = await repository().submitProfile('a', 'unused-public-id', '2026-11-04T00:04:00Z');
    await repository().moderate('profiles', 'public-a', { action: 'approve', revision: updated.revision, reason: '' }, 'c', '2026-11-04T00:05:00Z');
    await expect(repository().report('b', { targetType: 'profile', targetId: 'public-a', reason: 'harassment', details: 'New identity complaint' }, 'second-profile-report', '2026-11-04T00:06:00Z')).resolves.toBe(true);
    const queue = await repository().listModerationQueue('reports', 'c', { after: null, limit: 50 });
    expect(queue.items).toEqual([expect.objectContaining({ reportReason: 'harassment', content: 'New identity complaint',
      target: expect.objectContaining({ displayName: 'Changed reviewed identity' }) })]);
    const retained = await env.DB.prepare("SELECT reason, details, status, moderation_reason FROM ugc_reports WHERE id='profile-report'").first();
    expect(retained).toEqual({ reason: 'spam', details: 'Original complaint details', status: 'resolved', moderation_reason: 'Original resolution note' });
    expect(await env.DB.prepare("SELECT COUNT(*) AS total FROM ugc_reports WHERE reporter_id='b' AND target_type='profile' AND target_id='public-a'").first()).toEqual({ total: 2 });
  });
  it('rejects a self block without storing a block row', async () => {
    const created = await comment(); await approve(created.id);
    expect(await repository().block('a', 'public-a', now)).toBe(false);
    expect(await env.DB.prepare('SELECT COUNT(*) AS total FROM ugc_user_blocks').first()).toEqual({ total: 0 });
  });
  it('versions changed submitted identities while retaining only the previously approved public snapshot', async () => {
    const first = await repository().submitProfile('a', 'public-a', now);
    expect(first).toMatchObject({ revision: 1, moderationStatus: 'pending', approved: null });
    await env.DB.prepare("UPDATE ugc_public_profiles SET approved_display_name=submitted_display_name, approved_avatar_url=submitted_avatar_url, moderation_status='approved',approved_revision=1 WHERE owner_id='a'").run();
    expect(await repository().submitProfile('a', 'unused-id', now)).toMatchObject({ revision: 1, moderationStatus: 'approved' });
    await env.DB.prepare("UPDATE app_users SET display_name='Changed name' WHERE id='a'").run();
    expect(await repository().submitProfile('a', 'unused-id', now)).toMatchObject({ revision: 2, moderationStatus: 'pending',
      submitted: { displayName: 'Changed name' }, approved: { displayName: 'Name a' } });
  });
  it('projects only reviewed unblocked public practice identities before pagination', async () => {
    await seedPublicPractice();
    const publicRepository = createPracticeCommunityRepository(env);
    const page = await publicRepository.listPublicAcceptedActivitiesPage(now, '2026-11-05T00:00:00Z', null, 1, 'b');
    expect(page.results).toEqual([expect.objectContaining({ owner_id: 'a', display_name: 'Reviewed A', public_author_id: 'public-a' })]);
    await repository().block('b', 'public-a', now);
    expect((await publicRepository.listPublicAcceptedActivitiesPage(now, '2026-11-05T00:00:00Z', null, 1, 'b')).results).toEqual([]);
    expect((await publicRepository.listPublicAcceptedActivitiesPage(now, '2026-11-05T00:00:00Z', null, 1, 'c')).results).toHaveLength(1);
  });
  it('uses approved identity and viewer blocks for live practice without per-member lookups', async () => {
    await seedPublicPractice();
    for (const id of ['a', 'b']) await env.DB.prepare("INSERT INTO active_visitors(visitor_id_hash,network_hash,last_seen_at,principal_id,display_name,practice_visible,practice_activity) VALUES (?,?,100,?,'Unreviewed live name',1,'meditation')").bind(id, id, id).run();
    const presenceRepository = createPresenceRepository(env);
    expect(await presenceRepository.listActivePractice(0, 'b')).toEqual([expect.objectContaining({ displayName: 'Reviewed A', authorId: 'public-a', isOwnProfile: false })]);
    await repository().block('b', 'public-a', now);
    expect(await presenceRepository.listActivePractice(0, 'b')).toEqual([]);
  });
  it('keeps blocked-list pages private and removes an unblocked row without changing another viewer', async () => {
    const first = await comment('a'); await approve(first.id);
    const second = await comment('c'); await approve(second.id);
    await repository().block('b', 'public-a', now); await repository().block('b', 'public-c', now);
    const page = await repository().listBlocks('b', { after: null, limit: 1 });
    expect(page.items).toEqual([{ authorId: 'public-a', displayName: 'Name a', avatarUrl: 'https://example.test/a.png', blockedAt: now }]);
    expect(page.nextCursor).toBeTypeOf('string');
    expect((await repository().listBlocks('b', { after: page.nextCursor, limit: 1 })).items).toEqual([expect.objectContaining({ authorId: 'public-c' })]);
    expect((await repository().listBlocks('a', { after: null, limit: 50 })).items).toEqual([]);
    await repository().unblock('b', 'public-a'); await repository().unblock('b', 'public-a');
    expect((await repository().listBlocks('b', { after: null, limit: 50 })).items).toEqual([expect.objectContaining({ authorId: 'public-c' })]);
  });
  it('publishes only a reviewed profile revision and retains old approval while a changed draft is pending', async () => {
    await repository().submitProfile('a', 'public-a', now);
    await env.DB.prepare("UPDATE app_users SET role='admin' WHERE id='c'").run();
    expect(await repository().moderate('profiles', 'public-a', { action: 'approve', revision: 1, reason: '' }, 'c', now)).toBe(true);
    await env.DB.prepare("UPDATE app_users SET display_name='Changed after approval' WHERE id='a'").run();
    const pending = await repository().submitProfile('a', 'unused', now);
    expect(pending).toMatchObject({ moderationStatus: 'pending', approved: { displayName: 'Name a' }, submitted: { displayName: 'Changed after approval' } });
    expect(await repository().moderate('profiles', 'public-a', { action: 'approve', revision: 1, reason: '' }, 'c', now)).toBe(false);
    expect(await repository().moderate('profiles', 'public-a', { action: 'reject', revision: pending.revision, reason: 'Private rejection' }, 'c', now)).toBe(true);
    expect(await repository().getOwnProfile('a')).toMatchObject({ approved: { displayName: 'Name a' }, moderationStatus: 'rejected' });
  });
  it('hides an abusive public profile across comment, ranking and presence without exposing its submitted draft', async () => {
    await seedPublicPractice();
    const created = await comment('a'); await approve(created.id);
    expect(await repository().moderate('profiles', 'public-a', { action: 'hide', revision: 1, reason: '' }, 'c', now)).toBe(true);
    expect(await repository().listComments('article-a', 'b', { after: null, limit: 50 })).toEqual([]);
    expect((await createPracticeCommunityRepository(env).listPublicAcceptedActivitiesPage(now, '2026-11-05T00:00:00Z', null, 50, 'b')).results).toEqual([]);
    expect(await createPresenceRepository(env).listActivePractice(0, 'b')).toEqual([]);
  });
  it('approves the immutable comment and identity in one atomic batch and refuses a stale second decision', async () => {
    const created = await comment('a');
    expect(await repository().moderate('comments', String(created.id), { action: 'approve', revision: 1, reason: '' }, 'c', now)).toBe(true);
    expect(await repository().listComments('article-a', 'b', { after: null, limit: 50 })).toEqual([expect.objectContaining({ id: created.id, ten: 'Name a' })]);
    expect(await repository().moderate('comments', String(created.id), { action: 'hide', revision: 1, reason: '' }, 'c', now)).toBe(false);
    expect(await repository().moderate('comments', String(created.id), { action: 'hide', revision: 2, reason: '' }, 'c', now)).toBe(true);
    expect(await repository().listComments('article-a', 'b', { after: null, limit: 50 })).toEqual([]);
  });
  it('returns bounded admin context including a reply parent and keeps report resolution revision-bound', async () => {
    const parent = await comment('a', 'Approved parent'); await approve(parent.id);
    const reply = await comment('b', 'Pending reply', parent.id);
    const queue = await repository().listModerationQueue('comments', 'c', { after: null, limit: 1 });
    expect(queue.items).toEqual([expect.objectContaining({ id: String(reply.id), parentContent: 'Approved parent', articleTitle: 'Article A', member: expect.objectContaining({ id: 'b' }) })]);
    await repository().report('b', { targetType: 'comment', targetId: String(parent.id), reason: 'spam' }, 'report-one', now);
    const reports = await repository().listModerationQueue('reports', 'c', { after: null, limit: 50 });
    expect(reports.items).toEqual([expect.objectContaining({ id: 'report-one', target: expect.objectContaining({ id: String(parent.id), revision: 1, content: 'Approved parent' }) })]);
    expect(await repository().moderate('reports', 'report-one', { action: 'resolve', revision: 1, reason: '' }, 'c', now)).toBe(true);
    expect(await repository().moderate('reports', 'report-one', { action: 'resolve', revision: 1, reason: '' }, 'c', now)).toBe(false);
  });
  it('preserves legacy table projection, filters and ordering while excluding pending and blocked rows in one SQL', async () => {
    await comment('a', 'Private pending');
    await env.DB.prepare("UPDATE app_users SET email='b@example.test' WHERE id='b'").run();
    const publicComment = await comment('b', 'Public content'); await approve(publicComment.id);
    const queries = [];
    const legacy = createDataRepository({ DB: { prepare(sql) { queries.push(sql); return env.DB.prepare(sql); } } });
    const options = { select: 'id,ten,email', filters: { bai_viet_id: 'eq.article-a', ten: 'eq.Name b' }, order: 'id.desc', limit: 1 };
    expect(await legacy.select('binh_luan', options, { appUserId: 'a', role: 'user' }))
      .toEqual([{ id: publicComment.id, ten: 'Name b' }]);
    expect(queries).toHaveLength(1);
    await repository().block('a', 'public-b', now);
    expect(await legacy.select('binh_luan', options, { appUserId: 'a', role: 'user' })).toEqual([]);
    expect(await legacy.select('binh_luan', options, { appUserId: 'c', role: 'admin' }))
      .toEqual([{ id: publicComment.id, ten: 'Name b', email: 'b@example.test' }]);
  });
  it('preserves a legacy comment array as an atomic server-owned pending batch', async () => {
    await env.DB.prepare("UPDATE app_users SET email='a@example.test' WHERE id='a'").run();
    const result = await repository().createComments('a', [
      { articleId: 'article-a', content: 'First batch comment', parentId: null },
      { articleId: 'article-a', content: 'Second batch comment', parentId: null, phone: '123' },
    ], 'public-a', now);
    expect(result).toEqual([
      expect.objectContaining({ noi_dung: 'First batch comment', ten: 'Name a', moderationStatus: 'pending', authorId: 'public-a' }),
      expect.objectContaining({ noi_dung: 'Second batch comment', ten: 'Name a', moderationStatus: 'pending' }),
    ]);
    expect(result[1]).not.toHaveProperty('email'); expect(result[1]).not.toHaveProperty('dien_thoai');
    expect(await env.DB.prepare('SELECT email,dien_thoai FROM binh_luan WHERE id=?').bind(result[1].id).first())
      .toEqual({ email: 'a@example.test', dien_thoai: '123' });
    expect(await repository().listComments('article-a', null, { after: null, limit: 50 })).toEqual([]);
    const count = await env.DB.prepare("SELECT COUNT(*) AS total FROM binh_luan WHERE bai_viet_id='article-a'").first();
    expect(await repository().createComments('a', [
      { articleId: 'article-a', content: 'Would be partial', parentId: null },
      { articleId: 'missing', content: 'Invalid article', parentId: null },
    ], 'unused', now)).toBeNull();
    expect(await env.DB.prepare("SELECT COUNT(*) AS total FROM binh_luan WHERE bai_viet_id='article-a'").first()).toEqual(count);
  });
  it('rolls back every legacy batch row and identity if an insert fails after validation', async () => {
    await env.DB.prepare("CREATE TRIGGER reject_batch_fixture BEFORE INSERT ON binh_luan WHEN NEW.noi_dung = 'Fail batch fixture' BEGIN SELECT RAISE(ABORT, 'fixture failure'); END").run();
    try {
      await expect(repository().createComments('a', [
        { articleId: 'article-a', content: 'First must roll back', parentId: null },
        { articleId: 'article-a', content: 'Fail batch fixture', parentId: null },
      ], 'public-a', now)).rejects.toThrow();
      expect(await env.DB.prepare("SELECT COUNT(*) AS total FROM binh_luan WHERE bai_viet_id='article-a'").first()).toEqual({ total: 0 });
      expect(await repository().getOwnProfile('a')).toBeNull();
    } finally { await env.DB.prepare('DROP TRIGGER reject_batch_fixture').run(); }
  });
});

async function seedPublicPractice() {
  for (const id of ['a', 'b']) {
    await env.DB.prepare("INSERT INTO practice_profiles(owner_id,leaderboard_opt_in,presence_opt_in,created_at,updated_at) VALUES (?,1,1,?,?)").bind(id, now, now).run();
    await env.DB.prepare("INSERT INTO practice_sessions(id,owner_id,client_session_id,activity_type,status,accepted_count,started_at,completed_at,verification_result,idempotency_key,created_at,updated_at) VALUES (?, ?, ?, 'rosary','completed',18,?,?,'accepted',?,?,?)").bind(`session-${id}`, id, `session-${id}`, now, now, `session-${id}`, now, now).run();
    await repository().submitProfile(id, `public-${id}`, now);
  }
  await env.DB.prepare("UPDATE ugc_public_profiles SET approved_display_name='Reviewed A',approved_avatar_url='',moderation_status='approved',approved_revision=1 WHERE owner_id='a'").run();
}
