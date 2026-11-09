import { beforeAll, beforeEach, expect, it } from 'vitest';
import { applyD1Migrations, env } from 'cloudflare:test';
import application from '../../migrations/0001-application-schema.sql?raw';
import auth from '../../migrations/0002-auth-and-session-schema.sql?raw';
import visitors from '../../migrations/0008-active-visitors.sql?raw';
import activity from '../../migrations/0017-user-activity-foundations.sql?raw';
import community from '../../migrations/0020-practice-community-achievements.sql?raw';
import replies from '../../migrations/0022-comment-replies-and-album-plays.sql?raw';
import members from '../../migrations/0026-member-status.sql?raw';
import moderation from '../../migrations/0038-ugc-moderation.sql?raw';
import mindful from '../../migrations/0041-mindful-community.sql?raw';
import inbox from '../../migrations/0043-mindful-reaction-inbox.sql?raw';
import { createMindfulCommunityService } from '../../src/lib/server/services/mindful-community.ts';
import { handleApiRequest } from '../../src/lib/server/http/api-handler.ts';
import { createMindfulNotificationsRepository } from '../../src/lib/server/repositories/mindful-notifications-repository.ts';
import { createMindfulCommunityRepository } from '../../src/lib/server/repositories/mindful-community-repository.ts';

const NOW = '2026-11-09T02:00:00.000Z';
let historicalRows;
let previousReactionMeta;
const split = sql => {
  const triggers = [...sql.matchAll(/CREATE TRIGGER[\s\S]*?END;/gu)].map(match => match[0]);
  return [...sql.replace(/CREATE TRIGGER[\s\S]*?END;/gu, '').replace(/^\s*--.*$/gmu, '').split(';').map(part => part.trim()).filter(Boolean).map(part => `${part};`), ...triggers];
};
beforeAll(async () => {
  await applyD1Migrations(env.DB, [application, auth, visitors, activity, community, replies, members, moderation, mindful]
    .map((sql, index) => ({ name: `inbox-${index}.sql`, queries: split(sql) })));
  await env.DB.prepare("INSERT INTO app_users(id,display_name,status) VALUES('historical-owner','Historical','active'),('historical-reactor','Historical','active')").run();
  await env.DB.prepare("INSERT INTO mindful_posts(id,owner_id,client_post_id,kind,nickname,content,created_at) VALUES('historical-post','historical-owner','historical','repentance','Nickname','Content',?)").bind(NOW).run();
  const previous = createMindfulCommunityRepository({ DB: { prepare: sql => env.DB.prepare(sql),
    async batch(statements) { const result = await env.DB.batch(statements); previousReactionMeta = result.map(row => row.meta); return result; } } });
  await previous.react('historical-reactor','historical-post','tam-bao','Nickname',NOW,'historical-reaction');
  await applyD1Migrations(env.DB, [{ name: 'inbox-projection.sql', queries: split(inbox) }]);
  historicalRows = (await env.DB.prepare('SELECT reaction_id FROM mindful_reaction_inbox').all()).results;
});

it('creates the projection only for future events and cascades reactor/post/recipient deletion', async () => {
  expect(historicalRows).toEqual([]);
  await post(); await react();
  expect((await env.DB.prepare('SELECT reaction_id FROM mindful_reaction_inbox').all()).results).toHaveLength(1);
  await env.DB.prepare("DELETE FROM app_users WHERE id='viewer'").run();
  expect((await env.DB.prepare('SELECT reaction_id FROM mindful_reaction_inbox').all()).results).toEqual([]);
  await react('p', 'other');
  await env.DB.prepare("DELETE FROM mindful_posts WHERE id='p'").run();
  expect((await env.DB.prepare('SELECT reaction_id FROM mindful_reaction_inbox').all()).results).toEqual([]);
  await post('recipient-delete'); await react('recipient-delete', 'other');
  await env.DB.prepare("DELETE FROM app_users WHERE id='owner'").run();
  expect((await env.DB.prepare('SELECT reaction_id FROM mindful_reaction_inbox').all()).results).toEqual([]);
});

