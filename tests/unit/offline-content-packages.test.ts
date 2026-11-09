import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mergeUpdatedArticleRows, readUpdatedContentResponse, saveContentPackage, savedContentItems } from '../../src/lib/browser/offline-content-packages';
import type { ContentUpdateItem } from '../../src/lib/contracts/content-updates';

const indexControl = vi.hoisted(() => ({ reset: () => {} }));
vi.mock('../../src/lib/browser/offline-content-index', async () => {
  const { contentIndexMemory } = await import('./helpers/content-index-memory');
  const memory = contentIndexMemory();
  indexControl.reset = memory.reset;
  return memory;
});

let responses: Map<string, Response>;
let failIndex: boolean;
beforeEach(() => {
  indexControl.reset();
  responses = new Map(); failIndex = false;
  vi.stubGlobal('caches', { open: async () => ({
    match: async (key: string) => responses.get(key)?.clone(),
    put: async (key: string, response: Response) => { if (failIndex && key.endsWith('/index')) throw Error('QuotaExceededError'); responses.set(key, response.clone()); },
    delete: async (key: string) => responses.delete(key),
  }) });
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const item: ContentUpdateItem = { kind: 'article', group: 'book', mode: 'full', version: 'one', row: { id: 'new', tieu_de: 'New', has_muc_luc: 1, trang_thai: 'Hoàn thành', updated_at: '2026-10-26' } };

describe('complete offline package storage', () => {
  it('refuses unpublished content even if passed by a caller', async () => {
    await expect(saveContentPackage(item, { ...item.row, trang_thai: 'Bản nháp' }, [])).rejects.toThrow('not_public');
    expect(await savedContentItems()).toEqual([]);
  });
  it.each(['android', 'ios'])('rejects web-only book packages on %s before writing storage', async platform => {
    vi.stubEnv('VITE_CONTENT_PLATFORM', platform);
    const row = { ...item.row, id: 'tt_1781529439696', tac_gia: 'Nguyên Phong', tieu_de: 'Muôn Kiếp Nhân Sinh - Tập 1' };
    const selected = { ...item, row };
    await expect(saveContentPackage(selected, row, [])).rejects.toThrow('not_public');
    expect(await savedContentItems()).toEqual([]);
  });
  it('does not break catalog reads when Cache Storage is blocked, while writes still fail', async () => {
    vi.stubGlobal('caches', { open: async () => { throw new DOMException('Denied', 'SecurityError'); } });
    expect(await mergeUpdatedArticleRows([{ id: 'remote' }])).toEqual([{ id: 'remote' }]);
    await expect(saveContentPackage(item, item.row, [])).rejects.toThrow();
  });
  it('preserves a corrupt index for recovery and refuses to overwrite it', async () => {
    responses.set('https://tutam-cache.local/content-packages/index', new Response('{broken'));
    expect(await savedContentItems()).toEqual([]);
    await expect(saveContentPackage(item, item.row, [])).rejects.toThrow();
    expect(await responses.get('https://tutam-cache.local/content-packages/index')!.clone().text()).toBe('{broken');
  });
  it('restores new articles and chapter content before the old bundled resolver', async () => {
    await saveContentPackage(item, { ...item.row, noi_dung: 'Opening' }, [{ id: '1', so_thu_tu: 3, noi_dung: 'Chapter' }]);
    const catalog = await mergeUpdatedArticleRows([{ id: 'bundled', updated_at: '2026-01-01' }]);
    expect(catalog.map(row => row.id)).toEqual(['bundled', 'new']);
    const response = await readUpdatedContentResponse(new URL('https://test/api/articles/new/chapters?so_thu_tu=eq.3'));
    expect(await response?.json()).toEqual([{ id: '1', so_thu_tu: 3, noi_dung: 'Chapter' }]);
  });
  it('keeps the old complete version when committing the new index fails', async () => {
    await saveContentPackage(item, { ...item.row, noi_dung: 'OLD' }, []);
    failIndex = true;
    await expect(saveContentPackage({ ...item, version: 'two' }, { ...item.row, noi_dung: 'NEW' }, [])).rejects.toThrow('QuotaExceeded');
    expect((await savedContentItems())[0].version).toBe('one');
    expect(await (await readUpdatedContentResponse(new URL('https://test/api/articles/new')))?.json()).toMatchObject({ noi_dung: 'OLD' });
  });
  it('does not overwrite newer online metadata with a stale saved package', async () => {
    await saveContentPackage(item, item.row, []);
    const rows = await mergeUpdatedArticleRows([{ id: 'new', updated_at: '2026-10-27', tieu_de: 'LATEST' }]);
    expect(rows[0].tieu_de).toBe('LATEST');
  });
  it('does not let an older saved package shadow newly bundled detail or chapters', async () => {
    await saveContentPackage(item, { ...item.row, noi_dung: 'SAVED OLD' }, [{ id: 'old-chapter', noi_dung: 'OLD CHAPTER' }]);
    const baseline = [{ id: 'new', updated_at: '2026-10-27' }];
    for (const endpoint of ['/api/articles/new', '/api/articles/new/chapters', '/api/data/baiviet?id=eq.new', '/api/data/tap_noi_dung?bai_viet_id=eq.new']) {
      expect(await readUpdatedContentResponse(new URL(endpoint, 'https://test'), baseline)).toBeNull();
    }
    expect((await savedContentItems())[0].version).toBe('one');
  });
  it('retains newer, equal-date, and unbundled saved packages without deleting their chapters', async () => {
    await saveContentPackage(item, { ...item.row, noi_dung: 'SAVED' }, [{ id: 'chapter', noi_dung: 'CHAPTER' }]);
    for (const baseline of [[{ id: 'new', updated_at: '2026-10-25' }], [{ id: 'new', updated_at: '2026-10-26' }], [{ id: 'other', updated_at: '2026-10-27' }], undefined]) {
      expect(await (await readUpdatedContentResponse(new URL('https://test/api/articles/new'), baseline))?.json()).toMatchObject({ noi_dung: 'SAVED' });
      expect(await (await readUpdatedContentResponse(new URL('https://test/api/articles/new/chapters'), baseline))?.json()).toEqual([{ id: 'chapter', noi_dung: 'CHAPTER' }]);
    }
  });
});
