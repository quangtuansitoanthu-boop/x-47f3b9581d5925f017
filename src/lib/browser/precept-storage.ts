import { normalizePreceptRecords, type PreceptRecord } from '$lib/domain/practice/precepts';
const KEY = 'tutam_precept_reflections_v1';
export function loadPreceptRecords(): { records: PreceptRecord[]; error: boolean } {
  if (typeof window === 'undefined') return { records: [], error: false };
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    const records = normalizePreceptRecords(parsed);
    const valid = Array.isArray(parsed) && parsed.every(row => normalizePreceptRecords([row]).length === 1);
    return { records, error: !valid };
  } catch { return { records: [], error: true }; }
}
export function savePreceptRecords(records: PreceptRecord[]): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const current = loadPreceptRecords();
    if (current.error) return false;
    window.localStorage.setItem(KEY, JSON.stringify(normalizePreceptRecords([...current.records, ...records])));
    return true;
  }
  catch { return false; }
}
