import { isDailyRoutine, type DailyRoutine } from './personal-practice';

export interface PersonalSettingsSnapshot { routines: DailyRoutine[]; nickname: string }
export interface PersonalSettingsResponse { snapshot: PersonalSettingsSnapshot; revision: number; updatedAt: string | null }
export const EMPTY_PERSONAL_SETTINGS: PersonalSettingsSnapshot = { routines: [], nickname: '' };

/** An explicit allowlist prevents private reflection fields from entering server storage. */
export function normalizePersonalSettings(input: unknown): PersonalSettingsSnapshot {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('invalid_personal_settings');
  const value = input as Record<string, unknown>;
  if (Object.keys(value).some(key => !['routines', 'nickname'].includes(key))
    || !Array.isArray(value.routines) || value.routines.length > 50 || !value.routines.every(isDailyRoutine)
    || new Set(value.routines.map(routine => routine.id)).size !== value.routines.length
    || typeof value.nickname !== 'string' || value.nickname.length > 40 || /[\u0000-\u001f\u007f]/u.test(value.nickname)) throw new Error('invalid_personal_settings');
  // Reconstruct each object so extra fields in otherwise valid routines cannot leak.
  const routines = value.routines.map(routine => ({ id: routine.id, name: routine.name, updatedAt: routine.updatedAt,
    steps: routine.steps.map(step => {
      if (step.kind === 'dedication') return { id: step.id, kind: step.kind, text: step.text, ...(step.sourceId ? { sourceId: step.sourceId } : {}) };
      if (step.kind === 'meditation') return { id: step.id, kind: step.kind, minutes: step.minutes, ...(step.cue ? { cue: step.cue } : {}) };
      if (step.kind === 'prostration') return { id: step.id, kind: step.kind, phrase: step.phrase, count: step.count };
      return { id: step.id, kind: step.kind, phrase: step.phrase, count: step.count, automatic: step.automatic, bpm: step.bpm };
    }),
  }));
  const snapshot: PersonalSettingsSnapshot = { routines, nickname: value.nickname.trim() };
  if (new TextEncoder().encode(JSON.stringify(snapshot)).byteLength > 90_000) throw new Error('personal_settings_too_large');
  return snapshot;
}
