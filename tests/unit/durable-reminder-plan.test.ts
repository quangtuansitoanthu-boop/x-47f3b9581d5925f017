import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('$app/environment', () => ({ browser: true }));
vi.mock('$lib/utils/haptics', () => ({ triggerHaptic: vi.fn() }));
vi.mock('$lib/browser/personal-lunar-events', () => ({ loadPersonalLunarEvents: () => [], isPersonalEventsNotificationEnabled: () => true, getPersonalEventsForDate: () => [] }));
import { buildDurableReminderPlan, DEFAULT_PRACTICE_REMINDER_SETTINGS } from '$lib/browser/practice-reminder-service';
describe('durable Android reminder rules', () => {
  it('stores calendar rules rather than an expiring list of dates', () => {
    const plan = buildDurableReminderPlan(structuredClone(DEFAULT_PRACTICE_REMINDER_SETTINGS), 'vi');
    expect(plan.version).toBe(1);
    expect(plan.daily).toHaveLength(2);
    expect(Object.values(plan.lunar).length).toBeGreaterThan(300);
    expect(plan.lunar['2-19-30-0'].morning.title).toContain('Quán Thế Âm');
    expect(plan.lunar['2-19-30-1']?.morning?.title || '').not.toContain('Quán Thế Âm');
    expect(JSON.stringify(plan)).not.toContain('expiresAt');
  });
  it('preserves day 30 feast observance in a short lunar month', () => {
    const plan = buildDurableReminderPlan(structuredClone(DEFAULT_PRACTICE_REMINDER_SETTINGS), 'vi');
    expect(plan.lunar['9-29-29-0'].morning.title).toContain('Dược Sư');
  });
  it('honors disabled feast days and an empty daily schedule', () => {
    const settings = structuredClone(DEFAULT_PRACTICE_REMINDER_SETTINGS);
    settings.dailySchedules = [];
    settings.lunar.viaPhat = false;
    const plan = buildDurableReminderPlan(settings, 'vi');
    expect(plan.daily).toEqual([]);
    expect(plan.lunar['2-19-30-0']?.morning?.title || '').not.toContain('Quán Thế Âm');
  });
  it('adds personal timing without changing legacy lunar flags, messages or daily rules', () => {
    const settings = structuredClone(DEFAULT_PRACTICE_REMINDER_SETTINGS);
    const before = buildDurableReminderPlan(settings);
    settings.personal = { beforeEnabled: false, dayEnabled: true, daysBefore: 100, beforeTime: '23:59', dayTime: '00:00' };
    const after = buildDurableReminderPlan(settings);
    expect(after.personalTiming).toEqual(settings.personal);
    expect(after.eve).toBe(before.eve);
    expect(after.morning).toBe(before.morning);
    expect(after.lunar).toEqual(before.lunar);
    expect(after.daily).toEqual(before.daily);
  });
});
