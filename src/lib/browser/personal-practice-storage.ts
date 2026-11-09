import { createPrincipalStorage } from './principal-storage';
import type { StorageLike } from './storage-contract';
import { isDailyRoutine, isReflectionEntry, type DailyRoutine, type ReflectionEntry } from '$lib/domain/practice/personal-practice';
import { normalizePersonalSettings, type PersonalSettingsSnapshot } from '$lib/domain/practice/personal-settings';

const REFLECTIONS = 'tt_personal_reflections_v1';
const ROUTINES = 'tt_daily_routines_v1';
const NICKNAME = 'tt_community_nickname_v1';
const SETTINGS = 'tt_personal_settings_v1';

/** No network access. Private journal contents are deliberately not part of a sync payload. */
export function createPersonalPracticeStorage(storage: StorageLike, principalId: string | null) {
  const scoped = createPrincipalStorage(storage, principalId);
  function read<T>(key: string, valid: (entry: unknown) => entry is T): T[] {
    const raw = scoped.getItem(key);
    if (raw === null) return [];
    let value: unknown;
    try { value = JSON.parse(raw); } catch { throw new Error('personal_practice_storage_invalid'); }
    if (!Array.isArray(value) || !value.every(valid)) throw new Error('personal_practice_storage_invalid');
    return value;
  }
  function readSettings(): PersonalSettingsSnapshot {
    const raw = scoped.getItem(SETTINGS);
    if (raw === null) {
      // Preserve keys written by the first local implementation. A subsequent save
      // adopts them in one authoritative snapshot without deleting either source.
      return normalizePersonalSettings({ routines: read(ROUTINES, isDailyRoutine), nickname: scoped.getItem(NICKNAME) ?? '' });
    }
    try { return normalizePersonalSettings(JSON.parse(raw)); }
    catch { throw new Error('personal_practice_storage_invalid'); }
  }
  function replaceSettings(input: PersonalSettingsSnapshot): PersonalSettingsSnapshot {
    const snapshot = normalizePersonalSettings(input);
    // One atomic localStorage write changes both settings fields. Reflection data
    // has a separate key and is never read, replaced or cleared by this operation.
    scoped.setItem(SETTINGS, JSON.stringify(snapshot));
    return snapshot;
  }
  return {
    ownerId: principalId,
    getReflections: () => read(REFLECTIONS, isReflectionEntry),
    saveReflection(entry: ReflectionEntry): ReflectionEntry[] {
      if (!isReflectionEntry(entry)) throw new Error('invalid_reflection');
      const entries = read(REFLECTIONS, isReflectionEntry).filter(item => item.date !== entry.date);
      entries.push(entry);
      entries.sort((a, b) => b.date.localeCompare(a.date));
      scoped.setItem(REFLECTIONS, JSON.stringify(entries));
      return entries;
    },
    getRoutines: () => readSettings().routines,
    getSettings: readSettings,
    replaceSettings,
    saveRoutine(routine: DailyRoutine): DailyRoutine[] {
      if (!isDailyRoutine(routine)) throw new Error('invalid_daily_routine');
      const settings = readSettings();
      const normalized = normalizePersonalSettings({ nickname: settings.nickname, routines: [routine] }).routines[0];
      const index = settings.routines.findIndex(item => item.id === normalized.id);
      const content = (item: DailyRoutine) => JSON.stringify({ id: item.id, name: item.name, steps: item.steps });
      // Starting an unchanged saved routine must not make it dirty merely because
      // the editor supplied a fresh timestamp. Preserve its original position too.
      if (index >= 0 && content(settings.routines[index]) === content(normalized)) return settings.routines;
      const routines = [...settings.routines];
      if (index >= 0) routines[index] = normalized;
      else routines.push(normalized);
      replaceSettings({ ...settings, routines });
      return routines;
    },
    getNickname(): string { return readSettings().nickname; },
    saveNickname(value: string): string {
      const nickname = value.trim();
      if (!nickname || nickname.length > 40 || /[\u0000-\u001f\u007f]/u.test(nickname)) throw new Error('invalid_community_nickname');
      replaceSettings({ ...readSettings(), nickname });
      return nickname;
    },
  };
}
