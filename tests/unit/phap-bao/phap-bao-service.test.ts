import { describe, expect, it, vi } from 'vitest';
import {
  createPhapBaoItem,
  deletePhapBaoItem,
  getUserPhapBaoHistory,
  listPublicPhapBaoItems,
  recordPhapBaoClaim,
  updatePhapBaoItem
} from '../../../src/lib/server/services/phap-bao';
import type { CloudflareEnvLike } from '../../../src/lib/server/cloudflare-context';

function createMockEnv(initialItems: any[] = []): CloudflareEnvLike {
  const items = [...initialItems];
  const history: any[] = [];

  const mockDb = {
    prepare: vi.fn((query: string) => {
      const normalizedQuery = query.replace(/\s+/g, ' ').trim();

      return {
        bind: vi.fn((...params: any[]) => ({
          all: vi.fn(async () => {
            if (normalizedQuery.includes('FROM phap_bao_items')) {
              return { results: [...items] };
            }
            if (normalizedQuery.includes('FROM phap_bao_history')) {
              const userId = params[0];
              return { results: history.filter((h) => h.user_id === userId) };
            }
            return { results: [] };
          }),
          first: vi.fn(async () => {
            if (normalizedQuery.includes('FROM phap_bao_items WHERE id = ?')) {
              const id = params[0];
              return items.find((i) => i.id === id) || null;
            }
            return null;
          }),
          run: vi.fn(async () => {
            if (normalizedQuery.includes('INSERT INTO phap_bao_items')) {
              const [id, loai, tieu_de, mo_ta, anh_url, link_shopee, con_hang, so_thu_tu, created_at, updated_at] = params;
              items.push({ id, loai, tieu_de, mo_ta, anh_url, link_shopee, con_hang, so_thu_tu, created_at, updated_at });
              return { meta: { changes: 1 } };
            }
            if (normalizedQuery.includes('UPDATE phap_bao_items')) {
              const [loai, tieu_de, mo_ta, anh_url, link_shopee, con_hang, so_thu_tu, updated_at, id] = params;
              const idx = items.findIndex((i) => i.id === id);
              if (idx >= 0) {
                items[idx] = { ...items[idx], loai, tieu_de, mo_ta, anh_url, link_shopee, con_hang, so_thu_tu, updated_at };
                return { meta: { changes: 1 } };
              }
              return { meta: { changes: 0 } };
            }
            if (normalizedQuery.includes('DELETE FROM phap_bao_items WHERE id = ?')) {
              const id = params[0];
              const idx = items.findIndex((i) => i.id === id);
              if (idx >= 0) {
                items.splice(idx, 1);
                return { meta: { changes: 1 } };
              }
              return { meta: { changes: 0 } };
            }
            if (normalizedQuery.includes('INSERT INTO phap_bao_history')) {
              const [id, user_id, item_id, item_title, item_loai, danh_hieu, shopee_url, created_at] = params;
              history.push({ id, user_id, item_id, item_title, item_loai, danh_hieu, shopee_url, created_at });
              return { meta: { changes: 1 } };
            }
            return { meta: { changes: 0 } };
          })
        })),
        all: vi.fn(async () => {
          if (normalizedQuery.includes('FROM phap_bao_items')) {
            return { results: [...items] };
          }
          return { results: [] };
        })
      };
    })
  };

  return { DB: mockDb } as unknown as CloudflareEnvLike;
}

describe('phap-bao server service', () => {
  it('lists public phap bao items', async () => {
    const env = createMockEnv([
      { id: '1', loai: 'kinh', tieu_de: 'Kinh Địa Tạng', link_shopee: 'https://shopee.vn/item1', con_hang: 1 }
    ]);
    const items = await listPublicPhapBaoItems(env);
    expect(items).toHaveLength(1);
    expect(items[0].tieu_de).toBe('Kinh Địa Tạng');
  });

  it('creates, updates and deletes phap bao items', async () => {
    const env = createMockEnv();
    const created = await createPhapBaoItem(env, {
      loai: 'phap_bao',
      tieu_de: 'Máy Niệm Phật',
      link_shopee: 'https://shopee.vn/item-may-niem-phat',
      mo_ta: 'Máy niệm Phật mini',
      con_hang: 1,
      so_thu_tu: 10
    });

    expect(created.id).toBeDefined();
    expect(created.tieu_de).toBe('Máy Niệm Phật');

    const updated = await updatePhapBaoItem(env, created.id, {
      loai: 'phap_bao',
      tieu_de: 'Máy Niệm Phật Cao Cấp',
      link_shopee: 'https://shopee.vn/item-may-niem-phat-moi',
      mo_ta: 'Có khe thẻ nhớ',
      con_hang: 1,
      so_thu_tu: 5
    });

    expect(updated.tieu_de).toBe('Máy Niệm Phật Cao Cấp');

    await deletePhapBaoItem(env, created.id);
    const afterDelete = await listPublicPhapBaoItems(env);
    expect(afterDelete).toHaveLength(0);
  });

  it('validates invalid create payloads', async () => {
    const env = createMockEnv();
    await expect(createPhapBaoItem(env, { loai: 'sai_loai' })).rejects.toThrow('Loại phải là "kinh" hoặc "phap_bao".');
    await expect(createPhapBaoItem(env, { loai: 'kinh', tieu_de: '' })).rejects.toThrow('Tên kinh/pháp bảo không được để trống.');
    await expect(createPhapBaoItem(env, { loai: 'kinh', tieu_de: 'Kinh', link_shopee: '' })).rejects.toThrow('Link Shopee không hợp lệ.');
  });

  it('records claim history and retrieves user history', async () => {
    const env = createMockEnv();
    const record = await recordPhapBaoClaim(env, 'user_123', {
      itemId: 'pb_1',
      itemTitle: 'Kinh Địa Tạng Bổn Nguyện',
      itemLoai: 'kinh',
      danhHieu: 'NAM MÔ ĐỊA TẠNG BỒ TÁT',
      shopeeUrl: 'https://shopee.vn/link'
    });

    expect(record.user_id).toBe('user_123');
    expect(record.item_title).toBe('Kinh Địa Tạng Bổn Nguyện');

    const history = await getUserPhapBaoHistory(env, 'user_123');
    expect(history).toHaveLength(1);
    expect(history[0].danh_hieu).toBe('NAM MÔ ĐỊA TẠNG BỒ TÁT');

    const otherUserHistory = await getUserPhapBaoHistory(env, 'user_other');
    expect(otherUserHistory).toHaveLength(0);
  });
});
