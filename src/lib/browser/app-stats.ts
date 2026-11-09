import { resolveApiUrl } from './native-api';

export const DEFAULT_INSTALL_COUNT = 1230;
const STATS_STORAGE_KEY = 'tutam_install_count_cache';
const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 giờ cache phía client để tối ưu request D1

export interface InstallStatsData {
  count: number;
  timestamp: number;
}

/**
 * Đọc số lượng người cài đặt từ cache local (hoặc trả về 1230 nếu chưa có hoặc offline).
 */
export function getCachedInstallCount(): number {
  if (typeof localStorage === 'undefined') return DEFAULT_INSTALL_COUNT;
  try {
    const raw = localStorage.getItem(STATS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as InstallStatsData;
      if (typeof parsed?.count === 'number' && parsed.count >= DEFAULT_INSTALL_COUNT) {
        return parsed.count;
      }
    }
  } catch {
    // Bỏ qua lỗi đọc cache
  }
  return DEFAULT_INSTALL_COUNT;
}

/**
 * Lấy số lượng người cài đặt:
 * - Nếu cache còn hạn (< 12 giờ) và không ép buộc làm mới: trả về cache ngay lập tức (0 request D1).
 * - Nếu offline: trả về cache hoặc 1230 mà không ném lỗi.
 * - Nếu online và cache hết hạn: gọi `/api/app/stats` qua `resolveApiUrl()`, cập nhật cache.
 */
export async function fetchInstallCount(forceRefresh = false): Promise<number> {
  const currentCount = getCachedInstallCount();

  if (typeof window === 'undefined') return currentCount;

  // Kiểm tra thời hạn cache
  try {
    const raw = localStorage.getItem(STATS_STORAGE_KEY);
    if (raw && !forceRefresh) {
      const parsed = JSON.parse(raw) as InstallStatsData;
      const age = Date.now() - (parsed.timestamp || 0);
      if (age < CACHE_TTL_MS && typeof parsed.count === 'number' && parsed.count >= DEFAULT_INSTALL_COUNT) {
        return parsed.count;
      }
    }
  } catch {}

  // Nếu thiết bị đang offline, tuyệt đối không gửi request
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return currentCount;
  }

  try {
    const url = resolveApiUrl('/api/app/stats');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = (await res.json().catch(() => null)) as { total?: number } | null;
      const total = Number(data?.total);
      if (!Number.isNaN(total) && total >= DEFAULT_INSTALL_COUNT) {
        try {
          localStorage.setItem(
            STATS_STORAGE_KEY,
            JSON.stringify({ count: total, timestamp: Date.now() })
          );
        } catch {}
        return total;
      }
    }
  } catch {
    // Khi có lỗi mạng/offline/timeout: fallback âm thầm về currentCount
  }

  return currentCount;
}

/**
 * Định dạng số nguyên hiển thị theo chuẩn (dấu chấm tiếng Việt: 1.230).
 */
export function formatInstallNumber(count: number, locale = 'vi'): string {
  try {
    return count.toLocaleString(locale === 'vi' ? 'vi-VN' : 'en-US');
  } catch {
    return String(count);
  }
}
