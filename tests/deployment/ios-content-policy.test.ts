import { describe, expect, it } from 'vitest';
import { filterIosContent, isIosExcludedContent } from '../../src/lib/domain/ios-content-policy';
import books from '../../static/offline-bundled-articles.json';
import talks from '../../static/offline-data/talks.json';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { removeIosExcludedAssets } from '../../scripts/lib/ios-content-assets.mjs';

describe('iOS release content exclusions', () => {
  it.each(['android', 'ios'])('excludes the same seven installer items on %s while keeping sources, shared covers and audio naming', platform => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'native-bundle-exclusions-'));
    try {
      const output = path.join(root, 'output');
      const books = ['tt_1781529439696', 'tt_1781529470187', 'tt_1781529533555', 'tt_tro_ve_tu_xu_tuyet'].map(id => ({ id, anh_url: `/covers/${id}.jpg` }));
      const talks = ['pt_1782208869321', 'pt_1782208945706', 'pt_1782208975513'].map(id => ({ id, anh_dai_dien: `/covers/${id}.jpg` }));
      fs.mkdirSync(path.join(output, 'offline-data/chapters-en'), { recursive: true });
      fs.mkdirSync(path.join(output, 'offline-data/chapters'), { recursive: true });
      fs.mkdirSync(path.join(output, 'covers')); fs.mkdirSync(path.join(output, 'assets/audio'), { recursive: true });
      const data = [...books, ...talks];
      for (const row of data) fs.writeFileSync(path.join(output, 'covers', `${row.id}.jpg`), 'cover');
      for (const row of books) for (const locale of ['chapters', 'chapters-en']) fs.writeFileSync(path.join(output, 'offline-data', locale, `${row.id}.json`), '["excluded text"]');
      fs.writeFileSync(path.join(output, 'offline-bundled-articles.json'), JSON.stringify([...books, { id: 'kept-book', anh_url: books[0].anh_url }]));
      fs.writeFileSync(path.join(output, 'offline-data/talks.json'), JSON.stringify([...talks, { id: 'kept-talk' }]));
      const audio = path.join(output, 'assets/audio/chu-lang-nghiem-dieu-am-tinh-tuan-20261023.mp3');
      fs.writeFileSync(audio, 'recording');
      removeIosExcludedAssets(output, { iosAudioAlias: platform === 'ios' });
      expect(JSON.parse(fs.readFileSync(path.join(output, 'offline-bundled-articles.json'), 'utf8')).map(row => row.id)).toEqual(['kept-book']);
      expect(JSON.parse(fs.readFileSync(path.join(output, 'offline-data/talks.json'), 'utf8')).map(row => row.id)).toEqual(['kept-talk']);
      for (const row of books) for (const locale of ['chapters', 'chapters-en']) expect(fs.existsSync(path.join(output, 'offline-data', locale, `${row.id}.json`))).toBe(false);
      expect(fs.existsSync(path.join(output, books[0].anh_url))).toBe(true);
      for (const row of data.slice(1)) expect(fs.existsSync(path.join(output, 'covers', `${row.id}.jpg`))).toBe(false);
      expect(fs.existsSync(audio)).toBe(platform === 'android');
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
  it('removes exactly the four requested books and three audiobook albums', () => {
    const originalBooks = structuredClone(books);
    const originalTalks = structuredClone(talks);
    const iosBooks = filterIosContent(books);
    expect(books.filter(isIosExcludedContent)).toHaveLength(4);
    expect(talks.filter(isIosExcludedContent)).toHaveLength(3);
    expect(iosBooks).toHaveLength(books.length - 4);
    expect(filterIosContent(talks)).toHaveLength(talks.length - 3);
    expect(books.length).toBeGreaterThanOrEqual(100);
    expect(talks.length).toBeGreaterThanOrEqual(48);
    for (const id of ['kinh-duy-ma-cat', 'kinh-niem-phat-ba-la-mat']) {
      expect(iosBooks.some(book => book.id === id), `${id} must remain bundled on iOS`).toBe(true);
    }
    expect(books).toEqual(originalBooks);
    expect(talks).toEqual(originalTalks);
  });
  it('recognizes aliases, chapters, translations and renamed known albums', () => {
    for (const row of [
      { id: 'book_tt_tro_ve_tu_xu_tuyet' },
      { bai_viet_id: 'tt_1781529439696' },
      { id: 'pt_1782208869321', tieu_de: 'New title' },
      { title: 'Many Lives, Many Times - Volume 2' },
      { title: 'Return from the Snow Mountain' },
    ]) expect(isIosExcludedContent(row)).toBe(true);
    expect(isIosExcludedContent({ title: 'Kinh Địa Tạng', tac_gia: 'Nguyên Phong' })).toBe(false);
  });
  it('filters fallback maps, manifests and update rows without mutating input', () => {
    const source = { tt_tro_ve_tu_xu_tuyet: { title: 'English' }, kept: { title: 'Kinh' } };
    expect(filterIosContent(source)).toEqual({ kept: { title: 'Kinh' } });
    expect(Object.keys(source)).toHaveLength(2);
    expect(filterIosContent({ entries: [{ file: 'tt_tro_ve_tu_xu_tuyet.json' }, { file: 'kept.json' }] }))
      .toEqual({ entries: [{ file: 'kept.json' }] });
    expect(filterIosContent({ items: [{ row: { id: 'tt_1781529470187' } }, { row: { id: 'kept' } }], articlesNext: 'cursor' }))
      .toEqual({ items: [{ row: { id: 'kept' } }], articlesNext: 'cursor' });
  });
  it('prunes only an iOS staging directory, including stale chapter files and covers', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ios-exclusions-'));
    try {
      for (const target of ['source', 'ios', 'android']) {
        const folder = path.join(root, target);
        fs.mkdirSync(path.join(folder, 'offline-data/chapters'), { recursive: true });
        fs.mkdirSync(path.join(folder, 'covers'));
        fs.mkdirSync(path.join(folder, 'assets/audio'), { recursive: true });
        fs.writeFileSync(path.join(folder, 'assets/audio/chu-lang-nghiem-dieu-am-tinh-tuan-20261023.mp3'), 'unchanged recording');
        fs.writeFileSync(path.join(folder, 'offline-bundled-articles.json'), JSON.stringify([
          { id: 'tt_tro_ve_tu_xu_tuyet', anh_url: '/covers/snow.jpg' }, { id: 'kept' },
        ]));
        fs.writeFileSync(path.join(folder, 'offline-data/chapters/book_tt_tro_ve_tu_xu_tuyet.json'), '["restricted"]');
        fs.writeFileSync(path.join(folder, 'covers/snow.jpg'), 'cover');
        fs.writeFileSync(path.join(folder, 'offline-data/chapters/kept.json'), '["kept"]');
      }
      removeIosExcludedAssets(path.join(root, 'ios'));
      expect(JSON.parse(fs.readFileSync(path.join(root, 'ios/offline-bundled-articles.json'), 'utf8'))).toEqual([{ id: 'kept' }]);
      expect(fs.existsSync(path.join(root, 'ios/offline-data/chapters/book_tt_tro_ve_tu_xu_tuyet.json'))).toBe(false);
      expect(fs.existsSync(path.join(root, 'ios/covers/snow.jpg'))).toBe(false);
      expect(fs.existsSync(path.join(root, 'ios/assets/audio/chu-lang-nghiem-dieu-am-tinh-tuan-20261023.mp3'))).toBe(false);
      expect(fs.readFileSync(path.join(root, 'ios/assets/audio/chu-lang-nghiem.mp3'), 'utf8')).toBe('unchanged recording');
      expect(fs.readFileSync(path.join(root, 'ios/offline-data/chapters/kept.json'), 'utf8')).toBe('["kept"]');
      for (const target of ['source', 'android']) {
        expect(fs.existsSync(path.join(root, target, 'covers/snow.jpg'))).toBe(true);
        expect(fs.existsSync(path.join(root, target, 'offline-data/chapters/book_tt_tro_ve_tu_xu_tuyet.json'))).toBe(true);
      }
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
});
