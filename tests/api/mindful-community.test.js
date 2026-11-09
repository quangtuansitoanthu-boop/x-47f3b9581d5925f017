import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
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
import { createMindfulCommunityRepository } from '../../src/lib/server/repositories/mindful-community-repository.ts';
import { createMindfulCommunityService } from '../../src/lib/server/services/mindful-community.ts';
import { handleApiRequest } from '../../src/lib/server/http/api-handler.ts';

const NOW = '2026-11-07T12:00:00.000Z';
const split = sql => {
  const triggers = [...sql.matchAll(/CREATE TRIGGER[\s\S]*?END;/gu)].map(match => match[0]);
  return [...sql.replace(/CREATE TRIGGER[\s\S]*?END;/gu, '').replace(/^\s*--.*$/gmu, '').split(';').map(part => part.trim()).filter(Boolean).map(part => `${part};`), ...triggers];
};
beforeAll(async () => {
  await applyD1Migrations(env.DB, [application, auth, visitors, activity, community, replies, members, moderation, mindful]
    .map((sql, index) => ({ name: `mindful-${index}.sql`, queries: split(sql) })));
});
beforeEach(async () => {
  for (const table of ['mindful_reactions', 'mindful_posts', 'ugc_user_blocks', 'app_users']) await env.DB.prepare(`DELETE FROM ${table}`).run();
  for (const id of ['owner', 'viewer', 'other', 'admin']) {
    await env.DB.prepare(`INSERT INTO app_users (id, display_name, email, avatar_url, role, status)
      VALUES (?, ?, ?, 'https://example.test/personal-avatar', ?, 'active')`)
      .bind(id, `Real name ${id}`, `${id}@example.test`, id === 'admin' ? 'admin' : 'user').run();
  }
});
function service(ownerId = 'owner', extra = {}) {
  return createMindfulCommunityService({ env: { ...env, PRACTICE_COMMUNITY_ENABLED: 'true' },
    principal: ownerId ? { appUserId: ownerId, role: ownerId === 'admin' ? 'admin' : 'user' } : null, requestId: 'test' },
  { now: () => new Date(NOW), ...extra });
}
const draft = (id = 'first', kind = 'repentance') => ({ clientPostId: id, kind, nickname: 'Diệu Âm', content: `Nội dung ${id}` });
const reaction = (templateId = 'tam-bao') => ({ templateId, nickname: 'Phúc Trí' });

