import { describe, it, expect } from 'vitest';
import { getContentRecency, compareContentRecency, parseRecencyTimestamp } from '$lib/domain/content-recency';

describe('content-recency helper', () => {
  it('correctly parses Vietnamese date DD/MM/YYYY so 02/09/2026 is later than 12/06/2026', () => {
    const sep2 = parseRecencyTimestamp('02/09/2026'); // 2 tháng 9 năm 2026
    const jun12 = parseRecencyTimestamp('12/06/2026'); // 12 tháng 6 năm 2026
    const jun18 = parseRecencyTimestamp('18/06/2026'); // 18 tháng 6 năm 2026

    expect(sep2).toBeGreaterThan(jun18);
    expect(jun18).toBeGreaterThan(jun12);
  });

  it('sorts articles using Vietnamese DD/MM/YYYY dates with 02/09/2026 on top', () => {
    const langNghiem = {
      id: 'lang-nghiem',
      publishedAt: '12/06/2026',
    };
    const daiBi = {
      id: 'dai-bi',
      publishedAt: '12/06/2026',
    };
    const cungThiThuc = {
      id: 'cung-thi-thuc',
      publishedAt: '02/09/2026',
    };
    const niemDanhHieu = {
      id: 'niem-danh-hieu',
      publishedAt: '18/06/2026',
    };

    const items = [langNghiem, daiBi, cungThiThuc, niemDanhHieu];
    items.sort(compareContentRecency);

    expect(items[0].id).toBe('cung-thi-thuc');
    expect(items[1].id).toBe('niem-danh-hieu');
  });

  it('identifies the newest timestamp between updated_at, created_at and publishedAt', () => {
    const item = {
      publishedAt: '2024-01-01T00:00:00Z',
      createdAt: '2024-01-02T00:00:00Z',
      updatedAt: '2026-09-03T12:00:00Z',
    };
    expect(getContentRecency(item)).toBe(Date.parse('2026-09-03T12:00:00Z'));
  });

  it('falls back to created_at or publishedAt when updatedAt is missing', () => {
    const itemA = {
      created_at: '2025-05-10T10:00:00Z',
      ngay_dang: '2024-01-01',
    };
    expect(getContentRecency(itemA)).toBe(Date.parse('2025-05-10T10:00:00Z'));

    const itemB = {
      ngay_dang: '2026-01-01',
    };
    expect(getContentRecency(itemB)).toBe(Date.parse('2026-01-01'));
  });

  it('sorts newly updated or newly created items to the front', () => {
    const oldArticle = {
      id: 'old',
      createdAt: '2024-01-01T00:00:00Z',
      publishedAt: '2024-01-01T00:00:00Z',
    };
    const updatedArticle = {
      id: 'updated',
      createdAt: '2024-01-01T00:00:00Z',
      publishedAt: '2024-01-01T00:00:00Z',
      updatedAt: '2026-09-03T08:00:00Z',
    };
    const brandNewArticle = {
      id: 'new',
      createdAt: '2026-09-03T09:00:00Z',
      publishedAt: '2026-09-03T09:00:00Z',
      updatedAt: '2026-09-03T09:00:00Z',
    };

    const items = [oldArticle, updatedArticle, brandNewArticle];
    items.sort(compareContentRecency);

    expect(items.map((i) => i.id)).toEqual(['new', 'updated', 'old']);
  });

  it('handles null or empty objects safely', () => {
    expect(getContentRecency(null)).toBe(0);
    expect(getContentRecency({})).toBe(0);
  });
});
