export function catalogScrollArea(element: HTMLElement): { destroy: () => void } {
  const previous = element.style.overscrollBehaviorY;
  const topProperty = '--catalog-controls-top';
  const previousTop = element.style.getPropertyValue(topProperty);
  const previousTopPriority = element.style.getPropertyPriority(topProperty);
  let frame = 0;
  const update = () => {
    frame = 0;
    // Tiêu đề/thông báo phía trước cũng chiếm chiều cao ngoài header chung.
    const top = `${Math.max(0, element.getBoundingClientRect().top)}px`;
    if (element.style.getPropertyValue(topProperty) !== top) element.style.setProperty(topProperty, top);
    // Chỉ giữ cử chỉ trong panel khi thật sự có nội dung cuộn bên trong.
    const overscroll = element.scrollHeight > element.clientHeight ? 'contain' : 'auto';
    if (element.style.overscrollBehaviorY !== overscroll) element.style.overscrollBehaviorY = overscroll;
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
  const resize = new ResizeObserver(schedule);
  const content = new MutationObserver(schedule);
  resize.observe(element);
  if (element.parentElement) resize.observe(element.parentElement);
  content.observe(element, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['hidden', 'open'],
  });
  window.addEventListener('resize', schedule, { passive: true });
  window.addEventListener('scroll', schedule, { passive: true });
  update();
  return {
    destroy() {
      resize.disconnect();
      content.disconnect();
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule);
      if (frame) cancelAnimationFrame(frame);
      element.style.overscrollBehaviorY = previous;
      if (previousTop) element.style.setProperty(topProperty, previousTop, previousTopPriority);
      else element.style.removeProperty(topProperty);
    },
  };
}
