import { browser } from '$app/environment';
import { solarToLunar } from '$lib/components/lunar/lunar-calendar';
import { loadPersonalEventData, savePersonalEventData, syncPersonalEventData, pullPersonalEventData } from './personal-events-sync';
export { getPersonalEventsSyncStatus, getPersonalEventsSyncError, getPersonalEventsConflict, resolvePersonalEventsConflict, startPersonalEventsSync } from './personal-events-sync';

export type PersonalEventType = 'gio-chap' | 'quy-y' | 'phat-nguyen' | 'gia-dinh' | 'khac';
export type PersonalEventFrequency = 'yearly' | 'monthly';

export interface PersonalLunarEvent {
  id: string;
  title: string;
  lunarDay: number; // 1 - 30
  lunarMonth: number; // 1 - 12 (0 for monthly recurrence)
  frequency?: PersonalEventFrequency; // 'yearly' (default) or 'monthly'
  type: PersonalEventType;
  note?: string;
  createdAt: string;
  calendarMode?: 'lunar' | 'solar';
  solarDay?: number; // 1 - 31
  solarMonth?: number; // 1 - 12
}

const NOTIFICATION_SETTING_KEY = 'tutam_personal_events_notify_enabled';

export const PERSONAL_EVENT_TYPES: Array<{ type: PersonalEventType; icon: string; nameVi: string; nameEn: string }> = [
  { type: 'gio-chap', icon: '🕯️', nameVi: 'Giỗ chạp / Tưởng niệm', nameEn: 'Memorial Anniversary' },
  { type: 'quy-y', icon: '📿', nameVi: 'Ngày Quy y / Thọ giới', nameEn: 'Refuge / Precepts Vow' },
  { type: 'phat-nguyen', icon: '🙏', nameVi: 'Phát nguyện tu học', nameEn: 'Practice Vow' },
  { type: 'gia-dinh', icon: '🏡', nameVi: 'Kỷ niệm gia đình', nameEn: 'Family Anniversary' },
  { type: 'khac', icon: '✨', nameVi: 'Sự kiện khác', nameEn: 'Other Event' },
];

export function getPersonalEventTypeIcon(type: PersonalEventType): string {
  const found = PERSONAL_EVENT_TYPES.find((t) => t.type === type);
  return found ? found.icon : '✨';
}

export function getPersonalEventTypeName(type: PersonalEventType, isEn: boolean): string {
  const found = PERSONAL_EVENT_TYPES.find((t) => t.type === type);
  if (!found) return isEn ? 'Event' : 'Sự kiện';
  return isEn ? found.nameEn : found.nameVi;
}

export function formatLunarDayLabel(day: number, isEn: boolean = false): string {
  if (isEn) return `Day ${String(day).padStart(2, '0')}`;
  if (day >= 1 && day <= 10) return `Mồng ${day}`;
  return `Ngày ${day}`;
}

export function formatPersonalEventDateText(item: PersonalLunarEvent, isEn: boolean = false): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  if (item.calendarMode === 'solar') {
    return item.frequency === 'monthly'
      ? (isEn ? `🗓️ Day ${pad(item.solarDay || 1)} monthly (Solar)` : `🗓️ Ngày ${pad(item.solarDay || 1)} hàng tháng (Dương lịch)`)
      : `🗓️ ${pad(item.solarDay || 1)}/${pad(item.solarMonth || 1)} ${isEn ? 'Solar' : 'Dương lịch'}`;
  }
  if (item.frequency === 'monthly' || Number(item.lunarMonth) === 0) {
    return isEn
      ? `🗓️ Day ${pad(item.lunarDay)} monthly (Lunar)`
      : `🗓️ ${formatLunarDayLabel(item.lunarDay, false)} hàng tháng (Âm lịch)`;
  }
  return isEn
    ? `🗓️ Day ${pad(item.lunarDay)} Month ${pad(item.lunarMonth)} Lunar`
    : `🗓️ ${formatLunarDayLabel(item.lunarDay, false)} Tháng ${pad(item.lunarMonth)} Âm Lịch`;
}

const isBrowser = () => browser || typeof window !== 'undefined';

