export function swipeRightDismiss(node: HTMLElement, dismiss: () => void) {
  let pointerId: number | null = null;
  let startX = 0;
  let startY = 0;
  let offset = 0;
  let dragging = false;
  let suppressClick = false;
  let width = 1;
  let frame: number | null = null;
  const paint = () => {
    frame = null;
    node.style.translate = `${offset}px 0`;
    node.style.opacity = String(Math.max(.25, 1 - offset / width));
  };

  const reset = () => {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    pointerId = null;
    offset = 0;
    dragging = false;
    node.style.removeProperty('translate');
    node.style.removeProperty('opacity');
  };
  const down = (event: PointerEvent) => {
    if (!event.isPrimary || event.button !== 0 || (event.target as Element | null)?.closest?.('input,select,textarea,a,[role="slider"]')) return;
    pointerId = event.pointerId;
    width = Math.max(1, node.getBoundingClientRect().width);
    startX = event.clientX;
    startY = event.clientY;
    offset = 0;
    suppressClick = false;
  };
  const move = (event: PointerEvent) => {
    if (pointerId !== event.pointerId) return;
    const horizontal = event.clientX - startX;
    const vertical = Math.abs(event.clientY - startY);
    if (!dragging) {
      if (vertical > 10 && vertical >= Math.abs(horizontal)) { reset(); return; }
      if (horizontal < 10 || horizontal < vertical * 1.5) return;
      dragging = true;
      suppressClick = true;
      try { node.setPointerCapture(event.pointerId); } catch {}
    }
    offset = Math.max(0, horizontal);
    if (typeof requestAnimationFrame !== 'function') paint();
    else if (frame === null) frame = requestAnimationFrame(paint);
  };
  const up = (event: PointerEvent) => {
    if (pointerId !== event.pointerId) return;
    const completed = dragging && offset >= Math.max(72, width * .22);
    reset();
    if (completed) dismiss();
  };
  const cancel = () => { reset(); suppressClick = false; };
  const click = (event: MouseEvent) => {
    if (!suppressClick) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    suppressClick = false;
  };
  node.addEventListener('pointerdown', down);
  node.addEventListener('pointermove', move);
  node.addEventListener('pointerup', up);
  node.addEventListener('pointercancel', cancel);
  node.addEventListener('click', click, true);
  return { destroy() {
    node.removeEventListener('pointerdown', down);
    node.removeEventListener('pointermove', move);
    node.removeEventListener('pointerup', up);
    node.removeEventListener('pointercancel', cancel);
    node.removeEventListener('click', click, true);
    reset();
  } };
}
