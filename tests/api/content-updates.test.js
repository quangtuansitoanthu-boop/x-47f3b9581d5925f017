import { beforeAll, beforeEach, expect, it } from 'vitest';
import { applyD1Migrations, env } from 'cloudflare:test';
import application from '../../migrations/0001-application-schema.sql?raw';
import updateIndex from '../../migrations/0037-talk-catalog-update-index.sql?raw';
import { createContentUpdatesService } from '../../src/lib/server/services/content-updates.ts';
import { handleApiRequest } from '../../src/lib/server/http/api-handler.ts';

beforeAll(async () => {
  await applyD1Migrations(env.DB, [{ name: 'content-base', queries: application.trim().split(/;\s*\n\s*\n/gu).map(sql => sql.endsWith(';') ? sql : `${sql};`) }]);
  await env.DB.exec('ALTER TABLE phap_thoai ADD COLUMN dien_gia TEXT');
  await applyD1Migrations(env.DB, [{ name: 'content-index', queries: [updateIndex] }]);
});
beforeEach(async () => {
  await env.DB.exec('DELETE FROM tap_noi_dung; DELETE FROM baiviet; DELETE FROM phap_thoai;');
});

it('discovers all four types, excludes private/draft data, estimates and reads complete chapter pages', async () => {
  const values = [
    ['book', 'SÁCH', 1, null], ['scripture', 'KINH PHẬT', 0, null], ['ritual', 'NGHI THỨC', 0, null], ['pdf', 'SÁCH', 0, 'https://test/book.pdf'],
  ];
  for (const [id, category, chapters, pdf] of values) {
    await env.DB.prepare("INSERT INTO baiviet(id,tieu_de,danh_muc,trang_thai,has_muc_luc,pdf_url,noi_dung,updated_at) VALUES(?,?,?,'Hoàn thành',?,?,?,?)")
      .bind(id, id, category, chapters, pdf, 'Nội dung', '2026-10-26').run();
  }
  await env.DB.prepare("INSERT INTO baiviet(id,tieu_de,danh_muc,trang_thai) VALUES('draft','Draft','SÁCH','Bản nháp')").run();
  for (let number = 0; number < 13; number++) await env.DB.prepare('INSERT INTO tap_noi_dung(bai_viet_id,so_thu_tu,tieu_de,noi_dung) VALUES(?,?,?,?)').bind('book', number, `Chương ${number}`, 'Đủ nội dung').run();
  await env.DB.prepare("INSERT INTO phap_thoai(id,tieu_de,visibility,tracks) VALUES('talk','Talk','public','[]'),('private','Private','private','[]')").run();
  const service = createContentUpdatesService(env);
  const catalog = await service.catalog(new URL('https://test/api/content-updates'));
  expect(catalog.items.map(item => item.group).sort()).toEqual(['book', 'pdf', 'ritual', 'scripture', 'talk']);
  const sizes = await service.estimate(['book', 'scripture']);
  expect(sizes.find(value => value.id === 'book')).toMatchObject({ chapters: 13 });
  expect(sizes.find(value => value.id === 'book').bytes).toBeGreaterThan(new TextEncoder().encode('Nội dung' + 'Đủ nội dung'.repeat(13)).byteLength);
  const item = catalog.items.find(item => item.row.id === 'book');
  const first = await service.article('book', null, item.version);
  expect(first.chapters).toHaveLength(10);
  const last = await service.article('book', first.next, item.version);
  expect(last.chapters).toHaveLength(3);
  expect(last.next).toBeNull();
  await expect(service.article('draft', null, '')).rejects.toThrow();
  await expect(service.article('pdf', null, '')).rejects.toThrow();
});

it('offers installer-excluded books and public album shells through explicit content updates', async () => {
  const books = ['tt_1781529439696', 'tt_1781529470187', 'tt_1781529533555', 'tt_tro_ve_tu_xu_tuyet'];
  const talks = ['pt_1782208869321', 'pt_1782208945706', 'pt_1782208975513'];
  for (const id of books) {
    await env.DB.prepare("INSERT INTO baiviet(id,tieu_de,tac_gia,danh_muc,trang_thai,has_muc_luc,so_tap) VALUES(?,?,'Nguyên Phong','SÁCH','Hoàn thành',1,1)")
      .bind(id, id === books[3] ? 'Trở về từ xứ tuyết' : 'Muôn Kiếp Nhân Sinh').run();
    await env.DB.prepare("INSERT INTO tap_noi_dung(bai_viet_id,so_thu_tu,noi_dung) VALUES(?,1,'Complete text')").bind(id).run();
  }
  for (const id of talks) await env.DB.prepare("INSERT INTO phap_thoai(id,tieu_de,visibility,tracks) VALUES(?,'Muôn Kiếp Nhân Sinh','public','[]')").bind(id).run();
  const service = createContentUpdatesService(env);
  const catalog = await service.catalog(new URL('https://test/api/content-updates'));
  expect(catalog.items).toHaveLength(7);
  for (const id of books) {
    const item = catalog.items.find(item => item.row.id === id);
    expect(item).toMatchObject({ group: 'book', mode: 'full' });
    expect((await service.article(id, null, item.version)).chapters).toHaveLength(1);
  }
  for (const id of talks) expect(catalog.items.find(item => item.row.id === id)).toMatchObject({ group: 'talk', mode: 'shell' });
});

