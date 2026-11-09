import { getVietnamIsoDate } from './stats';

export interface RosaryDaySegment {
  date: string;
  firstTickAtMs: number;
  count: number;
}

/** Đổi nhịp chỉ dịch mốc của phần còn lại; số biến cũ không được tính lại. */
export function rosaryPlaybackAnchor(observedAtMs: number, positionSeconds: number, intervalMs: number, phaseStartCount = 0, phaseStartPositionSeconds = 0): number {
  return observedAtMs - Math.max(0, positionSeconds - phaseStartPositionSeconds) * 1000 - phaseStartCount * intervalMs;
}

/** Partition only newly accepted native ticks. Anchor is observation epoch minus played position. */
export function partitionRosaryDaySegments(previousCount: number, nextCount: number, intervalMs: number, anchorEpochMs: number): RosaryDaySegment[] {
  if (!Number.isSafeInteger(previousCount) || previousCount < 0 || !Number.isSafeInteger(nextCount) || nextCount < previousCount
      || !Number.isFinite(intervalMs) || intervalMs <= 0 || !Number.isFinite(anchorEpochMs)) throw new Error('invalid_rosary_day_segment');
  if (nextCount === previousCount) return [];
  const result: RosaryDaySegment[] = [];
  let first = previousCount + 1;
  while (first <= nextCount) {
    const firstTickAtMs = anchorEpochMs + first * intervalMs;
    const date = getVietnamIsoDate(new Date(firstTickAtMs));
    const nextMidnight = Date.parse(`${date}T00:00:00+07:00`) + 86_400_000;
    // Exact midnight belongs to the following date, so take the final tick strictly before it.
    const finalTickBeforeMidnight = Math.ceil((nextMidnight - anchorEpochMs) / intervalMs) - 1;
    const last = Math.min(nextCount, Math.max(first, finalTickBeforeMidnight));
    result.push({ date, firstTickAtMs, count: last - first + 1 });
    first = last + 1;
  }
  return result;
}
