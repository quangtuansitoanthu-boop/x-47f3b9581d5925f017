import { describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { initializeUiMotion, setUiMotion, uiMotion, UI_MOTION_STORAGE_KEY } from '../../src/lib/browser/ui-motion';

function fixture(saved: string | null = null, reduced = false, blocked = false) {
  const media = Object.assign(new EventTarget(), { matches: reduced });
  const host = Object.assign(new EventTarget(), {
    document: { documentElement: { dataset: {} as Record<string, string> } },
    matchMedia: () => media,
    localStorage: {
      getItem: () => { if (blocked) throw Error('blocked'); return saved; },
      setItem: vi.fn(() => { if (blocked) throw Error('blocked'); })
    }
  });
  return { host, media, start: () => initializeUiMotion(host as unknown as Window) };
}

describe('local UI motion preference', () => {
  it('defaults on and publishes the effective DOM setting', () => {
    const f = fixture(); const stop = f.start();
    expect(get(uiMotion)).toEqual({ enabled: true, reduced: false, effective: true });
    expect(f.host.document.documentElement.dataset.uiMotion).toBe('on'); stop();
  });
  it('restores off and persists only its dedicated key', () => {
    const f = fixture('0'); const stop = f.start();
    expect(get(uiMotion).effective).toBe(false);
    setUiMotion(true);
    expect(f.host.localStorage.setItem).toHaveBeenCalledExactlyOnceWith(UI_MOTION_STORAGE_KEY, '1'); stop();
  });
  it('system reduction overrides enabled without changing the stored preference', () => {
    const f = fixture('1', true); const stop = f.start();
    expect(get(uiMotion)).toEqual({ enabled: true, reduced: true, effective: false });
    f.media.matches = false; f.media.dispatchEvent(new Event('change'));
    expect(get(uiMotion).effective).toBe(true);
    expect(f.host.localStorage.setItem).not.toHaveBeenCalled(); stop();
  });
  it('keeps off when the system returns to normal', () => {
    const f = fixture('0', true); const stop = f.start();
    f.media.matches = false; f.media.dispatchEvent(new Event('change'));
    expect(get(uiMotion).effective).toBe(false); stop();
  });
  it('handles inaccessible storage and still applies a live preference', () => {
    const f = fixture(null, false, true); const stop = f.start();
    expect(() => setUiMotion(false)).not.toThrow();
    expect(f.host.document.documentElement.dataset.uiMotion).toBe('off'); stop();
  });
  it('cleans media and storage listeners on root teardown', () => {
    const f = fixture(); const removeMedia = vi.spyOn(f.media, 'removeEventListener');
    const removeStorage = vi.spyOn(f.host, 'removeEventListener'); const stop = f.start(); stop();
    expect(removeMedia).toHaveBeenCalledWith('change', expect.any(Function));
    expect(removeStorage).toHaveBeenCalledWith('storage', expect.any(Function));
    const oldStop = f.start(); const newStop = f.start(); oldStop();
    setUiMotion(false);
    expect(f.host.document.documentElement.dataset.uiMotion).toBe('off');
    expect(f.host.localStorage.setItem).toHaveBeenLastCalledWith(UI_MOTION_STORAGE_KEY, '0'); newStop();
  });
});