it('uses one indexed bounded query per raw inbox page without totals or per-item lookups', async () => {
  await post(); await react();
  const sql = [];
  const repository = createMindfulNotificationsRepository({ DB: { prepare(query) { sql.push(query); return env.DB.prepare(query); } } });
  const result = await repository.list('owner', null);
  expect(result).toHaveLength(1); expect(sql).toHaveLength(1);
  expect(sql[0]).toMatch(/WITH candidates AS MATERIALIZED[\s\S]*LIMIT 21/u);
  const plan = (await env.DB.prepare(`EXPLAIN QUERY PLAN ${sql[0]}`).bind('owner').all()).results.map(row => row.detail).join('\n');
  expect(plan).toContain('idx_mindful_inbox_recipient_page');
  expect(plan).not.toMatch(/SCAN (?:mindful_posts|mindful_reactions|mindful_reaction_inbox)/u);
  expect(sql[0]).not.toMatch(/COUNT\(/u);
});

it('retains three top-level reaction SQL and idempotent receipts with the insert trigger installed', async () => {
  await post(); const batches = [];
  const repository = createMindfulCommunityRepository({ DB: { prepare: sql => env.DB.prepare(sql),
    async batch(statements) { const result = await env.DB.batch(statements); batches.push(result); return result; } } });
  await repository.react('viewer','p','tam-bao','Public reactor',NOW,'received-first');
  await repository.react('viewer','p','bo-de','Public reactor',NOW,'received-retry');
  expect(batches.map(batch => batch.length)).toEqual([3,3]);
  expect(batches[0][2].results[0].reactionCount).toBe(1); expect(batches[1][2].results[0].reactionCount).toBe(1);
  expect((await env.DB.prepare('SELECT reaction_id, recipient_id FROM mindful_reaction_inbox').all()).results)
    .toEqual([{ reaction_id: 'received-first', recipient_id: 'owner' }]);
  // WITHOUT ROWID chỉ thêm dòng PK và index phân trang; retry không ghi.
  expect(batches[0][0].meta.rows_written - previousReactionMeta[0].rows_written).toBe(2);
  expect(batches[1].every(result => result.meta.rows_written === 0)).toBe(true);
});
beforeEach(async () => {
  for (const table of ['mindful_reactions', 'mindful_posts', 'ugc_user_blocks', 'app_users']) await env.DB.prepare(`DELETE FROM ${table}`).run();
  for (const id of ['owner', 'viewer', 'other']) await env.DB.prepare(`INSERT INTO app_users(id,display_name,email,status) VALUES(?,?,?,'active')`)
    .bind(id, `Private name ${id}`, `${id}@private.test`).run();
});
const service = (owner = 'owner') => createMindfulCommunityService({ env: { ...env, PRACTICE_COMMUNITY_ENABLED: 'true' },
  principal: { appUserId: owner, role: 'user' }, requestId: 'test' }, { now: () => new Date(NOW) });
const post = async (id = 'p', owner = 'owner') => {
  await env.DB.prepare(`INSERT INTO mindful_posts(id,owner_id,client_post_id,kind,nickname,content,created_at)
    VALUES(?,?,?,'repentance','Public author','Public reflection',?)`).bind(id, owner, id, NOW).run();
  return id;
};
const react = async (id = 'p', who = 'viewer') => service(who).react(id, { templateId: 'tam-bao', nickname: 'Public reactor' });
const dispatch = (path = '/api/practice/mindful-notifications', owner = 'owner', overrides = {}) => handleApiRequest({
  request: new Request(`https://app.test${path}`), locals: { env: { ...env, PRACTICE_COMMUNITY_ENABLED: 'true', ...overrides },
    session: owner ? { appUserId: owner, userId: owner, role: 'user' } : null, migrationSealed: true, requestId: 'inbox' },
});

it('returns one anonymous notification for a new reaction and no duplicate on retry or self reaction', async () => {
  await post(); await react(); await react(); await react('p', 'owner');
  const response = await dispatch(); expect(response.status).toBe(200);
  const page = await response.json(); expect(page.enabled).toBe(true); expect(page.items).toHaveLength(1);
  expect(page.items[0]).toMatchObject({ postId: 'p', kind: 'repentance', nickname: 'Public reactor', templateId: 'tam-bao', createdAt: NOW });
  expect(page.items[0].id).toBeTruthy(); expect(page.items[0].text).toBeTruthy();
  expect(Object.keys(page.items[0]).sort()).toEqual(['id','postId','kind','nickname','templateId','text','createdAt'].sort());
  expect(JSON.stringify(page)).not.toMatch(/Private name|private\.test|owner_id|recipient_id|client_post_id|Public reflection/u);
  expect((await (await dispatch(undefined, 'other')).json()).items).toEqual([]);
  expect(response.headers.get('Cache-Control')).toBe('no-store');
});

it('requires authentication and keeps flag-disabled reads at zero repository SQL', async () => {
  expect((await dispatch(undefined, null)).status).toBe(401);
  const prepare = () => { throw new Error('unexpected SQL'); };
  const disabled = await dispatch(undefined, 'owner', { PRACTICE_COMMUNITY_ENABLED: 'false', DB: { prepare } });
  expect(disabled.status).toBe(200); expect(await disabled.json()).toEqual({ enabled: false, items: [], nextCursor: null });
});

it('returns the exact post only to its author and respects removal', async () => {
  await post(); await react();
  const path = '/api/practice/mindful-posts/p';
  const response = await dispatch(path); expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ post: { id: 'p', isOwn: true, content: 'Public reflection' } });
  expect((await dispatch(path, 'viewer')).status).toBe(404);
  expect((await dispatch(path, null)).status).toBe(401);
  await service().remove('p');
  expect((await dispatch(path)).status).toBe(404);
  expect((await (await dispatch()).json()).items).toEqual([]);
});

