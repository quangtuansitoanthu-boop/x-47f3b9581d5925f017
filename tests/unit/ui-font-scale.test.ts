import { afterEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { initializeUiFontScale, normalizeUiFontScale, setUiFontScale, uiFontScale, UI_FONT_SCALE_STORAGE_KEY } from '../../src/lib/browser/ui-font-scale';

let stop: (() => void) | undefined;
afterEach(() => { stop?.(); stop = undefined; vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function fixture(saved: string | null = null, blocked = false) {
  const values = new Map<string, string>();
  const storage = {
    getItem: vi.fn(() => { if (blocked) throw Error('blocked'); return saved; }),
    setItem: vi.fn(() => { if (blocked) throw Error('blocked'); }),
  };
  const host = Object.assign(new EventTarget(), {
    document: { documentElement: { style: { setProperty: (key: string, value: string) => values.set(key, value) } } },
    localStorage: storage,
  });
  return { host, storage, values, start: () => initializeUiFontScale(host as unknown as Window) };
}
describe('device-local interface text size', () => {
  it.each([
    [null, 1], ['', 1], [' ', 1], ['bad', 1], ['Infinity', 1], [NaN, 1],
    ['0.1', 0.9], ['9', 1.2], ['1.159', 1.2], [1.1 + 0.1, 1.2],
  ])('validates and bounds stored value %s to %s', (input, expected) => {
    expect(normalizeUiFontScale(input)).toBe(expected);
  });
  it('defaults to 100% without writing any preference on initialization', () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const f = fixture(); stop = f.start();
    expect(get(uiFontScale)).toBe(1);
    expect(f.values.get('--ui-font-scale')).toBe('1');
    expect(f.storage.setItem).not.toHaveBeenCalled();
    setUiFontScale(1.1); setUiFontScale(1);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('restores the saved size and writes only its own key when changing or resetting', () => {
    const f = fixture('1.1'); stop = f.start();
    expect(get(uiFontScale)).toBe(1.1);
    setUiFontScale(1.2); setUiFontScale(1.2); setUiFontScale(1);
    expect(f.storage.setItem.mock.calls).toEqual([[UI_FONT_SCALE_STORAGE_KEY, '1.2'], [UI_FONT_SCALE_STORAGE_KEY, '1']]);
    expect(f.values.get('--ui-font-scale')).toBe('1');
  });
  it('keeps live controls usable when storage is blocked', () => {
    const f = fixture(null, true); stop = f.start();
    expect(() => setUiFontScale(1.1)).not.toThrow();
    expect(f.values.get('--ui-font-scale')).toBe('1.1');
    expect(get(uiFontScale)).toBe(1.1);
  });
  it('responds to the correct storage area and key without echoing a write', () => {
    const f = fixture('1.1'); stop = f.start();
    const change = (key: string | null, newValue: string | null, storageArea = f.storage) => {
      const event = Object.assign(new Event('storage'), { key, newValue, storageArea });
      f.host.dispatchEvent(event);
    };
    change('tutam_read_fontsize', '22');
    change(UI_FONT_SCALE_STORAGE_KEY, '1.2', { ...f.storage });
    expect(get(uiFontScale)).toBe(1.1);
    change(UI_FONT_SCALE_STORAGE_KEY, '0.9');
    expect(get(uiFontScale)).toBe(0.9);
    change(null, null);
    expect(get(uiFontScale)).toBe(1);
    expect(f.storage.setItem).not.toHaveBeenCalled();
  });
  it('removes listeners on reinitialization and ignores an obsolete cleanup', () => {
    const f = fixture(); const remove = vi.spyOn(f.host, 'removeEventListener');
    const oldStop = f.start(); stop = f.start(); oldStop();
    setUiFontScale(1.2);
    expect(f.values.get('--ui-font-scale')).toBe('1.2');
    stop();
    f.host.dispatchEvent(Object.assign(new Event('storage'), { key:UI_FONT_SCALE_STORAGE_KEY, newValue:'0.9', storageArea:f.storage }));
    expect(get(uiFontScale)).toBe(1.2);
    expect(remove).toHaveBeenCalledWith('storage', expect.any(Function));
  });
});
