import { loadPreceptRecords } from './precept-storage';
import { getVietnamIsoDate } from '$lib/domain/practice/stats';
import { FIVE_IDS, TEN_IDS, COMBINED_IDS, emptyCompanionState, validCompanionDate, validCompanionAnswers, validCompanionState, validEightSession, validDailySession,
  type CompanionState, type CompanionGroup, type DayAnswers, type EightSession, type DailySession, type Answer } from '$lib/domain/practice/precept-companion';

export const PRECEPT_COMPANION_KEY = 'tutam_precept_companion_v1';
const ABSTINENCE_KEY = 'tutam_thanh_tinh_v1';
export function loadPreceptCompanion(): { state: CompanionState; error: boolean } {
  if (typeof window === 'undefined') return { state: emptyCompanionState(), error: false };
  try {
    const raw = window.localStorage.getItem(PRECEPT_COMPANION_KEY);
    if (raw === null) return { state: emptyCompanionState(), error: false };
    const state: unknown = JSON.parse(raw);
    return validCompanionState(state) ? { state, error: false } : { state: emptyCompanionState(), error: true };
  } catch { return { state: emptyCompanionState(), error: true }; }
}
function update(change: (state: CompanionState) => void | boolean): boolean {
  if (typeof window === 'undefined') return false;
  const current = loadPreceptCompanion();
  if (current.error) return false;
  try {
    if (change(current.state) === false) return true;
    window.localStorage.setItem(PRECEPT_COMPANION_KEY, JSON.stringify(current.state));
    // Thông báo UI không được biến bản ghi đã lưu bền vững thành lỗi lưu giả.
    try { window.dispatchEvent(new CustomEvent('tutam:precept-companion-saved')); } catch { /* Môi trường không có observer vẫn giữ kết quả lưu. */ }
    return true;
  } catch { return false; }
}
function hasCheckIn(date: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw: unknown = JSON.parse(window.localStorage.getItem(ABSTINENCE_KEY) ?? 'null');
    if (!raw || typeof raw !== 'object') return false;
    const dates = (raw as { checkInDates?: unknown }).checkInDates;
    return Array.isArray(dates) && dates.every(validCompanionDate) && dates.includes(date);
  } catch { return false; }
}
function readConductSource(): { source: { checkInDates: string[]; lastCheckInDate?: unknown; relapseHistory?: { date: string }[] } | null; error: boolean } {
  if (typeof window === 'undefined') return { source: null, error: false };
  try {
    const raw: unknown = JSON.parse(window.localStorage.getItem(ABSTINENCE_KEY) ?? 'null');
    if (raw === null) return { source: null, error: false };
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { source: null, error: true };
    const row = raw as { checkInDates?: unknown; lastCheckInDate?: unknown; relapseHistory?: unknown };
    if (!Array.isArray(row.checkInDates) || !row.checkInDates.every(validCompanionDate)
      || (row.relapseHistory !== undefined && (!Array.isArray(row.relapseHistory) || !row.relapseHistory.every(item => item && typeof item === 'object'
        && typeof item.date === 'string' && Number.isFinite(Date.parse(item.date)))))) return { source: null, error: true };
    return { source: row as { checkInDates: string[]; lastCheckInDate?: unknown; relapseHistory?: { date: string }[] }, error: false };
  } catch { return { source: null, error: true }; }
}
export function getDailySessionTestingConduct(session: DailySession): { answer: Answer | undefined; confirmed: boolean; error: boolean } {
  const current = loadPreceptCompanion();
  if (current.error) return { answer: undefined, confirmed: false, error: true };
  const saved = current.state.dailySessions?.find(row => row.id === session.id);
  if (!saved || saved.group !== 'combined' || saved.group !== session.group || saved.status !== 'active'
    || saved.startsAt !== session.startsAt || saved.endsAt !== session.endsAt) return { answer: undefined, confirmed: false, error: false };
  const { source, error } = readConductSource();
  const today = getVietnamIsoDate(new Date());
  if (error || !source || source.lastCheckInDate !== today || !source.checkInDates.includes(today)) return { answer: undefined, confirmed: false, error };
  const start = Date.parse(saved.startsAt), end = Date.parse(saved.endsAt);
  const relapsed = source.relapseHistory?.some(row => { const at = Date.parse(row.date); return at >= start && at <= end; }) ?? false;
  return { answer: relapsed ? 'review' : 'kept', confirmed: true, error: false };
}
export function getDailySessionConduct(session: DailySession): { answer: Answer | undefined; confirmed: boolean; error: boolean } {
  const current = loadPreceptCompanion();
  if (current.error) return { answer: undefined, confirmed: false, error: true };
  const saved = current.state.dailySessions?.find(row => row.id === session.id);
  if (!saved || saved.group !== session.group || saved.startsAt !== session.startsAt || saved.endsAt !== session.endsAt) return { answer: undefined, confirmed: false, error: false };
  if (saved.group !== 'combined') return { answer: saved.answers.conduct, confirmed: false, error: false };
  const proof = saved.conductConfirmation;
  if (!proof || saved.status === 'cancelled') return { answer: undefined, confirmed: false, error: false };
  const { source, error } = readConductSource();
  if (error || !source?.checkInDates.includes(proof.checkInDate)) return { answer: undefined, confirmed: false, error };
  const start = Date.parse(saved.startsAt), end = Date.parse(saved.endsAt);
  const relapsed = source.relapseHistory?.some(row => { const at = Date.parse(row.date); return at >= start && at <= end; }) ?? false;
  return { answer: relapsed ? 'review' : 'kept', confirmed: true, error: false };
}
export function getCompanionDay(group: CompanionGroup, date: string): { answers: DayAnswers; derivedConduct: boolean; error: boolean } {
  const current = loadPreceptCompanion();
  const answers: DayAnswers = {};
  let legacyError = false;
  if (group === 'five') {
    const legacy = loadPreceptRecords();
    legacyError = legacy.error;
    const day = legacy.records.find(row => row.date === date);
    if (day) FIVE_IDS.forEach((id, index) => { answers[id] = day.answers[index]; });
  }
  Object.assign(answers, current.state.days.find(row => row.date === date && row.group === group)?.answers ?? {});
  const derivedConduct = !current.error && answers.conduct === undefined && current.state.conductDates.includes(date) && hasCheckIn(date);
  if (derivedConduct) answers.conduct = 'kept';
  return { answers, derivedConduct, error: current.error || legacyError };
}
export function saveCompanionDay(group: CompanionGroup, date: string, delta: DayAnswers): boolean {
  if (!validCompanionDate(date) || (group !== 'five' && group !== 'ten') || !validCompanionAnswers(delta, group === 'five' ? FIVE_IDS : TEN_IDS)) return false;
  if (group === 'five' && loadPreceptRecords().error) return false;
  return update(state => {
    const previous = state.days.find(row => row.date === date && row.group === group);
    if (previous) Object.assign(previous.answers, delta);
    else state.days.push({ group, date, answers: { ...delta } });
  });
}
export function saveEightSession(session: EightSession): boolean {
  if (!validEightSession(session)) return false;
  return update(state => {
    if (session.status === 'active' && state.sessions.some(row => row.id !== session.id && row.status === 'active')) throw new Error('active_session_exists');
    const previous = state.sessions.find(row => row.id === session.id);
    if (previous) {
      if (previous.startsAt !== session.startsAt || previous.endsAt !== session.endsAt || previous.templateId !== session.templateId
        || (previous.status !== 'active' && session.status !== previous.status)) throw new Error('invalid_session_transition');
      Object.assign(previous, session, { answers: { ...previous.answers, ...session.answers } });
    } else state.sessions.push({ ...session, answers: { ...session.answers } });
  });
}
export function saveDailySession(session: DailySession): boolean {
  if (!validDailySession(session) || (session.status === 'ended' && Date.now() < Date.parse(session.endsAt))) return false;
  return update(state => {
    const sessions = state.dailySessions ?? [];
    const previous = sessions.find(row => row.id === session.id);
    if (session.status === 'active' && sessions.some(row => row.id !== session.id && row.group === session.group && row.status === 'active')) throw new Error('active_daily_session_exists');
    if (previous) {
      if (previous.group !== session.group || previous.startsAt !== session.startsAt || previous.endsAt !== session.endsAt) throw new Error('invalid_daily_session_identity');
      const answers = { ...previous.answers, ...session.answers };
      const ids = session.group === 'combined' ? COMBINED_IDS : session.group === 'five' ? FIVE_IDS : TEN_IDS;
      if (session.conductConfirmation && (!previous.conductConfirmation
        || previous.conductConfirmation.completedAt !== session.conductConfirmation.completedAt
        || previous.conductConfirmation.checkInDate !== session.conductConfirmation.checkInDate)) throw new Error('conduct_confirmation_owner_required');
      const unchanged = previous.status === session.status && ids.every(id => previous.answers[id] === answers[id]);
      if (previous.status !== 'active' && !unchanged) throw new Error('invalid_daily_session_transition');
      if (unchanged) return false;
      const conductConfirmation = previous.conductConfirmation;
      Object.assign(previous, session, { answers });
      if (conductConfirmation) previous.conductConfirmation = conductConfirmation;
    } else {
      if (session.status !== 'active' || session.conductConfirmation) throw new Error('daily_session_must_start_active');
      state.dailySessions = [...sessions, { ...session, answers: { ...session.answers } }];
    }
  });
}
// Chỉ owner điểm danh gọi sau khi lưu thành công; không truy hồi lịch sử cũ.
export function recordAbstinenceConduct(date: string): boolean {
  if (!validCompanionDate(date) || date !== getVietnamIsoDate(new Date()) || !hasCheckIn(date)) return false;
  const { source, error } = readConductSource();
  const completedAt = new Date().toISOString();
  return update(state => {
    let changed = false;
    if (!state.conductDates.includes(date)) { state.conductDates.push(date); changed = true; }
    if (!error && source?.lastCheckInDate === date) {
      for (const session of state.dailySessions ?? []) {
        if (session.group === 'combined' && session.status === 'active' && Date.parse(completedAt) >= Date.parse(session.endsAt)
          && !session.conductConfirmation) {
          session.conductConfirmation = { completedAt, checkInDate: date }; changed = true;
        }
      }
    }
    return changed;
  });
}