export function isPersonalEventsNotificationEnabled(): boolean {
  if (!isBrowser()) return true;
  try {
    const raw = localStorage.getItem(NOTIFICATION_SETTING_KEY);
    return raw === null ? true : raw === '1' || raw === 'true'; // MẶC ĐỊNH BẬT (true)
  } catch {
    return true;
  }
}

export function setPersonalEventsNotificationEnabled(enabled: boolean): boolean {
  if (!isBrowser()) return false;
  try {
    localStorage.setItem(NOTIFICATION_SETTING_KEY, enabled ? '1' : '0');
    window.dispatchEvent(new CustomEvent('quangtu:personal-events-notify-toggled', { detail: { enabled } }));
    return true;
  } catch (error) {
    console.warn('Failed to save personal events notification setting:', error);
    return false;
  }
}

export function loadPersonalLunarEvents(strict = false): PersonalLunarEvent[] {
  return loadPersonalEventData(strict);
}

export async function syncPersonalLunarEventsWithServer(events?: PersonalLunarEvent[]): Promise<void> {
  return syncPersonalEventData(events);
}

export async function pullPersonalLunarEventsFromServer(): Promise<PersonalLunarEvent[] | null> {
  return pullPersonalEventData();
}

export function savePersonalLunarEvents(events: PersonalLunarEvent[], syncWithServer = true): void {
  savePersonalEventData(events, syncWithServer);
}

export function addPersonalLunarEvent(
  input: Omit<PersonalLunarEvent, 'id' | 'createdAt'>
): PersonalLunarEvent {
  const current = loadPersonalLunarEvents();
  const newEvent: PersonalLunarEvent = {
    ...input,
    frequency: input.frequency ?? 'yearly',
    id: `ple_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    createdAt: new Date().toISOString(),
  };
  const updated = [newEvent, ...current];
  savePersonalLunarEvents(updated);
  return newEvent;
}

export function updatePersonalLunarEvent(
  id: string,
  input: Partial<Omit<PersonalLunarEvent, 'id' | 'createdAt'>>
): void {
  const current = loadPersonalLunarEvents();
  const updated = current.map((item) => (item.id === id ? { ...item, ...input } : item));
  savePersonalLunarEvents(updated);
}

export function deletePersonalLunarEvent(id: string): void {
  const current = loadPersonalLunarEvents();
  const updated = current.filter((item) => item.id !== id);
  savePersonalLunarEvents(updated);
}

export function getPersonalEventsForLunarDate(
  lunarDay: number,
  lunarMonth: number,
  events: PersonalLunarEvent[] = loadPersonalLunarEvents()
): PersonalLunarEvent[] {
  return events.filter((e) => {
    if (e.calendarMode === 'solar') return false;
    if (Number(e.lunarDay) !== Number(lunarDay)) return false;
    if (e.frequency === 'monthly' || Number(e.lunarMonth) === 0) return true;
    return Number(e.lunarMonth) === Number(lunarMonth);
  });
}

export function hasPersonalEventOnLunarDate(
  lunarDay: number,
  lunarMonth: number,
  events: PersonalLunarEvent[] = loadPersonalLunarEvents()
): boolean {
  return getPersonalEventsForLunarDate(lunarDay, lunarMonth, events).length > 0;
}

export function getPersonalEventsForDate(date: Date, events: PersonalLunarEvent[] = loadPersonalLunarEvents()): PersonalLunarEvent[] {
  const lunar = solarToLunar(date.getDate(), date.getMonth() + 1, date.getFullYear());
  return events.filter((event) => event.calendarMode === 'solar'
    ? Number(event.solarDay) === date.getDate() && (event.frequency === 'monthly' || Number(event.solarMonth) === date.getMonth() + 1)
    : Number(event.lunarDay) === lunar.day && (event.frequency === 'monthly' || Number(event.lunarMonth) === 0 || Number(event.lunarMonth) === lunar.month));
}

export function findNextPersonalEvent(date: Date, events: PersonalLunarEvent[]): { event: PersonalLunarEvent; daysLeft: number } | null {
  if (!events.length) return null;
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  for (let daysLeft = 1; daysLeft <= 370; daysLeft++) {
    next.setDate(next.getDate() + 1);
    const event = getPersonalEventsForDate(next, events)[0];
    if (event) return { event, daysLeft };
  }
  return null;
}
