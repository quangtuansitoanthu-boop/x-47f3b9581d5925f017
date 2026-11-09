export const PRACTICE_BADGE_DEFINITIONS = [
  {
    id: 'streak-7',
    kind: 'streak',
    threshold: 7,
    tier: 1,
    title: 'Sơ Tâm Kiên Cố',
    label: '7 ngày — Sơ Tâm Kiên Cố',
    subtitle: '7 ngày liên tục • Bước đầu gieo hạt giống bồ đề kiên định',
  },
  {
    id: 'streak-30',
    kind: 'streak',
    threshold: 30,
    tier: 2,
    title: 'Nguyệt Luân Tịnh Hạnh',
    label: '30 ngày — Nguyệt Luân Tịnh Hạnh',
    subtitle: '30 ngày liên tục • Tâm sáng như trăng rằm, huân tu thiện lành',
  },
  {
    id: 'streak-90',
    kind: 'streak',
    threshold: 90,
    tier: 3,
    title: 'Tam Nguyệt An Cư',
    label: '90 ngày — Tam Nguyệt An Cư',
    subtitle: '90 ngày liên tục • Trọn một mùa an cư tinh tấn, thân tâm an tịnh',
  },
  {
    id: 'streak-180',
    kind: 'streak',
    threshold: 180,
    tier: 4,
    title: 'Bán Niên Tinh Tiến',
    label: '180 ngày — Bán Niên Tinh Tiến',
    subtitle: '180 ngày liên tục • Nửa năm bền bỉ, cội rễ thiện căn cắm sâu',
  },
  {
    id: 'streak-300',
    kind: 'streak',
    threshold: 300,
    tier: 5,
    title: 'Đạo Tâm Bất Thoái',
    label: '300 ngày — Đạo Tâm Bất Thoái',
    subtitle: '300 ngày liên tục • Vượt qua ngàn chướng duyên, tâm nguyện kiên định',
  },
  {
    id: 'streak-365',
    kind: 'streak',
    threshold: 365,
    tier: 6,
    title: 'Nhất Niên Viên Mãn',
    label: '365 ngày — Nhất Niên Viên Mãn',
    subtitle: '365 ngày liên tục • Tròn một năm bốn mùa tinh tấn, công đức trang nghiêm',
  },
  {
    id: 'streak-800',
    kind: 'streak',
    threshold: 800,
    tier: 7,
    title: 'Thâm Nhập Kinh Tạng',
    label: '800 ngày — Thâm Nhập Kinh Tạng',
    subtitle: '800 ngày liên tục • Trí tuệ như biển, công phu hòa vào từng hơi thở',
  },
  {
    id: 'streak-1000',
    kind: 'streak',
    threshold: 1000,
    tier: 8,
    title: 'Thiên Nhật Kim Cang',
    label: '1000 ngày — Thiên Nhật Kim Cang',
    subtitle: '1000 ngày liên tục • Ngàn ngày đại công phu, tâm kim cang chiếu sáng',
  },
  {
    id: 'streak-3000',
    kind: 'streak',
    threshold: 3000,
    tier: 9,
    title: 'Vạn Đức Bồ Đề',
    label: '3000 ngày — Vạn Đức Bồ Đề',
    subtitle: '3000 ngày liên tục • Đại nguyện viên thành, quang minh biến chiếu mười phương',
  },
  {
    id: 'streak-10000',
    kind: 'streak',
    threshold: 10000,
    tier: 10,
    title: 'Vạn Nhật Liên Tâm',
    label: '10.000 ngày • Vạn Nhật Liên Tâm',
    subtitle: '10.000 ngày liên tục • Vạn ngày vun bồi tâm sen, giữ vững nguyện lành',
  },
  {
    id: 'streak-20000',
    kind: 'streak',
    threshold: 20000,
    tier: 11,
    title: 'Hằng Tâm Diệu Hạnh',
    label: '20.000 ngày • Hằng Tâm Diệu Hạnh',
    subtitle: '20.000 ngày liên tục • Bền lòng tu tập, nuôi dưỡng thiện hạnh mỗi ngày',
  },
] as const;

