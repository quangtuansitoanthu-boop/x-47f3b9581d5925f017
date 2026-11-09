import { beforeAll, beforeEach, expect, it } from 'vitest';
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
import deletion from '../../migrations/0039-account-deletion.sql?raw';
import versions from '../../migrations/0040-ugc-report-versions.sql?raw';
import { createCommunityModerationRepository } from '../../src/lib/server/repositories/community-moderation-repository.ts';

const now = '2026-11-05T00:00:00Z';
const migration = (name, sql) => ({ name, queries: sql.replace(/^\s*--.*$/gmu, '')
  .split(';').map(part => part.trim()).filter(Boolean).map(part => `${part};`) });
let originalReports, originalProfiles, originalComments;
const fixtureOrder = ['app_users', 'baiviet', 'ugc_public_profiles', 'binh_luan', 'ugc_reports'];
const baseline = new Map();
beforeAll(async () => {
  await applyD1Migrations(env.DB, [application, auth, visitors, analytics, activity, community, replies, members, moderation, deletion]
    .map((sql, index) => migration(`report-version-prerequisite-${index}.sql`, sql)));
  for (const [id, name] of [['owner', 'Original owner'], ['pending-owner', 'New candidate'], ['private-owner', 'Private'],
    ['hidden-owner', 'Hidden'], ['reporter', 'Reporter'], ['other-reporter', 'Other reporter'], ['moderator', 'Moderator']]) {
    await env.DB.prepare('INSERT INTO app_users(id,display_name,role,status) VALUES (?,?,?,?)')
      .bind(id, name, id === 'moderator' ? 'admin' : 'user', 'active').run();
  }
  for (const [id, owner, submitted, approved, status, revision] of [
    ['public-owner', 'owner', 'Original owner', 'Original owner', 'approved', 7],
    ['public-pending', 'pending-owner', 'New candidate', 'Old published name', 'pending', 11],
    ['public-private', 'private-owner', 'Private', null, 'pending', 3],
    ['public-hidden', 'hidden-owner', 'Hidden', null, 'rejected', 8],
  ]) await env.DB.prepare(`INSERT INTO ugc_public_profiles(public_id,owner_id,submitted_display_name,submitted_avatar_url,
    approved_display_name,approved_avatar_url,moderation_status,revision,submitted_at,moderated_by,moderated_at,moderation_reason)
    VALUES (?,?,?,'https://example.test/candidate.png',?,'https://example.test/published.png',?,?,?,'moderator',?,'Existing profile note')`)
    .bind(id, owner, submitted, approved, status, revision, now, now).run();
  await env.DB.prepare("INSERT INTO baiviet(id,tieu_de) VALUES ('legacy-article','Legacy article')").run();
  await env.DB.prepare(`INSERT INTO binh_luan(id,bai_viet_id,ten,email,dien_thoai,noi_dung,tao_luc,
    moderation_status,approved_author_name,moderated_by,moderated_at)
    VALUES (99,'legacy-article','Legacy name','legacy@example.test','123','Unchanged legacy body',?,'approved','Legacy name','moderator',?)`).bind(now, now).run();
  for (const [id, reporter, kind, target, reason, status, revision] of [
    ['legacy-resolved', 'reporter', 'profile', 'public-owner', 'spam', 'resolved', 4],
    ['legacy-open', 'reporter', 'comment', '99', 'other', 'open', 1],
    ['legacy-orphan', 'other-reporter', 'profile', 'no-longer-existing', 'offensive', 'resolved', 2],
  ]) await env.DB.prepare(`INSERT INTO ugc_reports(id,reporter_id,target_type,target_id,reason,details,status,
    revision,created_at,moderated_by,moderated_at,moderation_reason) VALUES (?,?,?,?,?,'Original receipt details',?,?,?,'moderator',?,'Original resolution note')`)
    .bind(id, reporter, kind, target, reason, status, revision, now, now).run();
  originalReports = (await env.DB.prepare('SELECT * FROM ugc_reports ORDER BY id').all()).results;
  originalProfiles = (await env.DB.prepare('SELECT * FROM ugc_public_profiles ORDER BY public_id').all()).results;
  originalComments = (await env.DB.prepare('SELECT * FROM binh_luan ORDER BY id').all()).results;
  await applyD1Migrations(env.DB, [migration('0040-ugc-report-versions.sql', versions)]);
  for (const table of fixtureOrder) baseline.set(table, (await env.DB.prepare(`SELECT * FROM ${table}`).all()).results);
});
beforeEach(async () => {
  const statements = [env.DB.prepare('DELETE FROM ugc_user_blocks'),
    ...[...fixtureOrder].reverse().map(table => env.DB.prepare(`DELETE FROM ${table}`))];
  for (const table of fixtureOrder) for (const row of baseline.get(table)) {
    const columns = Object.keys(row);
    statements.push(env.DB.prepare(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`)
      .bind(...columns.map(column => row[column])));
  }
  await env.DB.batch(statements);
});

it('preserves every old receipt/profile/comment field and assigns honest publication baselines', async () => {
  const reports = (await env.DB.prepare('SELECT * FROM ugc_reports ORDER BY id').all()).results;
  expect(reports.map(({ target_revision, ...row }) => row)).toEqual(originalReports);
  expect(reports.every(row => row.target_revision === 0)).toBe(true);
  const profiles = (await env.DB.prepare('SELECT * FROM ugc_public_profiles ORDER BY public_id').all()).results;
  expect(profiles.map(({ approved_revision, ...row }) => row)).toEqual(originalProfiles);
  expect(profiles.map(row => [row.public_id, row.approved_revision])).toEqual([
    ['public-hidden', 0], ['public-owner', 1], ['public-pending', 1], ['public-private', 0],
  ]);
  expect((await env.DB.prepare('SELECT * FROM binh_luan ORDER BY id').all()).results).toEqual(originalComments);
});

it('keeps D1 quick consistency, versioned uniqueness, queue indexes and both deletion FK actions', async () => {
  expect(await env.DB.prepare('PRAGMA quick_check').first()).toEqual({ quick_check: 'ok' });
  expect((await env.DB.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
  const foreignKeys = (await env.DB.prepare("PRAGMA foreign_key_list('ugc_reports')").all()).results;
  expect(foreignKeys).toEqual(expect.arrayContaining([
    expect.objectContaining({ from: 'reporter_id', table: 'app_users', on_delete: 'CASCADE' }),
    expect.objectContaining({ from: 'moderated_by', table: 'app_users', on_delete: 'SET NULL' }),
  ]));
  const indexes = (await env.DB.prepare("PRAGMA index_list('ugc_reports')").all()).results;
  expect(indexes.map(row => row.name)).toEqual(expect.arrayContaining(['idx_ugc_reports_queue', 'idx_ugc_reports_moderator']));
  const unique = indexes.find(row => row.unique === 1 && row.origin === 'u');
  expect(unique.name).toMatch(/^[A-Za-z0-9_]+$/u);
  const columns = (await env.DB.prepare(`PRAGMA index_info('${unique.name}')`).all()).results;
  expect(columns.map(row => row.name)).toEqual(['reporter_id', 'target_type', 'target_id', 'target_revision']);
});

it('keeps historical receipts, deduplicates the current publication and leaves comments at version zero', async () => {
  const repo = createCommunityModerationRepository(env);
  const input = { targetType: 'profile', targetId: 'public-owner', reason: 'harassment', details: 'Current publication complaint' };
  expect(await repo.report('reporter', input, 'current-version-report', now)).toBe(true);
  expect(await repo.report('reporter', input, 'duplicate-current-report', now)).toBe(true);
  expect((await env.DB.prepare("SELECT id,target_revision FROM ugc_reports WHERE reporter_id='reporter' AND target_type='profile' ORDER BY target_revision").all()).results)
    .toEqual([{ id: 'legacy-resolved', target_revision: 0 }, { id: 'current-version-report', target_revision: 1 }]);
  expect(await env.DB.prepare("SELECT status,revision,moderation_reason FROM ugc_reports WHERE id='legacy-resolved'").first())
    .toEqual({ status: 'resolved', revision: 4, moderation_reason: 'Original resolution note' });
  expect(await repo.report('other-reporter', { targetType: 'comment', targetId: '99', reason: 'other' }, 'new-comment-report', now)).toBe(true);
  expect(await env.DB.prepare("SELECT target_revision FROM ugc_reports WHERE id='new-comment-report'").first()).toEqual({ target_revision: 0 });
});

it('advances publication only on approval and never reuses the counter after hiding', async () => {
  const repo = createCommunityModerationRepository(env);
  await env.DB.prepare("UPDATE app_users SET display_name='Changed candidate' WHERE id='owner'").run();
  const submitted = await repo.submitProfile('owner', 'unused', now);
  expect(await env.DB.prepare("SELECT approved_revision FROM ugc_public_profiles WHERE owner_id='owner'").first()).toEqual({ approved_revision: 1 });
  expect(await repo.moderate('profiles', 'public-owner', { action: 'reject', revision: submitted.revision, reason: 'Rejected candidate' }, 'moderator', now)).toBe(true);
  expect(await env.DB.prepare("SELECT approved_revision,approved_display_name FROM ugc_public_profiles WHERE owner_id='owner'").first())
    .toEqual({ approved_revision: 1, approved_display_name: 'Original owner' });
  const rejected = await repo.getOwnProfile('owner');
  await repo.moderate('profiles', 'public-owner', { action: 'hide', revision: rejected.revision, reason: '' }, 'moderator', now);
  expect(await env.DB.prepare("SELECT approved_revision,approved_display_name FROM ugc_public_profiles WHERE owner_id='owner'").first())
    .toEqual({ approved_revision: 1, approved_display_name: null });
  const resubmitted = await repo.submitProfile('owner', 'unused', now);
  await repo.moderate('profiles', 'public-owner', { action: 'approve', revision: resubmitted.revision, reason: '' }, 'moderator', now);
  expect(await env.DB.prepare("SELECT approved_revision,approved_display_name FROM ugc_public_profiles WHERE owner_id='owner'").first())
    .toEqual({ approved_revision: 2, approved_display_name: 'Changed candidate' });
  const comment = await repo.createComment('private-owner', 'legacy-article', { content: 'New reviewed comment', parentId: null }, 'unused', now);
  await repo.moderate('comments', String(comment.id), { action: 'approve', revision: 1, reason: '' }, 'moderator', now);
  expect(await env.DB.prepare("SELECT approved_revision FROM ugc_public_profiles WHERE owner_id='private-owner'").first()).toEqual({ approved_revision: 1 });
});

it('preserves moderator SET NULL and reporter CASCADE after rebuilding receipts', async () => {
  await env.DB.prepare("DELETE FROM app_users WHERE id='moderator'").run();
  expect((await env.DB.prepare('SELECT moderated_by FROM ugc_reports').all()).results.every(row => row.moderated_by === null)).toBe(true);
  await env.DB.prepare("DELETE FROM app_users WHERE id='reporter'").run();
  expect((await env.DB.prepare('SELECT id,details FROM ugc_reports').all()).results)
    .toEqual([{ id: 'legacy-orphan', details: 'Original receipt details' }]);
  expect((await env.DB.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
});

it('does not offer a current profile hide action for an older or historically unknown publication receipt', async () => {
  const repo = createCommunityModerationRepository(env);
  await repo.report('reporter', { targetType: 'profile', targetId: 'public-owner', reason: 'spam', details: 'Complaint about original publication' }, 'publication-a-report', now);
  await env.DB.prepare("UPDATE app_users SET display_name='New reviewed publication' WHERE id='owner'").run();
  const candidate = await repo.submitProfile('owner', 'unused', now);
  await repo.moderate('profiles', 'public-owner', { action: 'approve', revision: candidate.revision, reason: '' }, 'moderator', now);
  await env.DB.prepare("UPDATE ugc_reports SET status='open' WHERE id='legacy-resolved'").run();
  const queue = await repo.listModerationQueue('reports', 'moderator', { after: null, limit: 50 });
  expect(queue.items.find(item => item.id === 'publication-a-report')).toMatchObject({ content: 'Complaint about original publication', target: null });
  expect(queue.items.find(item => item.id === 'legacy-resolved')).toMatchObject({ content: 'Original receipt details', target: null });
});

it('shows the reported approved snapshot while a different candidate is pending and keeps CAS separate from publication epoch', async () => {
  const repo = createCommunityModerationRepository(env);
  await repo.report('reporter', { targetType: 'profile', targetId: 'public-owner', reason: 'other', details: 'About approved identity' }, 'current-publication-report', now);
  await env.DB.prepare("UPDATE app_users SET display_name='Unreviewed candidate' WHERE id='owner'").run();
  const candidate = await repo.submitProfile('owner', 'unused', now);
  const queue = await repo.listModerationQueue('reports', 'moderator', { after: null, limit: 50 });
  expect(queue.items.find(item => item.id === 'current-publication-report')).toMatchObject({
    target: { displayName: 'Original owner', content: 'Original owner', revision: candidate.revision },
  });
});
