import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EIGHT_PRECEPT_GUIDE_SECTIONS } from '../../../src/lib/content/eight-precept-guide';

const normalize = (text: string) => text.replace(/\s+/g, ' ')
  .replaceAll('trẹn đời', 'trên đời').replaceAll('Vơ vua', 'Vợ vua')
  .replace('Giới thứ bảy: Không', 'Giới không').replace('Giới thứ tám: Không', 'Giới không').trim();
const displayed = normalize(EIGHT_PRECEPT_GUIDE_SECTIONS.flatMap(section => [section.title[0], ...section.blocks.map(block => block.kind === 'verse' ? block.lines.map(line => line[0]).join(' ') : block.text[0])]).join(' '));

describe('full guidance and merit accounts supplied by the user', () => {
  it.each(['eight-precept-guide-source.txt', 'eight-precept-merit-stories-source.txt'])('keeps every substantive source paragraph from %s', filename => {
    const source = readFileSync(new URL(`./fixtures/${filename}`, import.meta.url), 'utf8');
    const paragraphs = source.split(/\r?\n/).map(normalize).filter(line => line.length >= 90);
    expect(paragraphs.length).toBeGreaterThan(20);
    for (const paragraph of paragraphs) expect(displayed.includes(paragraph), paragraph).toBe(true);
  });

  it('includes all guidance topics and both complete merit stories', () => {
    const ids = EIGHT_PRECEPT_GUIDE_SECTIONS.map(section => section.id);
    for (const id of ['meaning', 'eight-precepts', 'observance-days', 'receiving-ceremony', 'clothing', 'duration-and-renewal', 'five-and-eight', 'great-aspiration', 'merits', 'temple-sample', 'faq-food', 'faq-medicine', 'faq-meal-reason', 'faq-bathing', 'faq-phone', 'story-tree-spirit', 'story-king-udayana']) expect(ids).toContain(id);
    for (const section of EIGHT_PRECEPT_GUIDE_SECTIONS) {
      expect(section.blocks.length).toBeGreaterThan(0);
      for (const block of section.blocks) {
        for (const pair of block.kind === 'verse' ? block.lines : [block.text]) for (const text of pair) expect(text.trim()).not.toBe('');
      }
    }
  });

  it('retains the practice calendar, early relinquishment, and phone guidance without a ninth precept', () => {
    for (const text of ['Mùng 8, 14, 15, 23, 29, 30 âm lịch.', 'có thể đổi sang ngày 28 hoặc 29', 'Nếu muốn tiếp tục trì giới', 'không cần phải đến trước năm chúng', 'Điều này không phải là giới luật chính thức']) expect(displayed).toContain(text);
  });

  it.each(['eight-precept-guide-source.txt', 'eight-precept-merit-stories-source.txt'])('retains every short line and verse from %s apart from internal source credits', filename => {
    const source = readFileSync(new URL(`./fixtures/${filename}`, import.meta.url), 'utf8');
    // Thông tin xuất xứ lưu ở fixture; không chèn nguồn vào nội dung đọc theo yêu cầu.
    const sourceCredits = /^(?:Chúng con xin cung kính trích trong|T016 BẢN DUYÊN|Thí dụ 41:|Phẩm 36: LỢI DƯỠNG)/;
    for (const line of source.split(/\r?\n/).map(normalize).filter(line => line && !sourceCredits.test(line))) expect(displayed.includes(line), line).toBe(true);
  });

  it('keeps the three original story verse groups as separate lines', () => {
    const tree = EIGHT_PRECEPT_GUIDE_SECTIONS.find(section => section.id === 'story-tree-spirit');
    const king = EIGHT_PRECEPT_GUIDE_SECTIONS.find(section => section.id === 'story-king-udayana');
    expect(tree?.blocks.filter(block => block.kind === 'verse').map(block => block.lines.length)).toEqual([4, 8]);
    expect(king?.blocks.filter(block => block.kind === 'verse').map(block => block.lines.length)).toEqual([8]);
  });

  it('retains repeated source passages instead of silently deduplicating them', () => {
    const counts = new Map<string, number>();
    for (const filename of ['eight-precept-guide-source.txt', 'eight-precept-merit-stories-source.txt']) {
      const source = readFileSync(new URL(`./fixtures/${filename}`, import.meta.url), 'utf8');
      for (const line of source.split(/\r?\n/).map(normalize).filter(line => line && !/^(?:Chúng con xin cung kính trích trong|T016 BẢN DUYÊN|Thí dụ 41:|Phẩm 36: LỢI DƯỠNG)/.test(line))) counts.set(line, (counts.get(line) ?? 0) + 1);
    }
    for (const [line, count] of counts) expect(displayed.split(line).length - 1, line).toBeGreaterThanOrEqual(count);
  });
});
