import { describe, expect, it, vi } from 'vitest';
import { installPdfGestures } from '$lib/browser/pdf-gesture-controller';

type Listener = (event: never) => void;

class FakeElement {
  listeners = new Map<string, Listener>();
  style: Record<string, string> = {};

  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    this.listeners.set(type, listener as Listener);
  }

  removeEventListener(type: string): void {
    this.listeners.delete(type);
  }

  getBoundingClientRect(): DOMRect {
    return { left: 20, top: 30 } as DOMRect;
  }

  emit(type: string, event: Record<string, unknown>): void {
    this.listeners.get(type)?.(event as never);
  }
}

function touch(x: number, y: number): Touch {
  return { clientX: x, clientY: y } as Touch;
}

describe('PDF gesture controller', () => {
  it('zooms at the pointer only for Ctrl/Meta wheel gestures', () => {
    const viewer = new FakeElement();
    const target = new FakeElement();
    const setZoomAt = vi.fn();
    const cleanup = installPdfGestures(viewer as unknown as HTMLElement, {
      getTransformTarget: () => target as unknown as HTMLElement,
      getZoom: () => 1,
      setZoomAt,
    });

    const ordinaryPrevent = vi.fn();
    viewer.emit('wheel', { ctrlKey: false, metaKey: false, deltaY: -1, clientX: 10, clientY: 12, preventDefault: ordinaryPrevent });
    expect(setZoomAt).not.toHaveBeenCalled();
    expect(ordinaryPrevent).not.toHaveBeenCalled();

    const zoomPrevent = vi.fn();
    viewer.emit('wheel', { ctrlKey: true, metaKey: false, deltaY: -1, clientX: 42, clientY: 64, preventDefault: zoomPrevent });
    expect(zoomPrevent).toHaveBeenCalledOnce();
    expect(setZoomAt).toHaveBeenCalledWith(1.15, 42, 64);

    cleanup();
    expect(viewer.listeners.size).toBe(0);
  });

  it('previews a two-finger pinch and commits its bounded zoom on release', () => {
    const viewer = new FakeElement();
    const target = new FakeElement();
    const preview = vi.fn();
    const setZoomAt = vi.fn();
    installPdfGestures(viewer as unknown as HTMLElement, {
      getTransformTarget: () => target as unknown as HTMLElement,
      getZoom: () => 1,
      onPreviewZoom: preview,
      setZoomAt,
    });

    viewer.emit('touchstart', { touches: [touch(40, 50), touch(140, 50)], preventDefault: vi.fn() });
    viewer.emit('touchmove', { touches: [touch(20, 50), touch(220, 50)], preventDefault: vi.fn() });

    expect(preview).toHaveBeenLastCalledWith(2);
    expect(target.style.transform).toBe('scale(2)');
    expect(target.style.transformOrigin).toBe('70px 20px');

    viewer.emit('touchend', { touches: [] });
    expect(setZoomAt).toHaveBeenCalledWith(2, 90, 50);
    expect(target.style.transform).toBe('');
    expect(target.style.willChange).toBe('');
  });
});
