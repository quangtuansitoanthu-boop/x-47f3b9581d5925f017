import { beforeAll, expect, it } from 'vitest';
import { applyD1Migrations, env } from 'cloudflare:test';
import application from '../../migrations/0001-application-schema.sql?raw';
import auth from '../../migrations/0002-auth-and-session-schema.sql?raw';
import visitors from '../../migrations/0008-active-visitors.sql?raw';
import analytics from '../../migrations/0013-admin-dashboard-analytics.sql?raw';
import activity from '../../migrations/0017-user-activity-foundations.sql?raw';
import community from '../../migrations/0020-practice-community-achievements.sql?raw';
import replies from '../../migrations/0022-comment-replies-and-album-plays.sql?raw';
import members from '../../migrations/0026-member-status.sql?raw';
import pledges from '../../migrations/0032-thanh-tinh-pledges.sql?raw';
import moderation from '../../migrations/0038-ugc-moderation.sql?raw';
import deletion from '../../migrations/0039-account-deletion.sql?raw';
import reportVersions from '../../migrations/0040-ugc-report-versions.sql?raw';
import { deleteAccount } from '../../src/lib/server/services/account-deletion.ts';

// These selected migrations contain no trigger bodies or semicolons in literals.
const migration = (name, sql) => ({ name, queries: sql.replace(/^\s*--.*$/gmu, '')
  .split(';').map(part => part.trim()).filter(Boolean).map(part => `${part};`) });
const now = '2026-11-04T00:00:00Z';
beforeAll(async () => {
  await applyD1Migrations(env.DB, [application, auth, visitors, analytics, activity, community,
    replies, members, pledges, moderation].map((sql, index) => migration(`deletion-base-${index}.sql`, sql)));
  await env.DB.batch([
    env.DB.prepare("INSERT INTO app_users(id,display_name) VALUES ('creator','Creator'),('member','Member')"),
    env.DB.prepare(`INSERT INTO practice_campaigns VALUES
      ('preserved-campaign','Title','','count',100,'2026-01-01','2099-01-01','active','creator',?,?)`).bind(now, now),
    env.DB.prepare("INSERT INTO practice_campaign_members VALUES ('preserved-campaign','member',?,NULL)").bind(now),
    env.DB.prepare(`INSERT INTO practice_sessions(id,owner_id,client_session_id,activity_type,status,
      accepted_count,verification_result,started_at,completed_at,idempotency_key,created_at,updated_at)
      VALUES ('member-session','member','client','rosary','completed',7,'accepted',?,?,'mutation',?,?)`).bind(now, now, now, now),
    env.DB.prepare(`INSERT INTO practice_campaign_contributions VALUES
      ('preserved-campaign','member-session','member',7,?)`).bind(now),
  ]);
  // Data must exist before the actual D1 migration rebuilds the three tables.
  await applyD1Migrations(env.DB, [migration('0039-account-deletion.sql', deletion)]);
  await applyD1Migrations(env.DB, [migration('0040-ugc-report-versions.sql', reportVersions)]);
});

