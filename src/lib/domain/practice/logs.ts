export const PRACTICE_TYPES = [
  'Niệm danh hiệu',
  'Trì chú',
  'Tụng kinh',
  'Lễ Phật',
  'Ngồi thiền',
  'Nghe pháp thoại',
  'Chép kinh',
  'Chép danh hiệu',
  'Thọ giới',
  'Khác'
] as const;

export type PracticeType = (typeof PRACTICE_TYPES)[number];
export type PracticePeriod = 'day' | 'week' | 'month' | 'year';

export interface PracticeLog {
  id: number;
  date: string;
  type: PracticeType;
  count: number;
  note: string;
  created: string;
  campaignId?: string | null;
  campaignTitle?: string | null;
}

function normalizeType(input: unknown): PracticeType {
  const value = String(input ?? '').trim() as PracticeType;
  return PRACTICE_TYPES.includes(value) ? value : 'Khác';
}

export function normalizePracticeLog(input: unknown): PracticeLog | null {
  if (!input || typeof input !== 'object') return null;

  const row = input as Record<string, unknown>;
  const id = Number(row.id);
  const count = Math.max(1, Number.parseInt(String(row.count ?? '1'), 10) || 1);
  const date = String(row.date ?? '').trim();
  const created = String(row.created ?? '').trim() || new Date().toISOString();
  const campaignId = row.campaignId ? String(row.campaignId).trim() : null;
  const campaignTitle = row.campaignTitle ? String(row.campaignTitle).trim() : null;

  if (!Number.isFinite(id) || !/^\d{4}-\d{2}-\d{2}$/u.test(date)) return null;

  return {
    id,
    date,
    type: normalizeType(row.type),
    count,
    note: String(row.note ?? '').trim(),
    created,
    ...(campaignId ? { campaignId } : {}),
    ...(campaignTitle ? { campaignTitle } : {})
  };
}

export function normalizePracticeLogs(input: unknown): PracticeLog[] {
  if (!Array.isArray(input)) return [];

  return input
    .map((entry) => normalizePracticeLog(entry))
    .filter((entry): entry is PracticeLog => entry !== null)
    .sort((left, right) => {
      const byDate = right.date.localeCompare(left.date, 'vi');
      if (byDate !== 0) return byDate;
      return right.created.localeCompare(left.created, 'vi');
    });
}

export function createPracticeLog(input: {
  id?: number;
  date: string;
  type: PracticeType;
  count: number;
  note?: string;
  created?: string;
  campaignId?: string | null;
  campaignTitle?: string | null;
}): PracticeLog {
  const campaignId = input.campaignId ? String(input.campaignId).trim() : null;
  const campaignTitle = input.campaignTitle ? String(input.campaignTitle).trim() : null;
  return {
    id: input.id ?? Date.now(),
    date: input.date,
    type: normalizeType(input.type),
    count: Math.max(1, Number.parseInt(String(input.count), 10) || 1),
    note: String(input.note ?? '').trim(),
    created: input.created ?? new Date().toISOString(),
    ...(campaignId ? { campaignId } : {}),
    ...(campaignTitle ? { campaignTitle } : {})
  };
}

export function upsertPracticeLog(logs: PracticeLog[], entry: PracticeLog): PracticeLog[] {
  const next = logs.filter((log) => log.id !== entry.id);
  next.push(entry);
  return normalizePracticeLogs(next);
}

export function deletePracticeLog(logs: PracticeLog[], id: number): PracticeLog[] {
  return normalizePracticeLogs(logs.filter((log) => log.id !== id));
}

export function inferPracticeType(title?: string, category?: string): PracticeType {
  const text = `${title ?? ''} ${category ?? ''}`.toLowerCase();
  if (text.includes('chép kinh')) {
    return 'Chép kinh';
  }
  if (text.includes('chép danh hiệu')) {
    return 'Chép danh hiệu';
  }
  if (
    text.includes('chú') ||
    text.includes('chu') ||
    text.includes('đà ra ni') ||
    text.includes('dharani') ||
    text.includes('mantra')
  ) {
    return 'Trì chú';
  }
  if (
    text.includes('niệm') ||
    text.includes('danh hiệu') ||
    text.includes('a di đà') ||
    text.includes('quán thế âm') ||
    text.includes('bồ tát')
  ) {
    return 'Niệm danh hiệu';
  }
  if (text.includes('thiền') || text.includes('tọa thiền')) {
    return 'Ngồi thiền';
  }
  if (text.includes('pháp thoại') || text.includes('bài giảng') || text.includes('thính pháp')) {
    return 'Nghe pháp thoại';
  }
  if (
    text.includes('sám hối') ||
    text.includes('lễ phật') ||
    text.includes('lạy phật') ||
    text.includes('đảnh lễ')
  ) {
    return 'Lễ Phật';
  }
  return 'Tụng kinh';
}

