interface PdfGestureOptions {
  getTransformTarget: () => HTMLElement | null;
  getZoom: () => number;
  onPreviewZoom?: (zoom: number) => void;
  setZoomAt: (zoom: number, clientX: number, clientY: number) => void;
}

function distance(left: Touch, right: Touch): number {
  return Math.hypot(right.clientX - left.clientX, right.clientY - left.clientY);
}

function clampZoom(value: number): number {
  return Math.min(4, Math.max(0.5, value));
}

export function installPdfGestures(viewer: HTMLElement, options: PdfGestureOptions): () => void {
  let active = false;
  let startDistance = 0;
  let startZoom = 1;
  let previewZoom = 1;
  let centerX = 0;
  let centerY = 0;

  const clearPreview = () => {
    const target = options.getTransformTarget();
    if (!target) return;
    target.style.transform = '';
    target.style.transformOrigin = '';
    target.style.willChange = '';
  };

  const finishPinch = (touchCount: number) => {
    if (!active || touchCount >= 2) return;
    active = false;
    startDistance = 0;
    clearPreview();
    if (Math.abs(previewZoom - options.getZoom()) > 0.01) {
      options.setZoomAt(previewZoom, centerX, centerY);
    }
  };

  const onWheel = (event: WheelEvent) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    const delta = event.deltaY < 0 ? 0.15 : -0.15;
    options.setZoomAt(clampZoom(options.getZoom() + delta), event.clientX, event.clientY);
  };

  const onTouchStart = (event: TouchEvent) => {
    if (event.touches.length !== 2) {
      active = false;
      return;
    }
    event.preventDefault();
    const [first, second] = [event.touches[0], event.touches[1]];
    startDistance = distance(first, second);
    startZoom = options.getZoom();
    previewZoom = startZoom;
    centerX = (first.clientX + second.clientX) / 2;
    centerY = (first.clientY + second.clientY) / 2;
    active = startDistance > 0;
  };

  const onTouchMove = (event: TouchEvent) => {
    if (!active || event.touches.length !== 2 || startDistance <= 0) return;
    event.preventDefault();
    const [first, second] = [event.touches[0], event.touches[1]];
    previewZoom = clampZoom(startZoom * (distance(first, second) / startDistance));
    const target = options.getTransformTarget();
    if (target) {
      const rect = target.getBoundingClientRect();
      target.style.transformOrigin = `${centerX - rect.left}px ${centerY - rect.top}px`;
      target.style.transform = `scale(${previewZoom / options.getZoom()})`;
      target.style.willChange = 'transform';
    }
    options.onPreviewZoom?.(previewZoom);
  };

  const onTouchEnd = (event: TouchEvent) => finishPinch(event.touches.length);
  const onTouchCancel = () => finishPinch(0);

  viewer.addEventListener('wheel', onWheel, { passive: false });
  viewer.addEventListener('touchstart', onTouchStart, { passive: false });
  viewer.addEventListener('touchmove', onTouchMove, { passive: false });
  viewer.addEventListener('touchend', onTouchEnd, { passive: true });
  viewer.addEventListener('touchcancel', onTouchCancel, { passive: true });

  return () => {
    clearPreview();
    viewer.removeEventListener('wheel', onWheel);
    viewer.removeEventListener('touchstart', onTouchStart);
    viewer.removeEventListener('touchmove', onTouchMove);
    viewer.removeEventListener('touchend', onTouchEnd);
    viewer.removeEventListener('touchcancel', onTouchCancel);
  };
}
