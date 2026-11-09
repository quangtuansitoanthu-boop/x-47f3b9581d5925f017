export interface RosaryGestureResolution {
  delta: -1 | 0 | 1;
  targetOffset: number;
}

export function resolveRosaryGesture(
  direction: 'up' | 'down',
  offset: number,
  velocity: number,
  beadGap: number,
  tap: boolean
): RosaryGestureResolution {
  if (tap) {
    return { delta: 1, targetOffset: direction === 'down' ? beadGap : -beadGap };
  }
  const projected = offset + velocity * 3;
  const targetOffset = projected > beadGap / 2 ? beadGap : projected < -beadGap / 2 ? -beadGap : 0;
  if (!targetOffset) return { delta: 0, targetOffset: 0 };
  const signed = targetOffset > 0 ? 1 : -1;
  return {
    delta: (direction === 'down' ? signed : signed * -1) as -1 | 1,
    targetOffset
  };
}

export interface RosaryBeadController {
  destroy(): void;
  roll(delta?: number): void;
}

export function createRosaryBeadController(
  element: HTMLElement,
  options: {
    getDirection: () => 'up' | 'down';
    onDelta: (delta: number) => boolean | void;
    onRender: (offset: number, animated: boolean) => void;
    canStartPointer?: (event: PointerEvent) => boolean;
  }
): RosaryBeadController {
  const BEAD_GAP = 96;
  let disposed = false;
  let activePointer: number | null = null;
  let animating = false;
  let currentOffset = 0;
  let lastY = 0;
  let startY = 0;
  let velocity = 0;
  let resetTimer = 0;

  function animateResolution(resolution: RosaryGestureResolution): void {
    if (disposed) return;
    if (!resolution.targetOffset || animating) {
      options.onRender(0, true);
      return;
    }
    animating = true;
    // Chỉ diễn hoạt bước hoàn tất khi owner đã nhận lần niệm, không báo thành công cho thao tác bị từ chối.
    let accepted: boolean | void;
    try { accepted = options.onDelta(resolution.delta); }
    catch (error) {
      animating = false;
      currentOffset = 0;
      options.onRender(0, false);
      throw error;
    }
    if (accepted === false || disposed) {
      animating = false;
      currentOffset = 0;
      if (!disposed) options.onRender(0, false);
      return;
    }
    options.onRender(resolution.targetOffset, true);
    resetTimer = window.setTimeout(() => {
      currentOffset = 0;
      options.onRender(0, false);
      animating = false;
    }, 240);
  }

  function onPointerDown(event: PointerEvent): void {
    if (disposed || animating || activePointer !== null) return;
    // Chuột phụ và ngón chạm phụ không được bắt đầu một lần niệm.
    if (event.isPrimary === false || (typeof event.button === 'number' && event.button !== 0)) return;
    if (options.canStartPointer && !options.canStartPointer(event)) return;
    activePointer = event.pointerId;
    startY = event.clientY;
    lastY = event.clientY;
    currentOffset = 0;
    velocity = 0;
    try { element.setPointerCapture(event.pointerId); }
    catch {
      // Một số WebView không giữ được pointer; release trên window vẫn kết thúc cử chỉ thật.
    }
    options.onRender(0, false);
  }

  function onPointerMove(event: PointerEvent): void {
    if (event.pointerId !== activePointer || animating) return;
    velocity = event.clientY - lastY;
    lastY = event.clientY;
    currentOffset = Math.max(-BEAD_GAP * 1.5, Math.min(BEAD_GAP * 1.5, event.clientY - startY));
    options.onRender(currentOffset, false);
  }

  function onPointerEnd(event: PointerEvent): void {
    if (event.pointerId !== activePointer) return;
    // Touch có thể gộp lượt move cuối; dùng vị trí release thay vì nhầm cú vuốt thành tap.
    if (Number.isFinite(event.clientY)) {
      if (event.clientY !== lastY) velocity = event.clientY - lastY;
      currentOffset = Math.max(-BEAD_GAP * 1.5, Math.min(BEAD_GAP * 1.5, event.clientY - startY));
    }
    activePointer = null;
    animateResolution(resolveRosaryGesture(
      options.getDirection(),
      currentOffset,
      velocity,
      BEAD_GAP,
      Math.abs(currentOffset) < 5
    ));
  }

  function onPointerCancel(event: PointerEvent): void {
    if (event.pointerId !== activePointer) return;
    // Cử chỉ bị hệ điều hành hủy không phải một lần niệm đã hoàn tất.
    activePointer = null;
    currentOffset = 0;
    velocity = 0;
    options.onRender(0, false);
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (animating) return;
    if (event.target instanceof Element && event.target !== element && event.target.closest('button,input,select,textarea')) return;
    if ((event.key === 'Enter' || event.key === ' ') && event.target === element) {
      animateResolution(resolveRosaryGesture(options.getDirection(), 0, 0, BEAD_GAP, true));
      event.preventDefault();
      return;
    }
    if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
    const offset = event.key === 'ArrowDown' ? BEAD_GAP : -BEAD_GAP;
    animateResolution(resolveRosaryGesture(options.getDirection(), offset, 0, BEAD_GAP, false));
    event.preventDefault();
  }

  // Native HTML dragging cancels the pointer stream before a bead can be released.
  function onDragStart(event: DragEvent): void {
    event.preventDefault();
  }

  element.addEventListener('dragstart', onDragStart);
  element.addEventListener('pointerdown', onPointerDown);
  element.addEventListener('pointermove', onPointerMove);
  element.addEventListener('pointerup', onPointerEnd);
  element.addEventListener('pointercancel', onPointerCancel);
  element.addEventListener('lostpointercapture', onPointerCancel);
  window.addEventListener('pointerup', onPointerEnd);
  window.addEventListener('pointercancel', onPointerCancel);
  window.addEventListener('keydown', onKeyDown);
  options.onRender(0, false);

  return {
    destroy() {
      disposed = true;
      activePointer = null;
      window.clearTimeout(resetTimer);
      element.removeEventListener('dragstart', onDragStart);
      element.removeEventListener('pointerdown', onPointerDown);
      element.removeEventListener('pointermove', onPointerMove);
      element.removeEventListener('pointerup', onPointerEnd);
      element.removeEventListener('pointercancel', onPointerCancel);
      element.removeEventListener('lostpointercapture', onPointerCancel);
      window.removeEventListener('pointerup', onPointerEnd);
      window.removeEventListener('pointercancel', onPointerCancel);
      window.removeEventListener('keydown', onKeyDown);
    },
    roll(delta: number = 1) {
      if (animating) return;
      const dir = options.getDirection();
      const signedDelta = delta >= 0 ? 1 : -1;
      const targetOffset = (dir === 'down' ? signedDelta : -signedDelta) * BEAD_GAP;
      animateResolution({
        delta: signedDelta as -1 | 1,
        targetOffset,
      });
    },
  };
}
