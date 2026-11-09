import { describe, expect, it } from 'vitest';
import { getPracticeRecommendations } from '../../../src/lib/browser/practice-recommendations';

describe('contextual practice recommendations', () => {
  it('uses the Vietnam clock for morning and evening defaults', () => {
    expect(getPracticeRecommendations(new Date('2026-09-04T00:30:00.000Z')).period).toBe('morning');
    expect(getPracticeRecommendations(new Date('2026-09-04T13:30:00.000Z')).period).toBe('evening');
  });

  it('honors an explicit period filter deterministically', () => {
    const result = getPracticeRecommendations(new Date('2026-09-04T00:30:00.000Z'), 'evening');
    expect(result.contextLabel).toBe('Gợi ý buổi tối');
    expect(result.recommendations.some((item) => item.action === 'rosary' || item.action === 'scripture')).toBe(true);
  });

  it('formats lunar label in full ngày tháng năm format', () => {
    const result = getPracticeRecommendations(new Date('2026-09-04T00:30:00.000Z'), 'morning');
    expect(result.lunarLabel).toMatch(/^Ngày \d+ tháng \d+/);
    expect(result.lunarLabel).toContain('năm 2026');
  });

  it('derives lunar observances from the shared lunar event utility', () => {
    const result = getPracticeRecommendations(new Date('2026-02-17T05:00:00.000Z'), 'morning');
    expect(result.recommendations[0].reason).not.toBe('daily');
    expect(result.lunarLabel).not.toBeNull();
  });

  it('keeps exact scripture lookup hints in the browser DTO', () => {
    const result = getPracticeRecommendations(new Date('2026-02-17T05:00:00.000Z'), 'morning');
    const scripture = result.recommendations.find((item) => item.action === 'scripture');
    expect(scripture?.articleCategory).toMatch(/KINH PHẬT|CÁC NGHI THỨC/u);
    expect(scripture?.articleKeywords?.length).toBeGreaterThan(0);
  });

  it('preserves English repentance labels, article identity and legacy ritual categories', () => {
    const result = getPracticeRecommendations(new Date('2026-10-25T01:00:00Z'), 'morning', [
      { id: 'repentance', title: 'Repentance Ritual for Karmic Creditors', category: 'CÁC NGHI THỨC' },
      { id: 'other', title: 'Repentance for unborn children', category: 'NGHI THỨC KHÁC' },
      { id: 'sutra', title: 'Medicine Buddha Sutra', category: 'KINH PHẬT' },
    ], 'en');
    expect(result.recommendations[0]).toMatchObject({ action: 'ceremony', buttonLabel: 'Prostration' });
    expect(result.recommendations[0].articleId).toBeUndefined();
    expect(result.recommendations[1]).toMatchObject({ articleId: 'sutra', articleCategory: 'KINH PHẬT' });
    expect(result.recommendations[2]).toMatchObject({
      articleId: 'repentance', articleCategory: 'CÁC NGHI THỨC',
      title: 'Repentance Ritual for Karmic Creditors',
      buttonLabel: 'Repentance', stepLabel: 'Step 3 · Repentance',
    });
  });
});
