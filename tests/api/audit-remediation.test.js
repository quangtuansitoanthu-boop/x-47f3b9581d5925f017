import { beforeAll, beforeEach, expect, it } from 'vitest';
import { applyD1Migrations, env } from 'cloudflare:test';
import application from '../../migrations/0001-application-schema.sql?raw';
import auth from '../../migrations/0002-auth-and-session-schema.sql?raw';
import memberStatusSchema from '../../migrations/0026-member-status.sql?raw';
import comments from '../../migrations/0022-comment-replies-and-album-plays.sql?raw';
import { importBookAtomically, replaceBookChapters } from '../../src/lib/server/services/book-import.ts';
import { listComments } from '../../src/worker/api/views-and-comments.js';

const principal = { role: 'admin', appUserId: 'admin-test' };
beforeAll(async () => {
  await applyD1Migrations(env.DB, [application, auth, memberStatusSchema, comments].map((sql, index) => ({ name: `audit-${index}`, queries: sql.trim().split(/;\s*\n\s*\n/gu).map(s => s.endsWith(';') ? s : `${s};`) })));
  await env.DB.exec("CREATE TABLE facebook_post_imports (article_id TEXT, source_managed INTEGER, status TEXT, last_error_code TEXT, updated_at TEXT)");
});
beforeEach(async () => {
  await env.DB.prepare('DELETE FROM baiviet').run();
});

it('imports 2,000 chapters atomically and reorders 100 IDs without exceeding bind limits', async () => {
  const chapters = Array.from({ length: 2000 }, (_, i) => ({ tieu_de: `Chapter ${i}`, noi_dung: `Content ${i}` }));
  const report = await importBookAtomically(env, principal, { book: { id: 'large-book', tieu_de: 'Large book' }, chapters });
  expect(report.persistedChapters).toBe(2000);
  const current = (await env.DB.prepare('SELECT id, tieu_de FROM tap_noi_dung WHERE bai_viet_id = ? ORDER BY so_thu_tu LIMIT 100').bind('large-book').all()).results;
  await replaceBookChapters(env, principal, 'large-book', current.reverse());
  const rows = (await env.DB.prepare('SELECT tieu_de, noi_dung, so_thu_tu FROM tap_noi_dung WHERE bai_viet_id = ? ORDER BY so_thu_tu').bind('large-book').all()).results;
  expect(rows).toHaveLength(100);
  expect(rows[0]).toMatchObject({ tieu_de: 'Chapter 99', noi_dung: 'Content 99', so_thu_tu: 0 });
});

it('rolls back deletion and parent changes when a later chapter insert fails', async () => {
  await importBookAtomically(env, principal, { book: { id: 'protected', tieu_de: 'Old' }, chapters: [{ tieu_de: 'Old chapter', noi_dung: 'Keep me' }] });
  await env.DB.exec("CREATE TRIGGER audit_reject_chapter BEFORE INSERT ON tap_noi_dung WHEN NEW.tieu_de = 'FAIL' BEGIN SELECT RAISE(ABORT, 'injected chapter failure'); END");
  await expect(replaceBookChapters(env, principal, 'protected', Array.from({ length: 150 }, (_, i) => ({ tieu_de: i === 149 ? 'FAIL' : `New ${i}`, noi_dung: 'new' })))).rejects.toThrow();
  const rows = (await env.DB.prepare('SELECT tieu_de, noi_dung FROM tap_noi_dung WHERE bai_viet_id = ?').bind('protected').all()).results;
  expect(rows).toEqual([{ tieu_de: 'Old chapter', noi_dung: 'Keep me' }]);
  expect((await env.DB.prepare('SELECT so_tap FROM baiviet WHERE id = ?').bind('protected').first()).so_tap).toBe(1);
  await env.DB.exec('DROP TRIGGER audit_reject_chapter');
});

it('paginates comments with equal timestamps without duplicates or contact leakage', async () => {
  await env.DB.prepare("INSERT INTO baiviet(id,tieu_de) VALUES ('comments','Comments')").run();
  await env.DB.batch(Array.from({ length: 125 }, (_, i) => env.DB.prepare('INSERT INTO binh_luan(bai_viet_id, ten, noi_dung, tao_luc, email) VALUES (?, ?, ?, ?, ?)').bind('comments', 'Member', `Comment ${i}`, '2026-10-22T00:00:00.000Z', 'private@example.test')));
  const first = await listComments(env, 'comments');
  const second = await listComments(env, 'comments', false, { after: first.at(-1).id });
  const third = await listComments(env, 'comments', false, { after: second.at(-1).id });
  expect([first.length, second.length, third.length]).toEqual([50, 50, 25]);
  expect(new Set([...first, ...second, ...third].map(row => row.id)).size).toBe(125);
  expect(first[0]).not.toHaveProperty('email');
});
