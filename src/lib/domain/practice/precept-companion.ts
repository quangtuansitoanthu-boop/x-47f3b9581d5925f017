export const FIVE_IDS = ['life', 'property', 'conduct', 'speech', 'sobriety'] as const;
export const TEN_IDS = ['life', 'property', 'conduct', 'truth', 'harmony', 'gentle', 'meaningful', 'generosity', 'kindness', 'right_view'] as const;
export const COMBINED_IDS = [...FIVE_IDS, 'truth', 'harmony', 'gentle', 'meaningful', 'generosity', 'kindness', 'right_view'] as const;
export const EIGHT_IDS = ['life', 'property', 'celibacy', 'speech', 'sobriety', 'meal', 'entertainment', 'bed'] as const;
export type CompanionGroup = 'five' | 'ten';
export type DailyGroup = CompanionGroup | 'combined';
export type Answer = 'kept' | 'review';
export type DayAnswers = Partial<Record<string, Answer>>;
export interface CompanionDay { date: string; group: CompanionGroup; answers: DayAnswers }
export interface EightSession {
  id: string; startsAt: string; endsAt: string;
  status: 'active' | 'ended' | 'cancelled'; answers: DayAnswers; templateId?: string;
}
export interface DailySession {
  id: string; group: DailyGroup; startsAt: string; endsAt: string;
  status: 'active' | 'ended' | 'cancelled'; answers: DayAnswers;
  conductConfirmation?: { completedAt: string; checkInDate: string };
}
export interface CompanionState { version: 1; days: CompanionDay[]; sessions: EightSession[]; conductDates: string[]; dailySessions?: DailySession[] }
export function emptyCompanionState(): CompanionState { return { version: 1, days: [], sessions: [], conductDates: [] }; }
export function validCompanionDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}
export function validCompanionAnswers(value: unknown, ids: readonly string[]): value is DayAnswers {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && Object.entries(value).every(([id, answer]) => ids.includes(id) && (answer === 'kept' || answer === 'review'));
}
export function validEightSession(value: unknown): value is EightSession {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Partial<EightSession>;
  const start = typeof row.startsAt === 'string' ? Date.parse(row.startsAt) : NaN;
  const end = typeof row.endsAt === 'string' ? Date.parse(row.endsAt) : NaN;
  return typeof row.id === 'string' && row.id.length > 0 && row.id.length <= 192
    && Number.isFinite(start) && end - start === 86_400_000
    && ['active', 'ended', 'cancelled'].includes(String(row.status))
    && validCompanionAnswers(row.answers, EIGHT_IDS)
    && (row.templateId === undefined || (typeof row.templateId === 'string' && row.templateId.length <= 192));
}
export function validDailySession(value: unknown): value is DailySession {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Partial<DailySession>;
  const start = typeof row.startsAt === 'string' ? Date.parse(row.startsAt) : NaN;
  const end = typeof row.endsAt === 'string' ? Date.parse(row.endsAt) : NaN;
  return typeof row.id === 'string' && row.id.length > 0 && row.id.length <= 192
    && (row.group === 'five' || row.group === 'ten' || row.group === 'combined') && Number.isFinite(start) && end - start === 86_400_000
    && ['active', 'ended', 'cancelled'].includes(String(row.status))
    && validCompanionAnswers(row.answers, row.group === 'combined' ? COMBINED_IDS : row.group === 'five' ? FIVE_IDS : TEN_IDS)
    && (row.conductConfirmation === undefined || (!!row.conductConfirmation && typeof row.conductConfirmation === 'object'
      && !Array.isArray(row.conductConfirmation) && typeof row.conductConfirmation.completedAt === 'string'
      && Number.isFinite(Date.parse(row.conductConfirmation.completedAt)) && Date.parse(row.conductConfirmation.completedAt) >= end
      && validCompanionDate(row.conductConfirmation.checkInDate)));
}
export function validCompanionState(value: unknown): value is CompanionState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Partial<CompanionState>;
  return row.version === 1 && Array.isArray(row.days) && row.days.every(day => day && validCompanionDate(day.date)
    && (day.group === 'five' || day.group === 'ten') && validCompanionAnswers(day.answers, day.group === 'five' ? FIVE_IDS : TEN_IDS))
    && Array.isArray(row.sessions) && row.sessions.every(validEightSession)
    && Array.isArray(row.conductDates) && row.conductDates.every(validCompanionDate)
    && (row.dailySessions === undefined || (Array.isArray(row.dailySessions) && row.dailySessions.every(validDailySession)));
}
