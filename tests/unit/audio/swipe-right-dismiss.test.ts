import { describe, expect, it, vi } from 'vitest';
import { swipeRightDismiss } from '$lib/browser/swipe-right-dismiss';

class Banner extends EventTarget {
  style = { translate: '', opacity: '', removeProperty(name: string) { this[name as 'translate' | 'opacity'] = ''; } };
  getBoundingClientRect() { return { width: 360 }; }
  setPointerCapture() {}
}
function setup() {
  const banner = new Banner();
  const dismiss = vi.fn();
  const action = swipeRightDismiss(banner as unknown as HTMLElement, dismiss);
  const pointer = (type: string, horizontal: number, vertical = 0, target?: object) => {
    const event = new Event(type, { cancelable: true });
    Object.defineProperties(event, {
      isPrimary: { value: true }, button: { value: 0 }, pointerId: { value: 1 },
      clientX: { value: horizontal }, clientY: { value: vertical },
      ...(target ? { target: { value: target } } : {}),
    });
    banner.dispatchEvent(event);
  };
  return { banner, dismiss, action, pointer };
}

describe('audio banner right swipe', () => {
  it('follows a right swipe, dismisses after the threshold and suppresses the generated click', () => {
    const { banner, dismiss, pointer } = setup();
    pointer('pointerdown', 20);
    pointer('pointermove', 130, 5);
    expect(banner.style.translate).toBe('110px 0');
    pointer('pointerup', 130, 5);
    expect(dismiss).toHaveBeenCalledOnce();
    const click = new Event('click', { cancelable: true });
    banner.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
  });
  it.each([[40, 0], [-100, 0], [10, 110]])('keeps the banner for a short, leftward or vertical gesture (%s, %s)', (horizontal, vertical) => {
    const { dismiss, pointer } = setup();
    pointer('pointerdown', 0);
    pointer('pointermove', horizontal, vertical);
    pointer('pointerup', horizontal, vertical);
    expect(dismiss).not.toHaveBeenCalled();
  });
  it('does not steal a seek slider gesture', () => {
    const { dismiss, pointer } = setup();
    pointer('pointerdown', 0, 0, { closest: () => ({}) });
    pointer('pointermove', 200);
    pointer('pointerup', 200);
    expect(dismiss).not.toHaveBeenCalled();
  });
  it('resets cancellation and removes listeners on destruction', () => {
    const { banner, dismiss, action, pointer } = setup();
    pointer('pointerdown', 0);
    pointer('pointermove', 120);
    pointer('pointercancel', 120);
    expect(banner.style.translate).toBe('');
    expect(dismiss).not.toHaveBeenCalled();
    action.destroy();
    pointer('pointerdown', 0);
    pointer('pointermove', 200);
    pointer('pointerup', 200);
    expect(dismiss).not.toHaveBeenCalled();
  });
});
