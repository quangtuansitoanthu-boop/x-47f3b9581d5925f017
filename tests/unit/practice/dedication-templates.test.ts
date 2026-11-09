// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
vi.mock('$app/environment', () => ({ browser: true }));
import { extractDedicationText, loadPracticeDedicationTemplates } from '$lib/browser/practice-dedication-templates';

describe('bundled dedication templates', () => {
  it('extracts the actual Vietnamese ritual sections without surrounding mantras or trailing notes', () => {
    for (const [book, chapter] of [['tt_1781274943336', '2343'], ['tt_1781275267452', '1958']]) {
      const chapters = JSON.parse(readFileSync(`static/offline-data/chapters/${book}.json`, 'utf8'));
      const original = chapters.find((item: { id: string }) => String(item.id) === chapter).noi_dung;
      const text = extractDedicationText(original);
      expect(text.startsWith('HỒI HƯỚNG\n')).toBe(true);
      expect(text).toContain('công đức');
      expect(text).not.toContain('{align:');
      expect(text).not.toContain('CHÚ TĂNG TRƯỞNG');
      expect(text).not.toContain('Ghi chú:');
      expect(text).toMatch(/\((?:3 lần|lạy)\)/u);
    }
  });
  it('coalesces repeated loads into the same three static file reads and never calls an API', async () => {
    const fetcher = vi.fn(async (url: string) => {
      const path = `static${url}`;
      return { ok: true, json: async () => JSON.parse(readFileSync(path, 'utf8')) } as Response;
    });
    const [first, second] = await Promise.all([
      loadPracticeDedicationTemplates(fetcher as unknown as typeof fetch),
      loadPracticeDedicationTemplates(fetcher as unknown as typeof fetch),
    ]);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(first).toEqual(second);
    expect(first).toHaveLength(3);
    expect(first[2].text).toContain('PHÁT NGUYỆN & HỒI HƯỚNG');
    expect(first[2].text).toContain('(Nên đọc 3 lần)');
    expect(fetcher.mock.calls.every(([url]) => url.startsWith('/offline-data/chapters/'))).toBe(true);
  });
  it('rejects a missing source section instead of inventing dedication text', () => {
    expect(() => extractDedicationText('Nội dung không có phần hồi hướng')).toThrow('dedication_section_missing');
  });
});
