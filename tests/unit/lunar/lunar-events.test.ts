import { describe, expect, it } from 'vitest';

import { getLunarEvent } from '../../../src/lib/components/lunar/lunar-events';

describe('lunar events', () => {
  it('combines Thập Trai, vía and Thọ Khang data without a browser global', () => {
    const event = getLunarEvent(new Date(2026, 1, 17));

    expect(event).toMatchObject({
      isEvent: true,
      isThapTrai: true,
      lunarDay: 1,
      lunarMonth: 1,
      viaName: 'Vía đức Phật Di Lặc',
    });
    expect(event.kiengDam?.reason).toContain('Tết Nguyên Đán');
  });

  it('returns no event for an ordinary lunar day', () => {
    const event = getLunarEvent(new Date(2026, 1, 18));

    expect(event).toMatchObject({
      isEvent: false,
      isThapTrai: false,
      lunarDay: 2,
      lunarMonth: 1,
      viaName: null,
      kiengDam: null,
    });
  });
});
