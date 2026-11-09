import { it, expect, vi } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
vi.mock('$app/environment', () => ({ browser: true }));
vi.mock('$lib/utils/haptics', () => ({ triggerHaptic: vi.fn() }));
vi.mock('$lib/browser/personal-lunar-events', () => ({ loadPersonalLunarEvents: () => [], isPersonalEventsNotificationEnabled: () => true, getPersonalEventsForDate: () => [] }));
import { solarToLunar } from '$lib/components/lunar/lunar-calendar';
import { buildDurableReminderPlan, buildUpcomingNotificationBatch, DEFAULT_PRACTICE_REMINDER_SETTINGS } from '$lib/browser/practice-reminder-service';
it.skipIf(!process.env.GENERATE_ANDROID_REMINDER_FIXTURES)('generates shared TS/native calendar and message fixtures', () => {
  const settings = structuredClone(DEFAULT_PRACTICE_REMINDER_SETTINGS); settings.dailySchedules = [];
  const plan = buildDurableReminderPlan(settings);
  const calendar = [];
  for (let year = 2000; year <= 2100; year++) for (let month = 1; month <= 12; month++) for (const day of [1, 15, 28]) {
    const lunar = solarToLunar(day, month, year); calendar.push({ year, month, day, lunar: [lunar.day, lunar.month, lunar.year, Number(lunar.leap)] });
  }
  const messages = [];
  for (let offset = 0; offset < 800; offset++) {
    const date = new Date(2026, 0, 1 + offset), before = new Date(2026, 0, offset);
    const expected = buildUpcomingNotificationBatch(settings, 1, 'vi', { now: before, lunarEvent: (awaitLunarEvent), personalEnabled: false })
      .filter(n => n.schedule?.at && ((n.extra?.type === 'lunar_morning' && n.schedule.at.getTime() >= date.getTime()) || (n.extra?.type === 'lunar_eve' && n.schedule.at.getTime() >= before.getTime() + 19 * 3600000)))
      .map(n => ({ title: n.title, body: n.body, at: n.schedule!.at!.getTime() }));
    messages.push({ year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate(), expected });
  }
  mkdirSync('.cache', { recursive: true });
  writeFileSync('.cache/durable-reminder-fixtures.json', JSON.stringify({ plan, calendar, messages }));
  expect(calendar).toHaveLength(3636);
});
import { getLunarEvent as awaitLunarEvent } from '$lib/components/lunar/lunar-events';
