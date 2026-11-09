import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRosaryBeadController } from '$lib/browser/rosary-bead-controller';

class BeadArea extends EventTarget {
  setPointerCapture() {}
}

describe('rosary interrupted pointer gestures', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('window', Object.assign(new EventTarget(), { setTimeout, clearTimeout }));
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  function setup(canStartPointer?: (event: PointerEvent) => boolean) {
    const area = new BeadArea();
    const onDelta = vi.fn();
    const onRender = vi.fn();
    const controller = createRosaryBeadController(area as unknown as HTMLElement, {
      getDirection: () => 'down', onDelta, onRender,
      canStartPointer,
    });
    const pointer = (type: string, y: number, pointerId = 1, button = 0, isPrimary = true) => {
      const event = new Event(type);
      Object.defineProperties(event, {
        pointerId: { value: pointerId }, clientY: { value: y },
        button: { value: button }, isPrimary: { value: isPrimary },
      });
      area.dispatchEvent(event);
    };
    return { area, controller, onDelta, onRender, pointer };
  }

  it('never counts a gesture started in water, even when it later crosses the beads', () => {
    const allowed = vi.fn(() => false);
    const { controller, pointer, onDelta, onRender } = setup(allowed);
    pointer('pointerdown', 0);
    allowed.mockReturnValue(true);
    pointer('pointermove', 90);
    pointer('pointerup', 90);
    expect(onDelta).not.toHaveBeenCalled();
    expect(onRender).toHaveBeenCalledTimes(1);
    controller.destroy();
  });

  it('keeps a gesture started on beads when it crosses into water', () => {
    const allowed = vi.fn(() => true);
    const { controller, pointer, onDelta } = setup(allowed);
    pointer('pointerdown', 0);
    allowed.mockReturnValue(false);
    pointer('pointermove', 90);
    pointer('pointerup', 90);
    expect(onDelta).toHaveBeenCalledExactlyOnceWith(1);
    expect(allowed).toHaveBeenCalledTimes(1);
    controller.destroy();
  });

  it('blocks native dragging without counting it and removes the guard on destroy', () => {
    const { area, controller, onDelta, pointer } = setup();
    pointer('pointerdown', 0);
    const drag = new Event('dragstart', { cancelable: true });
    expect(area.dispatchEvent(drag)).toBe(false);
    expect(drag.defaultPrevented).toBe(true);
    expect(onDelta).not.toHaveBeenCalled();
    pointer('pointermove', 90);
    pointer('pointerup', 90);
    expect(onDelta).toHaveBeenCalledExactlyOnceWith(1);
    controller.destroy();
    const afterDestroy = new Event('dragstart', { cancelable: true });
    expect(area.dispatchEvent(afterDestroy)).toBe(true);
    expect(afterDestroy.defaultPrevented).toBe(false);
    expect(onDelta).toHaveBeenCalledExactlyOnceWith(1);
  });

  it.each([0, 90])('does not count a cancelled gesture at offset %s and permits the next real tap', offset => {
    const { controller, onDelta, onRender, pointer } = setup();
    pointer('pointerdown', 0);
    if (offset) pointer('pointermove', offset);
    pointer('pointercancel', offset);
    expect(onDelta).not.toHaveBeenCalled();
    expect(onRender).toHaveBeenLastCalledWith(0, false);
    pointer('pointerup', offset);
    expect(onDelta).not.toHaveBeenCalled();
    pointer('pointerdown', 0, 2);
    pointer('pointerup', 0, 2);
    expect(onDelta).toHaveBeenCalledExactlyOnceWith(1);
    controller.destroy();
  });

  it('ignores cancellation of another pointer while keeping the active gesture', () => {
    const { controller, onDelta, pointer } = setup();
    pointer('pointerdown', 0);
    pointer('pointercancel', 0, 2);
    pointer('pointerup', 0);
    expect(onDelta).toHaveBeenCalledExactlyOnceWith(1);
    controller.destroy();
  });

  it.each([1, 2])('does not count mouse button %s and still accepts the next primary tap', button => {
    const { controller, onDelta, pointer } = setup();
    pointer('pointerdown', 0, 1, button);
    pointer('pointerup', 0, 1, button);
    expect(onDelta).not.toHaveBeenCalled();
    pointer('pointerdown', 0, 2);
    pointer('pointerup', 0, 2);
    expect(onDelta).toHaveBeenCalledExactlyOnceWith(1);
    controller.destroy();
  });

  it('does not count a secondary touch pointer and still accepts the next primary tap', () => {
    const { controller, onDelta, pointer } = setup();
    pointer('pointerdown', 0, 2, 0, false);
    pointer('pointerup', 0, 2, 0, false);
    expect(onDelta).not.toHaveBeenCalled();
    pointer('pointerdown', 0, 1);
    pointer('pointerup', 0, 1);
    expect(onDelta).toHaveBeenCalledExactlyOnceWith(1);
    controller.destroy();
  });
});
