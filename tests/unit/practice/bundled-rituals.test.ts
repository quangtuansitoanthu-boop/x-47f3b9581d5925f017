import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import articles from '../../../src/lib/data/offline-bundled-articles.json';
import ritualFiles from '../../../src/lib/data/bundled-english-rituals.json';
import { hasEnglishChapters } from '../../../src/lib/domain/library/localized-article';
import { normalizePracticeCategory } from '../../../src/lib/domain/practice/state';

describe('bundled practice rituals', () => {
  it('keeps the Niem Phat introduction free of displayed source links in both bundles', () => {
    for (const file of ['src/lib/data/offline-bundled-articles.json', 'static/offline-bundled-articles.json']) {
      const rows = JSON.parse(readFileSync(file, 'utf8'));
      const article = rows.find((row: { id: string }) => row.id === 'kinh-niem-phat-ba-la-mat');
      expect(article.noi_dung).not.toMatch(/Nguồn:|<a\b|https?:\/\//u);
      expect(article.noi_dung).toContain('Trọn bộ 7 phẩm theo bản đăng trên website chùa Hoằng Pháp. Chọn phẩm trong mục lục để đọc.');
      expect(article.so_tap).toBe(7);
    }
  });

  it('italicizes every Ton Thang parenthetical without changing recitation words or order', () => {
    const id = 'nghi-thuc-tri-chu-phat-danh-ton-thang-da-la-ni';
    const chapters = JSON.parse(readFileSync(`static/offline-data/chapters/${id}.json`, 'utf8'));
    const content = chapters[0].noi_dung as string;
    expect(createHash('sha256').update(content.replace(/<[^>]*>/gu, '')).digest('hex'))
      .toBe('8179c421aad958ea80d057de043014023a16a84a11fbef3fdf18a85e1ee6b6fc');
    expect(content.replace(/<em>[^<]*<\/em>/gu, '')).not.toMatch(/\([^()]*\)/u);
    expect(content).not.toMatch(/<em>\s*<em>/u);
    for (const file of ['src/lib/data/offline-bundled-articles.json', 'static/offline-bundled-articles.json']) {
      const rows = JSON.parse(readFileSync(file, 'utf8'));
      expect(rows.find((row: { id: string }) => row.id === id).noi_dung).toBe(content);
    }
  });

  it.each(ritualFiles)('keeps %s complete in both languages and in the mantra category', file => {
    const id = file.slice(0, -5);
    const matches = articles.filter(article => article.id === id);
    expect(matches).toHaveLength(1);
    const article = matches[0];
    expect(normalizePracticeCategory(article.danh_muc, article.tieu_de)).toBe('TRÌ CHÚ');
    expect(hasEnglishChapters(id)).toBe(true);
    const vi = JSON.parse(readFileSync(`static/offline-data/chapters/${file}`, 'utf8'));
    const en = JSON.parse(readFileSync(`static/offline-data/chapters-en/${file}`, 'utf8'));
    expect(vi.length).toBe(article.so_tap);
    expect(en.length).toBe(vi.length);
    expect(vi).toHaveLength(2);
    expect(vi.map((row: any) => row.tieu_de)).toEqual(['Hướng dẫn và công dụng của thần chú', 'Nghi thức trì chú']);
    expect(JSON.parse(article.tap_tieu_de)).toEqual(vi.map((row: any) => row.tieu_de));
    for (const rows of [vi, en]) {
      expect(rows.map((row: any) => row.so_thu_tu)).toEqual(rows.map((_: any, i: number) => i));
      expect(rows.every((row: any) => row.bai_viet_id === id && row.noi_dung.trim())).toBe(true);
      expect(rows.map((row: any) => row.noi_dung).join('')).not.toMatch(/@@\d+@@|[\u3400-\u9fff]/u);
      expect(rows.map((row: any) => row.noi_dung).join('')).not.toMatch(/<a\b|https?:\/\//u);
    }
    const english = en.map((row: any) => row.tieu_de + row.noi_dung).join('');
    expect(english).not.toMatch(/(?:Đọc|lần|Chân Ngôn|Hồi hướng|xưng họ tên|XỜ-VA HA)/u);
    if (id.includes('dai_tuy_cau')) {
      const mainVi = vi[1].noi_dung;
      const mainEn = en[1].noi_dung;
      expect(mainVi).toContain('NA MẮC, XA RỜ-VA, TA THA GA TA NĂM');
      expect(mainVi).toContain('VÊ GA, VA TI, XỜ-VA HA');
      expect(mainVi).not.toMatch(/NAMAḤ|TATHĀGATĀNĀṂ|SVĀHĀ/);
      expect(mainEn).toContain('NAMAḤ SARVA TATHĀGATĀNĀṂ');
      expect(mainEn).toContain('VEGA VATI SVĀHĀ');
      expect(mainEn).toContain('Wish-Responsive Mantra of All Tathāgatas');
    }
  });
});
