import { describe, it, expect } from 'vitest';
import { REFLECTION_GUIDE_SECTIONS } from '$lib/i18n/reflection-guide';
import { countReflectionWords } from '$lib/domain/practice/personal-practice';

describe('Reflection Guide Content', () => {
  it.each(['vi', 'en'] as const)('keeps the %s example count consistent with the journal counter', locale => {
    const example = REFLECTION_GUIDE_SECTIONS[locale].find(section => section.example)?.example;
    expect(example).toBeDefined();
    expect(example!.wordCount).toBe(countReflectionWords(example!.text));
    expect(example!.title).not.toMatch(/\d/u);
  });
  it('contains sections for repentance, rejoicing in merit, 4-part structure, and privacy', () => {
    expect(REFLECTION_GUIDE_SECTIONS.vi.length).toBeGreaterThanOrEqual(4);
    const titles = REFLECTION_GUIDE_SECTIONS.vi.map(s => s.title);
    expect(titles.some(t => t.includes('Sám Hối') || t.includes('Phát Lồ'))).toBe(true);
    expect(titles.some(t => t.includes('Tùy Hỷ') || t.includes('Đuốc'))).toBe(true);
    expect(titles.some(t => t.includes('Cấu Trúc') || t.includes('Đủ Ý'))).toBe(true);
  });

  it('contains specific guidance about true Dharma name and true address', () => {
    const allText = JSON.stringify(REFLECTION_GUIDE_SECTIONS.vi);
    expect(allText).toContain('PHÁP DANH THẬT');
    expect(allText).toContain('ĐỊA CHỈ THẬT');
  });

  it('contains scripture quotation from Kinh Tứ Thập Nhị Chương', () => {
    const allText = JSON.stringify(REFLECTION_GUIDE_SECTIONS.vi);
    expect(allText).toContain('Tứ Thập Nhị Chương');
    expect(allText).toContain('ngọn đuốc');
  });

  it('contains English translations covering all sections', () => {
    expect(REFLECTION_GUIDE_SECTIONS.en.length).toBe(REFLECTION_GUIDE_SECTIONS.vi.length);
    const enText = JSON.stringify(REFLECTION_GUIDE_SECTIONS.en);
    expect(enText).toContain('TRUE DHARMA NAME');
    expect(enText).toContain('Forty-Two Chapters');
  });
});