export const PRACTICE_BADGE_DEFINITIONS_EN: Record<string, { title: string; label: string; subtitle: string }> = {
  'streak-7': {
    title: 'Firm Beginning Mind',
    label: '7 days — Firm Beginning Mind',
    subtitle: '7 consecutive days • Planting steadfast Bodhi seeds',
  },
  'streak-30': {
    title: 'Pure Moon Conduct',
    label: '30 days — Pure Moon Conduct',
    subtitle: '30 consecutive days • Mind luminous as the full moon, cultivating virtues',
  },
  'streak-90': {
    title: 'Three-Month Vassa Retreat',
    label: '90 days — Three-Month Vassa Retreat',
    subtitle: '90 consecutive days • A full season of diligent cultivation and tranquility',
  },
  'streak-180': {
    title: 'Half-Year Diligence',
    label: '180 days — Half-Year Diligence',
    subtitle: '180 consecutive days • Half a year of endurance, deep-rooted wholesome foundations',
  },
  'streak-300': {
    title: 'Non-Retrograde Mind',
    label: '300 days — Non-Retrograde Mind',
    subtitle: '300 consecutive days • Overcoming obstacles with unwavering resolve',
  },
  'streak-365': {
    title: 'One-Year Fulfillment',
    label: '365 days — One-Year Fulfillment',
    subtitle: '365 consecutive days • A full year across four seasons, adorned with merit',
  },
  'streak-800': {
    title: 'Deep In Sutras',
    label: '800 days — Deep In Sutras',
    subtitle: '800 consecutive days • Wisdom deep as the ocean, practice unified with each breath',
  },
  'streak-1000': {
    title: 'Thousand-Day Diamond Mind',
    label: '1000 days — Thousand-Day Diamond Mind',
    subtitle: '1000 consecutive days • A thousand days of grand cultivation, diamond heart shining bright',
  },
  'streak-3000': {
    title: 'Boundless Virtue Bodhi',
    label: '3000 days — Boundless Virtue Bodhi',
    subtitle: '3000 consecutive days • Great vows fulfilled, radiant light illuminating ten directions',
  },
  'streak-10000': {
    title: 'Ten-Thousand-Day Lotus Heart',
    label: '10,000 days — Ten-Thousand-Day Lotus Heart',
    subtitle: '10,000 consecutive days • Ten thousand days nurturing the lotus mind',
  },
  'streak-20000': {
    title: 'Eternal Heart Sublime Practice',
    label: '20,000 days — Eternal Heart Sublime Practice',
    subtitle: '20,000 consecutive days • Enduring dedication, cultivating virtuous actions every day',
  },
};

export function getBadgeTitle(badge: { id: string; title: string } | null | undefined, isEn = false): string {
  if (!badge) return '';
  return (isEn ? PRACTICE_BADGE_DEFINITIONS_EN[badge.id]?.title : null) || badge.title;
}

export function getBadgeLabel(badge: { id: string; label: string } | null | undefined, isEn = false): string {
  if (!badge) return '';
  return (isEn ? PRACTICE_BADGE_DEFINITIONS_EN[badge.id]?.label : null) || badge.label;
}

export function getBadgeSubtitle(badge: { id: string; subtitle: string } | null | undefined, isEn = false): string {
  if (!badge) return '';
  return (isEn ? PRACTICE_BADGE_DEFINITIONS_EN[badge.id]?.subtitle : null) || badge.subtitle;
}

export function getBadgeDefinition(id: string | null | undefined) {
  if (!id) return null;
  return PRACTICE_BADGE_DEFINITIONS.find((badge) => badge.id === id) ?? null;
}

export type PracticeBadgeId = (typeof PRACTICE_BADGE_DEFINITIONS)[number]['id'];

export interface AcceptedPracticeActivity {
  acceptedCount: number;
  acceptedDurationSeconds: number;
  completedAt: string;
  sessionCount?: number;
}

