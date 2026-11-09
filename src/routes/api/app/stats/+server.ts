import { json, type RequestHandler } from '@sveltejs/kit';
import { getApiLocals } from '$lib/server/http/runtime';

const BASE_INSTALL_COUNT = 1230;
let memoryCache: { data: { total: number; base: number; real: number }; expiresAt: number } | null = null;

export const GET: RequestHandler = async (event) => {
  const now = Date.now();
  if (memoryCache && now < memoryCache.expiresAt) {
    return json(memoryCache.data, {
      headers: {
        'Cache-Control': 'public, max-age=1800, s-maxage=3600, stale-while-revalidate=86400',
      },
    });
  }

  const runtime = getApiLocals(event as any);
  let realCount = 0;

  if (runtime?.env?.DB) {
    try {
      const [userRow, visitorRow] = await Promise.all([
        runtime.env.DB.prepare('SELECT COUNT(*) AS total FROM app_users').first<{ total?: number }>(),
        runtime.env.DB.prepare('SELECT COUNT(DISTINCT visitor_id_hash) AS total FROM visitor_daily_presence').first<{ total?: number }>(),
      ]);
      const users = Number(userRow?.total || 0);
      const visitors = Number(visitorRow?.total || 0);
      realCount = Math.max(users, visitors);
    } catch {
      realCount = 0;
    }
  }

  const data = {
    total: BASE_INSTALL_COUNT + realCount,
    base: BASE_INSTALL_COUNT,
    real: realCount,
  };

  memoryCache = {
    data,
    expiresAt: now + 30 * 60 * 1000, // 30 phút cache bộ nhớ Worker
  };

  return json(data, {
    headers: {
      'Cache-Control': 'public, max-age=1800, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
};