it('uses the approved index for public album delta and the existing chapter index', async () => {
  const talk = await env.DB.prepare("EXPLAIN QUERY PLAN SELECT id FROM phap_thoai WHERE visibility='public' AND created_at > ? ORDER BY created_at,id LIMIT 250").bind('2026-01-01').all();
  expect(talk.results.map(row => row.detail).join(' ')).toContain('idx_phap_thoai_visibility_created_at_id');
  const catalog = await env.DB.prepare("EXPLAIN QUERY PLAN SELECT id FROM phap_thoai WHERE visibility='public' AND (created_at,id) > (?,?) ORDER BY created_at,id LIMIT 251").bind('2026-01-01', 'a').all();
  expect(catalog.results.map(row => row.detail).join(' ')).toContain('idx_phap_thoai_visibility_created_at_id');
  const chapters = await env.DB.prepare('EXPLAIN QUERY PLAN SELECT id FROM tap_noi_dung WHERE bai_viet_id = ? AND so_thu_tu > ? ORDER BY so_thu_tu LIMIT 11').bind('book', 0).all();
  expect(chapters.results.map(row => row.detail).join(' ')).toMatch(/INDEX.*bai_viet_id/u);
});

it('keeps the new API public-read only and no-store while rejecting unsupported actions', async () => {
  const call = (url, method = 'GET') => handleApiRequest({ request: new Request(url, { method }), locals: { env, migrationSealed: true, session: null } });
  const response = await call('https://test/api/content-updates');
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect((await call('https://test/api/content-updates', 'POST')).status).toBe(405);
  expect((await call('https://test/api/content-updates?action=estimate&ids=bad%27')).status).toBe(400);
});

it('measures bounded local D1 rows for estimates using existing parent/chapter indexes', async () => {
  await env.DB.prepare("INSERT INTO baiviet(id,tieu_de,danh_muc,trang_thai,noi_dung) VALUES('book','Book','SÁCH','Hoàn thành','A')").run();
  for (let index = 0; index < 12; index++) await env.DB.prepare("INSERT INTO tap_noi_dung(bai_viet_id,so_thu_tu,noi_dung) VALUES('book',?,'B')").bind(index).run();
  const metrics = [];
  const measured = { ...env, DB: { prepare(sql) {
    let statement = env.DB.prepare(sql);
    const proxy = { bind(...values) { statement = statement.bind(...values); return proxy; }, async all() {
      const result = await statement.all(); metrics.push(result.meta); return result;
    } };
    return proxy;
  } } };
  const sizes = await createContentUpdatesService(measured).estimate(['book']);
  expect(sizes[0].bytes).toBeGreaterThan(13);
  expect(metrics).toHaveLength(1);
  expect(typeof metrics[0].rows_read).toBe('number');
  expect(metrics[0].rows_read).toBeLessThanOrEqual(30);
  expect(metrics[0].rows_written).toBe(0);
});

it('paginates metadata including backdated and null-date items without losing ties', async () => {
  const statements = Array.from({ length: 251 }, (_, index) => env.DB.prepare("INSERT INTO baiviet(id,tieu_de,danh_muc,trang_thai,created_at) VALUES(?,?,'SÁCH','Hoàn thành',?)")
    .bind(`book-${String(index).padStart(3, '0')}`, `Book ${index}`, null));
  await env.DB.batch(statements);
  const service = createContentUpdatesService(env);
  const first = await service.catalog(new URL('https://test/api/content-updates'));
  expect(first.items).toHaveLength(250);
  const next = await service.catalog(new URL(`https://test/api/content-updates?articlesAfter=${first.articlesNext}&talksDone=1`));
  expect(next.items).toHaveLength(1);
  expect(next.articlesNext).toBeNull();
  expect(new Set([...first.items, ...next.items].map(item => item.row.id)).size).toBe(251);
});
