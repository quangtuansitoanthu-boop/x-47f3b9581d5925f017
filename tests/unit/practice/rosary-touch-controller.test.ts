import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRosaryBeadController } from '$lib/browser/rosary-bead-controller';

class TouchArea {
  private listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
  setPointerCapture = vi.fn();
  addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    const callbacks = this.listeners.get(type) ?? new Set();
    callbacks.add(listener);
    this.listeners.set(type, callbacks);
  }
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    this.listeners.get(type)?.delete(listener);
  }
  dispatchEvent(event: Event) {
    for (const listener of this.listeners.get(event.type) ?? []) {
      if (typeof listener === 'function') listener(event);
      else listener.handleEvent(event);
    }
    return true;
  }
}

describe('rosary touch release lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('window', Object.assign(new EventTarget(), { setTimeout, clearTimeout }));
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  function setup() {
    const area = new TouchArea();
    const onDelta = vi.fn();
    const onRender = vi.fn();
    const controller = createRosaryBeadController(area as unknown as HTMLElement, {
      getDirection: () => 'down', onDelta, onRender,
    });
    function touch(type: string, y = 100, pointerId = 1, outside = false) {
      const event = new Event(type);
      Object.defineProperties(event, {
        pointerId: { value: pointerId }, clientY: { value: y }, pointerType: { value: 'touch' },
        isPrimary: { value: true }, button: { value: 0 },
      });
      if (outside) window.dispatchEvent(event);
      else area.dispatchEvent(event);
      return event;
    }
    return { area, controller, onDelta, onRender, touch };
  }

  it('counts one completed touch even when pointerup bubbles to the window', () => {
    const { controller, onDelta, touch } = setup();
    touch('pointerdown');
    const up = touch('pointerup');
    window.dispatchEvent(up);
    expect(onDelta).toHaveBeenCalledExactlyOnceWith(1);
    controller.destroy();
  });

  it('completes a real touch outside the area when WebView pointer capture fails', () => {
    const { area, controller, onDelta, touch } = setup();
    area.setPointerCapture.mockImplementation(() => { throw new Error('NotFoundError'); });
    expect(() => touch('pointerdown')).not.toThrow();
    touch('pointerup', 100, 1, true);
    expect(onDelta).toHaveBeenCalledExactlyOnceWith(1);
    controller.destroy();
  });

  it('does not turn lost capture into a completed touch and accepts the next gesture', () => {
    const { controller, onDelta, onRender, touch } = setup();
    touch('pointerdown');
    touch('pointermove', 180);
    touch('lostpointercapture', 180);
    touch('pointerup', 180, 1, true);
    expect(onDelta).not.toHaveBeenCalled();
    expect(onRender).toHaveBeenLastCalledWith(0, false);
    touch('pointerdown', 100, 2);
    touch('pointerup', 100, 2);
    expect(onDelta).toHaveBeenCalledExactlyOnceWith(1);
    controller.destroy();
  });

  it('uses final touch coordinates when a WebView coalesces the last move event', () => {
    const { controller, onDelta, onRender, touch } = setup();
    touch('pointerdown', 100);
    touch('pointerup', 30);
    expect(onDelta).toHaveBeenCalledExactlyOnceWith(-1);
    expect(onRender).toHaveBeenLastCalledWith(-96, true);
    controller.destroy();
  });

  it('never counts a genuinely cancelled touch, including cancellation outside the area', () => {
    const { controller, onDelta, onRender, touch } = setup();
    touch('pointerdown');
    touch('pointermove', 190);
    touch('pointercancel', 190, 1, true);
    touch('pointerup', 190, 1, true);
    expect(onDelta).not.toHaveBeenCalled();
    expect(onRender).toHaveBeenLastCalledWith(0, false);
    touch('pointerdown', 100, 2);
    touch('pointerup', 100, 2);
    expect(onDelta).toHaveBeenCalledExactlyOnceWith(1);
    controller.destroy();
  });

  it('does not count a retained controller or late release after its screen is destroyed', () => {
    const { controller, onDelta, touch } = setup();
    touch('pointerdown');
    controller.destroy();
    touch('pointerup', 100, 1, true);
    controller.roll(1);
    vi.runAllTimers();
    expect(onDelta).not.toHaveBeenCalled();
  });

  it('does not animate a completed bead when the owner rejects a throttled or invalid count', () => {
    const { controller, onDelta, onRender, touch } = setup();
    onDelta.mockReturnValue(false);
    touch('pointerdown');
    touch('pointerup');
    expect(onDelta).toHaveBeenCalledExactlyOnceWith(1);
    expect(onRender).not.toHaveBeenCalledWith(96, true);
    expect(onRender).toHaveBeenLastCalledWith(0, false);
    onDelta.mockReturnValue(true);
    touch('pointerdown', 100, 2);
    touch('pointerup', 100, 2);
    expect(onDelta).toHaveBeenCalledTimes(2);
    expect(onRender).toHaveBeenLastCalledWith(96, true);
    controller.destroy();
  });
});
