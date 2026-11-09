import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizePdfTextItems } from '$lib/components/reader/pdf-page-text';
import { splitIntoSpeechChunks } from '$lib/components/reader/vietnamese-speech-normalizer';
import { formatGhostRuns } from '$lib/domain/practice/copying-ghost-format';
import { formatTypedCopy } from '$lib/domain/practice/copying-typed-format';
import { createNameCopyingDraft, readNameCopyingDraft } from '$lib/browser/name-copying-storage';
import { createPrincipalStorage } from '$lib/browser/principal-storage';
import { clonePracticeReminderSettings, loadReminderSettings } from '$lib/browser/practice-reminder-service';
import { cloneDailyRoutine, type DailyRoutine } from '$lib/domain/practice/personal-practice';

vi.mock('$app/environment', () => ({ browser: true }));
afterEach(() => vi.unstubAllGlobals());

function withoutProperty<T>(target: object, key: string, run: () => T): T {
  const descriptor = Object.getOwnPropertyDescriptor(target, key)!;
  Object.defineProperty(target, key, { configurable: true, writable: true, value: undefined });
  try { return run(); }
  finally { Object.defineProperty(target, key, descriptor); }
}

function memory() {
  const rows = new Map<string, string>();
  return { getItem: (key: string) => rows.get(key) ?? null, setItem: (key: string, value: string) => { rows.set(key, value); } };
}

describe('iOS 15.0–15.3 and older WebView builtins', () => {
  it('copies routine steps while preserving optional fields and draft independence', () => {
    const routine: DailyRoutine = { id: 'routine', name: 'Daily', updatedAt: '2026-11-08T00:00:00Z', steps: [
      { id: 'one', kind: 'meditation', minutes: 5, cue: undefined },
      { id: 'two', kind: 'dedication', text: 'Hồi hướng' },
    ] };
    const copy = cloneDailyRoutine(routine);
    expect(copy).toEqual(routine);
    expect(Object.prototype.hasOwnProperty.call(copy.steps[0], 'cue')).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(copy.steps[1], 'sourceId')).toBe(false);
    copy.steps[0].id = 'changed';
    expect(routine.steps[0].id).toBe('one');
  });

  it('preserves explicit undefined reminder properties without sharing nested settings', () => {
    vi.stubGlobal('localStorage', memory());
    const settings = { ...loadReminderSettings(), personal: undefined };
    const copy = clonePracticeReminderSettings(settings);
    expect(copy).toEqual(settings);
    expect(Object.prototype.hasOwnProperty.call(copy, 'personal')).toBe(true);
    copy.dailySchedules[0].label = 'Changed';
    expect(settings.dailySchedules[0].label).not.toBe('Changed');
  });
  it('extracts PDF lines without Array.at and preserves end-of-line boundaries', () => {
    const result = withoutProperty(Array.prototype, 'at', () => normalizePdfTextItems([
      { str: 'Dòng một', transform: [1, 0, 0, 1, 10, 100], width: 40, hasEOL: true },
      { str: 'Dòng hai', transform: [1, 0, 0, 1, 10, 100], width: 40 },
    ]));
    expect(result).toBe('Dòng một\nDòng hai');
  });

  it('formats and chunks Vietnamese practice text without Array.at', () => {
    const source = [{ paragraph: 0, align: 'center' as const, parts: [{ text: 'Nam mô A Di Đà Phật', bold: true }] }];
    const result = withoutProperty(Array.prototype, 'at', () => ({
      ghost: formatGhostRuns(source), typed: formatTypedCopy(source, 'Nam mô A Di Đà Phật'),
      chunks: splitIntoSpeechChunks('Nam mô A Di Đà Phật.\nNam mô Quán Thế Âm Bồ Tát.', 160, 35),
    }));
    expect(result.ghost.map(run => run.text).join('')).toBe('Nam mô A Di Đà Phật');
    expect(result.typed.map(run => run.text).join('')).toBe('Nam mô A Di Đà Phật');
    expect(result.chunks.join(' ')).toContain('Nam mô Quán Thế Âm Bồ Tát.');
  });

  it('restores the existing name-copying draft without Object.hasOwn', () => {
    const storage = memory(), draft = createNameCopyingDraft();
    draft.lines['Nam mô A Di Đà Phật'][0] = 'Nam mô A Di Đà Phật';
    draft.completed['Nam mô A Di Đà Phật'] = 108;
    createPrincipalStorage(storage, 'reader').setItem('tt_name_copying_draft_v1', JSON.stringify(draft));
    const result = withoutProperty(Object, 'hasOwn', () => readNameCopyingDraft(storage, 'reader'));
    expect(result.lines['Nam mô A Di Đà Phật'][0]).toBe('NAM MÔ A DI ĐÀ PHẬT');
    expect(result.completed['Nam mô A Di Đà Phật']).toBe(108);
  });

  it('loads independent reminder defaults when structuredClone is unavailable', () => {
    vi.stubGlobal('localStorage', memory());
    const [first, second] = withoutProperty(globalThis, 'structuredClone', () => [loadReminderSettings(), loadReminderSettings()]);
    const day = second.dailySchedules[0].days[0];
    first.dailySchedules[0].days[0] = (day + 1) % 7;
    first.lunar.thapTrai = !second.lunar.thapTrai;
    expect(second.dailySchedules[0].days[0]).toBe(day);
    expect(first.lunar.thapTrai).not.toBe(second.lunar.thapTrai);
  });

  it('does not ship unguarded newer builtins in native reader, routine and synchronization owners', () => {
    const paths = [
      'src/lib/browser/mission-book-images.ts', 'src/lib/browser/cloud-sync-coordinator.ts',
      'src/lib/components/reader/reader-text-to-speech.ts', 'src/lib/browser/personal-events-sync.ts',
      'src/lib/components/practice/personal/DailyRoutineEditor.svelte', 'src/routes/tu-tap/+page.svelte',
    ];
    for (const path of paths) {
      expect(readFileSync(path, 'utf8'), path).not.toMatch(/\.at\s*\(|\bstructuredClone\s*\(|crypto\.randomUUID\s*\(/u);
    }
  });
});
