/**
 * Content recency utilities for prioritizing newly updated or newly created items.
 */
import { parseVietnamDate } from '$lib/utils/vietnam-date-format';

export interface RecencyItem {
  id?: string;
  updatedAt?: string | null;
  updated_at?: string | null;
  createdAt?: string | null;
  created_at?: string | null;
  publishedAt?: string | null;
  ngay_dang?: string | null;
}

/**
 * Parses any date/timestamp string safely into UTC milliseconds:
 * - Full ISO timestamps (e.g. 2026-09-03T08:00:00.000Z) preserve full exact time.
 * - Vietnamese calendar dates (DD/MM/YYYY) are correctly parsed as day/month/year.
 * - ISO calendar dates (YYYY-MM-DD) are correctly parsed as year-month-day.
 */
export function parseRecencyTimestamp(value: string | null | undefined): number {
  if (!value || typeof value !== 'string') return 0;
  const trimmed = value.trim();
  if (!trimmed) return 0;

  // If it's an ISO 8601 string with time (e.g. 2026-09-03T08:00:00.000Z), native Date.parse is exact
  if (/^\d{4}-\d{2}-\d{2}T/i.test(trimmed)) {
    const time = Date.parse(trimmed);
    if (Number.isFinite(time)) return time;
  }

  // Check if it's a Vietnamese date (DD/MM/YYYY) or calendar date (YYYY-MM-DD)
  const vnDate = parseVietnamDate(trimmed);
  if (vnDate) {
    return Date.UTC(vnDate.year, vnDate.month - 1, vnDate.day);
  }

  const time = Date.parse(trimmed);
  return Number.isFinite(time) ? time : 0;
}

/**
 * Returns the highest valid timestamp (in milliseconds) among all update, creation, and publication dates.
 * Higher timestamp = more recently updated or created.
 */
export function getContentRecency(item: RecencyItem | null | undefined): number {
  if (!item) return 0;
  const candidates = [
    item.updatedAt,
    item.updated_at,
    item.createdAt,
    item.created_at,
    item.publishedAt,
    item.ngay_dang,
  ];
  let maxTime = 0;
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'string') continue;
    const time = parseRecencyTimestamp(candidate);
    if (time > maxTime) {
      maxTime = time;
    }
  }
  return maxTime;
}

/**
 * Comparator function for sorting items by recency descending (newest updated/created first).
 * Preserves existing relative order when recency is identical (stable sort).
 */
export function compareContentRecency<T extends RecencyItem>(a: T, b: T): number {
  return getContentRecency(b) - getContentRecency(a);
}
