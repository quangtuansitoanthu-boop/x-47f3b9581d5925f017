import { afterEach, describe, expect, it, vi } from 'vitest';
import { getDefaultThanhTinhState, saveThanhTinhState, THANH_TINH_STORAGE_KEY } from '../../../src/lib/domain/practice/thanh-tinh';

afterEach(() => vi.unstubAllGlobals());
describe('durable abstinence state save', () => {
  it('returns false without browser storage and emits no success', () => {
    vi.stubGlobal('window', undefined);
    expect(saveThanhTinhState(getDefaultThanhTinhState())).toBe(false);
  });
  it('emits success only after unchanged legacy JSON has persisted', () => {
    const state = { ...getDefaultThanhTinhState('2026-10-28T03:00:00Z'), checkInDates: ['2026-10-28'], lastCheckInDate: '2026-10-28' };
    const rows = new Map<string, string>();
    const setItem = vi.fn((key: string, value: string) => { rows.set(key, value); });
    const dispatchEvent = vi.fn((event: Event) => {
      expect(rows.get(THANH_TINH_STORAGE_KEY)).toBe(JSON.stringify(state));
      expect(event.type).toBe('tutam:thanh-tinh-saved');
      return true;
    });
    vi.stubGlobal('localStorage', { setItem }); vi.stubGlobal('window', { dispatchEvent });
    expect(saveThanhTinhState(state)).toBe(true);
    expect(setItem).toHaveBeenCalledOnce(); expect(dispatchEvent).toHaveBeenCalledOnce();
  });
  it('reports quota failure without a success event or modifying the old record', () => {
    const old = 'old persisted history';
    const rows = new Map([[THANH_TINH_STORAGE_KEY, old]]);
    const dispatchEvent = vi.fn();
    vi.stubGlobal('localStorage', { setItem: () => { throw new DOMException('quota', 'QuotaExceededError'); } });
    vi.stubGlobal('window', { dispatchEvent });
    expect(saveThanhTinhState(getDefaultThanhTinhState())).toBe(false);
    expect(dispatchEvent).not.toHaveBeenCalled();
    expect(rows.get(THANH_TINH_STORAGE_KEY)).toBe(old);
  });
});
