import { describe, expect, it } from 'vitest';
import { getPracticeRecommendations, practiceTimeWindow } from '../../../src/lib/domain/practice/recommendations';

const lunarEvent = { isEvent: false, isThapTrai: false, lunarDay: 3, lunarMonth: 8, viaName: null };

describe('practice recommendations', () => {
  it('uses deterministic local morning/evening windows', () => {
    expect(practiceTimeWindow(4)).toBe('morning');
    expect(practiceTimeWindow(10)).toBe('morning');
    expect(practiceTimeWindow(11)).toBe('daytime');
    expect(practiceTimeWindow(17)).toBe('evening');
    expect(practiceTimeWindow(2)).toBe('evening');
  });

  it('combines holy/lunar metadata with time-of-day and has a daytime fallback', () => {
    const specialMorning = getPracticeRecommendations({
      hour: 7,
      lunarEvent: {
        ...lunarEvent,
        isEvent: true,
        isThapTrai: true,
        lunarDay: 8,
      },
    });
    expect(specialMorning[0].reason).toBe('lunar_event');
    expect(specialMorning[1].reason).toBe('lunar_event');
    expect(specialMorning[2].reason).toBe('morning');

    expect(getPracticeRecommendations({ hour: 20, lunarEvent })[0]).toMatchObject({ reason: 'evening' });
    expect(getPracticeRecommendations({ hour: 13, lunarEvent })[0]).toMatchObject({ reason: 'fallback' });
  });

  it('generates a 3-step practice session: Lễ Phật -> Tụng Kinh -> Trì Chú', () => {
    const morning = getPracticeRecommendations({ hour: 7, lunarEvent });
    expect(morning).toHaveLength(3);
    expect(morning[0]).toMatchObject({ step: 1, activity: 'ceremony', buttonLabel: 'Lễ Phật' });
    expect(morning[1]).toMatchObject({ step: 2, activity: 'scripture', buttonLabel: 'Tụng kinh' });
    expect(morning[2]).toMatchObject({ step: 3, buttonLabel: expect.any(String) });

    const evening = getPracticeRecommendations({ hour: 20, lunarEvent });
    expect(evening).toHaveLength(3);
    expect(evening[0]).toMatchObject({ step: 1, activity: 'ceremony', buttonLabel: 'Lễ Phật' });
    expect(evening[1]).toMatchObject({ step: 2, activity: 'scripture', buttonLabel: 'Tụng kinh' });
    expect(evening[2]).toMatchObject({ step: 3, buttonLabel: expect.any(String) });
  });

  it('binds directly to real available articles in the library and never suggests non-existent ones', () => {
    const mockLibrary = [
      { id: 'kinh-lang-nghiem', title: 'KINH THỦ LĂNG NGHIÊM', category: 'KINH PHẬT' as const },
      { id: 'chu-dai-bi', title: 'NGHI THỨC TRÌ TỤNG CHÚ ĐẠI BI', category: 'CÁC NGHI THỨC' as const },
      { id: 'chu-lang-nghiem', title: 'NGHI THỨC TRÌ TỤNG THẦN CHÚ THỦ LĂNG NGHIÊM', category: 'CÁC NGHI THỨC' as const },
    ];

    const result = getPracticeRecommendations({
      hour: 7,
      lunarEvent,
      availableArticles: mockLibrary,
    });

    expect(result[1].articleId).toBe('kinh-lang-nghiem');
    expect(result[1].title).toBe('KINH THỦ LĂNG NGHIÊM');
    expect(result[2].articleId).toBe('chu-dai-bi');
    expect(result[2].title).toBe('NGHI THỨC TRÌ TỤNG CHÚ ĐẠI BI');
  });

  it('prioritizes matching holy day scriptures if present in the library', () => {
    const mockLibrary = [
      { id: 'kinh-pho-mon', title: 'Kinh Diệu Pháp Liên Hoa — Phẩm Phổ Môn', category: 'KINH PHẬT' as const },
      { id: 'chu-dai-bi', title: 'Nghi thức Trì tụng Chú Đại Bi', category: 'CÁC NGHI THỨC' as const },
    ];

    // Day 19 Month 2 (Vía Quán Thế Âm)
    const guanyinDay = getPracticeRecommendations({
      hour: 20,
      lunarEvent: { ...lunarEvent, lunarDay: 19, lunarMonth: 2 },
      availableArticles: mockLibrary,
    });

    expect(guanyinDay[1].articleId).toBe('kinh-pho-mon');
    expect(guanyinDay[1].reason).toBe('lunar_event');
    expect(guanyinDay[2].articleId).toBe('chu-dai-bi');
    expect(guanyinDay[2].reason).toBe('lunar_event');
  });

  it('keeps holy-day scripture priority when the lunar metadata includes the real occasion name', () => {
    const availableArticles = [
      { id: 'dia-tang', title: 'Kinh Địa Tạng', category: 'KINH PHẬT' as const },
      { id: 'phap-hoa', title: 'Kinh Diệu Pháp Liên Hoa — Phẩm Phổ Môn', category: 'KINH PHẬT' as const },
      { id: 'duoc-su', title: 'Kinh Dược Sư', category: 'KINH PHẬT' as const },
      { id: 'lang-nghiem', title: 'Kinh Thủ Lăng Nghiêm', category: 'KINH PHẬT' as const },
    ];
    for (const occasion of [
      { lunarDay: 19, lunarMonth: 2, viaName: 'Vía Quán Thế Âm Bồ Tát', articleId: 'phap-hoa' },
      { lunarDay: 30, lunarMonth: 7, viaName: 'Vía Địa Tạng Bồ Tát', articleId: 'dia-tang' },
    ]) {
      const result = getPracticeRecommendations({ hour: 20, availableArticles,
        lunarEvent: { ...lunarEvent, ...occasion, isEvent: true } });
      expect(result[1].articleId).toBe(occasion.articleId);
      expect(result[1].reason).toBe('lunar_event');
      expect(result[1].description).toContain(occasion.viaName);
    }
  });

  it('rotates only the four requested sutras throughout morning, evening and lunar observances', () => {
    const allowed = ['Kinh Địa Tạng Bồ Tát Bổn Nguyện', 'Kinh Diệu Pháp Liên Hoa', 'Kinh Thủ Lăng Nghiêm', 'Kinh Dược Sư'];
    const availableArticles = [...allowed, 'Kinh Trường Bộ', 'Kinh Phổ Môn', 'Kinh Bát Nhã'].map((title, index) => ({
      id: String(index), title, category: 'KINH PHẬT' as const,
    }));
    const seen = new Set<string>();
    for (let day = 1; day <= 30; day += 1) {
      for (const hour of [7, 13, 20]) {
        const sutra = getPracticeRecommendations({ hour, lunarEvent: { ...lunarEvent, lunarDay: day, lunarMonth: 7 }, availableArticles })[1];
        expect(allowed).toContain(sutra.title);
        expect(sutra.articleId).toBeDefined();
        seen.add(sutra.title);
      }
    }
    expect([...seen].sort()).toEqual([...allowed].sort());
  });

  it('does not fall back to another sutra when the four allowed books are unavailable', () => {
    const sutra = getPracticeRecommendations({ hour: 7, lunarEvent, availableArticles: [
      { id: 'other', title: 'Kinh Trường Bộ', category: 'KINH PHẬT' },
    ] })[1];
    expect(sutra.articleId).toBeUndefined();
    expect(sutra.title).toBe('Kinh Địa Tạng');
    expect(sutra.articleKeywords).not.toContain('kinh phat');
    expect(sutra.articleKeywords).toContain('duoc su');
  });

  it('starts with bowing and cycles the three rituals without unrelated ceremonies or duplicate family entries', () => {
    const availableArticles = [
      { id: 'dai-bi', title: 'Nghi thức trì tụng Chú Đại Bi', category: 'TRÌ CHÚ' as const },
      { id: 'dai-bi-copy', title: 'Trì chú Đại Bi — bản khác', category: 'TRÌ CHÚ' as const },
      { id: 'lang-nghiem', title: 'Nghi thức trì tụng thần chú Thủ Lăng Nghiêm', category: 'TRÌ CHÚ' as const },
      { id: 'oan-gia', title: 'Nghi thức sám hối oan gia trái chủ', category: 'NGHI THỨC KHÁC' as const },
      { id: 'other', title: 'Nghi thức sám hối thai nhi', category: 'NGHI THỨC KHÁC' as const },
      { id: 'sutra', title: 'Kinh Thủ Lăng Nghiêm', category: 'KINH PHẬT' as const },
    ];
    const sequence: string[] = [];
    for (let day = 1; day <= 30; day += 1) {
      for (const hour of [7, 20]) {
        const result = getPracticeRecommendations({ hour, lunarEvent: { ...lunarEvent, lunarDay: day }, availableArticles });
        expect(result[0]).toMatchObject({ activity: 'ceremony', buttonLabel: 'Lễ Phật' });
        expect(result[0].articleId).toBeUndefined();
        sequence.push(result[2].articleId!);
        if (result[2].articleId === 'oan-gia') {
          expect(result[2].buttonLabel).toBe('Sám hối');
          expect(result[2].stepLabel).toBe('Bước 3 · Sám Hối');
        }
      }
    }
    expect(sequence.slice(0, 6)).toEqual(['dai-bi', 'lang-nghiem', 'oan-gia', 'dai-bi', 'lang-nghiem', 'oan-gia']);
    for (const id of ['dai-bi', 'lang-nghiem', 'oan-gia']) expect(sequence.filter(value => value === id)).toHaveLength(20);
  });

  it('skips missing rituals and preserves category and exact lookup hints for the available one', () => {
    const result = getPracticeRecommendations({ hour: 7, lunarEvent, availableArticles: [
      { id: 'other', title: 'Nghi thức sám hối thai nhi', category: 'NGHI THỨC KHÁC' },
      { id: 'oan-gia', title: 'NGHI THỨC SÁM HỐI OAN GIA TRÁI CHỦ', category: 'CÁC NGHI THỨC' },
    ] });
    expect(result[2]).toMatchObject({ articleId: 'oan-gia', articleCategory: 'CÁC NGHI THỨC', buttonLabel: 'Sám hối' });
    expect(result[2].articleKeywords).toEqual(['nghi thuc sam hoi oan gia trai chu']);
  });
  it.each(['vi', 'en'])('keeps unnamed lunar observances readable in %s', (locale) => {
    const result = getPracticeRecommendations({ hour: 7, locale,
      lunarEvent: { ...lunarEvent, isEvent: true, lunarDay: 17, lunarMonth: 9 },
      availableArticles: [
        { id: 'sutra', title: 'Kinh Địa Tạng', category: 'KINH PHẬT' },
        { id: 'mantra', title: 'Chú Đại Bi', category: 'TRÌ CHÚ' },
      ],
    });
    for (const item of result) {
      expect(item.reason).toBe('lunar_event');
      expect(item.description).not.toMatch(/^\s*;/);
      expect(item.description).toContain(locale === 'en' ? 'Lunar day 17/9' : 'Ngày 17/9 âm lịch');
    }
  });
});
