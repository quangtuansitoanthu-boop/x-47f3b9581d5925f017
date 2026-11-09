import type { RequestHandler } from './$types';

interface ArticleRow {
  id: string;
  updated_at?: string | null;
  created_at?: string | null;
  ngay_dang?: string | null;
}

interface TalkRow {
  id: string;
  created_at?: string | null;
  ngay_dang?: string | null;
}

function formatDate(val?: string | null): string {
  if (!val) return new Date().toISOString().split('T')[0];
  try {
    const d = new Date(val);
    if (!Number.isNaN(d.getTime())) {
      return d.toISOString().split('T')[0];
    }
  } catch {
    // fallback
  }
  return new Date().toISOString().split('T')[0];
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export const GET: RequestHandler = async ({ platform, url }) => {
  const origin = (url.origin || 'https://quangtu.vn').replace(/^http:\/\//iu, 'https://');
  const env = platform?.env as {
    DB?: {
      prepare: (sql: string) => {
        all: <T>() => Promise<{ results?: T[] }>;
      };
    };
  } | undefined;
  const today = new Date().toISOString().split('T')[0];

  const urls: Array<{ loc: string; lastmod: string; changefreq: string; priority: string }> = [
    { loc: `${origin}/`, lastmod: today, changefreq: 'daily', priority: '1.0' },
    { loc: `${origin}/phap-thoai`, lastmod: today, changefreq: 'daily', priority: '0.9' },
    { loc: `${origin}/tu-tap`, lastmod: today, changefreq: 'weekly', priority: '0.9' },
    { loc: `${origin}/huong-dan`, lastmod: today, changefreq: 'monthly', priority: '0.7' }
  ];

  if (env?.DB) {
    try {
      const articlesResult = await env.DB.prepare(
        `SELECT id, updated_at, created_at, ngay_dang FROM baiviet
         WHERE trang_thai = 'Hoàn thành'
         ORDER BY created_at DESC
         LIMIT 2000`
      ).all<ArticleRow>();

      for (const row of articlesResult.results || []) {
        if (!row.id) continue;
        urls.push({
          loc: `${origin}/?article=${encodeURIComponent(row.id)}`,
          lastmod: formatDate(row.updated_at || row.created_at || row.ngay_dang),
          changefreq: 'weekly',
          priority: '0.8'
        });
      }
    } catch {
      // Ignore DB errors during sitemap crawl fallback
    }

    try {
      const talksResult = await env.DB.prepare(
        `SELECT id, created_at, ngay_dang FROM phap_thoai
         WHERE visibility = 'public'
         ORDER BY created_at DESC
         LIMIT 1000`
      ).all<TalkRow>();

      for (const row of talksResult.results || []) {
        if (!row.id) continue;
        urls.push({
          loc: `${origin}/phap-thoai?album=${encodeURIComponent(row.id)}`,
          lastmod: formatDate(row.ngay_dang || row.created_at),
          changefreq: 'monthly',
          priority: '0.8'
        });
      }
    } catch {
      // Ignore DB errors during sitemap crawl fallback
    }
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (item) => `  <url>
    <loc>${escapeXml(item.loc)}</loc>
    <lastmod>${item.lastmod}</lastmod>
    <changefreq>${item.changefreq}</changefreq>
    <priority>${item.priority}</priority>
  </url>`
  )
  .join('\n')}
</urlset>`;

  return new Response(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600'
    }
  });
};

export const HEAD: RequestHandler = GET;
