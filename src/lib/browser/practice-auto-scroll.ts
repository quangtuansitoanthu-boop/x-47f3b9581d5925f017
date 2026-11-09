export const PRACTICE_AUTO_SCROLL_SPEEDS = [0.25, 0.5, 1, 2] as const;
export type PracticeAutoScrollSpeed = (typeof PRACTICE_AUTO_SCROLL_SPEEDS)[number];
const MANUAL_SCROLL_KEYS = new Set([' ', 'ArrowDown', 'ArrowUp', 'End', 'Home', 'PageDown', 'PageUp']);

export interface PracticeAutoScrollController {
  destroy(): void;
  isActive(): boolean;
  setSpeed(speed: PracticeAutoScrollSpeed): void;
  start(): void;
  stop(): void;
  toggle(): void;
}

function isControlTarget(target: EventTarget | null): boolean {
  return typeof Element !== 'undefined'
    && target instanceof Element
    && Boolean(target.closest('button, select, .tt-practice__panel, .tt-practice__toolbar'));
}

export function createPracticeAutoScrollController(
  onActiveChange: (active: boolean) => void,
  initialSpeed: PracticeAutoScrollSpeed = 0.5
): PracticeAutoScrollController {
  let active = false;
  let frame = 0;
  let speed = initialSpeed;
  let exactScrollY = 0;
  let lastTime = 0;

  function stop(): void {
    active = false;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    onActiveChange(false);
  }

  function step(time: number): void {
    if (!active) return;
    const elapsed = lastTime ? time - lastTime : 16.6;
    lastTime = time;
    if (Math.abs(window.scrollY - exactScrollY) > 2) exactScrollY = window.scrollY;
    exactScrollY += speed * (elapsed / 16.6);
    // Global page CSS enables smooth anchor scrolling. An explicit instant step
    // prevents every animation frame from restarting the browser's smooth-scroll
    // animation before it has a chance to move.
    window.scrollTo({
      behavior: 'instant',
      left: window.scrollX,
      top: exactScrollY
    });

    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 1.5) {
      stop();
      return;
    }
    frame = requestAnimationFrame(step);
  }

  function start(): void {
    if (active) return;
    active = true;
    exactScrollY = window.scrollY;
    lastTime = performance.now();
    onActiveChange(true);
    frame = requestAnimationFrame(step);
  }

  function stopOnManualInput(event: Event): void {
    if (active && !isControlTarget(event.target)) stop();
  }

  function stopOnManualKey(event: KeyboardEvent): void {
    if (active && MANUAL_SCROLL_KEYS.has(event.key) && !isControlTarget(event.target)) stop();
  }

  function stopWhenHidden(): void {
    if (document.visibilityState === 'hidden') stop();
  }

  window.addEventListener('wheel', stopOnManualInput, { passive: true });
  window.addEventListener('touchstart', stopOnManualInput, { passive: true });
  window.addEventListener('pointerdown', stopOnManualInput, { passive: true });
  window.addEventListener('keydown', stopOnManualKey);
  document.addEventListener('visibilitychange', stopWhenHidden);

  return {
    destroy() {
      stop();
      window.removeEventListener('wheel', stopOnManualInput);
      window.removeEventListener('touchstart', stopOnManualInput);
      window.removeEventListener('pointerdown', stopOnManualInput);
      window.removeEventListener('keydown', stopOnManualKey);
      document.removeEventListener('visibilitychange', stopWhenHidden);
    },
    isActive: () => active,
    setSpeed(nextSpeed) {
      speed = nextSpeed;
    },
    start,
    stop,
    toggle() {
      if (active) stop();
      else start();
    }
  };
}
