import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadBundledPracticeMantra } from '../../../src/lib/browser/bundled-practice-mantras';
import { fetchEnglishChapters } from '../../../src/lib/browser/english-pack';

vi.mock('../../../src/lib/browser/english-pack', () => ({ fetchEnglishChapters: vi.fn() }));
const id = 'tt_nghi_thuc_tri_chu_bao_khiep_an';

describe('bundled practice manuscripts', () => {
  beforeEach(() => vi.clearAllMocks());
  it('reads both Vietnamese chapters without a data request', async () => {
    const result = await loadBundledPracticeMantra(id, 'vi');
    expect(result?.chapters).toHaveLength(2);
    expect(result?.chapters.every(chapter => chapter.noi_dung.length > 100)).toBe(true);
    expect(fetchEnglishChapters).not.toHaveBeenCalled();
  });
  it('uses the existing verified English package without sharing Vietnamese chapter text', async () => {
    vi.mocked(fetchEnglishChapters).mockResolvedValue(Response.json([
      { so_thu_tu: 1, tieu_de: 'Guidance', noi_dung: 'English guidance' },
      { so_thu_tu: 2, tieu_de: 'Practice', noi_dung: 'English practice' },
    ]));
    const result = await loadBundledPracticeMantra(id, 'en');
    expect(fetchEnglishChapters).toHaveBeenCalledExactlyOnceWith(`/offline-data/chapters-en/${id}.json`);
    expect(result?.detail.tocTitles).toEqual(['Guidance', 'Practice']);
    expect(result?.chapters.map(chapter => chapter.noi_dung)).toEqual(['English guidance', 'English practice']);
    expect(result?.detail.content).toBe('');
  });
  it('leaves ordinary articles and malformed English data to the existing reader', async () => {
    expect(await loadBundledPracticeMantra('unlisted-article', 'en')).toBeNull();
    expect(fetchEnglishChapters).not.toHaveBeenCalled();
    vi.mocked(fetchEnglishChapters).mockResolvedValue(Response.json([{ tieu_de: 'Missing text' }]));
    expect(await loadBundledPracticeMantra(id, 'en')).toBeNull();
  });
});
