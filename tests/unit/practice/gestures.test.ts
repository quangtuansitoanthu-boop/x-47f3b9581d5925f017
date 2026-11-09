import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createRosaryGestureController } from '../../../src/lib/browser/gestures';

class FakeTarget extends EventTarget {
  addEventListener(type: string, listener: EventListenerOrEventListenerObject | null): void {
    super.addEventListener(type, listener);
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null): void {
    super.removeEventListener(type, listener);
  }
}

function pointerEvent(type: string, clientY: number): Event {
  return Object.assign(new Event(type), { clientY });
}

describe('rosary gesture direction contract', () => {
  let keyboardTarget: EventTarget;

  beforeEach(() => {
    keyboardTarget = new EventTarget();
    vi.stubGlobal('window', keyboardTarget);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each(['up', 'down'] as const)('always increments a tap when direction is %s', (direction) => {
    const target = new FakeTarget();
    const deltas: number[] = [];
    const controller = createRosaryGestureController(target as unknown as HTMLElement, {
      direction,
      onDelta: (delta) => deltas.push(delta)
    });

    target.dispatchEvent(pointerEvent('pointerdown', 180));
    target.dispatchEvent(pointerEvent('pointerup', 180));

    expect(deltas).toEqual([1]);
    controller.destroy();
  });

  it.each([
    { direction: 'up' as const, start: 180, end: 100, expected: 1 },
    { direction: 'up' as const, start: 100, end: 180, expected: -1 },
    { direction: 'down' as const, start: 100, end: 180, expected: 1 },
    { direction: 'down' as const, start: 180, end: 100, expected: -1 }
  ])('keeps legacy swipe semantics for $direction ($start → $end)', ({ direction, start, end, expected }) => {
    const target = new FakeTarget();
    const deltas: number[] = [];
    const controller = createRosaryGestureController(target as unknown as HTMLElement, {
      direction,
      onDelta: (delta) => deltas.push(delta)
    });

    target.dispatchEvent(pointerEvent('pointerdown', start));
    target.dispatchEvent(pointerEvent('pointerup', end));

    expect(deltas).toEqual([expected]);
    controller.destroy();
  });
});
