import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';

const read = (file: string) => JSON.parse(readFileSync(file, 'utf8'));
const articles = read('src/lib/data/offline-bundled-articles.json');

it('ships the new web rituals in both catalog entry points with local covers', () => {
  expect(read('static/offline-bundled-articles.json')).toEqual(articles);
  expect(new Set(articles.map((row: { id: string }) => row.id)).size).toBe(articles.length);
  for (const id of ['nghi-thuc-tri-chu-duoc-su', 'nghi-thuc-tri-chu-phat-danh-ton-thang-da-la-ni']) {
    const article = articles.find((row: { id: string }) => row.id === id);
    expect(article).toMatchObject({ id, bundled_offline: true, is_pdf_book: false });
    expect(existsSync(`static/${article.anh_url}`)).toBe(true);
    if (!article.has_muc_luc) expect(article.noi_dung.length).toBeGreaterThan(100);
  }
});

it('preserves complete ordered chapters and their article IDs for updated sutras and rituals', () => {
  for (const [id, count] of [
    ['nghi-thuc-tri-chu-duoc-su', 2], ['tt_1780910773084', 15],
    ['book_1787189827026_8b568f64', 28], ['tt_1781274943336', 3], ['tt_1781275267452', 3],
    ['kinh-niem-phat-ba-la-mat', 7],
  ] as const) {
    const chapters = read(`static/offline-data/chapters/${id}.json`);
    expect(chapters).toHaveLength(count);
    expect(chapters.map((row: { so_thu_tu: number }) => row.so_thu_tu)).toEqual(
      Array.from({ length: count }, (_, index) => index + (id === 'tt_1780910773084' ? -1 : 0))
    );
    for (const row of chapters) {
      expect(row.bai_viet_id).toBe(id);
      expect(row.noi_dung.trim().length).toBeGreaterThan(0);
    }
  }
});

it('keeps the Dia Tang prayers separate while retaining the thirteen original chapter IDs', () => {
  const id = 'tt_1780910773084';
  const chapters = read(`static/offline-data/chapters/${id}.json`);
  expect(chapters[0].tieu_de).toBe('LỜI NGUYỆN TRƯỚC KHI TỤNG KINH');
  expect(chapters.at(-1).tieu_de).toBe('PHÁT NGUYỆN & HỒI HƯỚNG');
  expect(chapters.slice(1, 14).map((row: { id: string | number }) => Number(row.id)))
    .toEqual(Array.from({ length: 13 }, (_, index) => 2734 + index));
  expect(chapters[1].noi_dung).not.toContain('LỜI NGUYỆN TRƯỚC KHI TỤNG KINH');
  expect(chapters[13].noi_dung).not.toContain('PHÁT NGUYỆN &amp; HỒI HƯỚNG');
  const article = articles.find((row: { id: string }) => row.id === id);
  expect(article.so_tap).toBe(15);
  expect(article.tap_tieu_de).toEqual(chapters.map((row: { tieu_de: string }) => row.tieu_de));
});

it('ships all fourteen ordered Duy Ma Cat chapters with the complete web text and italic parentheticals', () => {
  const id = 'kinh-duy-ma-cat';
  const article = articles.find((row: { id: string }) => row.id === id);
  expect(article).toMatchObject({ id, tieu_de: 'KINH DUY MA CẬT SỞ THUYẾT', danh_muc: 'KINH PHẬT', so_tap: 14, bundled_offline: true, is_pdf_book: false });
  expect(article.tieu_de).toBe(article.tieu_de.toLocaleUpperCase('vi'));
  expect(article.anh_url).toBe('covers/kinh-duy-ma-cat-20261104.webp');
  expect(existsSync(`static/${article.anh_url}`)).toBe(true);
  const chapters = read(`static/offline-data/chapters/${id}.json`);
  expect(chapters).toHaveLength(14);
  expect(chapters.map((row: { id: string }) => row.id)).toEqual(Array.from({ length: 14 }, (_, i) => String(13626 + i)));
  expect(chapters.map((row: { so_thu_tu: number }) => row.so_thu_tu)).toEqual(Array.from({ length: 14 }, (_, i) => i));
  // Mốc toàn văn từ hai trang GET công khai đã chụp ngày 04/11/2026, bỏ riêng thẻ HTML.
  const textHashes = [
    '34f8199040cd333baa32f0ddb6440bb29bcfcd5a94e930a13af00cd6a02e6f91',
    'bef8f8d4712fe3bb4a01f645bb83b912f0aac8af1e87324a8b671806287f3672',
    'a102e9a6302e5ef652e3abd75c572a7ad3d8a099b079ef7eccc77c4a0a16e85b',
    '3d7ec62245a7093ce7ec47082cf28b08828df4098146c972d45da53b99a56667',
    '4c928c4b5071a755bb2a19b8bf283a4e9ccc6a198f70d84384af03a99494c565',
    '507ba382e7bcf133d73f1027405f6a49006cbe77aa975d39d8c97e4d5fafe474',
    '527a8b9e46d9b3f3afd846a9a75114b6437d5c5a91ff9c116f102009521ea75f',
    'a4d593d50fc9bae274408cf52eb3cf3a969b478410c207c85c3528ddf6e50883',
    'a5aa9044c3091335148d44d4b7483bf3445b6449d26bf9218ca48d90c4ab3dcb',
    '8c9d26a19c6fc82ccd78638c4db569e9d14a9daf64a3a76636589c90e2cc079d',
    'd7d09343445fd2439dc9f30dea2b774cbe4d37142c42b5d657bb4c9317989232',
    '0e0faf3c9d35d9371e001288aa51629934ca104d905d12bbb1aba63f949cab42',
    '77308226932f120aaf616f179606dff25354f5a7a85732e3c36d24f21e3f62c2',
    '4702f67bd07050d044f1c6940670c72e0626b0c9728ce36cbe5cb74f7800654b',
  ];
  chapters.forEach((row: { bai_viet_id: string; tieu_de: string; noi_dung: string }, index: number) => {
    expect(row.bai_viet_id).toBe(id);
    expect(row.tieu_de).toBe(row.tieu_de.toLocaleUpperCase('vi'));
    expect(row.noi_dung.trim()).not.toBe('');
    expect(createHash('sha256').update(row.noi_dung.replace(/<[^>]*>/gu, '')).digest('hex')).toBe(textHashes[index]);
    expect(row.noi_dung.replace(/<(em|i)\b[^>]*>[\s\S]*?<\/\1>/giu, '')).not.toMatch(/\([^()]*\)/u);
    expect(row.noi_dung).not.toMatch(/<em>\s*<em>|\(C\)|<a\b[^>]*href=/iu);
  });
  expect(read('static/offline-bundled-articles.json').find((row: { id: string }) => row.id === id)).toEqual(article);
});