it('returns exact cold reaction context beyond the first twenty without changing legacy post responses', async () => {
  await post();
  for (let index = 0; index < 25; index++) {
    const who = `focus-user-${index}`;
    await env.DB.prepare("INSERT INTO app_users(id,display_name,status) VALUES(?,'Private real name','active')").bind(who).run();
    await env.DB.prepare(`INSERT INTO mindful_reactions(id,post_id,owner_id,template_id,nickname,created_at)
      VALUES(?,'p',?,'tam-bao',?,?)`).bind(`focus-${String(index).padStart(2,'0')}`,who,`Public reactor ${index}`,NOW).run();
  }
  const inboxPage = await (await dispatch()).json(); expect(inboxPage.items.some(item => item.id === 'focus-00')).toBe(false);
  const legacy = await (await dispatch('/api/practice/mindful-posts/p')).json(); expect(Object.keys(legacy)).toEqual(['post']);
  const response = await dispatch('/api/practice/mindful-posts/p?reactionId=focus-00'); expect(response.status).toBe(200);
  const context = await response.json();
  expect(context.notification).toMatchObject({ id: 'focus-00', postId: 'p', kind: 'repentance', nickname: 'Public reactor 0', createdAt: NOW });
  expect(Object.keys(context.notification).sort()).toEqual(['id','postId','kind','nickname','templateId','text','createdAt'].sort());
  expect(JSON.stringify(context)).not.toMatch(/Private real name|focus-user-|owner_id|recipient_id/u);
});

it.each(['missing','cross-post','other-recipient','self','blocked','suspended'])('does not disclose %s reaction context for a valid owned post', async kind => {
  await post(); let target = 'p'; let actor = kind === 'self' ? 'owner' : 'viewer';
  if (kind === 'cross-post') target = await post('different-owned');
  if (kind === 'other-recipient') target = await post('different-recipient','other');
  if (kind !== 'missing') await env.DB.prepare(`INSERT INTO mindful_reactions(id,post_id,owner_id,template_id,nickname,created_at)
    VALUES('focus-hidden',?,?,'tam-bao','Private inaccessible nickname',?)`).bind(target,actor,NOW).run();
  if (kind === 'blocked') await env.DB.prepare('INSERT INTO ugc_user_blocks VALUES(?,?,?)').bind('owner','viewer',NOW).run();
  if (kind === 'suspended') await env.DB.prepare("UPDATE app_users SET status='suspended' WHERE id='viewer'").run();
  const response = await dispatch('/api/practice/mindful-posts/p?reactionId=focus-hidden'); expect(response.status).toBe(200);
  const context = await response.json(); expect(context.post.id).toBe('p'); expect(context.notification).toBeNull();
  expect(JSON.stringify(context)).not.toContain('Private inaccessible nickname');
});

