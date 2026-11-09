import type { PracticeLog, PracticePeriod, PracticeType } from '../domain/practice/logs';

const VI_VERBS: Record<PracticeType, string> = {
  'Niệm danh hiệu': 'niệm được',
  'Trì chú': 'trì được',
  'Tụng kinh': 'tụng được',
  'Lễ Phật': 'lễ được',
  'Ngồi thiền': 'ngồi thiền được',
  'Nghe pháp thoại': 'nghe pháp thoại được',
  'Chép kinh': 'chép kinh được',
  'Chép danh hiệu': 'chép danh hiệu được',
  'Thọ giới': 'thọ giới thành công',
  'Khác': 'thực hành được',
};

const VI_UNITS: Partial<Record<PracticeType, string>> = {
  'Thọ giới': 'lần',
  'Ngồi thiền': 'phút',
  'Nghe pháp thoại': 'phút',
  'Lễ Phật': 'lạy',
  'Chép kinh': 'lượt',
  'Chép danh hiệu': 'câu',
};

function englishQuantity(type: PracticeType, count: number): string {
  const times = `${count} ${count === 1 ? 'time' : 'times'}`;
  const minutes = `${count} ${count === 1 ? 'minute' : 'minutes'}`;
  switch (type) {
    case 'Niệm danh hiệu': return `recited Buddha names ${times}`;
    case 'Trì chú': return `chanted mantras ${times}`;
    case 'Tụng kinh': return `recited sutras ${times}`;
    case 'Lễ Phật': return `offered ${count} ${count === 1 ? 'prostration' : 'prostrations'}`;
    case 'Ngồi thiền': return `meditated for ${minutes}`;
    case 'Nghe pháp thoại': return `listened to Dharma talks for ${minutes}`;
    case 'Chép kinh': return `transcribed sutras ${times}`;
    case 'Chép danh hiệu': return `copied ${count} ${count === 1 ? 'sacred name' : 'sacred names'}`;
    case 'Thọ giới': return `received precepts ${times}`;
    default: return `practiced ${times}`;
  }
}

export function buildPracticeSummary(
  period: PracticePeriod,
  logs: readonly PracticeLog[],
  locale: 'vi' | 'en' = 'vi',
): string {
  if (!logs.length) {
    if (locale === 'en') {
      if (period === 'day') return 'You have not recorded any practice today. Begin when you are ready!';
      if (period === 'week') return 'You have not recorded any practice in the past 7 days.';
      if (period === 'month') return 'You have not recorded any practice this month.';
      return 'You have not recorded any practice this year.';
    }
    if (period === 'day') return 'Hôm nay bạn chưa ghi nhận công phu nào. Hãy bắt đầu nhé!';
    if (period === 'week') return 'Trong 7 ngày gần nhất bạn chưa ghi nhận công phu nào.';
    if (period === 'month') return 'Tháng này bạn chưa ghi nhận công phu nào.';
    return 'Năm nay bạn chưa ghi nhận công phu nào.';
  }

  const counts = new Map<PracticeType, number>();
  for (const log of logs) counts.set(log.type, (counts.get(log.type) ?? 0) + log.count);
  const segments = [...counts].map(([type, count]) => locale === 'en'
    ? englishQuantity(type, count)
    : `${VI_VERBS[type] ?? VI_VERBS['Khác']} ${count} ${VI_UNITS[type] ?? 'biến'}`);
  const body = segments.length === 1
    ? segments[0]
    : `${segments.slice(0, -1).join(', ')} ${locale === 'en' ? 'and' : 'và'} ${segments[segments.length - 1]}`;

  if (locale === 'en') {
    if (period === 'day') return `Today you ${body}.`;
    if (period === 'week') return `Over the past 7 days you ${body}.`;
    if (period === 'month') return `This month you ${body}.`;
    return `This year you ${body}.`;
  }
  if (period === 'day') return `Hôm nay bạn đã ${body}.`;
  if (period === 'week') return `Trong 7 ngày gần nhất bạn đã ${body}.`;
  if (period === 'month') return `Tháng này bạn đã ${body}.`;
  return `Năm nay bạn đã ${body}.`;
}
