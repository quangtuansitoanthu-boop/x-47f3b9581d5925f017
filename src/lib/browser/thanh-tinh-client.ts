import {
  COMMUNITY_STATS_CACHE_TTL_MS,
  FALLBACK_COMMUNITY_STATS,
  getThanhTinhClientId,
  loadCachedCommunityStats,
  loadCachedCommunityStatsWithTimestamp,
  saveCachedCommunityStats,
  type CommunityThanhTinhStats
} from '$lib/domain/practice/thanh-tinh';
import { resolveApiUrl, fetchNativeJsonMutation } from '$lib/browser/native-api';
import { getBrowserSession, hasUsableBrowserCsrf, requireBrowserCsrf } from '$lib/browser/session-csrf';

export { getThanhTinhClientId };

async function postThanhTinh(path: string, init: RequestInit): Promise<Response> {
  return await fetchNativeJsonMutation(path, init) ?? fetch(resolveApiUrl(path), init);
}

async function getClientCsrfToken(): Promise<string> {
  const session = await getBrowserSession();
  if (!session.authenticated) return 'public';
  return hasUsableBrowserCsrf(session.csrfToken) ? session.csrfToken : requireBrowserCsrf();
}

/**
 * Lay thong ke cong dong Thanh Tinh Tam tren app mobile.
 * Toi uu hoa luot request: Neu du lieu cache trong 2 ngay con hieu luc thi lay truc tiep
 * tu cache thiet bi, tiet kiem pin va 4G/5G, hoan toan khong gui request den may chu.
 */
export async function fetchCommunityThanhTinhStats(forceRefresh = false): Promise<CommunityThanhTinhStats> {
  const cached = loadCachedCommunityStatsWithTimestamp();

  // Neu cache con han trong 2 ngay (48h) va khong yeu cau lam moi bat buoc: dung luon cache
  if (!forceRefresh && cached && (Date.now() - cached.cachedAt < COMMUNITY_STATS_CACHE_TTL_MS)) {
    return cached.stats;
  }

  if (typeof fetch === 'undefined') {
    return cached?.stats || FALLBACK_COMMUNITY_STATS;
  }

  try {
    const res = await fetch(resolveApiUrl('/api/thanh-tinh/stats'));
    if (!res.ok) {
      return cached?.stats || FALLBACK_COMMUNITY_STATS;
    }
    const freshStats = (await res.json()) as CommunityThanhTinhStats;
    // Dam bao so lieu khong bao gio bi tut xuong duoi muc co so
    const safeStats: CommunityThanhTinhStats = {
      participantCount: Math.max(cached?.stats.participantCount || FALLBACK_COMMUNITY_STATS.participantCount, Number(freshStats.participantCount || 0)),
      totalUrgesResisted: Math.max(cached?.stats.totalUrgesResisted || FALLBACK_COMMUNITY_STATS.totalUrgesResisted, Number(freshStats.totalUrgesResisted || 0)),
      totalDaysClean: Math.max(cached?.stats.totalDaysClean || FALLBACK_COMMUNITY_STATS.totalDaysClean, Number(freshStats.totalDaysClean || 0))
    };
    saveCachedCommunityStats(safeStats);
    return safeStats;
  } catch {
    return cached?.stats || FALLBACK_COMMUNITY_STATS;
  }
}

/**
 * Phat nguyen tham gia Thanh Tinh Tam:
 * - Cap nhat lac quan (+1) ngay lap tuc tren app de nguoi dung thay so tu dong tang len
 * - Gui kem clientId cua thiet bi len server de server ghi nhan rieng biet (khong bi trung IP)
 * - Luu vao cache thiet bi
 */
export async function submitThanhTinhPledge(userInfo?: { displayName?: string; email?: string }): Promise<CommunityThanhTinhStats> {
  const cached = loadCachedCommunityStats();
  const baseStats = cached || FALLBACK_COMMUNITY_STATS;

  // Tang lac quan ngay lap tuc de so luon cong them
  const optimisticStats: CommunityThanhTinhStats = {
    ...baseStats,
    participantCount: baseStats.participantCount + 1
  };
  saveCachedCommunityStats(optimisticStats);

  if (typeof fetch === 'undefined') return optimisticStats;
  try {
    const csrfToken = await getClientCsrfToken();
    const clientId = getThanhTinhClientId();
    const res = await postThanhTinh('/api/thanh-tinh/pledge', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': csrfToken
      },
      body: JSON.stringify({
        ...(userInfo || {}),
        clientId
      })
    });
    if (!res.ok) return optimisticStats;
    const serverStats = (await res.json()) as CommunityThanhTinhStats;
    const finalStats: CommunityThanhTinhStats = {
      participantCount: Math.max(optimisticStats.participantCount, Number(serverStats.participantCount || 0)),
      totalUrgesResisted: Math.max(optimisticStats.totalUrgesResisted, Number(serverStats.totalUrgesResisted || 0)),
      totalDaysClean: Math.max(optimisticStats.totalDaysClean, Number(serverStats.totalDaysClean || 0))
    };
    saveCachedCommunityStats(finalStats);
    return finalStats;
  } catch {
    return optimisticStats;
  }
}

// Optimized: Single daily sync during check-in to minimize server requests
export async function syncDailyThanhTinhProgress(streakDays: number, resistedDelta: number): Promise<CommunityThanhTinhStats> {
  const cached = loadCachedCommunityStats();
  const fallback = cached || FALLBACK_COMMUNITY_STATS;
  if (typeof fetch === 'undefined') return fallback;
  try {
    const csrfToken = await getClientCsrfToken();
    const clientId = getThanhTinhClientId();
    const res = await postThanhTinh('/api/thanh-tinh/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': csrfToken
      },
      body: JSON.stringify({ streakDays, resistedDelta, clientId })
    });
    if (!res.ok) return fallback;
    const serverStats = (await res.json()) as CommunityThanhTinhStats;
    const finalStats: CommunityThanhTinhStats = {
      participantCount: Math.max(fallback.participantCount, Number(serverStats.participantCount || 0)),
      totalUrgesResisted: Math.max(fallback.totalUrgesResisted + resistedDelta, Number(serverStats.totalUrgesResisted || 0)),
      totalDaysClean: Math.max(fallback.totalDaysClean, Number(serverStats.totalDaysClean || 0))
    };
    saveCachedCommunityStats(finalStats);
    return finalStats;
  } catch {
    return fallback;
  }
}
