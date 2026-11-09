import { describe, expect, it, beforeEach } from 'vitest';
import {
  DEFAULT_INSTALL_COUNT,
  getCachedInstallCount,
  formatInstallNumber,
} from '../../src/lib/browser/app-stats';

const storage = new Map<string, string>();
const mockLocalStorage = {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => storage.set(k, String(v)),
  removeItem: (k: string) => storage.delete(k),
  clear: () => storage.clear(),
  get length() { return storage.size; },
  key: (i: number) => [...storage.keys()][i] ?? null,
};

Object.defineProperty(globalThis, 'localStorage', {
  value: mockLocalStorage,
  writable: true,
  configurable: true,
});

describe('app-stats client helper', () => {
  beforeEach(() => {
    mockLocalStorage.clear();
  });

  it('returns DEFAULT_INSTALL_COUNT (1230) when cache is empty', () => {
    expect(getCachedInstallCount()).toBe(DEFAULT_INSTALL_COUNT);
    expect(DEFAULT_INSTALL_COUNT).toBe(1230);
  });

  it('reads cached count from localStorage if valid', () => {
    mockLocalStorage.setItem(
      'tutam_install_count_cache',
      JSON.stringify({ count: 1285, timestamp: Date.now() })
    );
    expect(getCachedInstallCount()).toBe(1285);
  });

  it('ignores invalid or lower-than-baseline cache', () => {
    mockLocalStorage.setItem(
      'tutam_install_count_cache',
      JSON.stringify({ count: 50, timestamp: Date.now() })
    );
    expect(getCachedInstallCount()).toBe(1230);
  });

  it('formats install number correctly with Vietnamese and English locale', () => {
    const viFormatted = formatInstallNumber(1230, 'vi');
    expect(viFormatted.includes('1.230') || viFormatted.includes('1230')).toBe(true);

    const enFormatted = formatInstallNumber(1230, 'en');
    expect(enFormatted.includes('1,230') || enFormatted.includes('1230')).toBe(true);
  });
});