export interface PracticeDayAggregate {
  acceptedCount: number;
  acceptedDurationSeconds: number;
  date: string;
  sessionCount: number;
}

export interface PracticeHeatmapDay extends PracticeDayAggregate {
  active: boolean;
}

export function aggregatePracticeDays(
  sessions: readonly AcceptedPracticeActivity[],
  timeZone: string,
): PracticeDayAggregate[] {
  validateTimeZone(timeZone);
  const days = new Map<string, PracticeDayAggregate>();
  for (const session of sessions) {
    const instant = new Date(session.completedAt);
    if (!Number.isFinite(instant.getTime())) continue;
    const date = dateKeyInTimeZone(instant, timeZone);
    const aggregate = days.get(date) ?? {
      acceptedCount: 0,
      acceptedDurationSeconds: 0,
      date,
      sessionCount: 0,
    };
    aggregate.acceptedCount += nonNegativeInteger(session.acceptedCount);
    aggregate.acceptedDurationSeconds += nonNegativeInteger(session.acceptedDurationSeconds);
    aggregate.sessionCount += session.sessionCount === undefined ? 1 : nonNegativeInteger(session.sessionCount);
    days.set(date, aggregate);
  }
  return [...days.values()].sort((left, right) => left.date.localeCompare(right.date));
}

export function buildPracticeHeatmap(
  aggregates: readonly PracticeDayAggregate[],
  today: string,
  days = 365,
): PracticeHeatmapDay[] {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(today) || !Number.isSafeInteger(days) || days < 1 || days > 366) {
    throw new Error('invalid_heatmap_window');
  }
  const byDate = new Map(aggregates.map((day) => [day.date, day]));
  return Array.from({ length: days }, (_, index) => {
    const date = shiftIsoDate(today, index - days + 1);
    const aggregate = byDate.get(date);
    return aggregate
      ? { ...aggregate, active: aggregate.sessionCount > 0 }
      : { acceptedCount: 0, acceptedDurationSeconds: 0, active: false, date, sessionCount: 0 };
  });
}

export function calculatePracticeStreaks(
  aggregates: readonly PracticeDayAggregate[],
  today: string,
): { current: number; longest: number } {
  const activeDates = new Set(aggregates.filter((day) => day.sessionCount > 0).map((day) => day.date));
  const sorted = [...activeDates].sort();
  let longest = 0;
  let running = 0;
  let previous: string | null = null;
  for (const date of sorted) {
    running = previous && shiftIsoDate(previous, 1) === date ? running + 1 : 1;
    longest = Math.max(longest, running);
    previous = date;
  }
  const currentAnchor = activeDates.has(today) ? today : shiftIsoDate(today, -1);
  let current = 0;
  for (let date = currentAnchor; activeDates.has(date); date = shiftIsoDate(date, -1)) current += 1;
  return { current, longest };
}

export function earnedPracticeBadges(input: {
  longestStreak: number;
  totalAcceptedCount: number;
}): PracticeBadgeId[] {
  return PRACTICE_BADGE_DEFINITIONS
    .filter((badge) => badge.kind === 'streak'
      ? input.longestStreak >= badge.threshold
      : input.totalAcceptedCount >= badge.threshold)
    .map((badge) => badge.id);
}

export function normalizeSelectedPracticeBadge(
  selected: unknown,
  earned: readonly PracticeBadgeId[],
): PracticeBadgeId | null {
  const candidate = String(selected || '') as PracticeBadgeId;
  return earned.includes(candidate) ? candidate : null;
}

export function dateKeyInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit', month: '2-digit', timeZone, year: 'numeric',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function validateTimeZone(timeZone: string): void {
  try {
    new Intl.DateTimeFormat('en', { timeZone }).format(new Date(0));
  } catch {
    throw new Error('invalid_time_zone');
  }
}

function shiftIsoDate(value: string, deltaDays: number): string {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return date.toISOString().slice(0, 10);
}

function nonNegativeInteger(value: number): number {
  return Number.isSafeInteger(value) && value > 0 ? value : 0;
}
