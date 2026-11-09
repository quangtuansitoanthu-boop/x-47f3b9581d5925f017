import type { PracticeFabPosition } from './practice-storage';

export interface PracticeFabController {
  apply(position: PracticeFabPosition): PracticeFabPosition;
  destroy(): void;
}

export function clampPracticeFabPosition(
  position: PracticeFabPosition,
  viewport: { width: number; height: number },
  size: { width: number; height: number },
  inset = 8
): PracticeFabPosition {
  return {
    x: Math.max(inset, Math.min(viewport.width - size.width - inset, position.x)),
    y: Math.max(inset, Math.min(viewport.height - size.height - inset, position.y))
  };
}

export function snapPracticeFabPosition(
  position: PracticeFabPosition,
  viewportWidth: number,
  width: number,
  inset = 8
): PracticeFabPosition {
  return {
    x: position.x + width / 2 < viewportWidth / 2 ? inset : viewportWidth - width - inset,
    y: position.y
  };
}

export function createPracticeFabController(
  element: HTMLElement,
  onSave: (position: PracticeFabPosition) => void,
  initialPosition: PracticeFabPosition | null
): PracticeFabController {
  let dragTimer = 0;
  let dragging = false;
  let pointerActive = false;
  let suppressClick = false;
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;

  function apply(position: PracticeFabPosition): PracticeFabPosition {
    const rect = element.getBoundingClientRect();
    const next = clampPracticeFabPosition(position, {
      width: window.innerWidth,
      height: window.innerHeight
    }, {
      width: rect.width || 60,
      height: rect.height || 200
    });
    element.style.left = `${next.x}px`;
    element.style.top = `${next.y}px`;
    element.style.right = 'auto';
    element.style.bottom = 'auto';
    element.style.transform = 'none';
    return next;
  }

  function onPointerDown(event: PointerEvent): void {
    if ((event.target as HTMLElement).closest('.tt-practice__panel')) return;
    const rect = element.getBoundingClientRect();
    pointerActive = true;
    dragging = false;
    suppressClick = false;
    startX = event.clientX;
    startY = event.clientY;
    startLeft = rect.left;
    startTop = rect.top;
    element.setPointerCapture(event.pointerId);
    dragTimer = window.setTimeout(() => {
      if (!pointerActive) return;
      dragging = true;
      element.classList.add('dragging');
    }, 150);
  }

  function onPointerMove(event: PointerEvent): void {
    if (!pointerActive) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (!dragging && Math.abs(dx) + Math.abs(dy) > 8) {
      window.clearTimeout(dragTimer);
      dragging = true;
      element.classList.add('dragging');
    }
    if (!dragging) return;
    suppressClick = true;
    apply({ x: startLeft + dx, y: startTop + dy });
  }

  function finishDrag(): void {
    pointerActive = false;
    window.clearTimeout(dragTimer);
    if (!dragging) return;
    dragging = false;
    element.classList.remove('dragging');
    const rect = element.getBoundingClientRect();
    const snapped = snapPracticeFabPosition({ x: rect.left, y: rect.top }, window.innerWidth, rect.width);
    element.style.transition = 'left .25s cubic-bezier(.4,0,.2,1),top .25s';
    const saved = apply(snapped);
    onSave(saved);
    window.setTimeout(() => {
      element.style.transition = '';
    }, 280);
  }

  function onClick(event: MouseEvent): void {
    if (!suppressClick) return;
    event.preventDefault();
    event.stopPropagation();
    suppressClick = false;
  }

  function onResize(): void {
    const rect = element.getBoundingClientRect();
    onSave(apply({ x: rect.left, y: rect.top }));
  }

  element.addEventListener('pointerdown', onPointerDown);
  element.addEventListener('pointermove', onPointerMove);
  element.addEventListener('pointerup', finishDrag);
  element.addEventListener('pointercancel', finishDrag);
  element.addEventListener('click', onClick, true);
  window.addEventListener('resize', onResize);
  if (initialPosition) requestAnimationFrame(() => onSave(apply(initialPosition)));

  return {
    apply,
    destroy() {
      window.clearTimeout(dragTimer);
      element.removeEventListener('pointerdown', onPointerDown);
      element.removeEventListener('pointermove', onPointerMove);
      element.removeEventListener('pointerup', finishDrag);
      element.removeEventListener('pointercancel', finishDrag);
      element.removeEventListener('click', onClick, true);
      window.removeEventListener('resize', onResize);
    }
  };
}
