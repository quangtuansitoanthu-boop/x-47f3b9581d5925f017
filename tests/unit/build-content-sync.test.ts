import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { syncOfflineContent } from '../../scripts/sync-offline-content.mjs';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const temporary = () => { const root = mkdtempSync(path.join(tmpdir(), 'tutam-bundle-')); roots.push(root); return root; };
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
const chapter = { id: 'c', bai_viet_id: 'book', so_thu_tu: 0, updated_at: '2026-11-01', noi_dung: 'Latest text' };
const book = { kind: 'article', mode: 'full', version: 'a'.repeat(64), row: { id: 'book', tieu_de: 'Book', has_muc_luc: 1 } };
const talk = { kind: 'talk', mode: 'shell', version: 'b'.repeat(64), row: { id: 'talk', dien_gia: 'Latest speaker', tracks: [] } };
const read = (root: string, file: string) => JSON.parse(readFileSync(path.join(root, file), 'utf8'));

it('syncs complete web content, shares catalog sources and only re-reads changed chapters', async () => {
  const root = temporary();
  const fetcher = vi.fn(async (input: URL) => input.pathname.endsWith('tap_noi_dung') ? json([chapter])
    : input.searchParams.get('action') === 'article' ? json({ article: book.row, chapters: [chapter], next: null })
      : json({ items: [book, talk], articlesNext: null, talksNext: null }));
  expect((await syncOfflineContent({ root, fetcher })).requests).toBe(3);
  expect(read(root, 'src/lib/data/offline-talks.json')).toEqual(read(root, 'static/offline-data/talks.json'));
  expect(read(root, 'src/lib/data/offline-bundled-articles.json')).toEqual(read(root, 'static/offline-bundled-articles.json'));
  expect(read(root, 'static/offline-data/chapters/book.json')[0].noi_dung).toBe('Latest text');
  expect((await syncOfflineContent({ root, fetcher })).requests).toBe(2);
  chapter.updated_at = '2026-11-02';
  expect((await syncOfflineContent({ root, fetcher })).requests).toBe(3);
  chapter.updated_at = '2026-11-01';
});

it('leaves the previous bundle intact if a chapter download is incomplete', async () => {
  const root = temporary();
  writeFileSync(path.join(root, 'sentinel'), 'previous');
  const fetcher = vi.fn(async (input: URL) => input.pathname.endsWith('tap_noi_dung') ? json([chapter])
    : input.searchParams.get('action') === 'article' ? json({ article: book.row, chapters: [], next: null })
      : json({ items: [book], articlesNext: null, talksNext: null }));
  await expect(syncOfflineContent({ root, fetcher })).rejects.toThrow('Incomplete');
  expect(readFileSync(path.join(root, 'sentinel'), 'utf8')).toBe('previous');
  expect(() => read(root, 'src/lib/data/offline-bundled-articles.json')).toThrow();
});

it('accepts numeric legacy chapter IDs and refuses a potentially truncated index', async () => {
  const root = temporary();
  const metadata = { ...chapter, id: 7 };
  const fetcher = vi.fn(async (input: URL) => input.pathname.endsWith('tap_noi_dung') ? json([metadata])
    : input.searchParams.get('action') === 'article' ? json({ article: book.row, chapters: [{ ...metadata, id: '7' }], next: null })
      : json({ items: [book], articlesNext: null, talksNext: null }));
  await syncOfflineContent({ root, fetcher });
  const capped = vi.fn(async (input: URL) => input.pathname.endsWith('tap_noi_dung')
    ? json(Array.from({ length: 5000 }, (_, id) => ({ ...metadata, id })))
    : json({ items: [book], articlesNext: null, talksNext: null }));
  await expect(syncOfflineContent({ root, fetcher: capped })).rejects.toThrow('Incomplete chapter index');
  expect(capped).toHaveBeenCalledTimes(2);
});

it('keeps the two local presentation corrections after both fresh and cached web syncs', async () => {
  const root = temporary();
  const sourceFooter = '<p style="text-align:justify">Nguồn: <a href="https://chuahoangphap.com.vn/thu-vien-kinh-sach/chi-tiet-kinh-niem-phat-ba-la-mat-130/" target="_blank" rel="noopener noreferrer">Chùa Hoằng Pháp — Kinh Niệm Phật Ba-la-mật</a>.</p>';
  const ritual = '<p>(Quỳ chấp tay niệm Phật hồi hướng):</p><p><em>(7 <strong>biến</strong>)</em> <i>(1 lạy)</i> (Ấn “Hoả Diệm”)</p>';
  const items = [
    { ...book, row: { id: 'kinh-niem-phat-ba-la-mat', tieu_de: 'KINH NIỆM PHẬT BA LA MẬT', noi_dung: `<p>Giới thiệu giữ nguyên.</p>${sourceFooter}` } },
    { ...book, row: { id: 'nghi-thuc-tri-chu-phat-danh-ton-thang-da-la-ni', tieu_de: 'NGHI THỨC', noi_dung: ritual } },
    { ...book, row: { id: 'unrelated', tieu_de: 'Other', noi_dung: `<p>(Giữ nguyên)</p>${sourceFooter}` } },
  ];
  const fetcher = vi.fn(async (input: URL) => input.pathname.endsWith('tap_noi_dung') ? json([])
    : input.searchParams.get('action') === 'article'
      ? json({ article: items.find(item => item.row.id === input.searchParams.get('id'))!.row, chapters: [], next: null })
      : json({ items, articlesNext: null, talksNext: null }));
  for (const requests of [5, 2]) {
    expect((await syncOfflineContent({ root, fetcher })).requests).toBe(requests);
    const rows = read(root, 'src/lib/data/offline-bundled-articles.json');
    expect(rows[0].noi_dung).toBe('<p>Giới thiệu giữ nguyên.</p>');
    expect(rows[1].noi_dung).toBe('<p><em>(Quỳ chấp tay niệm Phật hồi hướng)</em>:</p><p><em>(7 <strong>biến</strong>)</em> <i>(1 lạy)</i> <em>(Ấn “Hoả Diệm”)</em></p>');
    expect(rows[2].noi_dung).toBe(items[2].row.noi_dung);
    expect(read(root, 'static/offline-bundled-articles.json')).toEqual(rows);
    expect(read(root, 'static/offline-data/chapters/nghi-thuc-tri-chu-phat-danh-ton-thang-da-la-ni.json')[0].noi_dung).toBe(rows[1].noi_dung);
  }
});

