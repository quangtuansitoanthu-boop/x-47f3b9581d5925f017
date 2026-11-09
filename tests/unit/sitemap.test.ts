import { describe, expect, it } from 'vitest';
import { GET } from '../../src/routes/sitemap.xml/+server';

describe('sitemap.xml endpoint', () => {
  it('generates standard sitemap xml with static routes when DB is not present', async () => {
    const event = {
      url: new URL('https://quangtu.vn/sitemap.xml'),
      platform: undefined,
      request: new Request('https://quangtu.vn/sitemap.xml'),
      params: {},
      locals: {},
      cookies: {} as any,
      fetch: fetch,
      getClientAddress: () => '127.0.0.1',
      setHeaders: () => {},
      isDataRequest: false,
      isSubRequest: false,
      route: { id: '/sitemap.xml' }
    } as any;

    const response = await GET(event);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('application/xml');

    const xml = await response.text();
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml).toContain('<loc>https://quangtu.vn/</loc>');
    expect(xml).toContain('<loc>https://quangtu.vn/phap-thoai</loc>');
    expect(xml).toContain('<loc>https://quangtu.vn/tu-tap</loc>');
    expect(xml).toContain('<loc>https://quangtu.vn/huong-dan</loc>');
  });

  it('includes articles and talk albums when DB is available', async () => {
    const mockDb = {
      prepare: (sql: string) => ({
        all: async () => {
          if (sql.includes('baiviet')) {
            return {
              results: [
                { id: 'bai-viet-1', updated_at: '2026-03-01T10:00:00Z', created_at: '2026-03-01T10:00:00Z' },
                { id: 'bai-viet-2', updated_at: null, created_at: '2026-02-15T08:00:00Z' }
              ]
            };
          }
          if (sql.includes('phap_thoai')) {
            return {
              results: [
                { id: 'album-gay-kim-cang', created_at: '2026-01-20T00:00:00Z', ngay_dang: null }
              ]
            };
          }
          return { results: [] };
        }
      })
    };

    const event = {
      url: new URL('https://quangtu.vn/sitemap.xml'),
      platform: { env: { DB: mockDb } },
      request: new Request('https://quangtu.vn/sitemap.xml'),
      params: {},
      locals: {},
      cookies: {} as any,
      fetch: fetch,
      getClientAddress: () => '127.0.0.1',
      setHeaders: () => {},
      isDataRequest: false,
      isSubRequest: false,
      route: { id: '/sitemap.xml' }
    } as any;

    const response = await GET(event);
    const xml = await response.text();
    expect(xml).toContain('<loc>https://quangtu.vn/?article=bai-viet-1</loc>');
    expect(xml).toContain('<loc>https://quangtu.vn/?article=bai-viet-2</loc>');
    expect(xml).toContain('<loc>https://quangtu.vn/phap-thoai?album=album-gay-kim-cang</loc>');
  });
});