it('runs 0039 with enforced D1 foreign keys, preserving seeded campaign data and capability', async () => {
  expect(await env.DB.prepare("SELECT schema_version FROM app_schema_capabilities WHERE capability='account-deletion-v1'").first())
    .toEqual({ schema_version: 39 });
  expect(await env.DB.prepare("SELECT created_by FROM practice_campaigns WHERE id='preserved-campaign'").first()).toEqual({ created_by: 'creator' });
  expect(await env.DB.prepare("SELECT owner_id,contribution_value FROM practice_campaign_contributions WHERE campaign_id='preserved-campaign'").all())
    .toMatchObject({ results: [{ owner_id: 'member', contribution_value: 7 }] });
  await expect(env.DB.prepare("INSERT INTO practice_campaign_members VALUES ('preserved-campaign','missing-user',?,NULL)").bind(now).run()).rejects.toThrow();
  expect((await env.DB.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
});

it('deletes private data and author PII while retaining another member’s reply and contribution', async () => {
  await env.DB.batch([
    env.DB.prepare("INSERT INTO baiviet(id,tieu_de) VALUES ('delete-article','Article')"),
    env.DB.prepare(`INSERT INTO binh_luan(id,bai_viet_id,author_user_id,ten,email,dien_thoai,noi_dung,
      approved_author_name,approved_author_avatar_url,moderation_status,moderation_revision)
      VALUES (9001,'delete-article','creator','Creator','private@example.test','private-phone','Own content',
      'Creator','https://example.test/avatar','approved',7)`),
    env.DB.prepare(`INSERT INTO binh_luan(id,bai_viet_id,author_user_id,parent_id,ten,noi_dung,moderation_status)
      VALUES (9002,'delete-article','member',9001,'Member','Other member reply','approved')`),
    env.DB.prepare("INSERT INTO user_sync_data(id,practice_logs,updated_at) VALUES ('creator','[{\"id\":1}]',?)").bind(now),
    env.DB.prepare("INSERT INTO pt_player_sync(id,pt_recent_albums) VALUES ('google_creator','[{\"id\":1}]')"),
    env.DB.prepare("INSERT INTO thanh_tinh_pledges(anon_id_hash,user_id,email,joined_at,last_active_at) VALUES ('pledge','creator','private@example.test',?,?)").bind(now, now),
    env.DB.prepare("INSERT INTO active_visitors(visitor_id_hash,network_hash,last_seen_at,principal_id) VALUES ('visitor','network',1,'creator')"),
    env.DB.prepare("INSERT INTO ugc_public_profiles(public_id,owner_id,submitted_display_name,submitted_at) VALUES ('public-creator','creator','Creator',?)").bind(now),
  ]);
  await deleteAccount(env, { appUserId: 'creator', role: 'user' });
  for (const [table, column, owner] of [['app_users', 'id', 'creator'], ['user_sync_data', 'id', 'creator'],
    ['pt_player_sync', 'id', 'google_creator'], ['thanh_tinh_pledges', 'user_id', 'creator'],
    ['active_visitors', 'principal_id', 'creator'], ['ugc_public_profiles', 'owner_id', 'creator']]) {
    expect(await env.DB.prepare(`SELECT COUNT(*) AS total FROM ${table} WHERE ${column}=?`).bind(owner).first()).toEqual({ total: 0 });
  }
  expect(await env.DB.prepare(`SELECT author_user_id,noi_dung,ten,email,dien_thoai,approved_author_name,
    approved_author_avatar_url,moderation_status,moderation_revision FROM binh_luan WHERE id=9001`).first())
    .toEqual({ author_user_id: null, noi_dung: '', ten: '', email: '', dien_thoai: '', approved_author_name: null,
      approved_author_avatar_url: null, moderation_status: 'rejected', moderation_revision: 8 });
  expect(await env.DB.prepare("SELECT author_user_id,parent_id,noi_dung FROM binh_luan WHERE id=9002").first())
    .toEqual({ author_user_id: 'member', parent_id: 9001, noi_dung: 'Other member reply' });
  expect(await env.DB.prepare("SELECT created_by FROM practice_campaigns WHERE id='preserved-campaign'").first()).toEqual({ created_by: null });
  expect(await env.DB.prepare("SELECT owner_id,contribution_value FROM practice_campaign_contributions WHERE campaign_id='preserved-campaign'").all())
    .toMatchObject({ results: [{ owner_id: 'member', contribution_value: 7 }] });
  expect(await env.DB.prepare("SELECT owner_id FROM practice_campaign_members WHERE campaign_id='preserved-campaign'").all())
    .toMatchObject({ results: [{ owner_id: 'member' }] });
  expect((await env.DB.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
});

it('retains the final administrator and private data on D1', async () => {
  await env.DB.prepare("INSERT INTO app_users(id,role) VALUES ('last-admin','admin')").run();
  await env.DB.prepare("INSERT INTO pt_player_sync(id,pt_recent_albums) VALUES ('google_last-admin','[{\"id\":2}]')").run();
  await expect(deleteAccount(env, { appUserId: 'last-admin', role: 'admin' }))
    .rejects.toMatchObject({ status: 409, code: 'last_admin_protected' });
  expect(await env.DB.prepare("SELECT role FROM app_users WHERE id='last-admin'").first()).toEqual({ role: 'admin' });
  expect(await env.DB.prepare("SELECT pt_recent_albums FROM pt_player_sync WHERE id='google_last-admin'").first())
    .toEqual({ pt_recent_albums: '[{"id":2}]' });
});
