export interface ReflectionEntry {
  date: string;
  repentance: string;
  goodDeeds: string;
  updatedAt: string;
}

export const REFLECTION_MINIMUM_WORDS = 50;

/** Count normalized Vietnamese/Unicode words separated by whitespace. */
export function countReflectionWords(text: string): number {
  if (typeof text !== 'string') return 0;
  const trimmed = text.normalize('NFC').trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/u).filter(Boolean).length;
}

export type RoutineStep =
  | { id: string; kind: 'prostration'; phrase: string; count: number }
  | { id: string; kind: 'meditation'; minutes: number; cue?: 'bell' | 'bowl' | 'khánh' }
  | { id: string; kind: 'rosary'; phrase: string; count: number; automatic: boolean; bpm: 30 | 40 | 60 | 80 }
  | { id: string; kind: 'dedication'; text: string; sourceId?: string };

export interface DailyRoutine {
  id: string;
  name: string;
  steps: RoutineStep[];
  updatedAt: string;
}

/** Copy editable DTOs without sharing nested step state. */
export function cloneDailyRoutine(routine: DailyRoutine): DailyRoutine {
  return { ...routine, steps: routine.steps.map(step => ({ ...step })) };
}

const validText = (value: unknown, maximum: number, required = false): value is string =>
  typeof value === 'string' && value.length <= maximum && (!required || Boolean(value.trim()));
const integer = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const timestamp = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));

export function isReflectionEntry(value: unknown): value is ReflectionEntry {
  if (!record(value) || !validText(value.date, 10) || !/^\d{4}-\d{2}-\d{2}$/.test(value.date)) return false;
  const parsed = new Date(`${value.date}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value.date
    && validText(value.repentance, 20_000) && validText(value.goodDeeds, 20_000) && timestamp(value.updatedAt);
}

export function isRoutineStep(value: unknown): value is RoutineStep {
  if (!record(value) || !validText(value.id, 100, true)) return false;
  if (value.kind === 'prostration') return validText(value.phrase, 500, true) && integer(value.count, 1, 10_000);
  if (value.kind === 'meditation') return integer(value.minutes, 1, 240)
    && (value.cue === undefined || value.cue === 'bell' || value.cue === 'bowl' || value.cue === 'khánh');
  if (value.kind === 'rosary') return validText(value.phrase, 500, true) && integer(value.count, 1, 100_000)
    && typeof value.automatic === 'boolean' && [30, 40, 60, 80].includes(value.bpm as number);
  return value.kind === 'dedication' && validText(value.text, 20_000, true)
    && (value.sourceId === undefined || validText(value.sourceId, 200, true));
}

export function isDailyRoutine(value: unknown): value is DailyRoutine {
  return record(value) && validText(value.id, 100, true) && validText(value.name, 120, true)
    && timestamp(value.updatedAt) && Array.isArray(value.steps) && value.steps.length > 0 && value.steps.length <= 20
    && value.steps.every(isRoutineStep) && new Set(value.steps.map(step => step.id)).size === value.steps.length;
}

/** Reordering never changes an individual tool's configuration or content. */
export function moveRoutineStep(routine: DailyRoutine, from: number, to: number): DailyRoutine {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 || from >= routine.steps.length || to >= routine.steps.length) return routine;
  const steps = [...routine.steps];
  const [step] = steps.splice(from, 1);
  steps.splice(to, 0, step);
  return { ...routine, steps };
}
