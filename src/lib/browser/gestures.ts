export interface RosaryGestureOptions {
  direction: 'up' | 'down';
  onDelta: (delta: number) => void;
}

export interface RosaryGestureController {
  destroy(): void;
}

export function createRosaryGestureController(
  target: HTMLElement,
  options: RosaryGestureOptions
): RosaryGestureController {
  const SWIPE_THRESHOLD = 36;
  let pointerStartY = 0;
  let pointerActive = false;

  function applyInput(delta: number): void {
    if (options.direction === 'down') {
      options.onDelta(delta);
      return;
    }

    options.onDelta(delta * -1);
  }

  function onPointerDown(event: PointerEvent): void {
    pointerStartY = event.clientY;
    pointerActive = true;
  }

  function onPointerUp(event: PointerEvent): void {
    if (!pointerActive) return;
    pointerActive = false;
    const diff = event.clientY - pointerStartY;
    if (Math.abs(diff) < 5) {
      // A tap is the direction-agnostic shortcut advertised by the UI. Only
      // an intentional swipe should use the configured up/down direction.
      options.onDelta(1);
      return;
    }
    if (diff >= SWIPE_THRESHOLD) {
      applyInput(1);
      return;
    }
    if (diff <= -SWIPE_THRESHOLD) {
      applyInput(-1);
    }
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown') {
      applyInput(1);
      event.preventDefault();
      return;
    }
    if (event.key === 'ArrowUp') {
      applyInput(-1);
      event.preventDefault();
    }
  }

  target.addEventListener('pointerdown', onPointerDown);
  target.addEventListener('pointerup', onPointerUp);
  window.addEventListener('keydown', onKeyDown);

  return {
    destroy() {
      target.removeEventListener('pointerdown', onPointerDown);
      target.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('keydown', onKeyDown);
    }
  };
}