describe('mindful community production D1 schema', () => {
  it('returns only the anonymous snapshot and retries the same post without a duplicate row', async () => {
    const first = await service().create(draft());
    const second = await service().create(draft());
    expect(second).toEqual(first);
    expect(first.post).toMatchObject({ nickname: 'Diệu Âm', reactionCount: 0, viewerReacted: false, isOwn: true });
    const feed = await service('viewer').list('repentance', false, null);
    expect(feed.items).toHaveLength(1);
    expect(JSON.stringify(feed)).not.toMatch(/Real name|@example|personal-avatar|owner_id|client_post_id/u);
    expect(Object.keys(feed.items[0]).sort()).toEqual(['content', 'createdAt', 'id', 'isOwn', 'kind', 'nickname', 'reactionCount', 'status', 'viewerReacted'].sort());
    expect(feed.items[0].isOwn).toBe(false);
  });

  it('enforces two posts per Vietnam day including removed posts, and preserves idempotent retry at the limit', async () => {
    const first = await service().create(draft('one'));
    await service().create(draft('two', 'good_deed'));
    await service().remove(first.post.id);
    await expect(service().create(draft('three'))).rejects.toMatchObject({ status: 429, code: 'mindful_daily_limit' });
    expect((await service().create(draft('two', 'good_deed'))).post.kind).toBe('good_deed');
    const nextDay = service('owner', { now: () => new Date('2026-11-07T17:00:00.000Z') });
    expect((await nextDay.create(draft('next-day'))).post).toMatchObject({ content: 'Nội dung next-day' });
  });

  it('allows exactly one reaction per principal/post across simultaneous submissions and template changes', async () => {
    const { post } = await service().create(draft());
    const results = await Promise.all([service('viewer').react(post.id, reaction()), service('viewer').react(post.id, reaction('bo-de'))]);
    expect(results.map(result => result.reactionCount)).toEqual([1, 1]);
    expect(results[1].templateId).toBe(results[0].templateId);
    const repeated = await service('viewer').react(post.id, { ...reaction('quan-am'), nickname: 'Biệt danh mới' });
    expect(repeated.reactionCount).toBe(1);
    expect((await service('viewer').list('repentance', false, null)).items[0].viewerReacted).toBe(true);
    const rows = (await env.DB.prepare('SELECT nickname FROM mindful_reactions WHERE post_id = ?').bind(post.id).all()).results;
    expect(rows).toEqual([{ nickname: 'Phúc Trí' }]);
  });

  it('executes one D1 batch with exactly three SQL statements for first and duplicate reactions', async () => {
    const { post } = await service().create(draft());
    const batches = [];
    const repository = createMindfulCommunityRepository({ DB: {
      prepare: sql => env.DB.prepare(sql),
      async batch(statements) { const result = await env.DB.batch(statements); batches.push(result); return result; },
    } });
    await repository.react('viewer', post.id, 'tam-bao', 'Phúc Trí', NOW, 'reaction-first');
    await repository.react('viewer', post.id, 'bo-de', 'Phúc Trí', NOW, 'reaction-retry');
    expect(batches.map(batch => batch.length)).toEqual([3, 3]);
    expect(batches[0].slice(0, 2).map(result => result.meta.changes)).toEqual([1, 1]);
    expect(batches[1].slice(0, 2).map(result => result.meta.changes)).toEqual([0, 0]);
    expect(batches[1][2].results[0].reactionCount).toBe(1);
  });

  it('rejects arbitrary text, wrong-kind templates and forged account fields without storing them', async () => {
    const { post } = await service().create(draft());
    await expect(service('viewer').react(post.id, reaction('untrusted text'))).rejects.toMatchObject({ status: 400 });
    await expect(service('viewer').react(post.id, reaction('hoan-hy'))).rejects.toMatchObject({ status: 404 });
    await service('viewer').react(post.id, { ...reaction(), ownerId: 'other', email: 'forged@example.test', content: 'free text' });
    expect((await env.DB.prepare('SELECT owner_id, template_id FROM mindful_reactions').all()).results)
      .toEqual([{ owner_id: 'viewer', template_id: 'tam-bao' }]);
    await expect(service().create({ ...draft('email-name'), nickname: 'private@example.test' })).rejects.toMatchObject({ code: 'invalid_nickname' });
  });

  it('restricts deletion to the owner/admin and denies reactions after removal, without touching another user journal', async () => {
    const { post } = await service().create(draft());
    await expect(service('viewer').remove(post.id)).rejects.toMatchObject({ status: 404 });
    await service('admin').remove(post.id);
    expect((await service().list('repentance', true, null)).items).toEqual([]);
    await expect(service('viewer').react(post.id, reaction())).rejects.toMatchObject({ status: 404 });
    expect(await env.DB.prepare('SELECT content, nickname, status FROM mindful_posts WHERE id = ?').bind(post.id).first())
      .toEqual({ content: '', nickname: 'Đồng Tu', status: 'removed' });
  });

  it('honors blocked and suspended users on reads and writes', async () => {
    const { post } = await service().create(draft());
    await env.DB.prepare('INSERT INTO ugc_user_blocks(blocker_id,blocked_owner_id,created_at) VALUES(?,?,?)').bind('viewer', 'owner', NOW).run();
    expect((await service('viewer').list('repentance', false, null)).items).toEqual([]);
    expect((await service('viewer').list('repentance', false, null, 'today')).items).toEqual([]);
    await expect(service('viewer').react(post.id, reaction())).rejects.toMatchObject({ status: 404 });
    await env.DB.prepare("UPDATE app_users SET status = 'suspended' WHERE id = 'owner'").run();
    expect((await service('other').list('repentance', false, null)).items).toEqual([]);
    expect((await service('other').list('repentance', false, null, 'today')).items).toEqual([]);
    await expect(service('owner').create(draft('suspended'))).rejects.toMatchObject({ status: 429 });
  });

  it('paginates both feeds and reactions, and cursors never expose account principal IDs', async () => {
    for (let index = 0; index < 23; index++) {
      await env.DB.prepare(`INSERT INTO mindful_posts(id,owner_id,client_post_id,kind,nickname,content,created_at)
        VALUES(?, 'owner', ?, 'repentance', 'Diệu Âm', 'Nội dung', ?)`)
        .bind(`post-${String(index).padStart(2, '0')}`, `client-${index}`, NOW).run();
      await env.DB.prepare(`INSERT INTO app_users(id,display_name,status) VALUES(?, 'Real name', 'active')`).bind(`principal-secret-${index}`).run();
      await service(`principal-secret-${index}`).react('post-00', reaction());
    }
    const first = await service('viewer').list('repentance', false, null);
    const next = await service('viewer').list('repentance', false, first.nextCursor);
    expect(first.items).toHaveLength(20);
    expect(next.items).toHaveLength(3);
    expect(new Set([...first.items, ...next.items].map(post => post.id)).size).toBe(23);
    const reactions = await service('viewer').reactions('post-00', null);
    expect(reactions.items).toHaveLength(20);
    expect(atob(reactions.nextCursor.replaceAll('-', '+').replaceAll('_', '/'))).not.toContain('principal-secret-');
    expect((await service('viewer').reactions('post-00', reactions.nextCursor)).items).toHaveLength(3);
  });

  it('deletes owner content through foreign keys and adjusts cached counts on reactor account deletion', async () => {
    const { post } = await service().create(draft());
    await service('viewer').react(post.id, reaction());
    await service('other').react(post.id, reaction());
    await env.DB.prepare("DELETE FROM app_users WHERE id = 'viewer'").run();
    expect((await service('other').list('repentance', false, null)).items[0].reactionCount).toBe(1);
    await env.DB.prepare("DELETE FROM app_users WHERE id = 'owner'").run();
    expect((await env.DB.prepare('SELECT id FROM mindful_posts').all()).results).toEqual([]);
    expect((await env.DB.prepare('SELECT post_id FROM mindful_reactions').all()).results).toEqual([]);
  });

  it('rejects guest writes and invalid cursors, and disabled public reads do not execute SQL', async () => {
    await expect(service(null).create(draft())).rejects.toMatchObject({ status: 401 });
    await expect(service().list('repentance', false, 'bad-cursor')).rejects.toMatchObject({ code: 'invalid_cursor' });
    const noDb = { prepare: () => { throw new Error('Unexpected SQL'); } };
    const disabled = createMindfulCommunityService({ env: { DB: noDb }, principal: null, requestId: 'disabled' });
    expect(await disabled.list('repentance', false, null)).toEqual({ enabled: false, items: [], nextCursor: null });
    expect(await disabled.list('repentance', false, null, 'today')).toEqual({ enabled: false, items: [], nextCursor: null });
    expect(await disabled.reactions('post', null)).toEqual({ items: [], nextCursor: null });
  });

  it('uses indexes for feed, ownership, reactions and daily rate lookups', async () => {
    for (const [query, expected] of [
      ["SELECT id FROM mindful_posts WHERE kind='repentance' AND status='published' ORDER BY created_at DESC,id DESC LIMIT 21", 'idx_mindful_posts_feed'],
      ["SELECT id FROM mindful_posts WHERE owner_id='owner' ORDER BY created_at DESC,id DESC LIMIT 21", 'idx_mindful_posts_owner'],
      ["SELECT id FROM mindful_reactions WHERE post_id='post' ORDER BY created_at DESC,id DESC LIMIT 21", 'idx_mindful_reactions_page'],
      ["SELECT 1 FROM mindful_posts WHERE owner_id='owner' AND created_at >= '2026-11-07' LIMIT 2", 'idx_mindful_posts_owner'],
    ]) {
      const plan = await env.DB.prepare(`EXPLAIN QUERY PLAN ${query}`).all();
      expect(plan.results.some(row => row.detail.includes(expected))).toBe(true);
    }
  });

  it.each(['repentance', 'good_deed'])('filters %s by the Vietnam day and preserves newest-first all/legacy requests', async kind => {
    const rows = [
      ['before-midnight', '2026-11-06T16:59:59.999Z'],
      ['at-midnight', '2026-11-06T17:00:00.000Z'],
      ['earlier-today', '2026-11-07T06:00:00.000Z'],
      ['later-today', '2026-11-07T11:59:59.999Z'],
      ['before-next-midnight', '2026-11-07T16:59:59.999Z'],
      ['next-midnight', '2026-11-07T17:00:00.000Z'],
    ];
    for (const [id, at] of rows) await env.DB.prepare(`INSERT INTO mindful_posts
      (id,owner_id,client_post_id,kind,nickname,content,created_at) VALUES(?,'owner',?,?,'Diệu Âm','Nội dung',?)`)
      .bind(id, id, kind, at).run();
    const today = await service('viewer').list(kind, false, null, 'today');
    expect(today.items.map(post => post.id)).toEqual(['before-next-midnight', 'later-today', 'earlier-today', 'at-midnight']);
    const all = await service('viewer').list(kind, false, null, 'all');
    expect(all.items.map(post => post.id)).toEqual([...rows].reverse().map(([id]) => id));
    expect(await service('viewer').list(kind, false, null)).toEqual(all);
    expect((await service('viewer').list(kind, false, null, null)).items).toEqual(all.items);
    // The same clock crossing 00:00 Vietnam starts a new bounded day.
    const afterMidnight = service('viewer', { now: () => new Date('2026-11-07T17:00:00.000Z') });
    expect((await afterMidnight.list(kind, false, null, 'today')).items.map(post => post.id)).toEqual(['next-midnight']);
  });

  it('keeps today pagination bounded, stable for equal timestamps, and mine isolated across both kinds', async () => {
    for (let index = 0; index < 25; index++) {
      const id = `today-${String(index).padStart(2, '0')}`;
      await env.DB.prepare(`INSERT INTO mindful_posts(id,owner_id,client_post_id,kind,nickname,content,created_at)
        VALUES(?,'owner',?,'repentance','Diệu Âm','Nội dung',?)`).bind(id, id, NOW).run();
    }
    for (const [id, owner, kind, at] of [
      ['old-mine', 'owner', 'good_deed', '2026-11-06T16:59:59.999Z'],
      ['today-mine-good', 'owner', 'good_deed', NOW],
      ['today-other', 'other', 'good_deed', NOW],
    ]) await env.DB.prepare(`INSERT INTO mindful_posts(id,owner_id,client_post_id,kind,nickname,content,created_at)
      VALUES(?,?,?,?,'Diệu Âm','Nội dung',?)`).bind(id, owner, id, kind, at).run();
    const first = await service('viewer').list('repentance', false, null, 'today');
    const second = await service('viewer').list('repentance', false, first.nextCursor, 'today');
    expect(first.items).toHaveLength(20);
    expect(second.items).toHaveLength(5);
    expect(second.nextCursor).toBeNull();
    expect([...first.items, ...second.items].map(post => post.id)).toEqual(
      Array.from({ length: 25 }, (_, index) => `today-${String(24 - index).padStart(2, '0')}`));
    const mineFirst = await service().list('repentance', true, null, 'today');
    const mineNext = await service().list('repentance', true, mineFirst.nextCursor, 'today');
    const mine = [...mineFirst.items, ...mineNext.items];
    expect(mine).toHaveLength(26);
    expect(mine.every(post => post.isOwn)).toBe(true);
    expect(mine.some(post => post.id === 'today-mine-good')).toBe(true);
    expect(mine.some(post => post.id === 'old-mine' || post.id === 'today-other')).toBe(false);
  });

  it('uses the same single SQL feed request and existing range indexes for today without counting/scanning all posts', async () => {
    await env.DB.prepare(`WITH RECURSIVE seq(n) AS (SELECT 0 UNION ALL SELECT n + 1 FROM seq WHERE n < 524)
      INSERT INTO mindful_posts(id,owner_id,client_post_id,kind,nickname,content,created_at)
      SELECT 'budget-' || n, 'owner', 'budget-' || n, 'repentance', 'Diệu Âm', 'Nội dung',
        CASE WHEN n < 500 THEN '2026-11-06T16:59:59.999Z' ELSE ? END FROM seq`).bind(NOW).run();
    const executed = [];
    const repository = createMindfulCommunityRepository({ DB: {
      prepare(sql) {
        return { bind(...values) { return { async all() {
          const result = await env.DB.prepare(sql).bind(...values).all();
          executed.push({ sql, values, meta: result.meta });
          return result;
        } }; } };
      },
    } });
    await service('viewer', { repository }).list('repentance', false, null, 'today');
    await service('owner', { repository }).list('repentance', true, null, 'today');
    expect(executed).toHaveLength(2);
    for (const [index, execution] of executed.entries()) {
      expect(execution.sql).not.toContain('COUNT(');
      expect(execution.sql).toContain('p.created_at >= ? AND p.created_at < ?');
      expect(execution.values.slice(-2)).toEqual(['2026-11-06T17:00:00.000Z', '2026-11-07T17:00:00.000Z']);
      const plan = await env.DB.prepare(`EXPLAIN QUERY PLAN ${execution.sql}`).bind(...execution.values).all();
      const indexName = index === 0 ? 'idx_mindful_posts_feed' : 'idx_mindful_posts_owner';
      expect(plan.results.some(row => row.detail.includes(indexName) && row.detail.includes('created_at>?') && row.detail.includes('created_at<?'))).toBe(true);
      expect(plan.results.some(row => row.detail.includes('USE TEMP B-TREE'))).toBe(false);
      expect(execution.meta.rows_written).toBe(0);
      expect(Number.isInteger(execution.meta.rows_read)).toBe(true);
      // Local fixture includes 500 older posts; they are excluded by the indexed range.
      expect(execution.meta.rows_read).toBeLessThan(500);
    }
  });

  it('guards handler mutations with authentication, origin/CSRF and rate admission before SQL', async () => {
    const session = { appUserId: 'owner', userId: 'owner', role: 'user', csrfToken: 'expected-csrf' };
    const dispatch = (method, path, headers = {}, principal = session, body = draft(), binding = {}) => handleApiRequest({
      request: new Request(`https://app.test${path}`, { method, headers: { 'Content-Type': 'application/json', ...headers },
        ...(method === 'GET' ? {} : { body: JSON.stringify(body) }) }),
      locals: { env: { ...env, APP_ORIGIN: 'https://app.test', PRACTICE_COMMUNITY_ENABLED: 'true', ...binding },
        migrationSealed: true, session: principal, requestId: 'handler-test' },
    });
    const path = '/api/practice/mindful-posts';
    expect((await dispatch('POST', path, {}, null)).status).toBe(401);
    expect((await dispatch('POST', path)).status).toBe(403);
    expect((await dispatch('POST', path, { Origin: 'https://evil.test', 'X-CSRF-Token': 'expected-csrf' })).status).toBe(403);
    const correct = { Origin: 'https://app.test', 'X-CSRF-Token': 'expected-csrf' };
    expect((await dispatch('POST', path, correct, session, draft(), { COMMENT_RATE_LIMITER: { limit: async () => ({ success: false }) } })).status).toBe(429);
    expect((await env.DB.prepare('SELECT id FROM mindful_posts').all()).results).toEqual([]);
    const created = await dispatch('POST', path, correct);
    expect(created.status).toBe(200);
    const { post } = await created.json();
    const reacted = await dispatch('POST', `${path}/${post.id}/reactions`, correct, session, reaction());
    expect(reacted.status).toBe(200);
    expect(await reacted.json()).toMatchObject({ postId: post.id, viewerReacted: true, reactionCount: 1 });
    const publicFeed = await dispatch('GET', path, {}, null);
    expect(publicFeed.status).toBe(200);
    expect(publicFeed.headers.get('Cache-Control')).toBe('no-store');
    expect((await dispatch('GET', `${path}?mine=1`, {}, null)).status).toBe(401);
    expect((await dispatch('GET', `${path}?period=invalid`, {}, null)).status).toBe(400);
    const todayFeed = await dispatch('GET', `${path}?period=today`, {}, null);
    expect(todayFeed.status).toBe(200);
    expect((await todayFeed.json()).items.map(item => item.id)).toEqual([post.id]);
    expect((await dispatch('PUT', path, correct)).status).toBe(405);
  });
});
