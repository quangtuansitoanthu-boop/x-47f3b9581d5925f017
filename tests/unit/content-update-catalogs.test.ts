import { afterEach, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/svelte-query';
vi.mock('../../src/lib/browser/native-platform', () => ({ isNativeApp: () => true, nativePlatform: () => 'android' }));
import { applyManualCatalogState, fetchPracticeCatalog } from '../../src/lib/browser/content-catalogs';
import { saveContentPackage } from '../../src/lib/browser/offline-content-packages';

const indexControl = vi.hoisted(() => ({ reset: () => {} }));
vi.mock('../../src/lib/browser/offline-content-index', async () => {
  const { contentIndexMemory } = await import('./helpers/content-index-memory');
  const memory = contentIndexMemory();
  indexControl.reset = memory.reset;
  return memory;
});
import type { ContentUpdateItem } from '../../src/lib/contracts/content-updates';
afterEach(() => vi.unstubAllGlobals());

it('merges a new native ritual into the bundle and existing QueryClient without API refetch or resetting other state', async () => {
  const responses = new Map<string, Response>();
  vi.stubGlobal('caches', { open: async () => ({ match: async (key: string) => responses.get(key)?.clone(),
    put: async (key: string, value: Response) => { responses.set(key, value.clone()); }, delete: async (key: string) => responses.delete(key) }) });
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([{ id: 'old', tieu_de: 'Kinh cũ', danh_muc: 'KINH PHẬT' }]), { headers: { 'content-type': 'application/json' } })));
  const item: ContentUpdateItem = { kind: 'article', group: 'ritual', mode: 'full', version: 'a'.repeat(64),
    row: { id: 'new-ritual', tieu_de: 'Nghi thức mới', danh_muc: 'NGHI THỨC', noi_dung: 'Đầy đủ', trang_thai: 'Hoàn thành', updated_at: '2026-10-26' } };
  await saveContentPackage(item, item.row, []);
  const remote = vi.fn();
  const catalog = await fetchPracticeCatalog(remote);
  expect(catalog.map(article => article.id)).toContain('new-ritual');
  expect(remote).not.toHaveBeenCalled();
  const queryClient = new QueryClient();
  queryClient.setQueryData(['articles', 'catalog', 'practice', 'guest'], []);
  queryClient.setQueryData(['practice-community', 'progress', 'user'], { keep: 'progress' });
  queryClient.setQueryData(['album-play-totals'], { old: 42 });
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  await applyManualCatalogState(queryClient);
  expect(queryClient.getQueryData<Array<{ id: string }>>(['articles', 'catalog', 'practice', 'guest'])?.[0].id).toBe('new-ritual');
  expect(queryClient.getQueryData(['practice-community', 'progress', 'user'])).toEqual({ keep: 'progress' });
  expect(queryClient.getQueryData(['album-play-totals'])).toEqual({ old: 42 });
  expect(invalidate).not.toHaveBeenCalled();
  queryClient.clear();
});
