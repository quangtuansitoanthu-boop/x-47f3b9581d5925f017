import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { storeApiResponse } from '../../src/lib/browser/native-api-cache';

const put = vi.fn();
beforeEach(() => {
  put.mockReset();
  vi.stubGlobal('caches', { open: vi.fn(async () => ({ put })) });
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() });
});
afterEach(() => vi.unstubAllGlobals());

describe('native shared content cache privacy', () => {
  it('never persists a response explicitly marked no-store', async () => {
    await storeApiResponse(new URL('https://quangtu.vn/api/talks'), new Response('[{"id":"private"}]', { headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' } }));
    expect(put).not.toHaveBeenCalled();
  });
  it('filters private albums and unpublished articles out of a shared catalog', async () => {
    await storeApiResponse(new URL('https://quangtu.vn/api/talks'), new Response(JSON.stringify([
      { id: 'public', visibility: 'public' }, { id: 'secret', visibility: 'private' },
      { id: 'draft', trang_thai: 'Bản nháp' },
    ]), { headers: { 'content-type': 'application/json' } }));
    expect(put).toHaveBeenCalledTimes(1);
    expect(await put.mock.calls[0][1].json()).toEqual([{ id: 'public', visibility: 'public' }]);
  });
  it('never caches web-only book or album metadata', async () => {
    const rows = [
      { id: 'tt_1781529439696', tieu_de: 'Muôn Kiếp Nhân Sinh - Tập 1', trang_thai: 'Hoàn thành' },
      { id: 'pt_1782208869321', tieu_de: 'Muôn Kiếp Nhân Sinh - Tập 1', visibility: 'public' },
    ];
    await storeApiResponse(new URL('https://quangtu.vn/api/articles/tt_1781529439696'), Response.json(rows[0]));
    expect(put).not.toHaveBeenCalled();
    await storeApiResponse(new URL('https://quangtu.vn/api/talks/pt_1782208869321'), Response.json(rows[1]));
    expect(put).not.toHaveBeenCalled();
  });
});