it('preserves Duy Ma Cat words and existing emphasis while italicizing plain parentheticals on fresh and cached sync', async () => {
  const root = temporary();
  const raw = '<p>Giữ nguyên (tọa thiền), (12) và <em>(Bồ Tát)</em> <i>(chú thích)</i>.</p>';
  const item = { ...book, row: { id: 'kinh-duy-ma-cat', tieu_de: 'KINH DUY MA CẬT SỞ THUYẾT', noi_dung: '<p>Giới thiệu.</p>' } };
  const metadata = { id: '13626', bai_viet_id: item.row.id, so_thu_tu: 0, updated_at: '2026-11-04' };
  const fetcher = vi.fn(async (input: URL) => input.pathname.endsWith('tap_noi_dung') ? json([metadata])
    : input.searchParams.get('action') === 'article' ? json({ article: item.row, chapters: [{ ...metadata, tieu_de: 'PHẨM THỨ NHẤT', noi_dung: raw }], next: null })
      : json({ items: [item], articlesNext: null, talksNext: null }));
  for (const requests of [3, 2]) {
    expect((await syncOfflineContent({ root, fetcher })).requests).toBe(requests);
    const content = read(root, `static/offline-data/chapters/${item.row.id}.json`)[0].noi_dung;
    expect(content).toBe('<p>Giữ nguyên <em>(tọa thiền)</em>, <em>(12)</em> và <em>(Bồ Tát)</em> <i>(chú thích)</i>.</p>');
    expect(content.replace(/<[^>]*>/gu, '')).toBe(raw.replace(/<[^>]*>/gu, ''));
    expect(content).not.toMatch(/<em>\s*<(?:em|i)>/u);
  }
});

it('bundles every converted-book illustration at full original bytes and reuses verified local assets', async () => {
  const root = temporary();
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=', 'base64');
  const converted = { ...chapter, noi_dung: '<div class="tt-converted-book"><p>Text</p><img src="https://media.quangtu.vn/content/converted/image.png"></div>' };
  const fetcher = vi.fn(async (input: URL) => input.hostname === 'media.quangtu.vn' ? new Response(png, { headers: { 'content-type': 'image/png' } })
    : input.pathname.endsWith('tap_noi_dung') ? json([converted])
    : input.searchParams.get('action') === 'article' ? json({ article: book.row, chapters: [converted], next: null })
    : json({ items: [book], articlesNext: null, talksNext: null }));
  expect((await syncOfflineContent({ root, fetcher })).requests).toBe(4);
  const stored = read(root, 'static/offline-data/chapters/book.json')[0].noi_dung;
  const source = /src="([^"]+)"/.exec(stored)![1];
  expect(source).toMatch(/^\/assets\/book-content\/converted\/[a-f0-9]+\.png$/);
  expect(readFileSync(path.join(root, source))).toEqual(png);
  const version = read(root, 'src/lib/data/offline-content-versions.json').book;
  expect(version.images).toEqual([expect.objectContaining({ path: source, bytes: png.length, sha256: expect.stringMatching(/^[a-f0-9]{64}$/) })]);
  expect((await syncOfflineContent({ root, fetcher })).requests).toBe(2);
});
it('never commits a converted bundle when one illustration download fails', async () => {
  const root = temporary();
  const converted = { ...chapter, noi_dung: '<div class="tt-converted-book"><img src="https://media.quangtu.vn/content/converted/missing.png"></div>' };
  const fetcher = vi.fn(async (input: URL) => input.hostname === 'media.quangtu.vn' ? new Response('missing', { status: 404 })
    : input.pathname.endsWith('tap_noi_dung') ? json([converted])
    : input.searchParams.get('action') === 'article' ? json({ article: book.row, chapters: [converted], next: null })
    : json({ items: [book], articlesNext: null, talksNext: null }));
  await expect(syncOfflineContent({ root, fetcher })).rejects.toThrow('illustration');
  expect(() => read(root, 'src/lib/data/offline-bundled-articles.json')).toThrow();
});
