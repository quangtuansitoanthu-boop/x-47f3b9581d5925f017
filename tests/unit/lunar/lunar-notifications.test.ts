import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

import {
  createLunarReminder,
  triggerDailyLunarNotification,
  type LunarEventNotificationInfo,
} from '../../../src/lib/browser/lunar-notifications';
import { LEGACY_LOCAL_STORAGE_KEYS, type StorageLike } from '../../../src/lib/browser/storage-contract';

class MemoryStorage implements StorageLike {
  #items = new Map<string, string>();
  getItem(key: string) { return this.#items.get(key) ?? null; }
  setItem(key: string, value: string) { this.#items.set(key, value); }
}

const event: LunarEventNotificationInfo = {
  isEvent: true,
  isThapTrai: true,
  viaName: 'Vía Đức Phật',
  kiengDam: null,
  lunarDay: 8,
  lunarMonth: 7,
};

describe('daily Thập Trai notification', () => {
  it.each([1, 9, 10, 11, 24, 30])('uses the correct lunar day prefix for day %i', (lunarDay) => {
    const reminder = createLunarReminder({ ...event, lunarDay });
    expect(reminder.options.body).toContain(`${lunarDay <= 10 ? 'mùng' : 'ngày'} ${lunarDay}/7`);
  });

  it('is wired into the banner with the padded Vietnam day key', () => {
    const banner = readFileSync('src/lib/components/lunar/ThapTraiBanner.svelte', 'utf8');
    expect(banner).toContain('getLunarEvent(today, localeStore.current)');
    expect(banner).toContain('triggerBrowserLunarNotification(eventInfo, todayKey, localeStore.current)');
    expect(banner).toContain("String(today.getMonth() + 1).padStart(2, '0')");
    expect(banner).toContain("String(today.getDate()).padStart(2, '0')");
  });

  it('builds the combined Thập Trai and vía reminder', () => {
    const reminder = createLunarReminder(event);
    expect(reminder.title).toBe('Thập Trai & Vía Đức Phật');
    expect(reminder.options.body).toContain('mùng 8/7');
    expect(reminder.options.tag).toBe('thap-trai-reminder');
  });

  it('shows once per Vietnam day when permission is granted', async () => {
    const storage = new MemoryStorage();
    const show = vi.fn().mockResolvedValue(undefined);
    const runtime = { permission: 'granted' as const, show, storage };

    await expect(triggerDailyLunarNotification(event, '2026-08-02', runtime)).resolves.toBe(true);
    await expect(triggerDailyLunarNotification(event, '2026-08-02', runtime)).resolves.toBe(false);
    expect(show).toHaveBeenCalledTimes(1);
    expect(storage.getItem(LEGACY_LOCAL_STORAGE_KEYS.uposathaNotifiedDate)).toBe('2026-08-02');
  });

  it('does not notify without permission and only marks the day after delivery succeeds', async () => {
    const storage = new MemoryStorage();
    const deniedShow = vi.fn();
    await expect(triggerDailyLunarNotification(event, '2026-08-02', {
      permission: 'denied', show: deniedShow, storage,
    })).resolves.toBe(false);
    expect(deniedShow).not.toHaveBeenCalled();

    await expect(triggerDailyLunarNotification(event, '2026-08-02', {
      permission: 'granted', show: vi.fn().mockRejectedValue(new Error('delivery failed')), storage,
    })).rejects.toThrow('delivery failed');
    expect(storage.getItem(LEGACY_LOCAL_STORAGE_KEYS.uposathaNotifiedDate)).toBeNull();
  });
});
