import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import buddhas from '../../../src/lib/data/buddhas.json';
import profiles from '../../../src/lib/data/buddha-profiles.json';
import { getBuddhaProfile } from '../../../src/lib/content/buddha-profiles';
import { getBuddhaProfileUi } from '../../../src/lib/i18n/buddha-profile-ui';
import diaTang from '../../../src/lib/data/scripture-copying/dia-tang.json';
import phapHoa from '../../../src/lib/data/scripture-copying/phap-hoa.json';
import langNghiem from '../../../src/lib/data/scripture-copying/lang-nghiem.json';

describe('public Buddha profiles', () => {
  it('keeps the approved prostration carousel order with Shakyamuni first and Amitabha second', () => {
    expect(buddhas.map(buddha => buddha.id)).toEqual([
      'thich-ca-mau-ni', 'a-di-da', 'ty-lo-gia-na', 'duoc-su', 'quan-the-am', 'dai-the-chi',
      'dia-tang-vuong', 'van-thu-su-loi', 'pho-hien', 'di-lac', 'duoc-vuong', 'hu-khong-tang',
      'nhat-quang', 'nguyet-quang',
    ]);
    for (const buddha of buddhas) expect(getBuddhaProfile(buddha.id)?.id).toBe(buddha.id);
  });

  it('gives all fourteen profiles a full Nam mô recitation formula without presenting the app guide as scripture', () => {
    expect(profiles).toHaveLength(14);
    for (const buddha of buddhas) {
      const section = getBuddhaProfile(buddha.id)!.sections[3];
      const guides = section.paragraphs.filter(text => text.startsWith('Hướng dẫn xưng niệm trong ứng dụng:'));
      if (['ty-lo-gia-na', 'hu-khong-tang', 'thich-ca-mau-ni'].includes(buddha.id)) {
        expect(guides).toHaveLength(0);
        expect(section.paragraphs.join(' ')).toMatch(/Nam mô /iu);
      } else {
        expect(guides).toEqual([`Hướng dẫn xưng niệm trong ứng dụng: “${buddha.danhHieu}”.`]);
      }
    }
  });

  it.each([
    ['ty-lo-gia-na', 'name-benefits', 'đảnh lễ câu: Nam mô Thanh Tịnh Pháp Thân Tỳ Lô Xá Na Phật'],
    ['hu-khong-tang', 'name-recitation-benefits', 'xưng niệm tôn danh: Nam mô Đại Bi Hư Không Tạng Bồ Tát'],
  ])('introduces the instructed recitation with Nam mô while preserving the full name: %s', (id, sectionId, formula) => {
    const paragraphs = getBuddhaProfile(id)!.sections.find(section => section.id === sectionId)!.paragraphs;
    expect(paragraphs[0]).toContain(formula);
    expect(paragraphs.join(' ')).not.toContain('Nam mô Nam mô');
  });

  it('preserves all ten Samantabhadra practices and their full canonical explanations from the existing library', () => {
    const paragraphs = getBuddhaProfile('pho-hien')!.sections.find(section => section.id === 'muoi-dai-hanh-nguyen')!.paragraphs.slice(1);
    expect(paragraphs).toHaveLength(47);
    expect(createHash('sha256').update(JSON.stringify(paragraphs)).digest('hex')).toBe('12cdb39f28f6596f16ee9cf81518f4878daeaa8d72500b3cd8acff15fa9ebcec');
    expect(paragraphs.slice(2, 12).map(text => text.split(' ')[0])).toEqual(['Một', 'Hai', 'Ba', 'Bốn', 'Năm', 'Sáu', 'Bảy', 'Tám', 'Chín', 'Mười']);
    expect(paragraphs.at(-1)).toContain('mười điều nguyện lớn đầy đủ viên mãn');
  });
  it('preserves the supplied Amitabha PDF chapter with all 48 labels in its 24 original groups', () => {
    const profile = getBuddhaProfile('a-di-da')!;
    const paragraphs = profile.sections.find(section => section.id === 'dai-nguyen')!.paragraphs;
    const canonicalText = paragraphs.slice(1).join(' ');
    expect(paragraphs.slice(2)).toHaveLength(24);
    expect([...canonicalText.matchAll(/(?:\[|\s)(\d+)\. Nguyện/g)].map(match => Number(match[1])))
      .toEqual(Array.from({ length: 48 }, (_, index) => index + 1));
    expect(createHash('sha256').update(canonicalText).digest('hex')).toBe('cc5a2d0be1696bfaf89863073c43a9bf3cb774e62479bcb8a5ae132612b40622');
    expect(paragraphs[0]).toContain('HT Thích Đức Niệm và cư sĩ Minh Chánh');
    expect(paragraphs[0]).not.toContain('Trí Tịnh');
  });
  it('keeps canonical vow excerpts verbatim from the supplied scripture corpus', () => {
    const passages = [
      { id: 'dia-tang-vuong', book: diaTang, chapter: 1, block: 23, paragraph: 2 },
      { id: 'dia-tang-vuong', book: diaTang, chapter: 1, block: 33, paragraph: 4 },
      { id: 'dia-tang-vuong', book: diaTang, chapter: 4, block: 3, paragraph: 6 },
      { id: 'thich-ca-mau-ni', book: phapHoa, chapter: 2, block: 21, paragraph: 1 },
      { id: 'quan-the-am', book: phapHoa, chapter: 25, block: 9, paragraph: 1 },
      { id: 'quan-the-am', book: phapHoa, chapter: 25, block: 11, paragraph: 3 },
      { id: 'quan-the-am', book: phapHoa, chapter: 25, block: 7, paragraph: 5 },
      { id: 'duoc-vuong', book: phapHoa, chapter: 13, block: 0, paragraph: 1 },
      { id: 'dai-the-chi', book: langNghiem, chapter: 5, block: 45, paragraph: 1 },
    ];
    for (const passage of passages) {
      const quote = getBuddhaProfile(passage.id)!.sections[2].paragraphs[passage.paragraph];
      expect(quote.length).toBeGreaterThan(50);
      expect(passage.book.chapters.find(chapter => chapter.number === passage.chapter)!.blocks[passage.block]).toContain(quote);
    }
    expect(getBuddhaProfile('quan-the-am')!.sections[2].paragraphs[0]).toContain('lời kinh mô tả hạnh nguyện');
    expect(getBuddhaProfile('duoc-vuong')!.sections[2].paragraphs[0]).toContain('lời thệ chung');
  });
  it('includes the complete Quang Muc vow from the existing Dia Tang scripture', () => {
    const source = diaTang.chapters.find(chapter => chapter.number === 4)!.blocks;
    const unwrap = (text: string) => [...text.matchAll(/\{align:justify\|([\s\S]*?)\}/g)].map(match => match[1]);
    const expected = [...unwrap(source[8]).slice(2), ...unwrap(source[9]).slice(0, 2)];
    expect(getBuddhaProfile('dia-tang-vuong')!.sections[2].paragraphs.slice(8)).toEqual(expected);
    expect(expected.join(' ')).toContain('vậy sau tôi mới thành bậc Chánh Giác');
  });
  it('resolves every selectable deity to its authored name and complete six-section profile', () => {
    expect(getBuddhaProfileUi(false).sectionLabels).toHaveLength(6);
    expect(getBuddhaProfileUi(true).sectionLabels).toHaveLength(6);
    expect(profiles.map(profile => profile.id).sort()).toEqual(buddhas.map(buddha => buddha.id).sort());
    expect(new Set(profiles.map(profile => profile.id)).size).toBe(buddhas.length);
    for (const authored of profiles) {
      const profile = getBuddhaProfile(authored.id)!;
      expect(profile.id).toBe(authored.id);
      expect(profile.name).toBe(authored.name);
      expect(profile.name.trim()).not.toBe('');
      expect(profile.summary.trim()).not.toBe('');
      expect(profile.sections).toHaveLength(6);
      expect(new Set(profile.sections.map(section => section.id)).size).toBe(6);
      expect(profile.sections.at(-1)?.id).toBe('su-tich-cam-ung');
      for (const section of profile.sections) {
        expect(section.id.trim()).not.toBe('');
        expect(section.title.trim()).not.toBe('');
        expect(section.paragraphs.length).toBeGreaterThan(0);
        for (const text of [...section.paragraphs, ...section.notes]) {
          expect(typeof text).toBe('string');
          expect(text.trim()).not.toBe('');
        }
      }
      expect(profile.references.length).toBeGreaterThan(0);
    }
    expect(getBuddhaProfile('unknown-deity')).toBeNull();
    expect(getBuddhaProfile('')).toBeNull();
  });

  it('ships public text without research URLs, source identifiers or tooling provenance', () => {
    const forbiddenKeys = new Set(['sources', 'sourceIds', 'sourceCount', 'canonicalReferences', 'publicReferences', 'provenancePolicy', 'url', 'scope', 'sourceType', 'uncertainties']);
    const pdfParagraphs = getBuddhaProfile('a-di-da')!.sections.find(section => section.id === 'dai-nguyen')!.paragraphs.slice(1);
    const quangMucParagraphs = [...diaTang.chapters.find(chapter => chapter.number === 4)!.blocks[9].matchAll(/\{align:justify\|([\s\S]*?)\}/g)].slice(0, 2).map(match => match[1]);
    const phoHienParagraphs = getBuddhaProfile('pho-hien')!.sections.find(section => section.id === 'muoi-dai-hanh-nguyen')!.paragraphs.slice(1);
    function inspect(value: unknown): void {
      if (typeof value === 'string') {
        // “v.v...” có trong bản PDF người dùng cung cấp, không phải dấu tự lược kinh văn.
        const checked = pdfParagraphs.includes(value) || quangMucParagraphs.includes(value) || phoHienParagraphs.includes(value) ? value.replaceAll('v.v...', 'v.v.').replaceAll('v.v…', 'v.v.') : value;
        expect(checked).not.toMatch(/https?:\/\/|www\.|sourceCount|qua công cụ|trong công cụ|\.\.\.|…/iu);
      } else if (Array.isArray(value)) {
        value.forEach(inspect);
      } else if (value && typeof value === 'object') {
        for (const [key, child] of Object.entries(value)) {
          expect(forbiddenKeys.has(key), `Private research field: ${key}`).toBe(false);
          inspect(child);
        }
      }
    }
    inspect(profiles);
  });

  it('preserves all twelve Medicine Buddha vows verbatim from the library edition and credits its compiler', () => {
    const section = getBuddhaProfile('duoc-su')!.sections.find(item => item.id === 'great-vows')!;
    const vows = section.paragraphs.slice(1);
    expect(vows).toHaveLength(12);
    expect(vows.map(text => text.split(':')[0])).toEqual(['THỨ NHỨT', 'THỨ HAI', 'THỨ BA', 'THỨ TƯ', 'THỨ NĂM', 'THỨ SÁU', 'THỨ BẢY', 'THỨ TÁM', 'THỨ CHÍN', 'THỨ MƯỜI', 'THỨ MƯỜI MỘT', 'THỨ MƯỜI HAI']);
    expect(createHash('sha256').update(JSON.stringify(vows)).digest('hex')).toBe('d7f3e070fc776343b99dd4cb8beef38f4057a70de3eb52f507f58f8cade7e689');
    expect(section.paragraphs[0]).toContain('HT Thích Trí Quảng biên soạn');
    expect(section.paragraphs[0]).not.toContain('Trí Tịnh');
    for (const vow of vows) expect(vow.length).toBeGreaterThan(100);
  });
});
