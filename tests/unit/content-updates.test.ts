import { describe, expect, it, vi } from 'vitest';
import { createContentUpdatesService } from '../../src/lib/server/services/content-updates';
import { contentVersion, updateGroup } from '../../src/lib/domain/content-update-model';
import type { CloudflareEnvLike, D1ResultRow } from '../../src/lib/server/cloudflare-context';

function environment(pages: D1ResultRow[][]) {
  const sql: string[] = [];
  const prepare = vi.fn((query: string) => {
    sql.push(query);
    const statement = { bind: vi.fn(() => statement), all: vi.fn(async () => ({ results: pages.shift() ?? [] })),
      first: vi.fn(async () => null), run: vi.fn(async () => ({ success: true })) };
    return statement;
  });
  return { env: { DB: { prepare, batch: vi.fn() } } as CloudflareEnvLike, sql };
}

describe('manual content update API budget', () => {
  it('reads both public metadata catalogs in two SQL statements without downloading bodies', async () => {
    const { env, sql } = environment([[{ id: 'new', tieu_de: 'Kinh mới', danh_muc: 'KINH PHẬT', trang_thai: 'Hoàn thành' }],
      [{ id: 'talk', tieu_de: 'Album', visibility: 'public', tracks: '[]' }]]);
    const result = await createContentUpdatesService(env).catalog(new URL('https://test/api/content-updates'));
    expect(result.items.map(item => item.group)).toEqual(['scripture', 'talk']);
    expect(sql).toHaveLength(2);
    expect(sql[0]).toContain("trang_thai = 'Hoàn thành'");
    expect(sql[1]).toContain("visibility = 'public'");
    expect(sql.join(' ')).not.toMatch(/SELECT\s+\*/i);
    expect(sql[0]).not.toMatch(/\bnoi_dung\b/);
  });

  it('estimates all requested books with one set query instead of a query per chapter', async () => {
    const { env, sql } = environment([[{ id: 'a', bytes: 4096, chapters: 12, illustrated: 1 }]]);
    const sizes = await createContentUpdatesService(env).estimate(['a', 'b']);
    expect(sizes[0]).toMatchObject({ bytes: 4096, chapters: 12, illustrated: true });
    expect(sql).toHaveLength(1);
    expect(sql[0]).toContain('LEFT JOIN tap_noi_dung');
  });

  it('does not return a full package for content without a downloadable book/scripture category', async () => {
    const { env, sql } = environment([[{ id: 'blocked', tieu_de: 'Unclassified content', trang_thai: 'Hoàn thành' }]]);
    await expect(createContentUpdatesService(env).article('blocked', null, '')).rejects.toThrow();
    expect(sql).toHaveLength(1);
  });

  it('keeps PDF and album payloads as shells; chapter books win over a historical PDF URL', () => {
    expect(updateGroup({ id: 'pdf', pdf_url: '/x.pdf' }, 'article')).toBe('pdf');
    expect(updateGroup({ id: 'book', has_muc_luc: 1, pdf_url: '/old.pdf' }, 'article')).toBe('book');
    expect(updateGroup({ id: 'ritual', danh_muc: 'NGHI THỨC KHÁC' }, 'article')).toBe('ritual');
    expect(updateGroup({ id: 'ritual-chapters', danh_muc: 'NGHI THỨC KHÁC', has_muc_luc: 1 }, 'article')).toBe('ritual');
    expect(updateGroup({ id: 'pdf-sutra', danh_muc: 'KINH PHẬT', pdf_url: '/sutra.pdf' }, 'article')).toBe('pdf');
    expect(updateGroup({ id: 'restricted', tac_gia: 'Nguyên Phong' }, 'article')).toBeNull();
    expect(updateGroup({ id: 'tt_1781529439696', tieu_de: 'Muôn Kiếp Nhân Sinh - Tập 1', tac_gia: 'Nguyên Phong', has_muc_luc: 1 }, 'article')).toBe('book');
    expect(updateGroup({ id: 'pt_1782208869321', tieu_de: 'Muôn Kiếp Nhân Sinh - Tập 1' }, 'talk')).toBe('talk');
  });

  it('detects an album edit even when its creation date is unchanged', async () => {
    const before = { id: 'talk', tieu_de: 'Album', created_at: '2026-01-01', tracks: [{ title: 'A', url: '/a' }] };
    expect(await contentVersion(before, 'talk')).not.toBe(await contentVersion({ ...before, tracks: [{ title: 'B', url: '/b' }] }, 'talk'));
  });
});