it('validates reaction focus and retains unavailable post authorization', async () => {
  await post(); await react();
  expect((await dispatch('/api/practice/mindful-posts/p?reactionId=bad%20id')).status).toBe(400);
  expect((await dispatch('/api/practice/mindful-posts/p?reactionId=')).status).toBe(400);
  expect((await dispatch('/api/practice/mindful-posts/p?reactionId=focus','viewer')).status).toBe(404);
  await service().remove('p');
  expect((await dispatch('/api/practice/mindful-posts/p?reactionId=focus')).status).toBe(404);
});

it('looks up cold reaction context with one bounded indexed business SQL', async () => {
  await post();
  await env.DB.prepare(`INSERT INTO mindful_reactions(id,post_id,owner_id,template_id,nickname,created_at)
    VALUES('exact-focus','p','viewer','tam-bao','Public reactor',?)`).bind(NOW).run();
  const sql = [];
  const repository = createMindfulCommunityRepository({ DB: { prepare(query) { sql.push(query); return env.DB.prepare(query); } } });
  const result = await repository.getOwned('owner','p','exact-focus');
  expect(result.notification.id).toBe('exact-focus'); expect(sql).toHaveLength(1);
  const plan = (await env.DB.prepare(`EXPLAIN QUERY PLAN ${sql[0]}`)
    .bind('owner','owner','exact-focus','owner','p','owner','owner').all()).results.map(row => row.detail).join('\n');
  expect(plan).toMatch(/SEARCH n USING PRIMARY KEY/u);
  expect(plan).not.toMatch(/SCAN (?:p|focus|n)\b/u);
});

it.each(['hidden', 'blocked', 'suspended'])('filters %s events from the current inbox', async visibility => {
  await post(); await react();
  if (visibility === 'hidden') await env.DB.prepare("UPDATE mindful_posts SET status='hidden' WHERE id='p'").run();
  if (visibility === 'blocked') await env.DB.prepare('INSERT INTO ugc_user_blocks VALUES(?,?,?)').bind('owner', 'viewer', NOW).run();
  if (visibility === 'suspended') await env.DB.prepare("UPDATE app_users SET status='suspended' WHERE id='viewer'").run();
  const response = await dispatch(); expect(response.status).toBe(200); expect((await response.json()).items).toEqual([]);
});

it('advances a raw stable cursor across an empty filtered page without scanning or skipping later visible events', async () => {
  for (let index = 0; index < 23; index++) {
    const id = `post-${String(index).padStart(2,'0')}`; await post(id);
    await env.DB.prepare(`INSERT INTO mindful_reactions(id,post_id,owner_id,template_id,nickname,created_at) VALUES(?,?,'viewer','tam-bao','Public reactor',?)`)
      .bind(`reaction-${String(index).padStart(2,'0')}`, id, NOW).run();
    if (index >= 3) await env.DB.prepare("UPDATE mindful_posts SET status='hidden' WHERE id=?").bind(id).run();
  }
  const firstResponse = await dispatch(); expect(firstResponse.status).toBe(200);
  const first = await firstResponse.json(); expect(first.items).toEqual([]); expect(first.nextCursor).toBeTruthy();
  const second = await (await dispatch(`/api/practice/mindful-notifications?after=${encodeURIComponent(first.nextCursor)}`)).json();
  expect(second.items.map(item => item.id)).toEqual(['reaction-02','reaction-01','reaction-00']); expect(second.nextCursor).toBeNull();
  expect((await dispatch('/api/practice/mindful-notifications?after=bad-cursor')).status).toBe(400);
});
