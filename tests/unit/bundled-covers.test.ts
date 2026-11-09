import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeCoverSrc } from '$lib/domain/cover-url';

describe('offline bundled articles cover integrity', () => {
  const articlesJson = JSON.parse(
    readFileSync('src/lib/data/offline-bundled-articles.json', 'utf8')
  ) as Array<{ id: string; tieu_de: string; anh_url?: string }>;

  it('ensures no bundled article uses external remote http/https cover URLs', () => {
    const invalidArticles = articlesJson.filter((article) => {
      const url = article.anh_url?.trim() || '';
      return /^https?:\/\//i.test(url);
    });

    expect(
      invalidArticles.map((a) => ({ id: a.id, tieu_de: a.tieu_de, anh_url: a.anh_url })),
      'All bundled articles must use local bundled cover assets, not remote HTTP URLs'
    ).toEqual([]);
  });

  it('resolves Thọ Khang Bảo Giám cover to local bundled asset and verifies file exists on disk', () => {
    const book = articlesJson.find((a) => a.id === 'tt_1783429280091_jcrra');
    expect(book).toBeDefined();
    expect(book?.tieu_de).toBe('THỌ KHANG BẢO GIÁM');

    const resolved = normalizeCoverSrc(book?.anh_url);
    expect(resolved).toMatch(/^\/covers\/tho-khang-bao-giam\.jpg(#pos=.+)?$/);

    const filename = resolved.split('#')[0].replace(/^\/covers\//, '');
    const assetPath = resolve('static/covers', filename);
    expect(existsSync(assetPath), `Asset static/covers/${filename} must exist on disk`).toBe(true);
  });
});
