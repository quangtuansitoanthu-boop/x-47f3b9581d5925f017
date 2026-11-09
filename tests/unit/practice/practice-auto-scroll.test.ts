import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createPracticeAutoScrollController } from '../../../src/lib/browser/practice-auto-scroll';

class FakeWindow extends EventTarget {
  innerHeight = 500;
  scrollX = 0;
  scrollY = 0;
  scrollTo = vi.fn((options: ScrollToOptions) => {
    this.scrollX = Number(options.left ?? this.scrollX);
    this.scrollY = Number(options.top ?? this.scrollY);
  });
}

class FakeDocument extends EventTarget {
  documentElement = { scrollHeight: 2_000 };
  visibilityState: DocumentVisibilityState = 'visible';
}

describe('practice auto-scroll lifecycle', () => {
  let browserWindow: FakeWindow;
  let browserDocument: FakeDocument;
  let pendingFrame: FrameRequestCallback | null;

  beforeEach(() => {
    browserWindow = new FakeWindow();
    browserDocument = new FakeDocument();
    pendingFrame = null;
    vi.stubGlobal('window', browserWindow);
    vi.stubGlobal('document', browserDocument);
    vi.stubGlobal('performance', { now: () => 0 });
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      pendingFrame = callback;
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => vi.unstubAllGlobals());

  it('uses elapsed time and the selected speed, then stops at the document bottom', () => {
    const states: boolean[] = [];
    const controller = createPracticeAutoScrollController((active) => states.push(active), 2);
    controller.start();
    const firstFrame = pendingFrame;
    expect(firstFrame).not.toBeNull();
    firstFrame?.(16.6);
    expect(browserWindow.scrollTo).toHaveBeenLastCalledWith({
      behavior: 'instant',
      left: 0,
      top: 2
    });

    browserWindow.scrollY = 1_500;
    const bottomFrame = pendingFrame;
    bottomFrame?.(33.2);
    expect(controller.isActive()).toBe(false);
    expect(states).toEqual([true, false]);
    controller.destroy();
  });

  it('stops on manual pointer, wheel or keyboard input and while the document is hidden', () => {
    const controller = createPracticeAutoScrollController(() => undefined);
    controller.start();
    browserWindow.dispatchEvent(new Event('wheel'));
    expect(controller.isActive()).toBe(false);

    controller.start();
    browserWindow.dispatchEvent(new Event('pointerdown'));
    expect(controller.isActive()).toBe(false);

    controller.start();
    const pageDown = new Event('keydown');
    Object.defineProperty(pageDown, 'key', { value: 'PageDown' });
    browserWindow.dispatchEvent(pageDown);
    expect(controller.isActive()).toBe(false);

    controller.start();
    browserDocument.visibilityState = 'hidden';
    browserDocument.dispatchEvent(new Event('visibilitychange'));
    expect(controller.isActive()).toBe(false);
    controller.destroy();
  });
});
