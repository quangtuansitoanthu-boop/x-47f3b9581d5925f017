import { registerPlugin } from '@capacitor/core';
import { nativePlatform } from './native-platform';
import type { PersonalLunarEvent } from './personal-lunar-events';
import type { PersonalReminderConfig } from './practice-reminder-service';

type Message = { title: string; body: string; target: string };
export interface DurableReminderPlan {
  version: 1;
  enabled: boolean;
  locale: string;
  daily: Array<{ id: number; key: string; title: string; body: string; hour: number; minute: number; days: number[] }>;
  lunar: Record<string, { eve?: Message; morning?: Message }>;
  personal: PersonalLunarEvent[];
  eve: boolean;
  morning: boolean;
  personalTiming?: PersonalReminderConfig;
  sound: boolean;
  vibrate: boolean;
}
const plugin = registerPlugin<{
  replacePlan(options: { plan: DurableReminderPlan }): Promise<{ ruleCount: number; alarmMode?: 'exact' | 'inexact' | 'off' }>;
  clearPersonal(): Promise<void>;
  testNotification(options: { title: string; body: string; sound: boolean; vibrate: boolean }): Promise<{ shown: boolean }>;
}>('DurableReminders');
export const replaceDurableReminderPlan = (plan: DurableReminderPlan) => plugin.replacePlan({ plan });
export const clearDurablePersonalReminders = () => plugin.clearPersonal();

export async function sendDurableTestNotification(options: { title: string; body: string; sound: boolean; vibrate: boolean }): Promise<{ shown: boolean }> {
  if (nativePlatform() !== 'android') return { shown: false };
  try { return { shown: (await plugin.testNotification(options)).shown === true }; }
  catch { return { shown: false }; }
}
