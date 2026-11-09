import { afterEach, describe, expect, it, vi } from 'vitest';
import { availableContent, availableContentResponse, blockedContentRequest, isContentAvailable } from '../../src/lib/browser/ios-content-policy';

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false, getPlatform: () => 'web' } }));
afterEach(() => vi.unstubAllEnvs());
describe('iOS content availability', () => {
  it('preserves web data and responses', async () => {
    vi.stubEnv('VITE_CONTENT_PLATFORM', '');
    const rows = [{ id: 'tt_tro_ve_tu_xu_tuyet' }];
    expect(availableContent(rows)).toBe(rows);
    expect(isContentAvailable(rows[0])).toBe(true);
    const response = Response.json(rows);
    expect(await availableContentResponse(response)).toBe(response);
    expect(blockedContentRequest(new URL('https://quangtu.vn/api/articles/tt_tro_ve_tu_xu_tuyet'))).toBe(false);
  });
  it.each(['android', 'ios'])('blocks direct books, chapters and album shells on %s', platform => {
    vi.stubEnv('VITE_CONTENT_PLATFORM', platform);
    for (const id of ['tt_1781529439696', 'tt_1781529470187', 'tt_1781529533555', 'tt_tro_ve_tu_xu_tuyet',
      'pt_1782208869321', 'pt_1782208945706', 'pt_1782208975513']) {
      expect(isContentAvailable({ id })).toBe(false);
      expect(availableContent([{ id }, { id: 'kept' }])).toEqual([{ id: 'kept' }]);
    }
    for (const url of ['/api/articles/tt_1781529439696', '/api/articles/book_tt_tro_ve_tu_xu_tuyet/chapters',
      '/api/talks/pt_1782208869321', '/api/data/tap_noi_dung?bai_viet_id=eq.tt_1781529533555',
      '/offline-data/chapters-en/tt_tro_ve_tu_xu_tuyet.json']) {
      expect(blockedContentRequest(new URL(url, 'https://quangtu.vn'))).toBe(true);
    }
    expect(blockedContentRequest(new URL('https://quangtu.vn/api/articles/kept'))).toBe(false);
  });
  it.each(['android', 'ios'])('filters remote updates while preserving pagination cursors on %s', async platform => {
    vi.stubEnv('VITE_CONTENT_PLATFORM', platform);
    const response = await availableContentResponse(Response.json({ items: [
      { row: { id: 'pt_1782208869321' } }, { row: { id: 'kept' } },
    ], talksNext: 'next' }));
    expect(await response.json()).toEqual({ items: [{ row: { id: 'kept' } }], talksNext: 'next' });
    expect(isContentAvailable({ id: 'tt_tro_ve_tu_xu_tuyet' })).toBe(false);
  });
});
